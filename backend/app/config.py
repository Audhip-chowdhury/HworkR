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


settings = Settings()
