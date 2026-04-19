from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "HworkR API"
    debug: bool = False
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days for dev
    database_url: str = "sqlite:///./hworkr.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    upload_dir: Path = Path("./uploads")
    max_upload_bytes: int = 2 * 1024 * 1024  # 2 MiB — company logos
    max_employee_document_bytes: int = 5 * 1024 * 1024  # 5 MiB — ID / photo / offer PDF
    # POST applicant pipeline updates; empty string disables (env: RECRUITMENT_STATUS_WEBHOOK_URL).
    recruitment_status_webhook_url: str = "http://127.0.0.1:8020/recruitment/application-status"
    # POST after HR creates an offer; same external stack as pipeline (port 8020). Empty disables.
    recruitment_offer_webhook_url: str = "http://127.0.0.1:8020/recruitment/offers/inbound"

    # SimCash: when True, validate-calculation may return expected values (do not enable in prod)
    simcash_debug: bool = False


settings = Settings()
