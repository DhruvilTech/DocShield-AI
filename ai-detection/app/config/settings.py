"""
Application settings loaded from environment variables and optional .env file.
All runtime configuration is centralised here. Every key has a documented
default so the application starts correctly without any .env file present.
"""
from __future__ import annotations
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pydantic-settings model for DocShield AI.

    Resolution priority:
      1. Environment variables (highest)
      2. .env file (if present)
      3. Field defaults below (lowest)
    """

    # ── Application metadata ──────────────────────────────────────────────────
    APP_NAME: str = "DocShield AI"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"   # "development" | "production"

    # ── API ───────────────────────────────────────────────────────────────────
    API_PREFIX: str = "/api/v1"

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Set to ["*"] for dev; restrict in production.
    CORS_ORIGINS: list[str] = ["*"]

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"

    # ── OCR engine ────────────────────────────────────────────────────────────
    OCR_LANGUAGE: str = "en"
    OCR_USE_GPU: bool = False
    OCR_CONFIDENCE_THRESHOLD: float = 0.75

    # ── Image preprocessing ───────────────────────────────────────────────────
    ENABLE_PREPROCESSING: bool = False

    # ── File upload limits ────────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 10
    SUPPORTED_FILE_TYPES: list[str] = [
        "image/jpeg",
        "image/png",
        "image/tiff",
        "application/pdf",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


# Module-level singleton — import this throughout the application.
settings = Settings()
