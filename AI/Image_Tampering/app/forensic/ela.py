import os
import cv2
import numpy as np
from typing import Optional
from app.schemas.forensic import ForensicSignal, SuspiciousRegion
from app.forensic.preprocessing import CoordinateMapper

def analyze_ela(
    working_image_rgb: np.ndarray,
    quality: int = 95,
    coordinate_mapper: Optional[CoordinateMapper] = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicSignal:
    """
    Performs Error Level Analysis (ELA) on the working image.
    
    Algorithm:
    1. Recompress working RGB image as JPEG at the specified quality in-memory.
    2. Decompress recompressed stream and calculate absolute pixel difference against the original.
    3. Generate amplified grayscale map (scale=20) and compute statistics.
    4. Compute deterministic ELA anomaly score based on error distribution and density.
    5. Segment high-error anomalies using thresholding, morph cleanups, and contour boxes.
    6. Map detected region bounding boxes back to the original document resolution.
    7. Generate color heatmap visualization using a false-color colormap.
    """
    if working_image_rgb is None or len(working_image_rgb.shape) != 3:
        raise ValueError("Input image must be a valid 3D RGB image array.")

    # 1. JPEG Recompression (In-Memory)
    # Convert RGB to BGR for OpenCV encoding
    working_bgr = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2BGR)
    success, encoded = cv2.imencode('.jpg', working_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not success:
        raise ValueError("JPEG in-memory recompression failed.")
    
    recompressed_bgr = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    # Convert back to RGB for consistency with working_image_rgb
    recompressed_rgb = cv2.cvtColor(recompressed_bgr, cv2.COLOR_BGR2RGB)

    # 2. Pixel Absolute Difference
    diff = cv2.absdiff(working_image_rgb, recompressed_rgb)
    diff_gray = cv2.cvtColor(diff, cv2.COLOR_RGB2GRAY)

    # 3. Difference Amplification
    scale = 20
    ela_gray = np.clip(diff_gray.astype(np.uint16) * scale, 0, 255).astype(np.uint8)

    # 4. Statistics Calculation (computed from raw, un-amplified diff_gray)
    mean_err = float(np.mean(diff_gray))
    median_err = float(np.median(diff_gray))
    max_err = float(np.max(diff_gray))
    std_err = float(np.std(diff_gray))
    
    # High-error pixel ratio (raw difference > 10.0 out of 255)
    high_err_thresh = 10.0
    high_err_pixels = np.sum(diff_gray > high_err_thresh)
    high_err_ratio = float(high_err_pixels / diff_gray.size)

    statistics = {
        "mean_error": mean_err,
        "median_error": median_err,
        "max_error": max_err,
        "std_error": std_err,
        "high_error_ratio": high_err_ratio
    }

    # 5. Deterministic Score Formulation (0.0 to 1.0)
    # score = 40% normalized mean + 40% normalized std + 20% normalized high-error ratio
    # Normalizing caps: mean_error relative to 8.0, std_error relative to 6.0, high_error_ratio relative to 0.10
    score = 0.4 * (mean_err / 8.0) + 0.4 * (std_err / 6.0) + 0.2 * (high_err_ratio / 0.10)
    score = float(min(max(score, 0.0), 1.0))

    # 6. Suspicious Region Detection
    # Threshold the amplified grayscale ELA map (threshold = 40)
    _, thresh = cv2.threshold(ela_gray, 40, 255, cv2.THRESH_BINARY)
    
    # Morphological cleanup to merge nearby pixels and filter out stray speckles
    morph_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    morphed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, morph_kernel)
    morphed = cv2.morphologyEx(morphed, cv2.MORPH_OPEN, morph_kernel)
    
    # Connected component detection via contour analysis
    contours, _ = cv2.findContours(morphed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    regions = []
    min_region_dim = 15  # Ignore small isolated compression artifacts
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w >= min_region_dim and h >= min_region_dim:
            # Regional error analysis
            roi = ela_gray[y:y+h, x:x+w]
            roi_mean = float(np.mean(roi))
            
            # Severity thresholds based on ELA regional intensity
            if roi_mean > 100.0:
                severity = "HIGH"
            elif roi_mean > 50.0:
                severity = "MEDIUM"
            else:
                severity = "LOW"
                
            region_score = float(min(roi_mean / 255.0 * 2.0, 1.0))
            
            # Translate coordinates back to original image
            if coordinate_mapper:
                orig_x, orig_y, orig_w, orig_h = coordinate_mapper.box_to_original(x, y, w, h)
                orig_x = int(round(orig_x))
                orig_y = int(round(orig_y))
                orig_w = int(round(orig_w))
                orig_h = int(round(orig_h))
            else:
                orig_x, orig_y, orig_w, orig_h = x, y, w, h
                
            regions.append(SuspiciousRegion(
                x=orig_x,
                y=orig_y,
                width=orig_w,
                height=orig_h,
                score=region_score,
                severity=severity,
                source="ela",
                reason=f"Localized compression inconsistency (regional mean error: {roi_mean:.1f})"
            ))

    # Sort regions by regional score descending
    regions.sort(key=lambda r: r.score, reverse=True)

    # 7. Generate False-Color Heatmap
    heatmap = cv2.applyColorMap(ela_gray, cv2.COLORMAP_JET)

    # Save outputs if debug is active
    heatmap_rel_path = None
    map_rel_path = None
    if save_debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(debug_dir, "document_ela_heatmap.jpg"), heatmap)
        cv2.imwrite(os.path.join(debug_dir, "document_ela_map.png"), ela_gray)
        heatmap_rel_path = "outputs/debug/document_ela_heatmap.jpg"
        map_rel_path = "outputs/debug/document_ela_map.png"

    # 8. Human-readable Evidence
    evidence = []
    if len(regions) > 0:
        evidence.append({
            "message": f"Potential compression inconsistency detected in {len(regions)} localized region(s).",
            "severity": "HIGH" if score > 0.4 else "MEDIUM"
        })
    else:
        evidence.append({
            "message": "ELA response is spatially uniform; consistent compression rates observed.",
            "severity": "LOW"
        })

    return ForensicSignal(
        name="ela",
        score=score,
        confidence=None,  # Do not fake confidence values; return null
        regions=regions,
        evidence=evidence,
        available=True,
        statistics=statistics,
        quality=quality,
        heatmap_path=heatmap_rel_path,
        map_path=map_rel_path
    )
