from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from document_detection.ocr.models import OCRResult, TextRegion
from document_detection.ocr.extractor import (
    PassportFieldExtractor, VisaFieldExtractor,
    NationalIDFieldExtractor, DrivingLicenseFieldExtractor, PermitFieldExtractor,
    PASSPORT_FIELDS, VISA_FIELDS,
)


def make_ocr(texts: list, confidence: float = 0.95) -> OCRResult:
    regions = [TextRegion(text=t, confidence=confidence) for t in texts]
    return OCRResult(
        raw_text=chr(10).join(texts),
        regions=regions,
        confidence=confidence,
        engine_used="paddleocr",
    )


def test_passport_extractor_returns_all_six_keys():
    ocr = make_ocr(["SURNAME: DOE", "PASSPORT NO: A1234567", "NATIONALITY: USA",
                     "DOB: 15 JAN 1985", "EXPIRY: 20 MAR 2030", "SEX: M"])
    fields = PassportFieldExtractor().extract(ocr)
    for key in PASSPORT_FIELDS:
        assert key in fields, f"Missing key: {key}"


def test_passport_extractor_extracts_passport_number():
    ocr = make_ocr(["PASSPORT NO: A1234567"])
    fields = PassportFieldExtractor().extract(ocr)
    assert fields["passport_number"].value == "A1234567"


def test_passport_extractor_extracts_gender():
    ocr = make_ocr(["SEX: M"])
    fields = PassportFieldExtractor().extract(ocr)
    assert fields["gender"].value == "M"


def test_passport_extractor_returns_none_for_missing_fields():
    ocr = make_ocr(["SOME RANDOM TEXT"])
    fields = PassportFieldExtractor().extract(ocr)
    for key in PASSPORT_FIELDS:
        assert key in fields


def test_passport_extractor_does_not_mutate_ocr_result():
    ocr = make_ocr(["A1234567"])
    original_text = ocr.raw_text
    original_count = len(ocr.regions)
    PassportFieldExtractor().extract(ocr)
    assert ocr.raw_text == original_text
    assert len(ocr.regions) == original_count


def test_passport_extractor_empty_ocr():
    ocr = OCRResult(raw_text="", regions=[], confidence=None, engine_used="paddleocr")
    fields = PassportFieldExtractor().extract(ocr)
    for key in PASSPORT_FIELDS:
        assert key in fields
        assert fields[key].value is None


def test_visa_extractor_returns_all_four_keys():
    ocr = make_ocr(["VISA NUMBER: V1234567", "VISA TYPE: Tourist",
                     "ENTRY: single", "DURATION: 30 days"])
    fields = VisaFieldExtractor().extract(ocr)
    for key in VISA_FIELDS:
        assert key in fields


def test_visa_extractor_empty_ocr():
    ocr = OCRResult(raw_text="", regions=[], confidence=None, engine_used="paddleocr")
    fields = VisaFieldExtractor().extract(ocr)
    for key in VISA_FIELDS:
        assert key in fields
        assert fields[key].value is None


def test_national_id_stub_returns_empty_dict():
    ocr = OCRResult(raw_text="anything", regions=[], confidence=None, engine_used="paddleocr")
    assert NationalIDFieldExtractor().extract(ocr) == {}


def test_driving_license_stub_returns_empty_dict():
    ocr = OCRResult(raw_text="anything", regions=[], confidence=None, engine_used="paddleocr")
    assert DrivingLicenseFieldExtractor().extract(ocr) == {}


def test_permit_stub_returns_empty_dict():
    ocr = OCRResult(raw_text="anything", regions=[], confidence=None, engine_used="paddleocr")
    assert PermitFieldExtractor().extract(ocr) == {}

