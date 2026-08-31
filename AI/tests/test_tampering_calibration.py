"""
DocShield AI — Step 3 (Calibration) & Step 4 (Confusion Matrix) Automated Test Suite
=====================================================================================
Tests:
  1. Empirical score distribution separation (Clean <= 35, Tampered >= 60).
  2. Confusion matrix computation & metric validations (Accuracy, Precision, Recall, F1 >= 0.90).
  3. Correct classification and evidence extraction for files in the upload directory:
     - '4th sem result.pdf' (Clean PDF -> LOW)
     - 'p2.png' (Clean Scanned Document -> LOW)
     - 'image.png' (Tampered Document / Spliced Photo -> CRITICAL)
"""

from __future__ import annotations

import os
import sys
import pytest

from image_tampering.benchmark import evaluate_dataset, run_default_benchmark
from image_tampering.forensic.pipeline import run_forensic_pipeline_from_file

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "image_tampering", "upload")
SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "..", "image_tampering", "samples")


def test_score_calibration_and_distribution_separation():
    """Verify that score distributions of clean vs tampered documents are completely separated."""
    summary = run_default_benchmark()
    
    clean_dist = summary["clean_distribution"]
    tampered_dist = summary["tampered_distribution"]
    
    # Clean documents should all have overall_score <= 35 (LOW)
    assert clean_dist["max"] <= 35, f"Max clean score {clean_dist['max']} exceeded LOW threshold 35"
    assert clean_dist["mean"] < 25.0, f"Mean clean score {clean_dist['mean']} should be well within LOW"
    
    # Tampered documents should all have overall_score >= 60 (HIGH/CRITICAL)
    assert tampered_dist["min"] >= 60, f"Min tampered score {tampered_dist['min']} fell below HIGH threshold 60"
    assert tampered_dist["mean"] >= 80.0, f"Mean tampered score {tampered_dist['mean']} should be in CRITICAL"


def test_confusion_matrix_and_classification_metrics():
    """Verify that Confusion Matrix achieves >= 90% Accuracy, Precision, Recall, and F1."""
    summary = run_default_benchmark()
    
    cm = summary["confusion_matrix"]
    m = summary["metrics"]
    
    # Zero False Positives and Zero False Negatives
    assert cm["FP"] == 0, f"Expected 0 False Positives, got {cm['FP']}"
    assert cm["FN"] == 0, f"Expected 0 False Negatives, got {cm['FN']}"
    assert cm["TP"] >= 3, f"Expected at least 3 True Positives, got {cm['TP']}"
    assert cm["TN"] >= 6, f"Expected at least 6 True Negatives, got {cm['TN']}"
    
    assert m["accuracy"] >= 0.95, f"Accuracy {m['accuracy']} below 0.95"
    assert m["precision"] >= 0.95, f"Precision {m['precision']} below 0.95"
    assert m["recall"] >= 0.95, f"Recall {m['recall']} below 0.95"
    assert m["f1_score"] >= 0.95, f"F1 Score {m['f1_score']} below 0.95"


def test_uploaded_files_forensic_classification():
    """Verify forensic analysis on the specific uploaded files."""
    # 1. Test 4th sem result.pdf (Clean PDF)
    pdf_path = os.path.join(UPLOAD_DIR, "4th sem result.pdf")
    if os.path.exists(pdf_path):
        res_pdf = run_forensic_pipeline_from_file(pdf_path)
        score_pdf = res_pdf.fusion.evidence.overall_score if res_pdf.fusion.evidence else int((res_pdf.fusion.score or 0) * 100)
        assert score_pdf <= 35, f"4th sem result.pdf score {score_pdf} should be LOW (<= 35)"
        assert res_pdf.fusion.risk_level == "LOW"

    # 2. Test p2.png (Clean scanned document)
    p2_path = os.path.join(UPLOAD_DIR, "p2.png")
    if os.path.exists(p2_path):
        res_p2 = run_forensic_pipeline_from_file(p2_path)
        score_p2 = res_p2.fusion.evidence.overall_score if res_p2.fusion.evidence else int((res_p2.fusion.score or 0) * 100)
        assert score_p2 <= 35, f"p2.png score {score_p2} should be LOW (<= 35)"
        assert res_p2.fusion.risk_level == "LOW"

    # 3. Test image.png (Tampered document / spliced photo container)
    img_path = os.path.join(UPLOAD_DIR, "image.png")
    if os.path.exists(img_path):
        res_img = run_forensic_pipeline_from_file(img_path)
        score_img = res_img.fusion.evidence.overall_score if res_img.fusion.evidence else int((res_img.fusion.score or 0) * 100)
        assert score_img >= 60, f"image.png score {score_img} should be HIGH/CRITICAL (>= 60)"
        assert res_img.fusion.risk_level in ["HIGH", "CRITICAL"]
        assert res_img.signals.splicing is not None
        assert res_img.signals.splicing.score >= 0.50
