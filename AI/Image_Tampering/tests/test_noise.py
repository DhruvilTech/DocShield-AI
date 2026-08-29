import io
import os
import numpy as np
import pytest
import cv2
from PIL import Image, ImageDraw
from app.forensic.preprocessing import load_and_preprocess_image, CoordinateMapper
from app.forensic.noise import analyze_noise
from app.schemas.forensic import ForensicSignal

def create_dummy_image_bytes(w: int, h: int, format: str = "JPEG", add_noise_patch=False) -> bytes:
    # Cream color background
    img = Image.new("RGB", (w, h), color=(240, 240, 240))
    if add_noise_patch:
        # Generate high variance random noise block (tampering mock) in a specific patch
        np.random.seed(42)
        noise = np.random.randint(0, 256, (h//4, w//4, 3), dtype=np.uint8)
        noise_img = Image.fromarray(noise)
        img.paste(noise_img, (w//2, h//2))
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


def test_noise_basic_execution():
    img_bytes = create_dummy_image_bytes(800, 600, "JPEG")
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.jpg")
    
    # Run Noise analysis
    signal = analyze_noise(work, coordinate_mapper=mapper)
    
    assert isinstance(signal, ForensicSignal)
    assert signal.name == "noise"
    assert signal.available is True
    assert signal.score is not None
    assert 0.0 <= signal.score <= 1.0
    
    # Check statistics
    assert signal.statistics is not None
    for stat in ["mean_noise", "median_noise", "max_noise", "std_noise", "high_anomaly_ratio"]:
        assert stat in signal.statistics
        assert isinstance(signal.statistics[stat], float)


def test_noise_png_support():
    img_bytes = create_dummy_image_bytes(400, 400, "PNG", add_noise_patch=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.png")
    
    signal = analyze_noise(work, coordinate_mapper=mapper)
    assert signal.available is True
    assert 0.0 <= signal.score <= 1.0


def test_noise_clean_vs_edited():
    # Clean image (uniform smooth background)
    clean_bytes = create_dummy_image_bytes(800, 600, "JPEG", add_noise_patch=False)
    # Tampered image (smooth background with a high frequency noise patch inserted)
    tampered_bytes = create_dummy_image_bytes(800, 600, "JPEG", add_noise_patch=True)
    
    _, work_clean, mapper_clean, _ = load_and_preprocess_image(clean_bytes, "clean.jpg")
    _, work_tampered, mapper_tampered, _ = load_and_preprocess_image(tampered_bytes, "tampered.jpg")
    
    sig_clean = analyze_noise(work_clean, coordinate_mapper=mapper_clean)
    sig_tampered = analyze_noise(work_tampered, coordinate_mapper=mapper_tampered)
    
    # Tampered image with noise inconsistency must trigger a higher score
    assert sig_tampered.score > sig_clean.score
    assert len(sig_tampered.regions) >= len(sig_clean.regions)


def test_noise_coordinate_mapping():
    # 3200x2400 downscaled to 1600x1200
    img_bytes = create_dummy_image_bytes(3200, 2400, "JPEG", add_noise_patch=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "large.jpg", max_working_dim=1600)
    
    sig = analyze_noise(work, coordinate_mapper=mapper)
    
    if sig.regions:
        for region in sig.regions:
            # Check mapped boundaries are within original size limits
            assert 0 <= region.x <= 3200
            assert 0 <= region.y <= 2400
            assert 0 < region.width <= 3200
            assert 0 < region.height <= 2400
            assert region.severity in ["LOW", "MEDIUM", "HIGH"]
            assert region.source == "noise"


def test_noise_debug_file_creation(tmpdir):
    img_bytes = create_dummy_image_bytes(400, 300, "JPEG", add_noise_patch=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.jpg")
    
    debug_dir = str(tmpdir.mkdir("debug"))
    signal = analyze_noise(work, coordinate_mapper=mapper, save_debug=True, debug_dir=debug_dir)
    
    # Check that debug files exist
    assert os.path.exists(os.path.join(debug_dir, "document_noise_anomaly_map.png"))
    assert os.path.exists(os.path.join(debug_dir, "document_noise_heatmap.jpg"))
    
    assert signal.heatmap_path == "outputs/debug/document_noise_heatmap.jpg"
    assert signal.map_path == "outputs/debug/document_noise_anomaly_map.png"


def test_noise_original_unchanged():
    img_bytes = create_dummy_image_bytes(400, 300, "JPEG", add_noise_patch=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.jpg")
    
    work_copy = work.copy()
    _ = analyze_noise(work, coordinate_mapper=mapper)
    
    # Assert that the working image array has not been modified
    assert np.array_equal(work, work_copy)
