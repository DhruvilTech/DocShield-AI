from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import io
import pytest
from unittest.mock import MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.document import router
from core.config import settings


def make_jpeg_bytes() -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(0, 0, 0)).save(buf, format="JPEG")
    return buf.getvalue()


def make_mock_ocr_result():
    from document_detection.ocr.models import OCRResult
    return OCRResult(raw_text="TEST", regions=[], confidence=0.95, engine_used="paddleocr")


def make_mock_validation_result():
    from document_detection.validation.models import ValidationResult
    return ValidationResult(document_type="passport", valid=True, checks=[])


def make_client(ocr_service=None, validation_service=None):
    """Create a TestClient with services injected into app.state synchronously."""
    app = FastAPI()
    app.include_router(router)
    # Set state directly - no lifespan needed for unit tests
    app.state.ocr_service = ocr_service or MagicMock()
    app.state.validation_service = validation_service or MagicMock()
    return TestClient(app, raise_server_exceptions=False)


def test_valid_jpeg_passport_returns_200():
    ocr_svc = MagicMock()
    ocr_svc.extract.return_value = (make_mock_ocr_result(), {})
    val_svc = MagicMock()
    val_svc.validate.return_value = make_mock_validation_result()

    client = make_client(ocr_svc, val_svc)
    resp = client.post(
        "/screen-document",
        data={"document_type": "passport"},
        files={"file": ("test.jpg", make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["document_type"] == "passport"
    assert "ocr" in body
    assert "validation" in body


def test_unsupported_file_type_returns_415():
    client = make_client()
    resp = client.post(
        "/screen-document",
        data={"document_type": "passport"},
        files={"file": ("test.exe", b"not an image", "application/octet-stream")},
    )
    assert resp.status_code == 415


def test_invalid_document_type_returns_422():
    client = make_client()
    resp = client.post(
        "/screen-document",
        data={"document_type": "unicorn"},
        files={"file": ("test.jpg", make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 422


def test_file_exceeds_max_size_returns_400():
    big = b"x" * (settings.MAX_FILE_SIZE_MB * 1024 * 1024 + 1)
    client = make_client()
    resp = client.post(
        "/screen-document",
        data={"document_type": "passport"},
        files={"file": ("big.jpg", big, "image/jpeg")},
    )
    assert resp.status_code == 400


def test_ocr_failure_returns_500():
    from core.exceptions import OCRFailureError
    ocr_svc = MagicMock()
    ocr_svc.extract.side_effect = OCRFailureError("engine crash")
    client = make_client(ocr_svc)
    resp = client.post(
        "/screen-document",
        data={"document_type": "passport"},
        files={"file": ("test.jpg", make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 500


def test_error_response_does_not_echo_field_values():
    from core.exceptions import OCRFailureError
    ocr_svc = MagicMock()
    ocr_svc.extract.side_effect = OCRFailureError("engine crash")
    client = make_client(ocr_svc)
    resp = client.post(
        "/screen-document",
        data={"document_type": "passport"},
        files={"file": ("test.jpg", make_jpeg_bytes(), "image/jpeg")},
    )
    assert "A1234567" not in resp.text


def test_mask_identifier():
    from core.logging import mask_identifier
    assert mask_identifier("A1234567") == "A12****"
    assert mask_identifier("AB") == "****"
    assert mask_identifier("ABC") == "****"
    assert mask_identifier("ABCD") == "ABC****"

