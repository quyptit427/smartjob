import asyncio
import json
import re
from io import BytesIO

from pypdf import PdfReader

from app.prompts.job_advisor import advice_bundle_instructions
from app.prompts.profile_extract import extract_profile_instructions
from app.schemas.chat import AdvisorBundle, ExtractedProfile
from app.services.openai_client import generate_json

COMPACT_SCHEMA = {
    "profile": "object",
    "answer": "string",
    "recommendations": "array",
}

EXTRACT_SCHEMA = {
    "name": "string|null",
    "phone": "string|null",
    "location": "string|null",
    "experience_years": "number|null",
    "desired_position": "string|null",
    "skills": "array",
    "bio": "string|null",
    "education": "array",
    "work_experience": "array",
    "certifications": "array",
    "languages": "array",
    "links": "object",
}


def extract_cv_text(pdf_bytes: bytes) -> str:
    raw = bytes(pdf_bytes)
    marker = raw.find(b"%PDF-", 0, 1024)
    if marker > 0:
        raw = raw[marker:]
    reader = PdfReader(BytesIO(raw))
    cv_text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if not cv_text:
        raise ValueError("Could not extract text from CV PDF")
    return cv_text


def heuristic_profile(cv_text: str) -> dict:
    """Fast local profile so job retrieval can run before the single LLM call."""
    lowered = cv_text.casefold()
    skill_vocab = [
        "react",
        "javascript",
        "typescript",
        "node.js",
        "nodejs",
        "mongodb",
        "express",
        "python",
        "java",
        "sql",
        "docker",
        "git",
        "html",
        "css",
        "vue",
        "angular",
        "aws",
        "rest api",
        "fastapi",
        "spring",
    ]
    skills = []
    for skill in skill_vocab:
        compact_skill = skill.replace(".", "").replace(" ", "")
        compact_text = lowered.replace(".", "").replace(" ", "")
        if skill in lowered or compact_skill in compact_text:
            skills.append("node.js" if skill == "nodejs" else skill)

    role_patterns = [
        r"frontend developer",
        r"backend developer",
        r"fullstack developer",
        r"full[\s-]?stack developer",
        r"software engineer",
        r"data engineer",
        r"data analyst",
        r"mobile developer",
        r"devops engineer",
        r"lap trinh vien frontend",
        r"l[aậ]p tr[iì]nh vi[eê]n frontend",
        r"th[uư]c t[aậ]p sinh frontend",
        r"frontend",
        r"backend",
    ]
    roles = []
    for pattern in role_patterns:
        match = re.search(pattern, lowered, re.IGNORECASE)
        if match:
            raw = re.sub(r"\s+", " ", match.group(0)).strip()
            if "frontend" in raw.casefold():
                roles.append("frontend developer")
            elif "backend" in raw.casefold():
                roles.append("backend developer")
            else:
                roles.append(raw)
    # Deduplicate while preserving order.
    roles = list(dict.fromkeys(roles))
    if not roles and any(s in skills for s in ("react", "vue", "angular", "javascript", "typescript")):
        roles.append("frontend developer")
    if not roles and any(s in skills for s in ("node.js", "java", "python", "spring", "fastapi")):
        roles.append("backend developer")

    years = None
    year_match = re.search(
        r"(\d+(?:[.,]\d+)?)\s*(?:\+?\s*)?(?:n[aă]m|years?|yrs?)\b",
        lowered,
    )
    if year_match:
        try:
            years = float(year_match.group(1).replace(",", "."))
        except ValueError:
            years = None

    location = None
    for place in ("hue", "huế", "ha noi", "hà nội", "da nang", "đà nẵng", "ho chi minh", "hồ chí minh", "remote"):
        if place in lowered:
            location = place
            break

    return {
        "summary": " ".join(cv_text.split())[:280],
        "skills": skills[:20],
        "experience_roles": roles[:5],
        "target_roles": roles[:5],
        "desiredPosition": " ".join(roles[:5]),
        "experience_years": years,
        "location": location,
    }


def _merge_extract(heuristic: dict, extracted: dict) -> dict:
    """Prefer LLM values; fall back to local heuristic for blanks."""
    merged = dict(extracted)
    if not merged.get("skills"):
        merged["skills"] = heuristic.get("skills") or []
    if merged.get("desired_position") in (None, ""):
        roles = heuristic.get("target_roles") or heuristic.get("experience_roles") or []
        merged["desired_position"] = roles[0] if roles else heuristic.get("desiredPosition")
    if merged.get("experience_years") is None:
        merged["experience_years"] = heuristic.get("experience_years")
    if merged.get("location") in (None, ""):
        merged["location"] = heuristic.get("location")
    if merged.get("bio") in (None, ""):
        merged["bio"] = heuristic.get("summary")
    return merged


async def extract_profile_from_cv(cv_text: str) -> dict:
    heuristic = heuristic_profile(cv_text)
    response_text = await asyncio.to_thread(
        generate_json,
        extract_profile_instructions(),
        f"CV text:\n{cv_text[:8000]}",
        1100,
        EXTRACT_SCHEMA,
    )
    extracted = ExtractedProfile.model_validate_json(response_text).model_dump()
    return _merge_extract(heuristic, extracted)


async def analyze_and_advise(
    cv_text: str,
    question: str,
    retrieved_jobs: list[dict],
) -> dict:
    # Keep payload small — main latency driver on the remote model.
    context = {
        "cv_text": cv_text[:6000],
        "question": question[:400],
        "available_jobs": [
            {
                "job_id": item["job"].get("_id"),
                "title": item["job"].get("title"),
                "company": item["job"].get("companyName"),
                "location": item["job"].get("location"),
                "required_skills": item["job"].get("requiredSkills", [])[:8],
                "experience_min": item["job"].get("experienceMin"),
                "priority": item["priority"],
                "matched_cv_skills": item.get("matched_skills", [])[:6],
            }
            for item in retrieved_jobs[:8]
        ],
    }
    response_text = await asyncio.to_thread(
        generate_json,
        advice_bundle_instructions(),
        f"Dữ liệu:\n{json.dumps(context, ensure_ascii=False)}",
        900,
        COMPACT_SCHEMA,
    )
    return AdvisorBundle.model_validate_json(response_text).model_dump()
