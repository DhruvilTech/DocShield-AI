"""
Tests for Generalized Multi-Modality Image & PDF Tampering Detection
====================================================================
Verifies robust detection across unseen synthetic images, multi-page PDFs,
scanned documents, table structures, QR codes, and digital alterations.
"""

import os
import cv2
import numpy as np
import pytest
from PIL import Image
import io

from image_tampering.forensic.pipeline import run_forensic_pipeline


def _add_realistic_scanner_noise(img: np.ndarray, std: float = 6.0) -> np.ndarray:
    """Adds subtle, realistic scanner sensor noise to synthetic digital canvases."""
    noise = np.random.normal(0, std, img.shape).astype(np.int16)
    return np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def test_clean_table_document_not_flagged():
    """Verify that a clean document containing table structures has low content alteration score."""
    canvas = np.full((600, 800, 3), 245, dtype=np.uint8)
    
    # Title
    cv2.putText(canvas, "BANK ACCOUNT STATEMENT", (220, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (30, 30, 30), 2)
    
    # Draw a 5x4 table with horizontal and vertical grid lines
    top_y, bottom_y = 120, 480
    left_x, right_x = 60, 740
    
    # Horizontal rules
    for y in np.linspace(top_y, bottom_y, 6, dtype=int):
        cv2.line(canvas, (left_x, y), (right_x, y), (40, 40, 40), thickness=2)
        
    # Vertical rules
    for x in np.linspace(left_x, right_x, 5, dtype=int):
        cv2.line(canvas, (x, top_y), (x, bottom_y), (40, 40, 40), thickness=2)
        
    # Table text
    headers = ["Date", "Description", "Debit", "Credit"]
    for idx, h in enumerate(headers):
        cv2.putText(canvas, h, (left_x + idx * 160 + 20, top_y + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (30, 30, 30), 1)
        
    canvas = _add_realistic_scanner_noise(canvas)
    
    buf = io.BytesIO()
    Image.fromarray(canvas).save(buf, format="PNG")
    
    res = run_forensic_pipeline(buf.getvalue(), filename="bank_statement.png")
    alt_score = res.signals.content_alteration.score if res.signals.content_alteration else 0.0
    assert alt_score < 0.20, f"Clean table document had false content alteration score {alt_score}"


def test_clean_qr_code_document_not_flagged():
    """Verify that a document containing a 2D QR code / barcode has low content alteration score."""
    canvas = np.full((500, 500, 3), 245, dtype=np.uint8)
    
    # Draw simulated 2D QR code block (checkerboard / matrix)
    qr_box = np.random.choice([0, 255], size=(120, 120), p=[0.5, 0.5]).astype(np.uint8)
    # Finder patterns
    qr_box[:30, :30] = 0; qr_box[5:25, 5:25] = 255; qr_box[10:20, 10:20] = 0
    qr_box[-30:, :30] = 0; qr_box[-25:-5, 5:25] = 255; qr_box[-20:-10, 10:20] = 0
    qr_box[:30, -30:] = 0; qr_box[5:25, -25:-5] = 255; qr_box[10:20, -20:-10] = 0
    
    canvas[150:270, 190:310] = cv2.cvtColor(qr_box, cv2.COLOR_GRAY2RGB)
    cv2.putText(canvas, "SCAN FOR VERIFICATION", (110, 340), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (30, 30, 30), 2)
    
    canvas = _add_realistic_scanner_noise(canvas)
    
    buf = io.BytesIO()
    Image.fromarray(canvas).save(buf, format="PNG")
    
    res = run_forensic_pipeline(buf.getvalue(), filename="qr_card.png")
    alt_score = res.signals.content_alteration.score if res.signals.content_alteration else 0.0
    assert alt_score < 0.20, f"Clean QR document had false content alteration score {alt_score}"


def test_multipage_pdf_single_tampered_page():
    """Verify that in a 2-page PDF where Page 1 is clean and Page 2 is tampered, the document is flagged."""
    # Page 1: Clean document
    canvas1 = np.full((800, 600, 3), 250, dtype=np.uint8)
    cv2.putText(canvas1, "OFFICIAL INVOICE - PAGE 1", (50, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.putText(canvas1, "CUSTOMER: ACME CORP", (50, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    cv2.putText(canvas1, "TOTAL AMOUNT: $10,500.00", (50, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    img1 = Image.fromarray(canvas1)
    
    # Page 2: Tampered with digital blue pen defacement crossing invoice data
    canvas2 = np.full((800, 600, 3), 250, dtype=np.uint8)
    cv2.putText(canvas2, "PAGE 2 - PAYMENT DETAILS", (50, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    cv2.putText(canvas2, "ACCOUNT: 9876543210", (50, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    cv2.putText(canvas2, "ROUTING: 112233445", (50, 190), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    
    # Digital blue scribble defacement
    pts = np.array([[50, 130], [180, 150], [320, 120], [250, 200], [400, 180]], np.int32)
    cv2.polylines(canvas2, [pts], False, (0, 140, 240), thickness=8, lineType=cv2.LINE_AA)
    img2 = Image.fromarray(canvas2)
    
    # Save as 2-page PDF
    buf = io.BytesIO()
    img1.save(buf, format="PDF", save_all=True, append_images=[img2])
    pdf_bytes = buf.getvalue()
    
    result = run_forensic_pipeline(pdf_bytes, filename="invoice_tampered.pdf")
    assert result.fusion.score >= 0.50, f"Expected tampered PDF score >= 0.50, got {result.fusion.score}"
    assert result.fusion.risk_level in ["HIGH", "CRITICAL"]
    assert result.signals.content_alteration is not None
    assert result.signals.content_alteration.score >= 0.70
