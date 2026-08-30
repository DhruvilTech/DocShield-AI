"""
Phase 8 — Evidence Fusion Engine: Score Fusion
===============================================
Weighted combination of normalised detector scores plus a spatially-
corroborated region bonus to produce the final 0-100 tampering evidence score.

Key design properties:
  • Missing detectors do NOT contribute to the score (weight is redistributed
    among available detectors); they are not silently treated as 0.
  • The region bonus (10% weight by default) rewards multi-signal spatial
    overlap and is computed independently from detector-level scores.
  • Conflict detection flags cases where metadata and image-based signals
    strongly disagree, rather than averaging them into a misleading number.
"""

from __future__ import annotations
from typing import Optional, Any
from image_tampering.fusion.config import (
    WEIGHTS,
    RISK_LEVEL_THRESHOLDS,
    CONFLICT_METADATA_HIGH,
    CONFLICT_IMAGE_LOW,
    CONFLICT_IMAGE_HIGH,
    CONFLICT_METADATA_CLEAN,
    REGION_BONUS_PER_STRONG,
    REGION_BONUS_PER_MODERATE,
    REGION_BONUS_SIGNAL_FRAC,
)


# ── Region bonus ──────────────────────────────────────────────────────────────

def compute_region_bonus_score(fused_regions: list) -> int:
    """
    Derive a 0-100 bonus score from spatially-corroborated region evidence.

    Formula:
        bonus = min(STRONG_count × PER_STRONG, 60)
              + min(MODERATE_count × PER_MODERATE, 30)
        bonus = max(bonus, max_signal_score × SIGNAL_FRAC)
    """
    if not fused_regions:
        return 0

    strong_count   = sum(1 for r in fused_regions if r.evidence_strength == "STRONG")
    moderate_count = sum(1 for r in fused_regions if r.evidence_strength == "MODERATE")

    # Collect all per-region signal scores for the floor calculation
    all_sig_scores: list[int] = []
    for r in fused_regions:
        if r.signal_scores:
            all_sig_scores.extend(r.signal_scores.values())
    max_sig = max(all_sig_scores) if all_sig_scores else 0

    score  = min(strong_count   * REGION_BONUS_PER_STRONG,   60)
    score += min(moderate_count * REGION_BONUS_PER_MODERATE, 30)
    score  = max(score, int(max_sig * REGION_BONUS_SIGNAL_FRAC))

    return min(score, 100)


# ── Main weighted score ───────────────────────────────────────────────────────

def compute_overall_score(
    normalised_scores: dict[str, Optional[int]],
    region_bonus_score: int,
    weights: dict[str, float] = WEIGHTS,
) -> int:
    """
    Weighted combination of available detector scores and a region bonus.

    Unavailable detectors (score=None) are excluded; the remaining weights
    are renormalised so missing detectors don't suppress the result.

    Final formula:
        detector_fraction = 1 - weights["region"]
        score = detector_fraction × Σ(w_i / Σw_avail × normed_i)
              + weights["region"] × region_bonus
    """
    detector_keys = ["ela", "noise", "copy_move", "stamp", "metadata"]
    region_w = weights.get("region", 0.10)

    total_det_weight  = 0.0
    weighted_det_sum  = 0.0

    for key in detector_keys:
        score = normalised_scores.get(key)
        if score is not None:               # only available detectors contribute
            w = weights.get(key, 0.0)
            total_det_weight += w
            weighted_det_sum += w * score

    if total_det_weight > 0:
        detector_score = weighted_det_sum / total_det_weight
    else:
        detector_score = 0.0

    # Blend detector score and region bonus
    combined = (1.0 - region_w) * detector_score + region_w * region_bonus_score
    return int(min(max(combined, 0.0), 100.0))


# ── Risk level ────────────────────────────────────────────────────────────────

def risk_level_from_score(
    score: int,
    thresholds: list[tuple[str, int]] = RISK_LEVEL_THRESHOLDS,
) -> str:
    """Return the highest risk level whose min_score <= score."""
    for level, min_score in thresholds:   # thresholds are ordered highest first
        if score >= min_score:
            return level
    return "LOW"


# ── Conflict detection ────────────────────────────────────────────────────────

def detect_conflict(
    normalised_scores: dict[str, Optional[int]],
) -> tuple[bool, Optional[str]]:
    """
    Detect when metadata and image-based detectors strongly disagree.
    Returns (conflict_detected: bool, explanation: str | None).
    """
    image_keys = ["ela", "noise", "copy_move", "stamp"]
    image_scores = [
        normalised_scores[k]
        for k in image_keys
        if normalised_scores.get(k) is not None
    ]
    metadata_score = normalised_scores.get("metadata")

    if not image_scores:
        return False, None

    avg_image = sum(image_scores) / len(image_scores)

    if metadata_score is not None:
        if metadata_score >= CONFLICT_METADATA_HIGH and avg_image < CONFLICT_IMAGE_LOW:
            return True, (
                "Metadata indicates prior image processing, but image-based forensic "
                "detectors found limited supporting evidence. Manual review recommended."
            )
        if avg_image >= CONFLICT_IMAGE_HIGH and metadata_score < CONFLICT_METADATA_CLEAN:
            return True, (
                "Strong image-forensic evidence was detected, but metadata appears clean. "
                "This may indicate metadata was stripped or edited after tampering."
            )

    return False, None
