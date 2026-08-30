# Phase 8 fusion sub-package
from image_tampering.fusion.engine import fuse
from image_tampering.fusion.config import WEIGHTS, REGION_IOU_THRESHOLD

__all__ = ["fuse", "WEIGHTS", "REGION_IOU_THRESHOLD"]
