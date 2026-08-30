from __future__ import annotations
from pydantic import BaseModel, field_validator, model_validator

class BoundingBox(BaseModel):
    points: list[list[float]]

    @field_validator("points")
    @classmethod
    def must_have_four_points(cls, v):
        if len(v) != 4:
            raise ValueError(f"BoundingBox requires exactly 4 points, got {len(v)}")
        return v

class TextRegion(BaseModel):
    text: str
    confidence: float | None = None
    bounding_box: BoundingBox | None = None

    @field_validator("confidence")
    @classmethod
    def confidence_in_range(cls, v):
        if v is not None and not (0.0 <= v <= 1.0):
            raise ValueError(f"confidence must be in [0.0, 1.0], got {v}")
        return v

class OCRResult(BaseModel):
    raw_text: str
    regions: list[TextRegion]
    confidence: float | None = None
    engine_used: str
    warnings: list[str] = []

    @field_validator("engine_used")
    @classmethod
    def engine_used_nonempty(cls, v):
        if not v:
            raise ValueError("engine_used must not be empty")
        return v

    @field_validator("confidence")
    @classmethod
    def confidence_in_range(cls, v):
        if v is not None and not (0.0 <= v <= 1.0):
            raise ValueError(f"confidence must be in [0.0, 1.0], got {v}")
        return v
