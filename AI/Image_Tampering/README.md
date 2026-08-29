# DocShield AI — Document Tampering Forensic Analysis Engine

## Phase 3: Noise / Compression Forensic Analysis

This directory houses the Python-based Document Tampering and Forensic Analysis module for the **DocShield AI** platform.

> [!NOTE]
> **Phase 3 Status:** ELA and Noise forensic engines are fully functional active detectors in the DocShield pipeline. All other signals (Copy-Move, Metadata, Stamp, Splicing) remain placeholder skeletons that return `None`/`available = False` in this phase.

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
    │   │   ├── noise.py                # [Active] Noise Forensic Engine
    │   │   │
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
    │   ├── test_ela.py                 # [Phase 2] ELA test suite
    │   └── test_noise.py               # [Phase 3] Noise test suite
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
ELA forensic analysis    (JPEG recompression, error amplification, stats, score, and bounding boxes)
     ↓
NOISE forensic analysis  (Local standard deviation, contextual comparison, anomaly map, and bounding boxes)
     ↓
QUALITY METRIC CALC      (Computes mean brightness, contrast, sharpness via Laplacian variance, and blur status)
     ↓
FORENSIC SIGNAL BUNDLING (Fills and returns the standard ForensicResult Pydantic schema)
```

### Coordinate Mapping

When processing high-resolution scans, downscaling is necessary to remain CPU-friendly. The `CoordinateMapper` class tracks the exact spatial mapping:

$$scale_x = \frac{width_{working}}{width_{original}}$$
$$scale_y = \frac{height_{working}}{height_{original}}$$

This ensures that whenever ELA or Noise analysis locates suspicious regions in the working image, the bounding boxes can be mapped back to the original document coordinates with pixel accuracy.

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
3. **Contour Extraction**: Connected components are isolated using OpenCV's `findContours` (with `RETR_LIST` to capture nested elements).
4. **Dimension Filtering**: Bounding boxes with a width or height $< 15$ pixels are discarded. Boxes occupying $> 30\%$ of the total page area are filtered out to prevent document borders from triggering anomalies.
5. **Severity Evaluation**: Each bounding box is assigned a severity based on the average amplified ELA error inside the box:
   * **$\text{HIGH}$**: Mean region error $> 100$
   * **$\text{MEDIUM}$**: Mean region error $> 50$
   * **$\text{LOW}$**: Mean region error $\le 50$
6. **Coordinate Restoration**: Box coordinates are mapped back to the original image dimensions using `CoordinateMapper.box_to_original`.

---

## Phase 3: Noise / Compression Forensic Analysis

> [!WARNING]
> **Forensic Limit:** Noise inconsistency is forensic evidence and does not by itself establish that a document has been forged. Scanned documents can present natural noise variations due to paper texture, shadows, and print density.

### Objective
Noise Forensic Analysis identifies regions within a document whose high-frequency noise texture differs significantly from neighboring areas. For instance, when a grainy photo is replaced, or text is spliced from a different document, the local noise grain characteristics will mismatch the background paper grain.

### Local Noise Statistics (CPU Vectorization)
To remain CPU-friendly and eliminate slow Python nested loops, the engine uses OpenCV's box filters to calculate local noise standard deviations inside a small window ($7 \times 7$ px) in-memory:
1. Extract the high-frequency **Noise Residual** map $I$ (grayscale difference $I = |\text{Original} - \text{GaussianBlur}|$).
2. Compute local mean $E[I]$ using `cv2.boxFilter(I, -1, (7, 7))`.
3. Compute local mean of squares $E[I^2]$ using `cv2.boxFilter(I * I, -1, (7, 7))`.
4. Calculate local variance $Var(I) = E[I^2] - (E[I])^2$ and extract standard deviation:
   $$\text{std\_small} = \sqrt{\text{clip}(Var(I), 0, \text{None})}$$

### Local Consistency Anomaly Map
To isolate localized tampering rather than page-wide scanning noise:
1. We compute a contextual neighborhood noise map ($\text{std\_large}$) by running a large $31 \times 31$ box filter over $\text{std\_small}$.
2. The raw local inconsistency is the absolute difference:
   $$\text{anomaly\_raw} = |\text{std\_small} - \text{std\_large}|$$
3. This is normalized against the global standard deviation of noise level variations ($\sigma_{global}$) across the entire page:
   $$\text{anomaly\_map} = \text{clip}\left(\frac{\text{anomaly\_raw}}{3.0 \times \max(\sigma_{global}, 4.0) + 1e-5}, 0.0, 1.0\right)$$
   This division evaluates whether a region's local noise deviates by more than $3$ standard deviations from the global variation, using a noise floor of $4.0$ to prevent false positives on digitally clean/silent backgrounds.
4. The map is smoothed using a $7 \times 7$ Gaussian blur to get stable regional measurements.

### Noise Anomaly Score
The **Noise Anomaly Score** (ranging from $0.0$ to $1.0$) is defined as the maximum regional peak anomaly score across all localized suspicious regions:
$$\text{score} = \max(\text{region\_score}) \quad (\text{or } 0.0 \text{ if no regions are localized})$$

### Suspicious Region Localization
1. **Thresholding**: The smoothed anomaly map is binarized at a threshold of $0.4$ ($102$ out of $255$).
2. **Morphological Cleanup**: A morphological `CLOSE` ($5 \times 5$ kernel) bridges small gaps in borders, followed by an `OPEN` ($3 \times 3$ kernel) to filter out single-pixel noise.
3. **Contour Extraction**: Isolated using OpenCV's `findContours` with `RETR_LIST` to retrieve nested contours (e.g. photos inside the passport page).
4. **Dimension & Area Filtering**: Bounding boxes smaller than $30 \times 30$ pixels or larger than $30\%$ of the total working area are discarded (preventing the document border from triggering alerts).
5. **Severity Evaluation**: The regional score is calculated using the **95th percentile** of anomaly values inside the box (capturing peak anomaly while ignoring empty spaces). Severity is assigned as:
   * **$\text{HIGH}$**: Region score $> 0.7$
   * **$\text{MEDIUM}$**: Region score $> 0.4$
   * **$\text{LOW}$**: Region score $\le 0.4$
6. **Coordinate Restoration**: Box coordinates are mapped back to original dimensions using `CoordinateMapper.box_to_original`.

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

## Running & Verifying Phase 3

### 1. Generate Clean & Tampered Samples
Generate test images featuring mixed-compression and local grain mismatches:
```bash
python generate_samples.py
```
This builds mock documents in `samples/`:
* `samples/clean/passport.jpg`: Clean passport image.
* `samples/tampered/passport_edited.jpg`: Edited passport containing a grainy noise patch pasted into the photo area (simulating photo replacement) and a bold blue forged seal (simulating stamp forgery).

### 2. Run the CLI Test Runner
Run the pipeline against the clean and edited images:
```bash
# Analyze Clean Passport (should report low ELA/Noise scores and no false regions)
python test_pipeline.py samples/clean/passport.jpg

# Analyze Tampered Passport (should flag Photo replacing and Forged Seal regions)
python test_pipeline.py samples/tampered/passport_edited.jpg
```

Observe that on `passport_edited.jpg`, ELA and Noise successfully localize:
* The photo replace block: `Coords: x=192, y=240, w=211, h=222` with **HIGH** severity.
* The forged seal: `Coords: x=790, y=689, w=184, h=182` with **MEDIUM** severity.

### 3. Check Visual Debug Outputs
Verify anomaly maps in `outputs/debug/`:
* `document_ela_heatmap.jpg` & `document_ela_map.png`
* `document_noise_heatmap.jpg` & `document_noise_anomaly_map.png`

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
All **25 tests** must pass.

---

## Known Noise Forensics Limitations

1. **Digital Document Silence**: Pure digitally created documents have exactly $0$ noise. A single line or text stroke on such pages represents a $100\%$ noise anomaly relative to background "silence". We employ a noise floor ($\ge 4.0$) to counteract this.
2. **Scanner & Camera Artifacts**: Uneven lighting, paper textures, or camera sensor noise (particularly in low-light environments) can create natural noise inconsistencies.
3. **JPEG Compression Smoothing**: High JPEG compression rates (low quality) smooth out grain, which makes it harder for the noise residual analyzer to isolate discrepancies.
