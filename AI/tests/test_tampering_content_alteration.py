"""
Tests for Forensic Content Alteration & Digital Defacement Detection
===================================================================
Tests generalized digital brush, defacement, overpainting, and localized alteration detection
across images and PDFs without overfitting or hardcoded heuristics.
"""

import os
import cv2
import numpy as np
import pytest
from PIL import Image
import io

from image_tampering.forensic.content_alteration import analyze_content_alteration
from image_tampering.forensic.pipeline import run_forensic_pipeline
from image_tampering.forensic.representations import generate_representations
from image_tampering.forensic.preprocessing import load_and_preprocess_image, load_and_preprocess_pdf

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "image_tampering", "upload")
SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "..", "image_tampering", "samples")


def test_defaced_image_p3_detection():
    """Verify that defaced document P3.png is flagged as TAMPERED (CRITICAL) with content_alteration signal."""
    p3_path = os.path.join(UPLOAD_DIR, "P3.png")
    if not os.path.exists(p3_path):
        pytest.skip("P3.png not found")
        
    data = open(p3_path, "rb").read()
    result = run_forensic_pipeline(data, filename="P3.png")
    
    assert result.fusion.score >= 0.50, f"P3.png should be detected as tampered, got {result.fusion.score}"
    assert result.fusion.risk_level in ["HIGH", "CRITICAL"]
    assert result.signals.content_alteration is not None
    assert result.signals.content_alteration.score >= 0.70
    assert len(result.signals.content_alteration.regions) > 0


def test_clean_scanned_documents_not_flagged_as_altered():
    """Verify that clean scanned documents (p1.png, p2.jpeg) do not trigger false content alteration."""
    for fn in ["p1.png", "p2.jpeg"]:
        p = os.path.join(UPLOAD_DIR, fn)
        if not os.path.exists(p):
            continue
        data = open(p, "rb").read()
        result = run_forensic_pipeline(data, filename=fn)
        
        # Alteration score should be 0.0 or LOW
        alt_score = result.signals.content_alteration.score if result.signals.content_alteration else 0.0
        assert alt_score < 0.40, f"Clean document {fn} had false content alteration score {alt_score}"
        assert result.fusion.score < 0.35, f"Clean document {fn} overall score {result.fusion.score} should be LOW"


def test_clean_aadhaar_pdf_not_flagged_as_altered():
    """Verify that clean Aadhaar PDF has zero false content alteration regions."""
    pdf_path = os.path.join(UPLOAD_DIR, "Adhaar card of dhruv.pdf")
    if not os.path.exists(pdf_path):
        pytest.skip("Aadhaar PDF not found")
        
    data = open(pdf_path, "rb").read()
    result = run_forensic_pipeline(data, filename="Adhaar card of dhruv.pdf")
    
    alt_score = result.signals.content_alteration.score if result.signals.content_alteration else 0.0
    assert alt_score < 0.20, f"Aadhaar PDF had false content alteration score {alt_score}"
    assert result.fusion.score < 0.20, f"Aadhaar PDF score {result.fusion.score} should be LOW"
    assert result.fusion.risk_level == "LOW"


def test_synthetic_digital_scribble_tampering():
    """Verify that synthetic digital pen/brush strokes drawn over an ID document are detected."""
    # Create base document canvas with neutral background and printed text
    canvas = np.full((400, 600, 3), 245, dtype=np.uint8)
    
    # Add simulated photo rectangle (neutral skin tone with realistic noise)
    photo_canvas = np.full((180, 140, 3), [190, 185, 175], dtype=np.uint8)
    noise = np.random.normal(0, 8, (180, 140, 3)).astype(np.int16)
    photo_canvas = np.clip(photo_canvas.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    canvas[50:230, 40:180] = photo_canvas
    
    # Add simulated printed text
    cv2.putText(canvas, "REPUBLIC OF IDENTITY", (220, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (30, 30, 30), 2)
    cv2.putText(canvas, "NAME: JOHN DOE", (220, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (30, 30, 30), 2)
    cv2.putText(canvas, "ID NO: 9876-5432-1000", (220, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 2)
    
    # Draw freehand digital colored scribble across photo and text
    pts = np.array([[60, 70], [120, 160], [170, 100], [130, 200], [240, 140], [320, 120]], np.int32)
    cv2.polylines(canvas, [pts], False, (220, 40, 30), thickness=8, lineType=cv2.LINE_AA)
    
    # Save to PNG
    buf = io.BytesIO()
    Image.fromarray(canvas).save(buf, format="PNG")
    png_bytes = buf.getvalue()
    
    result = run_forensic_pipeline(png_bytes, filename="tampered_scribble.png")
    assert result.signals.content_alteration is not None
    assert result.signals.content_alteration.score >= 0.70
    assert result.fusion.score >= 0.60
    assert result.fusion.risk_level in ["HIGH", "CRITICAL"]
