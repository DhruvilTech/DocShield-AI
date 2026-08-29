"""
DocShield AI — Phase 5: Interactive Webcam Active Liveness Demo
Live webcam feed with real-time HUD UI, head pose tracking, debounce stability bar,
and instant JSON verification output.

Usage:
  python demo_liveness_webcam.py
  python demo_liveness_webcam.py --camera 0 --timeout 15.0
"""

import argparse
import json
import os
from pathlib import Path
import sys
import time

import cv2
import numpy as np

# Ensure project root is in python path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from face.liveness import (
    HeadPose,
    LivenessChallenge,
    LivenessDetector,
    LivenessStage,
    LivenessStatus,
    get_liveness_detector,
)


def draw_hud(
    frame: np.ndarray,
    challenge: LivenessChallenge,
    state,
    elapsed_sec: float,
    timeout_sec: float,
) -> np.ndarray:
    """
    Render heads-up display (HUD) with active instructions, pose meters,
    and challenge progress over the video frame.
    """
    canvas = frame.copy()
    h, w = canvas.shape[:2]

    # Draw semi-transparent header overlay
    header_overlay = canvas.copy()
    cv2.rectangle(header_overlay, (0, 0), (w, 90), (18, 22, 28), -1)
    cv2.addWeighted(header_overlay, 0.75, canvas, 0.25, 0, canvas)

    # Header Title
    cv2.putText(
        canvas,
        "DocShield AI -- Active Liveness Verification",
        (20, 30),
        cv2.FONT_HERSHEY_DUPLEX,
        0.75,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    # Dynamic Stage Instructions & Colors
    stage = state.stage
    instruction = state.instruction
    progress = state.debounce_progress

    if stage == LivenessStage.PASSED:
        banner_color = (0, 210, 80)      # Green
        status_text = "STATUS: PASSED (VERIFIED)"
    elif stage == LivenessStage.FAILED:
        banner_color = (40, 40, 230)     # Red
        status_text = f"STATUS: FAILED ({state.error_message or 'Timeout'})"
    elif stage == LivenessStage.TURN_LEFT:
        banner_color = (255, 170, 0)     # Orange / Cyan
        status_text = "CHALLENGE: STEP 1/2 -- TURN HEAD LEFT"
    elif stage == LivenessStage.TURN_RIGHT:
        banner_color = (230, 80, 230)    # Magenta
        status_text = "CHALLENGE: STEP 2/2 -- TURN HEAD RIGHT"
    else:  # CENTER
        banner_color = (0, 220, 220)     # Yellow
        status_text = "CHALLENGE: ALIGN FACE & LOOK STRAIGHT"

    cv2.putText(
        canvas,
        status_text,
        (20, 65),
        cv2.FONT_HERSHEY_DUPLEX,
        0.65,
        banner_color,
        2,
        cv2.LINE_AA,
    )

    # Draw Pose Angle & Telemetry Box in Top-Right
    box_w, box_h = 240, 110
    box_x = w - box_w - 20
    box_y = 20
    cv2.rectangle(canvas, (box_x, box_y), (box_x + box_w, box_y + box_h), (25, 30, 38), -1)
    cv2.rectangle(canvas, (box_x, box_y), (box_x + box_w, box_y + box_h), (80, 90, 105), 1)

    pose: HeadPose = state.pose
    if pose:
        cv2.putText(
            canvas,
            f"Yaw   : {pose.yaw:+5.1f} deg",
            (box_x + 15, box_y + 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 255, 200) if abs(pose.yaw) > 10 else (220, 220, 220),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            canvas,
            f"Pitch : {pose.pitch:+5.1f} deg",
            (box_x + 15, box_y + 53),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (220, 220, 220),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            canvas,
            f"Roll  : {pose.roll:+5.1f} deg",
            (box_x + 15, box_y + 78),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (220, 220, 220),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            canvas,
            f"Faces : {state.faces_detected}",
            (box_x + 15, box_y + 100),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.50,
            (150, 200, 255),
            1,
            cv2.LINE_AA,
        )

    # Bottom Banner Overlay
    footer_y = h - 65
    footer_overlay = canvas.copy()
    cv2.rectangle(footer_overlay, (0, footer_y), (w, h), (18, 22, 28), -1)
    cv2.addWeighted(footer_overlay, 0.75, canvas, 0.25, 0, canvas)

    # Debounce Progress Bar
    bar_x = 20
    bar_y = footer_y + 18
    bar_w = 300
    bar_h = 16
    cv2.rectangle(canvas, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (50, 60, 75), -1)
    fill_w = int(bar_w * progress)
    if fill_w > 0:
        cv2.rectangle(canvas, (bar_x, bar_y), (bar_x + fill_w, bar_y + bar_h), banner_color, -1)
    cv2.rectangle(canvas, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (120, 130, 150), 1)

    cv2.putText(
        canvas,
        f"Stability: {int(progress * 100)}%",
        (bar_x + bar_w + 15, bar_y + 13),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.52,
        (255, 255, 255),
        1,
        cv2.LINE_AA,
    )

    # Remaining Time Bar
    remaining = max(0.0, timeout_sec - elapsed_sec)
    cv2.putText(
        canvas,
        f"Time: {remaining:4.1f}s | Press 'q': Exit | 'r': Reset",
        (w - 380, bar_y + 13),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.52,
        (200, 200, 200),
        1,
        cv2.LINE_AA,
    )

    return canvas


def run_webcam_demo(camera_index: int = 0, timeout_seconds: float = 12.0):
    print("=" * 70)
    print("DocShield AI -- Interactive Liveness Detection Webcam Demo")
    print("=" * 70)
    print(f"Connecting to camera index {camera_index}...")

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print(f"[ERROR] Could not open camera {camera_index}. Please check connection.")
        return

    detector = get_liveness_detector()
    challenge = LivenessChallenge(
        detector=detector,
        yaw_threshold_left=-12.0,
        yaw_threshold_right=12.0,
        min_consecutive_frames=4,
        timeout_seconds=timeout_seconds,
    )

    print("\nInstructions:")
    print("  1. Look directly at the camera to calibrate center.")
    print("  2. Turn your head LEFT when prompted.")
    print("  3. Turn your head RIGHT when prompted.")
    print("  Press 'r' to reset challenge | Press 'q' or ESC to exit.")
    print("-" * 70)

    start_time = time.time()
    completed_announced = False

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            print("[WARN] Failed to read frame from camera.")
            break

        # Mirror view for natural interaction
        frame_flipped = cv2.flip(frame, 1)

        now = time.time()
        elapsed = now - start_time
        state = challenge.process_frame(frame_flipped, timestamp_sec=now)

        hud_frame = draw_hud(frame_flipped, challenge, state, elapsed, timeout_seconds)
        cv2.imshow("DocShield AI - Phase 5 Liveness Verification", hud_frame)

        if (state.is_completed or state.is_failed) and not completed_announced:
            result = challenge.get_result()
            print("\n[RESULT] Verification Complete:")
            print(json.dumps(result.to_standard_response(), indent=2))
            completed_announced = True

        key = cv2.waitKey(1) & 0xFF
        if key in (27, ord("q"), ord("Q")):
            break
        elif key in (ord("r"), ord("R")):
            challenge.reset()
            start_time = time.time()
            completed_announced = False
            print("[INFO] Challenge reset.")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DocShield Face Liveness Webcam Demo")
    parser.add_argument("--camera", type=int, default=0, help="Camera device index (default 0)")
    parser.add_argument("--timeout", type=float, default=15.0, help="Timeout in seconds (default 15.0)")
    args = parser.parse_args()

    run_webcam_demo(camera_index=args.camera, timeout_seconds=args.timeout)
