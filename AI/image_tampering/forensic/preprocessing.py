import os
import io
from PIL import Image, ImageOps
import numpy as np
import cv2

SUPPORTED_FORMATS = {'JPEG', 'JPG', 'PNG', 'WEBP'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
MIN_DIM = 10
MAX_DIM = 20000

class CoordinateMapper:
    """
    CoordinateMapper handles translation of coordinates and bounding boxes
    between the original high-resolution image and the downscaled working image.
    """
    def __init__(self, original_width: int, original_height: int, working_width: int, working_height: int):
        self.orig_w = original_width
        self.orig_h = original_height
        self.work_w = working_width
        self.work_h = working_height
        
        self.scale_x = working_width / original_width if original_width > 0 else 1.0
        self.scale_y = working_height / original_height if original_height > 0 else 1.0

    def to_working_coords(self, x: float, y: float) -> tuple[float, float]:
        """Maps a point (x, y) from original to working image coordinates."""
        return x * self.scale_x, y * self.scale_y

    def to_original_coords(self, x: float, y: float) -> tuple[float, float]:
        """Maps a point (x, y) from working to original image coordinates."""
        return x / self.scale_x, y / self.scale_y

    def box_to_working(self, x: float, y: float, w: float, h: float) -> tuple[float, float, float, float]:
        """Maps a bounding box (x, y, w, h) from original to working coordinates."""
        return (
            x * self.scale_x,
            y * self.scale_y,
            w * self.scale_x,
            h * self.scale_y
        )

    def box_to_original(self, x: float, y: float, w: float, h: float) -> tuple[float, float, float, float]:
        """Maps a bounding box (x, y, w, h) from working to original coordinates."""
        return (
            x / self.scale_x,
            y / self.scale_y,
            w / self.scale_x,
            h / self.scale_y
        )


def validate_image_file(filepath: str) -> None:
    """
    Validates file existence, type, and size constraints.
    Raises FileNotFoundError or ValueError for invalid images.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File does not exist: {filepath}")
    
    if not os.path.isfile(filepath):
        raise ValueError(f"Path is not a file: {filepath}")
        
    file_size = os.path.getsize(filepath)
    if file_size == 0:
        raise ValueError("File is empty (0 bytes).")
    if file_size > MAX_FILE_SIZE:
        raise ValueError(f"File size exceeds the maximum limit of {MAX_FILE_SIZE // (1024*1024)}MB: {file_size} bytes")
        
    # Check suffix
    _, ext = os.path.splitext(filepath)
    ext = ext.lstrip('.').upper()
    if ext not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported file extension: {ext}. Supported formats: {SUPPORTED_FORMATS}")


def load_and_preprocess_image(image_bytes: bytes, filename: str = "image.jpg", max_working_dim: int = 1920) -> tuple[np.ndarray, np.ndarray, CoordinateMapper, str]:
    """
    Loads image from bytes, performs structure validation, fixes orientation via EXIF,
    converts transparent images to white backgrounds, and yields:
    (original_image_rgb, working_image_rgb, coordinate_mapper, format).
    """
    if not image_bytes:
        raise ValueError("Image bytes are empty.")

    # Pre-validate file extension if a filename is provided with an extension
    if filename:
        _, ext = os.path.splitext(filename)
        ext_upper = ext.lstrip('.').upper()
        if ext_upper and ext_upper not in SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported image format/extension: {ext_upper}. Supported formats: {SUPPORTED_FORMATS}")

    try:
        # Load using Pillow for safety check
        pil_img = Image.open(io.BytesIO(image_bytes))
        img_format = pil_img.format
        if not img_format or img_format.upper() not in SUPPORTED_FORMATS:
            # Check file extension as fallback if format not set
            _, ext = os.path.splitext(filename)
            img_format = ext.lstrip('.').upper()
            if img_format not in SUPPORTED_FORMATS:
                raise ValueError(f"Unsupported image format: {img_format}")
        
        # Verify image structure for corruption
        pil_img.verify()
        
        # Re-open stream since verify() voids it
        pil_img = Image.open(io.BytesIO(image_bytes))
        
        # Orient according to EXIF tags
        pil_img = ImageOps.exif_transpose(pil_img)
        
    except Exception as e:
        raise ValueError(f"Corrupted or invalid image data: {e}")

    w, h = pil_img.size
    if w < MIN_DIM or h < MIN_DIM:
        raise ValueError(f"Image resolution too small ({w}x{h}). Minimum required is {MIN_DIM}x{MIN_DIM}.")
    if w > MAX_DIM or h > MAX_DIM:
        raise ValueError(f"Image resolution exceeds limits ({w}x{h}). Maximum allowed is {MAX_DIM}x{MAX_DIM}.")

    # Alpha transparency flattening (e.g. PNG / WebP)
    if pil_img.mode in ('RGBA', 'LA') or (pil_img.mode == 'P' and 'transparency' in pil_img.info):
        background = Image.new("RGB", pil_img.size, (255, 255, 255))
        # Paste using alpha channel as mask
        mask = pil_img.split()[-1] if pil_img.mode == 'RGBA' else None
        background.paste(pil_img, mask=mask)
        original_image = np.array(background)
    else:
        original_image = np.array(pil_img.convert("RGB"))

    # Determine scaling factors (only downscale, do not upscale)
    working_image = original_image.copy()
    if w > max_working_dim or h > max_working_dim:
        scale = max_working_dim / float(max(w, h))
        new_w = max(int(w * scale), 1)
        new_h = max(int(h * scale), 1)
        working_image = cv2.resize(original_image, (new_w, new_h), interpolation=cv2.INTER_AREA)

    work_h, work_w = working_image.shape[:2]
    mapper = CoordinateMapper(w, h, work_w, work_h)

    return original_image, working_image, mapper, img_format


def load_image_from_file(filepath: str, max_working_dim: int = 1920) -> tuple[np.ndarray, np.ndarray, CoordinateMapper, str]:
    """
    Helper function to load image from a filepath.
    """
    validate_image_file(filepath)
    with open(filepath, 'rb') as f:
        image_bytes = f.read()
    return load_and_preprocess_image(image_bytes, os.path.basename(filepath), max_working_dim)
