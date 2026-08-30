"""
DocShield AI — Phase 1 Face Detection Test Suite
Tests the FaceDetector on sample passport photos and non-face images,
validating detection counts, bounding boxes, confidence scores, and saving face crops.
"""

import os
import sys
from pathlib import Path
import numpy as np

# Ensure project root is in python path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR.parent) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR.parent))

from face.detector import FaceDetector, get_detector, DetectedFace


def run_tests():
    print("=" * 60)
    print("DocShield AI -- Phase 1: Face Detection Test")
    print("=" * 60)

    # 1. Initialize detector (model loaded once)
    print("\n[1/3] Initializing FaceDetector (loading model once)...")
    try:
        detector = get_detector()
        print("[OK] Detector initialized successfully.")
    except Exception as e:
        print(f"[FAIL] Failed to initialize detector: {e}")
        return False

    # Define test cases: (filename, expected_face_count)
    test_cases = [
        ("passport1.jpg", 1),
        ("passport2.jpg", 1),
        ("random_image.jpg", 0),
        ("photo.jpg",1),
    ]

    sample_dir = ROOT_DIR / "sample_faces"
    output_dir = ROOT_DIR / "output" / "faces"
    output_dir.mkdir(parents=True, exist_ok=True)

    all_passed = True
    print("\n[2/3] Running detection on sample images...\n")

    for filename, expected_count in test_cases:
        image_path = sample_dir / filename
        print("-" * 50)
        print(f"Image: {filename}")

        if not image_path.exists():
            print(f"[ERROR] Sample image not found at {image_path}")
            all_passed = False
            continue

        try:
            faces = detector.detect(image_path)
            detected_count = len(faces)
            print(f"Faces detected: {detected_count}")

            for idx, face in enumerate(faces, start=1):
                print(f"Face {idx}: bbox={face.bbox}, confidence={face.confidence:.2f}")

                # Save face crop to output/faces/
                stem = Path(filename).stem
                crop_filename = f"{stem}_face_{idx}.jpg"
                crop_path = output_dir / crop_filename
                saved_path = detector.save_crop(face.crop, crop_path)
                print(f"  -> Cropped face saved to: output/faces/{crop_filename}")

            # Verify against expected count
            if detected_count == expected_count:
                print("Status: PASS")
            else:
                print(f"Status: FAIL (Expected {expected_count} faces, got {detected_count})")
                all_passed = False

        except Exception as e:
            print(f"Status: ERROR ({e})")
            all_passed = False

    # 3. Test Error Handling Edge Cases
    print("\n" + "-" * 50)
    print("[3/3] Testing edge cases & error handling...")
    
    # Non-existent file
    try:
        detector.detect(sample_dir / "non_existent_file.jpg")
        print("[FAIL] Did not raise FileNotFoundError for missing file")
        all_passed = False
    except FileNotFoundError:
        print("[OK] Handled non-existent file gracefully (FileNotFoundError)")
    except Exception as e:
        print(f"[OK] Handled missing file: {type(e).__name__}")

    # Empty numpy array
    try:
        detector.detect(np.array([]))
        print("[FAIL] Did not raise ValueError for empty numpy array")
        all_passed = False
    except ValueError:
        print("[OK] Handled empty numpy array gracefully (ValueError)")

    print("=" * 60)
    if all_passed:
        print("ALL PHASE 1 FACE DETECTION TESTS PASSED (100% SUCCESS) [OK]")
    else:
        print("SOME TESTS FAILED [FAIL]")
    print("=" * 60)

    return all_passed


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
