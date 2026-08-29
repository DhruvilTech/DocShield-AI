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

class FusionResult(BaseModel):
    score: Optional[float] = None
    confidence: Optional[float] = None
    risk_level: Optional[str] = None  # "LOW", "MEDIUM", "HIGH"

class ForensicResult(BaseModel):
    image: ImageInfo
    quality: QualityMetrics
    representations: RepresentationsStatus
    regions: List[SuspiciousRegion] = []
    signals: Signals
    fusion: FusionResult
