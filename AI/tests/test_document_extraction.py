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
    assert fields["passport_format"].value == "NEW_FORMAT"
    assert fields["nationality"].value == "INDIAN"
    assert fields["date_of_birth"].value == "26/08/2006"
    assert fields["gender"].value == "M"
    assert fields["date_of_expiry"].value == "29/06/2036"
    assert fields["place_of_birth"].value == "AHMEDABAD"
    assert fields["place_of_issue"].value == "AHMEDABAD"
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
    assert fields["passport_format"].value == "OLD_FORMAT"
    assert fields["nationality"].value == "INDIAN"
    assert fields["date_of_birth"].value == "24/01/1981"
    assert fields["gender"].value == "M"
    assert fields["date_of_expiry"].value == "13/11/2013"
    assert fields["place_of_birth"].value == "AHMEDABAD"
    assert fields["place_of_issue"].value == "AHMEDABAD"
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
    assert fields["passport_format"].value == "NEW_FORMAT"
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
    assert fields["visual_place_of_issue"].value == "AHMEDABAD"


def test_indian_gujarat_driving_license_extraction():
    texts = [
        "Indian Union Driving Licence",
        "Issued by Government of Gujarat  GJ",
        "GJ06 20230002129",
        "Issue Date    Validity ( NT )    Validity ( TR )",
        "04-02-2023    25-08-2046",
        "Date Of First Issue 04-02-2023",
        "Holder's Signature",
        "Name : PARTH PATHAK",
        "Date Of Birth : 26-08-2006   Blood Group :",
        "Son/Daughter/Wife of : MAULIK PATHAK",
        "Address",
        "A-2/42 DWARKANAGARI SOCIETY,",
        "BH HARIGANGA SOCIETY,",
        "WAGHODIA ROAD, 390019",
    ]
    ocr = make_ocr(texts)
    fields = DrivingLicenseFieldExtractor().extract(ocr)
    assert fields["license_number"].value == "GJ0620230002129"
    assert fields["name"].value == "PARTH PATHAK"
    assert fields["date_of_birth"].value == "26-08-2006"
    assert fields["date_of_issue"].value == "04-02-2023"
    assert fields["date_of_expiry"].value == "25-08-2046"


def test_visa_mrz_extraction_mrv_a():
    texts = [
        "EMBASSY OF INDIA, WASHINGTON DC",
        "VISA / VISA",
        "Visa No: 12345678",
        "Type: Tourist",
        "Entries: Multiple",
        "Duration: 90 Days",
        "Name of Bearer: JOHN DOE",
        "V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "12345678<8USA8501019M30010191234567890123456",
    ]
    ocr = make_ocr(texts)
    fields = VisaFieldExtractor().extract(ocr)
    assert fields["visa_number"].value == "12345678"
    assert fields["visa_type"].value.upper() == "TOURIST"
    assert fields["entry_validation"].value == "Multiple"
    assert fields["stay_duration"].value == "90 Days"
    assert fields["visa_format"].value == "MRV_A"
    assert fields["nationality"].value == "USA"
    assert fields["date_of_birth"].value == "850101"
    assert fields["date_of_expiry"].value == "300101"
    assert fields["gender"].value == "M"
    assert fields["surname"].value == "DOE"
    assert fields["given_name"].value == "JOHN"
    assert fields["name"].value == "DOE JOHN"
    assert fields["visual_visa_number"].value == "12345678"
    assert fields["visual_name"].value == "JOHN DOE"


def test_visa_mrz_extraction_mrv_b():
    texts = [
        "CONSULATE GENERAL OF INDIA",
        "VISA",
        "Visa No: V9876543",
        "Type: Business",
        "Entries: Single",
        "Stay: 30 Days",
        "V<INDDOE<<JANE<<<<<<<<<<<<<<<<<<<<<<",
        "V9876543<2GBR9005154F2812318<<<<<<<<",
    ]
    ocr = make_ocr(texts)
    fields = VisaFieldExtractor().extract(ocr)
    assert fields["visa_number"].value == "V9876543"
    assert fields["visa_format"].value == "MRV_B"
    assert fields["nationality"].value == "GBR"
    assert fields["date_of_birth"].value == "900515"
    assert fields["gender"].value == "F"
    assert fields["surname"].value == "DOE"
    assert fields["given_name"].value == "JANE"


def test_arunachal_pradesh_eilp_permit_extraction():
    texts = [
        "Government of Arunachal Pradesh",
        "(Temporary Single Inner Line Permit for Indian Nationals)",
        "eILP No",
        "0220353191611566",
        "Caution: Entering the Check Gate of Arunachal Pradesh along with this eILP Pass.",
        "Name : Mohd Shabbir",
        "Permanent Address : Chaman Colony, Chandigarh, Chandigarh",
        "Identification mark : Mole In Face",
        "Reference details : Punyo Hinda 8794414609",
        "Gender : Male",
        "Date of birth : 20-11-1985",
        "Occupation : Labour",
        "Document Verified : Voter ID Card",
        "Place of visit : Lower Subansiri",
        "Check Gate : Khemin, Gumto, Gumto Railway Station",
        "Date of visit : 21-10-2022",
        "Type of visit : Business",
        "Date of return : 19-11-2022",
        "Place of Issue : DC Lower Subansiri District",
        "Permit Type : Single",
        "Issuing Authority : DC Lower Subansiri",
        "Date of Issue : 21-10-2022",
    ]
    ocr = make_ocr(texts)
    fields = PermitFieldExtractor().extract(ocr)
    assert fields["permit_number"].value == "0220353191611566"
    assert fields["name"].value == "Mohd Shabbir"
    assert fields["permit_type"].value in ["single", "temporary", "inner-line", "business"]
    assert fields["date_of_expiry"].value == "19-11-2022"


def test_aadhaar_bilingual_dual_card_extraction():
    from document_detection.ocr.models import BoundingBox

    def make_box(x, y, w, h):
        return BoundingBox(points=[[float(x), float(y)], [float(x+w), float(y)], [float(x+w), float(y+h)], [float(x), float(y+h)]])

    texts_with_boxes = [
        # Front Card (Left side)
        ("Government of India", make_box(80, 50, 220, 25)),
        ("પાઠક ધ્રુવ", make_box(160, 180, 120, 22)),
        ("Pathak Dhruv", make_box(160, 210, 140, 22)),
        ("જન્મ તારીખ/DOB: 17/01/2007", make_box(160, 240, 180, 22)),
        ("પુરુષ/ MALE", make_box(160, 270, 100, 22)),
        ("9291 5516 7527", make_box(150, 380, 200, 30)),
        ("મારો આધાર, મારી ઓળખ", make_box(100, 420, 200, 20)),
        # Back Card (Right side)
        ("Unique Identification Authority of India", make_box(550, 50, 300, 25)),
        ("સરનામું :", make_box(500, 160, 60, 20)),
        ("S/O પાઠક બિપીનકુમાર, 201, ભારદ્વાજ...", make_box(500, 185, 250, 20)),
        ("Address:", make_box(500, 230, 70, 20)),
        ("S/O Pathak Bipinkumar, 201, bhardwaj", make_box(500, 255, 260, 20)),
        ("heights, near aditya park, jambuva,", make_box(500, 280, 260, 20)),
        ("Vadodara, PO: Makarpura, DIST: Vadodara,", make_box(500, 305, 270, 20)),
        ("Gujarat - 390014", make_box(500, 330, 150, 20)),
        ("9291 5516 7527", make_box(650, 380, 200, 30)),
        ("VID : 9134 8166 4713 9809", make_box(650, 420, 220, 25)),
    ]

    regions = [TextRegion(text=t, bounding_box=b, confidence=0.96) for t, b in texts_with_boxes]
    ocr = OCRResult(
        raw_text="\n".join(t for t, _ in texts_with_boxes),
        regions=regions,
        confidence=0.96,
        engine_used="paddleocr"
    )

    fields = NationalIDFieldExtractor().extract(ocr)
    assert fields["name"].value == "Pathak Dhruv"
    assert fields["id_number"].value == "929155167527"
    assert fields["date_of_birth"].value == "17/01/2007"
    assert fields["gender"].value == "MALE"
    assert "Pathak Bipinkumar" in fields["address"].value
    assert "390014" in fields["address"].value
    assert fields["pin_code"].value == "390014"






