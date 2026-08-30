import io
import os
import numpy as np
import pytest
import cv2
from PIL import Image, ImageDraw
from image_tampering.forensic.preprocessing import load_and_preprocess_image, CoordinateMapper
from image_tampering.forensic.copy_move import analyze_copy_move
from document_detection.schemas.forensic import ForensicSignal

def create_copy_move_dummy_bytes(w: int, h: int, format: str = "JPEG", add_copy_move=False) -> bytes:
    # Cream color background
    img = Image.new("RGB", (w, h), color=(240, 240, 240))
    
    # Generate high texture random noise block to serve as the stamp
    np.random.seed(42)
    stamp_noise = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
    stamp_img = Image.fromarray(stamp_noise)
    img.paste(stamp_img, (50, 50))
    
    if add_copy_move:
        # Crop the stamp region and paste it in another place (e.g. x=300, y=300)
        stamp_crop = img.crop((50, 50, 150, 150))
        img.paste(stamp_crop, (300, 300))
        
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


def test_copy_move_basic_execution():
    img_bytes = create_copy_move_dummy_bytes(800, 600, "JPEG")
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.jpg")
    
    # Run Copy-Move analysis
    signal = analyze_copy_move(work, coordinate_mapper=mapper)
    
    assert isinstance(signal, ForensicSignal)
    assert signal.name == "copy_move"
    assert signal.available is True
    assert signal.score is not None
    assert 0.0 <= signal.score <= 1.0
    
    # Check statistics
    assert signal.statistics is not None
    for stat in ["keypoints", "candidate_matches", "verified_matches", "clusters", "largest_cluster"]:
        assert stat in signal.statistics
        assert isinstance(signal.statistics[stat], float)


def test_copy_move_clean_vs_tampered():
    # Clean image has only 1 stamp
    clean_bytes = create_copy_move_dummy_bytes(800, 600, "JPEG", add_copy_move=False)
    # Tampered image has stamp duplicated at 300,300
    tampered_bytes = create_copy_move_dummy_bytes(800, 600, "JPEG", add_copy_move=True)
    
    _, work_clean, mapper_clean, _ = load_and_preprocess_image(clean_bytes, "clean.jpg")
    _, work_tampered, mapper_tampered, _ = load_and_preprocess_image(tampered_bytes, "tampered.jpg")
    
    sig_clean = analyze_copy_move(work_clean, coordinate_mapper=mapper_clean)
    sig_tampered = analyze_copy_move(work_tampered, coordinate_mapper=mapper_tampered)
    
    # Tampered image with copy-move must trigger a higher score
    assert sig_tampered.score > sig_clean.score
    assert len(sig_tampered.regions) >= len(sig_clean.regions)
    if sig_tampered.regions:
        r = sig_tampered.regions[0]
        # Check source and target mappings are set
        assert r.target_x is not None
        assert r.target_y is not None
        assert r.target_width is not None
        assert r.target_height is not None


def test_copy_move_coordinate_mapping():
    # Large 2400x1800 image downscaled
    img_bytes = create_copy_move_dummy_bytes(2400, 1800, "JPEG", add_copy_move=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "large.jpg", max_working_dim=800)
    
    sig = analyze_copy_move(work, coordinate_mapper=mapper)
    
    if sig.regions:
        for region in sig.regions:
            # Check source coordinates are within original size limits
            assert 0 <= region.x <= 2400
            assert 0 <= region.y <= 1800
            assert 0 < region.width <= 2400
            assert 0 < region.height <= 1800
            
            # Check target coordinates are within original size limits
            assert 0 <= region.target_x <= 2400
            assert 0 <= region.target_y <= 1800
            assert 0 < region.target_width <= 2400
            assert 0 < region.target_height <= 1800
            
            assert region.severity in ["LOW", "MEDIUM", "HIGH"]
            assert region.source == "copy_move"


def test_copy_move_debug_file_creation(tmpdir):
    img_bytes = create_copy_move_dummy_bytes(800, 600, "JPEG", add_copy_move=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.jpg")
    
    debug_dir = str(tmpdir.mkdir("debug"))
    signal = analyze_copy_move(work, coordinate_mapper=mapper, save_debug=True, debug_dir=debug_dir)
    
    # Check that debug files exist
    assert os.path.exists(os.path.join(debug_dir, "document_copy_move_matches.jpg"))
    assert os.path.exists(os.path.join(debug_dir, "document_copy_move_map.png"))
    
    assert signal.heatmap_path == "outputs/debug/document_copy_move_matches.jpg"
    assert signal.map_path == "outputs/debug/document_copy_move_map.png"


def test_copy_move_original_unchanged():
    img_bytes = create_copy_move_dummy_bytes(800, 600, "JPEG", add_copy_move=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.jpg")
    
    work_copy = work.copy()
    _ = analyze_copy_move(work, coordinate_mapper=mapper)
    
    # Assert that the working image array has not been modified
    assert np.array_equal(work, work_copy)


def test_copy_move_clean_no_high_score():
    # Verify that the clean passport sample does not trigger high copy-move score
    passport_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples", "clean", "passport.jpg")
    if os.path.exists(passport_path):
        with open(passport_path, "rb") as f:
            img_bytes = f.read()
        orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "passport.jpg")
        signal = analyze_copy_move(work, coordinate_mapper=mapper)
        assert signal.score < 0.2
        assert len(signal.regions) == 0


def test_copy_move_tampered_detected():
    # Verify that the genuine copy_move sample still receives a high score
    tampered_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples", "tampered", "copy_move.jpg")
    if os.path.exists(tampered_path):
        with open(tampered_path, "rb") as f:
            img_bytes = f.read()
        orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "copy_move.jpg")
        signal = analyze_copy_move(work, coordinate_mapper=mapper)
        assert signal.score >= 0.4
        assert len(signal.regions) >= 1
