from __future__ import annotations
import io
import numpy as np
from PIL import Image, ImageOps

class ImagePreprocessor:
    """Optional image enhancement before OCR.

    Never mutates the original image - always returns a new in-memory copy.
    Requirements: 4.1-4.5, 21.4, 22.5
    """

    def __init__(self, enabled: bool = False) -> None:
        self.enabled = enabled

    def preprocess(self, image: Image.Image) -> Image.Image:
        """Preprocess the image for OCR.

        Returns a new PIL.Image copy. The input image is never modified.
        When enabled=False, returns a pixel-identical copy.
        """
        if not self.enabled:
            result = image.copy()
            return result

        # Work on a copy - never touch the original
        img = image.copy()

        try:
            import cv2

            # 1. EXIF orientation correction
            img = ImageOps.exif_transpose(img)

            # 2. Convert to grayscale
            img = img.convert("L")

            # 3. Convert to numpy for OpenCV operations
            arr = np.array(img)

            # 4. CLAHE contrast normalization
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            arr = clahe.apply(arr)

            # 5. Mild Gaussian denoising
            arr = cv2.GaussianBlur(arr, (3, 3), 0)

            # 6. Deskewing via Hough transform
            arr = self._deskew(arr, cv2)

            result = Image.fromarray(arr)

        except Exception:
            # If any preprocessing step fails, fall back to a plain copy
            result = image.copy()

        finally:
            # Release intermediate reference
            del img

        return result

    @staticmethod
    def _deskew(arr: np.ndarray, cv2) -> np.ndarray:
        """Deskew a grayscale numpy array."""
        coords = np.column_stack(np.where(arr < 128))
        if len(coords) < 10:
            return arr
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        if abs(angle) < 0.5:
            return arr
        h, w = arr.shape
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            arr, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        return rotated
