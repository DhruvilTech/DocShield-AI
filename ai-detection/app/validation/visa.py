from __future__ import annotations
import re
from app.ocr.extractor import ExtractedField
from app.validation.base import BaseDocumentValidator
from app.validation.models import CheckStatus, FieldCheck, ValidationResult
from app.validation.rules import RuleSet
from app.common.logging import logger

# Indian MHA visa categories (per Bureau of Immigration)
_VALID_VISA_TYPES = {
    "tourist", "business", "student", "employment", "medical",
    "conference", "transit", "journalist", "project", "research",
    "entry", "x-misc",
}
_VALID_ENTRY = {"single", "double", "multiple"}
# Non-zero quantity (starts 1-9) + optional space + unit word
_STAY_RE = re.compile(
    r"^(?:[1-9]|[1-9][0-9]{1,3})\s*(?:day|days|month|months|year|years)$",
    re.IGNORECASE,
)

class VisaValidator(BaseDocumentValidator):
    """Validates extracted visa fields.
    Requirements: 12.1-12.8
    """

    def validate(
        self, fields: dict[str, ExtractedField], rules: RuleSet
    ) -> ValidationResult:
        checks: list[FieldCheck] = []

        for field_name in rules.required_fields:
            f = fields.get(field_name)
            if f is None or f.value is None or not f.value.strip():
                checks.append(FieldCheck(
                    field=field_name,
                    status=CheckStatus.MISSING,
                    message=f"Required field '{field_name}' is missing",
                ))
            else:
                checks.append(FieldCheck(
                    field=field_name,
                    status=CheckStatus.VALID,
                    message=f"Field '{field_name}' is present",
                    confidence=f.confidence,
                ))

        # visa_number — sticker visa (8-digit numeric) or e-Visa ETA (8-12 alphanumeric)
        vn = fields.get("visa_number")
        if vn and vn.value:
            raw_vn = re.sub(r"\s", "", vn.value.strip().upper())
            # India BoI: sticker visa = 8 digits; e-Visa ETA = 8-12 alphanumeric
            pattern = rules.patterns.get(
                "visa_number",
                r"^(?:[A-Z0-9]{8,12}|\d{8})$",
            )
            if not re.fullmatch(pattern, raw_vn):
                checks = [
                    FieldCheck(
                        field="visa_number",
                        status=CheckStatus.INVALID,
                        message=(
                            f"Visa number '{vn.value.strip()}' is invalid. "
                            "Expected: 8-digit sticker visa (e.g. '12345678') "
                            "or 8-12 char e-Visa ETA (e.g. '9004FF17M')."
                        ),
                        confidence=vn.confidence,
                    ) if c.field == "visa_number" else c
                    for c in checks
                ]

        # visa_type — check against allowed values (case-insensitive)
        vt = fields.get("visa_type")
        if vt and vt.value:
            vt_norm = vt.value.strip().lower()
            # use pattern from rules if present, otherwise check the set
            vt_pattern = rules.patterns.get("visa_type")
            vt_invalid = (
                not re.fullmatch(vt_pattern, vt_norm, re.IGNORECASE)
                if vt_pattern
                else vt_norm not in _VALID_VISA_TYPES
            )
            if vt_invalid:
                checks = [
                    FieldCheck(
                        field="visa_type",
                        status=CheckStatus.INVALID,
                        message=(
                            f"Unknown visa type '{vt.value.strip()}'. "
                            f"Expected one of: {', '.join(sorted(_VALID_VISA_TYPES))}"
                        ),
                        confidence=vt.confidence,
                    ) if c.field == "visa_type" else c
                    for c in checks
                ]

        # entry_validation — single / multiple / double
        ev = fields.get("entry_validation")
        if ev and ev.value:
            ev_norm = ev.value.strip().lower()
            ev_pattern = rules.patterns.get("entry_validation")
            ev_invalid = (
                not re.fullmatch(ev_pattern, ev_norm, re.IGNORECASE)
                if ev_pattern
                else ev_norm not in _VALID_ENTRY
            )
            if ev_invalid:
                checks = [
                    FieldCheck(
                        field="entry_validation",
                        status=CheckStatus.INVALID,
                        message=(
                            f"entry_validation '{ev.value.strip()}' is invalid. "
                            f"Must be one of: {', '.join(sorted(_VALID_ENTRY))}"
                        ),
                        confidence=ev.confidence,
                    ) if c.field == "entry_validation" else c
                    for c in checks
                ]

        # stay_duration — non-zero positive integer + unit word
        sd = fields.get("stay_duration")
        if sd and sd.value:
            sd_norm = sd.value.strip()
            sd_pattern = rules.patterns.get("stay_duration")
            sd_invalid = (
                not re.fullmatch(sd_pattern, sd_norm, re.IGNORECASE)
                if sd_pattern
                else not _STAY_RE.fullmatch(sd_norm)
            )
            if sd_invalid:
                checks = [
                    FieldCheck(
                        field="stay_duration",
                        status=CheckStatus.INVALID,
                        message=(
                            f"stay_duration '{sd_norm}' is invalid. "
                            "Expected a positive integer followed by 'days', 'months', or 'years'. "
                            "Examples: '30 days', '6 months', '1 year'."
                        ),
                        confidence=sd.confidence,
                    ) if c.field == "stay_duration" else c
                    for c in checks
                ]

        failing = {CheckStatus.INVALID, CheckStatus.MISSING}
        is_valid = not any(c.status in failing for c in checks)
        logger.info(f"VisaValidator: document_type=visa valid={is_valid}")

        return ValidationResult(
            document_type="visa",
            valid=is_valid,
            checks=checks,
        )
