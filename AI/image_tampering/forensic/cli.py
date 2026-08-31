#!/usr/bin/env python3
"""
DocShield AI — Forensic Image & PDF Tampering CLI Bridge

This CLI entrypoint executes the existing multi-signal forensic pipeline
and outputs strict machine-readable JSON to stdout. Diagnostic logs are sent
exclusively to stderr to prevent malformed JSON parsing in the Node.js backend.
"""
import sys
import os
import argparse
import json
import traceback

# Ensure the root AI directory is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from image_tampering.forensic.pipeline import run_forensic_pipeline
from image_tampering.forensic.preprocessing import is_pdf


def parse_args():
    parser = argparse.ArgumentParser(description="DocShield Forensic Tampering Detection CLI Bridge")
    parser.add_argument("--input", "-i", type=str, help="Absolute or relative path to target image/PDF file")
    parser.add_argument("--filename", "-f", type=str, default=None, help="Original uploaded filename override")
    parser.add_argument("--save-debug", action="store_true", help="Save forensic heatmaps and diagnostic maps")
    parser.add_argument("--debug-dir", type=str, default=None, help="Directory to save debug artifacts")
    return parser.parse_args()


def main():
    args = parse_args()

    # 1. Read input bytes
    input_bytes = None
    filename = args.filename

    if args.input:
        if not os.path.exists(args.input):
            error_res = {
                "success": False,
                "error": {
                    "code": "FILE_NOT_FOUND",
                    "message": f"Input file not found: {args.input}"
                }
            }
            sys.stdout.write(json.dumps(error_res) + "\n")
            sys.stdout.flush()
            sys.exit(1)
            
        try:
            with open(args.input, "rb") as f:
                input_bytes = f.read()
            if not filename:
                filename = os.path.basename(args.input)
        except Exception as e:
            error_res = {
                "success": False,
                "error": {
                    "code": "FILE_READ_ERROR",
                    "message": f"Failed to read input file: {str(e)}"
                }
            }
            sys.stdout.write(json.dumps(error_res) + "\n")
            sys.stdout.flush()
            sys.exit(1)
    else:
        # Read from stdin buffer
        try:
            input_bytes = sys.stdin.buffer.read()
            if not filename:
                filename = "uploaded_document"
        except Exception as e:
            error_res = {
                "success": False,
                "error": {
                    "code": "STDIN_READ_ERROR",
                    "message": f"Failed to read from stdin: {str(e)}"
                }
            }
            sys.stdout.write(json.dumps(error_res) + "\n")
            sys.stdout.flush()
            sys.exit(1)

    if not input_bytes or len(input_bytes) == 0:
        error_res = {
            "success": False,
            "error": {
                "code": "EMPTY_PAYLOAD",
                "message": "Input document buffer is empty."
            }
        }
        sys.stdout.write(json.dumps(error_res) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    # Save a copy of uploaded document to image_tampering/upload folder
    try:
        upload_dir = os.path.abspath(os.path.join(AI_DIR, "image_tampering", "upload"))
        os.makedirs(upload_dir, exist_ok=True)
        save_target = os.path.join(upload_dir, filename)
        with open(save_target, "wb") as f_out:
            f_out.write(input_bytes)
    except Exception as e:
        sys.stderr.write(f"Warning: could not save to upload directory: {e}\n")

    # 2. Execute Forensic Pipeline
    try:
        forensic_result = run_forensic_pipeline(
            image_bytes=input_bytes,
            filename=filename,
            save_debug=args.save_debug,
            debug_dir=args.debug_dir
        )
    except ValueError as ve:
        # Input validation / format error
        sys.stderr.write(f"Validation error in forensic pipeline: {str(ve)}\n")
        error_res = {
            "success": False,
            "error": {
                "code": "INVALID_DOCUMENT",
                "message": str(ve)
            }
        }
        sys.stdout.write(json.dumps(error_res) + "\n")
        sys.stdout.flush()
        sys.exit(1)
    except Exception as e:
        sys.stderr.write(f"Unexpected error in forensic pipeline: {str(e)}\n")
        sys.stderr.write(traceback.format_exc() + "\n")
        error_res = {
            "success": False,
            "error": {
                "code": "FORENSIC_ENGINE_ERROR",
                "message": f"Forensic analysis failed: {str(e)}"
            }
        }
        sys.stdout.write(json.dumps(error_res) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    # 3. Structure clean output JSON
    is_doc_pdf = is_pdf(input_bytes)
    result_dict = forensic_result.model_dump()

    fusion_score = forensic_result.fusion.score if forensic_result.fusion and forensic_result.fusion.score is not None else 0.0
    risk_level = forensic_result.fusion.risk_level if forensic_result.fusion and forensic_result.fusion.risk_level is not None else "LOW"
    is_tampered = bool(fusion_score >= 0.50 or risk_level in ["HIGH", "CRITICAL"])

    explanations = []
    if forensic_result.fusion and forensic_result.fusion.evidence and forensic_result.fusion.evidence.explanations:
        explanations = forensic_result.fusion.evidence.explanations

    # Build per-page aggregation if PDF
    pages_data = []
    if is_doc_pdf:
        # Group regions and signals by page if multi-page
        page_numbers = sorted(list({r.page for r in forensic_result.regions if r.page is not None}))
        if not page_numbers:
            page_numbers = [1]
            
        for pnum in page_numbers:
            page_regions = [r.model_dump() for r in forensic_result.regions if r.page == pnum or r.page is None]
            page_tampered = any(r.get("severity") in ["HIGH", "CRITICAL"] or r.get("score", 0) >= 0.6 for r in page_regions)
            page_score = max([r.get("score", 0.0) for r in page_regions], default=0.0) if page_regions else 0.0
            
            pages_data.append({
                "page": pnum,
                "tampered": page_tampered,
                "score": float(page_score),
                "risk_level": "CRITICAL" if page_score >= 0.8 else "HIGH" if page_score >= 0.5 else "MEDIUM" if page_score >= 0.25 else "LOW",
                "regions": page_regions
            })

    output_payload = {
        "success": True,
        "filename": filename,
        "file_type": "pdf" if is_doc_pdf else "image",
        "tampered": is_tampered,
        "score": float(round(fusion_score, 4)),
        "risk_level": risk_level,
        "fusion": result_dict.get("fusion"),
        "signals": result_dict.get("signals"),
        "regions": result_dict.get("regions", []),
        "quality": result_dict.get("quality"),
        "image": result_dict.get("image"),
        "explanations": explanations,
        "pages": pages_data if is_doc_pdf else None,
        "debug": {
            "saved": args.save_debug,
            "debug_dir": args.debug_dir
        } if args.save_debug else None
    }

    # Print strict JSON to stdout
    sys.stdout.write(json.dumps(output_payload, indent=2, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    sys.exit(0)


if __name__ == "__main__":
    main()
