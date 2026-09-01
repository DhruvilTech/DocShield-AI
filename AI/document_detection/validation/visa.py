from __future__ import annotations
import re
from datetime import date
try:
    from dateutil import parser as dateutil_parser
except ImportError:
    dateutil_parser = None
from document_detection.ocr.extractor import ExtractedField
from document_detection.validation.base import BaseDocumentValidator
from document_detection.validation.models import CheckStatus, FieldCheck, ValidationResult
from document_detection.validation.rules import RuleSet
from core.config import settings
from core.logging import logger

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
    """Validates extracted visa fields, MRZ integrity (ICAO Doc 9303 MRV-A & MRV-B), and visual cross-checks.
    Requirements: 12.1-12.8
    """

    def validate(
        self, fields: dict[str, ExtractedField], rules: RuleSet
    ) -> ValidationResult:
        checks: list[FieldCheck] = []
        warnings: list[str] = []
        today = date.today()

        # 1. Required fields
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

        # 2. visa_number — sticker visa (8-digit numeric) or e-Visa ETA (8-12 alphanumeric)
        vn = fields.get("visa_number")
        if vn and vn.value:
            raw_vn = re.sub(r"\s", "", vn.value.strip().upper()).replace("<", "")
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

        # 3. visa_type — check against allowed values (case-insensitive)
        vt = fields.get("visa_type")
        if vt and vt.value:
            vt_norm = vt.value.strip().lower()
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

        # 4. entry_validation — single / multiple / double
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

        # 5. stay_duration — non-zero positive integer + unit word
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

        # 6. Date logic validation (DOB & Expiry)
        dob = self._parse_date(fields.get("date_of_birth"), is_expiry=False)
        exp = self._parse_date(fields.get("date_of_expiry"), is_expiry=True)

        dob_field = fields.get("date_of_birth")
        if dob_field and dob_field.value and dob is None:
            checks.append(FieldCheck(
                field="date_of_birth",
                status=CheckStatus.INVALID,
                message=f"Date of birth '{dob_field.value}' is not a valid date format",
            ))
        elif dob is not None and dob >= today:
            checks.append(FieldCheck(
                field="date_of_birth",
                status=CheckStatus.INVALID,
                message="Date of birth must be in the past",
            ))

        exp_field = fields.get("date_of_expiry")
        if exp_field and exp_field.value and exp is None:
            checks.append(FieldCheck(
                field="date_of_expiry",
                status=CheckStatus.INVALID,
                message=f"Date of expiry '{exp_field.value}' is not a valid date format",
            ))
        elif exp is not None and exp <= today:
            checks.append(FieldCheck(
                field="date_of_expiry",
                status=CheckStatus.INVALID,
                message="Visa document is expired",
            ))

        if dob is not None and exp is not None and exp <= dob:
            checks.append(FieldCheck(
                field="date_of_expiry",
                status=CheckStatus.INCONSISTENT,
                message="Expiry date must be after date of birth",
            ))

        # 7. Visual vs MRZ cross-check validation
        for field_name in ["visa_number", "date_of_birth", "date_of_expiry", "gender", "nationality"]:
            mrz_field = fields.get(field_name)
            visual_field = fields.get(f"visual_{field_name}")

            if mrz_field and mrz_field.value and visual_field and visual_field.value:
                mrz_val = mrz_field.value.strip()
                visual_val = visual_field.value.strip()

                if field_name == "visa_number":
                    clean_mrz = mrz_val.upper().replace(" ", "").replace("<", "")
                    clean_vis = visual_val.upper().replace(" ", "").replace("<", "")
                    if clean_mrz != clean_vis:
                        checks.append(FieldCheck(
                            field="visa_number",
                            status=CheckStatus.INVALID,
                            message=f"Mismatched visa number: visual '{visual_val}' does not match MRZ '{mrz_val}'",
                        ))

                elif field_name == "date_of_birth":
                    dob_mrz = self._parse_date(mrz_field, is_expiry=False)
                    dob_vis = self._parse_date(visual_field, is_expiry=False)
                    if dob_mrz and dob_vis and dob_mrz != dob_vis:
                        checks.append(FieldCheck(
                            field="date_of_birth",
                            status=CheckStatus.INVALID,
                            message=f"Mismatched date of birth: visual '{visual_val}' does not match MRZ '{mrz_val}'",
                        ))

                elif field_name == "date_of_expiry":
                    exp_mrz = self._parse_date(mrz_field, is_expiry=True)
                    exp_vis = self._parse_date(visual_field, is_expiry=True)
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

                elif field_name == "nationality":
                    def norm_nat(n):
                        clean = n.upper().replace("<", "").replace(" ", "")
                        if clean in ("IND", "INDIAN", "INDIA"):
                            return "IND"
                        if clean in ("USA", "UNITEDSTATES", "AMERICAN"):
                            return "USA"
                        if clean in ("GBR", "BRITISH", "UNITEDKINGDOM"):
                            return "GBR"
                        if clean in ("CAN", "CANADA", "CANADIAN"):
                            return "CAN"
                        return clean
                    if norm_nat(mrz_val) != norm_nat(visual_val):
                        checks.append(FieldCheck(
                            field="nationality",
                            status=CheckStatus.INVALID,
                            message=f"Mismatched nationality: visual '{visual_val}' does not match MRZ '{mrz_val}'",
                        ))

        mrz_name_field = fields.get("name")
        visual_name_field = fields.get("visual_name")
        if mrz_name_field and mrz_name_field.value and visual_name_field and visual_name_field.value:
            def get_tokens(name_str):
                return set(re.findall(r"[A-Z]+", name_str.upper()))
            mrz_tokens = get_tokens(mrz_name_field.value)
            vis_tokens = get_tokens(visual_name_field.value)
            if mrz_tokens and vis_tokens and not (mrz_tokens & vis_tokens):
                checks.append(FieldCheck(
                    field="name",
                    status=CheckStatus.INVALID,
                    message=f"Mismatched name: visual '{visual_name_field.value}' does not match MRZ '{mrz_name_field.value}'",
                ))

        # 8. ICAO Doc 9303 Part 7 Checksum Validation for Visas (MRV-A & MRV-B)
        mrz_lines_field = fields.get("mrz_lines")
        if mrz_lines_field and mrz_lines_field.value:
            lines = [l.strip() for l in mrz_lines_field.value.split("\n") if l.strip()]
            if len(lines) >= 2:
                l1, l2 = lines[0], lines[1]
                if l2.startswith("V") and not l1.startswith("V"):
                    l1, l2 = l2, l1
                if len(l2) >= 28:
                    def calc_check(s: str) -> int:
                        weights = [7, 3, 1]
                        tot = 0
                        for i, ch in enumerate(s):
                            w = weights[i % 3]
                            if ch == "<":
                                v = 0
                            elif ch.isdigit():
                                v = int(ch)
                            elif "A" <= ch <= "Z":
                                v = ord(ch) - 55
                            else:
                                v = 0
                            tot += v * w
                        return tot % 10

                    doc_num = l2[0:9]
                    doc_check = l2[9]
                    dob_str = l2[13:19]
                    dob_check = l2[19]
                    exp_str = l2[21:27]
                    exp_check = l2[27]

                    is_doc_valid = (doc_check.isdigit() and int(doc_check) == calc_check(doc_num)) or (doc_check == "<" and calc_check(doc_num) == 0)
                    is_dob_valid = dob_check.isdigit() and int(dob_check) == calc_check(dob_str)
                    is_exp_valid = exp_check.isdigit() and int(exp_check) == calc_check(exp_str)

                    if not (is_doc_valid and is_dob_valid and is_exp_valid):
                        checks.append(FieldCheck(
                            field="mrz_lines",
                            status=CheckStatus.INVALID,
                            message=f"ICAO 9303 Visa MRZ Checksum failed: Doc# valid={is_doc_valid}, DOB valid={is_dob_valid}, Expiry valid={is_exp_valid}",
                            confidence=mrz_lines_field.confidence,
                        ))
                    else:
                        checks.append(FieldCheck(
                            field="mrz_lines",
                            status=CheckStatus.VALID,
                            message="ICAO 9303 Visa MRZ Checksums verified valid",
                            confidence=mrz_lines_field.confidence,
                        ))
                else:
                    checks.append(FieldCheck(
                        field="mrz_lines",
                        status=CheckStatus.INVALID,
                        message=f"Visa MRZ line length ({len(l2)}) is insufficient for ICAO standard verification.",
                        confidence=mrz_lines_field.confidence,
                    ))

        # Confidence warnings
        for fname, f in fields.items():
            if f.confidence is not None and f.confidence < settings.OCR_CONFIDENCE_THRESHOLD:
                warnings.append(
                    f"Low OCR confidence for field '{fname}': {f.confidence:.2f}"
                )

        failing = {CheckStatus.INVALID, CheckStatus.MISSING}
        is_valid = not any(c.status in failing for c in checks)
        logger.info(f"VisaValidator: document_type=visa valid={is_valid}")

        return ValidationResult(
            document_type="visa",
            valid=is_valid,
            checks=checks,
            warnings=warnings,
        )

    @staticmethod
    def _parse_date(field: ExtractedField | None, is_expiry: bool = False) -> date | None:
        if field is None or field.value is None:
            return None
        val = field.value.strip().upper()
        if not val:
            return None

        # 1. YYMMDD from MRZ
        if len(val) == 6 and val.isdigit():
            today_yy = date.today().year % 100
            yy, mm, dd = int(val[:2]), int(val[2:4]), int(val[4:6])
            if is_expiry:
                year = 2000 + yy if yy <= (today_yy + 30) else 1900 + yy
            else:
                year = 1900 + yy if yy > today_yy else 2000 + yy
            try:
                return date(year, mm, dd)
            except ValueError:
                return None

        # 2. ISO format YYYY-MM-DD
        if len(val) >= 10 and val[4] == '-' and val[7] == '-':
            try:
                return date.fromisoformat(val[:10])
            except ValueError:
                pass

        # 3. Standard DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        dmy_match = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$", val)
        if dmy_match:
            try:
                d, m, y = int(dmy_match.group(1)), int(dmy_match.group(2)), int(dmy_match.group(3))
                return date(y, m, d)
            except ValueError:
                pass

        # 4. Named month DD MMM YYYY (e.g. 26 AUG 2026, 14-MAY-1995, 14 NOV 2003)
        month_map = {
            "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
            "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
        }
        named_match = re.match(r"^(\d{1,2})[\s\-/\.]([A-Z]{3})[\s\-/\.](\d{4})$", val)
        if named_match:
            try:
                d = int(named_match.group(1))
                m = month_map.get(named_match.group(2))
                y = int(named_match.group(3))
                if m:
                    return date(y, m, d)
            except ValueError:
                pass

        # 5. Fallback with dateutil parser if available
        if dateutil_parser is not None:
            try:
                return dateutil_parser.parse(val, dayfirst=True).date()
            except Exception:
                pass

        return None

