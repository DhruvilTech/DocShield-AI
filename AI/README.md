# DocShield AI — Face Biometrics, Verification & Active Liveness Module

This directory contains the Python AI biometrics and computer vision engine for **DocShield AI**, featuring deep face detection, landmark alignment, ArcFace feature extraction, image quality validation, 1:1 identity verification, and Phase 5 active liveness detection.

---

## 1. Pipeline Architecture

```text
Live Camera Video Feed
          ↓
[ Phase 5: Active Liveness Detection ]
  - MediaPipe Face Mesh (478 3D Canonical Landmarks + Head Pose Estimation)
  - Active Challenge State Machine (Center → Turn Left → Turn Right)
  - Temporal Smoothing & Debounce Verification
  - Single-Face & Anti-Spoof Dynamic Motion Verification
          ↓  (Status: PASS)
Document Portrait + Live Face Capture
          ↓
[ Phase 3: Biometric Face Verification ]
  - Singularity & Quality Pre-Checks (Sharpness Laplacian Variance, Illumination, Bounds)
  - Canonical 112×112 Face Landmark Alignment
  - InsightFace ArcFace ONNX Model (buffalo_s / w600k_mbf)
  - L2-Normalized 512-Dimensional Deep Embeddings
  - Cosine Similarity Metric vs Configurable Decision Threshold
          ↓
Standard JSON Output: { "liveness": { "status": "PASS", "confidence": 0.94 }, ... }
```

---

## 2. Directory Structure

```text
AI/
├── face/
│   ├── __init__.py            # Package exports
│   ├── detector.py            # Phase 1: SCRFD Face Detection & Cropping
│   ├── embedding.py           # Phase 2: ArcFace Alignment & 512-d Feature Extraction
│   ├── verification.py        # Phase 3: 1:1 Identity Verification & Quality Engine
│   ├── liveness.py            # Phase 5: Active Liveness Detection & Head-Pose Estimation
│   ├── models/                # Downloaded MediaPipe FaceLandmarker task asset
│   └── service.py             # CLI & Microservice orchestrator (verify, detect, liveness)
├── sample_faces/
│   ├── person_a_doc.jpg       # Person A passport portrait
│   ├── person_a_live.jpg      # Person A live selfie capture
│   ├── person_b_doc.jpg       # Person B passport portrait
│   ├── person_b_live.jpg      # Person B live selfie capture
│   ├── blurred_face.jpg       # Low quality blurry sample (rejection test)
│   ├── multi_face.jpg         # Multi-face sample (rejection test)
│   ├── photo.jpg              # Generic identity photo
│   └── random_image.jpg       # Non-face security texture
├── output/
│   ├── faces/                 # Saved face crops from detector
│   └── evaluation.csv         # Pairwise verification benchmark results
├── test_face_detection.py     # Phase 1 test suite
├── test_face_embedding.py     # Phase 2 test suite
├── test_face_verification.py  # Phase 3 test suite
├── test_face_liveness.py      # Phase 5 test suite
├── demo_liveness_webcam.py    # Phase 5 interactive live webcam HUD demo
└── requirements.txt           # Python AI dependencies
```

---

## 3. Installation

Ensure you have Python 3.9+ installed, then install the required dependencies:

```bash
pip install -r AI/requirements.txt
```

### Dependencies
- `opencv-python` (Image I/O, Laplacian sharpness, color conversions, perspective transforms)
- `numpy` (Array operations, L2 vector normalization, dot product)
- `insightface` (SCRFD detector and ArcFace recognition)
- `onnxruntime` (High-performance inference engine for ONNX models)
- `mediapipe` (MediaPipe Face Mesh 478 3D landmarks & head pose estimation)

---

## 4. Running the Tests

### Phase 1: Face Detection Test
Detects faces across document samples, validates counts, and exports cropped faces to `output/faces/`:
```bash
python AI/test_face_detection.py
```

### Phase 2: Face Embedding & Similarity Evaluation
Extracts 512-d ArcFace embeddings, runs pairwise comparisons (genuine vs imposter), and writes `output/evaluation.csv`:
```bash
python AI/test_face_embedding.py
```

### Phase 3: 1:1 Face Verification & Quality Checks
Executes 1:1 biometric matching, mismatch verification, and image quality rejection checks:
```bash
python AI/test_face_verification.py
```

### Phase 5: Active Liveness Detection Test
Tests 3D landmark extraction, head pose calculation (pitch/yaw/roll), active challenge sequence (Center → Turn Left → Turn Right), multi-face and no-face security rejections, timeout handling, and JSON schema compliance:
```bash
python AI/test_face_liveness.py
```

---

## 5. Interactive Webcam Liveness Demo

Launch the live webcam interface with real-time HUD UI feedback (head pose tracking, stability meter, and challenge prompts):

```bash
python AI/demo_liveness_webcam.py
```

### Key Controls:
- **`q` or `ESC`**: Exit the demo.
- **`r`**: Reset the active liveness challenge.

---

## 6. Interpreting Outputs

### Liveness Verification Outputs

#### Successful Liveness Challenge (PASS):
```json
{
  "liveness": {
    "status": "PASS",
    "confidence": 0.94
  }
}
```

#### Failed Liveness Challenge (FAIL):
```json
{
  "liveness": {
    "status": "FAIL",
    "confidence": 0.20,
    "reason": "Liveness challenge not completed within timeout."
  }
}
```

### Face Verification Outputs
```json
{
  "similarity": 0.7794,
  "match": true,
  "confidence": 0.7794,
  "status": "MATCH",
  "threshold": 0.45,
  "doc_quality": {
    "brightness": 143.15,
    "sharpness": 631.1,
    "confidence": 0.8731,
    "is_valid": true
  },
  "live_quality": {
    "brightness": 122.82,
    "sharpness": 475.1,
    "confidence": 0.8598,
    "is_valid": true
  }
}
```

---

## 7. CLI & Programmatic Usage

### CLI Active Liveness Check
```bash
python AI/face/service.py liveness 0 --timeout 10.0
```

### CLI 1:1 Face Verification
```bash
python AI/face/service.py verify AI/sample_faces/person_a_doc.jpg AI/sample_faces/person_a_live.jpg --threshold 0.45
```

### Python API

#### Liveness Verification
```python
from face.liveness import check_liveness

# Pass a list of video frames, a video file path, or cv2.VideoCapture
result = check_liveness("path/to/user_capture.mp4", timeout_seconds=10.0)
print(result)
```

#### Biometric 1:1 Face Verification
```python
from face.verification import verify_face

result = verify_face(
    document_image="AI/sample_faces/person_a_doc.jpg",
    live_image="AI/sample_faces/person_a_live.jpg",
    threshold=0.45
)

print(f"Match: {result['match']} (Similarity: {result['similarity']})")
```
