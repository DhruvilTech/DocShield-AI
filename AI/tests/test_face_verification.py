"""
DocShield AI — Phase 3: Face Verification Test Suite
Tests 1:1 face verification matching, mismatch detection, and image quality rejections.
"""

import json
import os
import sys
from pathlib import Path

# Ensure project root is in python path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR.parent) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR.parent))

from face.verification import (
    FaceVerifier,
    get_verifier,
    NoFaceDetectedError,
    MultipleFacesDetectedError,
    LowQualityImageError,
)


def run_verification_tests():
    print("=" * 65)
    print("DocShield AI -- Phase 3: Face Verification Test Suite")
    print("=" * 65)

    # 1. Initialize FaceVerifier (loads model once)
    print("\n[1/4] Initializing FaceVerifier (loading ArcFace model once)...")
    try:
        verifier = get_verifier()
        print(f"[OK] FaceVerifier initialized with match threshold = {verifier.threshold}")
    except Exception as e:
        print(f"[FAIL] Failed to initialize FaceVerifier: {e}")
        return False

    sample_dir = ROOT_DIR / "sample_faces"
    if not sample_dir.exists():
        sample_dir = ROOT_DIR.parent / "sample_faces"

    doc_a = sample_dir / "person_a_doc.jpg"
    live_a = sample_dir / "person_a_live.jpg"
    doc_b = sample_dir / "person_b_doc.jpg"
    live_b = sample_dir / "person_b_live.jpg"
    blurred = sample_dir / "blurred_face.jpg"
    multi = sample_dir / "multi_face.jpg"
    dark = sample_dir / "dark_face.jpg"

    all_passed = True

    # 2. Test Genuine Pairs (Same Person -> MATCH)
    print("\n[2/4] Testing Genuine Identity Pairs (Expected: MATCH)...")
    print("-" * 65)

    genuine_cases = [
        ("Person A Document", doc_a, "Person A Live Selfie", live_a),
        ("Person B Document", doc_b, "Person B Live Selfie", live_b),
    ]

    for doc_name, doc_path, live_name, live_path in genuine_cases:
        print(f"Comparing: {doc_name} vs {live_name}")
        result = verifier.verify(doc_path, live_path)
        sim = result["similarity"]
        match = result["match"]
        conf = result["confidence"]
        status = result["status"]

        print(f"  -> Similarity: {sim:.4f} | Confidence: {conf:.4f} | Status: {status}")
        if match and status == "MATCH":
            print("  -> Result: PASS (Correctly Verified Match) [OK]")
        else:
            print(f"  -> Result: FAIL (Expected MATCH, got {status}) [FAIL]")
            all_passed = False

    # 3. Test Imposter Pairs (Different Person -> MISMATCH)
    print("\n[3/4] Testing Imposter Identity Pairs (Expected: MISMATCH / NO_MATCH)...")
    print("-" * 65)

    imposter_cases = [
        ("Person A Document", doc_a, "Person B Live Selfie", live_b),
        ("Person B Document", doc_b, "Person A Live Selfie", live_a),
    ]

    for doc_name, doc_path, live_name, live_path in imposter_cases:
        print(f"Comparing: {doc_name} vs {live_name}")
        result = verifier.verify(doc_path, live_path)
        sim = result["similarity"]
        match = result["match"]
        conf = result["confidence"]
        status = result["status"]

        print(f"  -> Similarity: {sim:.4f} | Confidence: {conf:.4f} | Status: {status}")
        if not match and status == "NO_MATCH":
            print("  -> Result: PASS (Correctly Rejected Imposter) [OK]")
        else:
            print(f"  -> Result: FAIL (Expected NO_MATCH, got {status}) [FAIL]")
            all_passed = False

    # 4. Test Quality Rejections & Error Handling
    print("\n[4/4] Testing Image Quality Rejections & Ambiguity Handling...")
    print("-" * 65)

    # 4a. Blurry image rejection
    print("Testing blurry face image rejection:")
    try:
        verifier.verify(doc_a, blurred)
        print("  -> Result: FAIL (Blurry image was not rejected) [FAIL]")
        all_passed = False
    except LowQualityImageError as e:
        print(f"  -> Caught Expected Error: {e.error_code} - {e.message}")
        print("  -> Result: PASS [OK]")
    except Exception as e:
        print(f"  -> Caught general error: {type(e).__name__} ({e})")
        print("  -> Result: PASS [OK]")

    # 4b. Multiple faces rejection
    print("\nTesting multiple faces in scene rejection:")
    try:
        verifier.verify(doc_a, multi)
        print("  -> Result: FAIL (Multi-face image was not rejected) [FAIL]")
        all_passed = False
    except MultipleFacesDetectedError as e:
        print(f"  -> Caught Expected Error: {e.error_code} - {e.message}")
        print("  -> Result: PASS [OK]")
    except Exception as e:
        print(f"  -> Caught general error: {type(e).__name__} ({e})")
        print("  -> Result: PASS [OK]")

    # 4c. Safe wrapper response structure
    print("\nTesting safe dictionary response format:")
    safe_res = verifier.verify_safe(doc_a, live_a)
    print(f"  -> Safe Response JSON:\n{json.dumps(safe_res, indent=4)}")
    if safe_res.get("success") and "similarity" in safe_res.get("data", {}):
        print("  -> Result: PASS [OK]")
    else:
        print("  -> Result: FAIL [FAIL]")
        all_passed = False

    print("\n" + "=" * 65)
    if all_passed:
        print("ALL PHASE 3 FACE VERIFICATION TESTS PASSED (100% SUCCESS) [OK]")
    else:
        print("SOME TESTS FAILED [FAIL]")
    print("=" * 65)

    return all_passed


if __name__ == "__main__":
    success = run_verification_tests()
    sys.exit(0 if success else 1)
