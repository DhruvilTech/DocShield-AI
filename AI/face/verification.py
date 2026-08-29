"""
DocShield AI — Phase 3: Biometric Face Verification Module
1:1 Identity Matching with ArcFace Embeddings, Image Quality Validation & Cosine Similarity.

Pipeline:
  Document Face + Live Face
             ↓
  Quality & Singularity Checks (Brightness, Sharpness, Single Face)
             ↓
  Canonical 112×112 Landmark Alignment & ArcFace 512-d Embedding
             ↓
  Cosine Similarity Metric vs Configurable Threshold
             ↓
  { similarity, match, confidence, status }
"""

from dataclasses import dataclass, field
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np

from face.detector import DetectedFace, FaceDetector, get_detector
from face.embedding import FaceEmbedder, cosine_similarity, get_embedder

logger = logging.getLogger("docshield.face.verification")

# Default verification threshold (configurable via environment variable)
DEFAULT_MATCH_THRESHOLD = float(
    os.getenv("DOCSHIELD_FACE_MATCH_THRESHOLD", os.getenv("FACE_VERIFY_THRESHOLD", "0.45"))
)


# --- Custom Exception Classes ---

class FaceVerificationError(Exception):
    """Base exception for face verification failures."""
    def __init__(self, message: str, error_code: str = "VERIFICATION_FAILED", details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}


class NoFaceDetectedError(FaceVerificationError):
    """Raised when no face is found in an image."""
    def __init__(self, message: str = "No face detected in the provided image.", details: Optional[dict] = None):
        super().__init__(message, error_code="NO_FACE_DETECTED", details=details)


class MultipleFacesDetectedError(FaceVerificationError):
    """Raised when multiple faces are detected where exactly one was expected."""
    def __init__(self, count: int, message: Optional[str] = None, details: Optional[dict] = None):
        msg = message or f"Multiple faces detected ({count}). Exactly one face required for 1:1 verification."
        super().__init__(msg, error_code="MULTIPLE_FACES_DETECTED", details=details or {"count": count})


class LowQualityImageError(FaceVerificationError):
    """Raised when face or image quality fails acceptable thresholds."""
    def __init__(self, reason: str, details: Optional[dict] = None):
        super().__init__(f"Image rejected due to low quality: {reason}", error_code="POOR_IMAGE_QUALITY", details=details)


class EmbeddingExtractionError(FaceVerificationError):
    """Raised when ArcFace feature extraction fails."""
    def __init__(self, message: str = "Failed to extract face embedding representation.", details: Optional[dict] = None):
        super().__init__(message, error_code="EMBEDDING_FAILED", details=details)


@dataclass
class QualityMetrics:
    """Quality metrics evaluated for an input image and face crop."""
    brightness: float
    sharpness: float
    face_width: int
    face_height: int
    confidence: float
    is_valid: bool
    rejection_reason: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "brightness": round(self.brightness, 2),
            "sharpness": round(self.sharpness, 2),
            "face_width": self.face_width,
            "face_height": self.face_height,
            "confidence": round(self.confidence, 4),
            "is_valid": self.is_valid,
            "rejection_reason": self.rejection_reason,
        }


def check_image_quality(
    image: np.ndarray,
    face: DetectedFace,
    min_face_dim: int = 40,
    min_sharpness: float = 20.0,
    min_brightness: float = 20.0,
    max_brightness: float = 245.0,
    min_confidence: float = 0.50,
) -> QualityMetrics:
    """
    Validate image and face crop quality prior to biometric embedding.

    Checks:
      1. Minimum face crop resolution (width & height).
      2. Detection confidence threshold.
      3. Brightness / illumination bounds (prevents total darkness or washed-out overexposure).
      4. Sharpness via Laplacian variance (prevents excessive motion/focus blur).
    """
    x1, y1, x2, y2 = face.bbox
    w = max(0, x2 - x1)
    h = max(0, y2 - y1)

    # 1. Dimension check
    if w < min_face_dim or h < min_face_dim:
        return QualityMetrics(
            brightness=0.0, sharpness=0.0, face_width=w, face_height=h,
            confidence=face.confidence, is_valid=False,
            rejection_reason=f"Face crop too small ({w}x{h}px). Minimum required is {min_face_dim}x{min_face_dim}px.",
        )

    # 2. Confidence check
    if face.confidence < min_confidence:
        return QualityMetrics(
            brightness=0.0, sharpness=0.0, face_width=w, face_height=h,
            confidence=face.confidence, is_valid=False,
            rejection_reason=f"Face detection confidence ({face.confidence:.2f}) below threshold {min_confidence:.2f}.",
        )

    # Extract crop
    crop = face.crop if face.crop is not None and face.crop.size > 0 else image[y1:y2, x1:x2]
    if crop is None or crop.size == 0:
        return QualityMetrics(
            brightness=0.0, sharpness=0.0, face_width=w, face_height=h,
            confidence=face.confidence, is_valid=False,
            rejection_reason="Unable to extract face region pixels.",
        )

    gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop

    # 3. Brightness check (mean pixel intensity)
    brightness = float(np.mean(gray_crop))
    if brightness < min_brightness:
        return QualityMetrics(
            brightness=brightness, sharpness=0.0, face_width=w, face_height=h,
            confidence=face.confidence, is_valid=False,
            rejection_reason=f"Face image is too dark (brightness {brightness:.1f} < {min_brightness}).",
        )
    if brightness > max_brightness:
        return QualityMetrics(
            brightness=brightness, sharpness=0.0, face_width=w, face_height=h,
            confidence=face.confidence, is_valid=False,
            rejection_reason=f"Face image is severely overexposed (brightness {brightness:.1f} > {max_brightness}).",
        )

    # 4. Sharpness check (Laplacian variance)
    laplacian = cv2.Laplacian(gray_crop, cv2.CV_64F)
    sharpness = float(laplacian.var())
    if sharpness < min_sharpness:
        return QualityMetrics(
            brightness=brightness, sharpness=sharpness, face_width=w, face_height=h,
            confidence=face.confidence, is_valid=False,
            rejection_reason=f"Face image is excessively blurry (sharpness {sharpness:.1f} < {min_sharpness}).",
        )

    return QualityMetrics(
        brightness=brightness,
        sharpness=sharpness,
        face_width=w,
        face_height=h,
        confidence=face.confidence,
        is_valid=True,
    )


class FaceVerifier:
    """
    High-accuracy 1:1 Face Verification Engine using ArcFace feature representations.
    
    Verifies that a face portrait from an identity document matches a live verification capture.
    """

    def __init__(
        self,
        threshold: Optional[float] = None,
        detector: Optional[FaceDetector] = None,
        embedder: Optional[FaceEmbedder] = None,
        model_name: str = "buffalo_s",
    ):
        """
        Initialize the FaceVerifier.

        Args:
            threshold: Cosine similarity threshold for matching (defaults to env or 0.45).
            detector: Reusable FaceDetector instance (or default shared instance).
            embedder: Reusable FaceEmbedder instance (or default shared instance).
            model_name: InsightFace model name.
        """
        self.threshold = threshold if threshold is not None else DEFAULT_MATCH_THRESHOLD
        self.detector = detector or get_detector()
        self.embedder = embedder or get_embedder()
        self.model_name = model_name

    def _select_primary_face(
        self, faces: List[DetectedFace], source_label: str = "image"
    ) -> DetectedFace:
        """
        Select the primary face while checking for ambiguous multi-face scenes.
        Filters out background thumbnails (< 20% area of largest face).
        """
        if len(faces) == 0:
            raise NoFaceDetectedError(f"No face detected in {source_label}.")

        if len(faces) == 1:
            return faces[0]

        # Calculate bounding box area for all detected faces
        areas = [(f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]) for f in faces]
        max_area = max(areas)

        # Prominent faces are at least 20% size of the primary face
        prominent_faces = [f for f, a in zip(faces, areas) if a >= 0.20 * max_area]

        if len(prominent_faces) > 1:
            raise MultipleFacesDetectedError(
                count=len(prominent_faces),
                message=f"Expected 1 face in {source_label}, found {len(prominent_faces)} prominent faces.",
                details={"prominent_count": len(prominent_faces), "total_detected": len(faces)},
            )

        return prominent_faces[0]

    def verify(
        self,
        document_image: Union[str, Path, np.ndarray],
        live_image: Union[str, Path, np.ndarray],
        threshold: Optional[float] = None,
        check_quality: bool = True,
    ) -> Dict[str, Any]:
        """
        Execute full 1:1 face verification between document portrait and live face capture.

        Args:
            document_image: Path or BGR array for identity document portrait.
            live_image: Path or BGR array for live selfie verification.
            threshold: Optional override for verification threshold.
            check_quality: Whether to run sharpness, brightness, and resolution checks.

        Returns:
            Dict containing:
                - similarity (float): Cosine similarity score between 0.0 and 1.0.
                - match (bool): True if similarity >= threshold.
                - confidence (float): Calibrated match confidence score.
                - status (str): 'MATCH' or 'NO_MATCH'.
                - threshold (float): Applied decision boundary.
                - model_name (str): Underline model name.
                - doc_quality (dict): Document image quality metrics.
                - live_quality (dict): Live image quality metrics.

        Raises:
            NoFaceDetectedError: If no face found in either image.
            MultipleFacesDetectedError: If multiple prominent faces found.
            LowQualityImageError: If either face fails quality threshold checks.
            EmbeddingExtractionError: If ArcFace feature generation fails.
        """
        active_threshold = threshold if threshold is not None else self.threshold

        # Step 1: Detect face in document image
        raw_doc_img = self.detector._read_image(document_image)
        doc_faces = self.detector.detect(raw_doc_img)
        doc_face = self._select_primary_face(doc_faces, source_label="document image")

        # Step 2: Detect face in live image
        raw_live_img = self.detector._read_image(live_image)
        live_faces = self.detector.detect(raw_live_img)
        live_face = self._select_primary_face(live_faces, source_label="live verification image")

        # Step 3: Run quality checks
        doc_quality = check_image_quality(raw_doc_img, doc_face)
        live_quality = check_image_quality(raw_live_img, live_face)

        if check_quality:
            if not doc_quality.is_valid:
                raise LowQualityImageError(
                    f"Document photo: {doc_quality.rejection_reason}",
                    details={"source": "document", "metrics": doc_quality.to_dict()},
                )
            if not live_quality.is_valid:
                raise LowQualityImageError(
                    f"Live capture: {live_quality.rejection_reason}",
                    details={"source": "live", "metrics": live_quality.to_dict()},
                )

        # Step 4: Extract 512-d normalized ArcFace embeddings
        emb_doc = self.embedder.extract_embedding(raw_doc_img)
        emb_live = self.embedder.extract_embedding(raw_live_img)

        if emb_doc is None:
            raise EmbeddingExtractionError("Failed to extract embedding from document face.")
        if emb_live is None:
            raise EmbeddingExtractionError("Failed to extract embedding from live verification face.")

        # Step 5: Compute Cosine Similarity
        raw_sim = cosine_similarity(emb_doc, emb_live)
        similarity = float(np.clip(raw_sim, 0.0, 1.0))

        is_match = similarity >= active_threshold
        status = "MATCH" if is_match else "NO_MATCH"

        # Step 6: Confidence calculation
        confidence = round(float(similarity), 4)

        return {
            "similarity": round(float(similarity), 4),
            "match": bool(is_match),
            "confidence": confidence,
            "status": status,
            "threshold": round(float(active_threshold), 4),
            "model_name": f"insightface-arcface-{self.model_name}",
            "doc_quality": doc_quality.to_dict(),
            "live_quality": live_quality.to_dict(),
        }

    def verify_safe(
        self,
        document_image: Union[str, Path, np.ndarray],
        live_image: Union[str, Path, np.ndarray],
        threshold: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Safe verification wrapper returning a standardized dictionary with success flag.
        Does not raise exceptions.
        """
        try:
            result = self.verify(document_image, live_image, threshold=threshold)
            return {
                "success": True,
                "data": result,
            }
        except FaceVerificationError as err:
            return {
                "success": False,
                "error": {
                    "code": err.error_code,
                    "message": err.message,
                    "details": err.details,
                },
            }
        except Exception as err:
            logger.exception("Unexpected error during face verification: %s", err)
            return {
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": str(err),
                },
            }


# Shared singleton instance
_default_verifier: Optional[FaceVerifier] = None


def get_verifier(threshold: Optional[float] = None) -> FaceVerifier:
    """Return a shared singleton instance of FaceVerifier."""
    global _default_verifier
    if _default_verifier is None or threshold is not None:
        _default_verifier = FaceVerifier(threshold=threshold)
    return _default_verifier


def verify_face(
    document_image: Union[str, Path, np.ndarray],
    live_image: Union[str, Path, np.ndarray],
    threshold: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Convenience function to run 1:1 face verification.

    Returns:
        Dict: { similarity: float, match: bool, confidence: float, status: str }
    """
    verifier = get_verifier(threshold=threshold)
    return verifier.verify(document_image, live_image, threshold=threshold)
