"""
Phase 8 — forensic/fusion.py
==============================
Thin delegation layer that keeps the existing pipeline.py call signature intact
while routing to the real Phase-8 Evidence Fusion Engine.

Two public functions:

  fuse_signals(signals)              → FusionResult  (basic, no regions needed)
  fuse_signals_full(signals, regions) → FusionResult  (full Phase-8 output)

pipeline.py calls fuse_signals_full() after Phase-7 localisation so the
FusionResult.evidence field is populated with the complete FusionEvidence.
"""

from __future__ import annotations
from typing import Optional

from image_tampering.schemas.forensic import (
    FusionResult,
    FusionEvidence,
    Signals,
    SuspiciousRegion,
)
from image_tampering.fusion.engine import fuse as _fuse_engine
from image_tampering.fusion.config import WEIGHTS, REGION_IOU_THRESHOLD


def fuse_signals(signals: Signals) -> FusionResult:
    """
    Legacy / minimal wrapper — returns a FusionResult with score and risk_level
    but WITHOUT region attribution (localised_regions not yet available at this
    call site in the old pipeline order).

    Kept for backward compatibility; prefer fuse_signals_full() in new code.
    """
    # Run the engine with an empty region list — still gives a valid overall score
    evidence: FusionEvidence = _fuse_engine(
        signals=signals,
        localised_regions=[],
    )
    return FusionResult(
        score=evidence.overall_score / 100.0,
        confidence=None,
        risk_level=evidence.overall_level,
        evidence=evidence,
    )


def fuse_signals_full(
    signals: Signals,
    localised_regions: list[SuspiciousRegion],
    iou_threshold: float = REGION_IOU_THRESHOLD,
    weights: dict = WEIGHTS,
    page: int = 1,
) -> FusionResult:
    """
    Full Phase-8 fusion with region attribution.

    Called by pipeline.py AFTER localize_suspicious_regions() so that the
    engine can attribute detector signals to every merged region via IoU.
    """
    evidence: FusionEvidence = _fuse_engine(
        signals=signals,
        localised_regions=localised_regions,
        iou_threshold=iou_threshold,
        weights=weights,
        page=page,
    )
    return FusionResult(
        score=evidence.overall_score / 100.0,
        confidence=None,       # reserved for Phase 9 ML classifier
        risk_level=evidence.overall_level,
        evidence=evidence,
    )
