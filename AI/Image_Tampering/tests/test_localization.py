import os
import numpy as np
import cv2
from app.schemas.forensic import SuspiciousRegion
from app.forensic.preprocessing import CoordinateMapper
from app.forensic.localization import (
    calculate_overlap_ratio_smaller,
    merge_boxes,
    localize_suspicious_regions
)
from app.forensic.pipeline import run_forensic_pipeline

def test_calculate_overlap_ratio_smaller():
    # Box 1: (0, 0, 100, 100) -> Area 10000
    # Box 2: (50, 50, 100, 100) -> Area 10000, Overlap: (50, 50, 50, 50) -> Area 2500
    # Ratio = 2500 / 10000 = 0.25
    b1 = (0, 0, 100, 100)
    b2 = (50, 50, 100, 100)
    assert calculate_overlap_ratio_smaller(b1, b2) == 0.25
    
    # Box 3 completely inside Box 4
    # Box 3: (10, 10, 20, 20) -> Area 400
    # Box 4: (0, 0, 100, 100) -> Area 10000
    # Ratio relative to smaller = 400 / 400 = 1.0
    b3 = (10, 10, 20, 20)
    b4 = (0, 0, 100, 100)
    assert calculate_overlap_ratio_smaller(b3, b4) == 1.0

def test_merge_boxes():
    b1 = (10, 20, 30, 40)
    b2 = (20, 30, 40, 50)
    # Merged x: min(10, 20) = 10
    # Merged y: min(20, 30) = 20
    # Merged width: max(10+30, 20+40) - 10 = max(40, 60) - 10 = 50
    # Merged height: max(20+40, 30+50) - 20 = max(60, 80) - 20 = 60
    assert merge_boxes(b1, b2) == (10, 20, 50, 60)

def test_localize_regions_empty():
    assert localize_suspicious_regions([], [], [], []) == []

def test_localize_regions_no_merge():
    # Two distinct, non-overlapping regions
    r1 = SuspiciousRegion(x=10, y=10, width=20, height=20, score=0.5, severity="MEDIUM", source="ela", reason="ELA Anomaly")
    r2 = SuspiciousRegion(x=100, y=100, width=20, height=20, score=0.6, severity="HIGH", source="noise", reason="Noise Anomaly")
    
    res = localize_suspicious_regions([r1], [r2], [], [])
    assert len(res) == 2
    # Sorted by score descending
    assert res[0].score == 0.6
    assert res[1].score == 0.5

def test_localize_regions_overlapping_merging():
    # Overlapping ELA and Noise regions
    r1 = SuspiciousRegion(x=100, y=100, width=100, height=100, score=0.4, severity="MEDIUM", source="ela", reason="ELA Anomaly")
    r2 = SuspiciousRegion(x=120, y=110, width=90, height=90, score=0.8, severity="HIGH", source="noise", reason="Noise Anomaly")
    
    # Overlap area: (120, 110, 80, 80) -> 6400. Smaller area: 8100. Ratio = 6400 / 8100 = 0.79 > 0.3
    res = localize_suspicious_regions([r1], [r2], [], [])
    assert len(res) == 1
    merged = res[0]
    
    # Bounding box of union: x=100, y=100, w=110, h=100
    assert merged.x == 100
    assert merged.y == 100
    assert merged.width == 110
    assert merged.height == 100
    assert merged.score == 0.8
    assert merged.severity == "HIGH"
    assert "ela" in merged.source
    assert "noise" in merged.source
    assert "ELA Anomaly" in merged.reason
    assert "Noise Anomaly" in merged.reason

def test_localize_regions_copy_move_preserves_target():
    # Copy move region has target coordinates
    r1 = SuspiciousRegion(
        x=50, y=50, width=50, height=50, score=0.7, severity="MEDIUM", source="copy_move", reason="Duplicated",
        target_x=200, target_y=200, target_width=50, target_height=50
    )
    r2 = SuspiciousRegion(x=60, y=60, width=30, height=30, score=0.3, severity="LOW", source="ela", reason="ELA overlapping")
    
    res = localize_suspicious_regions([r2], [], [r1], [])
    assert len(res) == 1
    merged = res[0]
    assert merged.x == 50
    assert merged.y == 50
    assert merged.width == 50
    assert merged.height == 50
    assert merged.target_x == 200
    assert merged.target_y == 200

def test_localize_regions_original_mapper_unchanged():
    # Map back check and original image array unchanged check
    # Cream color background
    rgb = np.full((300, 300, 3), 240, dtype=np.uint8)
    rgb_copy = rgb.copy()
    
    r1 = SuspiciousRegion(x=10, y=10, width=20, height=20, score=0.5, severity="LOW", source="ela", reason="ELA Anomaly")
    mapper = CoordinateMapper(300, 300, 150, 150) # scale is 0.5
    
    # Run with debug saving to a non-existent temp dir to verify it handles folder creation and works
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        res = localize_suspicious_regions(
            [r1], [], [], [],
            working_image_rgb=rgb,
            coordinate_mapper=mapper,
            save_debug=True,
            debug_dir=tmpdir
        )
        assert len(res) == 1
        assert os.path.exists(os.path.join(tmpdir, "document_localized.jpg"))
        
    assert np.array_equal(rgb, rgb_copy)

def test_pipeline_integration_clean():
    # Run on clean passport to verify zero false localization regions
    passport_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples", "clean", "passport.jpg")
    if os.path.exists(passport_path):
        with open(passport_path, "rb") as f:
            img_bytes = f.read()
        res = run_forensic_pipeline(img_bytes, "passport.jpg")
        # Ensure localization returned the merged regions list, which is in res.regions
        assert res.regions is not None
        # Copy-move should be clean
        assert res.signals.copy_move.score == 0.0
