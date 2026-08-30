from __future__ import annotations
from document_detection.ocr.extractor import ExtractedField
from document_detection.schemas.document import DocumentType
from document_detection.validation.base import BaseDocumentValidator
from document_detection.validation.models import ValidationResult
from document_detection.validation.rules import RuleSet, RuleSetLoader
from core.exceptions import UnsupportedDocumentTypeError
from core.logging import logger

class ValidatorRegistry:
    """Registry mapping DocumentType to BaseDocumentValidator.
    No if/elif chains anywhere. Requirements: 14.1, 20.4
    """

    def __init__(self) -> None:
        self._registry: dict[DocumentType, BaseDocumentValidator] = {}

    def register(self, document_type: DocumentType, validator: BaseDocumentValidator) -> None:
        self._registry[document_type] = validator

    def get(self, document_type: DocumentType) -> BaseDocumentValidator:
        validator = self._registry.get(document_type)
        if validator is None:
            raise UnsupportedDocumentTypeError(
                f"No validator registered for document type: {document_type}"
            )
        return validator

class ValidationService:
    """Orchestrates validation via registry dispatch.
    Requirements: 14.1-14.4
    """

    def __init__(
        self,
        registry: ValidatorRegistry,
        rule_loader: RuleSetLoader,
    ) -> None:
        self.registry = registry
        self.rule_loader = rule_loader

    def validate(
        self,
        fields: dict[str, ExtractedField],
        document_type: DocumentType,
    ) -> ValidationResult:
        validator = self.registry.get(document_type)  # raises UnsupportedDocumentTypeError
        rules = self.rule_loader.load(document_type)
        try:
            result = validator.validate(fields, rules)
        except UnsupportedDocumentTypeError:
            raise
        except Exception as exc:
            logger.error(f"Validation failure for document_type={document_type}: {type(exc).__name__}")
            return ValidationResult(
                document_type=document_type.value,
                valid=False,
                checks=[],
                errors=[f"Internal validation error: {type(exc).__name__}"],
            )
        return result
