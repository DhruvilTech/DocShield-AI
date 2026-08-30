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
