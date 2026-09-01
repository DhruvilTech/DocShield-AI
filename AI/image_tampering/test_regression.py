"""
DocShield AI — Forensic Regression Test Suite
============================================
Tests authentic and tampered documents across multiple formats (JPEG, PNG, WebP, PDF),
resolutions, compressions, and tampering types.
"""

from __future__ import annotations
import os
import sys
import cv2
import numpy as np

AI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from image_tampering.forensic.pipeline import run_forensic_pipeline, run_forensic_pipeline_from_file


def run_regression_suite(verbose: bool = True):
    # Test Matrix: (filepath, expected_verdict: "AUTHENTIC" | "TAMPERED", description)
    test_cases = [
        # --- KNOWN AUTHENTIC BASELINE ---
        ("image_tampering/samples/clean/document.png", "AUTHENTIC", "Clean digital PNG document"),
        ("image_tampering/samples/clean/document.webp", "AUTHENTIC", "Clean WebP document"),
        ("image_tampering/samples/clean/gray_document.jpg", "AUTHENTIC", "Clean scanned grayscale JPEG document"),
        ("image_tampering/samples/clean/large_image.jpg", "AUTHENTIC", "High-resolution clean JPEG document"),
        ("image_tampering/samples/clean/passport.jpg", "AUTHENTIC", "Authentic passport photograph / scan"),
        ("image_tampering/samples/clean/small_image.jpg", "AUTHENTIC", "Low-resolution clean icon / document"),
        ("image_tampering/upload/4th sem result.pdf", "AUTHENTIC", "Academic result PDF mark sheet"),
        ("image_tampering/upload/jane_smith_passport.pdf", "AUTHENTIC", "Clean digital passport PDF"),
        ("image_tampering/upload/john_doe_passport.pdf", "AUTHENTIC", "Clean digital passport PDF"),
        ("image_tampering/upload/schengen_visa_dupont.pdf", "AUTHENTIC", "Clean Schengen visa PDF"),
        ("image_tampering/upload/uk_biometric_passport.pdf", "AUTHENTIC", "Clean UK biometric passport PDF"),
        ("image_tampering/upload/p1.png", "AUTHENTIC", "Document scan with blue stamp"),
        ("image_tampering/upload/p2.png", "AUTHENTIC", "Document text strip"),
        ("image_tampering/upload/p3.jpeg", "AUTHENTIC", "Scanned certificate / document JPEG"),
        ("image_tampering/upload/p6.png", "AUTHENTIC", "Document text banner strip"),
        ("image_tampering/upload/image.png", "AUTHENTIC", "Clean document with official stamp"),

        # --- KNOWN TAMPERED BASELINE ---
        ("image_tampering/samples/tampered/copy_move.jpg", "TAMPERED", "Duplicated stamp & document number copy-move"),
        ("image_tampering/samples/tampered/passport_edited.jpg", "TAMPERED", "Altered passport with digital text/overpaint"),
        ("image_tampering/samples/tampered/stamp_tampered.jpg", "TAMPERED", "Superimposed forged stamp"),
        ("image_tampering/upload/p4.png", "TAMPERED", "Copy-pasted text/number alteration"),
        ("image_tampering/upload/p5.jpeg", "TAMPERED", "Cloned visual content copy-move forgery"),
        ("image_tampering/upload/sarah_conner_altered.pdf", "TAMPERED", "Altered PDF with Photoshop signature"),
    ]

    total = len(test_cases)
    passed = 0
    failed = 0
    fp_count = 0
    fn_count = 0

    print("=" * 110)
    print(f"{'DOCSHIELD AI — FORENSIC REGRESSION BENCHMARK':^110}")
    print("=" * 110)
    print(f"{'FILE':<38} | {'RES':<10} | {'FMT':<5} | {'ELA':<5} | {'NOISE':<5} | {'CM':<5} | {'TEXT':<5} | {'FUS':<5} | {'EXP':<9} | {'ACT':<9} | {'STATUS'}")
    print("-" * 110)

    for rel_path, expected, desc in test_cases:
        filepath = os.path.join(AI_DIR, rel_path) if not os.path.isabs(rel_path) else rel_path
        if not os.path.exists(filepath):
            print(f"{filepath:<38} | MISSING FILE")
            failed += 1
            continue

        try:
            res = run_forensic_pipeline_from_file(filepath)
            score = res.fusion.score if res.fusion and res.fusion.score is not None else 0.0
            actual = "TAMPERED" if score >= 0.50 else "AUTHENTIC"
            is_pass = (actual == expected)

            if is_pass:
                passed += 1
                status_str = "PASS"
            else:
                failed += 1
                status_str = "FAIL"
                if expected == "AUTHENTIC" and actual == "TAMPERED":
                    fp_count += 1
                else:
                    fn_count += 1

            # Extract signals
            sigs = res.signals
            ela_s = f"{sigs.ela.score:.2f}" if (sigs and sigs.ela and sigs.ela.score is not None) else "N/A"
            noise_s = f"{sigs.noise.score:.2f}" if (sigs and sigs.noise and sigs.noise.score is not None) else "N/A"
            cm_s = f"{sigs.copy_move.score:.2f}" if (sigs and sigs.copy_move and sigs.copy_move.score is not None) else "N/A"
            text_s = f"{sigs.text_tampering.score:.2f}" if (sigs and sigs.text_tampering and sigs.text_tampering.score is not None) else "N/A"
            fus_s = f"{score:.2f}"
            res_str = f"{res.image.width}x{res.image.height}" if res.image else "N/A"
            fmt_str = res.image.format if res.image else "N/A"

            print(f"{os.path.basename(filepath):<38} | {res_str:<10} | {fmt_str:<5} | {ela_s:<5} | {noise_s:<5} | {cm_s:<5} | {text_s:<5} | {fus_s:<5} | {expected:<9} | {actual:<9} | {status_str}")

        except Exception as e:
            failed += 1
            print(f"{os.path.basename(filepath):<38} | ERROR: {e}")

    print("=" * 110)
    print(f"TOTAL TESTS:     {total}")
    print(f"PASSED:          {passed}/{total} ({(passed/total)*100:.1f}%)")
    print(f"FAILED:          {failed}/{total}")
    print(f"FALSE POSITIVES: {fp_count}")
    print(f"FALSE NEGATIVES: {fn_count}")
    print(f"REGRESSION:      {'PASS' if failed == 0 else 'FAIL'}")
    print("=" * 110)

    return passed, failed, fp_count, fn_count


if __name__ == "__main__":
    run_regression_suite()
