import httpx

from app.settings import settings


class LocalModelError(Exception):
    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code


def _post(path: str, payload: dict) -> dict:
    ollama_url = settings.qwen_api_base_url.removesuffix("/v1")
    try:
        with httpx.Client(timeout=180.0) as client:
            response = client.post(f"{ollama_url}/api/{path}", json=payload)
    except httpx.HTTPError as error:
        raise LocalModelError(
            "Không kết nối được Ollama. Hãy kiểm tra Ollama đang chạy tại "
            f"{settings.qwen_api_base_url}.",
        ) from error
    if response.is_error:
        status_code = response.status_code if response.status_code in (429, 503) else 502
        raise LocalModelError(
            f"Ollama trả lỗi HTTP {response.status_code}: {response.text[:500]}",
            status_code,
        )
    return response.json()


def generate_json(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    response_schema: dict,
) -> str:
    response = _post(
        "chat",
        {
            "model": settings.qwen_chat_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "think": False,
            "format": response_schema,
            "options": {"num_predict": max_tokens},
        },
    )
    content = response.get("message", {}).get("content")
    if not content:
        raise ValueError("Qwen returned an empty response")
    return content


def create_embeddings(texts: list[str]) -> list[list[float]]:
    response = _post(
        "embed",
        {"model": settings.embedding_model, "input": texts},
    )
    return response["embeddings"]
