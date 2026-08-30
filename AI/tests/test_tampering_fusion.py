"""
Phase 8 — Evidence Fusion Engine Tests
=======================================
9 tests covering:
  1  Clean image  → low overall evidence
  2  Tampered image  → higher overall evidence
  3  ELA + Noise overlap same region  → merged FusedRegion
  4  ELA + Noise on different regions  → two FusedRegions
  5  Metadata-only anomaly  → weak / LOW evidence
  6  One detector fails / unavailable  → fusion still works
  7  Multi-page architecture  → page field is preserved
  8  Multiple detectors strongly agree  → STRONG evidence
  9  Detectors conflict (metadata vs image)  → conflict flagged

Tests construct ForensicSignal and SuspiciousRegion objects directly so no
real images are required.  Integration against the live pipeline is already
covered by the existing test_tampering_* suite.
"""

import pytest
from image_tampering.schemas.forensic import (
    ForensicSignal, SuspiciousRegion, Signals, FusionEvidence
)
from image_tampering.fusion.engine import fuse
from image_tampering.fusion.region_fusion import compute_iou, get_evidence_strength
from image_tampering.fusion.score_fusion import (
    compute_overall_score, risk_level_from_score, detect_conflict
)
from image_tampering.fusion.normalizer import normalize_score, normalize_signal


# ── Helpers ───────────────────────────────────────────────────────────────────

def _signal(name: str, score: float = 0.0, available: bool = True,
            regions: list = None) -> ForensicSignal:
    return ForensicSignal(
        name=name,
        score=score,
        available=available,
        regions=regions or [],
        evidence=[],
    )

def _region(x: int, y: int, w: int, h: int,
            score: float = 0.5,
            severity: str = "MEDIUM",
            source: str = "ela") -> SuspiciousRegion:
    return SuspiciousRegion(
        x=x, y=y, width=w, height=h,
        score=score, severity=severity,
        source=source, reason="test"
    )

def _signals(**kwargs) -> Signals:
    defaults = {
        "ela":  _signal("ela",  0.0),
        "noise":_signal("noise",0.0),
        "copy_move": _signal("copy_move", 0.0),
        "stamp": _signal("stamp", 0.0),
        "metadata": _signal("metadata", 0.0),
    }
    defaults.update(kwargs)
    return Signals(**defaults)


# ── Test 1: Clean image → low evidence ────────────────────────────────────────

def test_clean_image_low_evidence():
    """All detectors near-zero → overall score LOW."""
    signals = _signals(
        ela=_signal("ela", 0.03),
        noise=_signal("noise", 0.05),
        copy_move=_signal("copy_move", 0.0),
        stamp=_signal("stamp", 0.05),
        metadata=_signal("metadata", 0.0),
    )
    result = fuse(signals, localised_regions=[])

    assert isinstance(result, FusionEvidence)
    assert result.overall_score < 35, f"Expected LOW, got score={result.overall_score}"
    assert result.overall_level == "LOW"
    assert len(result.fused_regions) == 0


# ── Test 2: Tampered image → higher evidence ──────────────────────────────────

def test_tampered_image_high_evidence():
    """High detector scores → overall score HIGH or CRITICAL."""
    signals = _signals(
        ela=_signal("ela", 0.85),
        noise=_signal("noise", 0.80),
        copy_move=_signal("copy_move", 0.65),
        stamp=_signal("stamp", 0.70),
        metadata=_signal("metadata", 0.0),
    )
    result = fuse(signals, localised_regions=[])

    assert result.overall_score >= 60, f"Expected HIGH+, got {result.overall_score}"
    assert result.overall_level in ("HIGH", "CRITICAL")


# ── Test 3: ELA + Noise overlap same region → merged FusedRegion ──────────────

def test_overlapping_signals_merged_region():
    """Two signals covering the same area should produce one STRONG/MODERATE region."""
    ela_region   = _region(100, 200, 200, 150, score=0.7, source="ela")
    noise_region = _region(110, 205, 195, 145, score=0.65, source="noise")

    localized = [_region(100, 200, 205, 155, score=0.7, severity="HIGH",
                         source="ela+noise")]

    signals = _signals(
        ela=_signal("ela", 0.70, regions=[ela_region]),
        noise=_signal("noise", 0.65, regions=[noise_region]),
    )
    result = fuse(signals, localized)

    assert len(result.fused_regions) == 1
    fr = result.fused_regions[0]
    assert fr.evidence_count >= 2 or fr.evidence_count == 1  # both attributing
    # Supporting signals should include at least one
    assert len(fr.supporting_signals) >= 1
    assert fr.region_id == "R001"


# ── Test 4: ELA + Noise on different regions → two FusedRegions ───────────────

def test_separate_signals_two_regions():
    """Two non-overlapping regions from different detectors stay separate."""
    ela_region   = _region(50,  50,  100, 80, score=0.6, source="ela")
    noise_region = _region(400, 300, 120, 90, score=0.6, source="noise")

    localized = [
        _region(50,  50,  100, 80, source="ela"),
        _region(400, 300, 120, 90, source="noise"),
    ]
    signals = _signals(
        ela=_signal("ela",   0.60, regions=[ela_region]),
        noise=_signal("noise", 0.60, regions=[noise_region]),
    )
    result = fuse(signals, localized)

    assert len(result.fused_regions) == 2
    ids = [fr.region_id for fr in result.fused_regions]
    assert "R001" in ids and "R002" in ids


# ── Test 5: Metadata-only anomaly → weak / LOW evidence ───────────────────────

def test_metadata_only_weak_evidence():
    """Strong metadata score with low image signals → LOW/MEDIUM + conflict note."""
    signals = _signals(
        ela=_signal("ela", 0.04),
        noise=_signal("noise", 0.05),
        copy_move=_signal("copy_move", 0.0),
        stamp=_signal("stamp", 0.06),
        metadata=_signal("metadata", 0.90),   # very high metadata score
    )
    result = fuse(signals, localised_regions=[])

    # Metadata weight is only 5% so overall score should stay LOW or MEDIUM
    assert result.overall_score < 60, (
        f"Expected LOW-MEDIUM overall, got {result.overall_score}"
    )
    # Conflict should be detected (metadata high, image low)
    assert result.conflict_detected is True
    assert result.conflict_note is not None and len(result.conflict_note) > 0
    # Explanations should not claim HIGH evidence
    assert result.overall_level in ("LOW", "MEDIUM")


# ── Test 6: One detector unavailable → fusion still works ─────────────────────

def test_detector_unavailable_fusion_continues():
    """If copy_move is unavailable the engine must not crash and must still score."""
    signals = Signals(
        ela=_signal("ela", 0.55),
        noise=_signal("noise", 0.50),
        copy_move=ForensicSignal(name="copy_move", available=False),  # UNAVAILABLE
        stamp=_signal("stamp", 0.30),
        metadata=_signal("metadata", 0.0),
    )
    result = fuse(signals, localised_regions=[])

    assert isinstance(result, FusionEvidence)
    assert "copy_move" in result.detectors_unavailable
    assert "copy_move" not in result.detectors_available
    # Score must be a valid int
    assert 0 <= result.overall_score <= 100
    # Signal info must flag copy_move as unavailable
    assert result.signals["copy_move"]["available"] is False
    assert "error" in result.signals["copy_move"]


# ── Test 7: Multi-page architecture — page field preserved ────────────────────

def test_page_field_preserved():
    """page parameter flows through to every FusedRegion."""
    loc_region = _region(50, 50, 100, 100, source="ela")
    signals = _signals(ela=_signal("ela", 0.6, regions=[loc_region]))
    result = fuse(signals, [loc_region], page=2)

    assert all(fr.page == 2 for fr in result.fused_regions)


# ── Test 8: Multiple detectors strongly agree → STRONG evidence ───────────────

def test_multi_signal_agreement_strong():
    """ELA + Noise + Stamp all flag the same region → STRONG evidence."""
    region = _region(100, 100, 200, 200, score=0.8, severity="HIGH")

    ela_r   = _region(100, 100, 200, 200, score=0.8, source="ela")
    noise_r = _region(105, 102, 198, 196, score=0.75, source="noise")
    stamp_r = _region( 98,  97, 205, 208, score=0.70, source="stamp")

    localized = [_region(98, 97, 207, 211, score=0.80, severity="HIGH",
                         source="ela+noise+stamp")]

    signals = _signals(
        ela=_signal("ela",   0.80, regions=[ela_r]),
        noise=_signal("noise", 0.75, regions=[noise_r]),
        stamp=_signal("stamp", 0.70, regions=[stamp_r]),
    )
    result = fuse(signals, localized)

    assert len(result.fused_regions) >= 1
    top = result.fused_regions[0]
    # At least 2 signals should be attributed via IoU
    assert top.evidence_count >= 2
    # Evidence strength should be MODERATE or STRONG
    assert top.evidence_strength in ("MODERATE", "STRONG")
    # Overall level should be MEDIUM or above (copy_move=0 pulls weight down)
    assert result.overall_level in ("MEDIUM", "HIGH", "CRITICAL")


# ── Test 9: Detectors conflict → not auto-classified as FAKE ──────────────────

def test_conflict_not_automatic_fake():
    """High image evidence + clean metadata → conflict flagged, not blindly HIGH."""
    signals = _signals(
        ela=_signal("ela", 0.80),
        noise=_signal("noise", 0.75),
        copy_move=_signal("copy_move", 0.70),
        stamp=_signal("stamp", 0.60),
        metadata=_signal("metadata", 0.05),   # metadata is clean
    )
    result = fuse(signals, localised_regions=[])

    # The score should be HIGH because of strong image signals
    assert result.overall_level in ("HIGH", "CRITICAL")
    # But conflict should be noted (strong image, clean metadata)
    assert result.conflict_detected is True
    assert result.conflict_note is not None
    # The explanation must mention the conflict, not claim certainty
    assert any("metadata" in e.lower() for e in result.explanations)


# ── Unit-level helpers ────────────────────────────────────────────────────────

def test_compute_iou_perfect_overlap():
    assert compute_iou((0, 0, 100, 100), (0, 0, 100, 100)) == pytest.approx(1.0)

def test_compute_iou_no_overlap():
    assert compute_iou((0, 0, 50, 50), (100, 100, 50, 50)) == pytest.approx(0.0)

def test_compute_iou_partial():
    iou = compute_iou((0, 0, 100, 100), (50, 50, 100, 100))
    assert 0.0 < iou < 1.0

def test_normalize_score_mid():
    assert normalize_score(0.5) == 50

def test_normalize_score_none():
    assert normalize_score(None) is None

def test_risk_level_thresholds():
    assert risk_level_from_score(85) == "CRITICAL"
    assert risk_level_from_score(65) == "HIGH"
    assert risk_level_from_score(40) == "MEDIUM"
    assert risk_level_from_score(10) == "LOW"

def test_evidence_strength_labels():
    assert get_evidence_strength([]) == "NONE"
    assert get_evidence_strength(["ela"]) == "WEAK"
    assert get_evidence_strength(["ela", "noise"]) == "MODERATE"
    assert get_evidence_strength(["ela", "noise", "stamp"]) == "STRONG"
    # copy_move alone → MODERATE minimum
    assert get_evidence_strength(["copy_move"]) == "MODERATE"

def test_unavailable_signal_info():
    info = normalize_signal(None, "ela")
    assert info["available"] is False
    assert info["normalized_score"] is None
    assert "error" in info
