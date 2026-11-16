import math
import re
import unicodedata
from collections.abc import Sequence

from app.services.embedding_service import embed_job_texts, embed_query

# Align with recommendation-service scoring.js (docs/04-recommendation.md):
# MatchScore = round(40×S + 25×P + 20×E + 15×L)
HIGH_SCORE_THRESHOLD = 55

_LEVEL_WORDS = {
    "fresher",
    "intern",
    "internship",
    "junior",
    "remote",
    "entry",
    "level",
    "associate",
    "senior",
    "lead",
    "trainee",
    "graduate",
    "thuc",
    "tap",
    "sinh",
}
_ROLE_ALIASES = {
    "backend engineer": "backend developer",
    "frontend engineer": "frontend developer",
    "front end developer": "frontend developer",
    "front end engineer": "frontend developer",
    "fullstack developer": "full stack developer",
    "fullstack engineer": "full stack developer",
    "full stack engineer": "full stack developer",
    "bi analyst": "business intelligence analyst",
    "ml engineer": "machine learning engineer",
    "data engineering": "data engineer",
    "lap trinh vien frontend": "frontend developer",
    "lap trinh frontend": "frontend developer",
    "thuc tap sinh frontend": "frontend developer",
    "thuc tap sinh front end": "frontend developer",
    "lap trinh vien backend": "backend developer",
}
_SKILL_ALIASES = {
    "reactjs": "react",
    "react.js": "react",
    "nodejs": "node.js",
    "node": "node.js",
    "typescript": "typescript",
    "js": "javascript",
    "ts": "typescript",
    "postgres": "postgresql",
    "mongo": "mongodb",
    "golang": "go",
}


def normalize(value: str) -> str:
    """Mirror recommendation-service normalize() for comparable matching."""
    if not isinstance(value, str):
        return ""
    value = unicodedata.normalize("NFD", value)
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    value = value.replace("đ", "d").replace("Đ", "d")
    return re.sub(r"\s+", " ", value.casefold()).strip()


def _tokens(value: str) -> set[str]:
    return {token for token in re.split(r"[^a-z0-9+#.]+", normalize(value)) if token}


def _normalize_skill(value: str) -> str:
    skill = normalize(value)
    return _SKILL_ALIASES.get(skill, skill)


def _normalized_skills(values: list[str]) -> set[str]:
    return {_normalize_skill(value) for value in values if _normalize_skill(value)}


def _normalize_role(value: str) -> str:
    words = [word for word in _tokens(value) if word not in _LEVEL_WORDS]
    role = " ".join(words)
    return _ROLE_ALIASES.get(role, role)


def _desired_position_text(profile: dict) -> str:
    parts = [
        *(profile.get("target_roles") or []),
        *(profile.get("experience_roles") or []),
        profile.get("desiredPosition") or "",
        profile.get("summary") or "",
    ]
    return " ".join(str(part) for part in parts if part)


def _direct_role_match(job_title: str, profile: dict) -> bool:
    desired = _tokens(_desired_position_text(profile)) - _LEVEL_WORDS
    title = _tokens(job_title) - _LEVEL_WORDS
    if not desired or not title:
        # Fall back to normalized role phrase containment.
        cv_roles = (profile.get("experience_roles") or []) + (profile.get("target_roles") or [])
        job_role = _normalize_role(job_title)
        return any(
            role and (job_role == role or job_role in role or role in job_role)
            for role in (_normalize_role(item) for item in cv_roles)
        )
    # Position match like recommendation-service: shared meaningful tokens.
    overlap = desired & title
    return len(overlap) / len(desired) >= 0.5


def job_document(job: dict) -> str:
    skills = ", ".join(job.get("requiredSkills", []))
    return "\n".join(
        [
            f"Role: {job.get('title', '')}",
            f"Company: {job.get('companyName', '')}",
            f"Location: {job.get('location', '')}",
            f"Required skills: {skills}",
            f"Minimum experience: {job.get('experienceMin', 0)} years",
            f"Work type: {job.get('jobType', '')}",
            f"Description: {job.get('description', '')[:900]}",
        ]
    )


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def score_job(profile: dict, job: dict) -> dict:
    """Same weighted formula as recommendation-service scoring.js."""
    owned = _normalized_skills(profile.get("skills") or [])
    required = sorted(_normalized_skills(job.get("requiredSkills") or []))
    matched = [skill for skill in required if skill in owned]
    skills = (len(matched) / len(required)) if required else 0.0

    desired = _tokens(_desired_position_text(profile)) - _LEVEL_WORDS
    title = _tokens(job.get("title") or "") - _LEVEL_WORDS
    position = (
        len([word for word in desired if word in title]) / len(desired) if desired else 0.0
    )

    experience_years = profile.get("experience_years")
    experience_min = job.get("experienceMin")
    if isinstance(experience_years, (int, float)) and isinstance(experience_min, (int, float)):
        if experience_years < 0 or experience_min < 0:
            experience = 0.0
        elif experience_min == 0:
            experience = 1.0
        else:
            experience = min(float(experience_years) / float(experience_min), 1.0)
    else:
        experience = 0.0

    user_location = normalize(profile.get("location") or "")
    job_location = normalize(job.get("location") or "")
    location = 1.0 if user_location and job_location and user_location == job_location else 0.0

    score = max(
        0,
        min(
            100,
            round(skills * 40 + position * 25 + experience * 20 + location * 15),
        ),
    )
    role_match = _direct_role_match(job.get("title") or "", profile)
    coverage = skills
    # High = đủ điểm theo công thức chuẩn, hoặc khớp chức danh + kỹ năng rõ.
    high = score >= HIGH_SCORE_THRESHOLD or (role_match and coverage >= 0.5)
    return {
        "job": job,
        "score": score,
        "similarity": score / 100,
        "matched_skills": matched,
        "priority": "high" if high else "related",
        "role_match": role_match,
        "skill_coverage": coverage,
        "breakdown": {
            "skills": round(skills * 40),
            "position": round(position * 25),
            "experience": round(experience * 20),
            "location": round(location * 15),
        },
    }


def assign_priorities(
    profile: dict,
    jobs: list[dict],
    high_limit: int = 5,
    related_limit: int = 5,
) -> list[dict]:
    scored = [score_job(profile, job) for job in jobs]
    high_priority = [item for item in scored if item["priority"] == "high"]
    related = [item for item in scored if item["priority"] == "related"]
    high_priority.sort(
        key=lambda item: (
            -item["score"],
            -item["skill_coverage"],
            str(item["job"].get("_id", "")),
        )
    )
    related.sort(key=lambda item: (-item["score"], str(item["job"].get("_id", ""))))
    return [*high_priority[:high_limit], *related[:related_limit]]


def profile_from_cv_model(profile) -> dict:
    """Map LLM/CvProfile fields onto the scorer shape."""
    if isinstance(profile, dict):
        data = profile
    else:
        data = profile.model_dump() if hasattr(profile, "model_dump") else dict(profile)
    return {
        "summary": data.get("summary") or "",
        "skills": list(data.get("skills") or []),
        "experience_roles": list(data.get("experience_roles") or []),
        "target_roles": list(data.get("target_roles") or []),
        "desiredPosition": " ".join(
            str(part)
            for part in [
                *(data.get("target_roles") or []),
                *(data.get("experience_roles") or []),
            ]
            if part
        ),
        "experience_years": data.get("experience_years"),
        "location": data.get("location"),
    }


async def retrieve_jobs(
    profile: dict,
    question: str,
    jobs: list[dict],
    high_limit: int = 5,
    related_limit: int = 5,
) -> list[dict]:
    if not jobs:
        return []

    ranked = [score_job(profile, job) for job in jobs]
    # Soft semantic nudge only as a tiny tie-break among equal scores.
    try:
        query = f"{question}\n{profile.get('summary', '')}\n{' '.join(profile.get('skills') or [])}"[:4000]
        query_vector = await embed_query(query)
        job_texts = [job_document(item["job"]) for item in ranked]
        vectors = await embed_job_texts(job_texts)
        for item, vector in zip(ranked, vectors, strict=True):
            item["semantic"] = cosine_similarity(query_vector, vector)
    except Exception:
        for item in ranked:
            item["semantic"] = 0.0

    ranked.sort(
        key=lambda item: (
            -item["score"],
            -item.get("semantic", 0.0),
            str(item["job"].get("_id", "")),
        )
    )
    high_priority = [item for item in ranked if item["priority"] == "high"][:high_limit]
    related = [item for item in ranked if item["priority"] == "related"][:related_limit]
    return [*high_priority, *related]


def rescore_matches(profile: dict, matches: list[dict]) -> list[dict]:
    """Re-apply documented scoring after the LLM refines the CV profile."""
    rescored = []
    for match in matches:
        scored = score_job(profile, match["job"])
        scored["semantic"] = match.get("semantic", 0.0)
        rescored.append(scored)
    rescored.sort(
        key=lambda item: (
            -item["score"],
            -item.get("semantic", 0.0),
            str(item["job"].get("_id", "")),
        )
    )
    return rescored
