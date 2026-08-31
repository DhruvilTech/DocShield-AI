"""
Phase 8 — Evidence Fusion Engine: Configuration
================================================
All tunable constants are defined here so they can be calibrated in one place.
These are ENGINEERING WEIGHTS for the prototype; they have not been scientifically
validated on a large corpus of tampered documents.
"""

# ── Detector Weights ─────────────────────────────────────────────────────────
# Must sum to 1.0 across all detector keys.
WEIGHTS: dict[str, float] = {
    "ela":                0.12,  # Error Level Analysis
    "noise":              0.12,  # Local Noise Analysis
    "copy_move":          0.18,  # Copy-Move Detection
    "splicing":           0.18,  # Splicing & Insertion Detection
    "content_alteration": 0.15,  # Content Alteration & Defacement
    "text_tampering":     0.15,  # Text Tampering & Modification
    "stamp":              0.05,  # Stamp Detection
    "metadata":           0.05,  # Metadata Analysis
}

# ── Region Overlap ───────────────────────────────────────────────────────────
# IoU threshold: two regions are considered the "same area" when IoU >= this value.
REGION_IOU_THRESHOLD: float = 0.30

# ── Risk Level Thresholds (overall score 0-100) ───────────────────────────────
# Ordered list of (level, min_score); first matching entry wins (highest first).
RISK_LEVEL_THRESHOLDS: list[tuple[str, int]] = [
    ("CRITICAL", 80),
    ("HIGH",     60),
    ("MEDIUM",   35),
    ("LOW",       0),
]

# ── Evidence Strength (number of independent supporting signals) ──────────────
EVIDENCE_STRENGTH_THRESHOLDS: list[tuple[str, int]] = [
    ("STRONG",   3),
    ("MODERATE", 2),
    ("WEAK",     1),
    ("NONE",     0),
]

# Copy-Move alone (very precise geometric evidence) counts as MODERATE minimum.
COPY_MOVE_STRENGTH_MINIMUM: str = "MODERATE"

# ── Score Normalization ───────────────────────────────────────────────────────
# Each detector's score is in [0.0, 1.0] where 1.0 maps to 100 after scaling.
# Currently all detectors use the same cap; adjust if a detector changes range.
SCORE_NORMALIZATION_CAPS: dict[str, float] = {
    "ela":                1.0,
    "noise":              1.0,
    "copy_move":          1.0,
    "splicing":           1.0,
    "content_alteration": 1.0,
    "text_tampering":     1.0,
    "stamp":              1.0,
    "metadata":           1.0,
}

# ── Conflict Detection ────────────────────────────────────────────────────────
# Metadata score above this while avg image score below CONFLICT_IMAGE_LOW → conflict.
CONFLICT_METADATA_HIGH:  int = 50
CONFLICT_IMAGE_LOW:       int = 25
# Strong image evidence while metadata score below this → possible stripped metadata.
CONFLICT_IMAGE_HIGH:      int = 60
CONFLICT_METADATA_CLEAN:  int = 15

# ── Region Bonus Score Caps ───────────────────────────────────────────────────
REGION_BONUS_PER_STRONG:   int = 25   # points per STRONG region (capped at 60)
REGION_BONUS_PER_MODERATE: int = 12   # points per MODERATE region (capped at 30)
REGION_BONUS_SIGNAL_FRAC:  float = 0.60  # max(bonus, max_signal_score * frac)
