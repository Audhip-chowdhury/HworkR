import json
import os
from pathlib import Path
from typing import Self

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "HworkR API"
    debug: bool = False
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days for dev
    database_url: str = "postgresql://postgres:postgres@localhost:5432/hworkr"
    api_base_path: str = Field(default="", validation_alias=AliasChoices("API_BASE_PATH", "BACKEND_BASE_PATH"))
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8020,http://127.0.0.1:8020,"
        "https://hworkr.audhip-projects.com,http://hworkr.audhip-projects.com"
    )
    upload_dir: Path = Path("./uploads")
    max_upload_bytes: int = 2 * 1024 * 1024  # 2 MiB — company logos
    max_employee_document_bytes: int = 5 * 1024 * 1024  # 5 MiB — ID / photo / offer PDF
    # POST applicant pipeline updates; empty string disables (env: RECRUITMENT_STATUS_WEBHOOK_URL).
    recruitment_status_webhook_url: str = "http://127.0.0.1:8020/recruitment/application-status"
    # POST after HR creates an offer; same external stack as pipeline (port 8020). Empty disables.
    recruitment_offer_webhook_url: str = "http://127.0.0.1:8020/recruitment/offers/inbound"

    # SimCash: when True, validate-calculation may return expected values (do not enable in prod)
    simcash_debug: bool = False

    # Legal RAG (Vertex AI + Chroma). Prefer a service account JSON path; project_id can be read from that file.
    gcp_credentials_path: str = Field(
        default="",
        validation_alias=AliasChoices("GCP_CREDENTIALS_PATH", "GOOGLE_APPLICATION_CREDENTIALS"),
        description="Path to GCP service account JSON; sets GOOGLE_APPLICATION_CREDENTIALS for Vertex SDK.",
    )
    gcp_project_id: str = ""
    gcp_location: str = "asia-south1"
    legal_rag_llm_model: str = "gemini-2.5-flash"
    # Gecko @003 is often unavailable by region / deprecated; multilingual-002 is widely on Vertex.
    legal_rag_embedding_model: str = "text-multilingual-embedding-002"
    legal_rag_chroma_persist_dir: str = "./data/chroma_legal"
    legal_rag_collection: str = "india_legal"
    legal_rag_top_k: int = 5
    # Vertex embedding quotas: small batches + spacing + retries for large ingests.
    legal_rag_embed_batch_size: int = 5
    legal_rag_embed_max_retries: int = 12
    legal_rag_embed_min_interval_seconds: float = 0.4

    @model_validator(mode="after")
    def _apply_gcp_service_account(self) -> Self:
        raw = (self.gcp_credentials_path or "").strip()
        if not raw:
            return self
        p = Path(raw).expanduser()
        try:
            p = p.resolve()
        except OSError:
            return self
        if not p.is_file():
            return self
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
        if (self.gcp_project_id or "").strip():
            return self
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            pid = data.get("project_id")
            if isinstance(pid, str) and pid.strip():
                self.gcp_project_id = pid.strip()
        except (json.JSONDecodeError, OSError):
            pass
        return self

    @staticmethod
    def _normalize_prefix_path(raw: str) -> str:
        value = (raw or "").strip()
        if not value or value == "/":
            return ""
        if not value.startswith("/"):
            value = f"/{value}"
        return value[:-1] if value.endswith("/") else value

    @model_validator(mode="after")
    def _normalize_paths(self) -> Self:
        self.api_base_path = self._normalize_prefix_path(self.api_base_path)
        return self


settings = Settings()
