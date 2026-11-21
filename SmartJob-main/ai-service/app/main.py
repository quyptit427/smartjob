from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.auth import candidate_id, require_service
from app.clients import fetch_open_jobs, fetch_resume
from app.schemas.chat import (
    ChatEnvelope,
    ChatRequest,
    ChatResponse,
    CvProfile,
    ExtractProfileEnvelope,
    ExtractedProfile,
    JobCard,
    JobRecommendation,
)
import asyncio

from app.services.llm_service import (
    analyze_and_advise,
    extract_cv_text,
    extract_profile_from_cv,
    heuristic_profile,
)
from app.services.chat_store import append_turn, recent_turns
from app.services.openai_client import AiProviderError
from app.services.rag_service import profile_from_cv_model, rescore_matches, retrieve_jobs
from app.services.vectorize_service import delete_job, upsert_jobs

app = FastAPI(title="SmartJob AI Service", version="1.0.0")


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, error: HTTPException):
    codes = {
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        429: "LLM_RATE_LIMITED",
        502: "LLM_REQUEST_FAILED",
        503: "SERVICE_UNAVAILABLE",
    }
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": {
                "code": codes.get(error.status_code, "AI_REQUEST_FAILED"),
                "message": error.detail,
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, error: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Dữ liệu yêu cầu không hợp lệ.",
                "details": [
                    {
                        "field": ".".join(str(part) for part in issue["loc"]),
                        "message": issue["msg"],
                    }
                    for issue in error.errors()
                ],
            }
        },
    )


@app.get("/health")
async def health():
    return {"service": "ai-service", "status": "ok"}


@app.post("/internal/vectors/jobs")
async def index_job(request: Request):
    require_service(request)
    job = await request.json()
    try:
        count = await upsert_jobs([job])
    except Exception as error:
        raise HTTPException(status_code=503, detail="Chưa ghi được vector của tin tuyển dụng.") from error
    return {"data": {"indexed": count}}


@app.delete("/internal/vectors/jobs/{job_id}")
async def remove_job_vector(job_id: str, request: Request):
    require_service(request)
    try:
        await delete_job(job_id)
    except Exception as error:
        raise HTTPException(status_code=503, detail="Chưa xóa được vector của tin tuyển dụng.") from error
    return {"data": {"deleted": job_id}}


@app.post("/internal/vectors/reindex")
async def reindex_jobs(request: Request):
    require_service(request)
    try:
        jobs = await fetch_open_jobs()
        count = await upsert_jobs(jobs)
    except Exception as error:
        raise HTTPException(status_code=503, detail="Chưa lập lại chỉ mục vector.") from error
    return {"data": {"indexed": count}}


@app.post("/api/ai/extract-profile", response_model=ExtractProfileEnvelope)
async def extract_profile(request: Request):
    """Parse the candidate CV and return fields suitable for profile autofill."""
    user_id = candidate_id(request)
    try:
        pdf_bytes = await fetch_resume(user_id)
        cv_text = extract_cv_text(pdf_bytes)
        profile = await extract_profile_from_cv(cv_text)
        return ExtractProfileEnvelope(data=ExtractedProfile.model_validate(profile))
    except AiProviderError as error:
        if error.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="API AI đang chạm giới hạn yêu cầu. Vui lòng thử lại sau.",
            ) from error
        raise HTTPException(
            status_code=error.status_code,
            detail=str(error) or "API AI chưa xử lý được yêu cầu. Vui lòng thử lại sau.",
        ) from error
    except Exception as error:
        name = type(error).__name__
        if name in {"PdfReadError", "PdfStreamError", "EmptyFileError"} or "pdf" in name.casefold():
            raise HTTPException(
                status_code=400,
                detail="Không đọc được CV PDF. Hãy tải lại file PDF hợp lệ trong Hồ sơ.",
            ) from error
        if isinstance(error, (ValueError, KeyError)):
            raise HTTPException(
                status_code=502,
                detail="AI chưa thể phân tích CV. Vui lòng thử lại.",
            ) from error
        raise


@app.post("/api/ai/chat", response_model=ChatEnvelope)
async def chat(body: ChatRequest, request: Request):
    user_id = candidate_id(request)
    try:
        # Parallel I/O; one compact LLM call afterward.
        pdf_bytes, jobs, history = await asyncio.gather(
            fetch_resume(user_id),
            fetch_open_jobs(),
            asyncio.to_thread(recent_turns, user_id),
        )
        cv_text = extract_cv_text(pdf_bytes)
        draft_profile = heuristic_profile(cv_text)
        matches = await retrieve_jobs(draft_profile, body.message, jobs)
        advice = await analyze_and_advise(cv_text, body.message, matches, history)
        profile = CvProfile.model_validate(advice["profile"])
        merged_profile = profile_from_cv_model(profile, fallback=draft_profile)
        # Final priority uses LLM + heuristic profile and same 40/25/20/15 formula as recommendation-service.
        matches = rescore_matches(merged_profile, matches, all_jobs=jobs)
    except AiProviderError as error:
        if error.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="API AI đang chạm giới hạn yêu cầu. Vui lòng thử lại sau.",
            ) from error
        raise HTTPException(
            status_code=error.status_code,
            detail=str(error) or "API AI chưa xử lý được yêu cầu. Vui lòng thử lại sau.",
        ) from error
    except Exception as error:
        # pypdf raises PdfReadError/PdfStreamError for truncated or non-PDF bytes.
        name = type(error).__name__
        if name in {"PdfReadError", "PdfStreamError", "EmptyFileError"} or "pdf" in name.casefold():
            raise HTTPException(
                status_code=400,
                detail="Không đọc được CV PDF. Hãy tải lại file PDF hợp lệ trong Hồ sơ.",
            ) from error
        if isinstance(error, (ValueError, KeyError)):
            raise HTTPException(
                status_code=502,
                detail="AI chưa thể phân tích phản hồi. Vui lòng thử lại.",
            ) from error
        raise

    jobs_by_id = {str(job.get("_id")): job for job in jobs}
    matches_by_id = {str(item["job"].get("_id")): item for item in matches}
    reasons_by_id = {
        item.get("job_id"): item
        for item in advice.get("recommendations", [])
        if item.get("job_id") in matches_by_id
    }
    recommendations = []
    cv_skills = {skill.casefold() for skill in merged_profile.get("skills", [])}
    for job_id, match in matches_by_id.items():
        reason = reasons_by_id.get(job_id, {})
        matched_skills = match.get("matched_skills", [])
        known_skills = cv_skills | {s.casefold() for s in matched_skills}
        if not reason:
            score = match.get("score", 0)
            breakdown = match.get("breakdown") or {}
            if match["priority"] == "high":
                fallback_reason = (
                    f"Ưu tiên cao (điểm {score}/100): kỹ năng {breakdown.get('skills', 0)}, "
                    f"vị trí {breakdown.get('position', 0)}, kinh nghiệm {breakdown.get('experience', 0)}, "
                    f"địa điểm {breakdown.get('location', 0)}. "
                    f"Kỹ năng khớp: {', '.join(matched_skills) or 'chưa rõ'}."
                )
            else:
                fallback_reason = (
                    f"Ưu tiên thấp (điểm {score}/100): chưa đủ khớp theo trọng số "
                    "kỹ năng 40 / vị trí 25 / kinh nghiệm 20 / địa điểm 15."
                )
            gaps = [
                skill
                for skill in match["job"].get("requiredSkills", [])
                if skill.casefold() not in known_skills
            ]
            reason = {"reason": fallback_reason, "skill_gaps": gaps}
        filtered_gaps = [
            skill
            for skill in reason.get("skill_gaps", [])
            if skill.casefold() not in known_skills
        ]
        recommendations.append(
            JobRecommendation(
                job=JobCard.model_validate(jobs_by_id[job_id]),
                priority=match["priority"],
                similarity=round(match["similarity"], 4),
                reason=reason.get("reason", "Nội dung công việc liên quan đến hồ sơ của bạn."),
                skill_gaps=filtered_gaps,
            )
        )

    answer = advice.get("answer", "Đây là các công việc có nội dung gần với hồ sơ của bạn.")
    await asyncio.to_thread(append_turn, user_id, body.message, answer)
    return ChatEnvelope(
        data=ChatResponse(
            answer=answer,
            profile=profile,
            recommendations=recommendations,
        )
    )
