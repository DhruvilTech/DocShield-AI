"""
DocShield AI Engine — Document Detection API routes.

Mounted under /api/v1/document by the main application.
Handles document upload, OCR processing, field extraction, and validation.
"""
from __future__ import annotations

from fastapi import APIRouter, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from api.schemas import (
    DocumentTypesResponse,
    ErrorResponse,
    ExtractedFieldSchema,
    FieldCheckSchema,
    OCRRegionSchema,
    OCRSchema,
    ScreeningResponse,
    ValidationSchema,
)
from core.exceptions import (
    InvalidImageError,
    OCRFailureError,
    UnsupportedDocumentTypeError,
)
from core.logging import logger
from core.config import settings
from document_detection.schemas.document import DocumentType

router = APIRouter(tags=["Document Detection"])


def _request_id(request: Request) -> str:
    """Extract the request ID attached by RequestIdMiddleware."""
    return getattr(request.state, "request_id", "unknown")


# ── GET /document-types ───────────────────────────────────────────────────────

@router.get(
    "/document-types",
    response_model=DocumentTypesResponse,
    summary="List supported document types",
)
async def list_document_types():
    """Return all document types accepted by the /screen-document endpoint."""
    return DocumentTypesResponse(
        document_types=[dt.value for dt in DocumentType]
    )


# ── POST /screen-document ─────────────────────────────────────────────────────

@router.post(
    "/screen-document",
    response_model=ScreeningResponse,
    summary="Screen an Indian government document",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid image or file too large"},
        415: {"model": ErrorResponse, "description": "Unsupported file type"},
        422: {"model": ErrorResponse, "description": "Unsupported document type"},
        500: {"model": ErrorResponse, "description": "OCR engine failure"},
    },
)
async def screen_document(
    request: Request,
    file: UploadFile,
    document_type: DocumentType = Form(...),
):
    """
    Accept a document image and return a structured screening result.

    - **file**: JPEG / PNG / TIFF / PDF upload
    - **document_type**: one of `passport`, `visa`, `national_id`,
      `driving_license`, `permit`

    Returns OCR output, extracted fields, and field-level validation results.
    """
    rid = _request_id(request)

    # ── 1. MIME type check ────────────────────────────────────────────────────
    if file.content_type not in settings.SUPPORTED_FILE_TYPES:
        return JSONResponse(
            status_code=415,
            content=ErrorResponse(
                request_id=rid,
                error="UnsupportedFileType",
                detail=f"'{file.content_type}' is not supported. "
                       f"Accepted types: {', '.join(settings.SUPPORTED_FILE_TYPES)}",
            ).model_dump(),
        )

    # ── 2. File size check ────────────────────────────────────────────────────
    image_bytes = await file.read()
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if len(image_bytes) > max_bytes:
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(
                request_id=rid,
                error="FileTooLarge",
                detail=f"File size {len(image_bytes) / 1_048_576:.1f} MB exceeds "
                       f"the {settings.MAX_FILE_SIZE_MB} MB limit.",
            ).model_dump(),
        )

    # Save to single AI/upload folder for local data security
    try:
        import os
        ai_upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "upload"))
        os.makedirs(ai_upload_dir, exist_ok=True)
        if file.filename:
            save_path = os.path.join(ai_upload_dir, file.filename)
            with open(save_path, "wb") as f_out:
                f_out.write(image_bytes)
    except Exception as e:
        logger.warning(f"Could not save document to AI/upload: {e}")

    ocr_service = request.app.state.ocr_service
    validation_service = request.app.state.validation_service

    # ── 3. OCR + field extraction ─────────────────────────────────────────────
    try:
        ocr_result, extracted_fields = ocr_service.extract(image_bytes, document_type)
    except InvalidImageError as exc:
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(request_id=rid, error="InvalidImage", detail=str(exc)).model_dump(),
        )
    except UnsupportedDocumentTypeError as exc:
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(request_id=rid, error="UnsupportedDocumentType", detail=str(exc)).model_dump(),
        )
    except OCRFailureError:
        logger.error(f"OCR failure: document_type={document_type.value}")
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                request_id=rid,
                error="OCRFailure",
                detail="OCR processing failed. Please try again.",
            ).model_dump(),
        )

    # ── 4. Validation ─────────────────────────────────────────────────────────
    try:
        validation_result = validation_service.validate(extracted_fields, document_type)
    except UnsupportedDocumentTypeError as exc:
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(request_id=rid, error="UnsupportedDocumentType", detail=str(exc)).model_dump(),
        )

    logger.info(
        f"Screening complete: document_type={document_type.value} "
        f"valid={validation_result.valid} request_id={rid}"
    )

    # ── 5. Build typed response ───────────────────────────────────────────────
    return ScreeningResponse(
        request_id=rid,
        document_type=document_type.value,
        ocr=OCRSchema(
            raw_text=ocr_result.raw_text,
            regions=[
                OCRRegionSchema(
                    text=r.text,
                    confidence=r.confidence,
                    bounding_box=r.bounding_box.model_dump() if r.bounding_box else None,
                )
                for r in ocr_result.regions
            ],
            confidence=ocr_result.confidence,
            engine_used=ocr_result.engine_used,
            warnings=ocr_result.warnings,
        ),
        extracted_fields={
            k: ExtractedFieldSchema(
                name=v.name,
                value=v.value,
                confidence=v.confidence,
                source_text=v.source_text,
            )
            for k, v in extracted_fields.items()
        },
        validation=ValidationSchema(
            document_type=validation_result.document_type,
            valid=validation_result.valid,
            checks=[
                FieldCheckSchema(
                    field=c.field,
                    status=c.status.value,
                    message=c.message,
                    confidence=c.confidence,
                )
                for c in validation_result.checks
            ],
            errors=validation_result.errors,
            warnings=validation_result.warnings,
        ),
    )
