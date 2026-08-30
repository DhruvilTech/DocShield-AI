from __future__ import annotations
from document_detection.ocr.models import BoundingBox, OCRResult, TextRegion
from core.config import settings


class PaddleOCRResponseNormalizer:
    """Converts raw PaddleOCR output to OCRResult.
    The only module that understands PaddleOCR raw response structure.
    Requirements: 3.1-3.8, 20.2
    """

    ENGINE_NAME = "paddleocr"

    def normalize(self, raw_response) -> OCRResult:
        """Parse PaddleOCR output. Never raises for None or list input.

        PaddleOCR format:
            [ [ [[[x1,y1],[x2,y2],[x3,y3],[x4,y4]], (text, confidence)] ], ... ]
        """
        if not raw_response:
            return OCRResult(
                raw_text="",
                regions=[],
                confidence=None,
                engine_used=self.ENGINE_NAME,
                warnings=["Empty OCR response - document may be blank or unreadable"],
            )

        regions: list[TextRegion] = []
        confidences: list[float] = []

        for page_result in raw_response:
            if not page_result:
                continue
            for detection in page_result:
                try:
                    bbox_points, text_conf = detection
                    if isinstance(text_conf, (list, tuple)):
                        text, conf = text_conf[0], text_conf[1]
                    else:
                        text, conf = str(text_conf), None

                    bbox = None
                    if isinstance(bbox_points, (list, tuple)) and len(bbox_points) == 4:
                        bbox = BoundingBox(
                            points=[[float(c) for c in p] for p in bbox_points]
                        )

                    conf_float = float(conf) if conf is not None else None
                    if conf_float is not None:
                        conf_float = max(0.0, min(1.0, conf_float))
                        confidences.append(conf_float)

                    regions.append(TextRegion(
                        text=str(text),
                        confidence=conf_float,
                        bounding_box=bbox,
                    ))
                except Exception:
                    continue

        raw_text = "\n".join(r.text for r in regions)
        mean_conf = (sum(confidences) / len(confidences)) if confidences else None

        warnings: list[str] = []
        if not regions:
            warnings.append("Empty OCR response - document may be blank or unreadable")
        elif mean_conf is not None and mean_conf < settings.OCR_CONFIDENCE_THRESHOLD:
            warnings.append(
                f"Low overall OCR confidence: {mean_conf:.2f} "
                f"(threshold: {settings.OCR_CONFIDENCE_THRESHOLD})"
            )

        return OCRResult(
            raw_text=raw_text,
            regions=regions,
            confidence=mean_conf,
            engine_used=self.ENGINE_NAME,
            warnings=warnings,
        )
