"""
Forensic Text Tampering & Modification Detector
===============================================
Analyzes document images and rendered PDF pages for generalized, reference-free
digital text tampering, including:
- Edited, replaced, or altered digits / characters (e.g. 2025 -> 2026, 123456 -> 123856)
- Newly inserted or superimposed text lines / phrases
- Erased and rewritten text (background reconstruction & texture/noise voids)
- Inpainted, overpainted, or smoothed background patches around text
- Rendering inconsistencies (edge sharpness, antialiasing profile, stroke gradient)
- Local noise and ELA compression disparities relative to surrounding context

CRITICAL DESIGN PRINCIPLE:
NO ORIGINAL / REFERENCE DOCUMENT IS REQUIRED.
Detection relies entirely on intrinsic forensic anomalies and contextual relative
comparisons across the document substrate.
"""

from __future__ import annotations
import os
import cv2
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from PIL import Image
import io

from image_tampering.schemas.forensic import ForensicSignal, SuspiciousRegion
from image_tampering.forensic.preprocessing import CoordinateMapper


# ── False Positive Suppression Helpers ────────────────────────────────────────

def _is_barcode_or_qr(gray_roi: np.ndarray, w: int, h: int) -> bool:
    """Check if a region is a legitimate 2D QR code or dense barcode."""
    if w < 30 or h < 30:
        return False
    aspect = max(w, h) / (min(w, h) + 1e-5)
    if aspect > 1.3:
        return False
    edges = cv2.Canny(gray_roi, 50, 150)
    edge_density = float(np.sum(edges > 0) / (w * h) * 1000)
    std_val = float(np.std(gray_roi))
    mean_val = float(np.mean(gray_roi))
    binary_fraction = float(np.sum((gray_roi < 75) | (gray_roi > 180)) / gray_roi.size)
    return edge_density > 110 and std_val > 50 and binary_fraction > 0.60 and (70 < mean_val < 200)


def _is_table_rule_or_border(w: int, h: int, img_w: int, img_h: int) -> bool:
    """Check if region is a thin table rule, line separator, or full-width document banner."""
    aspect = max(w, h) / (min(w, h) + 1e-5)
    if aspect > 8.0 and (w < 12 or h < 12):
        return True
    if w > 0.85 * img_w and h < 45:
        return True
    if h > 0.85 * img_h and w < 45:
        return True
    return False


# ── Text Candidate Localization ───────────────────────────────────────────────

def _extract_text_candidates(
    gray: np.ndarray,
    hsv: np.ndarray,
    img_w: int,
    img_h: int
) -> List[Tuple[int, int, int, int]]:
    """
    Extract candidate text glyph and word bounding boxes using gradient and morphological profiling.
    Filters out colored stamps and graphical elements.
    """
    grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = cv2.magnitude(grad_x, grad_y)
    grad_norm = cv2.normalize(grad_mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    _, binary = cv2.threshold(grad_norm, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 2))
    connected = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(connected, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    sat = hsv[:, :, 1]
    candidates = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        
        if w < 6 or h < 6:
            continue
        if w > 0.95 * img_w or h > 0.50 * img_h:
            continue
        if w * h < 35 or w * h > 0.25 * img_w * img_h:
            continue
        if _is_table_rule_or_border(w, h, img_w, img_h):
            continue

        roi_gray = gray[y:y+h, x:x+w]
        if roi_gray.size == 0 or _is_barcode_or_qr(roi_gray, w, h):
            continue

        # Stamp / high chroma filter (stamps belong to stamp detector, not text tampering)
        roi_sat = sat[y:y+h, x:x+w]
        if roi_sat.size > 0 and (float(np.mean(roi_sat)) > 45.0 or float(np.max(roi_sat)) > 190.0):
            continue

        candidates.append((x, y, w, h))

    return candidates


# ── Core Text Tampering Analysis Engine ───────────────────────────────────────

def analyze_text_tampering(
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
    Analyzes document text regions for intrinsic forensic signs of alteration,
    insertion, erasure, or replacement without requiring a reference copy.
    """
    try:
        img_h, img_w = working_image_rgb.shape[:2]
        total_pixels = img_h * img_w

        # ── 1. Document Substrate Noise Modeling ──────────────────────────────
        # Build global stroke-free substrate background mask to isolate authentic paper / sensor noise
        _, doc_stroke = cv2.threshold(grayscale, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        k_dilate = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        doc_dilated_stroke = cv2.dilate(doc_stroke, k_dilate)
        doc_bg_mask = (grayscale > 180) & (doc_dilated_stroke == 0)

        if np.sum(doc_bg_mask) > 500:
            doc_bg_noise_std = float(np.std(noise_residual[doc_bg_mask]))
        else:
            doc_bg_noise_std = float(np.std(noise_residual))
        doc_bg_noise_std = max(0.1, doc_bg_noise_std)

        # ── 2. Local ELA Compression Error Map ────────────────────────────────
        buf = io.BytesIO()
        Image.fromarray(working_image_rgb).save(buf, "JPEG", quality=95)
        resaved = np.array(Image.open(buf))
        ela_diff = cv2.absdiff(working_image_rgb, resaved).astype(np.float32)
        ela_gray = np.max(ela_diff, axis=2)
        doc_median_ela = float(np.median(ela_gray)) + 1e-5

        # ── 3. High-Frequency Edge / Sharpness Map ───────────────────────────
        laplacian = cv2.Laplacian(grayscale, cv2.CV_32F, ksize=3)
        local_sharpness = np.abs(laplacian)

        # ── 4. Candidate Text Localization ────────────────────────────────────
        candidates = _extract_text_candidates(grayscale, hsv, img_w, img_h)

        if not candidates:
            return ForensicSignal(
                name="text_tampering",
                score=0.0,
                confidence=0.90,
                regions=[],
                evidence=[],
                available=True,
                statistics={"candidates_analyzed": 0, "anomalous_regions": 0}
            )

        # ── 5. Feature Extraction across Candidates ───────────────────────────
        candidate_features = []
        for (cx, cy, cw, ch) in candidates:
            roi_gray = grayscale[cy:cy+ch, cx:cx+cw]
            roi_ela = ela_gray[cy:cy+ch, cx:cx+cw]
            roi_sharp = local_sharpness[cy:cy+ch, cx:cx+cw]
            roi_noise_res = noise_residual[cy:cy+ch, cx:cx+cw]

            # Binary mask of text strokes vs local background
            _, stroke_mask = cv2.threshold(roi_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            bg_mask = cv2.bitwise_not(stroke_mask)

            # Feature A: High-frequency background noise std inside and around candidate (excluding stroke edges)
            pad = 6
            x0, y0 = max(0, cx - pad), max(0, cy - pad)
            x1, y1 = min(img_w, cx + cw + pad), min(img_h, cy + ch + pad)
            ctx_bg_mask = doc_bg_mask[y0:y1, x0:x1]
            ctx_noise = noise_residual[y0:y1, x0:x1]

            if np.sum(ctx_bg_mask) >= 8:
                raw_bg_std = float(np.std(ctx_noise[ctx_bg_mask]))
            elif np.sum(bg_mask > 0) >= 6:
                raw_bg_std = float(np.std(roi_noise_res[bg_mask > 0]))
            else:
                raw_bg_std = float(np.std(roi_noise_res))

            # Feature B: Mean ELA response
            mean_roi_ela = float(np.mean(roi_ela))

            # Feature C: Stroke sharpness
            if np.sum(stroke_mask > 0) >= 4:
                stroke_sharp = float(np.mean(roi_sharp[stroke_mask > 0]))
            else:
                stroke_sharp = float(np.mean(roi_sharp))

            # Feature D: Outer perimeter border gradient (box / patch step)
            border_mask = np.zeros((ch, cw), dtype=np.uint8)
            border_mask[:2, :] = 255; border_mask[-2:, :] = 255
            border_mask[:, :2] = 255; border_mask[:, -2:] = 255
            border_grad = float(np.mean(roi_sharp[border_mask > 0]))

            candidate_features.append({
                "box": (cx, cy, cw, ch),
                "raw_bg_std": raw_bg_std,
                "mean_roi_ela": mean_roi_ela,
                "stroke_sharp": stroke_sharp,
                "border_grad": border_grad,
            })

        # ── 6. Contextual & Baseline Disparity Evaluation ─────────────────────
        all_sharpness = [f["stroke_sharp"] for f in candidate_features]
        med_doc_sharp = float(np.median(all_sharpness)) + 1e-5

        all_ela = [f["mean_roi_ela"] for f in candidate_features]
        med_doc_ela = float(np.median(all_ela)) + 1e-5

        raw_suspicious_boxes = []

        for feat in candidate_features:
            cx, cy, cw, ch = feat["box"]

            # Find neighboring text in the same horizontal text line (within 220px horizontally, 20px vertically)
            neighbors = [
                f for f in candidate_features
                if f != feat and abs(f["box"][1] - cy) < max(20, ch) and abs(f["box"][0] - cx) < 220
            ]

            if neighbors:
                neigh_sharp = float(np.median([f["stroke_sharp"] for f in neighbors])) + 1e-5
                neigh_ela = float(np.median([f["mean_roi_ela"] for f in neighbors])) + 1e-5
            else:
                neigh_sharp = med_doc_sharp
                neigh_ela = med_doc_ela

            # Disparity ratios
            sharp_disparity = abs(feat["stroke_sharp"] - neigh_sharp) / neigh_sharp
            ela_disparity = abs(feat["mean_roi_ela"] - neigh_ela) / neigh_ela

            # Noise void ratio relative to document substrate noise
            if doc_bg_noise_std >= 2.0:
                noise_void = max(0.0, 1.0 - (feat["raw_bg_std"] / doc_bg_noise_std))
            else:
                noise_void = 0.0

            # Score individual cues
            cue_scores = []
            reasons = []
            has_substrate_artifact = False

            # 1. Background Noise Void (Inpainting / Erasure / Pure synthetic background)
            if noise_void >= 0.60 and doc_bg_noise_std >= 2.5:
                s_void = min(1.0, 0.45 + 0.55 * noise_void)
                cue_scores.append(s_void)
                has_substrate_artifact = True
                reasons.append(f"Substrate noise void around text (void: {noise_void*100:.0f}%, local bg std: {feat['raw_bg_std']:.2f} vs doc: {doc_bg_noise_std:.2f})")

            # 2. Local ELA Compression Inconsistency
            if ela_disparity >= 0.70 and (feat["mean_roi_ela"] > 4.0 or neigh_ela > 4.0):
                s_ela = min(1.0, 0.40 + 0.40 * ela_disparity)
                cue_scores.append(s_ela)
                reasons.append(f"Local ELA compression disparity ({ela_disparity:.2f}x relative to neighboring text)")

            # 3. Perimeter Border Gradient (Paste / Whiteout boundary step)
            if feat["border_grad"] > 300.0 and cw >= 8 and ch >= 8:
                s_border = min(1.0, feat["border_grad"] / 600.0)
                cue_scores.append(s_border)
                has_substrate_artifact = True
                reasons.append(f"Paste / erasure perimeter boundary step ({feat['border_grad']:.1f})")

            # 4. Stroke Sharpness / Antialiasing Disparity (only when corroborated)
            if sharp_disparity >= 0.55 and (feat["stroke_sharp"] > 20.0 or neigh_sharp > 20.0):
                s_sharp = min(1.0, 0.35 + 0.45 * sharp_disparity)
                cue_scores.append(s_sharp)
                reasons.append(f"Stroke rendering disparity ({sharp_disparity:.2f}x relative to neighboring text)")

            # Strict Forensic Corroboration:
            # 1. Multi-factor corroboration (at least 2 distinct cues including substrate artifact or strong multi-cue disparity)
            # OR 2. Overwhelming background noise void on authentic noisy document substrate (erasure / inpainting / whiteout box)
            is_corroborated = (len(cue_scores) >= 2 and (has_substrate_artifact or (ela_disparity >= 0.70 and sharp_disparity >= 0.50)))
            is_overwhelming_void = (noise_void >= 0.70 and doc_bg_noise_std >= 2.0)

            if is_corroborated or is_overwhelming_void:
                base_score = float(np.mean(cue_scores)) if cue_scores else 0.50
                if len(cue_scores) >= 2:
                    base_score = min(1.0, base_score + 0.12 * (len(cue_scores) - 1))
                elif is_overwhelming_void:
                    base_score = min(1.0, 0.45 + 0.45 * noise_void)
                
                raw_suspicious_boxes.append({
                    "box": (cx, cy, cw, ch),
                    "score": base_score,
                    "reasons": reasons,
                    "noise_void": noise_void,
                    "ela_disparity": ela_disparity,
                    "sharp_disparity": sharp_disparity
                })

        # ── 7. Cluster & Merge Nearby Anomalous Text Boxes ────────────────────
        suspicious_regions: List[SuspiciousRegion] = []
        evidence_items: List[Dict[str, Any]] = []
        heatmap = np.zeros((img_h, img_w), dtype=np.float32)

        merged_clusters = []
        for item in raw_suspicious_boxes:
            bx, by, bw, bh = item["box"]
            merged = False
            for cluster in merged_clusters:
                cx1, cy1, cw1, ch1 = cluster["box"]
                if abs(by - cy1) < max(bh, ch1) and (bx <= cx1 + cw1 + 25) and (cx1 <= bx + bw + 25):
                    nx1 = min(bx, cx1)
                    ny1 = min(by, cy1)
                    nx2 = max(bx + bw, cx1 + cw1)
                    ny2 = max(by + bh, cy1 + ch1)
                    cluster["box"] = (nx1, ny1, nx2 - nx1, ny2 - ny1)
                    cluster["score"] = max(cluster["score"], item["score"])
                    cluster["items"].append(item)
                    merged = True
                    break
            if not merged:
                merged_clusters.append({
                    "box": (bx, by, bw, bh),
                    "score": item["score"],
                    "items": [item]
                })

        for cluster in merged_clusters:
            cx, cy, cw, ch = cluster["box"]
            reg_score = cluster["score"]
            all_reasons = []
            for it in cluster["items"]:
                for r in it["reasons"]:
                    if r not in all_reasons:
                        all_reasons.append(r)

            sev = "HIGH" if reg_score >= 0.65 else ("MEDIUM" if reg_score >= 0.45 else "LOW")
            heatmap[cy:cy+ch, cx:cx+cw] = np.maximum(heatmap[cy:cy+ch, cx:cx+cw], reg_score)

            if coordinate_mapper:
                orig_x = int(round(cx / coordinate_mapper.scale_x))
                orig_y = int(round(cy / coordinate_mapper.scale_y))
                orig_w = int(round(cw / coordinate_mapper.scale_x))
                orig_h = int(round(ch / coordinate_mapper.scale_y))
            else:
                orig_x, orig_y, orig_w, orig_h = cx, cy, cw, ch

            reason_str = " | ".join(all_reasons)
            suspicious_regions.append(SuspiciousRegion(
                x=orig_x,
                y=orig_y,
                width=orig_w,
                height=orig_h,
                score=reg_score,
                severity=sev,
                source="text_tampering",
                reason=f"[text_tampering] {reason_str}"
            ))

            evidence_items.append({
                "box": (orig_x, orig_y, orig_w, orig_h),
                "score": reg_score,
                "severity": sev,
                "reasons": all_reasons
            })

        # ── 8. Overall Signal Score ───────────────────────────────────────────
        if suspicious_regions:
            suspicious_regions.sort(key=lambda r: r.score, reverse=True)
            top_scores = [r.score for r in suspicious_regions[:3]]
            overall_signal_score = float(top_scores[0] * 0.75 + (np.mean(top_scores) * 0.25 if len(top_scores) > 1 else 0.0))
            overall_signal_score = min(1.0, max(0.0, overall_signal_score))
        else:
            overall_signal_score = 0.0

        # ── 9. Debug Visualizations ───────────────────────────────────────────
        heatmap_path = None
        map_path = None
        if save_debug and debug_dir:
            os.makedirs(debug_dir, exist_ok=True)
            heatmap_norm = np.clip(heatmap * 255.0, 0, 255).astype(np.uint8)
            heatmap_colored = cv2.applyColorMap(heatmap_norm, cv2.COLORMAP_JET)
            working_bgr = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2BGR)
            vis_overlay = cv2.addWeighted(working_bgr, 0.65, heatmap_colored, 0.35, 0)
            for r in suspicious_regions:
                if coordinate_mapper:
                    draw_x = int(round(r.x * coordinate_mapper.scale_x))
                    draw_y = int(round(r.y * coordinate_mapper.scale_y))
                    draw_w = int(round(r.width * coordinate_mapper.scale_x))
                    draw_h = int(round(r.height * coordinate_mapper.scale_y))
                else:
                    draw_x, draw_y, draw_w, draw_h = r.x, r.y, r.width, r.height
                color = (0, 0, 255) if r.severity == "HIGH" else (0, 165, 255)
                cv2.rectangle(vis_overlay, (draw_x, draw_y), (draw_x + draw_w, draw_y + draw_h), color, 2)
                cv2.putText(
                    vis_overlay,
                    f"TEXT_MOD {r.score:.2f}",
                    (draw_x, max(12, draw_y - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.35,
                    color,
                    1
                )
            heatmap_path = os.path.join(debug_dir, "document_text_tampering_heatmap.jpg")
            map_path = os.path.join(debug_dir, "document_text_tampering_map.png")
            cv2.imwrite(heatmap_path, vis_overlay)
            cv2.imwrite(map_path, heatmap_norm)

        return ForensicSignal(
            name="text_tampering",
            score=overall_signal_score,
            confidence=0.90,
            regions=suspicious_regions,
            evidence=evidence_items,
            available=True,
            statistics={
                "candidates_analyzed": len(candidates),
                "anomalous_regions": len(suspicious_regions),
                "max_region_score": max([r.score for r in suspicious_regions], default=0.0)
            },
            heatmap_path=heatmap_path,
            map_path=map_path
        )

    except Exception as exc:
        return ForensicSignal(
            name="text_tampering",
            score=0.0,
            confidence=0.50,
            regions=[],
            evidence=[{"error": str(exc)}],
            available=False
        )
