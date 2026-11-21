import json

import httpx

from app.services.embedding_service import embed_job_texts, embed_query
from app.settings import settings


def _root() -> str:
    return (
        "https://api.cloudflare.com/client/v4/accounts/"
        f"{settings.cloudflare_account_id}/vectorize/v2/indexes/{settings.vectorize_index}"
    )


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.cloudflare_api_token}"}


def _line(job: dict, vector: list[float]) -> str:
    job_id = str(job.get("_id") or "")
    if not job_id:
        raise ValueError("Job is missing _id")
    return json.dumps(
        {
            "id": job_id,
            "values": vector,
            "metadata": {
                "status": str(job.get("status") or "open"),
                "title": str(job.get("title") or "")[:200],
            },
        },
        separators=(",", ":"),
    )


async def _read(response: httpx.Response) -> dict:
    try:
        payload = response.json()
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Vectorize trả nội dung không phải JSON ({response.status_code}).") from error
    if response.is_error or payload.get("success") is False:
        errors = payload.get("errors") if isinstance(payload, dict) else None
        raise RuntimeError(f"Vectorize HTTP {response.status_code}: {errors or payload}")
    return payload


async def upsert_jobs(jobs: list[dict]) -> int:
    if not settings.vectorize_enabled or not jobs:
        return 0
    from app.services.rag_service import job_document

    texts = [job_document(job) for job in jobs]
    vectors = await embed_job_texts(texts)
    lines = [_line(job, vector) for job, vector in zip(jobs, vectors, strict=True)]
    async with httpx.AsyncClient(timeout=60.0) as client:
        for start in range(0, len(lines), 100):
            body = ("\n".join(lines[start : start + 100]) + "\n").encode()
            response = await client.post(
                f"{_root()}/upsert",
                headers={**_headers(), "Content-Type": "application/x-ndjson"},
                content=body,
            )
            await _read(response)
    return len(lines)


async def delete_job(job_id: str) -> None:
    if not settings.vectorize_enabled or not job_id:
        return
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            f"{_root()}/delete",
            headers={**_headers(), "Content-Type": "application/json"},
            json={"ids": [job_id]},
        )
        await _read(response)


async def query_similar(vector: list[float], top_k: int = 20) -> list[dict]:
    if not settings.vectorize_enabled:
        return []
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            f"{_root()}/query",
            headers={**_headers(), "Content-Type": "application/json"},
            json={
                "vector": vector,
                "topK": top_k,
                "filter": {"status": "open"},
                "returnMetadata": "none",
            },
        )
        payload = await _read(response)
    matches = payload.get("result", {}).get("matches") or []
    return [
        {"id": str(match.get("id", "")), "score": float(match.get("score") or 0)}
        for match in matches
        if match.get("id")
    ]


async def embed_question(question: str, profile: dict) -> list[float]:
    query = f"{question}\n{profile.get('summary', '')}\n{' '.join(profile.get('skills') or [])}"[:4000]
    return await embed_query(query)
