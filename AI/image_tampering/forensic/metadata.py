import os
import io
import json
from datetime import datetime
from PIL import Image
from PIL.ExifTags import TAGS
from typing import Optional
from image_tampering.schemas.forensic import ForensicSignal

def analyze_metadata(
    image_bytes: bytes,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicSignal:
    """
    Performs Metadata Forensic Analysis on uploaded document images.
    
    Algorithm:
    1. Reads image headers using Pillow Image.open.
    2. Extract basic info (format, size, mode) and img.info.
    3. Reads EXIF dictionary (including nested sub-IFD directory tags).
    4. Searches for image-editing software signatures in EXIF and info keys.
    5. Flags GPS presence (tag 34853) without revealing location coordinates.
    6. Parses original creation date (DateTimeOriginal) and modification date (DateTime)
       to check for chronological timestamp inconsistencies.
    7. Computes a conservative, evidence-based metadata anomaly score:
       - known software present -> +0.5
       - timestamp inconsistency -> +0.4
       - malformed metadata -> +0.3
       - missing EXIF or normal JPEGs -> +0.0
    8. Exports a sanitized debug JSON file.
    """
    if not image_bytes:
        raise ValueError("Image bytes cannot be empty.")

    # List of known image editing / processing software (case-insensitive)
    EDITORS = [
        "photoshop", "gimp", "paint.net", "corel", "affinity", 
        "canva", "pixelmator", "snapseed", "lightroom", "picasa", 
        "inkscape", "illustrator", "acorn"
    ]

    if image_bytes.startswith(b'%PDF') or b'%PDF-' in image_bytes[:1024]:
        try:
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(image_bytes)
            pdf_meta = pdf.get_metadata_dict()
        except Exception:
            pdf_meta = {}

        software_present = False
        software_name = None
        timestamp_present = False
        timestamp_inconsistency = False
        metadata_fields = len([v for v in pdf_meta.values() if v])

        # Check Creator, Producer, Author for editing software
        for field_key in ["Creator", "Producer", "Author"]:
            val = pdf_meta.get(field_key)
            if val and isinstance(val, str):
                for editor in EDITORS:
                    if editor in val.lower():
                        software_present = True
                        software_name = f"{field_key}: {val.strip()}"
                        break

        # Also inspect raw PDF byte header / comments / XMP stream for software signatures
        if not software_present:
            raw_header = image_bytes[:4096].decode('latin1', errors='ignore').lower()
            for editor in EDITORS:
                if editor in raw_header:
                    software_present = True
                    software_name = f"Header/XMP: {editor.capitalize()}"
                    break

        # Parse CreationDate / ModDate (PDF dates typically formatted like D:YYYYMMDDHHmmSS...)
        def parse_pdf_date(d_str):
            if not d_str or not isinstance(d_str, str):
                return None
            clean = d_str.lstrip("D:").split("+")[0].split("-")[0].split("Z")[0].replace("'", "")
            for fmt in ("%Y%m%d%H%M%S", "%Y%m%d%H%M", "%Y%m%d"):
                try:
                    return datetime.strptime(clean[:14], fmt)
                except Exception:
                    pass
            return None

        cdate_raw = pdf_meta.get("CreationDate", "")
        mdate_raw = pdf_meta.get("ModDate", "")
        dt_orig = parse_pdf_date(cdate_raw)
        dt_mod = parse_pdf_date(mdate_raw)
        if dt_orig:
            timestamp_present = True
            if (dt_orig - datetime.now()).days > 1:
                timestamp_inconsistency = True
        if dt_mod:
            timestamp_present = True
        if dt_orig and dt_mod and dt_orig > dt_mod:
            timestamp_inconsistency = True

        evidence = []
        evidence.append({
            "message": f"PDF Document metadata extracted ({metadata_fields} fields populated).",
            "severity": "LOW"
        })
        if software_present:
            evidence.append({
                "message": f"Document metadata indicates editing software: {software_name}",
                "severity": "MEDIUM"
            })
        if timestamp_inconsistency:
            evidence.append({
                "message": "Timestamp inconsistency: Creation date is inconsistent with modification date or in future.",
                "severity": "MEDIUM"
            })

        score = 0.0
        if software_present:
            score += 0.5
        if timestamp_inconsistency:
            score += 0.4
        score = float(min(max(score, 0.0), 1.0))

        statistics = {
            "exif_present": 0.0,
            "gps_present": 0.0,
            "software_present": 1.0 if software_present else 0.0,
            "timestamp_present": 1.0 if timestamp_present else 0.0,
            "metadata_fields": float(metadata_fields)
        }

        if save_debug and debug_dir:
            os.makedirs(debug_dir, exist_ok=True)
            with open(os.path.join(debug_dir, "document_metadata.json"), "w") as f:
                json.dump({
                    "format": "PDF",
                    "software_present": software_present,
                    "software_name": software_name,
                    "timestamp_present": timestamp_present,
                    "timestamp_inconsistency": timestamp_inconsistency,
                    "pdf_metadata": pdf_meta
                }, f, indent=4, default=str)

        return ForensicSignal(
            name="metadata",
            score=score,
            confidence=None,
            regions=[],
            evidence=evidence,
            available=True,
            statistics=statistics
        )

    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        statistics = {
            "exif_present": 0.0,
            "gps_present": 0.0,
            "software_present": 0.0,
            "timestamp_present": 0.0,
            "metadata_fields": 0.0
        }
        return ForensicSignal(
            name="metadata",
            score=0.3,  # Flag minor anomaly due to unreadable bytes
            confidence=None,
            regions=[],
            evidence=[{"message": f"Failed to load image metadata: {str(e)}", "severity": "MEDIUM"}],
            available=True,
            statistics=statistics
        )

    exif_present = False
    gps_present = False
    software_present = False
    software_name = None
    timestamp_present = False
    timestamp_inconsistency = False
    metadata_fields = 0

    exif_dict = {}
    exif = img.getexif()

    if exif:
        exif_present = True
        
        # 1. Read main EXIF directory
        for tag_id, val in exif.items():
            tag_name = TAGS.get(tag_id, tag_id)
            metadata_fields += 1
            exif_dict[str(tag_name)] = val
            
            if tag_name == "GPSInfo":
                gps_present = True
            
            if tag_name == "Software" and isinstance(val, str):
                for editor in EDITORS:
                    if editor in val.lower():
                        software_present = True
                        software_name = val.strip()

        # 2. Read sub-IFD EXIF directory (tag offset 34665 contains DateTimeOriginal, DateTimeDigitized, etc.)
        try:
            exif_sub = exif.get_ifd(34665)
            for tag_id, val in exif_sub.items():
                tag_name = TAGS.get(tag_id, tag_id)
                metadata_fields += 1
                exif_dict[str(tag_name)] = val
                
                if tag_name == "Software" and isinstance(val, str):
                    for editor in EDITORS:
                        if editor in val.lower():
                            software_present = True
                            software_name = val.strip()
        except Exception:
            pass

    # 3. Read general Pillow info dictionary (e.g. for PNG tEXt chunks)
    if img.info:
        for key, val in img.info.items():
            metadata_fields += 1
            if isinstance(val, str):
                if key.lower() == "software":
                    for editor in EDITORS:
                        if editor in val.lower():
                            software_present = True
                            software_name = val.strip()

    # 4. Analyze Timestamps
    dt_orig = None
    dt_mod = None
    date_original_str = exif_dict.get("DateTimeOriginal")
    date_modify_str = exif_dict.get("DateTime")

    if date_original_str and isinstance(date_original_str, str):
        try:
            dt_orig = datetime.strptime(date_original_str.strip(), "%Y:%m:%d %H:%M:%S")
            timestamp_present = True
        except ValueError:
            pass

    if date_modify_str and isinstance(date_modify_str, str):
        try:
            dt_mod = datetime.strptime(date_modify_str.strip(), "%Y:%m:%d %H:%M:%S")
            timestamp_present = True
        except ValueError:
            pass

    evidence = []

    # Chronological checks
    current_time = datetime.now()
    if dt_orig:
        # Check if original creation time is set in the future
        if (dt_orig - current_time).days > 1:
            timestamp_inconsistency = True
            evidence.append({
                "message": f"Timestamp inconsistency: Original creation date ({date_original_str}) is in the future.",
                "severity": "MEDIUM"
            })
            
        if dt_mod:
            # Check if original creation date is after modification date
            if dt_orig > dt_mod:
                timestamp_inconsistency = True
                evidence.append({
                    "message": f"Timestamp inconsistency: Original creation date ({date_original_str}) is after last modification date ({date_modify_str}).",
                    "severity": "MEDIUM"
                })

    # 5. Extract Evidence Messages
    if not exif_present:
        evidence.append({
            "message": "No EXIF metadata available in the image headers.",
            "severity": "LOW"
        })
    else:
        evidence.append({
            "message": "EXIF metadata is present in the image headers.",
            "severity": "LOW"
        })

    if software_present:
        evidence.append({
            "message": f"Image metadata indicates processing software: {software_name}",
            "severity": "MEDIUM"
        })

    if gps_present:
        evidence.append({
            "message": "GPS metadata is present (coordinates sanitized for privacy).",
            "severity": "LOW"
        })

    # 6. Calculate Anomaly Score
    score = 0.0
    if software_present:
        score += 0.5
    if timestamp_inconsistency:
        score += 0.4
    score = float(min(max(score, 0.0), 1.0))

    # 7. Statistics
    statistics = {
        "exif_present": 1.0 if exif_present else 0.0,
        "gps_present": 1.0 if gps_present else 0.0,
        "software_present": 1.0 if software_present else 0.0,
        "timestamp_present": 1.0 if timestamp_present else 0.0,
        "metadata_fields": float(metadata_fields)
    }

    # 8. Save sanitized debug output
    if save_debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        # Create a copy of exif_dict with GPS sanitized
        sanitized_exif = {}
        for k, v in exif_dict.items():
            if "GPS" in str(k) or k == 34853:
                sanitized_exif[str(k)] = "[PRESENT - SANITIZED FOR PRIVACY]"
            else:
                sanitized_exif[str(k)] = v
                
        sanitized_report = {
            "format": img.format,
            "width": img.size[0],
            "height": img.size[1],
            "mode": img.mode,
            "exif_present": exif_present,
            "gps_present": gps_present,
            "software_present": software_present,
            "software_name": software_name,
            "timestamp_present": timestamp_present,
            "timestamp_inconsistency": timestamp_inconsistency,
            "exif_tags": sanitized_exif
        }
        with open(os.path.join(debug_dir, "document_metadata.json"), "w") as f:
            json.dump(sanitized_report, f, indent=4, default=str)

    return ForensicSignal(
        name="metadata",
        score=score,
        confidence=None,
        regions=[],
        evidence=evidence,
        available=True,
        statistics=statistics
    )
