import os
import cv2
import numpy as np
from typing import Optional, List, Dict, Any
from image_tampering.schemas.forensic import ForensicSignal, SuspiciousRegion
from image_tampering.forensic.preprocessing import CoordinateMapper

def calculate_overlap_ratio(box1: tuple, box2: tuple) -> float:
    """
    Computes the spatial intersection ratio relative to the anomaly region's area (box2).
    box is (x, y, w, h)
    """
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2
    
    ix1 = max(x1, x2)
    iy1 = max(y1, y2)
    ix2 = min(x1 + w1, x2 + w2)
    iy2 = min(y1 + h1, y2 + h2)
    
    if ix2 > ix1 and iy2 > iy1:
        intersection_area = (ix2 - ix1) * (iy2 - iy1)
        box2_area = w2 * h2
        return float(intersection_area / box2_area) if box2_area > 0 else 0.0
    return 0.0

def analyze_stamps(
    working_image_rgb: np.ndarray,
    grayscale: np.ndarray,
    hsv: np.ndarray,
    lab: np.ndarray,
    noise_residual: np.ndarray,
    coordinate_mapper: CoordinateMapper,
    edge_info: np.ndarray = None,
    document_regions: list = None,
    ela_regions: list = None,
    noise_regions: list = None,
    copy_move_regions: list = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicSignal:
    """
    Performs Basic Stamp Forensic Analysis on the document working image.
    
    Algorithm:
    1. Thresholds HSV color spaces to segment saturated Red and Blue/Purple ink.
    2. Applies morphological close and open to merge dots and remove speckle fonts.
    3. Detects contours and filters by stamp-like bounding box constraints.
    4. Computes shape aspect ratio and circularity metrics.
    5. Evaluates spatial overlaps with active ELA, Noise, and Copy-Move anomaly coordinates.
    6. Returns stamp forensic results including bounding boxes and anomaly scores.
    7. Saves visual debug maps showing candidates and segmentation.
    """
    h_limit, w_limit = working_image_rgb.shape[:2]
    total_area = h_limit * w_limit

    # 1. HSV Color Segmentation for Stamp Inks
    # Red Ink Range 1 and Range 2
    lower_red1 = np.array([0, 40, 40])
    upper_red1 = np.array([15, 255, 255])
    lower_red2 = np.array([165, 40, 40])
    upper_red2 = np.array([180, 255, 255])
    
    # Blue/Purple Ink Range
    lower_blue = np.array([95, 40, 40])
    upper_blue = np.array([145, 255, 255])

    mask_red1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask_red2 = cv2.inRange(hsv, lower_red2, upper_red2)
    mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)

    color_mask = cv2.bitwise_or(mask_red1, mask_red2)
    color_mask = cv2.bitwise_or(color_mask, mask_blue)

    # 2. Morphological grouping
    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (35, 35))
    morphed = cv2.morphologyEx(color_mask, cv2.MORPH_CLOSE, close_kernel)
    
    open_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    morphed = cv2.morphologyEx(morphed, cv2.MORPH_OPEN, open_kernel)

    # 3. Contour Detection - Use RETR_LIST to capture nested structures inside document borders
    contours, _ = cv2.findContours(morphed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    regions = []
    evidence = []
    stamp_detected = False

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)

        # 4. Bounding Box Geometry Filters
        if w < 40 or h < 40:
            continue  # Too small to be a stamp
        if w > 400 or h > 400:
            continue  # Too large (covers too much of working image)
        if (w * h) > 0.25 * total_area:
            continue  # Cover limit safety

        aspect_ratio = float(w / h)
        if aspect_ratio < 0.4 or aspect_ratio > 2.5:
            continue  # Non-compact shape

        stamp_detected = True

        # Circularity calculation
        circularity = float((4.0 * np.pi * area) / (perimeter ** 2)) if perimeter > 0 else 0.0

        # Translate coordinates to original document space
        if coordinate_mapper:
            orig_x, orig_y, orig_w, orig_h = coordinate_mapper.box_to_original(x, y, w, h)
            orig_x = int(round(orig_x))
            orig_y = int(round(orig_y))
            orig_w = int(round(orig_w))
            orig_h = int(round(orig_h))
        else:
            orig_x, orig_y, orig_w, orig_h = x, y, w, h

        # 5. Cross-Signal Overlap Check (in original space, tracking highest overlapping severity)
        orig_box = (orig_x, orig_y, orig_w, orig_h)
        ela_severity = None
        if ela_regions:
            for r in ela_regions:
                if calculate_overlap_ratio(orig_box, (r.x, r.y, r.width, r.height)) > 0.2:
                    if r.severity == "HIGH" or (r.severity == "MEDIUM" and ela_severity != "HIGH") or ela_severity is None:
                        ela_severity = r.severity

        noise_severity = None
        if noise_regions:
            for r in noise_regions:
                if calculate_overlap_ratio(orig_box, (r.x, r.y, r.width, r.height)) > 0.2:
                    if r.severity == "HIGH" or (r.severity == "MEDIUM" and noise_severity != "HIGH") or noise_severity is None:
                        noise_severity = r.severity

        copy_move_severity = None
        if copy_move_regions:
            for r in copy_move_regions:
                if calculate_overlap_ratio(orig_box, (r.x, r.y, r.width, r.height)) > 0.2:
                    if r.severity == "HIGH" or (r.severity == "MEDIUM" and copy_move_severity != "HIGH") or copy_move_severity is None:
                        copy_move_severity = r.severity

        # 6. Scoring Formula
        region_score = 0.1  # base detected stamp score
        reasons = []
        signals_count = 0

        if ela_severity:
            signals_count += 1
            if ela_severity == "HIGH":
                region_score += 0.4
            elif ela_severity == "MEDIUM":
                region_score += 0.2
            else:
                region_score += 0.1
            reasons.append("ELA compression inconsistency")

        if noise_severity:
            signals_count += 1
            if noise_severity == "HIGH":
                region_score += 0.35
            elif noise_severity == "MEDIUM":
                region_score += 0.15
            else:
                region_score += 0.05
            reasons.append("Noise density mismatch")

        if copy_move_severity:
            signals_count += 1
            if copy_move_severity == "HIGH":
                region_score += 0.5
            elif copy_move_severity == "MEDIUM":
                region_score += 0.25
            else:
                region_score += 0.1
            reasons.append("Copy-move visual duplicate")

        # Compounding bonus for multiple independent anomaly overlaps
        if signals_count >= 3:
            region_score += 0.3
        elif signals_count == 2:
            region_score += 0.2

        region_score = float(min(region_score, 1.0))
        severity = "LOW"
        if region_score > 0.7:
            severity = "HIGH"
        elif region_score > 0.4:
            severity = "MEDIUM"

        if len(reasons) > 0:
            reason_msg = f"Potential stamp manipulation: region overlaps with {', '.join(reasons)}."
        else:
            reason_msg = "Detected visual stamp-like region (no compression or noise anomalies)."

        regions.append(SuspiciousRegion(
            x=orig_x,
            y=orig_y,
            width=orig_w,
            height=orig_h,
            score=region_score,
            severity=severity,
            source="stamp",
            reason=reason_msg
        ))

    # Bounding Box Deduplication: Filter out nested/duplicate boxes (e.g. inner vs outer outlines)
    deduped_regions = []
    # Sort by area descending so we keep the larger box when they overlap
    regions.sort(key=lambda r: r.width * r.height, reverse=True)
    for r in regions:
        overlap_found = False
        r_box = (r.x, r.y, r.width, r.height)
        for kept in deduped_regions:
            kept_box = (kept.x, kept.y, kept.width, kept.height)
            # Normalize intersection by r_box (smaller area)
            if calculate_overlap_ratio(kept_box, r_box) > 0.8:
                overlap_found = True
                break
        if not overlap_found:
            deduped_regions.append(r)
    regions = deduped_regions

    # 7. Document-Wide Score & Statistics
    anomaly_score = 0.0
    if regions:
        # Document-wide score is the maximum of detected regional stamp anomalies
        anomaly_score = max(r.score for r in regions)
        evidence.append({
            "message": f"Detected {len(regions)} candidate stamp-like region(s) in document.",
            "severity": "LOW"
        })
        for r in regions:
            if r.score > 0.4:
                evidence.append({
                    "message": f"Stamp region at ({r.x}, {r.y}) shows anomaly evidence (score: {r.score:.2f}). Requires manual review.",
                    "severity": r.severity
                })
    else:
        evidence.append({
            "message": "No sufficiently strong stamp-like region detected.",
            "severity": "LOW"
        })

    statistics = {
        "stamp_detected": 1.0 if stamp_detected else 0.0,
        "candidate_regions": float(len(regions)),
        "max_stamp_anomaly": float(anomaly_score)
    }

    # 8. Save Visual Debug Outputs
    if save_debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        
        # BGR Copy of the working RGB image
        vis_bgr = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2BGR)
        
        for idx, r in enumerate(regions):
            # Scale coordinates back to working resolution for drawing
            if coordinate_mapper:
                # CoordinateMapper maps work -> original. To draw on work, we divide back.
                w_x = int(round(r.x * coordinate_mapper.scale_x))
                w_y = int(round(r.y * coordinate_mapper.scale_y))
                w_w = int(round(r.width * coordinate_mapper.scale_x))
                w_h = int(round(r.height * coordinate_mapper.scale_y))
            else:
                w_x, w_y, w_w, w_h = r.x, r.y, r.width, r.height
                
            color = (0, 255, 0)  # Green for low-risk stamps
            if r.score > 0.7:
                color = (0, 0, 255)  # Red for high-risk stamps
            elif r.score > 0.4:
                color = (0, 165, 255)  # Orange for medium-risk stamps
                
            cv2.rectangle(vis_bgr, (w_x, w_y), (w_x + w_w, w_y + w_h), color, 2)
            cv2.putText(
                vis_bgr,
                f"Stamp #{idx+1} Score: {r.score:.2f}",
                (w_x, w_y - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                color,
                1
            )
            
        cv2.imwrite(os.path.join(debug_dir, "document_stamp_candidates.jpg"), vis_bgr)
        cv2.imwrite(os.path.join(debug_dir, "document_stamp_map.png"), morphed)

    return ForensicSignal(
        name="stamp",
        score=anomaly_score,
        confidence=None,
        regions=regions,
        evidence=evidence,
        available=True,
        stamp_detected=stamp_detected,
        statistics=statistics
    )
