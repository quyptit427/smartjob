import os
from pathlib import Path

from dotenv import load_dotenv

_service_dir = Path(__file__).resolve().parents[1]
load_dotenv(_service_dir.parents[0] / ".env")
load_dotenv(_service_dir / ".env", override=True)


class Settings:
    port = int(os.getenv("AI_PORT", "3006"))
    jwt_secret = os.getenv("JWT_SECRET", "")
    internal_service_token = os.getenv("INTERNAL_SERVICE_TOKEN", "")
    job_service_url = os.getenv("JOB_SERVICE_URL", "http://127.0.0.1:3002").rstrip("/")
    resume_service_url = os.getenv("RESUME_SERVICE_URL", "http://127.0.0.1:3005").rstrip("/")
    qwen_api_base_url = os.getenv(
        "QWEN_API_BASE_URL", "http://localhost:11434/v1"
    ).rstrip("/")
    qwen_chat_model = os.getenv("QWEN_CHAT_MODEL", "qwen3:4b")
    embedding_model = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")


settings = Settings()
