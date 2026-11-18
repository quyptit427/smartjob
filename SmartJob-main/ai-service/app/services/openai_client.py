import hashlib
import json
import math
import re

import httpx

from app.settings import settings


class AiProviderError(Exception):
    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code


def _headers() -> dict[str, str]:
    if not settings.openai_api_key:
        raise AiProviderError(
            "Thiếu OPENAI_API_KEY. Thêm khóa vào file .env rồi khởi động lại ai-service.",
            503,
        )
    return {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
        # Required by xingchiapi gateway (coding-client allowlist).
        "User-Agent": "Cursor/1.0 (Windows)",
        "x-openai-actor-authorization": "local-image-extension",
        "OpenAI-Beta": "responses=v1",
    }


def _post(path: str, payload: dict, timeout: float = 45.0) -> dict:
    url = f"{settings.openai_api_base_url}/{path.lstrip('/')}"
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, headers=_headers(), json=payload)
    except httpx.HTTPError as error:
        raise AiProviderError(
            f"Không kết nối được API AI tại {settings.openai_api_base_url}.",
        ) from error
    if response.is_error:
        status_code = response.status_code if response.status_code in (401, 429, 503) else 502
        detail = response.text[:300]
        try:
            err_json = response.json()
            if isinstance(err_json, dict) and isinstance(err_json.get("error"), dict):
                detail = err_json["error"].get("message") or detail
        except Exception:
            pass
        raise AiProviderError(
            f"API AI trả lỗi HTTP {response.status_code}: {detail}",
            status_code,
        )
    return response.json()


def _extract_output_text(response: dict) -> str:
    chunks: list[str] = []
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if part.get("type") in {"output_text", "text"} and part.get("text"):
                chunks.append(part["text"])
    content = "\n".join(chunks).strip()
    if content:
        return content
    try:
        msg_content = response["choices"][0]["message"]["content"]
        if isinstance(msg_content, list):
            return "\n".join(
                part.get("text", "") for part in msg_content if isinstance(part, dict)
            ).strip()
        return str(msg_content or "").strip()
    except (KeyError, IndexError, TypeError) as error:
        raise ValueError("API AI trả phản hồi không hợp lệ.") from error


def _strip_json_fence(content: str) -> str:
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", content, re.IGNORECASE)
    if fence:
        return fence.group(1).strip()
    return content.strip()


def generate_json(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    response_schema: dict | None = None,
) -> str:
    # Keep schema hint tiny — full Pydantic JSON Schema slows the model a lot.
    schema_hint = (
        "Trả JSON object hợp lệ, không markdown."
        if not response_schema
        else f"Trả JSON object hợp lệ, không markdown. Khóa chính: {', '.join(response_schema.keys())}."
    )
    full_instructions = f"{system_prompt}\n\n{schema_hint}"
    payload = {
        "model": settings.openai_chat_model,
        "instructions": full_instructions,
        "input": user_prompt,
        "store": False,
        "max_output_tokens": max_tokens,
        "temperature": 0.2,
        "reasoning": {"effort": "minimal"},
    }
    response: dict | None = None
    last_error: AiProviderError | None = None

    try:
        response = _post("responses", payload)
    except AiProviderError as err:
        last_error = err
        # Only retry /responses if the model rejected reasoning.effort="minimal" (400/422).
        if "HTTP 400" in str(err) or "HTTP 422" in str(err):
            try:
                payload["reasoning"] = {"effort": "low"}
                response = _post("responses", payload)
            except AiProviderError as retry_err:
                last_error = retry_err

    # Fallback to standard OpenAI /chat/completions if /responses is unsupported or upstream failed.
    if response is None and (last_error is None or last_error.status_code != 401):
        chat_payload = {
            "model": settings.openai_chat_model,
            "messages": [
                {"role": "system", "content": full_instructions},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": 0.2,
        }
        try:
            response = _post("chat/completions", chat_payload)
        except AiProviderError as chat_err:
            raise (last_error or chat_err) from chat_err

    if response is None:
        raise last_error or AiProviderError("API AI chưa xử lý được yêu cầu.")

    content = _extract_output_text(response)
    if not content:
        raise ValueError("API AI trả phản hồi rỗng.")
    return _strip_json_fence(content)


def _local_embeddings(texts: list[str], dims: int = 256) -> list[list[float]]:
    vectors: list[list[float]] = []
    for text in texts:
        vec = [0.0] * dims
        for token in re.findall(r"[a-z0-9]+", text.casefold()):
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % dims
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vec[index] += sign
        norm = math.sqrt(sum(value * value for value in vec)) or 1.0
        vectors.append([value / norm for value in vec])
    return vectors


def create_embeddings(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    return _local_embeddings(texts)
