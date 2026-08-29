from app.schemas.forensic import ForensicSignal
import numpy as np
from app.forensic.preprocessing import CoordinateMapper

def analyze_noise(working_image_rgb: np.ndarray, original_image_rgb: np.ndarray = None, coordinate_mapper: CoordinateMapper = None) -> ForensicSignal:
    """
    Placeholder for Noise Inconsistency analysis.
    In Phase 1, noise consistency is not implemented and returns a default unavailable ForensicSignal.
    """
    return ForensicSignal(
        name="noise",
        score=None,
        confidence=None,
        regions=[],
        evidence=[],
        available=False
    )
