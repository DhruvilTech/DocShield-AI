from app.schemas.forensic import ForensicSignal

def analyze_metadata(image_bytes: bytes) -> ForensicSignal:
    """
    Placeholder for metadata forensics.
    In Phase 1, metadata forensic analysis is not implemented and returns a default unavailable ForensicSignal.
    """
    return ForensicSignal(
        name="metadata",
        score=None,
        confidence=None,
        regions=[],
        evidence=[],
        available=False
    )
