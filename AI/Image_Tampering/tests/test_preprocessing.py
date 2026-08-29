import pytest
import io
import numpy as np
from PIL import Image
from app.forensic.preprocessing import (
    load_and_preprocess_image,
    CoordinateMapper,
    MIN_DIM,
    MAX_DIM
)

def create_dummy_image_bytes(w: int, h: int, format: str = "JPEG", color="red", mode="RGB") -> bytes:
    img = Image.new(mode, (w, h), color=color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()

def test_coordinate_mapper():
    # Downscaling from 3200x2400 to 1600x1200 (scale = 0.5)
    mapper = CoordinateMapper(3200, 2400, 1600, 1200)
    
    assert mapper.scale_x == 0.5
    assert mapper.scale_y == 0.5
    
    # Test point mapping
    wx, wy = mapper.to_working_coords(100, 200)
    assert wx == 50
    assert wy == 100
    
    ox, oy = mapper.to_original_coords(50, 100)
    assert ox == 100
    assert oy == 200

    # Test bounding box mapping
    bx, by, bw, bh = mapper.box_to_working(100, 200, 400, 600)
    assert bx == 50
    assert by == 100
    assert bw == 200
    assert bh == 300

    ox, oy, ow, oh = mapper.box_to_original(50, 100, 200, 300)
    assert ox == 100
    assert oy == 200
    assert ow == 400
    assert oh == 600


def test_load_valid_jpeg():
    img_bytes = create_dummy_image_bytes(800, 600, "JPEG")
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "passport.jpg")
    
    assert fmt.upper() in ("JPEG", "JPG")
    assert orig.shape == (600, 800, 3)
    assert work.shape == (600, 800, 3)  # No resizing needed (< 1600)
    assert mapper.scale_x == 1.0
    assert mapper.scale_y == 1.0


def test_load_valid_png():
    img_bytes = create_dummy_image_bytes(800, 600, "PNG")
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "passport.png")
    
    assert fmt.upper() == "PNG"
    assert orig.shape == (600, 800, 3)
    assert work.shape == (600, 800, 3)


def test_load_valid_webp():
    img_bytes = create_dummy_image_bytes(800, 600, "WEBP")
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "passport.webp")
    
    assert fmt.upper() == "WEBP"
    assert orig.shape == (600, 800, 3)


def test_corrupted_image_raises_error():
    corrupt_bytes = b"not_an_image_at_all_12345"
    with pytest.raises(ValueError) as exc_info:
        load_and_preprocess_image(corrupt_bytes, "passport.jpg")
    assert "Corrupted or invalid image" in str(exc_info.value)


def test_too_small_image_raises_error():
    # MIN_DIM is 10, so let's try 5x5
    img_bytes = create_dummy_image_bytes(MIN_DIM - 2, MIN_DIM - 2, "JPEG")
    with pytest.raises(ValueError) as exc_info:
        load_and_preprocess_image(img_bytes, "tiny.jpg")
    assert "resolution too small" in str(exc_info.value)


def test_large_image_downscaling():
    # 3200x2400 should be scaled down to 1600x1200
    img_bytes = create_dummy_image_bytes(3200, 2400, "JPEG")
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "large.jpg", max_working_dim=1600)
    
    assert orig.shape == (2400, 3200, 3)
    assert work.shape == (1200, 1600, 3)  # Downscaling preserved aspect ratio
    assert mapper.scale_x == 0.5
    assert mapper.scale_y == 0.5


def test_grayscale_image_loading():
    # Create L mode image (grayscale)
    img_bytes = create_dummy_image_bytes(400, 300, "JPEG", color=128, mode="L")
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "gray.jpg")
    
    # Check it still converts to 3-channel RGB array for original and working image
    assert orig.shape == (300, 400, 3)
    assert work.shape == (300, 400, 3)


def test_png_with_alpha_background_flattening():
    # RGBA image
    img_bytes = create_dummy_image_bytes(100, 100, "PNG", color=(255, 0, 0, 128), mode="RGBA")
    orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "alpha.png")
    
    # Output must be flattened to RGB (3 channels)
    assert orig.shape == (100, 100, 3)
    assert work.shape == (100, 100, 3)
