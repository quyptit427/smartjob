import asyncio
import json
from io import BytesIO

from pypdf import PdfReader

from app.prompts.job_advisor import CV_ANALYSIS_INSTRUCTIONS, advice_instructions
from app.schemas.chat import AdviceResult, CvProfile
from app.services.qwen_client import generate_json


async def analyze_cv(pdf_bytes: bytes) -> dict:
    reader = PdfReader(BytesIO(pdf_bytes))
    cv_text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if not cv_text:
        raise ValueError("Could not extract text from CV PDF")
    response_text = await asyncio.to_thread(
        generate_json,
        CV_ANALYSIS_INSTRUCTIONS,
        f"Trích xuất thông tin nghề nghiệp từ CV sau:\n\n{cv_text[:24000]}",
        1200,
        CvProfile.model_json_schema(),
    )
    return CvProfile.model_validate_json(response_text).model_dump()


async def advise(profile: dict, question: str, retrieved_jobs: list[dict]) -> dict:
    context = {
        "candidate_profile": profile,
        "question": question,
        "available_jobs": [
            {
                "job_id": item["job"].get("_id"),
                "title": item["job"].get("title"),
                "company": item["job"].get("companyName"),
                "location": item["job"].get("location"),
                "required_skills": item["job"].get("requiredSkills", []),
                "experience_min": item["job"].get("experienceMin"),
                "description": item["job"].get("description", "")[:1200],
                "semantic_similarity": round(item["similarity"], 4),
                "priority": item["priority"],
                "matched_cv_skills": item["matched_skills"],
            }
            for item in retrieved_jobs
        ],
    }
    response_text = await asyncio.to_thread(
        generate_json,
        advice_instructions(),
        f"Dữ liệu hồ sơ, câu hỏi và việc làm (JSON):\n{json.dumps(context, ensure_ascii=False)}",
        1600,
        AdviceResult.model_json_schema(),
    )
    return AdviceResult.model_validate_json(response_text).model_dump()
