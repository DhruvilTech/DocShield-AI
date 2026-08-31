from __future__ import annotations
import os
os.environ['FLAGS_use_mkldnn'] = '0'
os.environ['FLAGS_enable_pir_api'] = '0'
os.environ['FLAGS_enable_pir_in_executor'] = '0'

from document_detection.ocr.base import BaseOCREngine
from document_detection.ocr.models import OCRResult
from document_detection.ocr.normalizer import PaddleOCRResponseNormalizer
from core.exceptions import OCRFailureError
from core.logging import logger

class PaddleOCREngine(BaseOCREngine):
    """OCR engine supporting PaddleOCR and RapidOCR (ONNX runtime) as a portable fallback.

    Runs OCR inference and delegates normalization to
    PaddleOCRResponseNormalizer.
    """

    def __init__(self, language: str = "en", use_gpu: bool = False) -> None:
        self._use_rapid = False
        try:
            # Pre-import torch to avoid Windows DLL symbol clash with Paddle
            try:
                import torch  # noqa: F401
            except Exception:
                pass
            import paddle
            paddle.set_flags({'FLAGS_use_mkldnn': False})
            from paddleocr import PaddleOCR
            try:
                self._ocr = PaddleOCR(use_angle_cls=True, lang=language, use_gpu=use_gpu, show_log=False, enable_mkldnn=False)
            except (TypeError, ValueError):
                # PaddleOCR 3.x compatibility
                self._ocr = PaddleOCR(lang=language, enable_mkldnn=False)
            logger.info(f"PaddleOCREngine initialized with PaddleOCR: language={language} gpu={use_gpu}")
        except Exception as exc:
            logger.warning(f"PaddleOCR not available ({exc}), attempting fallback to RapidOCR (ONNX)...")
            try:
                from rapidocr_onnxruntime import RapidOCR
                self._ocr = RapidOCR()
                self._use_rapid = True
                logger.info("PaddleOCREngine initialized with RapidOCR (ONNX runtime)")
            except Exception as inner_exc:
                raise OCRFailureError(f"Failed to initialize OCR engine (PaddleOCR and RapidOCR failed): {inner_exc}") from inner_exc

        self._normalizer = PaddleOCRResponseNormalizer()

    def extract(self, image) -> OCRResult:
        """Run OCR inference. Never returns raw OCR output."""
        try:
            import numpy as np
            from PIL import Image
            if isinstance(image, Image.Image):
                # Convert PIL Image to BGR numpy array
                image = np.array(image.convert("RGB"))[:, :, ::-1]
            elif isinstance(image, np.ndarray) and len(image.shape) == 2:
                import cv2
                image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

            if getattr(self, "_use_rapid", False):
                res, _ = self._ocr(image)
                if res:
                    raw = [[[item[0], (item[1], float(item[2]))] for item in res]]
                else:
                    raw = []
            else:
                try:
                    raw = self._ocr.ocr(image, cls=True)
                except TypeError:
                    raw = self._ocr.ocr(image)
        except Exception as exc:
            raise OCRFailureError(f"OCR inference failed: {exc}") from exc
        return self._normalizer.normalize(raw)
