import httpx
from fastapi import HTTPException

from app.settings import settings

_TIMEOUT = httpx.Timeout(15.0, connect=5.0)


def _service_headers() -> dict[str, str]:
    return {"x-service-token": settings.internal_service_token}


async def fetch_resume(user_id: str) -> bytes:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                f"{settings.resume_service_url}/internal/resumes/{user_id}/file",
                headers=_service_headers(),
            )
    except httpx.HTTPError as error:
        raise HTTPException(status_code=503, detail="Resume Service hiện không sẵn sàng.") from error
    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail="Bạn cần tải CV PDF lên trang hồ sơ trước khi dùng tư vấn AI.",
        )
    if response.is_error:
        raise HTTPException(status_code=503, detail="Không đọc được CV từ Resume Service.")
    return response.content


async def fetch_open_jobs(max_jobs: int = 200) -> list[dict]:
    jobs: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            page = 1
            total_pages = 1
            while page <= total_pages and len(jobs) < max_jobs:
                response = await client.get(
                    f"{settings.job_service_url}/internal/jobs",
                    params={"page": page, "limit": 50},
                    headers=_service_headers(),
                )
                response.raise_for_status()
                payload = response.json().get("data", {})
                jobs.extend(payload.get("items", []))
                total_pages = payload.get("totalPages", 0)
                page += 1
    except httpx.HTTPError as error:
        raise HTTPException(status_code=503, detail="Job Service hiện không sẵn sàng.") from error
    return jobs[:max_jobs]
