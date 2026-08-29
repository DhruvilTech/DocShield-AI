"""
DocShield AI — Face Embedding & Feature Extraction Module
Phase 2: Face Alignment & ArcFace Feature Extraction using InsightFace + ONNX Runtime.

Pipeline:
    Face Image -> Landmark Detection -> Canonical 112x112 Alignment -> ArcFace ONNX -> L2-Normalized 512-d Embedding
"""

import logging
import os
from pathlib import Path
from typing import List, Optional, Tuple, Union
import warnings

# Suppress minor skimage deprecated estimate warning inside insightface utils
warnings.filterwarnings("ignore", category=FutureWarning, module="insightface")

import cv2
import numpy as np

logger = logging.getLogger("docshield.face.embedding")


def cosine_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """
    Compute cosine similarity between two feature vectors.

    Args:
        embedding1: 1D numpy array representing the first face embedding.
        embedding2: 1D numpy array representing the second face embedding.

    Returns:
        float: Cosine similarity score between -1.0 and 1.0 (typically 0.0 to 1.0 for ArcFace).
    """
    if embedding1 is None or embedding2 is None:
        raise ValueError("Embeddings cannot be None.")

    e1 = np.asarray(embedding1, dtype=np.float32).flatten()
    e2 = np.asarray(embedding2, dtype=np.float32).flatten()

    if e1.size == 0 or e2.size == 0:
        raise ValueError("Embedding array cannot be empty.")
    if e1.shape != e2.shape:
        raise ValueError(f"Embedding dimensions do not match: {e1.shape} vs {e2.shape}")

    norm1 = np.linalg.norm(e1)
    norm2 = np.linalg.norm(e2)

    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0

    sim = np.dot(e1, e2) / (norm1 * norm2)
    return float(np.clip(sim, -1.0, 1.0))


class FaceEmbedder:
    """
    Production-grade Face Feature Extractor using InsightFace ArcFace models.
    
    Performs landmark-based alignment to canonical 112x112 face space and extracts
    512-dimensional L2-normalized deep representations.
    """

    def __init__(
        self,
        model_name: str = "buffalo_s",
        providers: Optional[List[str]] = None,
        det_size: Tuple[int, int] = (640, 640),
        det_thresh: float = 0.5,
    ):
        """
        Initialize the Face Embedder model.

        Args:
            model_name: InsightFace model pack name ('buffalo_s', 'buffalo_l').
            providers: ONNX execution providers list, defaults to ['CPUExecutionProvider'].
            det_size: Input resolution for face alignment & detection.
            det_thresh: Minimum confidence threshold.
        """
        self.model_name = model_name
        self.providers = providers or ["CPUExecutionProvider"]
        self.det_size = det_size
        self.det_thresh = det_thresh
        self.app = None
        self._load_model()

    def _load_model(self) -> None:
        """Load InsightFace detection and ArcFace recognition networks once."""
        try:
            import insightface
            from insightface.app import FaceAnalysis

            logger.info("Loading InsightFace ArcFace model pack '%s'...", self.model_name)
            self.app = FaceAnalysis(
                name=self.model_name,
                allowed_modules=["detection", "recognition"],
                providers=self.providers,
            )
            self.app.prepare(ctx_id=0, det_size=self.det_size, det_thresh=self.det_thresh)
            logger.info("InsightFace ArcFace model initialized successfully.")
        except Exception as err:
            logger.error("Failed to load InsightFace ArcFace model: %s", err)
            raise RuntimeError(
                f"Failed to initialize FaceEmbedder with model '{self.model_name}': {err}"
            ) from err

    @staticmethod
    def _read_image(image_input: Union[str, Path, np.ndarray]) -> np.ndarray:
        """Validate and decode input into a 3-channel BGR numpy array."""
        if isinstance(image_input, (str, Path)):
            path_obj = Path(image_input)
            if not path_obj.exists():
                raise FileNotFoundError(f"Image file not found: {path_obj}")
            if not path_obj.is_file():
                raise ValueError(f"Path is not a regular file: {path_obj}")

            img = cv2.imread(str(path_obj))
            if img is None or img.size == 0:
                raise ValueError(f"Failed to decode image from file: {path_obj}")
            return img

        if isinstance(image_input, np.ndarray):
            if image_input.size == 0:
                raise ValueError("Image array is empty.")
            if len(image_input.shape) == 2:
                return cv2.cvtColor(image_input, cv2.COLOR_GRAY2BGR)
            if len(image_input.shape) == 3 and image_input.shape[2] in (3, 4):
                if image_input.shape[2] == 4:
                    return cv2.cvtColor(image_input, cv2.COLOR_BGRA2BGR)
                return image_input
            raise ValueError(f"Invalid image array dimensions: {image_input.shape}")

        raise ValueError(
            f"Unsupported image input type '{type(image_input)}'. Expected str, Path, or np.ndarray."
        )

    def extract_embedding(
        self,
        image_input: Union[str, Path, np.ndarray],
        return_largest_face: bool = True,
    ) -> Optional[np.ndarray]:
        """
        Detect, align, and extract L2-normalized 512-dimensional face embedding.

        Args:
            image_input: File path or BGR numpy array.
            return_largest_face: If True, selects the most prominent face by bounding box area.

        Returns:
            np.ndarray: Normalized 512-d float32 vector, or None if no face detected.

        Raises:
            ValueError: If image input is invalid or corrupted.
            FileNotFoundError: If image file does not exist.
        """
        img = self._read_image(image_input)
        faces = self.app.get(img)

        if not faces:
            logger.warning("No face detected in provided image.")
            return None

        if return_largest_face and len(faces) > 1:
            # Sort faces by bounding box area descending
            faces = sorted(
                faces,
                key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                reverse=True,
            )

        selected_face = faces[0]
        embedding = selected_face.embedding

        if embedding is None or embedding.size == 0:
            logger.error("Model did not generate embedding for detected face.")
            return None

        # Ensure embedding is float32 and unit L2 normalized
        norm = np.linalg.norm(embedding)
        if norm > 0:
            normalized_embedding = (embedding / norm).astype(np.float32)
        else:
            normalized_embedding = embedding.astype(np.float32)

        return normalized_embedding

    def extract_all_embeddings(
        self,
        image_input: Union[str, Path, np.ndarray],
    ) -> List[np.ndarray]:
        """
        Extract normalized embeddings for all faces present in the image.

        Args:
            image_input: File path or BGR numpy array.

        Returns:
            List[np.ndarray]: List of 512-d normalized embeddings.
        """
        img = self._read_image(image_input)
        faces = self.app.get(img)
        embeddings = []

        for face in faces:
            if face.embedding is not None:
                norm = np.linalg.norm(face.embedding)
                if norm > 0:
                    norm_emb = (face.embedding / norm).astype(np.float32)
                else:
                    norm_emb = face.embedding.astype(np.float32)
                embeddings.append(norm_emb)

        return embeddings


# Singleton instance for high-throughput reuse
_default_embedder: Optional[FaceEmbedder] = None


def get_embedder() -> FaceEmbedder:
    """Return a shared singleton instance of FaceEmbedder."""
    global _default_embedder
    if _default_embedder is None:
        _default_embedder = FaceEmbedder()
    return _default_embedder


def get_embedding(
    face_image: Union[str, Path, np.ndarray]
) -> Optional[np.ndarray]:
    """
    Convenience function to extract a normalized 512-d ArcFace embedding.

    Args:
        face_image: Image file path or OpenCV BGR numpy array.

    Returns:
        np.ndarray: Normalized 512-dimensional embedding vector, or None if no face detected.
    """
    embedder = get_embedder()
    return embedder.extract_embedding(face_image)
