from __future__ import annotations
from abc import ABC, abstractmethod
from document_detection.ocr.models import OCRResult

class BaseOCREngine(ABC):
    """Abstract OCR engine interface.

    All OCR consumers depend on this interface, never on PaddleOCR directly.
    Requirements: 2.1
    """

    @abstractmethod
    def extract(self, image) -> OCRResult:
        """Run OCR on an image.

        Args:
            image: PIL.Image or numpy array.

        Returns:
            OCRResult - standardized result; NEVER raw engine output.

        Raises:
            OCRFailureError: if the OCR engine fails.
            InvalidImageError: if the image format is unsupported.
        """
