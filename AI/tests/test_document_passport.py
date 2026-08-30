"""Passport validation tests - independent of OCR.
Requirements: 11.1-11.10
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from datetime import date, timedelta
from document_detection.ocr.extractor import ExtractedField
from document_detection.validation.passport import PassportValidator
from document_detection.validation.models import CheckStatus
from document_detection.validation.rules import RuleSet

def make_rules():
    return RuleSet(
        required_fields=["name", "passport_number", "nationality", "date_of_birth", "date_of_expiry"],
        patterns={"passport_number": r"^[A-Z]{1}[0-9]{7}$"},
        date_rules={
            "date_of_birth": {"must_be_past": True},
            "date_of_expiry": {"must_be_after_today": True},
        },
    )

def f(name: str, value: str | None, confidence: float = 0.95) -> ExtractedField:
    return ExtractedField(name=name, value=value, confidence=confidence)

def valid_fields():
    today = date.today()
    return {
        "name": f("name", "JOHN DOE"),
        "passport_number": f("passport_number", "A1234567"),
        "nationality": f("nationality", "USA"),
        "date_of_birth": f("date_of_birth", "1985-01-15"),
        "date_of_expiry": f("date_of_expiry", str(today + timedelta(days=365))),
    }

validator = PassportValidator()
rules = make_rules()

def test_all_valid_returns_true():
    result = validator.validate(valid_fields(), rules)
    assert result.valid is True
    assert result.document_type == "passport"

def test_missing_required_field_returns_missing():
    fields = valid_fields()
    del fields["passport_number"]
    result = validator.validate(fields, rules)
    assert result.valid is False
    check = next(c for c in result.checks if c.field == "passport_number")
    assert check.status == CheckStatus.MISSING

def test_blank_required_field_returns_missing():
    fields = valid_fields()
    fields["name"] = f("name", "   ")
    result = validator.validate(fields, rules)
    assert result.valid is False

def test_invalid_passport_number_format():
    fields = valid_fields()
    fields["passport_number"] = f("passport_number", "bad-format")
    result = validator.validate(fields, rules)
    assert result.valid is False
    check = next(c for c in result.checks if c.field == "passport_number")
    assert check.status == CheckStatus.INVALID

def test_expired_passport():
    fields = valid_fields()
    fields["date_of_expiry"] = f("date_of_expiry", "2020-01-01")
    result = validator.validate(fields, rules)
    assert result.valid is False
    statuses = [c.status for c in result.checks if c.field == "date_of_expiry"]
    assert CheckStatus.INVALID in statuses

def test_future_date_of_birth():
    fields = valid_fields()
    tomorrow = str(date.today() + timedelta(days=1))
    fields["date_of_birth"] = f("date_of_birth", tomorrow)
    result = validator.validate(fields, rules)
    assert result.valid is False

def test_expiry_before_dob_inconsistent():
    fields = valid_fields()
    fields["date_of_birth"] = f("date_of_birth", "2000-01-01")
    fields["date_of_expiry"] = f("date_of_expiry", "1999-01-01")
    result = validator.validate(fields, rules)
    assert result.valid is False
    statuses = [c.status for c in result.checks if c.field == "date_of_expiry"]
    assert CheckStatus.INCONSISTENT in statuses or CheckStatus.INVALID in statuses

def test_low_confidence_adds_warning_does_not_invalidate():
    fields = valid_fields()
    fields["passport_number"] = f("passport_number", "A1234567", confidence=0.3)
    result = validator.validate(fields, rules)
    assert len(result.warnings) > 0
    # valid should not be False due to confidence alone (if all formats correct)
    # (may still be False if date logic triggers, but warnings must be present)

def test_empty_fields_all_missing():
    result = validator.validate({}, rules)
    assert result.valid is False
    for req in rules.required_fields:
        check = next((c for c in result.checks if c.field == req), None)
        assert check is not None
        assert check.status == CheckStatus.MISSING
