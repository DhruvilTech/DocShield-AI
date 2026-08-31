"""
PDF Forensic Processing & Artifact Normalization Module
======================================================
Provides artifact-resistant forensic signal evaluation for rendered PDF pages.

In PDF documents (scanned, digital, multi-page, or mixed vector/raster),
standard rendering onto an RGB bitmap introduces distinct visual properties
compared to camera photographs:
1. Sharp step edges (0 to 255) in vector text and table lines cause minor
   DCT/chroma ringing during JPEG recompression (ELA).
2. Clean white backgrounds have zero noise variance, causing naive local variance
   filters to spike along text boundaries (Noise).
3. Legitimate official documents (e.g. e-Aadhaar, invoices, tickets, ID cards)
   often contain duplicate identical 2D barcodes/QR codes, institutional crests,
   logos, or repeating template elements (Copy-Move).

This module provides specialized, robust detectors for PDF pages that:
- Filter out rendering artifacts, self-overlapping text lines, and standard 2D barcodes/emblems.
- Maintain full sensitivity to genuine document tampering (pasted foreign photos,
  tampered text, forged signatures, cloned content, inserted stamps).
"""

from __future__ import annotations
import os
import cv2
import numpy as np
from typing import Optional

from image_tampering.schemas.forensic import ForensicSignal, SuspiciousRegion
from image_tampering.forensic.preprocessing import CoordinateMapper
from image_tampering.forensic.copy_move import _calculate_cluster_ncc


def is_dense_barcode_or_qr_region(gray_img: np.ndarray, x: int, y: int, w: int, h: int) -> bool:
    """
    Determines if a bounding box (or its surrounding local context) corresponds to
    a standard 2D barcode / QR code / DataMatrix.
    
    Properties of 2D Barcodes / QR Codes:
    - High-density binary / bimodal intensity distribution.
    - High standard deviation (> 55.0) and balanced mean intensity (~90 to ~190).
    - Extremely high edge density / high-frequency module grid transitions (Sobel gradient > 120).
    """
    if w <= 0 or h <= 0:
        return False
    
    h_img, w_img = gray_img.shape[:2]
    
    # Check both tight box and square-expanded context
    boxes_to_check = [(x, y, w, h)]
    max_side = max(w, h)
    cx, cy = x + w // 2, y + h // 2
    sq_x = max(0, cx - max_side // 2)
    sq_y = max(0, cy - max_side // 2)
    boxes_to_check.append((sq_x, sq_y, min(w_img - sq_x, max_side), min(h_img - sq_y, max_side)))
    
    for bx, by, bw, bh in boxes_to_check:
        roi = gray_img[by:by+bh, bx:bx+bw]
        if roi.size < 400:
            continue
            
        mean_val = float(np.mean(roi))
        std_val = float(np.std(roi))
        binary_fraction = float(np.sum((roi < 75) | (roi > 180)) / roi.size)
        
        sobelx = cv2.Sobel(roi, cv2.CV_32F, 1, 0, ksize=3)
        sobely = cv2.Sobel(roi, cv2.CV_32F, 0, 1, ksize=3)
        grad_mag = np.sqrt(sobelx**2 + sobely**2)
        edge_density = float(np.mean(grad_mag))
        
        if (edge_density >= 120.0 and std_val >= 55.0 and binary_fraction >= 0.60) or \
           (binary_fraction >= 0.70 and std_val >= 60.0 and (90.0 <= mean_val <= 190.0) and edge_density >= 35.0):
            return True
            
    return False


def is_flat_text_glyph_region(gray_img: np.ndarray, x: int, y: int, w: int, h: int) -> bool:
    """
    Checks if a region is an isolated flat text glyph / table cell word strip
    (e.g., "$150.00" repeating down a table column or repeated boilerplate text).
    
    Characteristics:
    - Thin text line height (h <= 90px or w <= 90px at PDF working scale).
    - Dominated by uniform flat background (> 60% within 12 intensity units of median),
      or overwhelmingly flat document background (> 80%).
    - Lacks continuous photographic / natural paper / multi-tone texture.
    """
    if w <= 0 or h <= 0:
        return False
    h_img, w_img = gray_img.shape[:2]
    roi = gray_img[max(0, y):min(h_img, y+h), max(0, x):min(w_img, x+w)]
    if roi.size == 0:
        return False
    
    med = float(np.median(roi))
    flat_bg_fraction = float(np.sum(np.abs(roi.astype(float) - med) < 12) / roi.size)
    
    if flat_bg_fraction >= 0.80 or ((h <= 90 or w <= 90) and flat_bg_fraction >= 0.60) or ((h <= 60 or w <= 60) and flat_bg_fraction >= 0.50):
        return True
        
    return False


def is_thin_line_or_border(w: int, h: int) -> bool:
    """
    Checks if a region is an isolated 1D line, underline, or thin table rule (e.g. aspect ratio > 8:1 with small dimension < 12px).
    """
    if w < 12 and h > 50:
        return True
    if h < 12 and w > 50:
        return True
    if w <= 8 or h <= 8:
        return True
    return False


def compute_box_iou(box1: tuple[float, float, float, float], box2: tuple[float, float, float, float]) -> float:
    """Computes Intersection over Union (IoU) of two bounding boxes (x, y, w, h)."""
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2
    
    xA = max(x1, x2)
    yA = max(y1, y2)
    xB = min(x1 + w1, x2 + w2)
    yB = min(y1 + h1, y2 + h2)
    
    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    inter_area = inter_w * inter_h
    
    area1 = max(0.0, w1) * max(0.0, h1)
    area2 = max(0.0, w2) * max(0.0, h2)
    union_area = area1 + area2 - inter_area
    
    return (inter_area / union_area) if union_area > 0 else 0.0


def analyze_pdf_copy_move(
    working_image_rgb: np.ndarray,
    coordinate_mapper: Optional[CoordinateMapper] = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None,
    ratio: float = 0.60,
    min_dist_ratio: float = 0.05,
    min_inliers: int = 8
) -> ForensicSignal:
    """
    PDF-Aware Copy-Move duplicate tampering detection.
    
    Protections for PDF documents:
    1. Filters out self-overlapping clusters (IoU >= 0.15), which arise from
       repeating text lines or vertical borders within the same region.
    2. Identifies and filters legitimate duplicate 2D QR codes / barcodes
       (such as in e-Aadhaar letters with card cutouts or invoices with shipping barcodes).
    3. Filters out repeating flat text glyphs in tables/forms (e.g. repeated amounts or words).
    4. Filters out 1D thin line / table rule matches.
    5. Enforces 2D spatial dispersion for genuine copied patches.
    6. Preserves full detection of genuine copy-move tampering (e.g. copied faces,
       signatures, textured stamps, patched numbers, cloned document regions).
    """
    if working_image_rgb is None or len(working_image_rgb.shape) != 3:
        raise ValueError("Input image must be a valid 3D RGB image array.")

    gray = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2GRAY)
    h_limit, w_limit = working_image_rgb.shape[:2]

    # SIFT Feature Detection & Descriptor Extraction (Cap at 1,500 keypoints)
    sift = cv2.SIFT_create(nfeatures=1500, contrastThreshold=0.02, edgeThreshold=15)
    kp, des = sift.detectAndCompute(gray, None)

    if des is None or len(kp) < 15:
        statistics = {
            "keypoints": float(len(kp)) if kp is not None else 0.0,
            "candidate_matches": 0.0,
            "verified_matches": 0.0,
            "clusters": 0.0,
            "largest_cluster": 0.0
        }
        return ForensicSignal(
            name="copy_move",
            score=0.0,
            confidence=None,
            regions=[],
            evidence=[{"message": "Insufficient visual features to run copy-move check.", "severity": "LOW"}],
            available=True,
            statistics=statistics
        )

    # Descriptor Matching (k=3)
    bf = cv2.BFMatcher(cv2.NORM_L2)
    matches = bf.knnMatch(des, des, k=3)

    candidate_matches = []
    max_dim = max(h_limit, w_limit)
    min_spatial_dist = max_dim * min_dist_ratio

    for m in matches:
        if len(m) < 3:
            continue
        m1, m2 = m[1], m[2]
        
        if m1.queryIdx >= m1.trainIdx:
            continue
            
        if m1.distance < ratio * m2.distance:
            pt1 = kp[m1.queryIdx].pt
            pt2 = kp[m1.trainIdx].pt
            spatial_dist = np.linalg.norm(np.array(pt1) - np.array(pt2))
            
            if spatial_dist >= min_spatial_dist:
                candidate_matches.append(m1)

    # Deduplicate matches
    unique_candidates = []
    seen_pairs = set()
    for m in candidate_matches:
        pt1 = (round(kp[m.queryIdx].pt[0], 1), round(kp[m.queryIdx].pt[1], 1))
        pt2 = (round(kp[m.trainIdx].pt[0], 1), round(kp[m.trainIdx].pt[1], 1))
        pair = (min(pt1, pt2), max(pt1, pt2))
        if pair not in seen_pairs:
            seen_pairs.add(pair)
            unique_candidates.append(m)
    candidate_matches = unique_candidates

    # Iterative RANSAC Geometric Verification with PDF-aware filters
    verified_matches = []
    clusters = []
    remaining_matches = candidate_matches.copy()

    while len(remaining_matches) >= min_inliers:
        src_pts = np.float32([kp[m.queryIdx].pt for m in remaining_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp[m.trainIdx].pt for m in remaining_matches]).reshape(-1, 1, 2)
        
        H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
        if mask is None:
            break
            
        inliers_count = int(np.sum(mask))
        if inliers_count < min_inliers:
            break
            
        inliers_mask = mask.ravel() == 1
        inlier_matches = [m for i, m in enumerate(remaining_matches) if inliers_mask[i]]
        
        # Calculate bounding boxes
        src_coords = np.array([kp[m.queryIdx].pt for m in inlier_matches])
        dst_coords = np.array([kp[m.trainIdx].pt for m in inlier_matches])
        
        min_src_x, min_src_y = np.min(src_coords, axis=0)
        max_src_x, max_src_y = np.max(src_coords, axis=0)
        min_dst_x, min_dst_y = np.min(dst_coords, axis=0)
        max_dst_x, max_dst_y = np.max(dst_coords, axis=0)
        
        s_w = max_src_x - min_src_x
        s_h = max_src_y - min_src_y
        d_w = max_dst_x - min_dst_x
        d_h = max_dst_y - min_dst_y
        
        # 1. Check self-overlap (box IoU and overlap ratio)
        box_s = (min_src_x, min_src_y, s_w, s_h)
        box_d = (min_dst_x, min_dst_y, d_w, d_h)
        iou = compute_box_iou(box_s, box_d)
        
        inter_x = max(0.0, min(max_src_x, max_dst_x) - max(min_src_x, min_dst_x))
        inter_y = max(0.0, min(max_src_y, max_dst_y) - max(min_src_y, min_dst_y))
        inter_area = inter_x * inter_y
        min_area = min(s_w * s_h, d_w * d_h)
        overlap_ratio = (inter_area / min_area) if min_area > 0 else 0.0
        
        # 2. Check for thin 1D line / border
        is_line = is_thin_line_or_border(int(s_w), int(s_h)) or is_thin_line_or_border(int(d_w), int(d_h))
        
        # 3. Check for legitimate 2D QR code / barcode pair
        is_qr = is_dense_barcode_or_qr_region(gray, int(min_src_x), int(min_src_y), int(s_w), int(s_h)) or \
                is_dense_barcode_or_qr_region(gray, int(min_dst_x), int(min_dst_y), int(d_w), int(d_h))
        
        # 4. Check for repeating flat text glyph lines (e.g. table columns)
        is_text = is_flat_text_glyph_region(gray, int(min_src_x), int(min_src_y), int(s_w), int(s_h)) or \
                  is_flat_text_glyph_region(gray, int(min_dst_x), int(min_dst_y), int(d_w), int(d_h))

        cluster_ncc = _calculate_cluster_ncc(inlier_matches, kp, gray)

        # 5. Check for sparse table grid / empty background (> 85% flat background over large page section)
        roi_s = gray[int(min_src_y):int(max_src_y), int(min_src_x):int(max_src_x)]
        roi_d = gray[int(min_dst_y):int(max_dst_y), int(min_dst_x):int(max_dst_x)]
        med_s = float(np.median(roi_s)) if roi_s.size > 0 else 255.0
        med_d = float(np.median(roi_d)) if roi_d.size > 0 else 255.0
        flat_bg_s = float(np.mean(np.abs(roi_s.astype(float) - med_s) < 12)) if roi_s.size > 0 else 1.0
        flat_bg_d = float(np.mean(np.abs(roi_d.astype(float) - med_d) < 12)) if roi_d.size > 0 else 1.0
        total_pixels = gray.shape[0] * gray.shape[1]
        is_sparse_table = ((flat_bg_s > 0.85 or flat_bg_d > 0.85) and (s_w * s_h > 0.12 * total_pixels or d_w * d_h > 0.12 * total_pixels))
        
        # Accept cluster only if it is a genuine non-overlapping 2D copy-move tampering
        if iou < 0.15 and overlap_ratio < 0.20 and not is_line and not is_qr and not is_text and not is_sparse_table and cluster_ncc >= 0.45:
            # Calculate geometric residual
            inlier_src = src_pts[inliers_mask]
            inlier_dst = dst_pts[inliers_mask]
            mean_residual = 0.0
            if H is not None:
                try:
                    warped_src = cv2.perspectiveTransform(inlier_src, H)
                    residuals = np.linalg.norm(inlier_dst - warped_src, axis=-1)
                    mean_residual = float(np.mean(residuals))
                except Exception:
                    pass
            clusters.append((inlier_matches, cluster_ncc, mean_residual, H))
            verified_matches.extend(inlier_matches)
        
        # Remove RANSAC inliers to continue search
        remaining_matches = [m for i, m in enumerate(remaining_matches) if not inliers_mask[i]]

    # Bounding Box Segmentation & Coordinate Restoration
    regions = []
    padding = 15
    for idx, (cluster, cluster_ncc, mean_residual, H) in enumerate(clusters):
        anchor = np.array(kp[cluster[0].queryIdx].pt)
        src_coords = []
        dst_coords = []
        for m in cluster:
            pt1 = np.array(kp[m.queryIdx].pt)
            pt2 = np.array(kp[m.trainIdx].pt)
            if np.linalg.norm(pt1 - anchor) < np.linalg.norm(pt2 - anchor):
                src_coords.append(pt1)
                dst_coords.append(pt2)
            else:
                src_coords.append(pt2)
                dst_coords.append(pt1)
                
        src_coords = np.array(src_coords)
        dst_coords = np.array(dst_coords)
        
        min_src_x, min_src_y = np.min(src_coords, axis=0)
        max_src_x, max_src_y = np.max(src_coords, axis=0)
        min_dst_x, min_dst_y = np.min(dst_coords, axis=0)
        max_dst_x, max_dst_y = np.max(dst_coords, axis=0)
        
        src_x = int(max(min_src_x - padding, 0))
        src_y = int(max(min_src_y - padding, 0))
        src_w = int(min(max_src_x + padding, w_limit - 1)) - src_x
        src_h = int(min(max_src_y + padding, h_limit - 1)) - src_y
        
        dst_x = int(max(min_dst_x - padding, 0))
        dst_y = int(max(min_dst_y - padding, 0))
        dst_w = int(min(max_dst_x + padding, w_limit - 1)) - dst_x
        dst_h = int(min(max_dst_y + padding, h_limit - 1)) - dst_y

        if coordinate_mapper:
            orig_src_x, orig_src_y, orig_src_w, orig_src_h = coordinate_mapper.box_to_original(src_x, src_y, src_w, src_h)
            orig_dst_x, orig_dst_y, orig_dst_w, orig_dst_h = coordinate_mapper.box_to_original(dst_x, dst_y, dst_w, dst_h)
            orig_src_x = int(round(orig_src_x))
            orig_src_y = int(round(orig_src_y))
            orig_src_w = int(round(orig_src_w))
            orig_src_h = int(round(orig_src_h))
            orig_dst_x = int(round(orig_dst_x))
            orig_dst_y = int(round(orig_dst_y))
            orig_dst_w = int(round(orig_dst_w))
            orig_dst_h = int(round(orig_dst_h))
        else:
            orig_src_x, orig_src_y, orig_src_w, orig_src_h = src_x, src_y, src_w, src_h
            orig_dst_x, orig_dst_y, orig_dst_w, orig_dst_h = dst_x, dst_y, dst_w, dst_h

        if len(cluster) >= 8:
            cluster_score = float(0.4 + 0.6 * (min(len(cluster), 20) - 8) / 12.0)
            severity = "HIGH" if (len(cluster) >= 10 and cluster_ncc >= 0.85) or cluster_score > 0.7 else "MEDIUM"
        else:
            cluster_score = float(0.05 * len(cluster))
            severity = "LOW"

        regions.append(SuspiciousRegion(
            x=orig_src_x,
            y=orig_src_y,
            width=orig_src_w,
            height=orig_src_h,
            score=cluster_score,
            severity=severity,
            source="copy_move",
            reason=f"Potential duplicated visual region (cluster size: {len(cluster)} matches, NCC: {cluster_ncc:.4f})",
            target_x=orig_dst_x,
            target_y=orig_dst_y,
            target_width=orig_dst_w,
            target_height=orig_dst_h
        ))

    regions.sort(key=lambda r: r.score, reverse=True)

    largest_cluster_size = max(len(c[0]) for c in clusters) if clusters else 0
    if largest_cluster_size >= 8:
        base_score = 0.4 + 0.6 * (min(largest_cluster_size, 20) - 8) / 12.0
    else:
        base_score = 0.05 * largest_cluster_size

    score = base_score + 0.15 * (len(clusters) - 1 if len(clusters) > 0 else 0)
    score = float(min(max(score, 0.0), 1.0))

    statistics = {
        "keypoints": float(len(kp)),
        "candidate_matches": float(len(candidate_matches)),
        "verified_matches": float(len(verified_matches)),
        "clusters": float(len(clusters)),
        "largest_cluster": float(largest_cluster_size)
    }

    # Debug Visualization
    vis_bgr = cv2.cvtColor(working_image_rgb.copy(), cv2.COLOR_RGB2BGR)
    for m in verified_matches:
        pt1 = kp[m.queryIdx].pt
        pt2 = kp[m.trainIdx].pt
        cv2.circle(vis_bgr, (int(pt1[0]), int(pt1[1])), 4, (0, 255, 0), -1)
        cv2.circle(vis_bgr, (int(pt2[0]), int(pt2[1])), 4, (0, 0, 255), -1)
        cv2.line(vis_bgr, (int(pt1[0]), int(pt1[1])), (int(pt2[0]), int(pt2[1])), (0, 255, 255), 1)

    matches_rel_path = None
    map_rel_path = None
    if save_debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(debug_dir, "document_copy_move_matches.jpg"), vis_bgr)
        map_img = np.zeros((h_limit, w_limit), dtype=np.uint8)
        for r in regions:
            rx = int(round(r.x * coordinate_mapper.scale_x)) if coordinate_mapper else r.x
            ry = int(round(r.y * coordinate_mapper.scale_y)) if coordinate_mapper else r.y
            rw = int(round(r.width * coordinate_mapper.scale_x)) if coordinate_mapper else r.width
            rh = int(round(r.height * coordinate_mapper.scale_y)) if coordinate_mapper else r.height
            cv2.rectangle(map_img, (rx, ry), (rx + rw, ry + rh), 255, -1)
        cv2.imwrite(os.path.join(debug_dir, "document_copy_move_map.png"), map_img)

    evidence = []
    if len(regions) > 0:
        highest_sev = "HIGH" if any(r.severity == "HIGH" for r in regions) else "MEDIUM"
        evidence.append({
            "message": f"Potential copy-move duplicate detected in {len(regions)} localized region(s).",
            "severity": highest_sev
        })
        for idx, r in enumerate(regions):
            cluster_matches, ncc_val, res_val, H_mat = clusters[idx]
            evidence.append({
                "message": (
                    f"Cluster {idx+1}: verified {len(cluster_matches)} matches, "
                    f"NCC similarity: {ncc_val:.4f}, Geometric Residual: {res_val:.4f}px."
                ),
                "severity": r.severity
            })
    else:
        evidence.append({
            "message": "No significant duplicated visual content was detected.",
            "severity": "LOW"
        })

    return ForensicSignal(
        name="copy_move",
        score=score,
        confidence=float(max((c[1] for c in clusters), default=0.0)) if len(regions) > 0 else None,
        regions=regions,
        evidence=evidence,
        available=True,
        statistics=statistics,
        heatmap_path=matches_rel_path,
        map_path=map_rel_path
    )


def analyze_pdf_ela(
    working_image_rgb: np.ndarray,
    quality: int = 95,
    coordinate_mapper: Optional[CoordinateMapper] = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicSignal:
    """
    PDF-Aware Error Level Analysis (ELA).
    
    Protections for PDF documents:
    - Distinguishes high-contrast anti-aliased font edges on white backgrounds
      from genuine compression inconsistencies across photo/image patches.
    - If document global compression error is uniform and low (mean_error < 2.0),
      isolated font-edge contours are recognized as normal vector rasterization.
    - Spliced JPEG elements or pasted foreign blocks with genuine compression anomalies
      are reliably localized and flagged with high severity.
    """
    if working_image_rgb is None or len(working_image_rgb.shape) != 3:
        raise ValueError("Input image must be a valid 3D RGB image array.")

    working_bgr = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2BGR)
    success, encoded = cv2.imencode('.jpg', working_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not success:
        raise ValueError("JPEG in-memory recompression failed.")
    
    recompressed_bgr = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    recompressed_rgb = cv2.cvtColor(recompressed_bgr, cv2.COLOR_BGR2RGB)

    diff = cv2.absdiff(working_image_rgb, recompressed_rgb)
    diff_gray = cv2.cvtColor(diff, cv2.COLOR_RGB2GRAY)

    scale = 20
    ela_gray = np.clip(diff_gray.astype(np.uint16) * scale, 0, 255).astype(np.uint8)

    mean_err = float(np.mean(diff_gray))
    median_err = float(np.median(diff_gray))
    max_err = float(np.max(diff_gray))
    std_err = float(np.std(diff_gray))
    
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

    # Region segmentation: threshold amplified ELA
    _, thresh = cv2.threshold(ela_gray, 75, 255, cv2.THRESH_BINARY)
    morph_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    morphed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, morph_kernel)
    morphed = cv2.morphologyEx(morphed, cv2.MORPH_OPEN, morph_kernel)
    
    contours, _ = cv2.findContours(morphed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    
    regions = []
    min_region_dim = 30  # Require substantial continuous patch area
    working_area = working_image_rgb.shape[0] * working_image_rgb.shape[1]
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w >= min_region_dim and h >= min_region_dim and (w * h < 0.35 * working_area):
            roi = ela_gray[y:y+h, x:x+w]
            roi_mean = float(np.mean(roi))
            
            roi_thresh = (roi > 60).astype(np.float32)
            fill_ratio = float(np.mean(roi_thresh))
            
            # Anomaly condition: genuine area-wide error inconsistency (> 6.75 raw error across solid patch)
            if roi_mean >= 135.0 and fill_ratio >= 0.30:
                if roi_mean > 175.0 and fill_ratio >= 0.45:
                    severity = "HIGH"
                elif roi_mean > 145.0:
                    severity = "MEDIUM"
                else:
                    severity = "LOW"
                    
                region_score = float(min(roi_mean / 255.0 * (1.2 + fill_ratio), 1.0))
                
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

    regions.sort(key=lambda r: r.score, reverse=True)

    global_score = 0.4 * (mean_err / 8.0) + 0.4 * (std_err / 6.0) + 0.2 * (high_err_ratio / 0.10)
    peak_regional_score = regions[0].score if regions else 0.0
    
    if len(regions) > 0:
        score = float(min(max(max(global_score, 0.70 * peak_regional_score), 0.0), 1.0))
    else:
        # Uniform clean document
        score = float(min(max(global_score * 0.4, 0.0), 0.20))

    heatmap = cv2.applyColorMap(ela_gray, cv2.COLORMAP_JET)
    heatmap_rel_path = None
    map_rel_path = None
    if save_debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(debug_dir, "document_ela_heatmap.jpg"), heatmap)
        cv2.imwrite(os.path.join(debug_dir, "document_ela_map.png"), ela_gray)

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
        confidence=None,
        regions=regions,
        evidence=evidence,
        available=True,
        statistics=statistics,
        quality=quality,
        heatmap_path=heatmap_rel_path,
        map_path=map_rel_path
    )


def analyze_pdf_noise(
    working_image_rgb: np.ndarray,
    noise_residual: Optional[np.ndarray] = None,
    coordinate_mapper: Optional[CoordinateMapper] = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicSignal:
    """
    PDF-Aware Noise / Sensor Consistency Forensic Analysis.
    
    Protections for PDF documents:
    - Digital vector text and table lines have sharp step edges on white backgrounds,
      which create high local variance in small box filters without representing noise tampering.
    - Suppresses sharp binary vector edge spikes using gradient edge-masking so that clean
      digital text does not produce false noise alarms.
    - Spliced photographs, modified signature patches, or inserted scanned elements with
      mismatched sensor noise characteristics are accurately detected and localized.
    """
    if working_image_rgb is None or len(working_image_rgb.shape) != 3:
        raise ValueError("Input image must be a valid 3D RGB image array.")

    grayscale = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2GRAY)
    
    # Generate high-frequency noise residual
    if noise_residual is None:
        low_pass = cv2.GaussianBlur(grayscale, (5, 5), 0)
        noise_residual = cv2.absdiff(grayscale, low_pass)

    # Edge suppression mask for sharp vector text / table strokes in PDFs
    grad_x = cv2.Sobel(grayscale, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(grayscale, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = np.sqrt(grad_x**2 + grad_y**2)
    
    edge_mask = (grad_mag > 40.0).astype(np.float32)
    kernel_edge = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edge_mask_dilated = cv2.dilate(edge_mask, kernel_edge)
    non_edge_weight = 1.0 - edge_mask_dilated

    # Local standard deviation
    I = noise_residual.astype(np.float32)
    I_filtered = I * (0.15 + 0.85 * non_edge_weight)
    I_sq = cv2.multiply(I_filtered, I_filtered)

    ksize = 11
    mean_I = cv2.boxFilter(I_filtered, -1, (ksize, ksize))
    mean_I_sq = cv2.boxFilter(I_sq, -1, (ksize, ksize))
    local_var = cv2.subtract(mean_I_sq, cv2.multiply(mean_I, mean_I))
    local_var = np.clip(local_var, 0.0, None)
    std_small = np.sqrt(local_var)

    large_ksize = 45
    std_large = cv2.boxFilter(std_small, -1, (large_ksize, large_ksize))

    anomaly_raw = cv2.absdiff(std_small, std_large)

    global_std_variation = float(np.std(std_small))
    global_std_variation = max(global_std_variation, 6.0)

    anomaly_map = np.clip(anomaly_raw / (3.5 * global_std_variation + 1e-5), 0.0, 1.0)
    smoothed_anomaly = cv2.GaussianBlur(anomaly_map, (9, 9), 0)

    mean_noise = float(np.mean(noise_residual))
    median_noise = float(np.median(noise_residual))
    std_noise = float(np.std(noise_residual))
    max_noise = float(np.max(noise_residual))
    high_anomaly_ratio = float(np.sum(smoothed_anomaly > 0.5) / smoothed_anomaly.size)

    statistics = {
        "mean_noise": mean_noise,
        "median_noise": median_noise,
        "std_noise": std_noise,
        "max_noise": max_noise,
        "high_anomaly_ratio": high_anomaly_ratio
    }

    anomaly_uint8 = (smoothed_anomaly * 255).astype(np.uint8)
    _, thresh = cv2.threshold(anomaly_uint8, int(0.45 * 255), 255, cv2.THRESH_BINARY)
    
    close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    morphed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, close_kernel)
    morphed = cv2.morphologyEx(morphed, cv2.MORPH_OPEN, open_kernel)
    
    contours, _ = cv2.findContours(morphed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    
    regions = []
    min_region_dim = 40
    working_area = working_image_rgb.shape[0] * working_image_rgb.shape[1]
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w >= min_region_dim and h >= min_region_dim and (w * h < 0.35 * working_area):
            roi = smoothed_anomaly[y:y+h, x:x+w]
            region_score = float(np.percentile(roi, 95))
            
            if region_score > 0.7:
                severity = "HIGH"
            elif region_score > 0.45:
                severity = "MEDIUM"
            else:
                severity = "LOW"
                
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

    regions.sort(key=lambda r: r.score, reverse=True)

    score = float(regions[0].score) if len(regions) > 0 else 0.0

    heatmap = cv2.applyColorMap(anomaly_uint8, cv2.COLORMAP_JET)
    heatmap_rel_path = None
    map_rel_path = None
    if save_debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(debug_dir, "document_noise_anomaly_map.png"), anomaly_uint8)
        cv2.imwrite(os.path.join(debug_dir, "document_noise_heatmap.jpg"), heatmap)

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
        confidence=None,
        regions=regions,
        evidence=evidence,
        available=True,
        statistics=statistics,
        heatmap_path=heatmap_rel_path,
        map_path=map_rel_path
    )
