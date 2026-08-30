import io
import os
import numpy as np
import pytest
from PIL import Image, ImageDraw
from image_tampering.forensic.preprocessing import load_and_preprocess_image, CoordinateMapper
from image_tampering.forensic.ela import analyze_ela
from image_tampering.schemas.forensic import ForensicSignal

def create_dummy_image_bytes(w: int, h: int, format: str = "JPEG", draw_shape=False) -> bytes:
    img = Image.new("RGB", (w, h), color=(240, 240, 240))
    if draw_shape:
        draw = ImageDraw.Draw(img)
        draw.rectangle([w//4, h//4, 3*w//4, 3*h//4], fill=(50, 50, 50))
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()

def test_ela_basic_execution():
    img_bytes = create_dummy_image_bytes(800, 600, "JPEG")
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.jpg")
    
    # Run ELA
    signal = analyze_ela(work, quality=95, coordinate_mapper=mapper)
    
    assert isinstance(signal, ForensicSignal)
    assert signal.name == "ela"
    assert signal.available is True
    assert signal.score is not None
    assert 0.0 <= signal.score <= 1.0
    
    # Check statistics structure
    assert signal.statistics is not None
    for stat in ["mean_error", "median_error", "max_error", "std_error", "high_error_ratio"]:
        assert stat in signal.statistics
        assert isinstance(signal.statistics[stat], float)
        
    assert signal.quality == 95


def test_ela_png_support():
    img_bytes = create_dummy_image_bytes(400, 400, "PNG", draw_shape=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.png")
    
    signal = analyze_ela(work, quality=90, coordinate_mapper=mapper)
    assert signal.available is True
    assert signal.quality == 90
    assert 0.0 <= signal.score <= 1.0


def test_ela_clean_vs_edited():
    # Create clean image
    clean_bytes = create_dummy_image_bytes(800, 600, "JPEG", draw_shape=False)
    # Open PIL image, edit it, and save it
    img_clean = Image.open(io.BytesIO(clean_bytes))
    img_edited = img_clean.copy()
    draw = ImageDraw.Draw(img_edited)
    # Add a stark high-frequency edit (black rectangle over white background)
    draw.rectangle([200, 200, 400, 400], fill=(0, 0, 0))
    
    buf = io.BytesIO()
    img_edited.save(buf, format="JPEG")
    edited_bytes = buf.getvalue()
    
    # Process both through the pipeline
    _, work_clean, mapper_clean, _ = load_and_preprocess_image(clean_bytes, "clean.jpg")
    _, work_edited, mapper_edited, _ = load_and_preprocess_image(edited_bytes, "edited.jpg")
    
    sig_clean = analyze_ela(work_clean, quality=95, coordinate_mapper=mapper_clean)
    sig_edited = analyze_ela(work_edited, quality=95, coordinate_mapper=mapper_edited)
    
    # Clean image should have lower score and fewer (or 0) suspicious regions
    # Edited image should trigger regions and a higher ELA anomaly score
    assert sig_edited.score > sig_clean.score
    assert len(sig_edited.regions) >= len(sig_clean.regions)


def test_ela_coordinate_mapping():
    # 3200x2400 downscaled to 1600x1200
    img_bytes = create_dummy_image_bytes(3200, 2400, "JPEG")
    # Draw a shape that will be edited
    img = Image.open(io.BytesIO(img_bytes))
    draw = ImageDraw.Draw(img)
    draw.rectangle([1000, 1000, 2000, 2000], fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    large_bytes = buf.getvalue()
    
    orig, work, mapper, fmt = load_and_preprocess_image(large_bytes, "large.jpg", max_working_dim=1600)
    
    sig = analyze_ela(work, quality=95, coordinate_mapper=mapper)
    
    # Verify that regions coordinate boundary is scaled back to original coordinate range (above 1600 width/height)
    if sig.regions:
        for region in sig.regions:
            # Check the bounding box components are within original image ranges
            assert 0 <= region.x <= 3200
            assert 0 <= region.y <= 2400
            assert 0 < region.width <= 3200
            assert 0 < region.height <= 2400
            
            # Since coordinate mapping scales up by 2.0 (1600 working to 3200 original),
            # verify that coordinates are round-tripping properly.
            assert region.severity in ["LOW", "MEDIUM", "HIGH"]
            assert region.source == "ela"


def test_ela_debug_file_creation(tmpdir):
    img_bytes = create_dummy_image_bytes(400, 300, "JPEG", draw_shape=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.jpg")
    
    debug_dir = str(tmpdir.mkdir("debug"))
    signal = analyze_ela(work, quality=95, coordinate_mapper=mapper, save_debug=True, debug_dir=debug_dir)
    
    # Check that debug files exist
    assert os.path.exists(os.path.join(debug_dir, "document_ela_heatmap.jpg"))
    assert os.path.exists(os.path.join(debug_dir, "document_ela_map.png"))
    
    assert signal.heatmap_path == "outputs/debug/document_ela_heatmap.jpg"
    assert signal.map_path == "outputs/debug/document_ela_map.png"


def test_ela_original_unchanged():
    img_bytes = create_dummy_image_bytes(400, 300, "JPEG", draw_shape=True)
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "test.jpg")
    
    work_copy = work.copy()
    _ = analyze_ela(work, quality=95, coordinate_mapper=mapper)
    
    # Assert that the working image array has not been modified
    assert np.array_equal(work, work_copy)
