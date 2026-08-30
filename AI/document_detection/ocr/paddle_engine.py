from __future__ import annotations
import os
os.environ['FLAGS_use_mkldnn'] = '0'

from document_detection.ocr.base import BaseOCREngine
from document_detection.ocr.models import OCRResult
from document_detection.ocr.normalizer import PaddleOCRResponseNormalizer
from core.exceptions import OCRFailureError
from core.logging import logger

class PaddleOCREngine(BaseOCREngine):
    """The only module that imports paddleocr directly.

    Runs PaddleOCR inference and delegates normalization to
    PaddleOCRResponseNormalizer. No field extraction here.
    Requirements: 2.2-2.6, 16.3, 16.4, 20.1
    """

    def __init__(self, language: str = "en", use_gpu: bool = False) -> None:
        try:
            import paddle
            paddle.set_flags({'FLAGS_use_mkldnn': False})
            from paddleocr import PaddleOCR  # noqa: PLC0415
            self._ocr = PaddleOCR(use_angle_cls=True, lang=language, use_gpu=use_gpu, show_log=False, enable_mkldnn=False)
        except Exception as exc:
            raise OCRFailureError(f"Failed to initialize PaddleOCR: {exc}") from exc
        self._normalizer = PaddleOCRResponseNormalizer()
        logger.info(f"PaddleOCREngine initialized: language={language} gpu={use_gpu}")

    def extract(self, image) -> OCRResult:
        """Run OCR inference. Never returns raw PaddleOCR output."""
        try:
            import numpy as np
            from PIL import Image
            if isinstance(image, Image.Image):
                # Convert PIL Image to BGR numpy array as PaddleOCR/OpenCV expects BGR
                image = np.array(image.convert("RGB"))[:, :, ::-1]
            raw = self._ocr.ocr(image, cls=True)
        except Exception as exc:
            raise OCRFailureError(f"PaddleOCR inference failed: {exc}") from exc
        return self._normalizer.normalize(raw)
