"""
Unified application settings loaded from environment variables and optional .env file.
All runtime configuration for the DocShield AI Engine is centralised here.
Every key has a documented default so the application starts correctly without any .env file.

Merges configuration from:
  - ai-detection (document OCR/validation settings)
  - Image_Tampering (forensic analysis settings)
  - face (biometric verification settings)
"""
from __future__ import annotations
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pydantic-settings model for the unified DocShield AI Engine.

    Resolution priority:
      1. Environment variables (highest)
      2. .env file (if present)
      3. Field defaults below (lowest)
    """

    # ── Application metadata ──────────────────────────────────────────────────
    APP_NAME: str = "DocShield AI Engine"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"   # "development" | "production"

    # ── API ───────────────────────────────────────────────────────────────────
    API_PREFIX: str = "/api/v1"

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Set to ["*"] for dev; restrict in production.
    CORS_ORIGINS: list[str] = ["*"]

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"

    # ── OCR engine (Document Detection) ───────────────────────────────────────
    OCR_LANGUAGE: str = "en"
    OCR_USE_GPU: bool = False
    OCR_CONFIDENCE_THRESHOLD: float = 0.75

    # ── Image preprocessing (Document Detection) ──────────────────────────────
    ENABLE_PREPROCESSING: bool = False

    # ── File upload limits ────────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 10
    SUPPORTED_FILE_TYPES: list[str] = [
        "image/jpeg",
        "image/png",
        "image/tiff",
        "application/pdf",
    ]

    # ── Image Tampering / Forensic settings ───────────────────────────────────
    FORENSIC_SUPPORTED_FORMATS: list[str] = ["image/jpeg", "image/png", "image/webp"]
    FORENSIC_MAX_FILE_SIZE_MB: int = 50
    FORENSIC_DEBUG_DIR: str = "outputs/debug"

    # ── Face Verification settings ────────────────────────────────────────────
    FACE_MATCH_THRESHOLD: float = 0.45
    FACE_LIVENESS_TIMEOUT: float = 10.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


# Module-level singleton — import this throughout the application.
settings = Settings()
