"""
Phase 8 — Evidence Fusion Engine: Main Orchestrator
====================================================
`fuse(signals, localised_regions)` is the single public entry point.

It:
  1. Normalises all detector scores to 0-100.
  2. Attributes detector signals to each Phase-7 localised region via IoU.
  3. Computes the region bonus score from spatially-corroborated evidence.
  4. Combines detector scores + region bonus using weighted fusion.
  5. Detects evidence conflicts.
  6. Generates human-readable explanations.
  7. Returns a FusionEvidence object.

NOTE: This module NEVER touches Phases 1-7 code; it only reads their outputs.
"""

from __future__ import annotations
import logging
from typing import Optional

from image_tampering.schemas.forensic import (
    Signals,
    SuspiciousRegion,
    FusionEvidence,
)
from image_tampering.fusion.normalizer   import normalize_all_signals
from image_tampering.fusion.region_fusion import build_fused_regions
from image_tampering.fusion.score_fusion  import (
    compute_region_bonus_score,
    compute_overall_score,
    risk_level_from_score,
    detect_conflict,
)
from image_tampering.fusion.explanation_engine import generate_explanations
from image_tampering.fusion.config import WEIGHTS, REGION_IOU_THRESHOLD

logger = logging.getLogger(__name__)


def fuse(
    signals: Signals,
    localised_regions: list[SuspiciousRegion],
    iou_threshold: float = REGION_IOU_THRESHOLD,
    weights: dict[str, float] = WEIGHTS,
    page: int = 1,
) -> FusionEvidence:
    """
    Run the full Phase 8 Evidence Fusion pipeline.

    Parameters
    ----------
    signals            Phase-7 Signals container with all detector outputs.
    localised_regions  Phase-7 merged suspicious regions.
    iou_threshold      IoU threshold for region → detector attribution (default from config).
    weights            Detector weights dict (default from config).
    page               Page number for output (1 for single-image inputs).

    Returns
    -------
    FusionEvidence with overall score, fused regions, and explanations.
    """
    logger.info("[PHASE 8] Evidence Fusion Started")

    # ── Step 1: Normalise detector scores ────────────────────────────────────
    normalised_map, available, unavailable = normalize_all_signals(signals)

    normalised_scores: dict[str, Optional[int]] = {
        key: info.get("normalized_score")
        for key, info in normalised_map.items()
    }

    for key in available:
        s = normalised_scores[key]
        logger.info("[%s] Normalised score: %s", key.upper(), s)
    for key in unavailable:
        logger.info("[%s] UNAVAILABLE", key.upper())

    # ── Step 2: Build raw signal-region map for IoU attribution ──────────────
    raw_signal_regions_map: dict[str, list[SuspiciousRegion]] = {}
    _detector_attrs = {
        "ela":                signals.ela,
        "noise":              signals.noise,
        "copy_move":          signals.copy_move,
        "splicing":           signals.splicing,
        "content_alteration": getattr(signals, "content_alteration", None),
        "text_tampering":     getattr(signals, "text_tampering", None),
        "stamp":              signals.stamp,
        "metadata":           signals.metadata,
    }
    for key, sig in _detector_attrs.items():
        if sig and sig.available and sig.regions:
            raw_signal_regions_map[key] = sig.regions

    # ── Step 3: Attribute regions & build FusedRegion list ───────────────────
    logger.info("[REGION FUSION] Attributing signals to %d localised regions…",
                len(localised_regions))

    fused_regions = build_fused_regions(
        localised_regions,
        raw_signal_regions_map,
        iou_threshold=iou_threshold,
        page=page,
    )

    for fr in fused_regions:
        logger.info(
            "[%s] Signals: %s | Strength: %s | Severity: %s",
            fr.region_id,
            "+".join(fr.supporting_signals) or "none",
            fr.evidence_strength,
            fr.severity,
        )

    # ── Step 4: Region bonus score ────────────────────────────────────────────
    region_bonus = compute_region_bonus_score(fused_regions)
    logger.info("[REGION BONUS] Score: %d", region_bonus)

    # ── Step 5: Weighted overall score ────────────────────────────────────────
    overall_score = compute_overall_score(normalised_scores, region_bonus, weights, fused_regions=fused_regions)
    overall_level = risk_level_from_score(overall_score)

    logger.info("[FUSION] Overall tampering evidence score: %d → %s",
                overall_score, overall_level)

    # ── Step 6: Conflict detection ────────────────────────────────────────────
    conflict_detected, conflict_note = detect_conflict(normalised_scores)
    if conflict_detected:
        logger.warning("[CONFLICT] %s", conflict_note)

    # ── Step 7: Human-readable explanations ──────────────────────────────────
    explanations = generate_explanations(
        normalised_scores=normalised_scores,
        fused_regions=fused_regions,
        conflict_detected=conflict_detected,
        conflict_note=conflict_note,
        overall_score=overall_score,
        overall_level=overall_level,
    )

    # ── Assemble FusionEvidence ───────────────────────────────────────────────
    return FusionEvidence(
        overall_score=overall_score,
        overall_level=overall_level,
        signals={key: normalised_map[key] for key in normalised_map},
        fused_regions=fused_regions,
        explanations=explanations,
        detectors_available=available,
        detectors_unavailable=unavailable,
        conflict_detected=conflict_detected,
        conflict_note=conflict_note,
    )
