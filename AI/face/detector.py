"""
DocShield AI — Face Detection Module
Phase 1: Face Detection using InsightFace + OpenCV + NumPy + ONNX Runtime.

This module provides the `FaceDetector` class for high-accuracy face detection,
bounding box extraction, detection confidence scoring, and face cropping.
"""

from dataclasses import dataclass, field
import logging
import os
from pathlib import Path
from typing import List, Optional, Tuple, Union

import cv2
import numpy as np

logger = logging.getLogger("docshield.face.detector")


@dataclass
class DetectedFace:
    """Represents a single face detected within an image."""
    bbox: List[int]  # [x1, y1, x2, y2] in pixel coordinates
    confidence: float  # Detection confidence score between 0.0 and 1.0
    crop: np.ndarray = field(repr=False)  # Cropped face image (BGR numpy array)
    landmarks: Optional[np.ndarray] = field(default=None, repr=False)  # 5-point facial landmarks if available

    def to_dict(self) -> dict:
        """Serialize face detection details to a dictionary (excluding raw ndarray)."""
        return {
            "bbox": self.bbox,
            "confidence": round(float(self.confidence), 4),
            "crop_shape": list(self.crop.shape) if self.crop is not None else None,
        }


class FaceDetector:
    """
    Reusable Face Detector utilizing InsightFace (SCRFD / RetinaFace) via ONNX Runtime.
    
    Loads the underlying deep learning model once during initialization to ensure
    high-throughput and low-latency inference on subsequent calls.
    """

    def __init__(
        self,
        model_name: str = "buffalo_s",
        det_size: Tuple[int, int] = (640, 640),
        det_thresh: float = 0.5,
        providers: Optional[List[str]] = None,
        use_fallback: bool = True,
    ):
        """
        Initialize the Face Detector.

        Args:
            model_name: InsightFace model pack name ('buffalo_s', 'buffalo_l', 'antelopev2').
            det_size: Input image resolution tuple for the detection network (width, height).
            det_thresh: Minimum confidence threshold for face candidate filtering.
            providers: ONNX execution providers list, defaults to ['CPUExecutionProvider'].
            use_fallback: Whether to use OpenCV Haar Cascade if InsightFace model fails to load.
        """
        self.model_name = model_name
        self.det_size = det_size
        self.det_thresh = det_thresh
        self.providers = providers or ["CPUExecutionProvider"]
        self.use_fallback = use_fallback
        self.app = None
        self._fallback_cascade = None
        self._initialized = False

        self._load_model()

    def _load_model(self) -> None:
        """Load and prepare the InsightFace detection model once."""
        try:
            import insightface
            from insightface.app import FaceAnalysis

            logger.info("Loading InsightFace detection model '%s'...", self.model_name)
            # allowed_modules=['detection'] loads only the detection network (e.g. SCRFD)
            self.app = FaceAnalysis(
                name=self.model_name,
                allowed_modules=["detection"],
                providers=self.providers,
            )
            self.app.prepare(ctx_id=0, det_size=self.det_size, det_thresh=self.det_thresh)
            self._initialized = True
            logger.info("InsightFace detection model loaded successfully.")
        except Exception as err:
            logger.warning(
                "Could not initialize InsightFace model '%s' (%s).",
                self.model_name,
                err,
            )
            if self.use_fallback:
                logger.info("Initializing OpenCV Haar Cascade fallback detector...")
                cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
                if os.path.exists(cascade_path):
                    self._fallback_cascade = cv2.CascadeClassifier(cascade_path)
                    self._initialized = True
                    logger.info("OpenCV Haar Cascade fallback detector loaded.")
                else:
                    logger.error("Haar cascade file not found at %s", cascade_path)
            else:
                raise RuntimeError(
                    f"Failed to load InsightFace model '{self.model_name}': {err}"
                ) from err

    @staticmethod
    def _read_image(image_input: Union[str, Path, np.ndarray]) -> np.ndarray:
        """
        Validate and load input into a valid BGR numpy array.

        Args:
            image_input: File path (str/Path) or an existing numpy BGR/RGB image array.

        Returns:
            np.ndarray: Valid BGR image array.

        Raises:
            ValueError: If the input is invalid, unreadable, empty, or corrupted.
            FileNotFoundError: If the specified file path does not exist.
        """
        if isinstance(image_input, (str, Path)):
            path_obj = Path(image_input)
            if not path_obj.exists():
                raise FileNotFoundError(f"Image file not found: {path_obj}")
            if not path_obj.is_file():
                raise ValueError(f"Path is not a regular file: {path_obj}")

            # Check if file is a PDF (by extension or header bytes)
            is_pdf = path_obj.suffix.lower() == '.pdf'
            if not is_pdf:
                try:
                    with open(path_obj, 'rb') as f:
                        header = f.read(5)
                        if header.startswith(b'%PDF'):
                            is_pdf = True
                except Exception:
                    pass

            if is_pdf:
                try:
                    import pypdfium2 as pdfium
                    pdf = pdfium.PdfDocument(str(path_obj))
                    if len(pdf) == 0:
                        raise ValueError(f"PDF document is empty: {path_obj}")
                    page = pdf[0]
                    bitmap = page.render(scale=2.0)
                    pil_image = bitmap.to_pil()
                    img = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
                    if img is not None and img.size > 0:
                        return img
                except Exception as e:
                    logger.warning("Failed to render PDF page via pypdfium2: %s", e)

            # cv2.imread supports common formats (JPG, PNG, WebP, TIFF, BMP)
            img = cv2.imread(str(path_obj))
            if img is None or img.size == 0:
                raise ValueError(f"Failed to decode or read image from file: {path_obj}")
            return img

        if isinstance(image_input, np.ndarray):
            if image_input.size == 0:
                raise ValueError("Provided image numpy array is empty.")
            if len(image_input.shape) == 2:
                # Convert grayscale to 3-channel BGR
                return cv2.cvtColor(image_input, cv2.COLOR_GRAY2BGR)
            if len(image_input.shape) == 3 and image_input.shape[2] in (3, 4):
                if image_input.shape[2] == 4:
                    return cv2.cvtColor(image_input, cv2.COLOR_BGRA2BGR)
                return image_input
            raise ValueError(f"Invalid image array shape: {image_input.shape}")

        raise ValueError(
            f"Unsupported image input type '{type(image_input)}'. Expected str, Path, or np.ndarray."
        )

    @staticmethod
    def crop_face(image: np.ndarray, bbox: List[int], padding_ratio: float = 0.0) -> np.ndarray:
        """
        Crop a detected face from the image with boundary clamping and optional padding.

        Args:
            image: Source BGR image numpy array.
            bbox: [x1, y1, x2, y2] bounding box coordinates.
            padding_ratio: Optional padding factor (e.g. 0.1 for 10% outer padding).

        Returns:
            np.ndarray: Cropped face image.
        """
        img_h, img_w = image.shape[:2]
        x1, y1, x2, y2 = bbox

        if padding_ratio > 0:
            box_w = x2 - x1
            box_h = y2 - y1
            pad_x = int(box_w * padding_ratio)
            pad_y = int(box_h * padding_ratio)
            x1 -= pad_x
            y1 -= pad_y
            x2 += pad_x
            y2 += pad_y

        # Clamp coordinates within valid image dimensions
        x1 = max(0, min(x1, img_w - 1))
        y1 = max(0, min(y1, img_h - 1))
        x2 = max(x1 + 1, min(x2, img_w))
        y2 = max(y1 + 1, min(y2, img_h))

        return image[y1:y2, x1:x2].copy()

    def detect(
        self,
        image_input: Union[str, Path, np.ndarray],
        crop_faces: bool = True,
        padding_ratio: float = 0.0,
    ) -> List[DetectedFace]:
        """
        Detect all faces present in the given image.

        Args:
            image_input: Image file path or numpy array.
            crop_faces: Whether to extract and attach the cropped face array.
            padding_ratio: Optional margin padding around cropped faces.

        Returns:
            List[DetectedFace]: List of detected faces with bounding boxes, confidence,
                                and cropped face arrays. Returns empty list if no faces found.

        Raises:
            ValueError: If the input image is invalid or unreadable.
            FileNotFoundError: If the image file does not exist.
        """
        img = self._read_image(image_input)
        detected_faces: List[DetectedFace] = []

        if self.app is not None:
            # Primary: InsightFace SCRFD detector
            faces = self.app.get(img)
            for face in faces:
                # InsightFace returns bbox as [x1, y1, x2, y2] (float or int)
                raw_bbox = face.bbox.astype(int).tolist()
                confidence = float(face.det_score) if hasattr(face, "det_score") else 1.0

                if confidence < self.det_thresh:
                    continue

                crop = self.crop_face(img, raw_bbox, padding_ratio) if crop_faces else np.array([])
                landmarks = face.kps if hasattr(face, "kps") else None

                detected_faces.append(
                    DetectedFace(
                        bbox=raw_bbox,
                        confidence=confidence,
                        crop=crop,
                        landmarks=landmarks,
                    )
                )
        elif self._fallback_cascade is not None:
            # Fallback: OpenCV Haar Cascade detector
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces_rects = self._fallback_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
            )
            for (x, y, w, h) in faces_rects:
                bbox = [int(x), int(y), int(x + w), int(y + h)]
                crop = self.crop_face(img, bbox, padding_ratio) if crop_faces else np.array([])
                detected_faces.append(
                    DetectedFace(
                        bbox=bbox,
                        confidence=0.95,  # Heuristic confidence for cascade match
                        crop=crop,
                        landmarks=None,
                    )
                )

        return detected_faces

    @staticmethod
    def save_crop(crop: np.ndarray, output_path: Union[str, Path]) -> str:
        """
        Save a cropped face image to disk, creating destination folders if needed.

        Args:
            crop: BGR face crop numpy array.
            output_path: Destination file path.

        Returns:
            str: Absolute path to the saved file.
        """
        if crop is None or crop.size == 0:
            raise ValueError("Cannot save empty face crop.")

        path_obj = Path(output_path)
        path_obj.parent.mkdir(parents=True, exist_ok=True)
        success = cv2.imwrite(str(path_obj), crop)
        if not success:
            raise IOError(f"Failed to write image crop to {path_obj}")
        return str(path_obj.resolve())


# Singleton instance for convenient reuse across modules
_default_detector: Optional[FaceDetector] = None


def get_detector() -> FaceDetector:
    """Return a shared singleton instance of FaceDetector."""
    global _default_detector
    if _default_detector is None:
        _default_detector = FaceDetector()
    return _default_detector
