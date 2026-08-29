from __future__ import annotations
from abc import ABC, abstractmethod
from app.ocr.extractor import ExtractedField
from app.validation.models import ValidationResult
from app.validation.rules import RuleSet

class BaseDocumentValidator(ABC):
    """Abstract contract for all document validators.
    Requirements: 14.1
    """

    @abstractmethod
    def validate(
        self,
        fields: dict[str, ExtractedField],
        rules: RuleSet,
    ) -> ValidationResult:
        pass
