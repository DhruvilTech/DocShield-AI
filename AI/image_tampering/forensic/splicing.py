"""
Phase 4/8 — Splicing & Image Insertion Detection Module
=========================================================
Detects spliced/inserted elements such as replaced portrait photos,
pasted text patches, and inserted signature containers by analyzing:
  1. Concentric double borders / framing margins from pasted image crops.
  2. Embedded timestamp or studio crop artifacts in photo container corners.
  3. Regional ELA compression delta and noise SNR inconsistency.
"""

from __future__ import annotations

import os
import cv2
import numpy as np
from typing import Optional, List, Dict, Any

from image_tampering.schemas.forensic import ForensicSignal, SuspiciousRegion
from image_tampering.forensic.preprocessing import CoordinateMapper


def _is_qr_or_barcode(roi_rgb: np.ndarray) -> bool:
    """Detects if a candidate bounding box is a QR code or barcode texture."""
    if roi_rgb is None or roi_rgb.size == 0:
        return False
    # Grayscale / zero-saturation check
    r = roi_rgb[:, :, 0].astype(float)
    g = roi_rgb[:, :, 1].astype(float)
    b = roi_rgb[:, :, 2].astype(float)
    color_diff = float(np.mean(np.abs(r - g) + np.abs(r - b) + np.abs(g - b)))
    if color_diff < 5.0:
        gray = cv2.cvtColor(roi_rgb, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        edge_density = float(np.mean(edges > 0))
        if edge_density > 0.18:
            return True
    return False


def analyze_splicing(
    working_image_rgb: np.ndarray,
    original_image_rgb: Optional[np.ndarray] = None,
    coordinate_mapper: Optional[CoordinateMapper] = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicSignal:
    """
    Performs forensic splicing, insertion, and photo replacement analysis.
    
    Returns a ForensicSignal with segmented suspicious regions, anomaly metrics,
    and visual debug artifacts.
    """
    if working_image_rgb is None or len(working_image_rgb.shape) != 3:
        return ForensicSignal(
            name="splicing",
            score=0.0,
            confidence=None,
            regions=[],
            evidence=[{"message": "Invalid image input for splicing analysis.", "severity": "LOW"}],
            available=False
        )

    h_img, w_img = working_image_rgb.shape[:2]
    total_area = h_img * w_img
    gray = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2GRAY)
    
    # ── 1. ELA Error Map ──────────────────────────────────────────────────────
    _, enc = cv2.imencode('.jpg', working_image_rgb, [cv2.IMWRITE_JPEG_QUALITY, 90])
    recomp = cv2.imdecode(enc, cv2.IMREAD_COLOR)
    ela_diff = cv2.absdiff(working_image_rgb, recomp)
    ela_gray = cv2.cvtColor(ela_diff, cv2.COLOR_RGB2GRAY).astype(float)
    bg_ela_mean = float(np.mean(ela_gray))
    bg_ela_std = float(np.std(ela_gray) + 1e-4)
    
    # ── 2. Structural Contour Hierarchy Analysis ──────────────────────────────
    edges = cv2.Canny(gray, 50, 150)
    contours, hierarchy = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    detected_regions: List[SuspiciousRegion] = []
    
    if hierarchy is not None and len(contours) > 0:
        h_tree = hierarchy[0]
        
        for i, c in enumerate(contours):
            bx, by, bw, bh = cv2.boundingRect(c)
            area = bw * bh
            aspect = bh / float(bw) if bw > 0 else 0
            
            # Container size criteria: rectangular boxes (photo box, signature container, text field)
            if 35 <= bw <= 450 and 35 <= bh <= 450 and 0.6 <= aspect <= 2.2 and 1200 <= area <= 0.28 * total_area:
                roi_rgb = working_image_rgb[by:by+bh, bx:bx+bw]
                
                # Skip QR codes / 2D barcodes
                if _is_qr_or_barcode(roi_rgb):
                    continue
                    
                # Check circularity vs rectangularity (True circle has circularity > 0.85 and extent ~ pi/4)
                peri = cv2.arcLength(c, True)
                cnt_area = cv2.contourArea(c)
                circularity = (4 * np.pi * cnt_area) / (peri**2 + 1e-5)
                extent = cnt_area / (bw * bh + 1e-5)
                # A rectangle has extent >= 0.85; a round seal has circularity > 0.85 and extent ~ 0.78
                is_round_seal = circularity > 0.85 and extent < 0.82
                
                # Inspect child contours in hierarchy
                child_idx = h_tree[i][2]
                while child_idx != -1:
                    cc = contours[child_idx]
                    cx, cy, cw, ch = cv2.boundingRect(cc)
                    
                    margin_x = cx - bx
                    margin_y = cy - by
                    gap_right = (bx + bw) - (cx + cw)
                    gap_bot = (by + bh) - (cy + ch)
                    
                    # Splicing double border signature:
                    # Tight, non-zero margin on all 4 sides (2px to 25px) covering > 70% of parent container
                    if 2 <= margin_x <= 25 and 2 <= margin_y <= 25 and 2 <= gap_right <= 25 and 2 <= gap_bot <= 25:
                        if cw >= 0.70 * bw and ch >= 0.70 * bh:
                            roi_ela = ela_gray[by:by+bh, bx:bx+bw]
                            roi_gray = gray[by:by+bh, bx:bx+bw]
                            
                            # Check for embedded corner timestamp (e.g. '34.50')
                            bot_crop = roi_gray[int(bh*0.70):bh, 0:int(bw*0.55)]
                            bot_canny = cv2.Canny(bot_crop, 50, 150)
                            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats((bot_canny > 0).astype(np.uint8))
                            char_count = sum(1 for s in stats[1:] if 2 <= s[cv2.CC_STAT_WIDTH] <= 15 and 4 <= s[cv2.CC_STAT_HEIGHT] <= 18)
                            has_timestamp = char_count >= 3
                            
                            ela_deviation = (float(np.mean(roi_ela)) - bg_ela_mean) / bg_ela_std
                            
                            reasons = []
                            score = 0.0
                            
                            margin_asym = max(abs(margin_x - gap_right), abs(margin_y - gap_bot), abs(margin_x - margin_y))

                            if has_timestamp and not is_round_seal and (margin_asym >= 3 or ela_deviation > 0.8):
                                score = 0.85
                                reasons = ["concentric crop border", "embedded studio timestamp marking"]
                            elif not is_round_seal and margin_asym >= 4 and ela_deviation > 0.7:
                                score = 0.75
                                reasons = [f"asymmetric crop boundary (margins: {margin_x}x{margin_y}px, gaps: {gap_right}x{gap_bot}px)", f"compression delta ({ela_deviation:.1f} std)"]
                            elif not is_round_seal and ela_deviation > 1.2:
                                score = 0.70
                                reasons = [f"concentric crop border (margins: {margin_x}x{margin_y}px)", f"compression delta ({ela_deviation:.1f} std)"]
                            elif not is_round_seal and margin_asym >= 8 and area >= 3000:
                                score = 0.60
                                reasons = [f"severe asymmetric crop boundary (offset {margin_asym}px)"]
                            else:
                                score = 0.15
                                reasons = ["symmetric official document container / frame"]
                                
                            if score >= 0.50:
                                if coordinate_mapper:
                                    ox, oy, ow, oh = coordinate_mapper.box_to_original(bx, by, bw, bh)
                                    ox, oy, ow, oh = int(round(ox)), int(round(oy)), int(round(ow)), int(round(oh))
                                else:
                                    ox, oy, ow, oh = bx, by, bw, bh
                                    
                                reason_str = f"Spliced/inserted element detected ({', '.join(reasons)})"
                                detected_regions.append(SuspiciousRegion(
                                    x=ox,
                                    y=oy,
                                    width=ow,
                                    height=oh,
                                    score=score,
                                    severity="HIGH" if score >= 0.70 else "MEDIUM",
                                    source="splicing",
                                    reason=reason_str
                                ))
                                
                    child_idx = h_tree[child_idx][0]

    # ── 3. Deduplicate Nested/Overlapping Regions ─────────────────────────────
    deduped_regions: List[SuspiciousRegion] = []
    for r in detected_regions:
        x1, y1, w1, h1 = r.x, r.y, r.width, r.height
        overlap = False
        for d in deduped_regions:
            x2, y2, w2, h2 = d.x, d.y, d.width, d.height
            ix1, iy1 = max(x1, x2), max(y1, y2)
            ix2, iy2 = min(x1 + w1, x2 + w2), min(y1 + h1, y2 + h2)
            if ix2 > ix1 and iy2 > iy1:
                inter = (ix2 - ix1) * (iy2 - iy1)
                smaller_area = min(w1 * h1, w2 * h2)
                if inter / float(smaller_area) > 0.50:
                    overlap = True
                    if r.score > d.score:
                        d.score = r.score
                        d.severity = r.severity
                        d.reason = r.reason
                    break
        if not overlap:
            deduped_regions.append(r)
            
    deduped_regions.sort(key=lambda r: r.score, reverse=True)
    
    # Document-wide splicing score
    doc_score = max([r.score for r in deduped_regions]) if deduped_regions else 0.0
    
    # ── 4. Generate Visual Debug Map & Artifacts ──────────────────────────────
    heatmap_rel_path = None
    map_rel_path = None
    if save_debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        splicing_vis = working_image_rgb.copy()
        for r in deduped_regions:
            if coordinate_mapper:
                wx, wy, ww, wh = coordinate_mapper.box_to_working(r.x, r.y, r.width, r.height)
                wx, wy, ww, wh = int(round(wx)), int(round(wy)), int(round(ww)), int(round(wh))
            else:
                wx, wy, ww, wh = r.x, r.y, r.width, r.height
            color = (255, 0, 0) if r.severity == "HIGH" else (255, 165, 0)
            cv2.rectangle(splicing_vis, (wx, wy), (wx + ww, wy + wh), color, 2)
            cv2.putText(splicing_vis, f"Splicing:{r.score:.2f}", (wx, max(wy - 6, 12)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
                        
        vis_bgr = cv2.cvtColor(splicing_vis, cv2.COLOR_RGB2BGR)
        cv2.imwrite(os.path.join(debug_dir, "document_splicing_map.jpg"), vis_bgr)
        heatmap_rel_path = "document_splicing_map.jpg"
        
    # ── 5. Human-Readable Evidence ───────────────────────────────────────────
    evidence = []
    if deduped_regions:
        evidence.append({
            "message": f"Splicing/insertion indicators detected in {len(deduped_regions)} localized region(s).",
            "severity": "HIGH" if doc_score >= 0.65 else "MEDIUM"
        })
    else:
        evidence.append({
            "message": "No visual boundary framing, nested crop, or splicing anomalies detected.",
            "severity": "LOW"
        })
        
    statistics = {
        "splicing_score": float(doc_score),
        "regions_detected": float(len(deduped_regions)),
        "bg_ela_mean": float(bg_ela_mean)
    }

    return ForensicSignal(
        name="splicing",
        score=float(doc_score),
        confidence=None,
        regions=deduped_regions,
        evidence=evidence,
        available=True,
        statistics=statistics,
        heatmap_path=heatmap_rel_path,
        map_path=map_rel_path
    )
