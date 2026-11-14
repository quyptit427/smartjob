from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.auth import candidate_id
from app.clients import fetch_open_jobs, fetch_resume
from app.schemas.chat import ChatEnvelope, ChatRequest, ChatResponse, CvProfile, JobCard, JobRecommendation
from app.services.llm_service import advise, analyze_cv
from app.services.qwen_client import LocalModelError
from app.services.rag_service import retrieve_jobs

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


@app.post("/api/ai/chat", response_model=ChatEnvelope)
async def chat(body: ChatRequest, request: Request):
    user_id = candidate_id(request)
    try:
        pdf_bytes = await fetch_resume(user_id)
        jobs = await fetch_open_jobs()
        profile_data = await analyze_cv(pdf_bytes)
        profile = CvProfile.model_validate(profile_data)
        matches = await retrieve_jobs(profile.model_dump(), body.message, jobs)
        advice = await advise(profile.model_dump(), body.message, matches)
    except LocalModelError as error:
        if error.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="API AI đang chạm giới hạn yêu cầu. Vui lòng thử lại sau.",
            ) from error
        raise HTTPException(
            status_code=error.status_code,
            detail="API AI chưa xử lý được yêu cầu. Vui lòng thử lại sau.",
        ) from error
    except (ValueError, KeyError) as error:
        raise HTTPException(
            status_code=502,
            detail="AI chưa thể phân tích phản hồi. Vui lòng thử lại.",
        ) from error

    jobs_by_id = {str(job.get("_id")): job for job in jobs}
    matches_by_id = {str(item["job"].get("_id")): item for item in matches}
    reasons_by_id = {
        item.get("job_id"): item
        for item in advice.get("recommendations", [])
        if item.get("job_id") in matches_by_id
    }
    recommendations = []
    cv_skills = {skill.casefold() for skill in profile.skills}
    for job_id, match in matches_by_id.items():
        reason = reasons_by_id.get(job_id, {})
        matched_skills = match.get("matched_skills", [])
        if not reason:
            if match["priority"] == "high":
                fallback_reason = (
                    "?u ti?n cao: ch?c danh kh?p tr?c ti?p v?i kinh nghi?m ho?c m?c ti?u trong CV; "
                    f"k? n?ng ph? h?p g?m {', '.join(matched_skills) or 'k? n?ng ngh? nghi?p li?n quan'}."
                )
            else:
                fallback_reason = (
                    "?u ti?n th?p: c?ng vi?c c? m?t s? k? n?ng ho?c n?i dung li?n quan ??n CV, "
                    "nh?ng ch?c danh kh?ng kh?p tr?c ti?p."
                )
            gaps = [
                skill
                for skill in match["job"].get("requiredSkills", [])
                if skill.casefold() not in cv_skills
            ]
            reason = {"reason": fallback_reason, "skill_gaps": gaps}
        recommendations.append(
            JobRecommendation(
                job=JobCard.model_validate(jobs_by_id[job_id]),
                priority=match["priority"],
                similarity=round(match["similarity"], 4),
                reason=reason.get("reason", "N?i dung c?ng vi?c li?n quan ??n h? s? c?a b?n."),
                skill_gaps=reason.get("skill_gaps", []),
            )
        )

    return ChatEnvelope(
        data=ChatResponse(
            answer=advice.get("answer", "Đây là các công việc có nội dung gần với hồ sơ của bạn."),
            profile=profile,
            recommendations=recommendations,
        )
    )
