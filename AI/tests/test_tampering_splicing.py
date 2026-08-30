"""
Unit Tests for Phase 4/8 — Splicing & Insertion Detector
=========================================================
Tests:
  1. Splicing detector runs cleanly on genuine document (returns score < 0.35, no false positive).
  2. Splicing detector catches spliced/replaced photo in certificate_friend_photo.jpg.png (returns score >= 0.60, HIGH severity).
  3. QR code / 2D barcode regions are rejected and not flagged as splicing.
  4. Splicing signal integrates cleanly into the forensic pipeline and schemas.
"""

import os
import pytest
import numpy as np

from image_tampering.forensic.preprocessing import load_image_from_file
from image_tampering.forensic.splicing import analyze_splicing, _is_qr_or_barcode
from image_tampering.forensic.pipeline import run_forensic_pipeline_from_file

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "image_tampering", "upload")
SAMPLES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "image_tampering", "samples")


def test_qr_code_rejection():
    """Verify that barcode/QR textures are rejected from splicing candidates."""
    # Synthetic QR-like texture (bimodal high-contrast grayscale, R=G=B)
    val = np.random.choice([0, 255], size=(60, 60, 1))
    qr_synthetic = np.repeat(val, 3, axis=2).astype(np.uint8)
    assert _is_qr_or_barcode(qr_synthetic) is True

    # Natural photo patch (colorful / continuous tone)
    photo_patch = np.zeros((60, 60, 3), dtype=np.uint8)
    photo_patch[:, :, 0] = 200  # Red
    photo_patch[:, :, 1] = 100  # Green
    photo_patch[:, :, 2] = 50   # Blue
    assert _is_qr_or_barcode(photo_patch) is False


def test_splicing_clean_p1_no_false_positive():
    """Verify that genuine document p1.png has 0 splicing anomalies."""
    p1_path = os.path.join(UPLOAD_DIR, "p1.png")
    if not os.path.exists(p1_path):
        pytest.skip("p1.png upload sample not found")

    orig, work, mapper, fmt = load_image_from_file(p1_path)
    signal = analyze_splicing(work, orig, mapper)

    assert signal.available is True
    assert signal.name == "splicing"
    assert signal.score < 0.35
    assert len(signal.regions) == 0


def test_splicing_certificate_friend_photo_detected():
    """Verify that certificate_friend_photo.jpg.png is correctly flagged with splicing."""
    cert_path = os.path.join(UPLOAD_DIR, "certificate_friend_photo.jpg.png")
    if not os.path.exists(cert_path):
        pytest.skip("certificate_friend_photo.jpg.png not found")

    orig, work, mapper, fmt = load_image_from_file(cert_path)
    signal = analyze_splicing(work, orig, mapper)

    assert signal.available is True
    assert signal.score >= 0.60
    assert len(signal.regions) >= 1
    # Check that the region points to the photo area (around x=350, y=100)
    photo_reg = signal.regions[0]
    assert 300 <= photo_reg.x <= 400
    assert 80 <= photo_reg.y <= 150
    assert photo_reg.severity == "HIGH"


def test_splicing_pipeline_fusion_integration():
    """Verify end-to-end pipeline execution with splicing signal fusion."""
    cert_path = os.path.join(UPLOAD_DIR, "certificate_friend_photo.jpg.png")
    if not os.path.exists(cert_path):
        pytest.skip("certificate_friend_photo.jpg.png not found")

    result = run_forensic_pipeline_from_file(cert_path)
    assert result.signals.splicing is not None
    assert result.signals.splicing.available is True
    assert result.signals.splicing.score >= 0.60

    # Overall fusion score must reflect HIGH / CRITICAL risk (>= 60)
    assert result.fusion.evidence.overall_score >= 60
    assert result.fusion.evidence.overall_level in ("HIGH", "CRITICAL")
