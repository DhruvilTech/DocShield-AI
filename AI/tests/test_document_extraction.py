from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from document_detection.ocr.models import OCRResult, TextRegion
from document_detection.ocr.extractor import (
    PassportFieldExtractor, VisaFieldExtractor,
    NationalIDFieldExtractor, DrivingLicenseFieldExtractor, PermitFieldExtractor,
    PASSPORT_FIELDS, VISA_FIELDS, NATIONAL_ID_FIELDS, DRIVING_LICENSE_FIELDS, PERMIT_FIELDS,
)


def make_ocr(texts: list, confidence: float = 0.95) -> OCRResult:
    regions = [TextRegion(text=t, confidence=confidence) for t in texts]
    return OCRResult(
        raw_text=chr(10).join(texts),
        regions=regions,
        confidence=confidence,
        engine_used="paddleocr",
    )


def test_passport_extractor_returns_all_six_keys():
    ocr = make_ocr(["SURNAME: DOE", "PASSPORT NO: A1234567", "NATIONALITY: USA",
                     "DOB: 15 JAN 1985", "EXPIRY: 20 MAR 2030", "SEX: M"])
    fields = PassportFieldExtractor().extract(ocr)
    for key in PASSPORT_FIELDS:
        assert key in fields, f"Missing key: {key}"


def test_passport_extractor_extracts_passport_number():
    ocr = make_ocr(["PASSPORT NO: A1234567"])
    fields = PassportFieldExtractor().extract(ocr)
    assert fields["passport_number"].value == "A1234567"


def test_passport_extractor_extracts_gender():
    ocr = make_ocr(["SEX: M"])
    fields = PassportFieldExtractor().extract(ocr)
    assert fields["gender"].value == "M"


def test_passport_extractor_returns_none_for_missing_fields():
    ocr = make_ocr(["SOME RANDOM TEXT"])
    fields = PassportFieldExtractor().extract(ocr)
    for key in PASSPORT_FIELDS:
        assert key in fields


def test_passport_extractor_does_not_mutate_ocr_result():
    ocr = make_ocr(["A1234567"])
    original_text = ocr.raw_text
    original_count = len(ocr.regions)
    PassportFieldExtractor().extract(ocr)
    assert ocr.raw_text == original_text
    assert len(ocr.regions) == original_count


def test_passport_extractor_empty_ocr():
    ocr = OCRResult(raw_text="", regions=[], confidence=None, engine_used="paddleocr")
    fields = PassportFieldExtractor().extract(ocr)
    for key in PASSPORT_FIELDS:
        assert key in fields
        assert fields[key].value is None


def test_visa_extractor_returns_all_four_keys():
    ocr = make_ocr(["VISA NUMBER: V1234567", "VISA TYPE: Tourist",
                     "ENTRY: single", "DURATION: 30 days"])
    fields = VisaFieldExtractor().extract(ocr)
    for key in VISA_FIELDS:
        assert key in fields


def test_visa_extractor_empty_ocr():
    ocr = OCRResult(raw_text="", regions=[], confidence=None, engine_used="paddleocr")
    fields = VisaFieldExtractor().extract(ocr)
    for key in VISA_FIELDS:
        assert key in fields
        assert fields[key].value is None


def test_national_id_extractor_empty_ocr():
    ocr = OCRResult(raw_text="", regions=[], confidence=None, engine_used="paddleocr")
    fields = NationalIDFieldExtractor().extract(ocr)
    for key in NATIONAL_ID_FIELDS:
        assert key in fields
        assert fields[key].value is None


def test_driving_license_extractor_empty_ocr():
    ocr = OCRResult(raw_text="", regions=[], confidence=None, engine_used="paddleocr")
    fields = DrivingLicenseFieldExtractor().extract(ocr)
    for key in DRIVING_LICENSE_FIELDS:
        assert key in fields
        assert fields[key].value is None


def test_permit_extractor_empty_ocr():
    ocr = OCRResult(raw_text="", regions=[], confidence=None, engine_used="paddleocr")
    fields = PermitFieldExtractor().extract(ocr)
    for key in PERMIT_FIELDS:
        assert key in fields
        assert fields[key].value is None


def test_new_format_indian_passport_mrz_extraction():
    line1 = "P<INDPATHAK<<PARTH<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    line2 = "AT983807<0IND0608266M36062963067652860226<36"
    ocr = make_ocr([line1, line2])
    fields = PassportFieldExtractor().extract(ocr)
    assert fields["passport_number"].value == "AT983807"
    assert fields["name"].value == "PATHAK PARTH"
    assert fields["nationality"].value == "IND"
    assert fields["date_of_birth"].value == "060826"
    assert fields["gender"].value == "M"
    assert fields["date_of_expiry"].value == "360629"
    assert fields.get("personal_number") is not None
    assert fields["personal_number"].value == "3067652860226"


def test_old_format_indian_passport_mrz_extraction():
    line1 = "P<INDPATHAK<<MAULIKKUMAR<ARUNKUMAR<<<<<<<<<<<"
    line2 = "E7251023<2IND8101246M13111303<<<<<<<<<<<<<<2"
    ocr = make_ocr([line1, line2])
    fields = PassportFieldExtractor().extract(ocr)
    assert fields["passport_number"].value == "E7251023"
    assert fields["name"].value == "PATHAK MAULIKKUMAR ARUNKUMAR"
    assert fields["nationality"].value == "IND"
    assert fields["date_of_birth"].value == "810124"
    assert fields["gender"].value == "M"
    assert fields["date_of_expiry"].value == "131113"


def test_new_format_indian_passport_visual_layout_extraction():
    texts = [
        "type: P  Code: IND  Nationality: INDIAN  Passport No.: AT983807",
        "Surname: PATHAK",
        "Given Name: PARTH",
        "Date of Birth: 26/08/2006  Sex: M",
        "Place of Birth: AHMEDABAD",
        "Place of Issue: AHMEDABAD",
        "Date of Issue: 30/06/2026",
        "Date of Expiry: 29/06/2036",
    ]
    ocr = make_ocr(texts)
    fields = PassportFieldExtractor().extract(ocr)
    assert fields["passport_number"].value == "AT983807"
    assert fields["nationality"].value == "INDIAN"
    assert fields["date_of_birth"].value == "26/08/2006"
    assert fields["gender"].value == "M"
    assert fields["date_of_expiry"].value == "29/06/2036"
    assert "PARTH" in fields["name"].value
    assert "PATHAK" in fields["name"].value


def test_old_format_indian_passport_visual_layout_extraction():
    texts = [
        "type: P  Country Code: IND  Passport No.: E7251023",
        "Surname: PATHAK",
        "Given Name: MAULIKKUMAR ARUNKUMAR",
        "Nationality: INDIAN  Sex: M  Date of Birth: 24/01/1981",
        "Place of Birth: AHMEDABAD",
        "Place of issue: AHMEDABAD",
        "Date of Issue: 14/11/2003  Date of Expiry: 13/11/2013",
    ]
    ocr = make_ocr(texts)
    fields = PassportFieldExtractor().extract(ocr)
    assert fields["passport_number"].value == "E7251023"
    assert fields["nationality"].value == "INDIAN"
    assert fields["date_of_birth"].value == "24/01/1981"
    assert fields["gender"].value == "M"
    assert fields["date_of_expiry"].value == "13/11/2013"
    assert "MAULIKKUMAR" in fields["name"].value
    assert "PATHAK" in fields["name"].value


def test_bilingual_french_indian_passport_extraction():
    # Test OCR scenario with bilingual English/French labels and separate value boxes
    texts = [
        "Type / Type: P  Code / Code: IND  Passport No. / No du passeport: AT983807",
        "Nationality / Nationalité: INDIAN",
        "Surname / Nom",
        "PATHAK",
        "Given Name(s) / Prénoms",
        "PARTH",
        "Sex / Sexe: M",
        "Date of Birth / Date de naissance: 26/08/2006",
        "Place of Birth / Lieu de naissance: VADODARA , GUJARAT",
        "Place of Issue / Lieu de délivrance: AHMEDABAD",
        "Date of Issue / Date de délivrance: 30/06/2026",
        "Date of Expiry / Date d'expiration: 29/06/2036",
        "P<INDPATHAK<<PARTH<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "AT983807<0IND0608266M36062963067652860226<36",
    ]
    ocr = make_ocr(texts)
    fields = PassportFieldExtractor().extract(ocr)
    assert fields["passport_number"].value == "AT983807"
    assert fields["nationality"].value == "IND"
    assert fields["visual_nationality"].value == "INDIAN"
    assert fields["gender"].value == "M"
    assert fields["visual_gender"].value == "M"
    assert fields["date_of_birth"].value == "060826"
    assert fields["visual_date_of_birth"].value == "26/08/2006"
    assert fields["date_of_expiry"].value == "360629"
    assert fields["visual_date_of_expiry"].value == "29/06/2036"
    assert fields["surname"].value == "PATHAK"
    assert fields["given_name"].value == "PARTH"
    assert fields["name"].value == "PATHAK PARTH"
    assert fields["visual_name"].value == "PARTH PATHAK"
    assert fields["visual_place_of_birth"].value == "VADODARA , GUJARAT"


