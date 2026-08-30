from __future__ import annotations
from abc import ABC, abstractmethod
from document_detection.ocr.extractor import ExtractedField
from document_detection.validation.models import ValidationResult
from document_detection.validation.rules import RuleSet

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
