import io
import os
import numpy as np
import pytest
from PIL import Image, ImageDraw
import pypdfium2 as pdfium

from image_tampering.forensic.preprocessing import (
    is_pdf,
    load_and_preprocess_pdf,
    validate_image_file,
)
from image_tampering.forensic.pipeline import (
    run_forensic_pipeline,
    run_forensic_pipeline_from_file,
)
from image_tampering.schemas.forensic import ForensicResult


def create_clean_pdf_bytes(width: int = 600, height: int = 800, text: str = "Clean Document") -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((50, 50), text, fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


def create_digital_invoice_pdf_bytes() -> bytes:
    img = Image.new("RGB", (800, 1100), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, 750, 120], fill=(240, 240, 245), outline=(200, 200, 210))
    draw.text((70, 75), "INVOICE #INV-2026-001", fill=(20, 20, 20))
    for y in range(200, 800, 60):
        draw.line([(50, y), (750, y)], fill=(220, 220, 220), width=1)
        draw.text((60, y + 20), f"Item description line at row {y}", fill=(50, 50, 50))
        draw.text((650, y + 20), "$150.00", fill=(50, 50, 50))
    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


def create_scanned_clean_pdf_bytes() -> bytes:
    np.random.seed(100)
    bg = np.full((1000, 750, 3), 248, dtype=np.uint8)
    noise = np.random.normal(0, 3, bg.shape).astype(np.int16)
    scanned = np.clip(bg.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(scanned)
    draw = ImageDraw.Draw(img)
    draw.text((60, 60), "OFFICIAL UNIVERSITY TRANSCRIPT", fill=(30, 30, 30))
    draw.text((60, 120), "Student Name: John Doe", fill=(40, 40, 40))
    draw.text((60, 160), "Degree: Bachelor of Science in Computer Science", fill=(40, 40, 40))
    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


def create_tampered_pdf_bytes(width: int = 600, height: int = 800) -> bytes:
    np.random.seed(42)
    img = Image.new("RGB", (width, height), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    draw.text((50, 50), "Official Document", fill=(0, 0, 0))

    # Create high-texture noise stamp block
    patch = np.random.randint(0, 255, (80, 80, 3), dtype=np.uint8)
    patch_img = Image.fromarray(patch)

    # Duplicate patch at two distinct locations (copy-move)
    img.paste(patch_img, (100, 200))
    img.paste(patch_img, (300, 450))

    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


def create_tampered_spliced_pdf_bytes() -> bytes:
    cert_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "image_tampering",
        "upload",
        "certificate_friend_photo.jpg.png",
    )
    if os.path.exists(cert_path):
        im = Image.open(cert_path)
        if im.mode in ('RGBA', 'LA'):
            bg = Image.new('RGB', im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert('RGB')
        buf = io.BytesIO()
        im.save(buf, format='PDF', quality=100)
        return buf.getvalue()

    img = Image.new("RGB", (800, 1000), color=(250, 250, 250))
    draw = ImageDraw.Draw(img)
    draw.text((60, 60), "IDENTITY CERTIFICATE", fill=(0, 0, 0))
    draw.rectangle([480, 130, 670, 350], outline=(0, 0, 0), width=3)
    np.random.seed(99)
    foreign_patch = np.random.randint(20, 220, (200, 170, 3), dtype=np.uint8)
    patch_img = Image.fromarray(foreign_patch)
    img.paste(patch_img, (490, 140))
    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


def create_multipage_pdf_bytes() -> bytes:
    # Page 1: Clean
    img1 = Image.new("RGB", (600, 800), color=(255, 255, 255))
    draw1 = ImageDraw.Draw(img1)
    draw1.text((50, 50), "Page 1 - Clean Content", fill=(0, 0, 0))

    # Page 2: Tampered with copy-move
    np.random.seed(42)
    img2 = Image.new("RGB", (600, 800), color=(240, 240, 240))
    draw2 = ImageDraw.Draw(img2)
    draw2.text((50, 50), "Page 2 - Tampered Content", fill=(0, 0, 0))

    patch = np.random.randint(0, 255, (80, 80, 3), dtype=np.uint8)
    patch_img = Image.fromarray(patch)
    img2.paste(patch_img, (100, 200))
    img2.paste(patch_img, (300, 450))

    buf = io.BytesIO()
    img1.save(buf, format="PDF", save_all=True, append_images=[img2])
    return buf.getvalue()


def create_clean_multipage_pdf_bytes() -> bytes:
    img1 = Image.new("RGB", (600, 800), color=(255, 255, 255))
    draw1 = ImageDraw.Draw(img1)
    draw1.text((50, 50), "Page 1 - Clean Content", fill=(0, 0, 0))

    img2 = Image.new("RGB", (600, 800), color=(255, 255, 255))
    draw2 = ImageDraw.Draw(img2)
    draw2.text((50, 50), "Page 2 - Clean Content", fill=(0, 0, 0))

    buf = io.BytesIO()
    img1.save(buf, format="PDF", save_all=True, append_images=[img2])
    return buf.getvalue()


def test_is_pdf_detection():
    assert is_pdf(b"", "document.pdf") is True
    assert is_pdf(b"", "document.PDF") is True
    assert is_pdf(b"%PDF-1.4\nsomething", "test.jpg") is True
    assert is_pdf(b"\xff\xd8\xff", "test.jpg") is False
    assert is_pdf(b"\x89PNG\r\n", "test.png") is False


def test_load_and_preprocess_pdf():
    pdf_bytes = create_clean_pdf_bytes(600, 800)
    pages = load_and_preprocess_pdf(pdf_bytes, filename="clean.pdf")
    assert len(pages) == 1
    orig_rgb, work_rgb, mapper, page_num = pages[0]
    assert page_num == 1
    assert orig_rgb.ndim == 3
    assert orig_rgb.shape[2] == 3
    assert work_rgb.shape == orig_rgb.shape
    assert mapper.scale_x == 1.0


def test_clean_pdf_not_tampered():
    pdf_bytes = create_clean_pdf_bytes(600, 800)
    result: ForensicResult = run_forensic_pipeline(pdf_bytes, filename="clean.pdf")
    assert result.image.format == "PDF"
    assert result.fusion.score is not None
    assert result.fusion.score < 0.35
    assert result.fusion.risk_level == "LOW"


def test_clean_digital_invoice_pdf():
    pdf_bytes = create_digital_invoice_pdf_bytes()
    result: ForensicResult = run_forensic_pipeline(pdf_bytes, filename="invoice.pdf")
    assert result.image.format == "PDF"
    assert result.fusion.score is not None
    assert result.fusion.score < 0.35
    assert result.fusion.risk_level == "LOW"
    assert result.signals.copy_move.score == 0.0


def test_clean_scanned_pdf():
    pdf_bytes = create_scanned_clean_pdf_bytes()
    result: ForensicResult = run_forensic_pipeline(pdf_bytes, filename="scanned.pdf")
    assert result.image.format == "PDF"
    assert result.fusion.score is not None
    assert result.fusion.score < 0.35
    assert result.fusion.risk_level == "LOW"


def test_clean_real_adhaar_pdf():
    real_pdf_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "image_tampering",
        "upload",
        "Adhaar card of dhruv.pdf",
    )
    if not os.path.exists(real_pdf_path):
        pytest.skip(f"Sample file not found: {real_pdf_path}")

    with open(real_pdf_path, "rb") as f:
        pdf_bytes = f.read()

    result: ForensicResult = run_forensic_pipeline(pdf_bytes, filename="Adhaar card of dhruv.pdf")
    assert result.image.format == "PDF"
    assert result.fusion.score is not None
    # Real untampered Aadhaar card must be clean (score < 0.35, risk LOW)
    assert result.fusion.score < 0.35
    assert result.fusion.risk_level == "LOW"
    assert result.signals.copy_move.score == 0.0


def test_synthetic_tampered_pdf():
    pdf_bytes = create_tampered_pdf_bytes(600, 800)
    result: ForensicResult = run_forensic_pipeline(pdf_bytes, filename="tampered.pdf")
    assert result.image.format == "PDF"
    assert result.fusion.score is not None
    assert result.fusion.score >= 0.50
    assert result.fusion.risk_level in ("HIGH", "CRITICAL")
    assert result.signals.copy_move is not None
    assert result.signals.copy_move.score >= 0.50


def test_spliced_tampered_pdf():
    pdf_bytes = create_tampered_spliced_pdf_bytes()
    result: ForensicResult = run_forensic_pipeline(pdf_bytes, filename="spliced.pdf")
    assert result.image.format == "PDF"
    assert result.fusion.score is not None
    assert result.fusion.score >= 0.50
    assert result.fusion.risk_level in ("HIGH", "CRITICAL")


def test_multipage_pdf_page_attribution():
    pdf_bytes = create_multipage_pdf_bytes()
    result: ForensicResult = run_forensic_pipeline(pdf_bytes, filename="multipage.pdf")
    assert result.image.format == "PDF"
    assert result.fusion.score is not None
    assert result.fusion.score >= 0.50
    # Suspicious regions on page 2
    pages_with_regions = {r.page for r in result.regions}
    assert 2 in pages_with_regions
    if result.fusion.evidence and result.fusion.evidence.fused_regions:
        fused_pages = {fr.page for fr in result.fusion.evidence.fused_regions}
        assert 2 in fused_pages


def test_clean_multipage_pdf():
    pdf_bytes = create_clean_multipage_pdf_bytes()
    result: ForensicResult = run_forensic_pipeline(pdf_bytes, filename="clean_multi.pdf")
    assert result.image.format == "PDF"
    assert result.fusion.score is not None
    assert result.fusion.score < 0.35
    assert result.fusion.risk_level == "LOW"


def test_corrupted_pdf_raises_error():
    corrupt_bytes = b"%PDF-1.4\ncorrupted_pdf_stream_data_12345"
    with pytest.raises(ValueError) as exc_info:
        run_forensic_pipeline(corrupt_bytes, filename="corrupt.pdf")
    assert "Corrupted or invalid PDF" in str(exc_info.value)


def test_empty_pdf_raises_error():
    with pytest.raises(ValueError) as exc_info:
        run_forensic_pipeline(b"", filename="empty.pdf")
    assert "PDF document is empty" in str(exc_info.value)


def test_run_forensic_pipeline_from_file_pdf():
    real_pdf_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "image_tampering",
        "upload",
        "Adhaar card of dhruv.pdf",
    )
    if not os.path.exists(real_pdf_path):
        pytest.skip(f"Sample file not found: {real_pdf_path}")

    result = run_forensic_pipeline_from_file(real_pdf_path)
    assert result.image.format == "PDF"
    assert result.fusion.score < 0.35
    assert result.fusion.risk_level == "LOW"


def test_image_backward_compatibility():
    img = Image.new("RGB", (400, 400), color=(240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    img_bytes = buf.getvalue()

    result = run_forensic_pipeline(img_bytes, filename="test.jpg")
    assert result.image.format in ("JPEG", "JPG")
    assert result.fusion.score is not None


def test_png_bytes_with_pdf_filename_dispatches_to_image():
    """PNG bytes provided with a .pdf filename must safely route to image pipeline instead of crashing."""
    png_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "image_tampering",
        "upload",
        "certificate_friend_photo.jpg.png",
    )
    if not os.path.exists(png_path):
        pytest.skip(f"Sample file not found: {png_path}")

    with open(png_path, "rb") as f:
        png_bytes = f.read()

    result = run_forensic_pipeline(png_bytes, filename="certificate.pdf")
    assert result.image.format == "PNG"
    assert result.fusion.score >= 0.50


def test_pdf_bytes_with_png_filename_dispatches_to_pdf():
    """PDF bytes provided with a .png filename must safely route to PDF pipeline."""
    pdf_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "image_tampering",
        "upload",
        "Adhaar card of dhruv.pdf",
    )
    if not os.path.exists(pdf_path):
        pytest.skip(f"Sample file not found: {pdf_path}")

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    result = run_forensic_pipeline(pdf_bytes, filename="misnamed.png")
    assert result.image.format == "PDF"
    assert result.fusion.score < 0.35
    assert result.fusion.risk_level == "LOW"


def test_consistency_direct_image_vs_pdf():
    """Direct image analysis and PDF wrapping that same image must produce consistent verdicts."""
    p1_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "image_tampering",
        "upload",
        "p1.png",
    )
    if not os.path.exists(p1_path):
        pytest.skip(f"Sample file not found: {p1_path}")

    with open(p1_path, "rb") as f:
        p1_bytes = f.read()

    res_direct = run_forensic_pipeline(p1_bytes, filename="p1.png")

    img = Image.open(p1_path)
    if img.mode in ('RGBA', 'LA'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert('RGB')
    buf = io.BytesIO()
    img.save(buf, format="PDF")
    pdf_bytes = buf.getvalue()

    res_pdf = run_forensic_pipeline(pdf_bytes, filename="p1_wrapped.pdf")

    assert (res_direct.fusion.score < 0.5) == (res_pdf.fusion.score < 0.5)
    assert res_pdf.fusion.score < 0.35


def test_pdf_debug_separate_directory(tmp_path):
    """PDF debug files must be written to pdf_debug/page_XXX without overwriting image debug files."""
    pdf_bytes = create_clean_pdf_bytes(400, 400)
    debug_dir = str(tmp_path / "debug_output")
    
    run_forensic_pipeline(pdf_bytes, filename="clean.pdf", save_debug=True, debug_dir=debug_dir)
    
    pdf_debug_page1 = os.path.join(debug_dir, "pdf_debug", "page_001")
    assert os.path.exists(pdf_debug_page1)
    assert os.path.exists(os.path.join(pdf_debug_page1, "rendered.png"))
