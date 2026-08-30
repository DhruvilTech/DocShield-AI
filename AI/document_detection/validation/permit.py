"""
Indian vehicle permit validator for DocShield AI.

Permit number format (Motor Vehicles Act / MoRTH):
  STATE(2) + RTO(2) + YEAR(4) + SEQ(5-8 alphanumeric)
  Example: MH012020A1234

Vehicle number (Bharat Series plate):
  STATE(2) + DIST(2) + SERIES(1-2 alpha) + NUMBER(4 digits)
  Example: MH01AB1234

Validation pipeline
  1. Required field presence
  2. Permit number format
  3. Permit type validity
  4. Vehicle number format (Bharat Series)
  5. Date of expiry must be in the future
  6. OCR confidence warnings
"""
from __future__ import annotations

import re
from datetime import date

from dateutil import parser as dateutil_parser

from core.logging import logger
from core.config import settings
from document_detection.ocr.extractor import ExtractedField
from document_detection.validation.base import BaseDocumentValidator
from document_detection.validation.models import CheckStatus, FieldCheck, ValidationResult
from document_detection.validation.rules import RuleSet


_VALID_PERMIT_TYPES: frozenset[str] = frozenset({
    "national",
    "state",
    "tourist",
    "goods",
    "taxi",
    "maxi-cab",
    "contract-carriage",
    "stage-carriage",
    "educational-institution",
})


class PermitValidator(BaseDocumentValidator):
    """Validates Indian vehicle permit fields per the Motor Vehicles Act."""

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

        # ── Phase 2: permit_number format ─────────────────────────────────────
        pn_field = fields.get("permit_number")
        if pn_field and pn_field.value:
            raw = re.sub(r"[\s\-]", "", pn_field.value.strip().upper())
            pattern = rules.patterns.get(
                "permit_number",
                r"^[A-Z]{2}[0-9]{2}(?:19|20)[0-9]{2}[A-Z0-9]{5,8}$",
            )
            if not re.fullmatch(pattern, raw):
                checks = [
                    FieldCheck(
                        field="permit_number",
                        status=CheckStatus.INVALID,
                        message=(
                            f"Permit number '{pn_field.value.strip()}' has an invalid format. "
                            "Expected: STATE(2)+RTO(2)+YEAR(4)+SEQ(5-8), e.g. 'MH012020A1234'."
                        ),
                        confidence=pn_field.confidence,
                    ) if c.field == "permit_number" else c
                    for c in checks
                ]

        # ── Phase 3: permit_type ──────────────────────────────────────────────
        pt_field = fields.get("permit_type")
        if pt_field and pt_field.value:
            pt_norm = pt_field.value.strip().lower().replace(" ", "-")
            pt_pattern = rules.patterns.get("permit_type")
            pt_invalid = (
                not re.fullmatch(pt_pattern, pt_norm, re.IGNORECASE)
                if pt_pattern
                else pt_norm not in _VALID_PERMIT_TYPES
            )
            if pt_invalid:
                checks = [
                    FieldCheck(
                        field="permit_type",
                        status=CheckStatus.INVALID,
                        message=(
                            f"Permit type '{pt_field.value.strip()}' is not recognised. "
                            f"Valid types: {', '.join(sorted(_VALID_PERMIT_TYPES))}."
                        ),
                        confidence=pt_field.confidence,
                    ) if c.field == "permit_type" else c
                    for c in checks
                ]

        # ── Phase 4: vehicle_no (Bharat Series) ───────────────────────────────
        vn_field = fields.get("vehicle_no")
        if vn_field and vn_field.value:
            raw_vn = re.sub(r"[\s\-]", "", vn_field.value.strip().upper())
            vn_pattern = rules.patterns.get(
                "vehicle_no",
                r"^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$",
            )
            if not re.fullmatch(vn_pattern, raw_vn):
                checks.append(FieldCheck(
                    field="vehicle_no",
                    status=CheckStatus.INVALID,
                    message=(
                        f"Vehicle number '{vn_field.value.strip()}' has an invalid format. "
                        "Expected Bharat Series: STATE(2)+DIST(2)+SERIES(1-2)+NUMBER(4), "
                        "e.g. 'MH01AB1234'."
                    ),
                    confidence=vn_field.confidence,
                ))

        # ── Phase 5: date of expiry ───────────────────────────────────────────
        exp = self._parse_date(fields.get("date_of_expiry"))
        if exp is not None and exp <= today:
            checks.append(FieldCheck(
                field="date_of_expiry",
                status=CheckStatus.INVALID,
                message="Permit is expired.",
            ))

        # ── Phase 6: confidence warnings ──────────────────────────────────────
        for fname, f in fields.items():
            if f.confidence is not None and f.confidence < settings.OCR_CONFIDENCE_THRESHOLD:
                warnings.append(
                    f"Low OCR confidence for field '{fname}': {f.confidence:.2f}"
                )

        failing = {CheckStatus.INVALID, CheckStatus.MISSING}
        is_valid = not any(c.status in failing for c in checks)
        logger.info(f"PermitValidator: document_type=permit valid={is_valid}")

        return ValidationResult(
            document_type="permit",
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
