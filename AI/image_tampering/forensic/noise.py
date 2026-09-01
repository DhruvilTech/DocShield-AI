import os
import cv2
import numpy as np
from typing import Optional
from image_tampering.schemas.forensic import ForensicSignal, SuspiciousRegion
from image_tampering.forensic.preprocessing import CoordinateMapper

def analyze_noise(
    working_image_rgb: np.ndarray,
    noise_residual: Optional[np.ndarray] = None,
    coordinate_mapper: Optional[CoordinateMapper] = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicSignal:
    """
    Performs Local Noise / Compression Forensic Analysis.
    
    Algorithm:
    1. If not provided, generates high-frequency noise residual (Image - Blur).
    2. Computes local standard deviation in a small local window (15x15 px) using 
       the vectorized box filter formula: Var[X] = E[X^2] - (E[X])^2.
    3. Blurs the local standard deviation map using a large context window (61x61 px)
       to represent surrounding context noise characteristics.
    4. Computes raw anomaly: |std_small - std_large|.
    5. Normalizes raw anomaly into 0.0 - 1.0 range relative to global standard deviation 
       variations of local noise levels across the document page.
    6. Thresholds the anomaly map (thresh=0.4), cleans up using morphology (9x9 kernel),
       identifies contours, and maps boxes back to the original document resolution.
    7. Computes a deterministic document-wide anomaly score.
    """
    if working_image_rgb is None or len(working_image_rgb.shape) != 3:
        raise ValueError("Input image must be a valid 3D RGB image array.")

    # 1. Reuse or Calculate Noise Residual
    grayscale = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2GRAY)
    if noise_residual is None:
        # Apply 5x5 low-pass Gaussian blur
        low_pass = cv2.GaussianBlur(grayscale, (5, 5), 0)
        noise_residual = cv2.absdiff(grayscale, low_pass)

    # Edge suppression mask to prevent sharp character strokes and table borders from inflating noise variance
    grad_x = cv2.Sobel(grayscale, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(grayscale, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = np.sqrt(grad_x**2 + grad_y**2)
    
    edge_mask = (grad_mag > 40.0).astype(np.float32)
    kernel_edge = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edge_mask_dilated = cv2.dilate(edge_mask, kernel_edge)
    non_edge_weight = 1.0 - edge_mask_dilated

    # Convert residual to float32 for high precision math
    I = noise_residual.astype(np.float32)
    I_filtered = I * (0.20 + 0.80 * non_edge_weight)
    I_sq = cv2.multiply(I_filtered, I_filtered)

    # 2. Compute Local Standard Deviation (Vectorized & CPU friendly)
    ksize = 11
    mean_I = cv2.boxFilter(I_filtered, -1, (ksize, ksize))
    mean_I_sq = cv2.boxFilter(I_sq, -1, (ksize, ksize))
    local_var = cv2.subtract(mean_I_sq, cv2.multiply(mean_I, mean_I))
    # Eliminate minor rounding errors leading to negative variance
    local_var = np.clip(local_var, 0.0, None)
    std_small = np.sqrt(local_var)

    # 3. Compute Contextual Noise Characteristics (Large window)
    large_ksize = 45
    std_large = cv2.boxFilter(std_small, -1, (large_ksize, large_ksize))

    # 4. Compute Raw Anomaly (Local Consistency difference)
    anomaly_raw = cv2.absdiff(std_small, std_large)

    # 5. Statistical Anomaly Normalization
    # Calculate global variation (standard deviation) of noise levels across the page
    global_std_variation = float(np.std(std_small))
    # Set a sensible lower bound for page-wide variation to handle noise-free documents
    global_std_variation = max(global_std_variation, 6.0)

    # An anomaly is defined as a region deviating significantly from page-wide variation
    anomaly_map = np.clip(anomaly_raw / (3.5 * global_std_variation + 1e-5), 0.0, 1.0)

    # 6. Smoothing Anomaly Map for Stable Measurements
    smoothed_anomaly = cv2.GaussianBlur(anomaly_map, (9, 9), 0)

    # 7. Calculate Statistics
    mean_noise = float(np.mean(noise_residual))
    median_noise = float(np.median(noise_residual))
    std_noise = float(np.std(noise_residual))
    max_noise = float(np.max(noise_residual))
    
    # Ratio of high-anomaly pixels (anomaly score > 0.5)
    high_anomaly_ratio = float(np.sum(smoothed_anomaly > 0.5) / smoothed_anomaly.size)

    statistics = {
        "mean_noise": mean_noise,
        "median_noise": median_noise,
        "std_noise": std_noise,
        "max_noise": max_noise,
        "high_anomaly_ratio": high_anomaly_ratio
    }

    # 9. Suspicious Region Segmentation
    anomaly_uint8 = (smoothed_anomaly * 255).astype(np.uint8)
    _, thresh = cv2.threshold(anomaly_uint8, int(0.45 * 255), 255, cv2.THRESH_BINARY)
    
    # Morphological cleanups: 9x9 CLOSE to bridge gaps, 5x5 OPEN to remove speckles
    close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    morphed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, close_kernel)
    morphed = cv2.morphologyEx(morphed, cv2.MORPH_OPEN, open_kernel)
    
    # Connected component contours (using RETR_LIST to capture nested regions inside borders)
    contours, _ = cv2.findContours(morphed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    
    regions = []
    min_region_dim = 35  # Filter out tiny contours to capture structural blocks
    working_area = working_image_rgb.shape[0] * working_image_rgb.shape[1]
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        # Filter out large page-wide boxes (e.g. > 35% of page area) such as document borders
        if w >= min_region_dim and h >= min_region_dim and (w * h < 0.35 * working_area):
            # Regional error analysis
            roi = smoothed_anomaly[y:y+h, x:x+w]
            fill_ratio = float(np.mean(roi > 0.40))
            if fill_ratio >= 0.20:
                # Use the 95th percentile of the ROI to capture peak anomaly intensity
                region_score = float(np.percentile(roi, 95))
                
                # Severity thresholds based on regional anomaly intensity
                if region_score > 0.70 and fill_ratio >= 0.35:
                    severity = "HIGH"
                elif region_score > 0.45:
                    severity = "MEDIUM"
                else:
                    severity = "LOW"
                    
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
                    source="noise",
                    reason=f"Localized noise inconsistency (regional peak anomaly: {region_score:.2f})"
                ))

    # Sort regions by region score descending
    regions.sort(key=lambda r: r.score, reverse=True)

    # 8. Deterministic Anomaly Score (0.0 to 1.0)
    score = float(regions[0].score) if len(regions) > 0 else 0.0

    # Sort regions by region score descending
    regions.sort(key=lambda r: r.score, reverse=True)

    # 10. Generate False-Color Heatmap
    heatmap = cv2.applyColorMap(anomaly_uint8, cv2.COLORMAP_JET)

    # Save outputs if debug is active
    heatmap_rel_path = None
    map_rel_path = None
    if save_debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(debug_dir, "document_noise_anomaly_map.png"), anomaly_uint8)
        cv2.imwrite(os.path.join(debug_dir, "document_noise_heatmap.jpg"), heatmap)
        ai_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        try:
            rel_dir = os.path.relpath(debug_dir, ai_dir)
            if not rel_dir.startswith(".."):
                heatmap_rel_path = os.path.join(rel_dir, "document_noise_heatmap.jpg").replace("\\", "/")
                map_rel_path = os.path.join(rel_dir, "document_noise_anomaly_map.png").replace("\\", "/")
            else:
                heatmap_rel_path = "outputs/debug/document_noise_heatmap.jpg"
                map_rel_path = "outputs/debug/document_noise_anomaly_map.png"
        except Exception:
            heatmap_rel_path = "outputs/debug/document_noise_heatmap.jpg"
            map_rel_path = "outputs/debug/document_noise_anomaly_map.png"

    # 11. Human-readable Evidence
    evidence = []
    if len(regions) > 0:
        evidence.append({
            "message": f"Potential noise inconsistency detected in {len(regions)} localized region(s).",
            "severity": "HIGH" if score > 0.5 else "MEDIUM"
        })
    else:
        evidence.append({
            "message": "Noise characteristics are relatively consistent across the document.",
            "severity": "LOW"
        })

    return ForensicSignal(
        name="noise",
        score=score,
        confidence=None,  # Do not invent confidence; return null
        regions=regions,
        evidence=evidence,
        available=True,
        statistics=statistics,
        heatmap_path=heatmap_rel_path,
        map_path=map_rel_path
    )
