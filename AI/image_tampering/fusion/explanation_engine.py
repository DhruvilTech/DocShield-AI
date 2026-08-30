"""
Phase 8 — Evidence Fusion Engine: Explanation Engine
=====================================================
Generates human-readable forensic narrative sentences based ONLY on
evidence that was actually detected.  Never invents findings.

Rules:
  • Only mentions a detector if its normalised score is above the LOW threshold.
  • Only mentions region evidence if fused regions with MODERATE/STRONG strength exist.
  • Adds a conflict note when conflict_detected is True.
  • Always ends with an overall assessment sentence.
"""

from __future__ import annotations
from typing import Optional


# ── Descriptor labels ─────────────────────────────────────────────────────────

_SIGNAL_LABELS: dict[str, str] = {
    "ela":       "compression inconsistency (ELA)",
    "noise":     "local noise anomaly",
    "copy_move": "visual content duplication (copy-move)",
    "stamp":     "stamp region anomaly",
    "metadata":  "image-processing metadata signature",
}


def _join(items: list[str]) -> str:
    """Oxford-comma join for evidence listing."""
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_explanations(
    normalised_scores: dict[str, Optional[int]],
    fused_regions: list,           # list[FusedRegion]
    conflict_detected: bool,
    conflict_note: Optional[str],
    overall_score: int,
    overall_level: str,
) -> list[str]:
    """
    Return an ordered list of human-readable explanation sentences.
    Each sentence is generated only when the underlying evidence exists.
    """
    explanations: list[str] = []

    # ── Per-detector findings ─────────────────────────────────────────────────
    high_labels:   list[str] = []
    medium_labels: list[str] = []

    for key, label in _SIGNAL_LABELS.items():
        score = normalised_scores.get(key)
        if score is None:
            continue
        if score >= 60:
            high_labels.append(label)
        elif score >= 35:
            medium_labels.append(label)

    if high_labels:
        explanations.append(f"Strong {_join(high_labels)} detected.")
    if medium_labels:
        explanations.append(f"Moderate {_join(medium_labels)} detected.")

    # ── Copy-move specific detail ─────────────────────────────────────────────
    cm_score = normalised_scores.get("copy_move")
    if cm_score is not None and cm_score >= 40:
        explanations.append(
            "Visual content appears to have been duplicated within the document "
            "(copy-move geometric evidence)."
        )

    # ── Region-level corroboration ────────────────────────────────────────────
    strong_regions   = [r for r in fused_regions if r.evidence_strength == "STRONG"]
    moderate_regions = [r for r in fused_regions if r.evidence_strength == "MODERATE"]

    if strong_regions:
        n = len(strong_regions)
        noun = f"{n} region{'s' if n > 1 else ''}"
        explanations.append(
            f"{noun} with strong multi-signal forensic corroboration detected — "
            "multiple independent detectors agree on the same physical area."
        )
    if moderate_regions:
        n = len(moderate_regions)
        noun = f"{n} region{'s' if n > 1 else ''}"
        explanations.append(
            f"{noun} with moderate cross-signal evidence detected."
        )

    # ── Conflict note ─────────────────────────────────────────────────────────
    if conflict_detected and conflict_note:
        explanations.append(conflict_note)

    # ── Overall assessment ────────────────────────────────────────────────────
    if overall_level == "CRITICAL":
        explanations.append(
            "Overall tampering evidence is very strong. "
            "Immediate manual document review is strongly recommended."
        )
    elif overall_level == "HIGH":
        explanations.append(
            "Significant tampering evidence was found. "
            "Manual document review is recommended."
        )
    elif overall_level == "MEDIUM":
        explanations.append(
            "Moderate tampering indicators were detected. "
            "Consider additional verification before accepting this document."
        )
    else:  # LOW
        explanations.append(
            "Forensic analysis found limited tampering evidence. "
            "The document appears consistent under current detection methods."
        )

    if not explanations:
        explanations.append("No significant forensic anomalies detected.")

    return explanations
