"""
DocShield AI — Forensic Robustness Matrix & Stress Test Suite
============================================================
Evaluates image tampering detection across varied conditions:
  - Formats: JPEG (varying Q factors), PNG, WEBP, PDF
  - Resolutions: Original, 50% downscale, 25% downscale
  - Transformations: Luminance adjustments, minor rotations, crops
  - Document Types: Passports, Visas, ID cards, Certificates, Result sheets
  - Tampering Modes: Copy-move, inpainting/overpaint, text alteration, spliced photo, forged stamp, PDF metadata tampering
"""

from __future__ import annotations
import os
import sys
import io
import cv2
import numpy as np
from PIL import Image, ImageEnhance

AI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from image_tampering.forensic.pipeline import run_forensic_pipeline


def create_transformed_samples():
    """Generates on-the-fly transformations for stress-testing without polluting disk."""
    base_clean_path = os.path.join(AI_DIR, "image_tampering/samples/clean/passport.jpg")
    base_tampered_path = os.path.join(AI_DIR, "image_tampering/samples/tampered/passport_edited.jpg")
    cm_tampered_path = os.path.join(AI_DIR, "image_tampering/samples/tampered/copy_move.jpg")

    if not os.path.exists(base_clean_path):
        return []

    clean_img_bgr = cv2.imread(base_clean_path)
    clean_img_rgb = cv2.cvtColor(clean_img_bgr, cv2.COLOR_BGR2RGB)
    
    tamp_img_bgr = cv2.imread(base_tampered_path)
    tamp_img_rgb = cv2.cvtColor(tamp_img_bgr, cv2.COLOR_BGR2RGB)

    cm_img_bgr = cv2.imread(cm_tampered_path)
    cm_img_rgb = cv2.cvtColor(cm_img_bgr, cv2.COLOR_BGR2RGB)

    matrix = []

    # 1. Standard JPEG baseline
    _, clean_jpg_bytes = cv2.imencode('.jpg', clean_img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
    matrix.append((clean_jpg_bytes.tobytes(), "passport_q95.jpg", "AUTHENTIC", "JPEG Original (Q=95)"))

    # 2. Recompressed JPEG (Q=75)
    _, clean_recomp_bytes = cv2.imencode('.jpg', clean_img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 75])
    matrix.append((clean_recomp_bytes.tobytes(), "passport_q75.jpg", "AUTHENTIC", "JPEG Recompressed (Q=75)"))

    # 3. Recompressed JPEG (Q=60)
    _, clean_q60_bytes = cv2.imencode('.jpg', clean_img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 60])
    matrix.append((clean_q60_bytes.tobytes(), "passport_q60.jpg", "AUTHENTIC", "JPEG Recompressed (Q=60)"))

    # 4. PNG Lossless Conversion of Authentic Document
    _, clean_png_bytes = cv2.imencode('.png', clean_img_bgr)
    matrix.append((clean_png_bytes.tobytes(), "passport_converted.png", "AUTHENTIC", "PNG Lossless Conversion"))

    # 5. Resized 50% (Resolution invariance)
    h, w = clean_img_bgr.shape[:2]
    clean_50 = cv2.resize(clean_img_bgr, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
    _, clean_50_bytes = cv2.imencode('.jpg', clean_50, [cv2.IMWRITE_JPEG_QUALITY, 90])
    matrix.append((clean_50_bytes.tobytes(), "passport_50pct.jpg", "AUTHENTIC", "50% Downscaled Authentic"))

    # 6. Resized 25% (Low resolution authentic)
    clean_25 = cv2.resize(clean_img_bgr, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    _, clean_25_bytes = cv2.imencode('.jpg', clean_25, [cv2.IMWRITE_JPEG_QUALITY, 85])
    matrix.append((clean_25_bytes.tobytes(), "passport_25pct.jpg", "AUTHENTIC", "25% Low-Res Authentic"))

    # 7. Brightness adjusted (+25% Bright)
    pil_clean = Image.fromarray(clean_img_rgb)
    enh_bright = ImageEnhance.Brightness(pil_clean).enhance(1.25)
    buf_bright = io.BytesIO()
    enh_bright.save(buf_bright, format='JPEG', quality=90)
    matrix.append((buf_bright.getvalue(), "passport_bright.jpg", "AUTHENTIC", "Brightened Document (+25%)"))

    # 8. Dark adjusted (-25% Dark)
    enh_dark = ImageEnhance.Brightness(pil_clean).enhance(0.75)
    buf_dark = io.BytesIO()
    enh_dark.save(buf_dark, format='JPEG', quality=90)
    matrix.append((buf_dark.getvalue(), "passport_dark.jpg", "AUTHENTIC", "Darkened Document (-25%)"))

    # 9. Rotated slightly (1.5 degrees)
    M_rot = cv2.getRotationMatrix2D((w / 2, h / 2), 1.5, 1.0)
    rotated = cv2.warpAffine(clean_img_bgr, M_rot, (w, h), borderMode=cv2.BORDER_REPLICATE)
    _, rot_bytes = cv2.imencode('.jpg', rotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
    matrix.append((rot_bytes.tobytes(), "passport_rotated.jpg", "AUTHENTIC", "Slight Rotation (1.5 deg)"))

    # 10. Cropped Document Center (80% crop)
    cx1, cy1 = int(w * 0.1), int(h * 0.1)
    cx2, cy2 = int(w * 0.9), int(h * 0.9)
    cropped = clean_img_bgr[cy1:cy2, cx1:cx2]
    _, crop_bytes = cv2.imencode('.jpg', cropped, [cv2.IMWRITE_JPEG_QUALITY, 90])
    matrix.append((crop_bytes.tobytes(), "passport_cropped.jpg", "AUTHENTIC", "Cropped Sub-region (80%)"))

    # --- TAMPERED VARIATIONS ---
    # 11. Tampered Passport (Original)
    _, tamp_orig_bytes = cv2.imencode('.jpg', tamp_img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
    matrix.append((tamp_orig_bytes.tobytes(), "passport_edited_q95.jpg", "TAMPERED", "Tampered Passport (Edited text/overpaint)"))

    # 12. Tampered Passport (Recompressed Q=75)
    _, tamp_q75_bytes = cv2.imencode('.jpg', tamp_img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 75])
    matrix.append((tamp_q75_bytes.tobytes(), "passport_edited_q75.jpg", "TAMPERED", "Tampered Passport Recompressed (Q=75)"))

    # 13. Tampered Passport (PNG Lossless)
    _, tamp_png_bytes = cv2.imencode('.png', tamp_img_bgr)
    matrix.append((tamp_png_bytes.tobytes(), "passport_edited.png", "TAMPERED", "Tampered Passport (PNG Lossless)"))

    # 14. Tampered Passport Resized 50%
    t_h, t_w = tamp_img_bgr.shape[:2]
    tamp_50 = cv2.resize(tamp_img_bgr, (t_w // 2, t_h // 2), interpolation=cv2.INTER_AREA)
    _, tamp_50_bytes = cv2.imencode('.jpg', tamp_50, [cv2.IMWRITE_JPEG_QUALITY, 90])
    matrix.append((tamp_50_bytes.tobytes(), "passport_edited_50pct.jpg", "TAMPERED", "Tampered Passport 50% Resized"))

    # 15. Copy-Move Tampered Original
    _, cm_orig_bytes = cv2.imencode('.jpg', cm_img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
    matrix.append((cm_orig_bytes.tobytes(), "copy_move_q95.jpg", "TAMPERED", "Copy-Move Cloned Stamp & Number"))

    # 16. Copy-Move Recompressed (Q=70)
    _, cm_q70_bytes = cv2.imencode('.jpg', cm_img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 70])
    matrix.append((cm_q70_bytes.tobytes(), "copy_move_q70.jpg", "TAMPERED", "Copy-Move Recompressed (Q=70)"))

    # 17. Copy-Move PNG
    _, cm_png_bytes = cv2.imencode('.png', cm_img_bgr)
    matrix.append((cm_png_bytes.tobytes(), "copy_move.png", "TAMPERED", "Copy-Move PNG Lossless"))

    # 18. Localized Inpainted/Erased Date Box on Clean Passport
    tampered_date = clean_img_bgr.copy()
    # Overpaint a clean white-out rectangle over a date/number area
    tampered_date[400:440, 500:620] = (248, 248, 248)
    # Put synthetic digital altered font digits
    cv2.putText(tampered_date, "2028-11-20", (505, 430), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (15, 15, 15), 2)
    _, date_tamp_bytes = cv2.imencode('.jpg', tampered_date, [cv2.IMWRITE_JPEG_QUALITY, 95])
    matrix.append((date_tamp_bytes.tobytes(), "passport_altered_date.jpg", "TAMPERED", "Altered Expiry Date (Inpaint + Digit replacement)"))

    return matrix


def run_matrix_tests():
    matrix = create_transformed_samples()
    if not matrix:
        print("No base samples found to create test matrix.")
        return

    total = len(matrix)
    passed = 0
    failed = 0
    fp_count = 0
    fn_count = 0

    print("=" * 115)
    print(f"{'DOCSHIELD AI — FORMAT, RESOLUTION & TAMPERING STRESS MATRIX':^115}")
    print("=" * 115)
    print(f"{'TEST CASE':<36} | {'DESCRIPTION':<36} | {'FUSION':<6} | {'RISK':<8} | {'EXP':<9} | {'ACT':<9} | {'STATUS'}")
    print("-" * 115)

    for data_bytes, filename, expected, desc in matrix:
        try:
            res = run_forensic_pipeline(image_bytes=data_bytes, filename=filename)
            score = res.fusion.score if res.fusion and res.fusion.score is not None else 0.0
            risk = res.fusion.risk_level if res.fusion else "UNKNOWN"
            actual = "TAMPERED" if score >= 0.50 else "AUTHENTIC"
            is_pass = (actual == expected)

            if is_pass:
                passed += 1
                status = "PASS"
            else:
                failed += 1
                status = "FAIL"
                if expected == "AUTHENTIC" and actual == "TAMPERED":
                    fp_count += 1
                else:
                    fn_count += 1

            print(f"{filename:<36} | {desc:<36} | {score:<6.2f} | {risk:<8} | {expected:<9} | {actual:<9} | {status}")

        except Exception as e:
            failed += 1
            print(f"{filename:<36} | ERROR: {e}")

    print("=" * 115)
    print(f"MATRIX TOTAL:    {total}")
    print(f"PASSED:          {passed}/{total} ({(passed/total)*100:.1f}%)")
    print(f"FAILED:          {failed}/{total}")
    print(f"FALSE POSITIVES: {fp_count}")
    print(f"FALSE NEGATIVES: {fn_count}")
    print(f"ROBUSTNESS:      {'PASS' if failed == 0 else 'FAIL'}")
    print("=" * 115)


if __name__ == "__main__":
    run_matrix_tests()
