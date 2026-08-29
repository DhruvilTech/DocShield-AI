# DocShield AI — Document Tampering Forensic Analysis Engine

## Phase 1: Forensic Image Processing Foundation

This directory houses the Python-based Document Tampering and Forensic Analysis module for the **DocShield AI** platform. 

> [!WARNING]
> **Phase 1 Limitation:** This foundation phase handles validation, preprocessing, scaling, color space extraction, and high-frequency noise residual generation. **It does not perform active tampering detection.** All future detection signal scores (ELA, noise, copy-move, metadata, stamps, splicing) will be returned as `null` with `available = false`.

---

## Folder Structure

```
AI/
└── Image_Tampering/
    ├── app/
    │   ├── __init__.py
    │   ├── main.py                     # FastAPI application layer
    │   │
    │   ├── forensic/
    │   │   ├── __init__.py
    │   │   ├── pipeline.py             # Orchestrates the image processing foundation
    │   │   ├── preprocessing.py        # Safe loading, EXIF correction, resizing, coordinate mapping
    │   │   ├── quality.py              # Quality calculations (brightness, contrast, sharpness, blur flag)
    │   │   ├── representations.py      # Conversions (Grayscale, HSV, LAB, Noise Residual)
    │   │   │
    │   │   ├── ela.py                  # [Future] ELA Analysis Placeholder
    │   │   ├── noise.py                # [Future] Noise Inconsistency Placeholder
    │   │   ├── copy_move.py            # [Future] Copy-Move Detector Placeholder
    │   │   ├── metadata.py             # [Future] Metadata Forensics Placeholder
    │   │   ├── stamp.py                # [Future] Stamp Tampering Placeholder
    │   │   ├── splicing.py             # [Future] Splicing Detector Placeholder
    │   │   └── fusion.py               # [Future] AI/ML Signal Fusion Placeholder
    │   │
    │   └── schemas/
    │       ├── __init__.py
    │       └── forensic.py             # Pydantic schemas validating API payloads
    │
    ├── tests/                          # Suite of automated pytest scripts
    │   ├── test_preprocessing.py
    │   └── test_quality.py
    │
    ├── samples/                        # Mock clean and tampered document images
    │   ├── clean/
    │   └── tampered/
    │
    ├── outputs/
    │   └── debug/                      # Generated visual debug images
    │
    ├── test_pipeline.py                # CLI test runner script
    ├── generate_samples.py             # Helper to build mock passport and documents
    ├── requirements.txt                # CPU-friendly package dependencies
    └── README.md                       # Documentation
```

---

## Preprocessing & Pipeline Architecture

The pipeline processes input images through sequential, isolated modules to ensure speed, CPU compatibility, and safety:

```
INPUT DOCUMENT
     ↓
IMAGE VALIDATION         (Format check, file size limits, corruption detection)
     ↓
IMAGE LOADING            (Safe loading, alpha-channel flattening to white background)
     ↓
ORIENTATION CORRECTION   (Auto-rotation using EXIF headers)
     ↓
RESOLUTION SCALING       (Preserves aspect ratio, caps dimensions to max 1600px, computes CoordinateMapper)
     ↓
COLOR REPRESENTATIONS    (Extracts RGB, Grayscale, HSV, and LAB representations)
     ↓
NOISE RESIDUAL MAP       (Computes high-frequency details: Original Grayscale - Gaussian Blur)
     ↓
QUALITY METRIC CALC      (Computes mean brightness, contrast, sharpness via Laplacian variance, and blur status)
     ↓
FORENSIC SIGNAL BUNDLING (Fills and returns the standard ForensicResult Pydantic schema)
```

### Coordinate Mapping

When processing high-resolution scans on CPU-friendly dev servers, downscaling is necessary. The `CoordinateMapper` class tracks the exact spatial mapping:

$$scale_x = \frac{width_{working}}{width_{original}}$$
$$scale_y = \frac{height_{working}}{height_{original}}$$

This ensures that whenever future modules locate suspicious regions in the working image, the bounding boxes can be mapped back to the original document coordinates with pixel accuracy.

---

## Installation & Setup

Ensure Python 3.10+ is installed on your system. Run these commands from the `AI/Image_Tampering/` folder:

1. **Set up a Virtual Environment**:
   ```bash
   python -m venv venv
   ```

2. **Activate the Environment**:
   - **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   - **macOS/Linux**:
     ```bash
     source venv/bin/activate
     ```

3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

---

## Running Phase 1

### 1. Generate Mock Images
To run pipeline tests, you can generate mock passport and certificate documents by running:
```bash
python generate_samples.py
```
This generates mock documents under `samples/clean/` and `samples/tampered/`.

### 2. Run the CLI Test Runner
Execute the test runner script against any document image:
```bash
python test_pipeline.py samples/clean/passport.jpg
```

**Example Output**:
```
========================================
DOCSHIELD AI — PHASE 1 TEST
========================================
Input:
samples/clean/passport.jpg

Image:
  Width: 1920
  Height: 1080
  Channels: 3
  Format: JPEG

Working Image:
  Width: 1600
  Height: 900

Quality:
  Brightness: 233.9
  Contrast: 34.0
  Sharpness: 413.7
  Blur Detected: False

Representations:
  Grayscale: ✓
  HSV: ✓
  LAB: ✓
  Noise Residual: ✓

Forensic Signals:
  ELA: Not implemented
  Noise: Not implemented
  Copy-Move: Not implemented
  Metadata: Not implemented
  Stamp: Not implemented
  Splicing: Not implemented

Fusion:
  Score: Not available
  Risk Level: Not available

Debug files:
  outputs/debug/document_processed.jpg
  outputs/debug/document_gray.jpg
  outputs/debug/document_noise_residual.jpg

========================================
PHASE 1 TEST PASSED
========================================
```

### 3. Check Visual Debug Outputs
Open the `outputs/debug/` folder to manually verify output results:
- `document_processed.jpg`: The resolution-normalized image (max 1600px).
- `document_gray.jpg`: The grayscale conversion.
- `document_noise_residual.jpg`: Visualizes high-frequency noise deviations.

### 4. Running the Web API
To start the FastAPI web server for API-based interaction:
```bash
uvicorn app.main:app --reload
```
Once started, you can access the Swagger documentation at `http://127.0.0.1:8000/docs` to test `/analyze` and `/health` endpoints.

---

## Automated Tests

To run the automated verification test suite:
```bash
python -m pytest tests/
```

All 13 tests covering loaders, resizing, coordinate translation, quality metrics, and formats must pass.

---

## Integration Plan for Future Modules

The Phase 1 architecture is engineered to easily receive future detection modules without modifying core loading logic:

### 1. ELA (Error Level Analysis)
* **Integration**: In `app/forensic/ela.py`, we will save the working image at a specific JPEG quality (e.g. 95%), reload it, compute the absolute difference between it and the working image, and scale the differences to isolate compression artifacts. Bounding boxes of highly mismatched compression rate regions will be mapped via `CoordinateMapper` and returned in `SuspiciousRegion` formats.

### 2. Stamp Analysis
* **Integration**: In `app/forensic/stamp.py`, the stamp analyzer is already designed to receive the color representations (HSV, LAB), grayscale, and noise residual maps. It will run color thresholding (to isolate red/blue/purple stamp inks), detect circular or rectangular geometries via OpenCV Hough transforms, and evaluate textural/edge consistency within identified boundaries.

### 3. AI/ML Signal Fusion
* **Integration**: In `app/forensic/fusion.py`, once individual detector engines return normalized scores from $0.0$ (no tampered evidence) to $1.0$ (high tampered evidence), the fusion module will weight individual scores (e.g., ELA weight=0.3, Copy-Move weight=0.4, Stamp weight=0.3) or evaluate them using a lightweight Scikit-Learn Logistic Regression classifier to yield a combined threat score, confidence value, and threat risk level (`LOW`, `MEDIUM`, `HIGH`).
