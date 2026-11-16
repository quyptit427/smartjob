# Backward-compatible re-exports after migrating off local Qwen/Ollama.
from app.services.openai_client import AiProviderError as LocalModelError
from app.services.openai_client import create_embeddings, generate_json

__all__ = ["LocalModelError", "create_embeddings", "generate_json"]
