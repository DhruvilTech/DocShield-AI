"""
DocShield AI Engine — SINGLE unified FastAPI application entry point.

Startup sequence:
  1. PaddleOCR engine is initialised once (warm-up happens here, not on first request).
  2. Extractor registry, OCR service, validator registry, and validation service
     are built and stored in app.state so route handlers can access them.
  3. CORS and RequestIdMiddleware are added.
  4. Global exception handlers translate domain exceptions to typed JSON errors.
  5. /health and /ready probes are mounted at root level (not versioned) so
     orchestrators (Kubernetes, docker-compose) can reach them without auth.
  6. All application routes are mounted under versioned prefixes:
       - /api/v1/document  (Document Detection)
       - /api/v1/face      (Face Verification)
       - /api/v1/tampering (Image Tampering)

Run with:
    cd AI
    uvicorn app:app --reload --host 0.0.0.0 --port 8000
"""
from __future__ import annotations
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.schemas import ErrorResponse, HealthResponse, ReadyResponse
from core.logging import logger
from core.middleware import RequestIdMiddleware
from core.exceptions import (
    InvalidImageError,
    OCRFailureError,
    UnsupportedDocumentTypeError,
    UnsupportedFileTypeError,
    ForensicAnalysisError,
)
from core.config import settings

# Import routers
from api.document import router as document_router
from api.face import router as face_router
from api.tampering import router as tampering_router


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise all heavy resources once at startup; clean up on shutdown."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION} [{settings.APP_ENV}]")

    # ── Document Detection services ───────────────────────────────────────────
    from document_detection.ocr.paddle_engine import PaddleOCREngine
    from document_detection.ocr.extractor import (
        BaseFieldExtractor,
        DrivingLicenseFieldExtractor,
        NationalIDFieldExtractor,
        PassportFieldExtractor,
        PermitFieldExtractor,
        VisaFieldExtractor,
    )
    from document_detection.ocr.service import OCRService
    from document_detection.preprocessing.image import ImagePreprocessor
    from document_detection.schemas.document import DocumentType
    from document_detection.validation.driving_license import DrivingLicenseValidator
    from document_detection.validation.national_id import NationalIdValidator
    from document_detection.validation.passport import PassportValidator
    from document_detection.validation.permit import PermitValidator
    from document_detection.validation.rules import RuleSetLoader
    from document_detection.validation.service import ValidationService, ValidatorRegistry
    from document_detection.validation.visa import VisaValidator

    # OCR engine — PaddleOCR downloads model weights on first run
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


# ── Application ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="DocShield AI Engine",
    version=settings.APP_VERSION,
    description=(
        "Unified AI-powered document screening, face verification, and "
        "image tampering detection API. Accepts document images, runs OCR, "
        "extracts fields, validates them, verifies biometric identity, and "
        "performs forensic tampering analysis."
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


@app.exception_handler(ForensicAnalysisError)
async def forensic_failure_handler(request: Request, exc: ForensicAnalysisError):
    logger.error(f"Forensic analysis failure: {type(exc).__name__}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            request_id=_request_id(request),
            error="ForensicAnalysisFailure",
            detail=exc.message,
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
    """Readiness probe — returns 200 only after all services are initialised."""
    is_ready = getattr(request.app.state, "ready", False)
    return JSONResponse(
        status_code=200 if is_ready else 503,
        content=ReadyResponse(ready=is_ready).model_dump(),
    )


# ── Mount API routers ─────────────────────────────────────────────────────────

app.include_router(
    document_router,
    prefix="/api/v1/document",
    tags=["Document Detection"],
)

app.include_router(
    face_router,
    prefix="/api/v1/face",
    tags=["Face Verification"],
)

app.include_router(
    tampering_router,
    prefix="/api/v1/tampering",
    tags=["Image Tampering"],
)
