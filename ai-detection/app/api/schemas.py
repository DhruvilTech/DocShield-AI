"""
Pydantic response schemas for the DocShield AI API.

These models define the exact JSON shape returned by every endpoint,
enabling type-safe client code generation (OpenAPI / TypeScript / etc.).
"""
from __future__ import annotations
from pydantic import BaseModel, Field


# ── Sub-models ────────────────────────────────────────────────────────────────

class BoundingBoxSchema(BaseModel):
    points: list[list[float]]


class OCRRegionSchema(BaseModel):
    text: str
    confidence: float | None = None
    bounding_box: BoundingBoxSchema | None = None


class OCRSchema(BaseModel):
    raw_text: str
    regions: list[OCRRegionSchema]
    confidence: float | None = None
    engine_used: str
    warnings: list[str] = []


class ExtractedFieldSchema(BaseModel):
    name: str
    value: str | None = None
    confidence: float | None = None
    source_text: str | None = None


class FieldCheckSchema(BaseModel):
    field: str
    status: str          # CheckStatus value
    message: str
    confidence: float | None = None


class ValidationSchema(BaseModel):
    document_type: str
    valid: bool
    checks: list[FieldCheckSchema]
    errors: list[str] = []
    warnings: list[str] = []


# ── Top-level response models ─────────────────────────────────────────────────

class ScreeningResponse(BaseModel):
    """Returned by POST /screen-document."""
    request_id: str = Field(description="UUID correlating this request across logs")
    document_type: str
    ocr: OCRSchema
    extracted_fields: dict[str, ExtractedFieldSchema]
    validation: ValidationSchema


class DocumentTypesResponse(BaseModel):
    """Returned by GET /document-types."""
    document_types: list[str]


class HealthResponse(BaseModel):
    """Returned by GET /health."""
    status: str
    version: str
    environment: str


class ReadyResponse(BaseModel):
    """Returned by GET /ready — indicates OCR engine is loaded."""
    ready: bool


class ErrorResponse(BaseModel):
    """Returned on all API errors."""
    request_id: str
    error: str
    detail: str | None = None
