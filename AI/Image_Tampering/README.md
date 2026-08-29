# DocShield AI — Document Tampering Forensic Analysis Engine

## Phase 2: Error Level Analysis (ELA) Implementation

This directory houses the Python-based Document Tampering and Forensic Analysis module for the **DocShield AI** platform.

> [!NOTE]
> **Phase 2 Status:** ELA is the first active forensic detector in the DocShield pipeline. All other signals (Noise, Copy-Move, Metadata, Stamp, Splicing) remain placeholder skeletons that return `None`/`available = False` in this phase.

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
    │   │   ├── pipeline.py             # Orchestrates the image processing pipeline
    │   │   ├── preprocessing.py        # Safe loading, EXIF correction, resizing, coordinate mapping
    │   │   ├── quality.py              # Quality calculations (brightness, contrast, sharpness, blur flag)
    │   │   ├── representations.py      # Conversions (Grayscale, HSV, LAB, Noise Residual)
    │   │   ├── ela.py                  # [Active] ELA Forensic Engine
    │   │   │
    │   │   ├── noise.py                # [Skeleton] Noise Inconsistency Placeholder
    │   │   ├── copy_move.py            # [Skeleton] Copy-Move Detector Placeholder
    │   │   ├── metadata.py             # [Skeleton] Metadata Forensics Placeholder
    │   │   ├── stamp.py                # [Skeleton] Stamp Tampering Placeholder
    │   │   ├── splicing.py             # [Skeleton] Splicing Detector Placeholder
    │   │   └── fusion.py               # [Skeleton] AI/ML Signal Fusion Placeholder
    │   │
    │   └── schemas/
    │       ├── __init__.py
    │       └── forensic.py             # Pydantic schemas validating API payloads
    │
    ├── tests/                          # Automated unit tests (pytest)
    │   ├── test_preprocessing.py
    │   ├── test_quality.py
    │   └── test_ela.py                 # [Phase 2] ELA test suite
    │
    ├── samples/                        # Mock clean and tampered document images
    │   ├── clean/
    │   └── tampered/
    │
    ├── outputs/
    │   └── debug/                      # Generated visual debug images (Heatmap, maps)
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
ELA forensic analysis    (JPEG recompression, error amplification, stats, score, and bounding boxes)
     ↓
QUALITY METRIC CALC      (Computes mean brightness, contrast, sharpness via Laplacian variance, and blur status)
     ↓
FORENSIC SIGNAL BUNDLING (Fills and returns the standard ForensicResult Pydantic schema)
```

### Coordinate Mapping

When processing high-resolution scans, downscaling is necessary to remain CPU-friendly. The `CoordinateMapper` class tracks the exact spatial mapping:

$$scale_x = \frac{width_{working}}{width_{original}}$$
$$scale_y = \frac{height_{working}}{height_{original}}$$

This ensures that whenever ELA locates suspicious regions in the working image, the bounding boxes can be mapped back to the original document coordinates with pixel accuracy.

---

## Phase 2: Error Level Analysis (ELA) Engine

### What is ELA?
Error Level Analysis (ELA) identifies compression inconsistencies within a digital document by comparing the original image with its recompressed counterpart. Since digital modifications (pasting, cloning, overlays, text insertions) alter the local frequency layout, edited regions compress differently than un-edited regions.

### Recompression Process
1. The normalized working RGB image is compressed entirely in-memory using OpenCV's JPEG encoder at a specified quality level (default $95$).
2. The JPEG stream is decompressed back to an RGB image array.
3. The absolute pixel difference is calculated:
   $$diff = |OriginalRGB - RecompressedRGB|$$

### Difference Amplification
Because raw JPEG differences are extremely minute, the absolute difference is converted to a single-channel grayscale map and amplified by a factor of $20$, generating a **Raw ELA Map** (`ela_gray`):
$$\text{ela\_gray} = \text{clip}(diff_{gray} \times 20, 0, 255)$$

### Anomaly Score Formula
The **ELA Anomaly Score** (ranging from $0.0$ to $1.0$) is a deterministic representation of compression inconsistency:

$$\text{score} = 0.4 \times \left(\frac{\text{mean\_error}}{8.0}\right) + 0.4 \times \left(\frac{\text{std\_error}}{6.0}\right) + 0.2 \times \left(\frac{\text{high\_error\_ratio}}{0.10}\right)$$

*Where:*
* **$\text{mean\_error}$**: The average pixel difference in the grayscale absolute error map.
* **$\text{std\_error}$**: The standard deviation of the grayscale absolute error map.
* **$\text{high\_error\_ratio}$**: The proportion of pixels where the raw error is $> 10$ out of $255$.
* The score is capped at $1.0$.

### Suspicious Region Localization
1. **Thresholding**: The amplified ELA map is binarized at a threshold of $40$.
2. **Morphological Cleanup**: A morphological `CLOSE` followed by `OPEN` using a $5 \times 5$ rectangular kernel merges adjacent high-error pixels and filters out stray single-pixel compression noise.
3. **Contour Extraction**: Connected components are isolated using OpenCV's `findContours`.
4. **Dimension Filtering**: Bounding boxes with a width or height $< 15$ pixels are discarded.
5. **Severity Evaluation**: Each bounding box is assigned a severity based on the average amplified ELA error inside the box:
   * **$\text{HIGH}$**: Mean region error $> 100$
   * **$\text{MEDIUM}$**: Mean region error $> 50$
   * **$\text{LOW}$**: Mean region error $\le 50$
6. **Coordinate Restoration**: Box coordinates are mapped back to the original image dimensions using `CoordinateMapper.box_to_original`.

---

## Installation & Setup

Ensure Python 3.10+ is installed on your system. Run these commands from the `AI/Image_Tampering/` folder:

1. **Set up a Virtual Environment**:
   ```bash
   python -m venv venv
   ```

2. **Activate the Environment**:
   * **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   * **macOS/Linux**:
     ```bash
     source venv/bin/activate
     ```

3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

---

## Running & Verifying Phase 2

### 1. Generate Clean & Edited Test Images
To verify that ELA responds to modifications, generate test images by running:
```bash
python generate_samples.py
```
This builds mock documents in `samples/`:
* `samples/clean/passport.jpg`: A clean passport image saved uniformly at JPEG quality 95.
* `samples/tampered/passport_edited.jpg`: An edited passport containing a base quality of 70, overwritten with a solid gray photo overlay and a bold blue forged seal, and saved at quality 95.

### 2. Run the CLI Test Runner
Run the pipeline against the clean and edited images:
```bash
# Analyze Clean Passport
python test_pipeline.py samples/clean/passport.jpg

# Analyze Edited Passport
python test_pipeline.py samples/tampered/passport_edited.jpg
```

Observe that on `passport_edited.jpg`, ELA successfully localizes the forged seal at:
`Coords: x=797, y=692, w=172, h=172` (corresponds to the seal drawn at $x=800, y=700$ with $160 \times 160$ dimensions in the original image).

### 3. Check Visual Debug Outputs
Verify ELA maps in `outputs/debug/`:
* `document_ela_heatmap.jpg`: false-color ELA visual representation using a Jet colormap.
* `document_ela_map.png`: Raw amplified grayscale error map.

### 4. Running the Web API
To run the FastAPI server:
```bash
uvicorn app.main:app --reload
```
Test the `/analyze` endpoint using Swagger docs at `http://127.0.0.1:8000/docs`.

---

## Automated Tests

Run automated tests using pytest:
```bash
python -m pytest tests/
```
All **19 tests** must pass.

---

## Known ELA Limitations

1. **False Positives**: Sharp, high-contrast boundaries (like black text on white backgrounds or stamp borders) naturally produce higher reconstruction errors. These are normal JPEG compression artifacts and do not indicate tampering.
2. **False Negatives**: If a document is edited digitally and then resaved multiple times at low qualities, the error level becomes uniform, masking the editing history.
3. **Single-Feature Reliance**: ELA is not a definitive proof of forgery. It is only one indicator and must be combined with noise analysis, metadata checks, and stamp inspection to form a comprehensive forensic verdict.
