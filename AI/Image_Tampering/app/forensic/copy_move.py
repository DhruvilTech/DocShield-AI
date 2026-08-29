from app.schemas.forensic import ForensicSignal
import numpy as np
from app.forensic.preprocessing import CoordinateMapper

def analyze_copy_move(working_image_rgb: np.ndarray, original_image_rgb: np.ndarray = None, coordinate_mapper: CoordinateMapper = None) -> ForensicSignal:
    """
    Placeholder for Copy-Move tampering detection.
    In Phase 1, copy-move detection is not implemented and returns a default unavailable ForensicSignal.
    """
    return ForensicSignal(
        name="copy_move",
        score=None,
        confidence=None,
        regions=[],
        evidence=[],
        available=False
    )
