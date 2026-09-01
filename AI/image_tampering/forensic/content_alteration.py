"""
Forensic Content Alteration & Digital Defacement Detector
==========================================================
Analyzes documents and images for generalized localized content alterations, including:
- Digital brush and pen defacements / scribbles / marks
- Overpainted, recolored, or synthetic color strokes covering document content
- Inpainted, erased, or artificially smoothed patches (noise & texture voids)
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


def _is_qr_or_barcode(gray_roi: np.ndarray, w: int, h: int, fill_ratio: float = 1.0) -> bool:
    """Check if region is a legitimate monochrome 2D QR code or dense barcode."""
    if w < 40 or h < 40 or fill_ratio < 0.70:
        return False
    aspect = max(w, h) / (min(w, h) + 1e-5)
    if aspect > 1.25:
        return False
    edges = cv2.Canny(gray_roi, 50, 150)
    edge_density = float(np.sum(edges > 0) / (w * h) * 1000)
    std_val = float(np.std(gray_roi))
    mean_val = float(np.mean(gray_roi))
    binary_fraction = float(np.sum((gray_roi < 75) | (gray_roi > 180)) / gray_roi.size)
    return edge_density > 120 and std_val > 55 and binary_fraction > 0.65 and 80 < mean_val < 190


def _is_thin_rule_or_banner(w: int, h: int, img_w: int, img_h: int) -> bool:
    """Check if region is a standard 1D rule line or full-width document banner."""
    aspect = max(w, h) / (min(w, h) + 1e-5)
    if aspect > 8.0 and (w < 14 or h < 14):
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
    and inpainting/erasure anomalies across images and rendered PDF pages.
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

        # ── 3. Color Space Channels & Substrate Modeling ─────────────────────────
        sat = hsv[:, :, 1].astype(np.float32)
        val = hsv[:, :, 2].astype(np.float32)
        hue = hsv[:, :, 0].astype(np.float32)

        r = working_image_rgb[:, :, 0].astype(np.float32)
        g = working_image_rgb[:, :, 1].astype(np.float32)
        b = working_image_rgb[:, :, 2].astype(np.float32)

        # ── 4. Candidate Anomaly Extraction ──────────────────────────────────────
        # A. Pure Synthetic Digital Brush Strokes (Blue, Green, Magenta, Red pens / highlighters)
        is_digital_blue = ((b - r > 45) & (b - g > 25) & (sat > 110) & (val > 40))
        is_digital_green = ((g - r > 45) & (g - b > 45) & (sat > 110) & (val > 40))
        is_digital_magenta = ((r > 120) & (b > 120) & (r - g > 45) & (b - g > 45) & (sat > 110) & (val > 40))
        is_digital_red = ((r > 160) & (r - g > 75) & (r - b > 75) & (sat > 140) & (val > 40))

        # B. Foreign Hue Discontinuity on Tinted / Colored Substrates (e.g. Yellow passport substrate)
        colored_mask = (sat > 35.0) & (val > 30.0)
        is_foreign_hue = np.zeros((img_h, img_w), dtype=bool)
        if np.sum(colored_mask) > 0.25 * total_pixels:
            dom_hue = float(np.median(hue[colored_mask]))
            hue_diff = np.abs(hue - dom_hue)
            hue_diff = np.minimum(hue_diff, 180.0 - hue_diff)
            is_foreign_hue = (hue_diff > 35.0) & (sat > 45.0) & (val > 35.0)

        # Combine candidates
        stroke_cand = is_digital_blue | is_digital_green | is_digital_magenta | is_digital_red | is_foreign_hue

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
            if area < 350 or area > 0.40 * total_pixels:
                continue

            # Filter standard 1D rules and full banners
            if _is_thin_rule_or_banner(bw, bh, img_w, img_h):
                continue

            # Filter large full-page document boundary frames
            if bw > 0.85 * img_w and bh > 0.85 * img_h:
                continue

            # Filter single-line header text (low height, wide aspect ratio)
            aspect = max(bw, bh) / (min(bw, bh) + 1e-5)
            if (bw < 45 or bh < 40) and aspect > 2.0:
                continue

            roi_mask = (labels[by:by+bh, bx:bx+bw] == lbl)
            fill_ratio = float(np.sum(roi_mask) / (bw * bh))

            # Filter legitimate 2D QR codes
            roi_gray_crop = grayscale[by:by+bh, bx:bx+bw]
            if _is_qr_or_barcode(roi_gray_crop, bw, bh, fill_ratio):
                continue

            # Pre-printed solid rectangular blocks (colored headers, buttons, photos)
            if fill_ratio > 0.75 and bw > 60 and bh > 60:
                continue

            # Perimeter and thinness / curvature
            contours, _ = cv2.findContours(roi_mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                continue
            peri = cv2.arcLength(contours[0], True)
            thinness = float((peri**2) / (area + 1e-5))

            # Contextual surrounding background analysis (13x13 context ring)
            k_surround = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 13))
            dilated = cv2.dilate(roi_mask.astype(np.uint8), k_surround)
            surround_ring = (dilated > 0) & (~roi_mask)

            roi_gray = grayscale[by:by+bh, bx:bx+bw]
            surround_gray = roi_gray[surround_ring]
            if surround_gray.size < 25:
                continue

            surround_std = float(np.std(surround_gray))
            surround_min = float(np.min(surround_gray))
            surround_max = float(np.max(surround_gray))
            surround_dynamic_range = surround_max - surround_min

            # Local ELA on stroke pixels
            roi_ela = diff_gray[by:by+bh, bx:bx+bw][roi_mask]
            stroke_ela_max = float(np.max(roi_ela)) if roi_ela.size > 0 else 0.0

            # ── Attack Detection Conditions ───────────────────────────────────────
            # 1. Freehand digital stroke defacement / scribble (high perimeter-to-area curvature ratio crossing document content):
            is_stroke_defacement = (
                bw >= 50 and bh >= 40 and area >= 600 and
                thinness >= 75.0 and surround_std >= 30.0 and
                surround_dynamic_range >= 70.0 and fill_ratio <= 0.65 and
                (stroke_ela_max >= 22.0 or thinness >= 150.0)
            )

            # 2. Localized content alteration / text overpainting (synthetic brush crossing heterogenous text/photo fields):
            is_localized_scribble = (
                bw >= 40 and bh >= 40 and area >= 550 and
                thinness >= 60.0 and surround_std >= 45.0 and
                surround_dynamic_range >= 95.0 and
                (stroke_ela_max >= 25.0 or thinness >= 120.0)
            )

            if is_stroke_defacement or is_localized_scribble:
                reg_score = float(min(0.85 + 0.001 * thinness + 0.05 * (stroke_ela_max > 40.0), 0.98))

                # Coordinate mapping
                if coordinate_mapper:
                    orig_x = int(round(bx / coordinate_mapper.scale_x))
                    orig_y = int(round(by / coordinate_mapper.scale_y))
                    orig_w = int(round(bw / coordinate_mapper.scale_x))
                    orig_h = int(round(bh / coordinate_mapper.scale_y))
                else:
                    orig_x, orig_y, orig_w, orig_h = bx, by, bw, bh

                sev = "HIGH" if reg_score >= 0.70 else "MEDIUM"
                reason_type = "digital brush defacement / stroke" if is_stroke_defacement else "content overpainting / alteration anomaly"
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
