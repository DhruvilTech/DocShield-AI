# Phase 8 & Phase 10 fusion sub-package
from image_tampering.fusion.engine import fuse
from image_tampering.fusion.config import WEIGHTS, REGION_IOU_THRESHOLD
from image_tampering.fusion.spatial_correlation import (
    correlate_spatial_evidence,
    compute_iou,
    calculate_evidence_strength,
    normalize_box_to_original,
)

__all__ = [
    "fuse",
    "WEIGHTS",
    "REGION_IOU_THRESHOLD",
    "correlate_spatial_evidence",
    "compute_iou",
    "calculate_evidence_strength",
    "normalize_box_to_original",
]
