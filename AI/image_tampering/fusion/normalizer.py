"""
Phase 8 — Evidence Fusion Engine: Score Normalizer
===================================================
Converts each ForensicSignal's raw float score (0.0–1.0) into a normalised
integer in 0–100 and produces a standardised per-detector info dict.

Handles:
  • available=False  → detector unavailable, score=None
  • score=None       → detector ran but returned no score
"""

from __future__ import annotations
from typing import Any, Optional
from image_tampering.schemas.forensic import ForensicSignal
from image_tampering.fusion.config import SCORE_NORMALIZATION_CAPS


# ── Severity labels from normalised score ────────────────────────────────────

def severity_from_norm(norm_score: Optional[int]) -> str:
    if norm_score is None:
        return "UNKNOWN"
    if norm_score >= 60:
        return "HIGH"
    if norm_score >= 35:
        return "MEDIUM"
    return "LOW"


# ── Core normalisation ───────────────────────────────────────────────────────

def normalize_score(raw: Optional[float], cap: float = 1.0) -> Optional[int]:
    """
    Map a raw 0.0–1.0 score to 0–100.
    Returns None when raw is None (detector produced no score).
    """
    if raw is None:
        return None
    clamped = min(max(raw / cap, 0.0), 1.0)
    return int(round(clamped * 100))


def normalize_signal(signal: Optional[ForensicSignal], detector_key: str) -> dict[str, Any]:
    """
    Return a standardised detector-info dict for inclusion in FusionEvidence.signals.

    Available detector:
        {"available": True, "normalized_score": 42, "severity": "MEDIUM",
         "regions_count": 3, "evidence_items": 2}

    Unavailable detector:
        {"available": False, "normalized_score": None, "severity": None,
         "error": "Detector unavailable"}
    """
    if signal is None or not signal.available:
        return {
            "available": False,
            "normalized_score": None,
            "severity": None,
            "error": "Detector unavailable",
        }

    cap = SCORE_NORMALIZATION_CAPS.get(detector_key, 1.0)
    norm = normalize_score(signal.score, cap)
    return {
        "available": True,
        "normalized_score": norm,
        "severity": severity_from_norm(norm),
        "regions_count": len(signal.regions),
        "evidence_items": len(signal.evidence),
        # Preserve detector-specific extras useful for frontend display
        "confidence": signal.confidence,
        "heatmap_path": signal.heatmap_path,
        "map_path": signal.map_path,
    }


# ── Batch normalise all signals ───────────────────────────────────────────────

DETECTOR_KEYS = ["ela", "noise", "copy_move", "splicing", "content_alteration", "text_tampering", "stamp", "metadata"]


def normalize_all_signals(signals) -> tuple[dict[str, Any], list[str], list[str]]:
    """
    Normalise all detector signals at once.

    Returns:
        normalised_map: {key: normalised_info_dict}
        available:      list of keys that ran successfully
        unavailable:    list of keys that failed / were not implemented
    """
    normalised: dict[str, Any] = {}
    available: list[str] = []
    unavailable: list[str] = []

    detector_attrs = {
        "ela":                signals.ela,
        "noise":              signals.noise,
        "copy_move":          signals.copy_move,
        "splicing":           signals.splicing,
        "content_alteration": getattr(signals, "content_alteration", None),
        "text_tampering":     getattr(signals, "text_tampering", None),
        "stamp":              signals.stamp,
        "metadata":           signals.metadata,
    }

    for key, signal in detector_attrs.items():
        info = normalize_signal(signal, key)
        normalised[key] = info
        if info["available"]:
            available.append(key)
        else:
            unavailable.append(key)

    return normalised, available, unavailable

