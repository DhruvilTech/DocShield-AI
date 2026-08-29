# DocShield AI — Document Tampering Forensic Analysis Engine

## Phase 6: Basic Stamp Forensic Analysis

This directory houses the Python-based Document Tampering and Forensic Analysis module for the **DocShield AI** platform.

> [!NOTE]
> **Phase 6 Status:** ELA, Noise, Copy-Move, Metadata, and Stamp forensic engines are fully functional active detectors in the DocShield pipeline. All other signals (Splicing) remain placeholder skeletons that return `None`/`available = False` in this phase.

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
    │   │   ├── copy_move.py            # [Active] Copy-Move Forensic Engine
    │   │   ├── metadata.py             # [Active] Metadata Forensic Engine
    │   │   ├── stamp.py                # [Active] Stamp Forensic Engine
    │   │   │
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
    │   ├── test_noise.py               # [Phase 3] Noise test suite
    │   ├── test_copy_move.py           # [Phase 4] Copy-Move test suite
    │   ├── test_metadata.py            # [Phase 5] Metadata test suite
    │   └── test_stamp.py               # [Phase 6] Stamp test suite
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
COPY-MOVE analysis       (SIFT extraction, k-NN self-filtering, RANSAC homography, source/target mapping)
     ↓
METADATA analysis        (EXIF tags extraction, graphic editors verification, timestamp inconsistency check)
     ↓
STAMP forensic analysis  (HSV segmentation, morphology, circularity/geometry check, cross-signal overlaps)
     ↓
QUALITY METRIC CALC      (Computes mean brightness, contrast, sharpness via Laplacian variance, and blur status)
     ↓
FORENSIC SIGNAL BUNDLING (Fills and returns the standard ForensicResult Pydantic schema)
```

### Coordinate Mapping

When processing high-resolution scans, downscaling is necessary to remain CPU-friendly. The `CoordinateMapper` class tracks the exact spatial mapping:

$$scale_x = \frac{width_{working}}{width_{original}}$$
$$scale_y = \frac{height_{working}}{height_{original}}$$

This ensures that whenever ELA, Noise, Copy-Move, or Stamp analysis locates suspicious regions in the working image, the bounding boxes can be mapped back to the original document coordinates with pixel accuracy.

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
3. Compute local mean of squares $E[I^2]$ using `cv2.boxFilter(I * I, (7, 7))`.
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

## Phase 4: Copy-Move Duplicate Tampering Detection

> [!WARNING]
> **Forensic Limit:** Copy-move detection provides evidence of possible duplicated content and does not by itself prove document forgery. Documents naturally contain repeated visual patterns such as background security guillochés, repeated official letters, icons, stamps, and layout borders.

### Objective
Copy-Move Detection flags duplicate regions within a document, identifying cases where a signature, stamp, photo, or block of text was duplicated and pasted from one location of the document to another.

### Feature Extraction (SIFT)
The engine extracts local visual features using SIFT (Scale-Invariant Feature Transform) which is highly robust against minor rotations, scaling, and lighting changes:
* **Feature Density Cap**: Capped at $1,000$ keypoints on the grayscale working image to keep matching CPU-friendly.
* If fewer than $15$ keypoints are found, the document is considered too plain to run copy-move check, and returns a clean signal.

### Self-Match Rejection
Since the image is matched against itself, we perform Brute-Force $k$-NN matching ($k=3$). We filter candidates as follows:
1. **Symmetry Check**: We check `queryIdx < trainIdx` to ensure each matched pair is processed only once.
2. **Lowe's Ratio Test**: The 2nd nearest neighbor (closest other feature) must be significantly closer than the 3rd nearest neighbor:
   $$\text{dist}_{2\text{nd}} < 0.7 \times \text{dist}_{3\text{rd}}$$
3. **Spatial Separation**: Matched keypoints must be separated by a minimum distance of $5\%$ of the maximum image dimension:
   $$\text{dist}_{spatial} \ge 0.05 \times \max(width, height)$$
   This effectively prevents adjacent letters or layout borders from generating high false positives.

### Iterative RANSAC Consistency
To cluster matches and support multiple duplicate sections:
1. We compute a homography transformation between query and train points.
2. RANSAC filters out isolated mismatches. If a cluster contains at least $5$ inliers, it is registered as a copy-move region.
3. Inliers are removed from the candidate set, and RANSAC is iteratively rerun on the remaining matches to find other duplicated areas.

### Region Mapping (Source & Target)
For each RANSAC cluster, we split the coordinates into two separate groups using the **anchor-distance split** method (points closer to the anchor match belong to the Source region, while points farther belong to the Target region). We compute bounding boxes with a $15$px padding and map coordinates to the original image dimensions using `CoordinateMapper`:
* `x, y, width, height`: Source region bounding box.
* `target_x, target_y, target_width, target_height`: Target region bounding box.

### Copy-Move Score
The document-wide **Copy-Move Anomaly Score** (ranging from $0.0$ to $1.0$) is calculated as:
$$\text{score} = \text{clip}(0.02 \times \text{verified\_matches} + 0.1 \times \text{clusters}, 0.0, 1.0)$$

---

## Phase 5: Metadata Forensic Analysis

### What is Metadata Forensics?
Metadata analysis extracts image format headers and EXIF fields to check for editing signatures (e.g. Photoshop or GIMP tags) and timestamp chronological inconsistencies.

### Anomaly Score Formula
The **Metadata Anomaly Score** (ranging from $0.0$ to $1.0$) is calculated as:
$$\text{score} = \text{clip}(\text{score}_{software} + \text{score}_{timestamp}, 0.0, 1.0)$$
*Where:*
* **$\text{score}_{software}$**: $+0.5$ if metadata contains graphics editing software tags (e.g., Photoshop, GIMP, Canva).
* **$\text{score}_{timestamp}$**: $+0.4$ if EXIF timestamps are inconsistent (e.g. original creation is in the future, or occurs after modification date).
* Safe scans or files with stripped/missing EXIF tags receive a score of $0.0$.

### GPS Privacy
If GPS Info (tag 34853) is present in the image headers, it is flagged as `gps_present = True` in the statistics and reported as sanitized in the evidence list. Exact coordinate values are never exposed or saved to protect user privacy.

---

## Phase 6: Basic Stamp Forensic Analysis

> [!WARNING]
> **Forensic Limit:** Stamp analysis is a prototype forensic signal and does not independently establish that a stamp is forged. Document stamps can vary naturally in color density, edge thickness, and page contrast due to ink pressure, scanner resolutions, and lighting shadows.

### Objective
Stamp Forensic Analysis attempts to detect document seals or stamps (red, blue, or purple ink shapes) and cross-checks their boundaries against active ELA, Noise, and Copy-Move anomaly coordinates.

### Region Segmentation
1. **HSV Color Ranges**: Segment saturated inks in the HSV color space:
   * **Red Range**: $H \in [0, 15] \cup [165, 180]$ with $S \ge 40, V \ge 40$.
   * **Blue/Purple Range**: $H \in [95, 145]$ with $S \ge 40, V \ge 40$.
2. **Morphology**: Apply morphological `CLOSE` using a large $(35, 35)$ ellipse kernel to merge text characters inside the stamp, followed by an `OPEN` with a $(5, 5)$ ellipse kernel to filter out background speckles.
3. **Contour Extraction**: Run `findContours` using `RETR_LIST` to ensure nested stamp shapes inside outer document frames are not hidden or skipped.

### Candidate Shape Filtering
Contours are filtered using geometric constraints to identify stamp-like shapes:
* Bounding box width and height must satisfy: $40\text{px} \le w, h \le 400\text{px}$ in working space.
* Total box area must occupy $< 25\%$ of the document page area.
* Aspect ratio must be compact: $0.4 \le w/h \le 2.5$.
* Circularity metric is calculated: $Circularity = 4\pi \times \text{area} / \text{perimeter}^2$.

### Bounding Box Deduplication (NMS)
To prevent hollow rings or nested borders from generating multiple overlapping regions, candidates are sorted by area (descending) and deduplicated. If a smaller box overlaps with a kept larger box by more than $80\%$, the smaller box is discarded.

### Forensic Cross-Signal Checks
For each candidate stamp, we check for spatial overlaps ($> 20\%$ intersection area) with ELA, Noise, or Copy-Move suspicious regions.

### Stamp Anomaly Score Formula
The regional stamp anomaly score is calculated using weighted forensic signals:
$$\text{score} = \text{clip}(0.1_{\text{base}} + 0.4 \times \text{ela\_overlap} + 0.3 \times \text{noise\_overlap} + 0.5 \times \text{copy\_move\_overlap}, 0.0, 1.0)$$
* A normal, un-tampered stamp receives a safe score of $0.1$ (`LOW` severity).
* Stamps overlapping with editing traces (e.g. copy-move duplicate matches) get higher scores (`MEDIUM` or `HIGH` severity).

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

## Running & Verifying Phase 6

### 1. Generate Clean & Tampered Samples
```bash
python generate_samples.py
```
This builds mock documents in `samples/`:
* `samples/clean/passport.jpg`: Clean passport.
* `samples/tampered/copy_move.jpg`: Passport with the stamp duplicated.
* `samples/tampered/stamp_tampered.jpg`: Passport with the stamp recolored (blue/purple) and shifted.

### 2. Run the CLI Test Runner
```bash
# Analyze Stamp-Tampered Passport
python test_pipeline.py samples/tampered/stamp_tampered.jpg
```

Observe that on `stamp_tampered.jpg`, the stamp detector localizes three regions (including the recolored stamp at `x=900, y=199` showing ELA overlap).

### 3. Check Visual Debug Outputs
Verify debug maps in `outputs/debug/`:
* `document_stamp_candidates.jpg`: Draws colored bounding boxes (Red for High risk, Orange for Medium, Green for Low) and scores over the working image.
* `document_stamp_map.png`: Black-and-white mask showing morphed color segmentation.

---

## Automated Tests

Run automated tests using pytest:
```bash
python -m pytest tests/
```
All **42 tests** must pass.
