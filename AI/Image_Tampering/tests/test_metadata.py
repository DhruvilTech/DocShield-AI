import io
import os
import pytest
import json
from PIL import Image
from app.forensic.metadata import analyze_metadata
from app.schemas.forensic import ForensicSignal

def create_metadata_dummy_bytes(
    software: str = None,
    dt_orig: str = None,
    dt_mod: str = None,
    add_gps: bool = False,
    format: str = "JPEG"
) -> bytes:
    # Generate high texture random noise block
    img = Image.new("RGB", (100, 100), color=(250, 250, 250))
    exif = img.getexif()

    if software:
        exif[305] = software  # Software tag (305)

    if dt_mod:
        exif[306] = dt_mod  # DateTime tag (306)

    if dt_orig:
        sub_ifd = exif.get_ifd(34665)  # Exif sub-IFD (34665)
        sub_ifd[36867] = dt_orig  # DateTimeOriginal tag (36867)

    if add_gps:
        gps_ifd = exif.get_ifd(34853)  # GPS sub-IFD (34853)
        gps_ifd[1] = "N"  # GPSLatitudeRef
        gps_ifd[2] = (45.0, 30.0, 0.0)  # GPSLatitude as floats (Pillow handles packing)

    buf = io.BytesIO()
    if format == "JPEG":
        img.save(buf, format="JPEG", exif=exif)
    else:
        # Use PngInfo to write metadata chunks into PNG format correctly
        from PIL import PngImagePlugin
        meta = PngImagePlugin.PngInfo()
        if software:
            meta.add_text("Software", software)
        img.save(buf, format="PNG", pnginfo=meta)
        
    return buf.getvalue()


def test_metadata_basic_jpeg_exif():
    # Valid JPEG without EXIF
    jpeg_bytes = create_metadata_dummy_bytes()
    signal = analyze_metadata(jpeg_bytes)

    assert isinstance(signal, ForensicSignal)
    assert signal.name == "metadata"
    assert signal.available is True
    assert signal.score == 0.0
    assert signal.statistics["exif_present"] == 0.0
    assert signal.statistics["software_present"] == 0.0


def test_metadata_basic_png():
    # PNG with Software info
    png_bytes = create_metadata_dummy_bytes(software="Adobe Photoshop CC 2019", format="PNG")
    signal = analyze_metadata(png_bytes)

    assert signal.available is True
    assert signal.score == 0.5  # Software anomaly
    assert signal.statistics["software_present"] == 1.0
    assert any("Photoshop" in e["message"] for e in signal.evidence)


def test_metadata_software_detection():
    # GIMP signature
    jpeg_bytes = create_metadata_dummy_bytes(software="GIMP 2.10.30")
    signal = analyze_metadata(jpeg_bytes)

    assert signal.score == 0.5
    assert signal.statistics["software_present"] == 1.0
    assert any("GIMP" in e["message"] for e in signal.evidence)


def test_metadata_gps_privacy():
    # GPS tags present
    jpeg_bytes = create_metadata_dummy_bytes(add_gps=True)
    signal = analyze_metadata(jpeg_bytes)

    assert signal.available is True
    assert signal.statistics["gps_present"] == 1.0
    # Confirm exact coordinates are NOT in the evidence string
    for ev in signal.evidence:
        assert "45" not in ev["message"]  # Coordinate values sanitized
        assert "N" not in ev["message"]
        if "GPS" in ev["message"]:
            assert "sanitized" in ev["message"].lower()


def test_metadata_timestamp_consistency():
    # DateTimeOriginal is AFTER DateTime (2026 original vs 2025 modify) -> Inconsistent
    jpeg_bytes = create_metadata_dummy_bytes(
        dt_orig="2026:08:29 18:00:00",
        dt_mod="2025:08:29 18:00:00"
    )
    signal = analyze_metadata(jpeg_bytes)

    assert signal.score == 0.4
    assert signal.statistics["timestamp_present"] == 1.0
    assert any("timestamp inconsistency" in e["message"].lower() for e in signal.evidence)


def test_metadata_future_timestamp():
    # DateTimeOriginal in the far future (2040) -> Inconsistent
    jpeg_bytes = create_metadata_dummy_bytes(
        dt_orig="2040:08:29 18:00:00"
    )
    signal = analyze_metadata(jpeg_bytes)

    assert signal.score == 0.4
    assert signal.statistics["timestamp_present"] == 1.0
    assert any("future" in e["message"].lower() for e in signal.evidence)


def test_metadata_debug_report_creation(tmpdir):
    jpeg_bytes = create_metadata_dummy_bytes(
        software="Photoshop",
        add_gps=True
    )
    debug_dir = str(tmpdir.mkdir("debug"))
    signal = analyze_metadata(jpeg_bytes, save_debug=True, debug_dir=debug_dir)

    json_path = os.path.join(debug_dir, "document_metadata.json")
    assert os.path.exists(json_path)

    # Read and verify sanitization
    with open(json_path, "r") as f:
        data = json.load(f)
        assert data["exif_present"] is True
        assert data["gps_present"] is True
        assert data["software_present"] is True
        # Ensure GPSInfo tag values are sanitized in JSON
        gps_val = data["exif_tags"].get("GPSInfo") or data["exif_tags"].get("34853")
        assert gps_val == "[PRESENT - SANITIZED FOR PRIVACY]"
