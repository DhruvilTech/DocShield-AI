"""
DocShield AI — Phase 5: Active Liveness Detection Test Suite
Tests MediaPipe 3D Landmark extraction, Head Pose (Pitch/Yaw/Roll) estimation,
Active Challenge sequence (Center → Left → Right), Rejections (Multi-face, No-face, Timeout),
and JSON output schema compliance.
"""

import json
import os
from pathlib import Path
import sys
import time

import cv2
import numpy as np

# Ensure project root is in python path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from face.liveness import (
    HeadPose,
    LivenessChallenge,
    LivenessDetector,
    LivenessResult,
    LivenessStage,
    LivenessStatus,
    check_liveness,
    get_liveness_detector,
)


def run_liveness_tests():
    print("=" * 70)
    print("DocShield AI -- Phase 5: Active Liveness Detection Test Suite")
    print("=" * 70)

    sample_dir = ROOT_DIR / "sample_faces"
    if not sample_dir.exists():
        sample_dir = ROOT_DIR / "AI" / "sample_faces"

    live_a = sample_dir / "person_a_live.jpg"
    multi = sample_dir / "multi_face.jpg"
    random_img = sample_dir / "random_image.jpg"

    all_passed = True

    # 1. Initialize Detector
    print("\n[1/6] Initializing LivenessDetector (MediaPipe Face Mesh 478-Landmarks)...")
    try:
        detector = get_liveness_detector()
        print(f"[OK] LivenessDetector loaded successfully. Model asset: {detector.model_path.name}")
    except Exception as e:
        print(f"[FAIL] Failed to initialize LivenessDetector: {e}")
        return False

    # 2. Single-Frame Landmark & Head Pose Extraction
    print("\n[2/6] Testing Facial Landmark & Head Pose Estimation on Live Image...")
    print("-" * 70)
    img_bgr = cv2.imread(str(live_a))
    if img_bgr is None:
        print(f"[FAIL] Could not load sample image: {live_a}")
        return False

    face_count, pose, landmarks = detector.extract_landmarks_and_pose(img_bgr)
    print(f"  -> Face Count Detected : {face_count}")
    print(f"  -> Total 3D Landmarks  : {len(landmarks) if landmarks else 0}")
    if pose:
        print(f"  -> Estimated Pitch     : {pose.pitch:.2f} deg")
        print(f"  -> Estimated Yaw       : {pose.yaw:.2f} deg")
        print(f"  -> Estimated Roll      : {pose.roll:.2f} deg")
        print(f"  -> Nose/Cheek Ratio    : {pose.nose_ratio:.3f}")

    if face_count == 1 and landmarks and len(landmarks) >= 468 and pose is not None:
        print("  -> Result: PASS (Accurate 3D Landmarks & Head Pose Extracted) [OK]")
    else:
        print("  -> Result: FAIL (Expected 1 face with 468+ landmarks) [FAIL]")
        all_passed = False

    # 3. Test Multi-Face and No-Face Rejections
    print("\n[3/6] Testing Security Rejections (Multi-face and No-face Scenes)...")
    print("-" * 70)

    # 3a. Multiple Faces Scene
    multi_img = cv2.imread(str(multi))
    multi_count, _, _ = detector.extract_landmarks_and_pose(multi_img)
    print(f"  -> Multi-face image detected count: {multi_count}")
    challenge_multi = LivenessChallenge(detector=detector)
    state_multi = challenge_multi.process_frame(multi_img)
    print(f"  -> State on multi-face: failed={state_multi.is_failed}, reason={state_multi.error_message}")
    if state_multi.is_failed and "Multiple faces detected" in (state_multi.error_message or ""):
        print("  -> Multi-Face Rejection Result: PASS [OK]")
    else:
        print("  -> Multi-Face Rejection Result: FAIL [FAIL]")
        all_passed = False

    # 3b. No Face / Non-Face Scene
    rand_img = cv2.imread(str(random_img))
    rand_count, _, _ = detector.extract_landmarks_and_pose(rand_img)
    print(f"  -> Non-face image detected count: {rand_count}")
    challenge_no_face = LivenessChallenge(detector=detector)
    for _ in range(20):
        state_no_face = challenge_no_face.process_frame(rand_img)
    print(f"  -> State on no-face stream: failed={state_no_face.is_failed}, reason={state_no_face.error_message}")
    if state_no_face.is_failed and "No face detected" in (state_no_face.error_message or ""):
        print("  -> No-Face Rejection Result: PASS [OK]")
    else:
        print("  -> No-Face Rejection Result: FAIL [FAIL]")
        all_passed = False

    # 4. Active Liveness Challenge (Full Dynamic Sequence: Center → Turn Left → Turn Right)
    print("\n[4/6] Testing Active Liveness Challenge (Center -> Turn Left -> Turn Right)...")
    print("-" * 70)

    challenge_dyn = LivenessChallenge(
        detector=detector,
        yaw_threshold_left=-10.0,
        yaw_threshold_right=10.0,
        min_consecutive_frames=3,
    )

    # Dynamic pose stream:
    # 1. Center: yaw = 0.0 (4 frames)
    # 2. Turn Left: yaw = -15.0 (4 frames)
    # 3. Turn Right: yaw = +16.0 (4 frames)
    simulated_poses = (
        [HeadPose(pitch=0.0, yaw=0.5, roll=0.0, nose_ratio=1.0)] * 4
        + [HeadPose(pitch=0.0, yaw=-15.0, roll=0.0, nose_ratio=0.65)] * 4
        + [HeadPose(pitch=0.0, yaw=16.0, roll=0.0, nose_ratio=1.45)] * 4
    )

    t0 = time.time()
    for idx, pose in enumerate(simulated_poses):
        state = challenge_dyn.process_pose(
            pose, face_count=1, timestamp_sec=t0 + idx * 0.05
        )
        if state.is_completed:
            print(f"  -> Active challenge completed at step #{idx + 1}!")
            break

    result_dyn = challenge_dyn.get_result()
    print(f"  -> Liveness Status     : {result_dyn.status}")
    print(f"  -> Confidence Score    : {result_dyn.confidence}")
    print(f"  -> Stages Completed    : {result_dyn.stages_completed}")
    print(f"  -> Frames Processed    : {result_dyn.total_frames_processed}")

    if result_dyn.status == "PASS" and result_dyn.confidence >= 0.90:
        print("  -> Full Active Challenge Result: PASS [OK]")
    else:
        print("  -> Full Active Challenge Result: FAIL [FAIL]")
        all_passed = False

    # 5. Incomplete Challenge / Timeout Test
    print("\n[5/6] Testing Incomplete Challenge Rejection (User does not complete sequence)...")
    print("-" * 70)

    challenge_timeout = LivenessChallenge(
        detector=detector,
        timeout_seconds=0.3,
    )

    t_start = time.time()
    center_pose = HeadPose(pitch=0.0, yaw=0.0, roll=0.0, nose_ratio=1.0)
    for idx in range(15):
        state = challenge_timeout.process_pose(
            center_pose, face_count=1, timestamp_sec=t_start + idx * 0.05
        )
        if state.is_failed:
            break

    result_timeout = challenge_timeout.get_result()
    print(f"  -> Incomplete Status   : {result_timeout.status}")
    print(f"  -> Confidence Score    : {result_timeout.confidence}")
    print(f"  -> Failure Reason      : {result_timeout.reason}")

    if result_timeout.status == "FAIL" and "timeout" in (result_timeout.reason or "").lower():
        print("  -> Incomplete Timeout Rejection Result: PASS [OK]")
    else:
        print("  -> Incomplete Timeout Rejection Result: FAIL [FAIL]")
        all_passed = False

    # 6. JSON Response Format Conformance
    print("\n[6/6] Validating Standard JSON Output Format Conformance...")
    print("-" * 70)

    # Standard Success response
    pass_response = result_dyn.to_standard_response()
    print("  -> Standard PASS Response JSON:")
    print(json.dumps(pass_response, indent=4))

    # Standard Failure response
    fail_response = result_timeout.to_standard_response()
    print("\n  -> Standard FAIL Response JSON:")
    print(json.dumps(fail_response, indent=4))

    # Check schema conformance
    pass_valid = (
        "liveness" in pass_response
        and pass_response["liveness"].get("status") == "PASS"
        and isinstance(pass_response["liveness"].get("confidence"), (float, int))
    )
    fail_valid = (
        "liveness" in fail_response
        and fail_response["liveness"].get("status") == "FAIL"
        and isinstance(fail_response["liveness"].get("confidence"), (float, int))
        and "reason" in fail_response["liveness"]
    )

    if pass_valid and fail_valid:
        print("  -> JSON Schema Conformance Result: PASS [OK]")
    else:
        print("  -> JSON Schema Conformance Result: FAIL [FAIL]")
        all_passed = False

    print("\n" + "=" * 70)
    if all_passed:
        print("ALL PHASE 5 LIVENESS DETECTION TESTS PASSED (100% SUCCESS) [OK]")
    else:
        print("SOME TESTS FAILED [FAIL]")
    print("=" * 70)

    return all_passed


if __name__ == "__main__":
    success = run_liveness_tests()
    sys.exit(0 if success else 1)
