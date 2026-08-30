from __future__ import annotations
import io
from PIL import Image
from document_detection.ocr.base import BaseOCREngine
from document_detection.ocr.extractor import BaseFieldExtractor, ExtractedField
from document_detection.ocr.models import OCRResult
from document_detection.schemas.document import DocumentType
from core.exceptions import InvalidImageError, UnsupportedDocumentTypeError
from core.logging import logger

class OCRService:
    """Orchestrates the full OCR pipeline.
    Requirements: 5.1-5.5
    """

    def __init__(
        self,
        engine: BaseOCREngine,
        extractor_registry: dict[DocumentType, BaseFieldExtractor],
        preprocessor=None,
    ) -> None:
        self.engine = engine
        self.extractor_registry = extractor_registry
        self.preprocessor = preprocessor

    def extract(
        self, image_bytes: bytes, document_type: DocumentType
    ) -> tuple[OCRResult, dict[str, ExtractedField]]:
        """Run OCR pipeline: preprocess -> engine -> extractor."""
        # Open image / PDF
        try:
            if image_bytes.startswith(b'%PDF'):
                import pypdfium2 as pdfium
                pdf = pdfium.PdfDocument(image_bytes)
                if len(pdf) == 0:
                    raise ValueError("PDF document contains no pages.")
                page = pdf[0]
                bitmap = page.render(scale=2.0)
                image = bitmap.to_pil()
            else:
                image = Image.open(io.BytesIO(image_bytes))
                image.load()
        except Exception as exc:
            raise InvalidImageError(f"Cannot decode image or render PDF: {exc}") from exc

        # Optional preprocessing
        if self.preprocessor is not None:
            try:
                from core.config import settings
                if settings.ENABLE_PREPROCESSING:
                    image = self.preprocessor.preprocess(image)
            except Exception:
                pass

        # Look up extractor
        extractor = self.extractor_registry.get(document_type)
        if extractor is None:
            raise UnsupportedDocumentTypeError(
                f"No extractor registered for document type: {document_type}"
            )

        # Run OCR
        ocr_result = self.engine.extract(image)
        logger.info(f"OCR complete: engine={ocr_result.engine_used} regions={len(ocr_result.regions)}")

        # Extract fields
        fields = extractor.extract(ocr_result)
        if fields is None:
            fields = {}

        return ocr_result, fields
