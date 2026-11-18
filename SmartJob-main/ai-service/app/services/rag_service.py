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
    "lap",
    "trinh",
    "vien",
    "chuyen",
    "nhan",
    "ky",
    "su",
}
_GENERIC_ROLE_WORDS = {
    "developer",
    "engineer",
    "dev",
    "engineering",
    "development",
    "specialist",
    "staff",
}
_ROLE_ALIASES = {
    "backend engineer": "backend developer",
    "frontend engineer": "frontend developer",
    "front end developer": "frontend developer",
    "front end engineer": "frontend developer",
    "frontend": "frontend developer",
    "backend": "backend developer",
    "fullstack": "full stack developer",
    "full stack": "full stack developer",
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
    "nextjs": "next.js",
    "next": "next.js",
    "vuejs": "vue",
    "vue.js": "vue",
    "angularjs": "angular",
    "angular.js": "angular",
    "nodejs": "node.js",
    "node": "node.js",
    "expressjs": "express",
    "express.js": "express",
    "typescript": "typescript",
    "js": "javascript",
    "es6": "javascript",
    "ts": "typescript",
    "html5": "html",
    "css3": "css",
    "scss": "css",
    "sass": "css",
    "tailwind": "tailwindcss",
    "tailwind css": "tailwindcss",
    "postgres": "postgresql",
    "psql": "postgresql",
    "mongo": "mongodb",
    "golang": "go",
    "springboot": "spring boot",
    "spring": "spring boot",
    "restful api": "rest api",
    "restful": "rest api",
}
_LOCATION_ALIASES = {
    "ha noi": "hanoi",
    "hanoi": "hanoi",
    "hn": "hanoi",
    "ho chi minh": "ho chi minh",
    "ho chi minh city": "ho chi minh",
    "hcm": "ho chi minh",
    "tphcm": "ho chi minh",
    "sai gon": "ho chi minh",
    "saigon": "ho chi minh",
    "da nang": "da nang",
    "danang": "da nang",
    "hue": "hue",
    "thua thien hue": "hue",
    "remote": "remote",
    "tu xa": "remote",
    "lam viec tu xa": "remote",
    "wfh": "remote",
}


def normalize(value: str) -> str:
    """Mirror recommendation-service normalize() for comparable matching."""
    if not isinstance(value, str):
        return ""
    value = unicodedata.normalize("NFD", value)
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    value = value.replace("đ", "d").replace("Đ", "d")
    value = re.sub(r"\bfront[\s-]+end\b", "frontend", value.casefold())
    value = re.sub(r"\bback[\s-]+end\b", "backend", value)
    value = re.sub(r"\bfull[\s-]+stack\b", "fullstack", value)
    return re.sub(r"\s+", " ", value).strip()


def _ordered_tokens(value: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9+#.]+", normalize(value)) if token]


def _tokens(value: str) -> set[str]:
    return set(_ordered_tokens(value))


def _normalize_skill(value: str) -> str:
    skill = normalize(value)
    return _SKILL_ALIASES.get(skill, skill)


def _normalized_skills(values: list[str]) -> set[str]:
    return {_normalize_skill(value) for value in values if _normalize_skill(value)}


def expand_candidate_skills(values: list[str], role_phrases: Sequence[str] = ()) -> set[str]:
    """Normalize CV skills and infer foundational web skills implied by frameworks."""
    owned = _normalized_skills(values)
    role_tokens = set()
    for phrase in role_phrases:
        role_tokens |= _tokens(phrase)

    if owned & {"react", "next.js", "vue", "angular", "svelte"}:
        owned |= {"javascript", "html", "css"}
    if owned & {"typescript", "node.js", "express"}:
        owned.add("javascript")
    if owned & {"tailwindcss", "bootstrap"}:
        owned |= {"html", "css"}
    if "frontend" in role_tokens and owned:
        owned |= {"javascript", "html", "css"}
    return owned


def _normalize_location(value: str | None) -> str:
    loc = normalize(value or "")
    if not loc:
        return ""
    loc = re.sub(r"^(?:tp\.?\s*|thanh pho\s+)", "", loc).strip()
    loc = re.sub(r"\s+(?:city|province|viet nam|vietnam)$", "", loc).strip()
    return _LOCATION_ALIASES.get(loc, loc)


def _normalize_role(value: str) -> str:
    raw = normalize(value)
    if raw in _ROLE_ALIASES:
        return _ROLE_ALIASES[raw]
    words = [word for word in _ordered_tokens(raw) if word not in _LEVEL_WORDS]
    role = " ".join(words)
    return _ROLE_ALIASES.get(role, role)


def _candidate_role_phrases(profile: dict) -> list[str]:
    phrases: list[str] = []
    for item in [
        *(profile.get("target_roles") or []),
        *(profile.get("experience_roles") or []),
    ]:
        if item and str(item).strip():
            phrases.append(str(item).strip())
    desired_pos = str(profile.get("desiredPosition") or "").strip()
    if desired_pos and desired_pos not in phrases:
        phrases.append(desired_pos)
    if not phrases and profile.get("summary"):
        phrases.append(str(profile.get("summary")))
    return phrases


def _evaluate_role_match(job_title: str, profile: dict, owned_skills: set[str] | None = None) -> tuple[float, bool]:
    """Return (position_score_0_to_1, is_direct_role_match) against candidate role phrases."""
    title_tokens = _tokens(job_title) - _LEVEL_WORDS
    title_core = title_tokens - _GENERIC_ROLE_WORDS
    if not title_tokens:
        return 0.0, False

    phrases = _candidate_role_phrases(profile)
    if not phrases:
        return 0.0, False

    best_score = 0.0
    direct = False
    job_role_norm = _normalize_role(job_title)

    for phrase in phrases:
        role_norm = _normalize_role(phrase)
        if role_norm and job_role_norm and (
            job_role_norm == role_norm
            or job_role_norm in role_norm
            or role_norm in job_role_norm
        ):
            best_score = 1.0
            direct = True
            break

        role_tokens = _tokens(phrase) - _LEVEL_WORDS
        role_core = role_tokens - _GENERIC_ROLE_WORDS
        if role_core and title_core:
            if role_core == title_core or title_core <= role_core or role_core <= title_core:
                best_score = 1.0
                direct = True
                break
            overlap = role_core & title_core
            if overlap:
                ratio = len(overlap) / min(len(role_core), len(title_core))
                best_score = max(best_score, ratio)
                if ratio >= 0.5:
                    direct = True
        elif role_tokens and title_tokens:
            overlap = role_tokens & title_tokens
            if overlap:
                ratio = len(overlap) / min(len(role_tokens), len(title_tokens))
                best_score = max(best_score, ratio)
                if ratio >= 0.5:
                    direct = True

    if not direct and owned_skills and title_core and title_core <= owned_skills:
        best_score = max(best_score, 1.0)
        direct = True

    return best_score, direct


def _direct_role_match(job_title: str, profile: dict) -> bool:
    _, direct = _evaluate_role_match(job_title, profile)
    return direct


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
    role_phrases = _candidate_role_phrases(profile)
    owned = expand_candidate_skills(profile.get("skills") or [], role_phrases)
    required = sorted(_normalized_skills(job.get("requiredSkills") or []))
    matched = [skill for skill in required if skill in owned]
    skills = (len(matched) / len(required)) if required else 0.0

    position, role_match = _evaluate_role_match(job.get("title") or "", profile, owned)

    experience_years = profile.get("experience_years")
    experience_min = job.get("experienceMin")
    if isinstance(experience_min, (int, float)) and experience_min == 0:
        experience = 1.0
    elif isinstance(experience_years, (int, float)) and isinstance(experience_min, (int, float)):
        if experience_years < 0 or experience_min < 0:
            experience = 0.0
        else:
            experience = min(float(experience_years) / float(experience_min), 1.0)
    else:
        experience = 0.0

    user_location = _normalize_location(profile.get("location"))
    job_location = _normalize_location(job.get("location"))
    location = 1.0 if user_location and job_location and user_location == job_location else 0.0

    score = max(
        0,
        min(
            100,
            round(skills * 40 + position * 25 + experience * 20 + location * 15),
        ),
    )
    coverage = skills
    has_domain_match = role_match or len(matched) > 0 or position > 0
    # High = có khớp chuyên môn (vị trí/kỹ năng) và đủ điểm chuẩn, hoặc khớp trực tiếp chức danh + kỹ năng.
    high = has_domain_match and (
        (score >= HIGH_SCORE_THRESHOLD and (role_match or coverage >= 0.5))
        or (
            role_match
            and (
                coverage >= 0.5
                or len(matched) >= 2
                or (len(matched) >= 1 and score >= 45)
            )
        )
    )
    return {
        "job": job,
        "score": score,
        "similarity": score / 100,
        "matched_skills": matched,
        "priority": "high" if high else "related",
        "role_match": role_match,
        "skill_coverage": coverage,
        "has_domain_match": has_domain_match,
        "domain_score": round(skills * 40 + position * 25),
        "breakdown": {
            "skills": round(skills * 40),
            "position": round(position * 25),
            "experience": round(experience * 20),
            "location": round(location * 15),
        },
    }


def _sort_key(item: dict) -> tuple:
    return (
        -int(bool(item.get("has_domain_match"))),
        -item["score"],
        -item.get("domain_score", 0),
        -item.get("semantic", 0.0),
        str(item["job"].get("_id", "")),
    )


def _promote_if_no_high(items: list[dict], high_limit: int = 5) -> None:
    """If no job crossed the threshold but relevant matches exist, promote top matches."""
    if any(item["priority"] == "high" for item in items):
        return
    promoted = 0
    limit = max(1, min(3, high_limit))
    for item in items:
        if item.get("role_match") or item.get("matched_skills"):
            item["priority"] = "high"
            promoted += 1
            if promoted >= limit:
                break


def _split_priority_buckets(
    items: list[dict],
    high_limit: int = 5,
    related_limit: int = 5,
) -> list[dict]:
    high_priority = [item for item in items if item["priority"] == "high"][:high_limit]
    related_all = [item for item in items if item["priority"] == "related"]
    related_domain = [item for item in related_all if item.get("has_domain_match")]
    related = (related_domain if related_domain else related_all)[:related_limit]
    return [*high_priority, *related]


def assign_priorities(
    profile: dict,
    jobs: list[dict],
    high_limit: int = 5,
    related_limit: int = 5,
) -> list[dict]:
    scored = [score_job(profile, job) for job in jobs]
    scored.sort(key=_sort_key)
    _promote_if_no_high(scored, high_limit)
    return _split_priority_buckets(scored, high_limit, related_limit)


def profile_from_cv_model(profile, fallback: dict | None = None) -> dict:
    """Map LLM/CvProfile fields onto the scorer shape, merging fallback heuristic fields."""
    if isinstance(profile, dict):
        data = profile
    else:
        data = profile.model_dump() if hasattr(profile, "model_dump") else dict(profile)
    fb = fallback or {}

    skills = list(dict.fromkeys([*(data.get("skills") or []), *(fb.get("skills") or [])]))
    experience_roles = list(
        dict.fromkeys([*(data.get("experience_roles") or []), *(fb.get("experience_roles") or [])])
    )
    target_roles = list(
        dict.fromkeys([*(data.get("target_roles") or []), *(fb.get("target_roles") or [])])
    )
    exp_years = data.get("experience_years")
    if exp_years is None:
        exp_years = fb.get("experience_years")
    if exp_years is None:
        exp_years = 0.0

    location = data.get("location") or fb.get("location")

    return {
        "summary": data.get("summary") or fb.get("summary") or "",
        "skills": skills,
        "experience_roles": experience_roles,
        "target_roles": target_roles,
        "desiredPosition": " ".join(
            str(part)
            for part in [*target_roles, *experience_roles]
            if part
        ),
        "experience_years": exp_years,
        "location": location,
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

    ranked.sort(key=_sort_key)
    _promote_if_no_high(ranked, high_limit)
    return _split_priority_buckets(ranked, high_limit, related_limit)


def rescore_matches(
    profile: dict,
    matches: list[dict],
    all_jobs: list[dict] | None = None,
    high_limit: int = 5,
    related_limit: int = 5,
) -> list[dict]:
    """Re-apply documented scoring after the LLM refines the CV profile."""
    semantic_by_id = {
        str(match["job"].get("_id", "")): match.get("semantic", 0.0)
        for match in matches
    }
    matched_ids = set(semantic_by_id.keys())
    source_jobs = all_jobs if all_jobs else [match["job"] for match in matches]

    rescored = []
    for job in source_jobs:
        job_id = str(job.get("_id", ""))
        scored = score_job(profile, job)
        scored["semantic"] = semantic_by_id.get(job_id, 0.0)
        scored["_in_initial"] = job_id in matched_ids
        rescored.append(scored)

    rescored.sort(
        key=lambda item: (
            -int(bool(item.get("has_domain_match"))),
            -item["score"],
            -item.get("domain_score", 0),
            -int(item.get("_in_initial", False)),
            -item.get("semantic", 0.0),
            str(item["job"].get("_id", "")),
        )
    )
    _promote_if_no_high(rescored, high_limit)
    for item in rescored:
        item.pop("_in_initial", None)

    if all_jobs is None:
        return rescored

    return _split_priority_buckets(rescored, high_limit, related_limit)
