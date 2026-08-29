# DocShield AI — Document Tampering Forensic Analysis Engine

## Phase 4: Copy-Move Detection

This directory houses the Python-based Document Tampering and Forensic Analysis module for the **DocShield AI** platform.

> [!NOTE]
> **Phase 4 Status:** ELA, Noise, and Copy-Move forensic engines are fully functional active detectors in the DocShield pipeline. All other signals (Metadata, Stamp, Splicing) remain placeholder skeletons that return `None`/`available = False` in this phase.

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
    │   │   │
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
    │   ├── test_noise.py               # [Phase 3] Noise test suite
    │   └── test_copy_move.py           # [Phase 4] Copy-Move test suite
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
QUALITY METRIC CALC      (Computes mean brightness, contrast, sharpness via Laplacian variance, and blur status)
     ↓
FORENSIC SIGNAL BUNDLING (Fills and returns the standard ForensicResult Pydantic schema)
```

### Coordinate Mapping

When processing high-resolution scans, downscaling is necessary to remain CPU-friendly. The `CoordinateMapper` class tracks the exact spatial mapping:

$$scale_x = \frac{width_{working}}{width_{original}}$$
$$scale_y = \frac{height_{working}}{height_{original}}$$

This ensures that whenever ELA, Noise, or Copy-Move analysis locates suspicious regions in the working image, the bounding boxes can be mapped back to the original document coordinates with pixel accuracy.

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

## Running & Verifying Phase 4

### 1. Generate Clean & Tampered Samples
```bash
python generate_samples.py
```
This builds mock documents in `samples/`:
* `samples/clean/passport.jpg`: Clean passport.
* `samples/tampered/copy_move.jpg`: Passport with the official red stamp duplicated at the top.

### 2. Run the CLI Test Runner
```bash
# Analyze Clean Passport
python test_pipeline.py samples/clean/passport.jpg

# Analyze Copy-Move Passport
python test_pipeline.py samples/tampered/copy_move.jpg
```

Observe that on `copy_move.jpg`, Copy-Move successfully localizes the stamp duplication:
* **Score**: `0.6800`
* **Suspicious Regions**: 3 regions with coordinate mappings pointing to source and target stamp locations.

### 3. Check Visual Debug Outputs
Verify matches visualization in `outputs/debug/`:
* `document_copy_move_matches.jpg`: Draws lines connecting matching keypoints between duplicated stamps.
* `document_copy_move_map.png`: Shows binary masks of duplicated locations.

---

## Automated Tests

Run automated tests using pytest:
```bash
python -m pytest tests/
```
All **30 tests** must pass.
