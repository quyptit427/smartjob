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
    openai_api_base_url = os.getenv(
        "OPENAI_API_BASE_URL", "https://api.xingchiapi.com/v1"
    ).rstrip("/")
    openai_api_key = os.getenv("OPENAI_API_KEY", "")
    openai_chat_model = os.getenv("OPENAI_CHAT_MODEL", "gpt-6.1-sol")
    openai_embedding_model = os.getenv(
        "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
    )


settings = Settings()
