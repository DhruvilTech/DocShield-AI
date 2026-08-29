from app.schemas.forensic import ForensicSignal
import numpy as np
from app.forensic.preprocessing import CoordinateMapper

def analyze_ela(working_image_rgb: np.ndarray, original_image_rgb: np.ndarray = None, coordinate_mapper: CoordinateMapper = None) -> ForensicSignal:
    """
    Placeholder for ELA (Error Level Analysis) detection.
    In Phase 1, ELA is not implemented and returns a default unavailable ForensicSignal.
    """
    return ForensicSignal(
        name="ela",
        score=None,
        confidence=None,
        regions=[],
        evidence=[],
        available=False
    )
