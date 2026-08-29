# DocShield AI

AI-powered Indian government document screening backend — OCR + field extraction + validation.

## Supported Documents
| Document | Key Validations |
|---|---|
| `passport` | Number format (MEA), MRZ, nationality=IND, date checks |
| `visa` | Number format (sticker/e-Visa), type, entry, stay duration |
| `national_id` | Aadhaar 12-digit format + **Verhoeff checksum**, DOB |
| `driving_license` | MoRTH 15-char format, all 37 state codes, date checks |
| `permit` | MoRTH format, Motor Vehicles Act permit types, Bharat Series plate |

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env   # edit as needed
```

## Run

```bash
uvicorn app.main:app --reload
```

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/ready` | Readiness probe (OCR engine loaded) |
| `GET` | `/api/v1/document-types` | List supported document types |
| `POST` | `/api/v1/screen-document` | Screen a document image |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/redoc` | ReDoc UI |

## Screen a Document

```bash
curl -X POST http://localhost:8000/api/v1/screen-document \
  -F "file=@aadhaar.jpg" \
  -F "document_type=national_id"
```

## Run Tests

```bash
pip install -r requirements-dev.txt
pytest tests/ -v
```

## Project Structure

```
app/
├── main.py                  # FastAPI app, middleware, exception handlers
├── api/
│   ├── routes.py            # POST /screen-document, GET /document-types
│   └── schemas.py           # Typed Pydantic response models
├── common/
│   ├── exceptions.py        # Domain exceptions
│   ├── logging.py           # Privacy-safe Loguru logger
│   └── middleware.py        # X-Request-ID middleware
├── config/
│   ├── settings.py          # Pydantic-settings (env-driven config)
│   └── rules/               # Per-document JSON validation rules
│       ├── passport_rules.json
│       ├── visa_rules.json
│       ├── national_id_rules.json
│       ├── driving_license_rules.json
│       └── permit_rules.json
├── ocr/
│   ├── base.py              # BaseOCREngine interface
│   ├── paddle_engine.py     # PaddleOCR adapter
│   ├── normalizer.py        # Raw PaddleOCR → OCRResult
│   ├── models.py            # OCRResult, TextRegion, BoundingBox
│   ├── extractor.py         # Field extractors for all 5 document types
│   └── service.py           # OCR pipeline orchestration
├── preprocessing/
│   └── image.py             # CLAHE + deskew image enhancement
├── schemas/
│   └── document.py          # DocumentType enum
└── validation/
    ├── base.py              # BaseDocumentValidator interface
    ├── models.py            # CheckStatus, FieldCheck, ValidationResult
    ├── rules.py             # JSON rule loader + cache
    ├── service.py           # Validator registry + orchestration
    ├── passport.py          # Passport validator
    ├── visa.py              # Visa validator
    ├── national_id.py       # Aadhaar validator (Verhoeff checksum)
    ├── driving_license.py   # DL validator (MoRTH + state codes)
    └── permit.py            # Permit validator (Motor Vehicles Act)
```
