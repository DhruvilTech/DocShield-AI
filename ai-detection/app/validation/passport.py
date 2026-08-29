from __future__ import annotations
import re
from datetime import date
from dateutil import parser as dateutil_parser
from app.ocr.extractor import ExtractedField
from app.validation.base import BaseDocumentValidator
from app.validation.models import CheckStatus, FieldCheck, ValidationResult
from app.validation.rules import RuleSet
from app.config.settings import settings
from app.common.logging import logger

class PassportValidator(BaseDocumentValidator):
    """Validates extracted passport fields.
    Requirements: 11.1-11.10
    """

    def validate(
        self, fields: dict[str, ExtractedField], rules: RuleSet
    ) -> ValidationResult:
        checks: list[FieldCheck] = []
        warnings: list[str] = []
        today = date.today()

        # Phase 1: required field presence
        field_status: dict[str, CheckStatus] = {}
        for field_name in rules.required_fields:
            f = fields.get(field_name)
            if f is None or f.value is None or not f.value.strip():
                status = CheckStatus.MISSING
                msg = f"Required field '{field_name}' is missing or empty"
            else:
                status = CheckStatus.VALID
                msg = f"Field '{field_name}' is present"
            field_status[field_name] = status
            checks.append(FieldCheck(
                field=field_name,
                status=status,
                message=msg,
                confidence=f.confidence if f else None,
            ))

        # Phase 2: passport number format
        pp_field = fields.get("passport_number")
        if pp_field and pp_field.value:
            raw_val = pp_field.value.strip().upper().replace(" ", "")
            # India MEA formats: traditional A1234567 (letter+7 digits)
            # or newer AB123456 (2 letters+6 digits)
            pattern = rules.patterns.get(
                "passport_number",
                r"^(?:[A-Z][0-9]{7}|[A-Z]{2}[0-9]{6})$",
            )
            if not re.fullmatch(pattern, raw_val):
                checks = [
                    FieldCheck(
                        field="passport_number",
                        status=CheckStatus.INVALID,
                        message=(
                            f"Passport number '{pp_field.value.strip()}' is invalid. "
                            "Indian passport format: 1 letter + 7 digits (e.g. K1234567) "
                            "or 2 letters + 6 digits (e.g. AB123456)."
                        ),
                        confidence=pp_field.confidence,
                    ) if c.field == "passport_number" else c
                    for c in checks
                ]

        # Phase 3: date logic
        dob = self._parse_date(fields.get("date_of_birth"))
        exp = self._parse_date(fields.get("date_of_expiry"))

        if dob is not None and dob >= today:
            checks.append(FieldCheck(
                field="date_of_birth",
                status=CheckStatus.INVALID,
                message="Date of birth must be in the past",
            ))
        if exp is not None and exp <= today:
            checks.append(FieldCheck(
                field="date_of_expiry",
                status=CheckStatus.INVALID,
                message="Passport is expired",
            ))
        if dob is not None and exp is not None and exp <= dob:
            checks.append(FieldCheck(
                field="date_of_expiry",
                status=CheckStatus.INCONSISTENT,
                message="Expiry date must be after date of birth",
            ))

        # Phase 4: confidence warnings
        for fname, f in fields.items():
            if f.confidence is not None and f.confidence < settings.OCR_CONFIDENCE_THRESHOLD:
                warnings.append(
                    f"Low OCR confidence for field '{fname}': {f.confidence:.2f}"
                )

        failing = {CheckStatus.INVALID, CheckStatus.MISSING}
        is_valid = not any(c.status in failing for c in checks)
        logger.info(f"PassportValidator: document_type=passport valid={is_valid}")

        return ValidationResult(
            document_type="passport",
            valid=is_valid,
            checks=checks,
            warnings=warnings,
        )

    @staticmethod
    def _parse_date(field: ExtractedField | None) -> date | None:
        if field is None or field.value is None:
            return None
        val = field.value.strip()
        # Handle YYMMDD from MRZ
        if len(val) == 6 and val.isdigit():
            yy, mm, dd = int(val[:2]), int(val[2:4]), int(val[4:6])
            year = 2000 + yy if yy < 30 else 1900 + yy
            try:
                return date(year, mm, dd)
            except ValueError:
                return None
        try:
            return dateutil_parser.parse(val, dayfirst=True).date()
        except Exception:
            return None
