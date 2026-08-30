from __future__ import annotations
from enum import Enum
from pydantic import BaseModel

class CheckStatus(str, Enum):
    VALID = "valid"
    INVALID = "invalid"
    MISSING = "missing"
    INCONSISTENT = "inconsistent"
    LOW_CONFIDENCE = "low_confidence"

class FieldCheck(BaseModel):
    field: str
    status: CheckStatus
    message: str
    confidence: float | None = None

class ValidationResult(BaseModel):
    document_type: str  # DocumentType value to avoid circular import
    valid: bool
    checks: list[FieldCheck]
    errors: list[str] = []
    warnings: list[str] = []
