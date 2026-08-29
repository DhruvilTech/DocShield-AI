from typing import List
from app.schemas.forensic import SuspiciousRegion
import numpy as np

def localize_suspicious_regions(working_image_rgb: np.ndarray) -> List[SuspiciousRegion]:
    """
    Placeholder for document region extraction (e.g., photo, stamp, text, document_area, unknown).
    In Phase 1, region detection returns an empty list.
    """
    return []
