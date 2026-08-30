"""
Phase 8 — Evidence Fusion Engine: Region Fusion
================================================
Handles bounding-box IoU computation and per-region signal attribution.

For each Phase-7 localised region the engine determines which raw detector
regions overlap it (IoU >= REGION_IOU_THRESHOLD) and records the per-signal
score contribution.  This produces the signal attribution needed for
FusedRegion.supporting_signals and FusedRegion.signal_scores.
"""

from __future__ import annotations
from typing import Optional
from image_tampering.schemas.forensic import SuspiciousRegion, FusedRegion
from image_tampering.fusion.config import (
    REGION_IOU_THRESHOLD,
    EVIDENCE_STRENGTH_THRESHOLDS,
    COPY_MOVE_STRENGTH_MINIMUM,
)
from image_tampering.fusion.normalizer import normalize_score, SCORE_NORMALIZATION_CAPS


# ── IoU helper ────────────────────────────────────────────────────────────────

def compute_iou(box1: tuple[int, int, int, int],
                box2: tuple[int, int, int, int]) -> float:
    """
    Standard Intersection-over-Union for two (x, y, w, h) bounding boxes.
    Returns 0.0 if boxes do not overlap.
    """
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2

    ix1 = max(x1, x2)
    iy1 = max(y1, y2)
    ix2 = min(x1 + w1, x2 + w2)
    iy2 = min(y1 + h1, y2 + h2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    inter = (ix2 - ix1) * (iy2 - iy1)
    union = w1 * h1 + w2 * h2 - inter
    return float(inter / union) if union > 0 else 0.0


# ── Signal attribution ────────────────────────────────────────────────────────

def attribute_signals_to_region(
    loc_region: SuspiciousRegion,
    raw_signal_regions_map: dict[str, list[SuspiciousRegion]],
    iou_threshold: float = REGION_IOU_THRESHOLD,
) -> dict[str, float]:
    """
    For one Phase-7 localised region find which raw detector regions overlap
    using IoU >= iou_threshold.

    Returns a dict mapping detector key → highest overlapping region score
    e.g. {"ela": 0.68, "noise": 0.61}
    """
    supporting: dict[str, float] = {}
    loc_box = (loc_region.x, loc_region.y, loc_region.width, loc_region.height)

    for signal_name, signal_regions in raw_signal_regions_map.items():
        for sr in signal_regions:
            sr_box = (sr.x, sr.y, sr.width, sr.height)
            iou = compute_iou(loc_box, sr_box)
            if iou >= iou_threshold:
                # Keep the max score among all overlapping regions for this signal
                current = supporting.get(signal_name, 0.0)
                supporting[signal_name] = max(current, sr.score)

    return supporting


# ── Evidence strength ─────────────────────────────────────────────────────────

def get_evidence_strength(supporting_signals: list[str]) -> str:
    """
    Calculate evidence strength from the number of independent supporting signals.

    Special rule: copy_move alone is elevated to COPY_MOVE_STRENGTH_MINIMUM
    because its geometric precision makes it highly reliable evidence.
    """
    n = len(supporting_signals)
    has_copy_move = "copy_move" in supporting_signals

    for strength, min_count in EVIDENCE_STRENGTH_THRESHOLDS:
        if n >= min_count:
            result = strength
            break
    else:
        result = "NONE"

    # Elevate copy-move lone-signal to MODERATE minimum
    if has_copy_move and result == "WEAK":
        result = COPY_MOVE_STRENGTH_MINIMUM

    return result


# ── Build FusedRegion objects ─────────────────────────────────────────────────

def build_fused_regions(
    localised_regions: list[SuspiciousRegion],
    raw_signal_regions_map: dict[str, list[SuspiciousRegion]],
    iou_threshold: float = REGION_IOU_THRESHOLD,
    page: int = 1,
) -> list[FusedRegion]:
    """
    Convert Phase-7 localised regions into Phase-8 FusedRegion objects by
    attributing which raw detector regions contributed to each one.
    """
    fused: list[FusedRegion] = []

    for idx, loc in enumerate(localised_regions):
        region_id = f"R{idx + 1:03d}"

        # Attribute detector signals via IoU
        attribution = attribute_signals_to_region(loc, raw_signal_regions_map, iou_threshold)

        # Normalise per-signal scores to 0-100
        signal_scores: dict[str, int] = {}
        for sig_key, raw_score in attribution.items():
            cap = SCORE_NORMALIZATION_CAPS.get(sig_key, 1.0)
            norm = normalize_score(raw_score, cap)
            if norm is not None:
                signal_scores[sig_key.upper()] = norm  # uppercase for JSON display

        supporting_signals = [k.upper() for k in attribution.keys()]
        evidence_strength = get_evidence_strength(list(attribution.keys()))

        # Bounding box dict
        bbox: dict[str, int] = {
            "x": loc.x,
            "y": loc.y,
            "width": loc.width,
            "height": loc.height,
        }

        # Copy-move target box (if present)
        target_bbox: Optional[dict[str, int]] = None
        if loc.target_x is not None:
            target_bbox = {
                "x": loc.target_x,
                "y": loc.target_y,
                "width": loc.target_width,
                "height": loc.target_height,
            }

        # Build human-readable reason
        reason = _build_region_reason(supporting_signals, evidence_strength, loc.severity)

        fused.append(FusedRegion(
            region_id=region_id,
            page=page,
            bbox=bbox,
            severity=loc.severity,
            evidence_strength=evidence_strength,
            evidence_count=len(supporting_signals),
            supporting_signals=supporting_signals,
            signal_scores=signal_scores,
            reason=reason,
            target_bbox=target_bbox,
        ))

    return fused


def _build_region_reason(
    supporting_signals: list[str],
    evidence_strength: str,
    severity: str,
) -> str:
    n = len(supporting_signals)
    if n == 0:
        return "Low-level forensic indicator; no multi-signal corroboration."
    if n == 1:
        sig = supporting_signals[0]
        return f"Single forensic indicator ({sig}) flags this region as suspicious."
    sigs_str = ", ".join(supporting_signals[:-1]) + f" and {supporting_signals[-1]}"
    return (
        f"{n} independent forensic signals ({sigs_str}) overlap in this region — "
        f"{evidence_strength.lower()} evidence of tampering."
    )
