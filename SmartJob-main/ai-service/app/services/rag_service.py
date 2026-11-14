import json
import math
import re
import unicodedata
from collections.abc import Sequence

from app.services.embedding_service import embed_job_texts, embed_query

_LEVEL_WORDS = {
    "fresher", "intern", "internship", "junior", "remote", "entry", "level",
    "associate", "senior", "lead", "trainee", "graduate",
}
_ROLE_ALIASES = {
    "backend engineer": "backend developer",
    "frontend engineer": "frontend developer",
    "front end developer": "frontend developer",
    "front end engineer": "frontend developer",
    "fullstack developer": "full stack developer",
    "fullstack engineer": "full stack developer",
    "bi analyst": "business intelligence analyst",
    "ml engineer": "machine learning engineer",
    "data engineering": "data engineer",
}


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", value))


def _normalize_role(value: str) -> str:
    words = [word for word in _normalize(value).split() if word not in _LEVEL_WORDS]
    role = " ".join(words)
    return _ROLE_ALIASES.get(role, role)


def _direct_role_match(job_title: str, cv_roles: list[str]) -> bool:
    job_role = _normalize_role(job_title)
    if not job_role:
        return False
    return any(
        role and (job_role == role or job_role in role or role in job_role)
        for role in (_normalize_role(item) for item in cv_roles)
    )


def _normalized_skills(values: list[str]) -> set[str]:
    return {_normalize(value).replace(" ", "") for value in values if _normalize(value)}


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
            f"Description: {job.get('description', '')[:1900]}",
        ]
    )


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


async def retrieve_jobs(
    profile: dict,
    question: str,
    jobs: list[dict],
    high_limit: int = 5,
    related_limit: int = 5,
) -> list[dict]:
    if not jobs:
        return []

    query = json.dumps(
        {"candidate_profile": profile, "question": question},
        ensure_ascii=False,
    )[:12000]
    query_vector = await embed_query(query)
    job_texts = [job_document(job) for job in jobs]
    vectors = await embed_job_texts(job_texts)
    cv_roles = profile.get("experience_roles", []) + profile.get("target_roles", [])
    cv_skills = _normalized_skills(profile.get("skills", []))

    high_priority = []
    related = []
    for job, vector in zip(jobs, vectors, strict=True):
        similarity = cosine_similarity(query_vector, vector)
        required = _normalized_skills(job.get("requiredSkills", []))
        overlap = required & cv_skills
        coverage = len(overlap) / len(required) if required else 0.0
        role_match = _direct_role_match(job.get("title", ""), cv_roles)
        enough_skill_match = not required or len(overlap) >= min(2, len(required)) or coverage >= 0.5
        result = {
            "job": job,
            "similarity": similarity,
            "matched_skills": sorted(overlap),
            "priority": "high" if role_match and enough_skill_match else "related",
            "role_match": role_match,
            "skill_coverage": coverage,
        }
        (high_priority if result["priority"] == "high" else related).append(result)

    high_priority.sort(
        key=lambda item: (
            -item["skill_coverage"],
            -item["similarity"],
            str(item["job"].get("_id", "")),
        )
    )
    related.sort(key=lambda item: (-item["similarity"], str(item["job"].get("_id", ""))))
    return [*high_priority[:high_limit], *related[:related_limit]]
