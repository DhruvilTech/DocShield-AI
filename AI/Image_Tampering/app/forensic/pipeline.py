import os
import cv2
import numpy as np
from typing import Optional

# Import schemas
from app.schemas.forensic import (
    ForensicResult,
    ImageInfo,
    QualityMetrics,
    RepresentationsStatus,
    Signals,
    FusionResult
)

# Import module functions
from app.forensic.preprocessing import load_and_preprocess_image, load_image_from_file
from app.forensic.quality import calculate_quality_metrics
from app.forensic.representations import generate_representations

# Import skeletons
from app.forensic.ela import analyze_ela
from app.forensic.noise import analyze_noise
from app.forensic.copy_move import analyze_copy_move
from app.forensic.metadata import analyze_metadata
from app.forensic.stamp import analyze_stamps
from app.forensic.splicing import analyze_splicing
from app.forensic.fusion import fuse_signals
from app.forensic.localization import localize_suspicious_regions

DEFAULT_DEBUG_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "outputs", "debug")
)

def run_forensic_pipeline(
    image_bytes: bytes,
    filename: str = "image.jpg",
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicResult:
    """
    Executes the Phase 1 Forensic Image Processing Foundation pipeline on the provided image bytes.
    
    Steps:
    1. Validation, EXIF rotation handling, and resolution scaling.
    2. Conversion to RGB/BGR, Grayscale, HSV, and LAB spaces.
    3. High-frequency noise residual generation.
    4. Image Quality Metrics calculation (brightness, contrast, sharpness, blur flag).
    5. Structural packaging of future forensic signals (initially unavailable/null).
    6. Debug outputs generation (optional).
    """
    if not debug_dir:
        debug_dir = DEFAULT_DEBUG_DIR

    # 1. Load and Preprocess Image
    original_rgb, working_rgb, mapper, img_format = load_and_preprocess_image(
        image_bytes=image_bytes,
        filename=filename
    )

    # Dimensions
    orig_h, orig_w = original_rgb.shape[:2]
    work_h, work_w = working_rgb.shape[:2]
    channels = original_rgb.shape[2] if len(original_rgb.shape) == 3 else 1

    # 2. Extract Color Space Representations & Noise Residual
    reps = generate_representations(working_rgb)
    grayscale = reps["grayscale"]
    hsv = reps["hsv"]
    lab = reps["lab"]
    noise_residual = reps["noise_residual"]

    # 3. Quality Analysis (Laplacian Variance, brightness, contrast)
    quality_data = calculate_quality_metrics(grayscale)

    # 4. Generate Future Forensic Signals (Placeholders return score=None, available=False)
    ela_sig = analyze_ela(working_rgb, original_rgb, mapper)
    noise_sig = analyze_noise(working_rgb, original_rgb, mapper)
    copymove_sig = analyze_copy_move(working_rgb, original_rgb, mapper)
    metadata_sig = analyze_metadata(image_bytes)
    
    # Stamp detector needs access to all representations
    stamp_sig = analyze_stamps(
        working_image_rgb=working_rgb,
        grayscale=grayscale,
        hsv=hsv,
        lab=lab,
        noise_residual=noise_residual,
        coordinate_mapper=mapper,
        edge_info=None,
        document_regions=None
    )
    splicing_sig = analyze_splicing(working_rgb, original_rgb, mapper)

    # Bundle all signals
    signals = Signals(
        ela=ela_sig,
        noise=noise_sig,
        copy_move=copymove_sig,
        metadata=metadata_sig,
        stamp=stamp_sig,
        splicing=splicing_sig
    )

    # 5. Fusion & Localization (Placeholders)
    fusion_res = fuse_signals(signals)
    regions = localize_suspicious_regions(working_rgb)

    # 6. Save Debug outputs if requested
    if save_debug:
        os.makedirs(debug_dir, exist_ok=True)
        
        # Convert RGB to BGR for OpenCV saving
        working_bgr = cv2.cvtColor(working_rgb, cv2.COLOR_RGB2BGR)
        cv2.imwrite(os.path.join(debug_dir, "document_processed.jpg"), working_bgr)
        cv2.imwrite(os.path.join(debug_dir, "document_gray.jpg"), grayscale)
        cv2.imwrite(os.path.join(debug_dir, "document_noise_residual.jpg"), noise_residual)

    # Assemble and return results
    return ForensicResult(
        image=ImageInfo(
            width=orig_w,
            height=orig_h,
            channels=channels,
            format=img_format,
            working_width=work_w,
            working_height=work_h
        ),
        quality=QualityMetrics(
            brightness=quality_data["brightness"],
            contrast=quality_data["contrast"],
            sharpness=quality_data["sharpness"],
            blur_detected=quality_data["blur_detected"]
        ),
        representations=RepresentationsStatus(
            grayscale=True,
            hsv=True,
            lab=True,
            noise_residual=True
        ),
        regions=regions,
        signals=signals,
        fusion=fusion_res
    )


def run_forensic_pipeline_from_file(
    filepath: str,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicResult:
    """
    Convenience wrapper to run the forensic pipeline on an image file path.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")
    with open(filepath, 'rb') as f:
        image_bytes = f.read()
    return run_forensic_pipeline(
        image_bytes=image_bytes,
        filename=os.path.basename(filepath),
        save_debug=save_debug,
        debug_dir=debug_dir
    )
