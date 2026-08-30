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


def detect_file_type(data: bytes, filename: str = "") -> str:
    """
    Safely detects the file format by checking magic bytes first (authoritative),
    falling back to filename extension only if magic bytes are not present or ambiguous.
    Returns: 'PDF', 'JPEG', 'PNG', 'WEBP', or 'UNKNOWN'
    """
    if not data:
        if filename:
            _, ext = os.path.splitext(filename)
            ext_clean = ext.lstrip('.').upper()
            if ext_clean in ('JPG', 'JPEG'):
                return 'JPEG'
            if ext_clean in ('PNG', 'WEBP', 'PDF'):
                return ext_clean
        return 'UNKNOWN'

    # Check Magic Bytes first (authoritative content inspection)
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'PNG'
    if data.startswith(b'\xff\xd8\xff') or data[:2] == b'\xff\xd8':
        return 'JPEG'
    if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'WEBP'
    if data.startswith(b'%PDF') or b'%PDF-' in data[:1024]:
        return 'PDF'

    # Fallback to filename extension if magic bytes are not standard
    if filename:
        _, ext = os.path.splitext(filename)
        ext_clean = ext.lstrip('.').upper()
        if ext_clean in ('JPG', 'JPEG'):
            return 'JPEG'
        if ext_clean in ('PNG', 'WEBP', 'PDF'):
            return ext_clean

    return 'UNKNOWN'


def is_pdf(image_bytes: bytes, filename: str = "") -> bool:
    
    return detect_file_type(image_bytes, filename) == "PDF"


def validate_image_file(filepath: str) -> None:
    """
    Validates file existence, type, and size constraints.
    Raises FileNotFoundError or ValueError for invalid images/documents.
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
    if ext not in SUPPORTED_FORMATS and ext != 'PDF':
        raise ValueError(f"Unsupported file extension: {ext}. Supported formats: {SUPPORTED_FORMATS | {'PDF'}}")


def load_and_preprocess_pdf(
    pdf_bytes: bytes,
    filename: str = "document.pdf",
    max_working_dim: int = 1920,
    scale: float = 2.0
) -> list[tuple[np.ndarray, np.ndarray, CoordinateMapper, int]]:
    """
    Loads and renders all pages of a PDF document from bytes into RGB images,
    ensuring lossless RGB representation on solid white backgrounds,
    computes working images and coordinate mappers for each page, and returns:
    [(original_image_rgb, working_image_rgb, mapper, page_number), ...]
    """
    if not pdf_bytes:
        raise ValueError("PDF document is empty (0 bytes).")

    if len(pdf_bytes) > MAX_FILE_SIZE:
        raise ValueError(f"File size exceeds the maximum limit of {MAX_FILE_SIZE // (1024*1024)}MB: {len(pdf_bytes)} bytes")

    detected = detect_file_type(pdf_bytes, filename)
    if detected != "PDF" and not (pdf_bytes.startswith(b'%PDF') or b'%PDF-' in pdf_bytes[:1024]):
        raise ValueError(f"Provided data is not a valid PDF document (detected format: {detected}).")

    try:
        import pypdfium2 as pdfium
    except ImportError:
        raise ImportError("pypdfium2 is required for PDF forensic analysis. Please install pypdfium2.")

    try:
        pdf = pdfium.PdfDocument(pdf_bytes)
    except Exception as e:
        err_str = str(e).lower()
        if "password" in err_str or "encrypted" in err_str:
            raise ValueError("Encrypted or password-protected PDF files are not supported.")
        raise ValueError(f"Corrupted or invalid PDF data: {e}")

    page_count = len(pdf)
    if page_count == 0:
        raise ValueError("PDF document contains no pages.")

    pages_data = []
    for page_idx in range(page_count):
        page_num = page_idx + 1
        try:
            page = pdf[page_idx]
            page_w_pt, page_h_pt = page.get_size()
            max_pt = max(page_w_pt, page_h_pt) if (page_w_pt > 0 and page_h_pt > 0) else 800.0
            
            # Compute optimal rendering scale without excessive upsampling or downscaling
            if scale is not None and scale > 0:
                render_scale = float(scale)
                if max_pt * render_scale > max_working_dim * 1.5:
                    render_scale = max(float(max_working_dim) / max_pt, 1.0)
            else:
                target_dim = 1600.0
                render_scale = min(max(target_dim / max_pt, 1.0), 2.5)

            bitmap = page.render(scale=render_scale, fill_color=(255, 255, 255, 255))
            pil_img = bitmap.to_pil().convert("RGB")

        except Exception as e:
            err_str = str(e).lower()
            if "password" in err_str or "encrypted" in err_str:
                raise ValueError("Encrypted or password-protected PDF files are not supported.")
            raise ValueError(f"Failed to render PDF page {page_num}: {e}")

        w, h = pil_img.size
        if w < MIN_DIM or h < MIN_DIM:
            raise ValueError(f"PDF page {page_num} resolution too small ({w}x{h}). Minimum required is {MIN_DIM}x{MIN_DIM}.")
        if w > MAX_DIM or h > MAX_DIM:
            raise ValueError(f"PDF page {page_num} resolution exceeds limits ({w}x{h}). Maximum allowed is {MAX_DIM}x{MAX_DIM}.")

        original_image = np.array(pil_img)
        working_image = original_image.copy()

        if w > max_working_dim or h > max_working_dim:
            sc = max_working_dim / float(max(w, h))
            new_w = max(int(w * sc), 1)
            new_h = max(int(h * sc), 1)
            working_image = cv2.resize(original_image, (new_w, new_h), interpolation=cv2.INTER_AREA)

        work_h, work_w = working_image.shape[:2]
        mapper = CoordinateMapper(w, h, work_w, work_h)
        pages_data.append((original_image, working_image, mapper, page_num))

    return pages_data


def load_and_preprocess_image(image_bytes: bytes, filename: str = "image.jpg", max_working_dim: int = 1920) -> tuple[np.ndarray, np.ndarray, CoordinateMapper, str]:
    """
    Loads image from bytes, performs structure validation, fixes orientation via EXIF,
    converts transparent images to white backgrounds, and yields:
    (original_image_rgb, working_image_rgb, coordinate_mapper, format).
    """
    if not image_bytes:
        raise ValueError("Image bytes are empty.")

    detected_type = detect_file_type(image_bytes, filename)
    if detected_type not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported image format/extension: {detected_type}. Supported formats: {SUPPORTED_FORMATS}")

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
