"""
DocShield AI — FastAPI application entry point.

Startup sequence
  1. PaddleOCR engine is initialised once (warm-up happens here, not on first request).
  2. Extractor registry, OCR service, validator registry, and validation service
     are built and stored in app.state so route handlers can access them.
  3. CORS and RequestIdMiddleware are added.
  4. Global exception handlers translate domain exceptions to typed JSON errors.
  5. /health and /ready probes are mounted at root level (not versioned) so
     orchestrators (Kubernetes, docker-compose) can reach them without auth.
  6. All application routes are mounted under settings.API_PREFIX (/api/v1).
"""
from __future__ import annotations
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.schemas import ErrorResponse, HealthResponse, ReadyResponse
from app.common.logging import logger
from app.common.middleware import RequestIdMiddleware
from app.common.exceptions import (
    InvalidImageError,
    OCRFailureError,
    UnsupportedDocumentTypeError,
    UnsupportedFileTypeError,
)
from app.config.settings import settings
from app.ocr.extractor import (
    BaseFieldExtractor,
    DrivingLicenseFieldExtractor,
    NationalIDFieldExtractor,
    PassportFieldExtractor,
    PermitFieldExtractor,
    VisaFieldExtractor,
)
from app.ocr.service import OCRService
from app.preprocessing.image import ImagePreprocessor
from app.schemas.document import DocumentType
from app.validation.driving_license import DrivingLicenseValidator
from app.validation.national_id import NationalIdValidator
from app.validation.passport import PassportValidator
from app.validation.permit import PermitValidator
from app.validation.rules import RuleSetLoader
from app.validation.service import ValidationService, ValidatorRegistry
from app.validation.visa import VisaValidator


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise all heavy resources once at startup; clean up on shutdown."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION} [{settings.APP_ENV}]")

    # OCR engine — PaddleOCR downloads model weights on first run
    from app.ocr.paddle_engine import PaddleOCREngine
    engine = PaddleOCREngine(
        language=settings.OCR_LANGUAGE,
        use_gpu=settings.OCR_USE_GPU,
    )

    extractor_registry: dict[DocumentType, BaseFieldExtractor] = {
        DocumentType.PASSPORT:        PassportFieldExtractor(),
        DocumentType.VISA:            VisaFieldExtractor(),
        DocumentType.NATIONAL_ID:     NationalIDFieldExtractor(),
        DocumentType.DRIVING_LICENSE: DrivingLicenseFieldExtractor(),
        DocumentType.PERMIT:          PermitFieldExtractor(),
    }

    preprocessor = ImagePreprocessor(enabled=settings.ENABLE_PREPROCESSING)
    ocr_service = OCRService(
        engine=engine,
        extractor_registry=extractor_registry,
        preprocessor=preprocessor,
    )

    validator_registry = ValidatorRegistry()
    validator_registry.register(DocumentType.PASSPORT,        PassportValidator())
    validator_registry.register(DocumentType.VISA,            VisaValidator())
    validator_registry.register(DocumentType.NATIONAL_ID,     NationalIdValidator())
    validator_registry.register(DocumentType.DRIVING_LICENSE, DrivingLicenseValidator())
    validator_registry.register(DocumentType.PERMIT,          PermitValidator())

    rule_loader = RuleSetLoader()
    validation_service = ValidationService(
        registry=validator_registry,
        rule_loader=rule_loader,
    )

    app.state.ocr_service = ocr_service
    app.state.validation_service = validation_service
    app.state.ready = True

    logger.info("Application startup complete — all services ready")
    yield

    logger.info("Application shutdown")
    app.state.ready = False


# ── Application factory ───────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "AI-powered Indian government document screening API. "
        "Accepts document images, runs OCR, extracts fields, and validates them "
        "against Indian government-standard rules."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)


# ── Middleware ─────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

app.add_middleware(RequestIdMiddleware)


# ── Global exception handlers ─────────────────────────────────────────────────

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", str(uuid.uuid4()))


@app.exception_handler(InvalidImageError)
async def invalid_image_handler(request: Request, exc: InvalidImageError):
    return JSONResponse(
        status_code=400,
        content=ErrorResponse(
            request_id=_request_id(request),
            error="InvalidImage",
            detail=exc.message,
        ).model_dump(),
    )


@app.exception_handler(UnsupportedFileTypeError)
async def unsupported_file_type_handler(request: Request, exc: UnsupportedFileTypeError):
    return JSONResponse(
        status_code=415,
        content=ErrorResponse(
            request_id=_request_id(request),
            error="UnsupportedFileType",
            detail=exc.message,
        ).model_dump(),
    )


@app.exception_handler(UnsupportedDocumentTypeError)
async def unsupported_doc_handler(request: Request, exc: UnsupportedDocumentTypeError):
    return JSONResponse(
        status_code=422,
        content=ErrorResponse(
            request_id=_request_id(request),
            error="UnsupportedDocumentType",
            detail=exc.message,
        ).model_dump(),
    )


@app.exception_handler(OCRFailureError)
async def ocr_failure_handler(request: Request, exc: OCRFailureError):
    logger.error(f"OCR engine failure: {type(exc).__name__}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            request_id=_request_id(request),
            error="OCRFailure",
            detail="OCR processing failed. Please try again or contact support.",
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {type(exc).__name__}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            request_id=_request_id(request),
            error="InternalServerError",
            detail="An unexpected error occurred.",
        ).model_dump(),
    )


# ── Liveness / readiness probes (root-level, not versioned) ──────────────────

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    """Liveness probe — returns 200 as long as the process is alive."""
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
    )


@app.get("/ready", response_model=ReadyResponse, tags=["Health"])
async def ready(request: Request):
    """Readiness probe — returns 200 only after OCR engine is initialised."""
    is_ready = getattr(request.app.state, "ready", False)
    return JSONResponse(
        status_code=200 if is_ready else 503,
        content=ReadyResponse(ready=is_ready).model_dump(),
    )


# ── Application routes ────────────────────────────────────────────────────────

from app.api.routes import router  # noqa: E402
app.include_router(router, prefix=settings.API_PREFIX)
