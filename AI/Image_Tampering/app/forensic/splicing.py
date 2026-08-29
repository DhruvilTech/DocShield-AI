from app.schemas.forensic import ForensicSignal
import numpy as np
from app.forensic.preprocessing import CoordinateMapper

def analyze_splicing(working_image_rgb: np.ndarray, original_image_rgb: np.ndarray = None, coordinate_mapper: CoordinateMapper = None) -> ForensicSignal:
    """
    Placeholder for Splicing tampering detection.
    In Phase 1, splicing detection is not implemented and returns a default unavailable ForensicSignal.
    """
    return ForensicSignal(
        name="splicing",
        score=None,
        confidence=None,
        regions=[],
        evidence=[],
        available=False
    )
