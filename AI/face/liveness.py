"""
DocShield AI — Phase 5: Active Liveness Detection Module
Head-Pose & Facial Landmark Tracking using MediaPipe Face Mesh & OpenCV.

Pipeline:
  Live Video Stream / Frame Sequence
             ↓
  MediaPipe Face Mesh (478 3D Canonical Landmarks + Transformation Matrix)
             ↓
  Head Pose Estimation (Yaw, Pitch, Roll in Degrees & Landmark Geometry)
             ↓
  Active Challenge State Machine (Center → Turn Left → Turn Right)
             ↓
  Smoothing & Temporal Debounce Verification
             ↓
  Standard Output: { "liveness": { "status": "PASS" | "FAIL", "confidence": float, ... } }
"""

from dataclasses import dataclass, field
from enum import Enum
import logging
import os
from pathlib import Path
import time
from typing import Any, Dict, Generator, Iterable, List, Optional, Tuple, Union
import urllib.request

import cv2
import numpy as np

logger = logging.getLogger("docshield.face.liveness")

# Default model download location and URL
DEFAULT_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
MODEL_FILENAME = "face_landmarker.task"


class LivenessStatus(str, Enum):
    """Overall liveness evaluation outcome."""
    PASS = "PASS"
    FAIL = "FAIL"
    IN_PROGRESS = "IN_PROGRESS"


class LivenessStage(str, Enum):
    """Sequential stages of the active liveness challenge."""
    INITIALIZING = "INITIALIZING"
    CENTER = "CENTER"
    TURN_LEFT = "TURN_LEFT"
    TURN_RIGHT = "TURN_RIGHT"
    PASSED = "PASSED"
    FAILED = "FAILED"


# --- Custom Exception Classes ---

class LivenessError(Exception):
    """Base exception for liveness detection failures."""
    def __init__(self, message: str, error_code: str = "LIVENESS_FAILED", details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}


class NoFaceInFrameError(LivenessError):
    """Raised when no face is found in input frames during liveness evaluation."""
    def __init__(self, message: str = "No face detected in video stream.", details: Optional[dict] = None):
        super().__init__(message, error_code="NO_FACE_DETECTED", details=details)


class MultipleFacesInFrameError(LivenessError):
    """Raised when multiple faces are detected in a scene."""
    def __init__(self, count: int, message: Optional[str] = None, details: Optional[dict] = None):
        msg = message or f"Multiple faces detected ({count}). Exactly one face required for liveness challenge."
        super().__init__(msg, error_code="MULTIPLE_FACES_DETECTED", details=details or {"count": count})


class LivenessChallengeTimeoutError(LivenessError):
    """Raised when the user fails to complete the challenge within the allowed time limit."""
    def __init__(self, message: str = "Liveness challenge timed out before required movements were completed.", details: Optional[dict] = None):
        super().__init__(message, error_code="CHALLENGE_TIMEOUT", details=details)


@dataclass
class HeadPose:
    """Estimated head orientation angles in degrees and landmark geometry."""
    pitch: float  # Up / Down angle (degrees)
    yaw: float    # Left / Right rotation (negative = Left, positive = Right)
    roll: float   # Lateral head tilt (degrees)
    nose_ratio: float = 1.0  # Horizontal landmark asymmetry ratio (left vs right cheek)
    face_center: Tuple[float, float] = (0.0, 0.0)  # Normalized (x, y)
    face_size: float = 0.0  # Normalized face bounding box diagonal

    def to_dict(self) -> Dict[str, float]:
        return {
            "pitch": round(float(self.pitch), 2),
            "yaw": round(float(self.yaw), 2),
            "roll": round(float(self.roll), 2),
            "nose_ratio": round(float(self.nose_ratio), 3),
        }


@dataclass
class LivenessResult:
    """
    Structured outcome of the active liveness detection verification.
    """
    status: str  # "PASS" or "FAIL"
    confidence: float  # 0.0 to 1.0
    reason: Optional[str] = None  # Rejection reason on failure
    stages_completed: List[str] = field(default_factory=list)
    total_frames_processed: int = 0
    elapsed_time_sec: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to a comprehensive dictionary."""
        res: Dict[str, Any] = {
            "status": self.status,
            "confidence": round(float(self.confidence), 4),
        }
        if self.reason:
            res["reason"] = self.reason
        res["stages_completed"] = self.stages_completed
        res["total_frames_processed"] = self.total_frames_processed
        res["elapsed_time_sec"] = round(float(self.elapsed_time_sec), 3)
        if self.details:
            res["details"] = self.details
        return res

    def to_standard_response(self) -> Dict[str, Any]:
        """
        Return standard JSON schema required by backend & specifications:
        Success: { "liveness": { "status": "PASS", "confidence": 0.94 } }
        Failure: { "liveness": { "status": "FAIL", "confidence": 0.20, "reason": "..." } }
        """
        data: Dict[str, Any] = {
            "status": self.status,
            "confidence": round(float(self.confidence), 2),
        }
        if self.reason:
            data["reason"] = self.reason
        return {"liveness": data}


@dataclass
class FrameLivenessState:
    """State of a single video frame during real-time streaming feedback."""
    stage: LivenessStage
    instruction: str
    pose: Optional[HeadPose]
    faces_detected: int
    debounce_progress: float  # 0.0 to 1.0 (how close the current action is to completion)
    is_completed: bool
    is_failed: bool
    error_message: Optional[str] = None


def _get_model_path() -> Path:
    """Locate or download the MediaPipe face_landmarker.task model file."""
    # Possible search paths
    search_dirs = [
        Path(__file__).resolve().parent / "models",
        Path(__file__).resolve().parent.parent / "face" / "models",
        Path(__file__).resolve().parent.parent / "AI" / "face" / "models",
        Path.home() / ".docshield" / "models",
    ]

    for d in search_dirs:
        candidate = d / MODEL_FILENAME
        if candidate.exists() and candidate.stat().st_size > 1000000:
            return candidate

    # If not found, download to the package's local models directory
    target_dir = Path(__file__).resolve().parent / "models"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / MODEL_FILENAME

    logger.info("Downloading MediaPipe face landmarker model to %s...", target_path)
    try:
        urllib.request.urlretrieve(DEFAULT_MODEL_URL, str(target_path))
        logger.info("Model downloaded successfully (%d bytes).", target_path.stat().st_size)
        return target_path
    except Exception as e:
        logger.error("Failed to download FaceLandmarker model: %s", e)
        raise RuntimeError(
            f"Failed to obtain MediaPipe Face Landmarker model asset. Please ensure internet access or place {MODEL_FILENAME} in {target_dir}."
        ) from e


class LivenessDetector:
    """
    Core MediaPipe Face Mesh & Landmark analysis engine.
    Extracts 478 3D landmarks and calculates 3D head pose angles (pitch, yaw, roll).
    """

    def __init__(self, model_path: Optional[Union[str, Path]] = None):
        """
        Initialize the MediaPipe Face Landmarker.
        """
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision

        self.mp = mp
        self.vision = vision
        self.python = python

        if model_path is None:
            self.model_path = _get_model_path()
        else:
            self.model_path = Path(model_path)

        base_options = python.BaseOptions(model_asset_path=str(self.model_path.resolve()))
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=True,
            num_faces=4,
            min_face_detection_confidence=0.40,
            min_face_presence_confidence=0.40,
            min_tracking_confidence=0.40,
        )
        self.landmarker = vision.FaceLandmarker.create_from_options(options)

    def extract_landmarks_and_pose(
        self, frame_bgr: np.ndarray
    ) -> Tuple[int, Optional[HeadPose], Optional[List[Any]]]:
        """
        Analyze a single BGR frame.

        Returns:
            Tuple: (faces_detected_count, primary_head_pose, raw_landmarks)
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return 0, None, None

        h, w = frame_bgr.shape[:2]
        img_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=img_rgb)
        detection_result = self.landmarker.detect(mp_image)

        face_count = len(detection_result.face_landmarks)
        if face_count == 0:
            return 0, None, None

        landmarks = detection_result.face_landmarks[0]

        # 1. 3D Facial Transformation Matrix Euler angles
        pitch_mat, yaw_mat, roll_mat = 0.0, 0.0, 0.0
        matrix_available = False
        if detection_result.facial_transformation_matrixes:
            mat = detection_result.facial_transformation_matrixes[0]
            if mat is not None and mat.shape == (4, 4):
                rot = mat[:3, :3]
                sy = np.sqrt(rot[0, 0] * rot[0, 0] + rot[1, 0] * rot[1, 0])
                if sy > 1e-6:
                    x = np.arctan2(rot[2, 1], rot[2, 2])
                    y = np.arctan2(-rot[2, 0], sy)
                    z = np.arctan2(rot[1, 0], rot[0, 0])
                else:
                    x = np.arctan2(-rot[1, 2], rot[1, 1])
                    y = np.arctan2(-rot[2, 0], sy)
                    z = 0.0
                pitch_mat = float(np.degrees(x))
                yaw_mat = float(np.degrees(y))
                roll_mat = float(np.degrees(z))
                matrix_available = True

        # 2. Geometric Landmarks Calculation
        nose_pt = landmarks[1] if len(landmarks) > 1 else landmarks[0]
        left_cheek = landmarks[234] if len(landmarks) > 234 else landmarks[0]
        right_cheek = landmarks[454] if len(landmarks) > 454 else landmarks[-1]
        forehead = landmarks[10] if len(landmarks) > 10 else landmarks[0]
        chin = landmarks[152] if len(landmarks) > 152 else landmarks[-1]

        # Horizontal face width and midpoint
        face_w_norm = max(1e-5, abs(right_cheek.x - left_cheek.x))
        mid_x = (left_cheek.x + right_cheek.x) / 2.0
        offset_x = nose_pt.x - mid_x
        norm_offset = offset_x / (face_w_norm / 2.0)
        geom_yaw = float(np.arcsin(np.clip(norm_offset, -1.0, 1.0)) * 180.0 / np.pi)

        # Left vs right cheek distances from nose
        d_left = abs(nose_pt.x - left_cheek.x)
        d_right = abs(right_cheek.x - nose_pt.x)
        ratio = (d_left / max(d_right, 1e-5)) if d_right > 1e-5 else 1.0

        # Vertical face height and pitch
        face_h_norm = max(1e-5, abs(chin.y - forehead.y))
        mid_y = (forehead.y + chin.y) / 2.0
        offset_y = nose_pt.y - mid_y
        norm_pitch = offset_y / (face_h_norm / 2.0)
        geom_pitch = float(np.arcsin(np.clip(norm_pitch, -1.0, 1.0)) * 180.0 / np.pi)

        # Estimate face size & center
        face_size = np.sqrt(face_w_norm * face_w_norm + face_h_norm * face_h_norm)
        face_center = (float(nose_pt.x), float(nose_pt.y))

        # Combined Yaw and Pitch
        if matrix_available and abs(yaw_mat) > 2.0:
            yaw = yaw_mat
        else:
            yaw = geom_yaw * 1.5

        pitch = pitch_mat if matrix_available and abs(pitch_mat) > 2.0 else geom_pitch
        roll = roll_mat

        pose = HeadPose(
            pitch=pitch,
            yaw=yaw,
            roll=roll,
            nose_ratio=float(ratio),
            face_center=face_center,
            face_size=float(face_size),
        )
        return face_count, pose, landmarks


class LivenessChallenge:
    """
    Active Liveness State Machine.
    
    Verifies that a live subject follows the sequential head turn challenge:
      1. Center (stable baseline)
      2. Turn head LEFT
      3. Turn head RIGHT
    
    Includes temporal smoothing, debounce buffers, multi-face rejection,
    and anti-spoof static frame detection.
    """

    def __init__(
        self,
        detector: Optional[LivenessDetector] = None,
        yaw_threshold_left: float = -10.0,   # Degrees (negative is Left)
        yaw_threshold_right: float = 10.0,   # Degrees (positive is Right)
        min_consecutive_frames: int = 3,    # Frames required to satisfy debounce
        timeout_seconds: float = 10.0,       # Maximum allowed duration
        max_frames: int = 300,              # Maximum frame count
        smoothing_window: int = 4,          # Moving average window
    ):
        self.detector = detector or get_liveness_detector()
        self.yaw_threshold_left = yaw_threshold_left
        self.yaw_threshold_right = yaw_threshold_right
        self.min_consecutive_frames = min_consecutive_frames
        self.timeout_seconds = timeout_seconds
        self.max_frames = max_frames
        self.smoothing_window = smoothing_window

        self.reset()

    def reset(self):
        """Reset the challenge state machine for a new verification session."""
        self.current_stage = LivenessStage.CENTER
        self.stages_completed: List[str] = []
        self.stage_frame_count = 0
        self.total_frames = 0
        self.start_time: Optional[float] = None
        self.last_frame_time: Optional[float] = None
        self.is_passed = False
        self.is_failed = False
        self.failure_reason: Optional[str] = None
        self.confidence = 0.0

        # Debounce and smoothing histories
        self.recent_yaws: List[float] = []
        self.recent_pitches: List[float] = []
        self.landmark_snapshots: List[np.ndarray] = []
        self.turn_left_hold_frames = 0
        self.turn_right_hold_frames = 0
        self.center_hold_frames = 0
        self.consecutive_no_face_frames = 0

    def process_frame(
        self, frame_bgr: Optional[np.ndarray], timestamp_sec: Optional[float] = None
    ) -> FrameLivenessState:
        """
        Process a single video frame through landmark extraction and pose state machine.
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return self.process_pose(None, face_count=0, timestamp_sec=timestamp_sec)

        face_count, raw_pose, landmarks = self.detector.extract_landmarks_and_pose(frame_bgr)
        return self.process_pose(
            raw_pose,
            face_count=face_count,
            timestamp_sec=timestamp_sec,
            landmarks=landmarks,
        )

    def process_pose(
        self,
        raw_pose: Optional[HeadPose],
        face_count: int = 1,
        timestamp_sec: Optional[float] = None,
        landmarks: Optional[List[Any]] = None,
    ) -> FrameLivenessState:
        """
        Process extracted head pose through the active liveness state machine.
        """
        now = timestamp_sec if timestamp_sec is not None else time.time()
        if self.start_time is None:
            self.start_time = now
        self.last_frame_time = now
        self.total_frames += 1

        elapsed = now - self.start_time

        # Check if already completed or failed
        if self.is_passed:
            return FrameLivenessState(
                stage=LivenessStage.PASSED,
                instruction="Liveness challenge completed successfully.",
                pose=raw_pose,
                faces_detected=1,
                debounce_progress=1.0,
                is_completed=True,
                is_failed=False,
            )

        if self.is_failed:
            return FrameLivenessState(
                stage=LivenessStage.FAILED,
                instruction=f"Challenge failed: {self.failure_reason}",
                pose=raw_pose,
                faces_detected=face_count,
                debounce_progress=0.0,
                is_completed=False,
                is_failed=True,
                error_message=self.failure_reason,
            )

        # 1. Timeout Check
        if elapsed > self.timeout_seconds or self.total_frames > self.max_frames:
            self.is_failed = True
            self.failure_reason = "Liveness challenge not completed within timeout."
            self.confidence = 0.20
            return FrameLivenessState(
                stage=LivenessStage.FAILED,
                instruction=f"Challenge failed: {self.failure_reason}",
                pose=raw_pose,
                faces_detected=face_count,
                debounce_progress=0.0,
                is_completed=False,
                is_failed=True,
                error_message=self.failure_reason,
            )

        # 2. Rejection: No face detected
        if face_count == 0 or raw_pose is None:
            self.consecutive_no_face_frames += 1
            if self.consecutive_no_face_frames > 15:
                self.is_failed = True
                self.failure_reason = "No face detected in video stream."
                self.confidence = 0.10
                return FrameLivenessState(
                    stage=LivenessStage.FAILED,
                    instruction="Failed: No face detected.",
                    pose=None,
                    faces_detected=0,
                    debounce_progress=0.0,
                    is_completed=False,
                    is_failed=True,
                    error_message=self.failure_reason,
                )
            return FrameLivenessState(
                stage=self.current_stage,
                instruction="Please align your face inside the camera view.",
                pose=None,
                faces_detected=0,
                debounce_progress=0.0,
                is_completed=False,
                is_failed=False,
            )

        self.consecutive_no_face_frames = 0

        # Rejection: Multiple faces detected
        if face_count > 1:
            self.is_failed = True
            self.failure_reason = f"Multiple faces detected ({face_count}). Exactly one face required."
            self.confidence = 0.15
            return FrameLivenessState(
                stage=LivenessStage.FAILED,
                instruction="Failed: Multiple faces detected.",
                pose=raw_pose,
                faces_detected=face_count,
                debounce_progress=0.0,
                is_completed=False,
                is_failed=True,
                error_message=self.failure_reason,
            )

        # Anti-static photo replay detection (record variance)
        if landmarks:
            lm_array = np.array([[lm.x, lm.y, lm.z] for lm in landmarks[:10]], dtype=np.float32)
            self.landmark_snapshots.append(lm_array)
            if len(self.landmark_snapshots) > 30:
                self.landmark_snapshots.pop(0)

        # 3. Apply Moving Average Smoothing on Yaw/Pitch
        self.recent_yaws.append(raw_pose.yaw)
        self.recent_pitches.append(raw_pose.pitch)
        if len(self.recent_yaws) > self.smoothing_window:
            self.recent_yaws.pop(0)
            self.recent_pitches.pop(0)

        smoothed_yaw = float(np.mean(self.recent_yaws))
        smoothed_pitch = float(np.mean(self.recent_pitches))
        smoothed_pose = HeadPose(
            pitch=smoothed_pitch,
            yaw=smoothed_yaw,
            roll=raw_pose.roll,
            nose_ratio=raw_pose.nose_ratio,
            face_center=raw_pose.face_center,
            face_size=raw_pose.face_size,
        )

        # 4. State Machine Stage Transitions
        debounce_progress = 0.0
        instruction = ""

        # --- Stage 1: CENTER (Initial alignment) ---
        if self.current_stage == LivenessStage.CENTER:
            instruction = "Look straight at the camera."
            is_centered = abs(smoothed_yaw) < 10.0 and abs(smoothed_pitch) < 18.0
            if is_centered:
                self.center_hold_frames += 1
            else:
                self.center_hold_frames = max(0, self.center_hold_frames - 1)

            debounce_progress = min(1.0, self.center_hold_frames / self.min_consecutive_frames)
            if self.center_hold_frames >= self.min_consecutive_frames:
                self.stages_completed.append("CENTER")
                self.current_stage = LivenessStage.TURN_LEFT
                self.stage_frame_count = 0

        # --- Stage 2: TURN_LEFT ---
        elif self.current_stage == LivenessStage.TURN_LEFT:
            instruction = "Turn your head to the LEFT."
            is_turning_left = (
                smoothed_yaw <= self.yaw_threshold_left
                or smoothed_pose.nose_ratio < 0.78
            )

            if is_turning_left:
                self.turn_left_hold_frames += 1
            else:
                self.turn_left_hold_frames = max(0, self.turn_left_hold_frames - 1)

            debounce_progress = min(1.0, self.turn_left_hold_frames / self.min_consecutive_frames)
            if self.turn_left_hold_frames >= self.min_consecutive_frames:
                self.stages_completed.append("TURN_LEFT")
                self.current_stage = LivenessStage.TURN_RIGHT
                self.stage_frame_count = 0

        # --- Stage 3: TURN_RIGHT ---
        elif self.current_stage == LivenessStage.TURN_RIGHT:
            instruction = "Turn your head to the RIGHT."
            is_turning_right = (
                smoothed_yaw >= self.yaw_threshold_right
                or smoothed_pose.nose_ratio > 1.28
            )

            if is_turning_right:
                self.turn_right_hold_frames += 1
            else:
                self.turn_right_hold_frames = max(0, self.turn_right_hold_frames - 1)

            debounce_progress = min(1.0, self.turn_right_hold_frames / self.min_consecutive_frames)
            if self.turn_right_hold_frames >= self.min_consecutive_frames:
                self.stages_completed.append("TURN_RIGHT")
                self.current_stage = LivenessStage.PASSED
                self.is_passed = True
                instruction = "Liveness challenge completed successfully."
                debounce_progress = 1.0

                # Compute confidence score
                motion_variance = 0.0
                if len(self.landmark_snapshots) >= 5:
                    motion_variance = float(np.var(np.array(self.landmark_snapshots)))

                if len(self.landmark_snapshots) >= 15 and motion_variance < 1e-7:
                    self.is_passed = False
                    self.is_failed = True
                    self.failure_reason = "Static spoof detected. No dynamic biological motion."
                    self.confidence = 0.15
                    return FrameLivenessState(
                        stage=LivenessStage.FAILED,
                        instruction="Failed: Static spoof detected.",
                        pose=smoothed_pose,
                        faces_detected=1,
                        debounce_progress=0.0,
                        is_completed=False,
                        is_failed=True,
                        error_message=self.failure_reason,
                    )

                self.confidence = round(float(np.clip(0.92 + min(0.06, motion_variance * 50), 0.90, 0.98)), 2)

        return FrameLivenessState(
            stage=self.current_stage,
            instruction=instruction,
            pose=smoothed_pose,
            faces_detected=face_count,
            debounce_progress=debounce_progress,
            is_completed=self.is_passed,
            is_failed=self.is_failed,
            error_message=self.failure_reason,
        )

    def get_result(self) -> LivenessResult:
        """
        Return the final LivenessResult summary.
        """
        elapsed = (self.last_frame_time - self.start_time) if (self.start_time and self.last_frame_time) else 0.0

        if self.is_passed:
            return LivenessResult(
                status=LivenessStatus.PASS.value,
                confidence=self.confidence or 0.94,
                stages_completed=self.stages_completed,
                total_frames_processed=self.total_frames,
                elapsed_time_sec=elapsed,
                details={
                    "stages": self.stages_completed,
                    "thresholds": {
                        "yaw_left": self.yaw_threshold_left,
                        "yaw_right": self.yaw_threshold_right,
                    },
                },
            )

        return LivenessResult(
            status=LivenessStatus.FAIL.value,
            confidence=self.confidence or 0.20,
            reason=self.failure_reason or "Liveness challenge not completed",
            stages_completed=self.stages_completed,
            total_frames_processed=self.total_frames,
            elapsed_time_sec=elapsed,
            details={
                "stages_completed": self.stages_completed,
                "consecutive_no_face": self.consecutive_no_face_frames,
            },
        )


# Shared singleton detector instance
_shared_liveness_detector: Optional[LivenessDetector] = None


def get_liveness_detector() -> LivenessDetector:
    """Return a shared singleton instance of LivenessDetector."""
    global _shared_liveness_detector
    if _shared_liveness_detector is None:
        _shared_liveness_detector = LivenessDetector()
    return _shared_liveness_detector


def check_liveness(
    video_frames: Union[List[np.ndarray], Iterable[np.ndarray], str, Path, cv2.VideoCapture],
    detector: Optional[LivenessDetector] = None,
    yaw_threshold_left: float = -10.0,
    yaw_threshold_right: float = 10.0,
    min_consecutive_frames: int = 3,
    timeout_seconds: float = 10.0,
) -> Dict[str, Any]:
    """
    Evaluate active liveness challenge on a sequence of video frames or video stream.

    Args:
        video_frames: List of BGR frames, video file path, or open cv2.VideoCapture.
        detector: Optional pre-initialized LivenessDetector instance.
        yaw_threshold_left: Target yaw angle for turning left (default -10°).
        yaw_threshold_right: Target yaw angle for turning right (default +10°).
        min_consecutive_frames: Number of consecutive debounced frames required.
        timeout_seconds: Max allowable time for completion.

    Returns:
        Dict matching standard JSON response:
            {
                "liveness": {
                    "status": "PASS" | "FAIL",
                    "confidence": float,
                    "reason": str (on failure)
                }
            }
    """
    challenge = LivenessChallenge(
        detector=detector,
        yaw_threshold_left=yaw_threshold_left,
        yaw_threshold_right=yaw_threshold_right,
        min_consecutive_frames=min_consecutive_frames,
        timeout_seconds=timeout_seconds,
    )

    # 1. If input is a video path or camera index
    if isinstance(video_frames, (str, Path)):
        cap = cv2.VideoCapture(str(video_frames))
        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret or frame is None:
                    break
                state = challenge.process_frame(frame)
                if state.is_completed or state.is_failed:
                    break
        finally:
            cap.release()

    elif isinstance(video_frames, cv2.VideoCapture):
        while video_frames.isOpened():
            ret, frame = video_frames.read()
            if not ret or frame is None:
                break
            state = challenge.process_frame(frame)
            if state.is_completed or state.is_failed:
                break

    # 2. If input is a list / iterable of frames
    elif isinstance(video_frames, (list, tuple, Generator, Iterable)):
        frame_list = list(video_frames)
        if len(frame_list) == 0:
            return {
                "liveness": {
                    "status": "FAIL",
                    "confidence": 0.10,
                    "reason": "No video frames provided for liveness analysis.",
                }
            }

        sim_time = time.time()
        for idx, frame in enumerate(frame_list):
            state = challenge.process_frame(frame, timestamp_sec=sim_time + (idx * 0.033))
            if state.is_completed or state.is_failed:
                break

    else:
        return {
            "liveness": {
                "status": "FAIL",
                "confidence": 0.10,
                "reason": f"Unsupported video frames input type: {type(video_frames)}",
            }
        }

    res = challenge.get_result()
    return res.to_standard_response()
