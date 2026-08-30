from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch
from document_detection.ocr.normalizer import PaddleOCRResponseNormalizer
from document_detection.ocr.models import OCRResult, TextRegion, BoundingBox
from core.exceptions import OCRFailureError

NORMALIZER = PaddleOCRResponseNormalizer()
BBOX = [[10,10],[100,10],[100,30],[10,30]]


def test_normalize_none_returns_empty_with_warning():
    result = NORMALIZER.normalize(None)
    assert isinstance(result, OCRResult)
    assert result.regions == []
    assert len(result.warnings) > 0
    assert result.engine_used == "paddleocr"


def test_normalize_empty_list_returns_empty_with_warning():
    result = NORMALIZER.normalize([])
    assert result.regions == []
    assert len(result.warnings) > 0


def test_normalize_valid_response_builds_regions():
    raw = [[[BBOX, ("JOHN DOE", 0.98)]]]
    result = NORMALIZER.normalize(raw)
    assert len(result.regions) == 1
    assert result.regions[0].text == "JOHN DOE"
    assert result.regions[0].confidence == pytest.approx(0.98)


def test_normalize_raw_text_is_newline_joined():
    raw = [[[BBOX, ("LINE1", 0.9)], [BBOX, ("LINE2", 0.9)]]]
    result = NORMALIZER.normalize(raw)
    assert result.raw_text == "LINE1\nLINE2"


def test_normalize_confidence_is_mean():
    raw = [[[BBOX, ("A", 0.8)], [BBOX, ("B", 0.6)]]]
    result = NORMALIZER.normalize(raw)
    assert result.confidence == pytest.approx(0.7)


def test_normalize_low_confidence_appends_warning():
    raw = [[[BBOX, ("X", 0.1)]]]
    result = NORMALIZER.normalize(raw)
    assert any("low" in w.lower() or "confidence" in w.lower() for w in result.warnings)


def test_normalize_engine_used_is_paddleocr():
    result = NORMALIZER.normalize(None)
    assert result.engine_used == "paddleocr"


def test_normalize_never_raises_for_none():
    result = NORMALIZER.normalize(None)
    assert isinstance(result, OCRResult)


def test_normalize_never_raises_for_empty_list():
    result = NORMALIZER.normalize([])
    assert isinstance(result, OCRResult)


def test_paddle_engine_wraps_exception_in_ocr_failure_error():
    with patch("app.ocr.paddle_engine.PaddleOCREngine.__init__", return_value=None):
        from document_detection.ocr.paddle_engine import PaddleOCREngine
        engine = PaddleOCREngine.__new__(PaddleOCREngine)
        mock_ocr = MagicMock()
        mock_ocr.ocr.side_effect = RuntimeError("paddle crash")
        engine._ocr = mock_ocr
        engine._normalizer = NORMALIZER
        with pytest.raises(OCRFailureError):
            from PIL import Image
            import numpy as np
            img = Image.fromarray(np.zeros((10, 10, 3), dtype="uint8"))
            engine.extract(img)

