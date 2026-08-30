from __future__ import annotations
import re
from datetime import date
from dateutil import parser as dateutil_parser
from document_detection.ocr.extractor import ExtractedField
from document_detection.validation.base import BaseDocumentValidator
from document_detection.validation.models import CheckStatus, FieldCheck, ValidationResult
from document_detection.validation.rules import RuleSet
from core.config import settings
from core.logging import logger

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

        # Phase 3.5: Visual vs MRZ cross-check validation
        for field_name in ["passport_number", "date_of_birth", "date_of_expiry", "gender"]:
            mrz_field = fields.get(field_name)
            visual_field = fields.get(f"visual_{field_name}")
            
            if mrz_field and mrz_field.value and visual_field and visual_field.value:
                mrz_val = mrz_field.value.strip()
                visual_val = visual_field.value.strip()
                
                if field_name == "passport_number":
                    clean_mrz = mrz_val.upper().replace(" ", "")
                    clean_vis = visual_val.upper().replace(" ", "")
                    if clean_mrz != clean_vis:
                        checks.append(FieldCheck(
                            field="passport_number",
                            status=CheckStatus.INVALID,
                            message=f"Mismatched passport number: visual '{visual_val}' does not match MRZ '{mrz_val}'",
                        ))
                
                elif field_name == "date_of_birth":
                    dob_mrz = self._parse_date(mrz_field)
                    dob_vis = self._parse_date(visual_field)
                    if dob_mrz and dob_vis and dob_mrz != dob_vis:
                        checks.append(FieldCheck(
                            field="date_of_birth",
                            status=CheckStatus.INVALID,
                            message=f"Mismatched date of birth: visual '{visual_val}' does not match MRZ '{mrz_val}'",
                        ))

                elif field_name == "date_of_expiry":
                    exp_mrz = self._parse_date(mrz_field)
                    exp_vis = self._parse_date(visual_field)
                    if exp_mrz and exp_vis and exp_mrz != exp_vis:
                        checks.append(FieldCheck(
                            field="date_of_expiry",
                            status=CheckStatus.INVALID,
                            message=f"Mismatched date of expiry: visual '{visual_val}' does not match MRZ '{mrz_val}'",
                        ))

                elif field_name == "gender":
                    g_mrz = mrz_val.upper()[0] if mrz_val else ""
                    g_vis = visual_val.upper()[0] if visual_val else ""
                    if g_mrz in ("M", "F", "X") and g_vis in ("M", "F", "X") and g_mrz != g_vis:
                        checks.append(FieldCheck(
                            field="gender",
                            status=CheckStatus.INVALID,
                            message=f"Mismatched gender: visual '{visual_val}' does not match MRZ '{mrz_val}'",
                        ))

        mrz_name_field = fields.get("name")
        visual_name_field = fields.get("visual_name")
        if mrz_name_field and mrz_name_field.value and visual_name_field and visual_name_field.value:
            def get_tokens(name_str):
                return set(re.findall(r"\w+", name_str.upper()))
            mrz_tokens = get_tokens(mrz_name_field.value)
            vis_tokens = get_tokens(visual_name_field.value)
            if mrz_tokens and vis_tokens and not (mrz_tokens & vis_tokens):
                checks.append(FieldCheck(
                    field="name",
                    status=CheckStatus.INVALID,
                    message=f"Mismatched name: visual '{visual_name_field.value}' does not match MRZ '{mrz_name_field.value}'",
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
