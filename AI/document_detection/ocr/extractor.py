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

from document_detection.ocr.models import BoundingBox, OCRResult, TextRegion


# ── Field lists ────────────────────────────────────────────────────────────────

PASSPORT_FIELDS = [
    "name", "passport_number", "nationality",
    "date_of_birth", "date_of_expiry", "gender",
]
VISA_FIELDS = ["visa_number", "visa_type", "entry_validation", "stay_duration"]
NATIONAL_ID_FIELDS = ["id_number", "name", "date_of_birth", "gender", "pin_code"]
DRIVING_LICENSE_FIELDS = [
    "license_number", "name", "date_of_birth", "date_of_issue", "date_of_expiry", "vehicle_class",
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


def _is_bilingual_noise(text: str) -> bool:
    if not text:
        return True
    s = text.strip().upper()
    s_cleaned = re.sub(r"\([^)]*\)", "", s)  # removes (s), (S), (es)
    s_cleaned = re.sub(r"^[/:\s.\-]+", "", s_cleaned).strip()
    if not s_cleaned:
        return True
    noise_tokens = {
        "NOM", "PRÉNOMS", "PRENOMS", "SEXE", "NATIONALITÉ", "NATIONALITE",
        "DATE DE NAISSANCE", "LIEU DE NAISSANCE", "LIEU DE DELIVRANCE",
        "LIEU DE DÉLIVRANCE", "DATE DE DELIVRANCE", "DATE DE DÉLIVRANCE",
        "DATE D'EXPIRATION", "DATE D'EMISSION", "NO DU PASSEPORT",
        "PASSEPORT", "TYPE", "CODE", "SURNAME", "GIVEN NAME", "GIVEN NAMES",
        "FIRST NAME", "LAST NAME", "SEX", "GENDER", "DOB", "DATE OF BIRTH",
        "DATE OF ISSUE", "DATE OF EXPIRY", "PLACE OF BIRTH", "PLACE OF ISSUE",
        "PASSPORT NO", "PASSPORT NUMBER", "HOLDER", "SIGNATURE", "(S)", "S",
        "P", "IND"
    }
    return s_cleaned in noise_tokens


_SUBTITLE_PATTERNS = [
    r"/\s*LIEU\s*DE\s*(?:NAISSANCE|D[EÉ']?LIVRANCE|DLIVRANCE)",
    r"/\s*DATE\s*DE\s*(?:NAISSANCE|D[EÉ']?LIVRANCE|DLIVRANCE)",
    r"/\s*DATE\s*D['\s]?(?:EXPIRATION|EMISSION)",
    r"/\s*NO\s*DU\s*PASSEPORT",
    r"/\s*CODE\s*DU\s*PAYS",
    r"/\s*CODE\s*PAYS",
    r"/\s*NATIONALIT[EÉ]",
    r"/\s*PR[EÉ]NOMS?",
    r"/\s*NOM",
    r"/\s*SEXE",
    r"/\s*TYPE",
]


def _clean_field_value(text: str | None) -> str:
    if not text:
        return ""
    val = text
    val = re.sub(r"\([^)]*\)", "", val)
    for pat in _SUBTITLE_PATTERNS:
        val = re.sub(pat, "", val, flags=re.IGNORECASE)
    val = re.sub(r"^[/:\s.\-]+", "", val).strip()
    return val


def _find_label_value(
    regions: list[TextRegion],
    labels: list[str],
) -> tuple[str | None, float | None, str | None]:
    """Return (value, confidence, source_text) for the first matching label."""
    for i, region in enumerate(regions):
        upper = region.text.upper()
        for label in labels:
            if label in upper:
                idx = upper.find(label)
                after_label = region.text[idx + len(label):]
                real_val = _clean_field_value(after_label)
                if real_val and not _is_bilingual_noise(real_val):
                    return real_val, region.confidence, region.text

                # If nothing on same line, look forward in subsequent regions
                for step in (1, 2, 3):
                    if i + step < len(regions):
                        nxt = regions[i + step]
                        nxt_clean = _clean_field_value(nxt.text)
                        if nxt_clean and not _is_bilingual_noise(nxt_clean):
                            return nxt_clean, nxt.confidence, nxt.text
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
    """Extracts Indian passport fields supporting both Old and New Passport Formats.

    New Format Layout:
      - Row 1: Type | Code | Nationality | Passport No.
      - Row 2: Surname
      - Row 3: Given Name
      - Row 4: Date of Birth | Sex
      - Row 5: Place of Birth
      - Row 6: Place of Issue
      - Row 7: Date of Issue
      - Row 8: Date of Expiry
      - MRZ (TD3 2x44)

    Old Format Layout:
      - Row 1: Type | Country Code | Passport No.
      - Row 2: Surname
      - Row 3: Given Name
      - Row 4: Nationality | Sex | Date of Birth
      - Row 5: Place of Birth
      - Row 6: Place of Issue
      - Row 7: Date of Issue | Date of Expiry
      - MRZ (TD3 2x44)

    Passport number patterns (India MEA):
      Traditional : 1 letter + 7 digits  (e.g. E7251023, K1234567)
      Newer       : 2 letters + 6 digits (e.g. AT983807, AB123456) or 2 letters + 7 digits
    """

    _PASSPORT_NO_RE = re.compile(r"\b([A-Z]{1,2}[0-9]{6,7})\b")
    _GENDER_RE = re.compile(r"\b(MALE|FEMALE|HOMME|FEMME|[MFX])\b")
    _MRZ_RE = re.compile(r"^[A-Z0-9<]{40,50}$")

    def extract(self, ocr_result: OCRResult) -> dict[str, ExtractedField]:
        raw = ocr_result.raw_text
        regions = list(ocr_result.regions)
        fields: dict[str, ExtractedField] = {}

        # 1. passport_number
        pass_val, pass_conf, pass_src = _find_label_value(
            regions, ["PASSPORT NO", "PASSPORT NUMBER", "NO DU PASSEPORT", "PASSPORT NO.", "PASSPORT#"]
        )
        if pass_val:
            m_pass = self._PASSPORT_NO_RE.search(pass_val.upper().replace(" ", ""))
            if m_pass:
                pass_val = m_pass.group(1)
            else:
                pass_val = None

        if not pass_val:
            m = self._PASSPORT_NO_RE.search(raw)
            if m:
                pass_val = m.group(0)
                pass_conf = _get_confidence_for_match(m.group(0), regions)
                pass_src = m.group(0)

        fields["passport_number"] = ExtractedField(
            name="passport_number",
            value=pass_val,
            confidence=pass_conf,
            source_text=pass_src,
        )

        # 2. gender / sex
        gender_val, gender_conf, gender_src = None, None, None
        for r in regions:
            m_sex = re.search(r"\b(?:SEX|SEXE|GENDER)\b\s*[:/]*\s*(?:SEXE\s*[:/]*)?\s*\b(MALE|FEMALE|HOMME|FEMME|[MFX])\b", r.text, re.IGNORECASE)
            if m_sex:
                raw_g = m_sex.group(1).upper()
                gender_val = "M" if raw_g.startswith("M") or raw_g == "HOMME" else "F" if raw_g.startswith("F") or raw_g == "FEMME" else "X"
                gender_conf = r.confidence
                gender_src = r.text
                break

        if not gender_val:
            val, conf, src = _find_label_value(regions, ["SEX", "SEXE", "GENDER"])
            if val:
                val_clean = re.sub(r"^[/\s]*SEXE\s*[:\s]*", "", val, flags=re.IGNORECASE).strip().upper()
                m_g = re.search(r"\b(MALE|FEMALE|HOMME|FEMME|[MFX])\b", val_clean)
                if m_g:
                    raw_g = m_g.group(1)
                    gender_val = "M" if raw_g.startswith("M") or raw_g == "HOMME" else "F" if raw_g.startswith("F") or raw_g == "FEMME" else "X"
                    gender_conf = conf
                    gender_src = src

        fields["gender"] = ExtractedField(name="gender", value=gender_val, confidence=gender_conf, source_text=gender_src)

        # 3. surname & given_name & full name
        def is_clean_name(val_str: str | None) -> bool:
            if not val_str:
                return False
            clean = re.sub(r"\([^)]*\)", "", val_str)  # strip (s), (S)
            clean = re.sub(r"/.*$", "", clean)  # strip / Nom
            clean = clean.strip().upper()
            noise = [
                "/", "NOM", "GIVEN", "SURNAME", "PRÉNOMS", "PRENOMS", "NAME",
                "PASSPORT", "REPUBLIC", "INDIA", "INDIAN", "NATIONALITY",
                "SEX", "SEXE", "DATE", "BIRTH", "EXPIRY", "ISSUE", "TYPE", "CODE",
                "HOLDER", "SIGNATURE", "(S)", "S", "P", "IND"
            ]
            if not clean or any(clean == n or clean.startswith(n + " ") or clean.endswith(" " + n) for n in noise):
                return False
            if any(c.isdigit() for c in clean):
                return False
            return len(clean) >= 2

        sur_val, sur_conf, sur_src = _find_label_value(regions, ["SURNAME", "NOM", "LAST NAME", "SUR NAME"])
        if sur_val and not is_clean_name(sur_val):
            sur_val = None
        if sur_val:
            sur_val = re.sub(r"\([^)]*\)", "", sur_val).replace("/", "").strip().upper()
            fields["surname"] = ExtractedField(name="surname", value=sur_val, confidence=sur_conf, source_text=sur_src)

        given_val, given_conf, given_src = _find_label_value(regions, ["GIVEN NAME", "GIVEN NAMES", "PRÉNOMS", "PRENOMS", "FIRST NAME"])
        if given_val and not is_clean_name(given_val):
            given_val = None
        if given_val:
            given_val = re.sub(r"\([^)]*\)", "", given_val).replace("/", "").strip().upper()
            fields["given_name"] = ExtractedField(name="given_name", value=given_val, confidence=given_conf, source_text=given_src)

        # Composite full name
        if sur_val and given_val:
            full_name_val = f"{given_val} {sur_val}".strip()
            name_conf = min(sur_conf or 0.9, given_conf or 0.9)
            name_src = f"{sur_val} / {given_val}"
        elif given_val:
            full_name_val = given_val
            name_conf = given_conf
            name_src = given_src
        elif sur_val:
            full_name_val = sur_val
            name_conf = sur_conf
            name_src = sur_src
        else:
            val, conf, src = _find_label_value(regions, ["FULL NAME", "NAME", "HOLDER"])
            if val and is_clean_name(val):
                full_name_val = val.strip().upper()
                name_conf = conf
                name_src = src
            else:
                full_name_val, name_conf, name_src = None, None, None

        fields["name"] = ExtractedField(name="name", value=full_name_val, confidence=name_conf, source_text=name_src)

        # 4. nationality
        nat_val, nat_conf, nat_src = _find_label_value(regions, ["NATIONALITY", "NATIONALITÉ", "NATIONALITE", "CITIZENSHIP", "NATIONAL"])
        if nat_val:
            clean_nat = re.split(r"\b(?:SEX|GENDER|DOB|DATE|BIRTH|EXPIRY|ISSUE|SURNAME|GIVEN|NAME)\b", nat_val, flags=re.IGNORECASE)[0].strip().upper()
            if any(noise in clean_nat for noise in ["/", "SURNAME", "GIVEN", "NAME", "NOM", "PASSPORT", "CODE"]) or clean_nat in ["P", "TYPE"]:
                nat_val = None
            elif clean_nat in ["IND", "INDIAN", "INDIA"]:
                nat_val = "INDIAN"
            else:
                nat_val = clean_nat if len(clean_nat) >= 2 else None

        if not nat_val:
            raw_upper = raw.upper()
            if "INDIAN" in raw_upper:
                nat_val, nat_conf, nat_src = "INDIAN", 0.95, "Fallback raw search"
            elif "IND" in raw_upper:
                nat_val, nat_conf, nat_src = "IND", 0.90, "Fallback raw search"
            elif "USA" in raw_upper or "UNITED STATES" in raw_upper:
                nat_val, nat_conf, nat_src = "USA", 0.85, "Fallback raw search"
            elif "CAN" in raw_upper or "CANADA" in raw_upper or "CANADIAN" in raw_upper:
                nat_val, nat_conf, nat_src = "CAN", 0.85, "Fallback raw search"
            elif "GBR" in raw_upper or "BRITISH" in raw_upper or "UNITED KINGDOM" in raw_upper:
                nat_val, nat_conf, nat_src = "GBR", 0.85, "Fallback raw search"

        fields["nationality"] = ExtractedField(name="nationality", value=nat_val, confidence=nat_conf, source_text=nat_src)

        # Helper to extract clean date string from label value
        def clean_date_str(val_str: str | None) -> str | None:
            if not val_str:
                return None
            m_d = re.search(r"\b\d{2}[/\-.]\d{2}[/\-.]\d{4}\b", val_str) or re.search(r"\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\b", val_str)
            if m_d:
                return m_d.group(0)
            return val_str.strip()

        # 5. dates (DOB, Issue, Expiry)
        dob_val, dob_conf, dob_src = _find_label_value(regions, ["DOB", "DATE OF BIRTH", "DATE DE NAISSANCE", "BIRTH DATE", "BORN"])
        dob_val = clean_date_str(dob_val)
        fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=dob_val, confidence=dob_conf, source_text=dob_src)

        doi_val, doi_conf, doi_src = _find_label_value(regions, ["DATE OF ISSUE", "DATE DE DELIVRANCE", "ISSUE DATE", "DATE D'EMISSION", "ISSUED ON"])
        doi_val = clean_date_str(doi_val)
        fields["date_of_issue"] = ExtractedField(name="date_of_issue", value=doi_val, confidence=doi_conf, source_text=doi_src)

        exp_val, exp_conf, exp_src = _find_label_value(
            regions, ["EXPIRY", "EXPIRATION", "EXP DATE", "DATE OF EXPIRY", "DATE D'EXPIRATION", "VALID UNTIL", "VALID UPTO", "EXPIRY DATE"]
        )
        exp_val = clean_date_str(exp_val)
        fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=exp_val, confidence=exp_conf, source_text=exp_src)

        # 6. place of birth & place of issue
        pob_val, pob_conf, pob_src = _find_label_value(
            regions, ["PLACE OF BIRTH", "LIEU DE NAISSANCE", "BIRTH PLACE", "PLACE OF BIRT"]
        )
        if pob_val:
            pob_val = re.split(r"\b(?:PLACE|ISSUE|DATE|EXPIRY|SEX|DOB)\b", pob_val, flags=re.IGNORECASE)[0].strip()
        if pob_val and is_clean_name(pob_val):
            fields["place_of_birth"] = ExtractedField(name="place_of_birth", value=pob_val.strip().upper(), confidence=pob_conf, source_text=pob_src)

        poi_val, poi_conf, poi_src = _find_label_value(
            regions, [
                "PLACE OF ISSUE", "LIEU DE DELIVRANCE", "LIEU DE DÉLIVRANCE", "LIEU DE D'ELIVRANCE",
                "LIEU DE DLIVRANCE", "ISSUE PLACE", "ISSUED AT", "PLACE OF ISSUANCE", "PLACE OF ISUE"
            ]
        )
        if poi_val:
            poi_val = re.split(r"\b(?:PLACE|BIRTH|DATE|EXPIRY|SEX|DOB)\b", poi_val, flags=re.IGNORECASE)[0].strip()
        if poi_val and is_clean_name(poi_val):
            fields["place_of_issue"] = ExtractedField(name="place_of_issue", value=poi_val.strip().upper(), confidence=poi_conf, source_text=poi_src)

        if not fields.get("place_of_issue") or not fields["place_of_issue"].value:
            m_poi = re.search(r"(?:PLACE\s*OF\s*ISSUE|LIEU\s*DE\s*D[EÉ']?LIVRANCE|ISSUE\s*PLACE|ISSUED\s*AT)[:\s/]*([A-Z\s,.\-]{2,40})", raw, re.IGNORECASE)
            if m_poi:
                clean_m = re.split(r"\b(?:DATE|EXPIRY|BIRTH|ISSUE|SEX|DOB|PASSPORT)\b", m_poi.group(1), flags=re.IGNORECASE)[0].strip()
                if clean_m and is_clean_name(clean_m):
                    fields["place_of_issue"] = ExtractedField(name="place_of_issue", value=clean_m.upper(), confidence=0.88, source_text=m_poi.group(0))

        # Helper to check if a value looks like a valid date format
        def is_valid_date_format(date_val: str | None) -> bool:
            if not date_val:
                return False
            return bool(re.search(r"\d", date_val) and re.search(r"[-/.]", date_val))

        # Dates fallback: search for date patterns DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        all_dates = re.findall(r"\b\d{2}[/\-.]\d{2}[/\-.]\d{4}\b", raw)
        if all_dates:
            parsed_dates = []
            for d_str in all_dates:
                try:
                    from dateutil import parser as dateutil_parser
                    parsed_dates.append((dateutil_parser.parse(d_str, dayfirst=True).date(), d_str))
                except Exception:
                    pass
            parsed_dates = sorted(list(set(parsed_dates)), key=lambda x: x[0])

            if len(parsed_dates) >= 3:
                # 3 dates on Indian Passports: DOB (earliest), Issue Date (middle), Expiry Date (latest)
                if not fields.get("date_of_birth") or not fields["date_of_birth"].value or not is_valid_date_format(fields["date_of_birth"].value):
                    fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=parsed_dates[0][1], confidence=0.99, source_text=parsed_dates[0][1])
                if not fields.get("date_of_issue") or not fields["date_of_issue"].value or not is_valid_date_format(fields["date_of_issue"].value):
                    fields["date_of_issue"] = ExtractedField(name="date_of_issue", value=parsed_dates[1][1], confidence=0.99, source_text=parsed_dates[1][1])
                if not fields.get("date_of_expiry") or not fields["date_of_expiry"].value or not is_valid_date_format(fields["date_of_expiry"].value):
                    fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=parsed_dates[-1][1], confidence=0.99, source_text=parsed_dates[-1][1])
            elif len(parsed_dates) == 2:
                dob_field = fields.get("date_of_birth")
                if not dob_field or not dob_field.value or not is_valid_date_format(dob_field.value):
                    fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=parsed_dates[0][1], confidence=0.99, source_text=parsed_dates[0][1])
                exp_field = fields.get("date_of_expiry")
                if not exp_field or not exp_field.value or not is_valid_date_format(exp_field.value):
                    fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=parsed_dates[-1][1], confidence=0.99, source_text=parsed_dates[-1][1])
            elif len(parsed_dates) == 1:
                from datetime import date
                d_val, d_str = parsed_dates[0]
                if d_val < date.today():
                    dob_field = fields.get("date_of_birth")
                    if not dob_field or not dob_field.value or not is_valid_date_format(dob_field.value):
                        fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=d_str, confidence=0.99, source_text=d_str)
                else:
                    exp_field = fields.get("date_of_expiry")
                    if not exp_field or not exp_field.value or not is_valid_date_format(exp_field.value):
                        fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=d_str, confidence=0.99, source_text=d_str)

        # Store visual values before MRZ override for validation cross-check
        for field_name in ["passport_number", "gender", "name", "surname", "given_name", "nationality", "date_of_birth", "date_of_expiry", "date_of_issue", "place_of_birth", "place_of_issue"]:
            if field_name in fields and fields[field_name].value:
                fields[f"visual_{field_name}"] = ExtractedField(
                    name=f"visual_{field_name}",
                    value=fields[field_name].value,
                    confidence=fields[field_name].confidence,
                    source_text=fields[field_name].source_text
                )

        # MRZ override (highest priority)
        mrz_candidates = []
        for r in regions:
            cleaned = r.text.replace(" ", "").upper()
            cleaned = cleaned.replace("(", "<").replace(")", "<").replace("[", "<").replace("]", "<").replace("{", "<").replace("}", "<").replace("«", "<").replace("—", "<").replace("_", "<")
            filtered = "".join([c for c in cleaned if c.isalnum() or c == "<"])
            if len(filtered) >= 25 and ("<" in filtered or filtered.startswith("P")):
                mrz_candidates.append(filtered)

        for line in raw.split("\n"):
            cleaned = line.replace(" ", "").upper()
            cleaned = cleaned.replace("(", "<").replace(")", "<").replace("[", "<").replace("]", "<").replace("{", "<").replace("}", "<").replace("«", "<").replace("—", "<").replace("_", "<")
            filtered = "".join([c for c in cleaned if c.isalnum() or c == "<"])
            if len(filtered) >= 25 and ("<" in filtered or filtered.startswith("P")):
                if filtered not in mrz_candidates:
                    mrz_candidates.append(filtered)

        line1_cand = None
        line2_cand = None
        for cand in mrz_candidates:
            if not line1_cand and (cand.startswith("P<") or (cand.startswith("P") and "<" in cand)):
                line1_cand = cand
            elif not line2_cand and cand != line1_cand:
                if re.search(r"[0-9]{6}", cand) or re.search(r"IND", cand) or re.search(r"[0-9]{7}", cand):
                    line2_cand = cand

        if line1_cand and line2_cand:
            line1_cand = line1_cand.ljust(44, "<")[:44]
            line2_cand = line2_cand.ljust(44, "<")[:44]
            fmt = self._detect_passport_format(raw, regions, [line1_cand, line2_cand])
            fields["passport_format"] = ExtractedField(name="passport_format", value=fmt, confidence=0.98)
            self._apply_mrz([line1_cand, line2_cand], fields, detected_format=fmt)
        else:
            fmt = self._detect_passport_format(raw, regions, [])
            fields["passport_format"] = ExtractedField(name="passport_format", value=fmt, confidence=0.95)

        for key in PASSPORT_FIELDS:
            if key not in fields:
                fields[key] = _empty(key)

        return fields

    def _detect_passport_format(self, raw: str, regions: list[TextRegion], mrz_lines: list[str]) -> str:
        """
        Determines whether the passport is in the New Format (TD3-2021+) or Old Format (TD3-Legacy).
        """
        raw_upper = raw.upper()

        line1, line2 = None, None
        if len(mrz_lines) >= 2:
            l0, l1 = mrz_lines[0], mrz_lines[1]
            line1 = l0 if l0.startswith("P") else l1
            line2 = l1 if l0.startswith("P") else l0

        # 1. Check passport number prefix (1 letter + 7 digits = OLD_FORMAT, 2 letters = NEW_FORMAT)
        m_pass = re.search(r"\b([A-Z]{1,2}[0-9]{6,7})\b", raw_upper)
        if m_pass:
            p_no = m_pass.group(1)
            if re.match(r"^[A-Z]{1}[0-9]{7}$", p_no):
                return "OLD_FORMAT"
            elif re.match(r"^[A-Z]{2}[0-9]{6,7}$", p_no):
                return "NEW_FORMAT"

        # 2. Check visual inspection zone keywords
        if re.search(r"\bCOUNTRY\s*CODE\b", raw_upper) or re.search(r"CODE\s*DU\s*PAYS", raw_upper):
            return "OLD_FORMAT"
        if re.search(r"NATIONALITY\s*[:/]*\s*INDIAN\s*(?:SEX|DATE)", raw_upper):
            return "OLD_FORMAT"
        if re.search(r"DATE\s*OF\s*ISSUE.*DATE\s*OF\s*EXPIRY", raw_upper):
            return "OLD_FORMAT"
        if re.search(r"\bCODE\s*:\s*IND\b", raw_upper) or re.search(r"TYPE\s*:\s*P\s*CODE", raw_upper):
            return "NEW_FORMAT"

        # 3. Check MRZ Line 2 characteristics
        if line2 and len(line2) >= 42:
            opt_tail = line2[28:42].replace("<", "")
            if len(opt_tail) >= 10 and opt_tail.isdigit():
                return "NEW_FORMAT"
            if len(opt_tail) <= 4:
                return "OLD_FORMAT"

        return "OLD_FORMAT"

    def _decode_new_format_mrz(self, line1: str, line2: str, fields: dict) -> None:
        """
        Dedicated MRZ Decoding Algorithm for New Format Indian Passport (TD3-2021+)
        Line 1: P<INDLASTNAME<<FIRSTNAME<<<<<<<<<<<<<<<<<<<<<<
        Line 2: AT983807<0IND0608266M36062963067652860226<36 (2 letters + 6 digits)
        """
        nat = line1[2:5].replace("<", "").replace("1ND", "IND")
        if nat:
            fields["nationality"] = ExtractedField(name="nationality", value=nat, confidence=0.99)

        name_raw = line1[5:44]
        name_parts = name_raw.split("<<")
        surname = name_parts[0].replace("<", " ").strip() if len(name_parts) > 0 else ""
        given_names = name_parts[1].replace("<", " ").strip() if len(name_parts) > 1 else ""

        vis_sur = fields.get("visual_surname") and fields["visual_surname"].value
        vis_giv = fields.get("visual_given_name") and fields["visual_given_name"].value

        if not given_names or not surname or surname == given_names or "<<" not in name_raw:
            clean_name_raw = name_raw.replace("<", " ").strip()
            if vis_sur and vis_giv:
                surname = vis_sur
                given_names = vis_giv
            elif vis_sur and clean_name_raw.startswith(vis_sur) and len(clean_name_raw) > len(vis_sur):
                surname = vis_sur
                given_names = clean_name_raw[len(vis_sur):].strip()
            elif vis_giv and clean_name_raw.endswith(vis_giv) and len(clean_name_raw) > len(vis_giv):
                given_names = vis_giv
                surname = clean_name_raw[:-len(vis_giv)].strip()
            elif vis_sur:
                surname = vis_sur
            elif vis_giv:
                given_names = vis_giv

        if surname:
            fields["surname"] = ExtractedField(name="surname", value=surname, confidence=0.99)
        if given_names:
            fields["given_name"] = ExtractedField(name="given_name", value=given_names, confidence=0.99)

        if surname and given_names:
            fields["name"] = ExtractedField(name="name", value=f"{surname} {given_names}", confidence=0.99)
        elif surname or given_names:
            fields["name"] = ExtractedField(name="name", value=(surname or given_names), confidence=0.99)

        # Line 2 (New Format: 2-letter passport number + check digit + IND + DOB + Sex + Expiry + 14-char personal number)
        pp_no = line2[0:9].replace("<", "")
        if pp_no:
            fields["passport_number"] = ExtractedField(name="passport_number", value=pp_no, confidence=0.99)

        if len(line2) >= 13:
            line2_nat = line2[10:13].replace("<", "").replace("1ND", "IND")
            if line2_nat and not fields.get("nationality"):
                fields["nationality"] = ExtractedField(name="nationality", value=line2_nat, confidence=0.99)

        dob_raw = line2[13:19]
        if dob_raw.isdigit():
            fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=dob_raw, confidence=0.99)

        sex = line2[20] if len(line2) > 20 else ""
        if sex in ("M", "F", "X"):
            fields["gender"] = ExtractedField(name="gender", value=sex, confidence=0.99)

        exp_raw = line2[21:27]
        if exp_raw.isdigit():
            fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=exp_raw, confidence=0.99)

        if len(line2) >= 42:
            opt_data = line2[28:42].replace("<", "")
            if opt_data:
                fields["personal_number"] = ExtractedField(name="personal_number", value=opt_data, confidence=0.99)

        fields["mrz_lines"] = ExtractedField(name="mrz_lines", value=f"{line1}\n{line2}", confidence=0.99)

    def _decode_old_format_mrz(self, line1: str, line2: str, fields: dict) -> None:
        """
        Dedicated MRZ Decoding Algorithm for Old Format Indian Passport (TD3-Legacy)
        Line 1: P<INDLASTNAME<<FIRSTNAME<MIDDLENAME<<<<<<<<<<<
        Line 2: E7251023<2IND8101246M13111303<<<<<<<<<<<<<<2 (1 letter + 7 digits)
        """
        nat = line1[2:5].replace("<", "").replace("1ND", "IND")
        if nat:
            fields["nationality"] = ExtractedField(name="nationality", value=nat, confidence=0.99)

        name_raw = line1[5:44]
        name_parts = name_raw.split("<<")
        surname = name_parts[0].replace("<", " ").strip() if len(name_parts) > 0 else ""
        given_names = name_parts[1].replace("<", " ").strip() if len(name_parts) > 1 else ""

        vis_sur = fields.get("visual_surname") and fields["visual_surname"].value
        vis_giv = fields.get("visual_given_name") and fields["visual_given_name"].value

        if not given_names or not surname or surname == given_names or "<<" not in name_raw:
            clean_name_raw = name_raw.replace("<", " ").strip()
            if vis_sur and vis_giv:
                surname = vis_sur
                given_names = vis_giv
            elif vis_sur and clean_name_raw.startswith(vis_sur) and len(clean_name_raw) > len(vis_sur):
                surname = vis_sur
                given_names = clean_name_raw[len(vis_sur):].strip()
            elif vis_giv and clean_name_raw.endswith(vis_giv) and len(clean_name_raw) > len(vis_giv):
                given_names = vis_giv
                surname = clean_name_raw[:-len(vis_giv)].strip()
            elif vis_sur:
                surname = vis_sur
            elif vis_giv:
                given_names = vis_giv

        if surname:
            fields["surname"] = ExtractedField(name="surname", value=surname, confidence=0.99)
        if given_names:
            fields["given_name"] = ExtractedField(name="given_name", value=given_names, confidence=0.99)

        if surname and given_names:
            fields["name"] = ExtractedField(name="name", value=f"{surname} {given_names}", confidence=0.99)
        elif surname or given_names:
            fields["name"] = ExtractedField(name="name", value=(surname or given_names), confidence=0.99)

        # Line 2 (Old Format: 1-letter passport number + check digit + IND + DOB + Sex + Expiry + filler)
        pp_no = line2[0:9].replace("<", "")
        if pp_no:
            fields["passport_number"] = ExtractedField(name="passport_number", value=pp_no, confidence=0.99)

        if len(line2) >= 13:
            line2_nat = line2[10:13].replace("<", "").replace("1ND", "IND")
            if line2_nat and not fields.get("nationality"):
                fields["nationality"] = ExtractedField(name="nationality", value=line2_nat, confidence=0.99)

        dob_raw = line2[13:19]
        if dob_raw.isdigit():
            fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=dob_raw, confidence=0.99)

        sex = line2[20] if len(line2) > 20 else ""
        if sex in ("M", "F", "X"):
            fields["gender"] = ExtractedField(name="gender", value=sex, confidence=0.99)

        exp_raw = line2[21:27]
        if exp_raw.isdigit():
            fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=exp_raw, confidence=0.99)

        fields["mrz_lines"] = ExtractedField(name="mrz_lines", value=f"{line1}\n{line2}", confidence=0.99)

    def _apply_mrz(self, lines: list[str], fields: dict, detected_format: str = "NEW_FORMAT") -> None:
        try:
            clean_l0 = lines[0].replace(" ", "")
            clean_l1 = lines[1].replace(" ", "")
            if clean_l1.startswith("P") and not clean_l0.startswith("P"):
                line1 = clean_l1
                line2 = clean_l0
            else:
                line1 = clean_l0
                line2 = clean_l1

            if detected_format == "NEW_FORMAT":
                self._decode_new_format_mrz(line1, line2, fields)
            else:
                self._decode_old_format_mrz(line1, line2, fields)
        except Exception:
            pass


# ── Visa ───────────────────────────────────────────────────────────────────────

# ── Visa ───────────────────────────────────────────────────────────────────────

class VisaFieldExtractor(BaseFieldExtractor):
    """Extracts Visa fields supporting Visual Inspection Zone and ICAO Doc 9303 MRV (MRV-A 2x44 & MRV-B 2x36).

    visa_number patterns (India Bureau of Immigration & ICAO MRTD):
      Sticker visa : 8-digit numeric   (e.g. 12345678)
      e-Visa ETA   : 8-12 alphanumeric (e.g. 9004FF17M)
      MRV format   : 9 alphanumeric characters (e.g. V1234567< or 12345678<)
    """

    _VISA_NO_RE = re.compile(r"\b(?:[A-Z0-9]{8,12}|\d{8})\b")
    _STAY_RE = re.compile(r"\b(?:[1-9][0-9]{0,3})\s*(?:day|days|month|months|year|years)\b", re.IGNORECASE)

    def extract(self, ocr_result: OCRResult) -> dict[str, ExtractedField]:
        raw = ocr_result.raw_text
        regions = ocr_result.regions
        fields: dict[str, ExtractedField] = {}

        # 1. Visa Number
        val, conf, src = _find_label_value(regions, ["VISA NUMBER", "VISA NO.", "VISA NO", "VISA#", "CONTROL NUMBER", "CONTROL NO", "ETA"])
        if val is None:
            m = self._VISA_NO_RE.search(raw)
            val = m.group(0) if m else None
            conf = _get_confidence_for_match(val, regions) if val else None
        fields["visa_number"] = ExtractedField(name="visa_number", value=val, confidence=conf, source_text=src)

        # 2. Visa Type
        val, conf, src = _find_label_value(regions, ["TYPE OF VISA", "VISA TYPE", "CATEGORY", "CLASS", "TYPE"])
        fields["visa_type"] = ExtractedField(name="visa_type", value=val, confidence=conf, source_text=src)

        # 3. Entry Validation
        val, conf, src = _find_label_value(regions, ["NUMBER OF ENTRIES", "NO OF ENTRIES", "NO. OF ENTRIES", "ENTRIES", "ENTRY"])
        fields["entry_validation"] = ExtractedField(name="entry_validation", value=val, confidence=conf, source_text=src)

        # 4. Stay Duration
        val, conf, src = _find_label_value(regions, ["DURATION OF STAY", "STAY DURATION", "DURATION", "PERIOD", "VALIDITY", "STAY"])
        if val is None:
            sm = self._STAY_RE.search(raw)
            val = sm.group(0) if sm else None
            conf = _get_confidence_for_match(val, regions) if val else None
        fields["stay_duration"] = ExtractedField(name="stay_duration", value=val, confidence=conf, source_text=src)

        # 5. Name / Bearer
        val, conf, src = _find_label_value(regions, ["NAME OF BEARER", "FULL NAME", "BEARER", "NAME", "HOLDER"])
        if val and not any(k in val.lower() for k in ["visa", "passport", "republic", "consulate", "department", "embassy"]):
            fields["name"] = ExtractedField(name="name", value=val.strip().upper(), confidence=conf, source_text=src)

        # Surname & Given Names if separate
        sur_val, sur_conf, sur_src = _find_label_value(regions, ["SURNAME", "LAST NAME"])
        if sur_val and not any(k in sur_val.lower() for k in ["visa", "passport", "republic"]):
            fields["surname"] = ExtractedField(name="surname", value=sur_val.strip().upper(), confidence=sur_conf, source_text=sur_src)

        giv_val, giv_conf, giv_src = _find_label_value(regions, ["GIVEN NAME", "GIVEN NAMES", "FIRST NAME"])
        if giv_val and not any(k in giv_val.lower() for k in ["visa", "passport", "republic"]):
            fields["given_name"] = ExtractedField(name="given_name", value=giv_val.strip().upper(), confidence=giv_conf, source_text=giv_src)

        if fields.get("surname") and fields.get("given_name") and fields["surname"].value and fields["given_name"].value:
            fields["name"] = ExtractedField(
                name="name",
                value=f"{fields['given_name'].value} {fields['surname'].value}".strip(),
                confidence=0.92
            )

        # 6. Gender / Sex
        val, conf, src = _find_label_value(regions, ["SEX", "GENDER", "SEXE"])
        if val:
            v_upper = val.strip().upper()
            if v_upper.startswith("M") or v_upper == "HOMME":
                fields["gender"] = ExtractedField(name="gender", value="M", confidence=conf, source_text=src)
            elif v_upper.startswith("F") or v_upper == "FEMME":
                fields["gender"] = ExtractedField(name="gender", value="F", confidence=conf, source_text=src)
            else:
                fields["gender"] = ExtractedField(name="gender", value=v_upper, confidence=conf, source_text=src)

        # 7. Nationality
        nat_val, nat_conf, nat_src = _find_label_value(regions, ["NATIONALITY", "CITIZENSHIP", "NATIONAL"])
        if nat_val and len(nat_val.strip()) >= 2:
            fields["nationality"] = ExtractedField(name="nationality", value=nat_val.strip().upper(), confidence=nat_conf, source_text=nat_src)

        # 8. Dates (DOB, Valid From / Issue Date, Valid Until / Expiry Date)
        dob_val, dob_conf, dob_src = _find_label_value(regions, ["DOB", "DATE OF BIRTH", "BIRTH DATE", "BORN"])
        if dob_val:
            fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=dob_val.strip(), confidence=dob_conf, source_text=dob_src)

        doi_val, doi_conf, doi_src = _find_label_value(regions, ["VALID FROM", "DATE OF ISSUE", "ISSUE DATE", "FROM", "ISSUED ON"])
        if doi_val:
            fields["date_of_issue"] = ExtractedField(name="date_of_issue", value=doi_val.strip(), confidence=doi_conf, source_text=doi_src)

        exp_val, exp_conf, exp_src = _find_label_value(regions, ["VALID UNTIL", "EXPIRY DATE", "EXPIRATION", "EXPIRY", "UNTIL", "DATE OF EXPIRY"])
        if exp_val:
            fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=exp_val.strip(), confidence=exp_conf, source_text=exp_src)

        # 9. Passport Number reference
        val, conf, src = _find_label_value(regions, ["PASSPORT NO", "PASSPORT NUMBER", "PP NO", "DOC NO", "PASSPORT"])
        if val:
            fields["passport_number"] = ExtractedField(name="passport_number", value=val.strip().upper(), confidence=conf, source_text=src)

        # Store visual values before MRZ override for cross-validation
        for field_name in ["visa_number", "gender", "name", "surname", "given_name", "nationality", "date_of_birth", "date_of_expiry", "date_of_issue", "passport_number"]:
            if field_name in fields and fields[field_name].value:
                fields[f"visual_{field_name}"] = ExtractedField(
                    name=f"visual_{field_name}",
                    value=fields[field_name].value,
                    confidence=fields[field_name].confidence,
                    source_text=fields[field_name].source_text
                )

        # 10. MRZ Detection for Visas (ICAO Doc 9303 MRV-A 2x44 and MRV-B 2x36)
        mrz_candidates = []
        for r in regions:
            cleaned = r.text.replace(" ", "").upper()
            cleaned = cleaned.replace("(", "<").replace(")", "<").replace("[", "<").replace("]", "<").replace("{", "<").replace("}", "<").replace("«", "<").replace("—", "<").replace("_", "<")
            filtered = "".join([c for c in cleaned if c.isalnum() or c == "<"])
            if len(filtered) >= 25 and ("<" in filtered or filtered.startswith("V")):
                mrz_candidates.append(filtered)

        for line in raw.split("\n"):
            cleaned = line.replace(" ", "").upper()
            cleaned = cleaned.replace("(", "<").replace(")", "<").replace("[", "<").replace("]", "<").replace("{", "<").replace("}", "<").replace("«", "<").replace("—", "<").replace("_", "<")
            filtered = "".join([c for c in cleaned if c.isalnum() or c == "<"])
            if len(filtered) >= 25 and ("<" in filtered or filtered.startswith("V")):
                if filtered not in mrz_candidates:
                    mrz_candidates.append(filtered)

        line1_cand = None
        line2_cand = None
        for cand in mrz_candidates:
            if not line1_cand and (cand.startswith("V<") or (cand.startswith("V") and "<" in cand)):
                line1_cand = cand
            elif not line2_cand and cand != line1_cand:
                if re.search(r"[0-9]{6}", cand) or re.search(r"[0-9]{7}", cand):
                    line2_cand = cand

        if line1_cand and line2_cand:
            # Determine whether MRV-A (44 chars) or MRV-B (36 chars)
            max_len = max(len(line1_cand), len(line2_cand))
            target_len = 44 if max_len > 36 else 36
            visa_fmt = "MRV_A" if target_len == 44 else "MRV_B"
            
            line1_cand = line1_cand.ljust(target_len, "<")[:target_len]
            line2_cand = line2_cand.ljust(target_len, "<")[:target_len]

            fields["visa_format"] = ExtractedField(name="visa_format", value=visa_fmt, confidence=0.98)
            self._apply_visa_mrz(line1_cand, line2_cand, fields, visa_fmt)

        for key in VISA_FIELDS:
            if key not in fields:
                fields[key] = _empty(key)

        return fields

    def _apply_visa_mrz(self, line1: str, line2: str, fields: dict, visa_format: str) -> None:
        """
        Decodes ICAO Doc 9303 Part 7 Machine Readable Visa (MRV-A 2x44 or MRV-B 2x36).
        Line 1: V<INDLASTNAME<<FIRSTNAME<<<<<<<<<<<<<<<<<<<<<< (MRV-A)
                V<INDLASTNAME<<FIRSTNAME<<<<<<<<<<<< (MRV-B)
        Line 2: 12345678<0USA8608266M2606296<<<<<<<<<<<<<<<< (MRV-A)
                12345678<0USA8608266M2606296<<<<<<<< (MRV-B)
        """
        try:
            # Line 1: Issuing state and Name
            country = line1[2:5].replace("<", "")
            if country:
                fields["issuing_country"] = ExtractedField(name="issuing_country", value=country, confidence=0.98)

            name_raw = line1[5:]
            name_parts = name_raw.split("<<")
            surname = name_parts[0].replace("<", " ").strip() if len(name_parts) > 0 else ""
            given_names = name_parts[1].replace("<", " ").strip() if len(name_parts) > 1 else ""

            if surname:
                fields["surname"] = ExtractedField(name="surname", value=surname, confidence=0.98)
            if given_names:
                fields["given_name"] = ExtractedField(name="given_name", value=given_names, confidence=0.98)

            if surname and given_names:
                fields["name"] = ExtractedField(name="name", value=f"{surname} {given_names}", confidence=0.98)
            elif surname or given_names:
                fields["name"] = ExtractedField(name="name", value=(surname or given_names), confidence=0.98)

            # Line 2: Visa Number, Nationality, DOB, Gender, Expiry Date, Optional Data
            v_no = line2[0:9].replace("<", "")
            if v_no:
                fields["visa_number"] = ExtractedField(name="visa_number", value=v_no, confidence=0.98)

            if len(line2) >= 13:
                nat = line2[10:13].replace("<", "")
                if nat:
                    fields["nationality"] = ExtractedField(name="nationality", value=nat, confidence=0.98)

            if len(line2) >= 19:
                dob_raw = line2[13:19]
                if dob_raw.isdigit():
                    fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=dob_raw, confidence=0.98)

            if len(line2) > 20:
                sex = line2[20]
                if sex in ("M", "F", "X"):
                    fields["gender"] = ExtractedField(name="gender", value=sex, confidence=0.98)

            if len(line2) >= 27:
                exp_raw = line2[21:27]
                if exp_raw.isdigit():
                    fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=exp_raw, confidence=0.98)

            if len(line2) > 28:
                opt_data = line2[28:].replace("<", "")
                if opt_data:
                    fields["optional_data"] = ExtractedField(name="optional_data", value=opt_data, confidence=0.95)
                    # If optional data looks like a passport number reference (e.g. A1234567)
                    if re.match(r"^[A-Z][0-9]{7}$|^[A-Z]{2}[0-9]{6,7}$", opt_data) and not fields.get("passport_number"):
                        fields["passport_number"] = ExtractedField(name="passport_number", value=opt_data, confidence=0.95)

            fields["mrz_lines"] = ExtractedField(name="mrz_lines", value=f"{line1}\n{line2}", confidence=0.99)
        except Exception:
            pass


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
        
        # Sort regions vertically (top-to-bottom) using bounding box y-coordinates
        def get_y_coord(r: TextRegion) -> float:
            if r.bounding_box and r.bounding_box.points:
                return min(p[1] for p in r.bounding_box.points)
            return 0.0

        regions = sorted(ocr_result.regions, key=get_y_coord)
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
        name_val, name_conf, name_src = None, None, None

        # Helper to validate a candidate name string
        def is_valid_name(s: str) -> bool:
            if not s:
                return False
            s_clean = s.strip()
            if not s_clean:
                return False
            # Check for generic keywords
            s_upper = s_clean.upper()
            if any(h in s_upper for h in ["INDIA", "GOVERNMENT", "AUTHORITY", "UNIQUE", "IDENTIFICATION", "AADHAAR", "TO", "MOBILE", "PHONE", "TEL"]):
                return False
            # Names do not contain numbers
            if any(c.isdigit() for c in s_clean):
                return False
            # Name must not be extremely short
            if len(s_clean) < 3:
                return False
            # Names on Aadhaar cards should not contain commas or slashes
            if "," in s_clean or "\\" in s_clean or "/" in s_clean:
                return False
            # Name should primarily contain alphabetic characters and spaces
            letters_and_spaces = sum(c.isalpha() or c.isspace() or c == '.' for c in s_clean)
            if letters_and_spaces < len(s_clean) * 0.85:
                return False
            return True

        # 1. Try label-proximity search first
        val, conf, src = _find_label_value(regions, ["NAME", "NAAM"])
        if val and is_valid_name(val):
            name_val, name_conf, name_src = val, conf, src

        # 2. Heuristic: Aadhaar front side usually has Name right before the DOB region
        if not name_val:
            dob_idx = -1
            for idx, r in enumerate(regions):
                r_upper = r.text.upper()
                if "DOB" in r_upper or "DATE OF BIRTH" in r_upper or "JANM TITHI" in r_upper:
                    # Ignore common disclaimer words in Aadhaar card
                    if any(w in r_upper for w in ["PROOF", "DOCUMENT", "CITIZEN", "INFORMATION", "SUPPORTED", "REGULATION"]):
                        continue
                    dob_idx = idx
                    break
            if dob_idx > 0:
                prev_region = regions[dob_idx - 1]
                prev_text = prev_region.text.strip()
                if is_valid_name(prev_text):
                    name_val = prev_text
                    name_conf = prev_region.confidence
                    name_src = prev_region.text

        # 3. Heuristic: Aadhaar back side/address often starts with "To" or has "S/O", "D/O", "W/O", "C/O"
        if not name_val:
            for idx, r in enumerate(regions):
                r_upper = r.text.upper()
                if r_upper.startswith("TO"):
                    if idx + 1 < len(regions):
                        nxt_r = regions[idx + 1]
                        nxt_text = nxt_r.text.strip()
                        if is_valid_name(nxt_text) and not any(h in nxt_text.upper() for h in ["S/O", "D/O", "W/O", "C/O", "CARE OF"]):
                            name_val = nxt_text
                            name_conf = nxt_r.confidence
                            name_src = nxt_r.text
                            break
                elif any(x in r_upper for x in ["S/O", "D/O", "W/O", "C/O"]):
                    if idx > 0:
                        prev_r = regions[idx - 1]
                        prev_text = prev_r.text.strip()
                        if is_valid_name(prev_text):
                            name_val = prev_text
                            name_conf = prev_r.confidence
                            name_src = prev_r.text
                            break

        fields["name"] = ExtractedField(name="name", value=name_val, confidence=name_conf, source_text=name_src)

        # Date of birth
        dob_val, dob_conf, dob_src = None, None, None

        # 1. Find region containing "DOB" or "Birth" and a date/year (ignoring disclaimers)
        dob_pattern = re.compile(
            r"(?:DOB|Date of Birth|Birth|YOB|Year of Birth)[\s/:.-]*(\d{2}[/\-]\d{2}[/\-]\d{4}|\d{4})",
            re.IGNORECASE,
        )
        for region in regions:
            r_upper = region.text.upper()
            if any(w in r_upper for w in ["PROOF", "DOCUMENT", "CITIZEN", "INFORMATION", "SUPPORTED", "REGULATION"]):
                continue
            match = dob_pattern.search(region.text)
            if match:
                dob_val = match.group(1)
                dob_conf = region.confidence
                dob_src = region.text
                break

        # 2. Try to find a standalone date near a region containing "DOB" or "Date of Birth"
        if not dob_val:
            for i, region in enumerate(regions):
                upper = region.text.upper()
                if "DOB" in upper or "DATE OF BIRTH" in upper or "JANM TITHI" in upper:
                    if any(w in upper for w in ["PROOF", "DOCUMENT", "CITIZEN", "INFORMATION", "SUPPORTED", "REGULATION"]):
                        continue
                    dm = self._DOB_RE.search(region.text)
                    if dm:
                        dob_val = dm.group(0)
                        dob_conf = region.confidence
                        dob_src = region.text
                        break
                    if i + 1 < len(regions):
                        nxt = regions[i + 1]
                        # check that the next region is not disclaimer
                        nxt_upper = nxt.text.upper()
                        if any(w in nxt_upper for w in ["PROOF", "DOCUMENT", "CITIZEN", "INFORMATION", "SUPPORTED", "REGULATION"]):
                            continue
                        dm = self._DOB_RE.search(nxt.text)
                        if dm:
                            dob_val = dm.group(0)
                            dob_conf = nxt.confidence
                            dob_src = nxt.text
                            break

        # 3. Fallback to searching raw text for a date
        if not dob_val:
            dm = self._DOB_RE.search(raw)
            if dm:
                dob_val = dm.group(0)
                dob_conf = _get_confidence_for_match(dob_val, regions)
                dob_src = dob_val

        fields["date_of_birth"] = ExtractedField(
            name="date_of_birth", value=dob_val, confidence=dob_conf, source_text=dob_src
        )

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
    Example: GJ0620230002129 / MH0120200034761
    """

    _DL_RE = re.compile(
        r"\b([A-Z]{2}[\s\-]?[0-9]{2}[\s\-]?(?:19|20)[0-9]{2}[\s\-]?[0-9]{7})\b",
        re.IGNORECASE,
    )
    _DOB_RE = re.compile(r"\b(\d{2}[/\-.]\d{2}[/\-.]\d{4})\b")
    _VEHICLE_CLASS_RE = re.compile(
        r"\b(LMV|MCWG|MCWOG|HPMV|HTV|HGV|MGV|LPV|LDRXCV|ADAPT|TR|NT)\b",
        re.IGNORECASE,
    )

    def extract(self, ocr_result: OCRResult) -> dict[str, ExtractedField]:
        raw = ocr_result.raw_text
        regions = ocr_result.regions
        fields: dict[str, ExtractedField] = {}

        # 1. License number — normalise spaces/hyphens
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

        # Helper to validate clean personal name (reject signatures and government headers)
        def is_clean_name(val_str: str | None) -> bool:
            if not val_str:
                return False
            clean = val_str.strip().upper()
            noise = [
                "SIGNATURE", "HOLDER", "HOLDER'S SIGNATURE", "SIGN", "LICENCE", "LICENSE",
                "DRIVING", "UNION", "INDIAN", "GUJARAT", "MAHARASHTRA", "GOVERNMENT",
                "STATE", "AUTHORITY", "TRANSPORT", "MINISTRY", "MORTH", "SARATHI",
                "SON", "DAUGHTER", "WIFE", "S/O", "D/O", "W/O", "DATE", "ISSUE",
                "EXPIRY", "VALIDITY", "CLASS", "ADDRESS", "BLOOD", "GROUP", "DONOR"
            ]
            if any(n in clean for n in ["SIGNATURE", "LICENCE", "LICENSE", "GOVERNMENT", "GUJARAT", "INDIAN UNION"]):
                return False
            if any(clean == n for n in noise):
                return False
            if len(clean) < 3:
                return False
            letters_spaces = sum(c.isalpha() or c.isspace() or c == '.' for c in clean)
            return letters_spaces >= len(clean) * 0.85

        # 2. Name Extraction
        name_val, name_conf, name_src = None, None, None

        # Look in regions for "Name :" or "Name" label specifically (not Holder)
        for r in regions:
            r_text = r.text.strip()
            # Match "Name : PARTH PATHAK" or "Name: PARTH PATHAK"
            m_name = re.search(r"^(?:Name|Full\s*Name|Naam)\s*[:\s\-]+([A-Za-z\s.\-]{3,40})$", r_text, re.IGNORECASE)
            if m_name and is_clean_name(m_name.group(1)):
                name_val = m_name.group(1).strip().upper()
                name_conf = r.confidence
                name_src = r.text
                break

        if not name_val:
            val, conf, src = _find_label_value(regions, ["NAME", "NAAM"])
            if val and is_clean_name(val):
                name_val = val.strip().upper()
                name_conf = conf
                name_src = src

        if not name_val:
            m_raw = re.search(r"\bName\s*[:\s\-]+([A-Z\s.\-]{3,40})\b", raw, re.IGNORECASE)
            if m_raw and is_clean_name(m_raw.group(1)):
                name_val = m_raw.group(1).strip().upper()
                name_conf = _get_confidence_for_match(name_val, regions)
                name_src = m_raw.group(0)

        fields["name"] = ExtractedField(name="name", value=name_val, confidence=name_conf, source_text=name_src)

        # 3. All Dates Collection for Smart Chronological & Label-Based Resolution
        all_dates_found = re.findall(r"\b(\d{2}[/\-.]\d{2}[/\-.]\d{4})\b", raw)
        parsed_dates = []
        for d_str in all_dates_found:
            try:
                from dateutil import parser as d_parser
                parsed_dates.append((d_parser.parse(d_str, dayfirst=True).date(), d_str))
            except Exception:
                pass
        parsed_dates = sorted(list(set(parsed_dates)), key=lambda x: x[0])

        # 4. Date of Birth
        dob_val, dob_conf, dob_src = None, None, None
        for r in regions:
            m_dob = re.search(r"(?:Date\s*Of\s*Birth|DOB|Birth\s*Date|Janm\s*Tithi)\s*[:\s\-]*(\d{2}[/\-.]\d{2}[/\-.]\d{4})", r.text, re.IGNORECASE)
            if m_dob:
                dob_val = m_dob.group(1).replace(".", "-").replace("/", "-")
                dob_conf = r.confidence
                dob_src = r.text
                break

        if not dob_val:
            val, conf, src = _find_label_value(regions, ["DOB", "DATE OF BIRTH", "BIRTH DATE", "BIRTH"])
            if val:
                dm = self._DOB_RE.search(val)
                if dm:
                    dob_val = dm.group(0).replace(".", "-").replace("/", "-")
                    dob_conf = conf
                    dob_src = src

        if not dob_val and parsed_dates:
            from datetime import date
            today = date.today()
            past_dates = [d for d in parsed_dates if d[0] < today]
            if past_dates:
                dob_val = past_dates[0][1].replace(".", "-").replace("/", "-")
                dob_conf = 0.92

        fields["date_of_birth"] = ExtractedField(name="date_of_birth", value=dob_val, confidence=dob_conf, source_text=dob_src)

        # 5. Date of Issue
        doi_val, doi_conf, doi_src = None, None, None
        for r in regions:
            m_doi = re.search(r"(?:Issue\s*Date|Date\s*Of\s*First\s*Issue|Date\s*of\s*Issue|Issued\s*On|DOI)\s*[:\s\-]*(\d{2}[/\-.]\d{2}[/\-.]\d{4})", r.text, re.IGNORECASE)
            if m_doi:
                doi_val = m_doi.group(1).replace(".", "-").replace("/", "-")
                doi_conf = r.confidence
                doi_src = r.text
                break

        if not doi_val:
            val, conf, src = _find_label_value(regions, ["ISSUE DATE", "DATE OF FIRST ISSUE", "DATE OF ISSUE", "ISSUED ON", "DOI", "ISSUE"])
            if val:
                dm = self._DOB_RE.search(val)
                if dm:
                    doi_val = dm.group(0).replace(".", "-").replace("/", "-")
                    doi_conf = conf
                    doi_src = src

        if not doi_val and len(parsed_dates) >= 2:
            from datetime import date
            today = date.today()
            past_dates = [d for d in parsed_dates if d[0] < today and d[1].replace(".", "-").replace("/", "-") != dob_val]
            if past_dates:
                doi_val = past_dates[-1][1].replace(".", "-").replace("/", "-")
                doi_conf = 0.88

        fields["date_of_issue"] = ExtractedField(name="date_of_issue", value=doi_val, confidence=doi_conf, source_text=doi_src)

        # 6. Date of Expiry / Validity
        exp_val, exp_conf, exp_src = None, None, None
        for r in regions:
            m_exp = re.search(r"(?:Validity\s*(?:\(\s*[A-Z]+\s*\))?|Valid\s*(?:Till|Upto|Until)|Expiry\s*Date|Date\s*of\s*Expiry|Expires)\s*[:\s\-]*(\d{2}[/\-.]\d{2}[/\-.]\d{4})", r.text, re.IGNORECASE)
            if m_exp:
                exp_val = m_exp.group(1).replace(".", "-").replace("/", "-")
                exp_conf = r.confidence
                exp_src = r.text
                break

        if not exp_val:
            val, conf, src = _find_label_value(
                regions, ["VALIDITY ( NT )", "VALIDITY ( TR )", "VALIDITY(NT)", "VALIDITY(TR)", "VALIDITY", "VALID TILL", "VALID UPTO", "EXPIRY", "EXP", "EXPIRES"]
            )
            if val:
                dm = self._DOB_RE.search(val)
                if dm:
                    exp_val = dm.group(0).replace(".", "-").replace("/", "-")
                    exp_conf = conf
                    exp_src = src

        if not exp_val and parsed_dates:
            from datetime import date
            today = date.today()
            future_dates = [d for d in parsed_dates if d[0] >= today]
            if future_dates:
                exp_val = future_dates[-1][1].replace(".", "-").replace("/", "-")
                exp_conf = 0.94
            elif len(parsed_dates) >= 2:
                exp_val = parsed_dates[-1][1].replace(".", "-").replace("/", "-")
                exp_conf = 0.85

        fields["date_of_expiry"] = ExtractedField(name="date_of_expiry", value=exp_val, confidence=exp_conf, source_text=exp_src)

        # 7. Vehicle class
        val, conf, src = _find_label_value(regions, ["CLASS", "VEHICLE CLASS", "COV", "CATEGORY"])
        classes_found = re.findall(r"\b(LMV|MCWG|MCWOG|HPMV|HTV|HGV|MGV|LPV|LDRXCV|ADAPT|TR|NT)\b", raw, re.IGNORECASE)
        if classes_found:
            val = ", ".join(list(dict.fromkeys([c.upper() for c in classes_found])))
            conf = 0.95
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
