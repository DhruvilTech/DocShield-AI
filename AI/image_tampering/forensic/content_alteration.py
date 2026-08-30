"""
Forensic Content Alteration & Digital Defacement Detector
==========================================================
Analyzes documents and images for localized content alterations, including:
- Digital brush and pen defacements / scribbles
- Overpainted or recolored regions covering document content
- Inpainted, erased, or artificially smoothed patches (noise voids)
- Localized texture / color / noise discontinuities relative to surrounding context

Principle:
A legitimate document or photograph has uniform sensor noise and coherent physical
ink/paper interaction. Digital brush marks, overpainting, and erasures introduce
sharp alpha boundaries, local noise suppression, and chroma anomalies relative
to local context.
"""

from __future__ import annotations
import os
import cv2
import numpy as np
from typing import Optional, List, Tuple
from PIL import Image
import io

from image_tampering.schemas.forensic import ForensicSignal, SuspiciousRegion
from image_tampering.forensic.preprocessing import CoordinateMapper


def _is_qr_or_barcode(rgb_roi: np.ndarray, gray_roi: np.ndarray, w: int, h: int) -> bool:
    """Check if region is a legitimate monochrome 2D QR code or dense barcode."""
    if w < 40 or h < 40:
        return False
    aspect = max(w, h) / (min(w, h) + 1e-5)
    if aspect > 1.25:
        return False
    lab = cv2.cvtColor(rgb_roi, cv2.COLOR_RGB2LAB)
    a = lab[:, :, 1].astype(np.float32) - 128.0
    b = lab[:, :, 2].astype(np.float32) - 128.0
    chroma = np.sqrt(a**2 + b**2)
    if np.mean(chroma > 25.0) > 0.08:
        return False
    edges = cv2.Canny(gray_roi, 50, 150)
    edge_density = float(np.sum(edges > 0) / (w * h) * 1000)
    std_val = float(np.std(gray_roi))
    return edge_density > 120 and std_val > 50


def _is_thin_rule_or_banner(w: int, h: int, img_w: int, img_h: int) -> bool:
    """Check if region is a standard 1D rule line or full-width document banner."""
    aspect = max(w, h) / (min(w, h) + 1e-5)
    if aspect > 10.0 and (w < 12 or h < 12):
        return True
    if w > 0.80 * img_w and h < 50:
        return True
    return False


def analyze_content_alteration(
    working_image_rgb: np.ndarray,
    grayscale: np.ndarray,
    hsv: np.ndarray,
    lab: np.ndarray,
    noise_residual: np.ndarray,
    coordinate_mapper: Optional[CoordinateMapper] = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicSignal:
    """
    Detects generalized digital content alteration, overpainting, defacement,
    and inpainting/erasure anomalies.
    """
    try:
        img_h, img_w = working_image_rgb.shape[:2]
        total_pixels = img_h * img_w

        # ── 1. Local Noise Standard Deviation ────────────────────────────────────
        mean_n = cv2.boxFilter(noise_residual.astype(np.float32), -1, (7, 7))
        mean_n_sq = cv2.boxFilter((noise_residual.astype(np.float32))**2, -1, (7, 7))
        local_noise_std = np.sqrt(np.clip(mean_n_sq - mean_n**2, 0, None))

        # ── 2. Local ELA Compression Error Map ────────────────────────────────────
        buf = io.BytesIO()
        Image.fromarray(working_image_rgb).save(buf, "JPEG", quality=95)
        resaved = np.array(Image.open(buf))
        diff_ela = cv2.absdiff(working_image_rgb, resaved).astype(np.float32)
        diff_gray = np.max(diff_ela, axis=2)

        # ── 3. Chroma & Saturation in LAB / HSV ──────────────────────────────────
        a_ch = lab[:, :, 1].astype(np.float32) - 128.0
        b_ch = lab[:, :, 2].astype(np.float32) - 128.0
        chroma = np.sqrt(a_ch**2 + b_ch**2)
        sat = hsv[:, :, 1].astype(np.float32)
        val = hsv[:, :, 2].astype(np.float32)

        # ── 4. Extract Candidate Stroke Pixels ────────────────────────────────────
        stroke_cand = (chroma > 25.0) & (sat > 40) & (val > 25) & (val < 245)

        # Exclude outer 12px border
        stroke_cand[:12, :] = False; stroke_cand[-12:, :] = False
        stroke_cand[:, :12] = False; stroke_cand[:, -12:] = False

        # Morphological linkage of strokes
        kernel_link = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        linked_mask = cv2.morphologyEx(stroke_cand.astype(np.uint8), cv2.MORPH_CLOSE, kernel_link)

        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(linked_mask)

        suspicious_regions: List[SuspiciousRegion] = []
        raw_regions: List[dict] = []

        for lbl in range(1, num_labels):
            bx = int(stats[lbl, cv2.CC_STAT_LEFT])
            by = int(stats[lbl, cv2.CC_STAT_TOP])
            bw = int(stats[lbl, cv2.CC_STAT_WIDTH])
            bh = int(stats[lbl, cv2.CC_STAT_HEIGHT])
            area = int(stats[lbl, cv2.CC_STAT_AREA])

            # Filter out tiny noise and full-document bounds
            if area < 150 or area > 0.40 * total_pixels:
                continue

            # Filter standard 1D rules and full banners
            if _is_thin_rule_or_banner(bw, bh, img_w, img_h):
                continue

            # Filter legitimate 2D QR codes
            roi_rgb = working_image_rgb[by:by+bh, bx:bx+bw]
            roi_gray_crop = grayscale[by:by+bh, bx:bx+bw]
            if _is_qr_or_barcode(roi_rgb, roi_gray_crop, bw, bh):
                continue

            roi_mask = (labels[by:by+bh, bx:bx+bw] == lbl)
            fill_ratio = float(np.sum(roi_mask) / (bw * bh))

            # Pre-printed solid rectangular blocks (colored headers, buttons, photos)
            if fill_ratio > 0.70 and bw > 80 and bh > 80:
                continue

            # Perimeter and thinness / curvature
            contours, _ = cv2.findContours(roi_mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                continue
            peri = cv2.arcLength(contours[0], True)
            thinness = float((peri**2) / (area + 1e-5))

            # Contextual surrounding background analysis
            k_surround = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 13))
            dilated = cv2.dilate(roi_mask.astype(np.uint8), k_surround)
            surround_ring = (dilated > 0) & (~roi_mask)

            roi_gray = grayscale[by:by+bh, bx:bx+bw]
            surround_gray = roi_gray[surround_ring]
            if surround_gray.size < 30:
                continue

            surround_std = float(np.std(surround_gray))
            surround_min = float(np.min(surround_gray))
            surround_max = float(np.max(surround_gray))
            surround_dynamic_range = surround_max - surround_min

            # Local ELA on stroke pixels
            roi_ela = diff_gray[by:by+bh, bx:bx+bw][roi_mask]
            stroke_ela_mean = float(np.mean(roi_ela)) if roi_ela.size > 0 else 0.0
            stroke_ela_max = float(np.max(roi_ela)) if roi_ela.size > 0 else 0.0

            # ── Attack Detection Conditions ───────────────────────────────────────
            # 1. Large freehand defacement scribble / overpaint:
            # Spans across 2D area (bw >= 70, bh >= 60, area >= 1200), high thinness (>= 60.0),
            # cuts across heterogeneous document content (surround_std >= 30.0), with high peak ELA error (>= 35.0)
            is_large_defacement = (
                bw >= 70 and bh >= 60 and area >= 1200 and
                thinness >= 60.0 and surround_std >= 30.0 and
                surround_dynamic_range >= 100.0 and stroke_ela_max >= 35.0
            )

            # 2. Localized content alteration / text overpainting:
            # Medium patch (30 <= bw <= 150, 25 <= bh <= 120), high thinness (>= 40.0),
            # cuts across high-contrast text/photo edges (surround_std >= 45.0),
            # with high localized mean ELA error (stroke_ela_mean >= 22.0)
            is_localized_alteration = (
                bw >= 30 and bh >= 25 and thinness >= 40.0 and
                surround_std >= 45.0 and surround_dynamic_range >= 150.0 and
                stroke_ela_mean >= 22.0
            )

            if is_large_defacement or is_localized_alteration:
                reg_score = float(min(0.80 + 0.001 * thinness + 0.10 * (stroke_ela_max > 60.0), 0.95))

                # Coordinate mapping
                if coordinate_mapper:
                    orig_x = int(round(bx / coordinate_mapper.scale_x))
                    orig_y = int(round(by / coordinate_mapper.scale_y))
                    orig_w = int(round(bw / coordinate_mapper.scale_x))
                    orig_h = int(round(bh / coordinate_mapper.scale_y))
                else:
                    orig_x, orig_y, orig_w, orig_h = bx, by, bw, bh

                sev = "HIGH" if reg_score >= 0.70 else "MEDIUM"
                reason_type = "digital brush defacement / stroke" if is_large_defacement else "content overpainting / alteration anomaly"
                reason = f"[{reason_type}] Localized anomaly (thinness: {thinness:.1f}, background heterogeneity: {surround_std:.1f}, peak ELA: {stroke_ela_max:.1f})"

                suspicious_regions.append(SuspiciousRegion(
                    x=orig_x,
                    y=orig_y,
                    width=orig_w,
                    height=orig_h,
                    score=reg_score,
                    severity=sev,
                    source="content_alteration",
                    reason=reason,
                    page=1
                ))
                raw_regions.append({
                    "box": (bx, by, bw, bh),
                    "score": reg_score,
                    "reason": reason
                })

        # Calculate overall detector score
        if suspicious_regions:
            detector_score = float(max(r.score for r in suspicious_regions))
            evidence_msg = f"Detected {len(suspicious_regions)} localized content alteration / defacement region(s)."
            evidence_sev = "HIGH" if detector_score >= 0.70 else "MEDIUM"
        else:
            detector_score = 0.0
            evidence_msg = "No significant content alteration, overpainting, or defacement detected."
            evidence_sev = "LOW"

        # ── 5. Debug Visualization ────────────────────────────────────────────────
        debug_vis_path = None
        if save_debug and debug_dir:
            os.makedirs(debug_dir, exist_ok=True)
            vis_bgr = cv2.cvtColor(working_image_rgb.copy(), cv2.COLOR_RGB2BGR)
            for rr in raw_regions:
                rx, ry, rw, rh = rr["box"]
                cv2.rectangle(vis_bgr, (rx, ry), (rx + rw, ry + rh), (0, 0, 255), 2)
                cv2.putText(vis_bgr, f"Alteration {rr['score']:.2f}", (rx, ry - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
            debug_vis_path = os.path.join(debug_dir, "document_content_alteration.jpg")
            cv2.imwrite(debug_vis_path, vis_bgr)
            cv2.imwrite(os.path.join(debug_dir, "content_alteration_mask.png"), linked_mask * 255)

        return ForensicSignal(
            name="content_alteration",
            score=detector_score,
            confidence=0.90 if suspicious_regions else 0.95,
            regions=suspicious_regions,
            evidence=[{"message": evidence_msg, "severity": evidence_sev}],
            available=True,
            statistics={
                "candidate_regions": float(num_labels - 1),
                "detected_alterations": float(len(suspicious_regions)),
                "max_region_score": detector_score
            },
            heatmap_path=debug_vis_path,
            map_path=debug_vis_path
        )

    except Exception as exc:
        return ForensicSignal(
            name="content_alteration",
            score=0.0,
            confidence=0.0,
            regions=[],
            evidence=[{"message": f"Content alteration detector failed: {str(exc)}", "severity": "LOW"}],
            available=False
        )
