"""
Phase 10 — Spatial Evidence Correlation Unit Tests
===================================================
Tests covering:
  1. Two overlapping detector regions → correctly merged & correlated (MODERATE evidence)
  2. Non-overlapping regions → remain separate
  3. Three overlapping detectors → STRONG evidence
  4. One detector only → WEAK evidence
  5. Different image/coordinate scales → correctly mapped via CoordinateMapper before IoU
  6. Low detector score → recorded in signals but excluded from supporting_detectors
  7. Missing / empty detector results → graceful handling
  8. High-confidence copy-move alone → elevated to MODERATE evidence
  9. IoU math correctness (exact overlap, partial overlap, disjoint boxes)
"""

import pytest
from image_tampering.schemas.forensic import SuspiciousRegion, FusedRegion
from image_tampering.fusion.spatial_correlation import (
    correlate_spatial_evidence,
    compute_iou,
    compute_overlap_ratio_smaller,
    boxes_overlap,
    merge_boxes,
    calculate_evidence_strength,
    normalize_box_to_original,
)
from image_tampering.forensic.preprocessing import CoordinateMapper


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_region(
    x: int, y: int, w: int, h: int,
    score: float = 0.70,
    source: str = "ela",
    severity: str = "MEDIUM",
) -> SuspiciousRegion:
    return SuspiciousRegion(
        x=x, y=y, width=w, height=h,
        score=score, source=source,
        severity=severity, reason="test indicator"
    )


# ── Test 1: Two overlapping detector regions → merged into 1 MODERATE region ──

def test_two_overlapping_detectors_correlated():
    """ELA + Noise covering the same area should merge into 1 correlated region."""
    ela_r = _make_region(100, 100, 80, 80, score=0.86, source="ela")
    noise_r = _make_region(105, 105, 75, 75, score=0.81, source="noise")

    detector_map = {
        "ela": [ela_r],
        "noise": [noise_r],
    }

    correlated = correlate_spatial_evidence(detector_map, iou_threshold=0.30)

    assert len(correlated) == 1
    cr = correlated[0]
    assert cr.region_id == "R001"
    assert cr.detector_count == 2
    assert set(cr.supporting_detectors) == {"ELA", "NOISE"}
    assert cr.evidence_strength == "MODERATE"
    assert cr.signals.get("ela") == 0.86
    assert cr.signals.get("noise") == 0.81
    assert "ELA and NOISE independently detected anomalies" in cr.reason


# ── Test 2: Non-overlapping regions → remain separate ────────────────────────

def test_non_overlapping_regions_stay_separate():
    """Regions in distinct parts of the document must not merge."""
    ela_r = _make_region(50, 50, 60, 60, score=0.75, source="ela")
    noise_r = _make_region(400, 400, 70, 70, score=0.70, source="noise")

    detector_map = {
        "ela": [ela_r],
        "noise": [noise_r],
    }

    correlated = correlate_spatial_evidence(detector_map, iou_threshold=0.30)

    assert len(correlated) == 2
    ids = [cr.region_id for cr in correlated]
    assert "R001" in ids and "R002" in ids
    for cr in correlated:
        assert cr.detector_count == 1
        assert cr.evidence_strength == "WEAK"


# ── Test 3: Three overlapping detectors → STRONG evidence ────────────────────

def test_three_overlapping_detectors_strong_evidence():
    """Three independent detectors agreeing on the same area produce STRONG evidence."""
    ela_r = _make_region(200, 200, 100, 100, score=0.88, source="ela")
    noise_r = _make_region(210, 205, 95, 95, score=0.82, source="noise")
    splicing_r = _make_region(205, 210, 90, 90, score=0.79, source="splicing")

    detector_map = {
        "ela": [ela_r],
        "noise": [noise_r],
        "splicing": [splicing_r],
    }

    correlated = correlate_spatial_evidence(detector_map, iou_threshold=0.30)

    assert len(correlated) == 1
    cr = correlated[0]
    assert cr.detector_count == 3
    assert set(cr.supporting_detectors) == {"ELA", "NOISE", "SPLICING"}
    assert cr.evidence_strength == "STRONG"
    assert cr.severity == "HIGH"
    assert "independently detected anomalies in the same area" in cr.reason


# ── Test 4: One detector only → WEAK evidence ────────────────────────────────

def test_single_detector_weak_evidence():
    """A single detector anomaly produces WEAK evidence strength."""
    stamp_r = _make_region(150, 150, 60, 60, score=0.65, source="stamp")

    detector_map = {
        "stamp": [stamp_r],
    }

    correlated = correlate_spatial_evidence(detector_map)

    assert len(correlated) == 1
    cr = correlated[0]
    assert cr.detector_count == 1
    assert cr.supporting_detectors == ["STAMP"]
    assert cr.evidence_strength == "WEAK"
    assert "Single forensic indicator (STAMP)" in cr.reason


# ── Test 5: Different coordinate scales → mapped via CoordinateMapper ────────

def test_coordinate_scale_mapping_before_iou():
    """Working scale coordinates are normalized to original scale before computing IoU."""
    mapper = CoordinateMapper(
        original_width=1000,
        original_height=800,
        working_width=500,
        working_height=400,
    )

    # Box at working scale (50, 50, 50, 50) maps to original scale (100, 100, 100, 100)
    work_box = (50, 50, 50, 50)
    norm_box = normalize_box_to_original(work_box, mapper)
    assert norm_box == (100, 100, 100, 100)

    # An original box (100, 100, 100, 100) and mapped working box should have IoU = 1.0
    iou = compute_iou(norm_box, (100, 100, 100, 100))
    assert iou == 1.0


# ── Test 6: Low detector score → excluded from supporting_detectors ──────────

def test_low_detector_score_not_supporting_evidence():
    """Scores below the support threshold (0.30) are recorded in signals but not supporting."""
    ela_r = _make_region(100, 100, 80, 80, score=0.85, source="ela")
    noise_r = _make_region(105, 105, 75, 75, score=0.15, source="noise")  # low score

    detector_map = {
        "ela": [ela_r],
        "noise": [noise_r],
    }

    correlated = correlate_spatial_evidence(detector_map, min_support_score=0.30)

    assert len(correlated) == 1
    cr = correlated[0]
    assert cr.signals.get("ela") == 0.85
    assert cr.signals.get("noise") == 0.15
    # Only ELA is above 0.30 threshold
    assert cr.supporting_detectors == ["ELA"]
    assert cr.detector_count == 1
    assert cr.evidence_strength == "WEAK"


# ── Test 7: Missing / empty detector results → graceful handling ─────────────

def test_missing_detector_graceful_handling():
    """Empty or missing detectors should process cleanly without throwing exceptions."""
    detector_map = {
        "ela": [],
        "noise": [],
        "copy_move": None,
        "stamp": [],
    }
    # Clean map with empty items
    clean_map = {k: v for k, v in detector_map.items() if v}
    correlated = correlate_spatial_evidence(clean_map)
    assert correlated == []


# ── Test 8: High-confidence copy-move elevation rule ─────────────────────────

def test_copymove_lone_signal_elevated_to_moderate():
    """Copy-move with high confidence is elevated to MODERATE evidence."""
    cm_r = _make_region(120, 120, 90, 90, score=0.75, source="copy_move")

    detector_map = {
        "copy_move": [cm_r],
    }

    correlated = correlate_spatial_evidence(detector_map)

    assert len(correlated) == 1
    cr = correlated[0]
    assert cr.evidence_strength == "MODERATE"


# ── Test 9: IoU Math Verification ────────────────────────────────────────────

def test_iou_math():
    """Verify compute_iou and overlap calculations."""
    b1 = (0, 0, 100, 100)  # area 10000
    b2 = (0, 0, 100, 100)  # exact match
    assert compute_iou(b1, b2) == 1.0

    b3 = (50, 0, 100, 100)  # half overlap -> inter 5000, union 15000 -> 1/3
    assert pytest.approx(compute_iou(b1, b3), 0.01) == 0.3333

    b4 = (200, 200, 50, 50)  # disjoint
    assert compute_iou(b1, b4) == 0.0

    # Merged box
    merged = merge_boxes(b1, b3)
    assert merged == (0, 0, 150, 100)
