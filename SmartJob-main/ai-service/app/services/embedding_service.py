import asyncio
import hashlib
from collections.abc import Sequence

from app.services.qwen_client import create_embeddings

_job_embedding_cache: dict[str, list[float]] = {}


def _key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def embed_query(text: str) -> list[float]:
    embeddings = await asyncio.to_thread(create_embeddings, [text[:12000]])
    return embeddings[0]


async def embed_job_texts(texts: Sequence[str]) -> list[list[float]]:
    if len(_job_embedding_cache) > 5000:
        _job_embedding_cache.clear()
    keys = [_key(text) for text in texts]
    missing = [index for index, key in enumerate(keys) if key not in _job_embedding_cache]
    for start in range(0, len(missing), 10):
        batch_indexes = missing[start : start + 10]
        embeddings = await asyncio.to_thread(
            create_embeddings,
            [texts[index][:3500] for index in batch_indexes],
        )
        for index, embedding in zip(batch_indexes, embeddings, strict=True):
            _job_embedding_cache[keys[index]] = embedding
    return [_job_embedding_cache[key] for key in keys]
