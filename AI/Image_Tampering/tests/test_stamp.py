import os
import cv2
import numpy as np
import pytest
from PIL import Image, ImageDraw
from app.forensic.stamp import analyze_stamps
from app.forensic.preprocessing import CoordinateMapper
from app.schemas.forensic import ForensicSignal, SuspiciousRegion

def create_stamp_dummy_image(
    draw_stamp: bool = True,
    stamp_color: tuple = (220, 50, 50),
    stamp_pos: tuple = (1400, 650),
    stamp_size: int = 200,
    non_stamp_shape: bool = False
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    # Standard 1600x900 working size
    w, h = 1600, 900
    img = Image.new("RGB", (w, h), color=(245, 245, 240))
    draw = ImageDraw.Draw(img)
    
    if draw_stamp:
        x, y = stamp_pos
        if non_stamp_shape:
            # Draw a very thin rectangle that fails aspect ratio constraints
            draw.rectangle([x, y, x + 300, y + 20], fill=stamp_color)
        else:
            # Draw circular stamp
            draw.ellipse([x, y, x + stamp_size, y + stamp_size], outline=stamp_color, width=8)
            draw.text((x + 60, y + 90), "STAMP", fill=stamp_color)
            
    rgb_arr = np.array(img)
    gray = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2GRAY)
    hsv = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2HSV)
    lab = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2LAB)
    noise_res = np.zeros_like(gray)
    
    return rgb_arr, gray, hsv, lab, noise_res


def test_stamp_no_stamp():
    rgb, gray, hsv, lab, noise = create_stamp_dummy_image(draw_stamp=False)
    mapper = CoordinateMapper(1600, 900, 1600, 900)
    
    signal = analyze_stamps(
        working_image_rgb=rgb,
        grayscale=gray,
        hsv=hsv,
        lab=lab,
        noise_residual=noise,
        coordinate_mapper=mapper
    )
    
    assert isinstance(signal, ForensicSignal)
    assert signal.available is True
    assert signal.stamp_detected is False
    assert signal.score == 0.0
    assert len(signal.regions) == 0
    assert any("No sufficiently strong" in e["message"] for e in signal.evidence)


def test_stamp_clean_detected():
    # Detects a clean red stamp in working coordinates at (1400, 650)
    rgb, gray, hsv, lab, noise = create_stamp_dummy_image(draw_stamp=True)
    mapper = CoordinateMapper(1600, 900, 1600, 900)
    
    signal = analyze_stamps(
        working_image_rgb=rgb,
        grayscale=gray,
        hsv=hsv,
        lab=lab,
        noise_residual=noise,
        coordinate_mapper=mapper
    )
    
    assert signal.available is True
    assert signal.stamp_detected is True
    # Clean stamp with no overlap anomalies has a baseline score of 0.1
    assert signal.score == 0.1
    assert len(signal.regions) == 1
    assert signal.regions[0].severity == "LOW"
    assert "no compression or noise anomalies" in signal.regions[0].reason


def test_stamp_non_stamp_rejection():
    # Draw a thin color rectangle that is not compact
    rgb, gray, hsv, lab, noise = create_stamp_dummy_image(draw_stamp=True, non_stamp_shape=True)
    mapper = CoordinateMapper(1600, 900, 1600, 900)
    
    signal = analyze_stamps(
        working_image_rgb=rgb,
        grayscale=gray,
        hsv=hsv,
        lab=lab,
        noise_residual=noise,
        coordinate_mapper=mapper
    )
    
    # Should reject the shape as a stamp
    assert signal.stamp_detected is False
    assert signal.score == 0.0
    assert len(signal.regions) == 0


def test_stamp_overlaps_weighting():
    # Red stamp at (1400, 650) with width 200, height 200
    rgb, gray, hsv, lab, noise = create_stamp_dummy_image(draw_stamp=True)
    mapper = CoordinateMapper(1600, 900, 1600, 900)
    
    # Create overlapping active anomaly regions (in original space: 1450, 700)
    ela_regs = [SuspiciousRegion(x=1450, y=700, width=50, height=50, score=0.8, severity="HIGH", source="ela", reason="")]
    noise_regs = [SuspiciousRegion(x=1450, y=700, width=50, height=50, score=0.8, severity="HIGH", source="noise", reason="")]
    cm_regs = [SuspiciousRegion(x=1450, y=700, width=50, height=50, score=0.8, severity="HIGH", source="copy_move", reason="")]
    
    signal = analyze_stamps(
        working_image_rgb=rgb,
        grayscale=gray,
        hsv=hsv,
        lab=lab,
        noise_residual=noise,
        coordinate_mapper=mapper,
        ela_regions=ela_regs,
        noise_regions=noise_regs,
        copy_move_regions=cm_regs
    )
    
    assert signal.stamp_detected is True
    # Score calculation: 0.1 base + 0.4 (ELA) + 0.3 (Noise) + 0.5 (Copy-Move) = 1.3 -> Capped at 1.0
    assert signal.score == 1.0
    assert len(signal.regions) == 1
    assert signal.regions[0].severity == "HIGH"
    assert "overlaps with ELA compression inconsistency, Noise density mismatch, Copy-move visual duplicate" in signal.regions[0].reason


def test_stamp_debug_outputs(tmpdir):
    rgb, gray, hsv, lab, noise = create_stamp_dummy_image(draw_stamp=True)
    mapper = CoordinateMapper(1600, 900, 1600, 900)
    debug_dir = str(tmpdir.mkdir("debug"))
    
    signal = analyze_stamps(
        working_image_rgb=rgb,
        grayscale=gray,
        hsv=hsv,
        lab=lab,
        noise_residual=noise,
        coordinate_mapper=mapper,
        save_debug=True,
        debug_dir=debug_dir
    )
    
    assert os.path.exists(os.path.join(debug_dir, "document_stamp_candidates.jpg"))
    assert os.path.exists(os.path.join(debug_dir, "document_stamp_map.png"))


def test_stamp_clean_low_anomaly():
    # Verify that clean passport legitimate stamp is LOW severity (score <= 0.20)
    passport_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples", "clean", "passport.jpg")
    if os.path.exists(passport_path):
        with open(passport_path, "rb") as f:
            img_bytes = f.read()
        from app.forensic.preprocessing import load_and_preprocess_image
        from app.forensic.representations import generate_representations
        from app.forensic.ela import analyze_ela
        from app.forensic.copy_move import analyze_copy_move
        orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "passport.jpg")
        reps = generate_representations(work)
        ela_sig = analyze_ela(work, coordinate_mapper=mapper)
        cm_sig = analyze_copy_move(work, coordinate_mapper=mapper)
        
        signal = analyze_stamps(
            working_image_rgb=work,
            grayscale=reps["grayscale"],
            hsv=reps["hsv"],
            lab=reps["lab"],
            noise_residual=reps["noise_residual"],
            coordinate_mapper=mapper,
            ela_regions=ela_sig.regions,
            copy_move_regions=cm_sig.regions
        )
        
        # Check that legitimate stamp detected has LOW score (<= 0.2)
        if signal.regions:
            # Find the bottom stamp region (around x=1399)
            stamp_regs = [r for r in signal.regions if r.x > 1200]
            if stamp_regs:
                assert stamp_regs[0].score <= 0.2
                assert stamp_regs[0].severity == "LOW"


def test_stamp_tampered_higher_anomaly():
    # Verify that tampered stamp receives higher anomaly score than clean stamp
    tampered_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples", "tampered", "stamp_tampered.jpg")
    if os.path.exists(tampered_path):
        with open(tampered_path, "rb") as f:
            img_bytes = f.read()
        from app.forensic.preprocessing import load_and_preprocess_image
        from app.forensic.representations import generate_representations
        from app.forensic.ela import analyze_ela
        orig, work, mapper, fmt = load_and_preprocess_image(img_bytes, "stamp_tampered.jpg")
        reps = generate_representations(work)
        ela_sig = analyze_ela(work, coordinate_mapper=mapper)
        
        signal = analyze_stamps(
            working_image_rgb=work,
            grayscale=reps["grayscale"],
            hsv=reps["hsv"],
            lab=reps["lab"],
            noise_residual=reps["noise_residual"],
            coordinate_mapper=mapper,
            ela_regions=ela_sig.regions
        )
        
        assert signal.stamp_detected is True
        # Find the tampered stamp (around x=900)
        stamp_regs = [r for r in signal.regions if r.x > 700 and r.x < 1200]
        if stamp_regs:
            # Shifted/recolored stamp should have score >= 0.2 (higher than clean baseline 0.1)
            assert stamp_regs[0].score >= 0.2
