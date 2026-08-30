from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ImageInfo(BaseModel):
    width: int
    height: int
    channels: int
    format: str
    working_width: int
    working_height: int

class QualityMetrics(BaseModel):
    brightness: float
    contrast: float
    sharpness: float
    blur_detected: bool

class RepresentationsStatus(BaseModel):
    grayscale: bool = True
    hsv: bool = True
    lab: bool = True
    noise_residual: bool = True

class SuspiciousRegion(BaseModel):
    x: int
    y: int
    width: int
    height: int
    score: float
    severity: str  # "LOW", "MEDIUM", "HIGH"
    source: str
    reason: str
    
    # Optional fields for copy-move mapping (source to target)
    target_x: Optional[int] = None
    target_y: Optional[int] = None
    target_width: Optional[int] = None
    target_height: Optional[int] = None

class ForensicSignal(BaseModel):
    name: str
    score: Optional[float] = None
    confidence: Optional[float] = None
    regions: List[SuspiciousRegion] = []
    evidence: List[Dict[str, Any]] = []
    available: bool = False
    stamp_detected: Optional[bool] = None
    
    # ELA and engine-specific metadata
    statistics: Optional[Dict[str, float]] = None
    quality: Optional[int] = None
    heatmap_path: Optional[str] = None
    map_path: Optional[str] = None

class Signals(BaseModel):
    ela: Optional[ForensicSignal] = None
    noise: Optional[ForensicSignal] = None
    copy_move: Optional[ForensicSignal] = None
    metadata: Optional[ForensicSignal] = None
    stamp: Optional[ForensicSignal] = None
    splicing: Optional[ForensicSignal] = None

# ──────────────────────────────────────────────────────────────────────────────
# Phase 8 — Evidence Fusion schemas
# ──────────────────────────────────────────────────────────────────────────────

class FusedRegion(BaseModel):
    """One spatially-corroborated suspicious region produced by Phase 8 fusion."""
    region_id: str                            # "R001", "R002", …
    page: int = 1                             # page number (1 for single images)
    bbox: Dict[str, int]                      # {"x":…, "y":…, "width":…, "height":…}
    severity: str                             # "LOW" | "MEDIUM" | "HIGH"
    evidence_strength: str                    # "NONE" | "WEAK" | "MODERATE" | "STRONG"
    evidence_count: int                       # number of independent supporting signals
    supporting_signals: List[str]             # e.g. ["ELA", "NOISE", "STAMP"]
    signal_scores: Dict[str, int]             # normalised 0-100 per signal
    reason: str                               # human-readable sentence
    target_bbox: Optional[Dict[str, int]] = None   # copy-move target box, if present

class FusionEvidence(BaseModel):
    """Full Phase 8 Evidence Fusion result — wraps all fusion outputs."""
    overall_score: int                        # 0-100 tampering evidence score
    overall_level: str                        # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    signals: Dict[str, Any]                   # normalised per-detector info
    fused_regions: List[FusedRegion]          # merged region-level evidence
    explanations: List[str]                   # human-readable forensic narrative
    detectors_available: List[str]            # ran successfully
    detectors_unavailable: List[str]          # failed or not implemented
    conflict_detected: bool                   # mixed-evidence flag
    conflict_note: Optional[str] = None       # explanation of the conflict

class FusionResult(BaseModel):
    score: Optional[float] = None
    confidence: Optional[float] = None
    risk_level: Optional[str] = None          # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    evidence: Optional[FusionEvidence] = None  # Phase 8 full result (None if not run)

class ForensicResult(BaseModel):
    image: ImageInfo
    quality: QualityMetrics
    representations: RepresentationsStatus
    regions: List[SuspiciousRegion] = []
    signals: Signals
    fusion: FusionResult
