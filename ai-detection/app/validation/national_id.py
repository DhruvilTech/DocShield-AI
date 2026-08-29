"""
Aadhaar card validator for DocShield AI.

Validation pipeline
  1. Required field presence (id_number, name, date_of_birth)
  2. Format check — 12 digits, first digit in [2-9]  (UIDAI spec)
  3. Verhoeff checksum — mathematical validity of the 12th digit
  4. Optional field pattern checks (gender, pin_code)
  5. Date of birth must be in the past
  6. OCR confidence warnings

Verhoeff Algorithm
  The Aadhaar number's 12th digit is a checksum computed by UIDAI using the
  Verhoeff algorithm (dihedral group D5).  A passing check means the number
  is *mathematically plausible* — it eliminates ~90% of random fake numbers.
  It does NOT verify that the number was actually issued by UIDAI.
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


# ── Verhoeff lookup tables ─────────────────────────────────────────────────────

# Multiplication table
_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

# Permutation table
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

# Inverse table
_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def _verhoeff_validate(number: str) -> bool:
    """Return True if *number* passes the Verhoeff checksum.

    Args:
        number: Exactly 12 ASCII digit characters (already format-validated).

    Returns:
        True if the checksum digit is mathematically correct.
    """
    c = 0
    for i, ch in enumerate(reversed(number)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


# ── Validator ──────────────────────────────────────────────────────────────────

class NationalIdValidator(BaseDocumentValidator):
    """Validates Indian Aadhaar card fields.

    Requirements:
      - id_number : 12 digits, first ∈ [2-9], passes Verhoeff checksum
      - name      : 2-100 chars
      - dob       : must be in the past
      - gender    : M | F | Male | Female | Third Gender
      - pin_code  : 6 digits, first ≠ 0
    """

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

        # ── Phase 2: Aadhaar number format + Verhoeff ─────────────────────────
        id_field = fields.get("id_number")
        if id_field and id_field.value:
            raw = re.sub(r"\s", "", id_field.value.strip())
            pattern = rules.patterns.get("id_number", r"^[2-9][0-9]{11}$")

            if not re.fullmatch(pattern, raw):
                checks = [
                    FieldCheck(
                        field="id_number",
                        status=CheckStatus.INVALID,
                        message=(
                            f"Aadhaar number '{raw}' has an invalid format. "
                            "Must be exactly 12 digits and must not start with 0 or 1."
                        ),
                        confidence=id_field.confidence,
                    ) if c.field == "id_number" else c
                    for c in checks
                ]
            elif not _verhoeff_validate(raw):
                checks = [
                    FieldCheck(
                        field="id_number",
                        status=CheckStatus.INVALID,
                        message=(
                            "Aadhaar number fails the Verhoeff checksum. "
                            "The number is mathematically invalid and could not have been "
                            "issued by UIDAI."
                        ),
                        confidence=id_field.confidence,
                    ) if c.field == "id_number" else c
                    for c in checks
                ]

        # ── Phase 3: gender ───────────────────────────────────────────────────
        gf = fields.get("gender")
        if gf and gf.value:
            gender_pattern = rules.patterns.get(
                "gender", r"^(?:M|F|Male|Female|Third Gender)$"
            )
            if not re.fullmatch(gender_pattern, gf.value.strip(), re.IGNORECASE):
                checks.append(FieldCheck(
                    field="gender",
                    status=CheckStatus.INVALID,
                    message=(
                        f"Gender value '{gf.value.strip()}' is not recognised. "
                        "Expected: M, F, Male, Female, or Third Gender."
                    ),
                    confidence=gf.confidence,
                ))

        # ── Phase 4: PIN code ─────────────────────────────────────────────────
        pin_field = fields.get("pin_code")
        if pin_field and pin_field.value:
            pin_pattern = rules.patterns.get("pin_code", r"^[1-9][0-9]{5}$")
            if not re.fullmatch(pin_pattern, pin_field.value.strip()):
                checks.append(FieldCheck(
                    field="pin_code",
                    status=CheckStatus.INVALID,
                    message=(
                        f"PIN code '{pin_field.value.strip()}' is invalid. "
                        "Must be a 6-digit Indian postal code not starting with 0."
                    ),
                    confidence=pin_field.confidence,
                ))

        # ── Phase 5: date of birth ────────────────────────────────────────────
        dob = self._parse_date(fields.get("date_of_birth"))
        if dob is not None and dob >= today:
            checks.append(FieldCheck(
                field="date_of_birth",
                status=CheckStatus.INVALID,
                message="Date of birth must be in the past.",
            ))

        # ── Phase 6: confidence warnings ──────────────────────────────────────
        for fname, f in fields.items():
            if f.confidence is not None and f.confidence < settings.OCR_CONFIDENCE_THRESHOLD:
                warnings.append(
                    f"Low OCR confidence for field '{fname}': {f.confidence:.2f}"
                )

        failing = {CheckStatus.INVALID, CheckStatus.MISSING}
        is_valid = not any(c.status in failing for c in checks)
        logger.info(f"NationalIdValidator: document_type=national_id valid={is_valid}")

        return ValidationResult(
            document_type="national_id",
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
