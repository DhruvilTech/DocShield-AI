"""
Indian Driving License validator for DocShield AI.

License number format (MoRTH / SARATHI):
  STATE(2 alpha) + RTO(2 digits) + YEAR(4 digits, 1900-2099) + SEQ(7 digits)
  Example: MH0120200034761  (Maharashtra, RTO 01, issued 2020, seq 0034761)

Validation pipeline
  1. Required field presence
  2. License number format + state code validity
  3. Date of birth must be in the past
  4. Date of expiry must be in the future
  5. OCR confidence warnings
"""
from __future__ import annotations

import re
from datetime import date

from dateutil import parser as dateutil_parser

from app.common.logging import logger
from app.config.settings import settings
from app.ocr.extractor import ExtractedField
from app.validation.base import BaseDocumentValidator
from app.validation.models import CheckStatus, FieldCheck, ValidationResult
from app.validation.rules import RuleSet


# All valid Indian state/UT codes as per MoRTH vehicle registration
_VALID_STATE_CODES: frozenset[str] = frozenset({
    "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN",
    "GA", "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD",
    "MH", "ML", "MN", "MP", "MZ", "NL", "OD", "PB", "PY", "RJ",
    "SK", "TN", "TR", "TS", "UK", "UP", "WB",
})

# Captures STATE, RTO, YEAR, SEQ separately for per-group validation
_DL_PARSE_RE = re.compile(
    r"^([A-Z]{2})([0-9]{2})((?:19|20)[0-9]{2})([0-9]{7})$",
    re.IGNORECASE,
)


class DrivingLicenseValidator(BaseDocumentValidator):
    """Validates Indian Driving License fields per MoRTH/SARATHI."""

    def validate(
        self, fields: dict[str, ExtractedField], rules: RuleSet
    ) -> ValidationResult:
        checks: list[FieldCheck] = []
        warnings: list[str] = []
        today = date.today()

        # ── Phase 1: required field presence ──────────────────────────────────
        for field_name in rules.required_fields:
            f = fields.get(field_name)
            if f is None or f.value is None or not f.value.strip():
                checks.append(FieldCheck(
                    field=field_name,
                    status=CheckStatus.MISSING,
                    message=f"Required field '{field_name}' is missing or empty.",
                ))
            else:
                checks.append(FieldCheck(
                    field=field_name,
                    status=CheckStatus.VALID,
                    message=f"Field '{field_name}' is present.",
                    confidence=f.confidence,
                ))

        # ── Phase 2: license_number format + state code ────────────────────────
        dl_field = fields.get("license_number")
        if dl_field and dl_field.value:
            # Normalise: strip spaces/hyphens, uppercase
            raw = re.sub(r"[\s\-]", "", dl_field.value.strip().upper())
            pattern = rules.patterns.get(
                "license_number",
                r"^[A-Z]{2}[0-9]{2}(?:19|20)[0-9]{2}[0-9]{7}$",
            )
            if not re.fullmatch(pattern, raw):
                checks = [
                    FieldCheck(
                        field="license_number",
                        status=CheckStatus.INVALID,
                        message=(
                            f"License number '{dl_field.value.strip()}' has an invalid format. "
                            "Expected: STATE(2)+RTO(2)+YEAR(4)+SEQ(7), e.g. 'MH0120200034761'."
                        ),
                        confidence=dl_field.confidence,
                    ) if c.field == "license_number" else c
                    for c in checks
                ]
            else:
                # State code validation
                m = _DL_PARSE_RE.match(raw)
                if m:
                    state = m.group(1).upper()
                    if state not in _VALID_STATE_CODES:
                        checks = [
                            FieldCheck(
                                field="license_number",
                                status=CheckStatus.INVALID,
                                message=(
                                    f"Unknown Indian state/UT code '{state}' in license number. "
                                    f"Valid codes: {', '.join(sorted(_VALID_STATE_CODES))}."
                                ),
                                confidence=dl_field.confidence,
                            ) if c.field == "license_number" else c
                            for c in checks
                        ]

        # ── Phase 3: date of birth ────────────────────────────────────────────
        dob = self._parse_date(fields.get("date_of_birth"))
        if dob is not None and dob >= today:
            checks.append(FieldCheck(
                field="date_of_birth",
                status=CheckStatus.INVALID,
                message="Date of birth must be in the past.",
            ))

        # ── Phase 4: date of expiry ───────────────────────────────────────────
        exp = self._parse_date(fields.get("date_of_expiry"))
        if exp is not None and exp <= today:
            checks.append(FieldCheck(
                field="date_of_expiry",
                status=CheckStatus.INVALID,
                message="Driving license is expired.",
            ))

        # ── Phase 5: confidence warnings ──────────────────────────────────────
        for fname, f in fields.items():
            if f.confidence is not None and f.confidence < settings.OCR_CONFIDENCE_THRESHOLD:
                warnings.append(
                    f"Low OCR confidence for field '{fname}': {f.confidence:.2f}"
                )

        failing = {CheckStatus.INVALID, CheckStatus.MISSING}
        is_valid = not any(c.status in failing for c in checks)
        logger.info(f"DrivingLicenseValidator: document_type=driving_license valid={is_valid}")

        return ValidationResult(
            document_type="driving_license",
            valid=is_valid,
            checks=checks,
            warnings=warnings,
        )

    @staticmethod
    def _parse_date(field: ExtractedField | None) -> date | None:
        if field is None or field.value is None:
            return None
        val = field.value.strip()
        try:
            return dateutil_parser.parse(val, dayfirst=True).date()
        except Exception:
            return None
