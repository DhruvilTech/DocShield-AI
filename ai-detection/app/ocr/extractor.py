"""
Field extractors for each Indian government document type.

Each extractor implements BaseFieldExtractor.extract(ocr_result) and returns
a dict[field_name, ExtractedField].  They rely purely on OCRResult — no direct
dependency on PaddleOCR.

Extraction strategy per document:
  1. Label-proximity search (_find_label_value) — looks for known label text
     and returns the value from the same region (after ":") or the next region.
  2. Regex search on raw_text — fallback when no label is found.
  3. MRZ override — for passports, MRZ lines (if detected) take highest priority.
"""
from __future__ import annotations
import re
from abc import ABC, abstractmethod

from pydantic import BaseModel, field_validator

from app.ocr.models import BoundingBox, OCRResult, TextRegion


# ── Field lists ────────────────────────────────────────────────────────────────

PASSPORT_FIELDS = [
    "name", "passport_number", "nationality",
    "date_of_birth", "date_of_expiry", "gender",
]
VISA_FIELDS = ["visa_number", "visa_type", "entry_validation", "stay_duration"]
NATIONAL_ID_FIELDS = ["id_number", "name", "date_of_birth", "gender", "pin_code"]
DRIVING_LICENSE_FIELDS = [
    "license_number", "name", "date_of_birth", "date_of_expiry", "vehicle_class",
]
PERMIT_FIELDS = ["permit_number", "name", "permit_type", "vehicle_no", "date_of_expiry"]


# ── Pydantic model ─────────────────────────────────────────────────────────────

class ExtractedField(BaseModel):
    name: str
    value: str | None
    confidence: float | None
    source_text: str | None = None
    source_region: BoundingBox | None = None

    @field_validator("name")
    @classmethod
    def name_nonempty(cls, v):
        if not v:
            raise ValueError("name must not be empty")
        return v


# ── Abstract base ──────────────────────────────────────────────────────────────

class BaseFieldExtractor(ABC):
    @abstractmethod
    def extract(self, ocr_result: OCRResult) -> dict[str, ExtractedField]:
        pass


# ── Helpers ────────────────────────────────────────────────────────────────────

def _empty(name: str) -> ExtractedField:
    return ExtractedField(name=name, value=None, confidence=None)


def _find_label_value(
    regions: list[TextRegion],
    labels: list[str],
) -> tuple[str | None, float | None, str | None]:
    """Return (value, confidence, source_text) for the first matching label."""
    for i, region in enumerate(regions):
        upper = region.text.upper()
        for label in labels:
            if label in upper:
                colon_split = region.text.split(":", 1)
                if len(colon_split) == 2 and colon_split[1].strip():
                    val = colon_split[1].strip()
                    return val, region.confidence, region.text
                if i + 1 < len(regions):
                    nxt = regions[i + 1]
                    return nxt.text.strip(), nxt.confidence, nxt.text
    return None, None, None


def _get_confidence_for_match(match_text: str, regions: list[TextRegion]) -> float | None:
    if not match_text:
        return None
    for r in regions:
        if match_text in r.text:
            return r.confidence
    return None


# ── Passport ───────────────────────────────────────────────────────────────────

class PassportFieldExtractor(BaseFieldExtractor):
    """Extracts Indian passport fields.

    Passport number patterns (India MEA):
      Traditional : 1 letter + 7 digits  (e.g. K1234567)
      Newer       : 2 letters + 6 digits  (e.g. AB123456)
    """

    # Updated to match both Indian passport formats
    _PASSPORT_NO_RE = re.compile(r"\b([A-Z]{1,2}[0-9]{6,7})\b")
    _GENDER_RE = re.compile(r"\b(M|F|X|MALE|FEMALE)\b")
    _MRZ_RE = re.compile(r"^[A-Z0-9<]{40,50}$")

    def extract(self, ocr_result: OCRResult) -> dict[str, ExtractedField]:
        raw = ocr_result.raw_text
        regions = list(ocr_result.regions)
        fields: dict[str, ExtractedField] = {}

        # passport_number
        m = self._PASSPORT_NO_RE.search(raw)
        fields["passport_number"] = ExtractedField(
            name="passport_number",
            value=m.group(0) if m else None,
            confidence=_get_confidence_for_match(m.group(0), regions) if m else None,
            source_text=m.group(0) if m else None,
        )

        # gender
        gender_val, gender_conf = None, None
        for region in regions:
            gm = self._GENDER_RE.search(region.text)
            if gm:
                gender_val = gm.group(0)
                gender_conf = region.confidence
                break
        if gender_val is None:
            gm = self._GENDER_RE.search(raw)
            if gm:
                gender_val = gm.group(0)
                gender_conf = _get_confidence_for_match(gm.group(0), regions)
        fields["gender"] = ExtractedField(name="gender", value=gender_val, confidence=gender_conf)

        # name
        val, conf, src = _find_label_value(regions, ["SURNAME", "GIVEN NAME", "GIVEN NAMES", "NAME"])
        fields["name"] = ExtractedField(name="name", value=val, confidence=conf, source_text=src)

        # nationality
        val, conf, src = _find_label_value(regions, ["NATIONALITY", "NATIONAL"])
        fields["nationality"] = ExtractedField(name="nationality", value=val, confidence=conf, source_text=src)

        # dates
        val, conf, src = _find_label_value(regions, ["DOB", "DATE OF BIRTH", "BIRTH DATE", "BORN"])
        fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=val, confidence=conf, source_text=src)

        val, conf, src = _find_label_value(
            regions, ["EXPIRY", "EXPIRATION", "EXP DATE", "DATE OF EXPIRY", "VALID UNTIL"]
        )
        fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=val, confidence=conf, source_text=src)

        # MRZ override (highest priority)
        mrz_lines = [r.text for r in regions if self._MRZ_RE.match(r.text.replace(" ", ""))]
        if len(mrz_lines) >= 2:
            self._apply_mrz(mrz_lines[:2], fields)

        for key in PASSPORT_FIELDS:
            if key not in fields:
                fields[key] = _empty(key)

        return fields

    def _apply_mrz(self, lines: list[str], fields: dict) -> None:
        try:
            line1 = lines[0].replace(" ", "")
            line2 = lines[1].replace(" ", "")
            name_part = line1[5:44].replace("<", " ").strip()
            if name_part:
                fields["name"] = ExtractedField(name="name", value=name_part, confidence=0.99)
            nat = line1[2:5].replace("<", "")
            if nat:
                fields["nationality"] = ExtractedField(name="nationality", value=nat, confidence=0.99)
            pp_no = line2[0:9].replace("<", "")
            if pp_no:
                fields["passport_number"] = ExtractedField(name="passport_number", value=pp_no, confidence=0.99)
            dob_raw = line2[13:19]
            if dob_raw.isdigit():
                fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=dob_raw, confidence=0.99)
            exp_raw = line2[21:27]
            if exp_raw.isdigit():
                fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=exp_raw, confidence=0.99)
            sex = line2[20] if len(line2) > 20 else ""
            if sex in ("M", "F", "X"):
                fields["gender"] = ExtractedField(name="gender", value=sex, confidence=0.99)
        except Exception:
            pass


# ── Visa ───────────────────────────────────────────────────────────────────────

class VisaFieldExtractor(BaseFieldExtractor):
    """Extracts Indian visa fields.

    visa_number patterns (India Bureau of Immigration):
      Sticker visa : 8-digit numeric   (e.g. 12345678)
      e-Visa ETA   : 8-12 alphanumeric (e.g. 9004FF17M)
    """

    _VISA_NO_RE = re.compile(r"\b(?:[A-Z0-9]{8,12}|\d{8})\b")
    _STAY_RE = re.compile(r"\b(?:[1-9][0-9]{0,3})\s*(?:day|days|month|months|year|years)\b", re.IGNORECASE)

    def extract(self, ocr_result: OCRResult) -> dict[str, ExtractedField]:
        raw = ocr_result.raw_text
        regions = ocr_result.regions
        fields: dict[str, ExtractedField] = {}

        val, conf, src = _find_label_value(regions, ["VISA NO", "VISA NUMBER", "VISA#", "ETA"])
        if val is None:
            m = self._VISA_NO_RE.search(raw)
            val = m.group(0) if m else None
            conf = _get_confidence_for_match(val, regions) if val else None
        fields["visa_number"] = ExtractedField(name="visa_number", value=val, confidence=conf, source_text=src)

        val, conf, src = _find_label_value(regions, ["VISA TYPE", "TYPE OF VISA", "TYPE"])
        fields["visa_type"] = ExtractedField(name="visa_type", value=val, confidence=conf, source_text=src)

        val, conf, src = _find_label_value(regions, ["ENTRY", "ENTRIES", "NUMBER OF ENTRIES", "NO OF ENTRIES"])
        fields["entry_validation"] = ExtractedField(name="entry_validation", value=val, confidence=conf, source_text=src)

        val, conf, src = _find_label_value(regions, ["DURATION", "STAY", "PERIOD", "VALIDITY"])
        if val is None:
            sm = self._STAY_RE.search(raw)
            val = sm.group(0) if sm else None
            conf = _get_confidence_for_match(val, regions) if val else None
        fields["stay_duration"] = ExtractedField(name="stay_duration", value=val, confidence=conf, source_text=src)

        for key in VISA_FIELDS:
            if key not in fields:
                fields[key] = _empty(key)

        return fields


# ── Aadhaar / National ID ──────────────────────────────────────────────────────

class NationalIDFieldExtractor(BaseFieldExtractor):
    """Extracts Indian Aadhaar card fields.

    Aadhaar number (UIDAI):
      12 digits, first digit in [2-9].
      May appear with or without spaces (XXXX XXXX XXXX).
    """

    # Matches spaced or unspaced Aadhaar: first group starts 2-9
    _AADHAAR_RE = re.compile(r"\b([2-9][0-9]{3})\s?([0-9]{4})\s?([0-9]{4})\b")
    _DOB_RE = re.compile(r"\b(\d{2}[/\-]\d{2}[/\-]\d{4})\b")
    _GENDER_RE = re.compile(r"\b(Male|Female|Third\s+Gender|MALE|FEMALE)\b", re.IGNORECASE)
    _PIN_RE = re.compile(r"\b([1-9][0-9]{5})\b")

    def extract(self, ocr_result: OCRResult) -> dict[str, ExtractedField]:
        raw = ocr_result.raw_text
        regions = ocr_result.regions
        fields: dict[str, ExtractedField] = {}

        # Aadhaar number (concatenate groups to get clean 12-digit string)
        m = self._AADHAAR_RE.search(raw)
        if m:
            id_val = m.group(1) + m.group(2) + m.group(3)
            fields["id_number"] = ExtractedField(
                name="id_number",
                value=id_val,
                confidence=_get_confidence_for_match(m.group(0), regions),
                source_text=m.group(0),
            )
        else:
            fields["id_number"] = _empty("id_number")

        # Name
        val, conf, src = _find_label_value(regions, ["NAME", "NAAM"])
        fields["name"] = ExtractedField(name="name", value=val, confidence=conf, source_text=src)

        # Date of birth
        val, conf, src = _find_label_value(regions, ["DOB", "DATE OF BIRTH", "BIRTH", "JANM TITHI"])
        if val is None:
            dm = self._DOB_RE.search(raw)
            val = dm.group(0) if dm else None
            conf = _get_confidence_for_match(val, regions) if val else None
        fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=val, confidence=conf, source_text=src)

        # Gender
        gender_val, gender_conf = None, None
        for region in regions:
            gm = self._GENDER_RE.search(region.text)
            if gm:
                gender_val = gm.group(0)
                gender_conf = region.confidence
                break
        fields["gender"] = ExtractedField(name="gender", value=gender_val, confidence=gender_conf)

        # PIN code (6-digit, first digit ≠ 0)
        pin_val, pin_conf = None, None
        pm = self._PIN_RE.search(raw)
        if pm:
            pin_val = pm.group(0)
            pin_conf = _get_confidence_for_match(pm.group(0), regions)
        fields["pin_code"] = ExtractedField(name="pin_code", value=pin_val, confidence=pin_conf)

        for key in NATIONAL_ID_FIELDS:
            if key not in fields:
                fields[key] = _empty(key)

        return fields


# ── Driving License ────────────────────────────────────────────────────────────

class DrivingLicenseFieldExtractor(BaseFieldExtractor):
    """Extracts Indian Driving License fields per MoRTH/SARATHI.

    License number format: STATE(2) + RTO(2) + YEAR(4) + SEQ(7) = 15 chars
    Example: MH0120200034761
    """

    _DL_RE = re.compile(
        r"\b([A-Z]{2}[\s\-]?[0-9]{2}[\s\-]?(?:19|20)[0-9]{2}[\s\-]?[0-9]{7})\b",
        re.IGNORECASE,
    )
    _DOB_RE = re.compile(r"\b(\d{2}[/\-]\d{2}[/\-]\d{4})\b")
    _VEHICLE_CLASS_RE = re.compile(
        r"\b(LMV|MCWG|MCWOG|HPMV|HTV|HGV|MGV|LPV|LDRXCV|ADAPT|TR)\b",
        re.IGNORECASE,
    )

    def extract(self, ocr_result: OCRResult) -> dict[str, ExtractedField]:
        raw = ocr_result.raw_text
        regions = ocr_result.regions
        fields: dict[str, ExtractedField] = {}

        # License number — normalise spaces/hyphens
        m = self._DL_RE.search(raw)
        if m:
            fields["license_number"] = ExtractedField(
                name="license_number",
                value=re.sub(r"[\s\-]", "", m.group(0).upper()),
                confidence=_get_confidence_for_match(m.group(0), regions),
                source_text=m.group(0),
            )
        else:
            fields["license_number"] = _empty("license_number")

        # Name
        val, conf, src = _find_label_value(regions, ["NAME", "HOLDER", "NAAM"])
        fields["name"] = ExtractedField(name="name", value=val, confidence=conf, source_text=src)

        # Date of birth
        val, conf, src = _find_label_value(regions, ["DOB", "DATE OF BIRTH", "BIRTH"])
        if val is None:
            dm = self._DOB_RE.search(raw)
            val = dm.group(0) if dm else None
            conf = _get_confidence_for_match(val, regions) if val else None
        fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=val, confidence=conf, source_text=src)

        # Expiry date
        val, conf, src = _find_label_value(
            regions, ["EXPIRY", "VALID TILL", "VALID UPTO", "EXP", "EXPIRES"]
        )
        fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=val, confidence=conf, source_text=src)

        # Vehicle class
        val, conf, src = _find_label_value(regions, ["CLASS", "VEHICLE CLASS", "COV", "CATEGORY"])
        if val is None:
            vcm = self._VEHICLE_CLASS_RE.search(raw)
            val = vcm.group(0).upper() if vcm else None
            conf = _get_confidence_for_match(val, regions) if val else None
        fields["vehicle_class"] = ExtractedField(name="vehicle_class", value=val, confidence=conf)

        for key in DRIVING_LICENSE_FIELDS:
            if key not in fields:
                fields[key] = _empty(key)

        return fields


# ── Vehicle Permit ─────────────────────────────────────────────────────────────

class PermitFieldExtractor(BaseFieldExtractor):
    """Extracts Indian vehicle permit fields per the Motor Vehicles Act.

    Permit number format mirrors DL: STATE(2)+RTO(2)+YEAR(4)+SEQ(5-8)
    Vehicle number (Bharat Series): MH01AB1234
    """

    _PERMIT_NO_RE = re.compile(
        r"\b([A-Z]{2}[0-9]{2}(?:19|20)[0-9]{2}[A-Z0-9]{5,8})\b",
        re.IGNORECASE,
    )
    _VEHICLE_NO_RE = re.compile(r"\b([A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4})\b", re.IGNORECASE)
    _PERMIT_TYPE_RE = re.compile(
        r"\b(national|state|tourist|goods|taxi|maxi[\-\s]?cab|"
        r"contract[\-\s]?carriage|stage[\-\s]?carriage|educational[\-\s]?institution)\b",
        re.IGNORECASE,
    )

    def extract(self, ocr_result: OCRResult) -> dict[str, ExtractedField]:
        raw = ocr_result.raw_text
        regions = ocr_result.regions
        fields: dict[str, ExtractedField] = {}

        # Permit number
        m = self._PERMIT_NO_RE.search(raw)
        if m:
            fields["permit_number"] = ExtractedField(
                name="permit_number",
                value=m.group(0).upper(),
                confidence=_get_confidence_for_match(m.group(0), regions),
                source_text=m.group(0),
            )
        else:
            fields["permit_number"] = _empty("permit_number")

        # Name / holder
        val, conf, src = _find_label_value(regions, ["NAME", "HOLDER", "OWNER"])
        fields["name"] = ExtractedField(name="name", value=val, confidence=conf, source_text=src)

        # Permit type
        val, conf, src = _find_label_value(regions, ["PERMIT TYPE", "TYPE OF PERMIT", "CLASS"])
        if val is None:
            pm = self._PERMIT_TYPE_RE.search(raw)
            val = pm.group(0).lower().replace(" ", "-") if pm else None
            conf = _get_confidence_for_match(val, regions) if val else None
        fields["permit_type"] = ExtractedField(name="permit_type", value=val, confidence=conf, source_text=src)

        # Vehicle number (Bharat Series plate)
        val, conf, src = _find_label_value(
            regions, ["VEHICLE NO", "VEH NO", "REG NO", "REGISTRATION NO"]
        )
        if val is None:
            vnm = self._VEHICLE_NO_RE.search(raw)
            val = vnm.group(0).upper() if vnm else None
            conf = _get_confidence_for_match(val, regions) if val else None
        fields["vehicle_no"] = ExtractedField(name="vehicle_no", value=val, confidence=conf)

        # Expiry date
        val, conf, src = _find_label_value(
            regions, ["EXPIRY", "VALID TILL", "VALID UPTO", "EXPIRES"]
        )
        fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=val, confidence=conf, source_text=src)

        for key in PERMIT_FIELDS:
            if key not in fields:
                fields[key] = _empty(key)

        return fields
