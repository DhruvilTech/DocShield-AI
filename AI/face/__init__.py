"""
DocShield AI — Face Processing Package
"""

from face.detector import DetectedFace, FaceDetector, get_detector
from face.embedding import FaceEmbedder, get_embedder, get_embedding, cosine_similarity
from face.verification import (
    FaceVerifier,
    get_verifier,
    verify_face,
    FaceVerificationError,
    NoFaceDetectedError,
    MultipleFacesDetectedError,
    LowQualityImageError,
    EmbeddingExtractionError,
    check_image_quality,
)
from face.liveness import (
    HeadPose,
    LivenessStatus,
    LivenessStage,
    LivenessResult,
    FrameLivenessState,
    LivenessDetector,
    LivenessChallenge,
    get_liveness_detector,
    check_liveness,
    LivenessError,
    NoFaceInFrameError,
    MultipleFacesInFrameError,
    LivenessChallengeTimeoutError,
)
from face.service import FaceBiometricsService, get_service

__all__ = [
    "DetectedFace",
    "FaceDetector",
    "get_detector",
    "FaceEmbedder",
    "get_embedder",
    "get_embedding",
    "cosine_similarity",
    "FaceVerifier",
    "get_verifier",
    "verify_face",
    "FaceVerificationError",
    "NoFaceDetectedError",
    "MultipleFacesDetectedError",
    "LowQualityImageError",
    "EmbeddingExtractionError",
    "check_image_quality",
    "HeadPose",
    "LivenessStatus",
    "LivenessStage",
    "LivenessResult",
    "FrameLivenessState",
    "LivenessDetector",
    "LivenessChallenge",
    "get_liveness_detector",
    "check_liveness",
    "LivenessError",
    "NoFaceInFrameError",
    "MultipleFacesInFrameError",
    "LivenessChallengeTimeoutError",
    "FaceBiometricsService",
    "get_service",
]
