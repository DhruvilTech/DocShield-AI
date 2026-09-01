"""Visa validation tests - independent of OCR.
Requirements: 12.1-12.8
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from document_detection.ocr.extractor import ExtractedField
from document_detection.validation.visa import VisaValidator
from document_detection.validation.models import CheckStatus
from document_detection.validation.rules import RuleSet

def make_rules():
    return RuleSet(
        required_fields=["visa_number", "visa_type", "entry_validation", "stay_duration"],
        patterns={"visa_number": r"^[A-Z0-9]{4,12}$"},
        date_rules={},
    )

def f(name: str, value: str | None) -> ExtractedField:
    return ExtractedField(name=name, value=value, confidence=0.95)

def valid_fields():
    return {
        "visa_number": f("visa_number", "VISA1234"),
        "visa_type": f("visa_type", "Tourist"),
        "entry_validation": f("entry_validation", "single"),
        "stay_duration": f("stay_duration", "30 days"),
    }

validator = VisaValidator()
rules = make_rules()

def test_all_valid_returns_true():
    result = validator.validate(valid_fields(), rules)
    assert result.valid is True
    assert result.document_type == "visa"

def test_missing_visa_number():
    fields = valid_fields()
    del fields["visa_number"]
    result = validator.validate(fields, rules)
    assert result.valid is False

def test_invalid_visa_number_format():
    fields = valid_fields()
    fields["visa_number"] = f("visa_number", "!!")
    result = validator.validate(fields, rules)
    assert result.valid is False

def test_unknown_visa_type():
    fields = valid_fields()
    fields["visa_type"] = f("visa_type", "UNKNOWN_TYPE")
    result = validator.validate(fields, rules)
    assert result.valid is False

def test_invalid_entry_validation():
    fields = valid_fields()
    fields["entry_validation"] = f("entry_validation", "triple")
    result = validator.validate(fields, rules)
    assert result.valid is False

def test_invalid_stay_duration():
    fields = valid_fields()
    fields["stay_duration"] = f("stay_duration", "forever")
    result = validator.validate(fields, rules)
    assert result.valid is False

def test_empty_fields_all_missing():
    result = validator.validate({}, rules)
    assert result.valid is False

def test_valid_mrv_a_visa_mrz():
    fields = valid_fields()
    l1 = "V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    l2 = "12345678<8USA8501019M30010191234567890123456"
    fields["mrz_lines"] = f("mrz_lines", f"{l1}\n{l2}")
    fields["visa_number"] = f("visa_number", "12345678")
    fields["visual_visa_number"] = f("visual_visa_number", "12345678")
    fields["date_of_birth"] = f("date_of_birth", "850101")
    fields["visual_date_of_birth"] = f("visual_date_of_birth", "01/01/1985")
    fields["date_of_expiry"] = f("date_of_expiry", "300101")
    fields["visual_date_of_expiry"] = f("visual_date_of_expiry", "01/01/2030")
    fields["gender"] = f("gender", "M")
    fields["visual_gender"] = f("visual_gender", "M")
    fields["name"] = f("name", "DOE JOHN")
    fields["visual_name"] = f("visual_name", "JOHN DOE")

    result = validator.validate(fields, rules)
    assert result.valid is True
    assert any(c.field == "mrz_lines" and c.status == CheckStatus.VALID for c in result.checks)

def test_valid_mrv_b_visa_mrz():
    fields = valid_fields()
    l1 = "V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<"
    l2 = "12345678<8USA8501019M3001019<<<<<<<<"
    fields["mrz_lines"] = f("mrz_lines", f"{l1}\n{l2}")
    fields["visa_number"] = f("visa_number", "12345678")
    fields["visual_visa_number"] = f("visual_visa_number", "12345678")

    result = validator.validate(fields, rules)
    assert result.valid is True
    assert any(c.field == "mrz_lines" and c.status == CheckStatus.VALID for c in result.checks)

def test_tampered_visa_mrz_checksum():
    fields = valid_fields()
    l1 = "V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    # Tampered doc check digit: '5' instead of '8'
    l2 = "12345678<5USA8501019M30010191234567890123456"
    fields["mrz_lines"] = f("mrz_lines", f"{l1}\n{l2}")
    fields["visa_number"] = f("visa_number", "12345678")

    result = validator.validate(fields, rules)
    assert result.valid is False
    mrz_check = next((c for c in result.checks if c.field == "mrz_lines"), None)
    assert mrz_check is not None
    assert mrz_check.status == CheckStatus.INVALID
    assert "Doc# valid=False" in mrz_check.message

def test_visual_vs_mrz_visa_number_mismatch():
    fields = valid_fields()
    l1 = "V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    l2 = "12345678<8USA8501019M30010191234567890123456"
    fields["mrz_lines"] = f("mrz_lines", f"{l1}\n{l2}")
    fields["visa_number"] = f("visa_number", "12345678")
    fields["visual_visa_number"] = f("visual_visa_number", "99999999")

    result = validator.validate(fields, rules)
    assert result.valid is False
    assert any(c.field == "visa_number" and c.status == CheckStatus.INVALID and "Mismatched" in c.message for c in result.checks)

