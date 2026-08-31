"""
Unit & Integration Tests for Forensic Text Tampering Detection
==============================================================
Tests generalized, reference-free text tampering detection across:
- Clean scanned documents, bold headings, and table structures (zero false alarms)
- Digit alterations and partial character modifications (e.g., 2025 -> 2026)
- Inserted text phrases with background inpainting / noise voids
- Multi-page PDFs with page-level text tampering attribution
- Fusion engine integration and explanation generation
"""

import os
import cv2
import numpy as np
import pytest
from PIL import Image
import io

from image_tampering.forensic.text_tampering import analyze_text_tampering
from image_tampering.forensic.pipeline import run_forensic_pipeline
from image_tampering.forensic.representations import generate_representations
from image_tampering.forensic.preprocessing import load_and_preprocess_image


def _add_realistic_scanner_noise(img: np.ndarray, std: float = 5.0) -> np.ndarray:
    """Adds realistic scanner sensor noise across document substrate."""
    noise = np.random.normal(0, std, img.shape).astype(np.int16)
    return np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def test_clean_scanned_document_text_tampering_low():
    """Verify that a clean authentic document with multiple text lines produces low text tampering score."""
    canvas = np.full((700, 800, 3), 245, dtype=np.uint8)
    
    cv2.putText(canvas, "CERTIFICATE OF EMPLOYMENT", (180, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (20, 20, 20), 2)
    cv2.putText(canvas, "This is to certify that John Doe has been employed", (60, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    cv2.putText(canvas, "as a Senior Systems Engineer since January 15, 2021.", (60, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    cv2.putText(canvas, "Annual Salary: $125,000.00 USD", (60, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    cv2.putText(canvas, "Department: Infrastructure & Security", (60, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    cv2.putText(canvas, "Authorized Signature: Jane Smith, VP Human Resources", (60, 350), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    
    # Uniform scanner noise
    canvas = _add_realistic_scanner_noise(canvas, std=6.0)
    
    buf = io.BytesIO()
    Image.fromarray(canvas).save(buf, format="PNG")
    
    result = run_forensic_pipeline(buf.getvalue(), filename="clean_cert.png")
    
    assert result.signals.text_tampering is not None
    assert result.signals.text_tampering.available is True
    assert result.signals.text_tampering.score < 0.30, f"Expected clean doc text tampering < 0.30, got {result.signals.text_tampering.score}"
    assert result.fusion.risk_level == "LOW"


def test_digit_replacement_and_erasure_detected():
    """Verify that a modified digit with erased background patch and mismatched antialiasing is detected."""
    canvas = np.full((600, 800, 3), 245, dtype=np.uint8)
    
    # Base text
    cv2.putText(canvas, "OFFICIAL INVOICE", (260, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (20, 20, 20), 2)
    cv2.putText(canvas, "Invoice Number: INV-884920", (60, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (30, 30, 30), 1)
    cv2.putText(canvas, "Due Date: 12/31/2025", (60, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (30, 30, 30), 1)
    cv2.putText(canvas, "Total Payable: $", (60, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (30, 30, 30), 1)
    cv2.putText(canvas, "1,500.00", (220, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (30, 30, 30), 1)
    
    # Add scanner noise to authentic baseline
    canvas = _add_realistic_scanner_noise(canvas, std=7.0)
    
    # Tampering: Erase the '1' and replace with a digitally rendered '9' with unnaturally smooth whiteout box
    # Whiteout patch around "$ 1,"
    canvas[190:225, 215:240] = 250  # noise void patch
    # Superimpose high-contrast synthetic digit '9'
    cv2.putText(canvas, "9", (220, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 2)
    
    buf = io.BytesIO()
    Image.fromarray(canvas).save(buf, format="PNG")
    
    result = run_forensic_pipeline(buf.getvalue(), filename="invoice_altered_digit.png")
    
    assert result.signals.text_tampering is not None
    assert result.signals.text_tampering.available is True
    assert result.signals.text_tampering.score >= 0.40, f"Expected text tampering score >= 0.40, got {result.signals.text_tampering.score}"
    assert len(result.signals.text_tampering.regions) > 0
    assert any("text_tampering" in r.source for r in result.regions)


def test_inserted_text_phrase_inpainted_patch_detected():
    """Verify that an inserted text phrase over an inpainted rectangular region is detected."""
    canvas = np.full((600, 800, 3), 240, dtype=np.uint8)
    
    cv2.putText(canvas, "COMMERCIAL LEASE AGREEMENT", (200, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (20, 20, 20), 2)
    cv2.putText(canvas, "Section 4. Monthly Base Rent", (60, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (30, 30, 30), 1)
    cv2.putText(canvas, "The Tenant shall pay Landlord base rent in the amount of:", (60, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    cv2.putText(canvas, "Section 5. Security Deposit and Terms", (60, 260), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (30, 30, 30), 1)
    
    canvas = _add_realistic_scanner_noise(canvas, std=6.5)
    
    # Tampering: Inserted smooth patch with synthetic text
    canvas[190:225, 60:450] = 248  # Inpainted smoothed box
    cv2.putText(canvas, "WAIVED AND NOT REQUIRED FOR 2026", (65, 212), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)
    
    buf = io.BytesIO()
    Image.fromarray(canvas).save(buf, format="PNG")
    
    result = run_forensic_pipeline(buf.getvalue(), filename="lease_tampered_clause.png")
    
    assert result.signals.text_tampering is not None
    assert result.signals.text_tampering.score >= 0.45, f"Expected text tampering score >= 0.45, got {result.signals.text_tampering.score}"
    assert result.fusion.risk_level in ["MEDIUM", "HIGH", "CRITICAL"]


def test_multipage_pdf_text_tampering_page_attribution():
    """Verify that a 2-page PDF where Page 2 has text alteration is flagged with page 2 attribution."""
    # Page 1: Clean
    canvas1 = np.full((700, 600, 3), 245, dtype=np.uint8)
    cv2.putText(canvas1, "INSURANCE POLICY - COVERAGE SUMMARY", (40, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (20, 20, 20), 2)
    cv2.putText(canvas1, "Policyholder: Alice Walker", (40, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    cv2.putText(canvas1, "Policy Number: POL-9920194", (40, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    canvas1 = _add_realistic_scanner_noise(canvas1, std=8.0)
    img1 = Image.fromarray(canvas1)
    
    # Page 2: Tampered with altered limit
    canvas2 = np.full((700, 600, 3), 245, dtype=np.uint8)
    cv2.putText(canvas2, "PAGE 2 - LIMITS OF LIABILITY", (40, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (20, 20, 20), 2)
    cv2.putText(canvas2, "Property Damage Limit: $500,000", (40, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    cv2.putText(canvas2, "Deductible: $", (40, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    cv2.putText(canvas2, "2,500.00", (160, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1)
    canvas2 = _add_realistic_scanner_noise(canvas2, std=8.0)
    
    # Alter deductible on page 2: smooth box + sharp zeroing
    canvas2[150:200, 150:360] = 250
    cv2.putText(canvas2, "0.00 (WAIVED)", (160, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    img2 = Image.fromarray(canvas2)
    
    buf = io.BytesIO()
    img1.save(buf, format="PDF", resolution=100.0, save_all=True, append_images=[img2])
    pdf_bytes = buf.getvalue()
    
    result = run_forensic_pipeline(pdf_bytes, filename="insurance_policy.pdf")
    
    assert result.signals.text_tampering is not None
    assert result.signals.text_tampering.score >= 0.40
    # Confirm page 2 is flagged in fused regions
    fused_pages = [r.page for r in result.regions if r.page is not None]
    assert 2 in fused_pages, f"Expected page 2 in detected regions, got {fused_pages}"


def test_clean_table_and_qr_not_flagged_by_text_tampering():
    """Verify that table structures and QR codes do not trigger false text tampering alerts."""
    canvas = np.full((600, 700, 3), 245, dtype=np.uint8)
    
    # Table grid
    for y in [100, 150, 200, 250, 300]:
        cv2.line(canvas, (50, y), (650, y), (50, 50, 50), 1)
    for x in [50, 200, 400, 650]:
        cv2.line(canvas, (x, 100), (x, 300), (50, 50, 50), 1)
        
    cv2.putText(canvas, "Item", (70, 135), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 1)
    cv2.putText(canvas, "Qty", (220, 135), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 1)
    cv2.putText(canvas, "Price", (420, 135), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 1)
    
    # Synthetic QR pattern
    qr_box = np.random.choice([0, 255], size=(80, 80), p=[0.5, 0.5]).astype(np.uint8)
    canvas[350:430, 280:360] = cv2.cvtColor(qr_box, cv2.COLOR_GRAY2RGB)
    
    canvas = _add_realistic_scanner_noise(canvas, std=6.0)
    
    buf = io.BytesIO()
    Image.fromarray(canvas).save(buf, format="PNG")
    
    result = run_forensic_pipeline(buf.getvalue(), filename="table_doc.png")
    assert result.signals.text_tampering.score < 0.25


def test_text_tampering_schema_compliance():
    """Verify that ForensicSignal fields for text tampering conform to strict pydantic schemas."""
    canvas = np.full((400, 500, 3), 245, dtype=np.uint8)
    cv2.putText(canvas, "Sample Text", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 1)
    
    reps = generate_representations(canvas)
    sig = analyze_text_tampering(
        working_image_rgb=canvas,
        grayscale=reps["grayscale"],
        hsv=reps["hsv"],
        lab=reps["lab"],
        noise_residual=reps["noise_residual"]
    )
    
    assert sig.name == "text_tampering"
    assert isinstance(sig.score, float)
    assert isinstance(sig.available, bool)
    assert isinstance(sig.regions, list)
    assert isinstance(sig.evidence, list)
    assert isinstance(sig.statistics, dict)
