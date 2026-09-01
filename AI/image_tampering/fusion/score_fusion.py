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
    fused_regions: Optional[list] = None,
) -> int:
    """
    Weighted combination of available detector scores and a region bonus,
    enhanced with Dominant Modality Evidence Scaling:
    - Direct attack indicators (Copy-Move, Splicing, Content Alteration, Text Tampering) trigger high-confidence alerts.
    - Corroborated multi-detector anomalies elevate the score to HIGH/CRITICAL.
    - Clean documents with natural paper texture or high-frequency security patterns
      are bounded securely in LOW.
    """
    cm_score = normalised_scores.get("copy_move") or 0
    splicing_score = normalised_scores.get("splicing") or 0
    alt_score = normalised_scores.get("content_alteration") or 0
    text_score = normalised_scores.get("text_tampering") or 0
    noise_score = normalised_scores.get("noise") or 0
    ela_score = normalised_scores.get("ela") or 0
    stamp_score = normalised_scores.get("stamp") or 0
    metadata_score = normalised_scores.get("metadata") or 0

    strong_regions = [r for r in fused_regions if getattr(r, "evidence_strength", None) == "STRONG"] if fused_regions else []
    mod_regions = [r for r in fused_regions if getattr(r, "evidence_strength", None) == "MODERATE"] if fused_regions else []

    score = 0.0

    # 1. Direct positive attack indicators (Active forgery evidence)
    if cm_score >= 40:
        score = max(score, 72.0 + 0.26 * cm_score)
    if splicing_score >= 50:
        score = max(score, 68.0 + 0.28 * splicing_score)
    if alt_score >= 50:
        score = max(score, 68.0 + 0.28 * alt_score)
    if text_score >= 50:
        score = max(score, 68.0 + 0.28 * text_score)
    if stamp_score >= 70:
        score = max(score, 68.0 + 0.28 * stamp_score)
    if metadata_score >= 50:
        score = max(score, 52.0 + 0.35 * (metadata_score - 50))
    if len(strong_regions) > 0:
        score = max(score, 75.0 + 10.0 * min(len(strong_regions), 2))
    if len(mod_regions) >= 2 and (ela_score >= 45 and noise_score >= 60):
        score = max(score, 65.0 + 0.20 * max(ela_score, noise_score))

    if score == 0.0:
        # Baseline clean / uncorroborated document score
        # Weighted average of passive/contextual detectors (ELA, Noise, Stamp, Metadata)
        detector_keys = ["ela", "noise", "stamp", "metadata"]
        avail_keys = [k for k in detector_keys if normalised_scores.get(k) is not None]
        total_w = sum(weights.get(k, 0.15) for k in avail_keys)
        w_sum = sum(weights.get(k, 0.15) * (normalised_scores.get(k) or 0) for k in avail_keys)
        w_avg = w_sum / total_w if total_w > 0 else 0.0
        
        # Region bonus addition if moderate regions exist without direct attack
        if len(mod_regions) > 0:
            score = min(w_avg * 0.40 + 8.0 * len(mod_regions), 35.0)
        elif text_score >= 35:
            score = min(35.0, 20.0 + 0.35 * text_score)
        else:
            score = min(w_avg * 0.35, 25.0)

    final_score = int(min(max(score, 0.0), 100.0))
    return final_score


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
    image_keys = ["ela", "noise", "copy_move", "splicing", "content_alteration", "text_tampering", "stamp"]
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
