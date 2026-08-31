"""
DocShield AI — Forensic Tampering Score Calibration & Confusion Matrix Benchmark
=================================================================================
Calculates:
  1. Empirical score distributions for Clean vs Tampered documents.
  2. 2x2 Confusion Matrix (TP, FP, TN, FN).
  3. Classification Metrics: Accuracy, Precision, Recall, F1 Score.
  4. Per-sample forensic breakdown and false positive / false negative diagnostics.
  5. Exports evaluation summary report and CSV benchmark.

Run with:
  python -m image_tampering.benchmark
  or
  python AI/image_tampering/benchmark.py
"""

from __future__ import annotations

import os
import sys
import csv
import numpy as np
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

# Ensure AI module can be imported
AI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from image_tampering.forensic.pipeline import run_forensic_pipeline_from_file


@dataclass
class SampleResult:
    filename: str
    filepath: str
    ground_truth: str  # "CLEAN" or "TAMPERED"
    predicted_level: str  # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    overall_score: int  # 0 - 100
    predicted_tampered: bool
    is_correct: bool
    signal_scores: Dict[str, Optional[int]]
    fused_regions_count: int
    primary_reason: str


@dataclass
class ConfusionMatrix:
    true_positives: int = 0
    false_positives: int = 0
    true_negatives: int = 0
    false_negatives: int = 0

    @property
    def total(self) -> int:
        return self.true_positives + self.false_positives + self.true_negatives + self.false_negatives

    @property
    def accuracy(self) -> float:
        return (self.true_positives + self.true_negatives) / self.total if self.total > 0 else 0.0

    @property
    def precision(self) -> float:
        tp_fp = self.true_positives + self.false_positives
        return self.true_positives / tp_fp if tp_fp > 0 else 0.0

    @property
    def recall(self) -> float:
        tp_fn = self.true_positives + self.false_negatives
        return self.true_positives / tp_fn if tp_fn > 0 else 0.0

    @property
    def f1_score(self) -> float:
        p, r = self.precision, self.recall
        return (2.0 * p * r) / (p + r) if (p + r) > 0 else 0.0


def evaluate_dataset(
    clean_paths: List[str],
    tampered_paths: List[str],
    decision_threshold: int = 35,
    save_csv_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Evaluates a collection of clean and tampered document samples.
    
    Decision Rule:
      Score <= decision_threshold (e.g. 35 -> LOW) -> PREDICTED CLEAN
      Score > decision_threshold  (e.g. > 35 -> MEDIUM/HIGH/CRITICAL) -> PREDICTED TAMPERED
    """
    results: List[SampleResult] = []
    cm = ConfusionMatrix()

    # 1. Process Clean Samples
    for p in clean_paths:
        if not os.path.exists(p) or not os.path.isfile(p):
            continue
        fname = os.path.basename(p)
        try:
            res = run_forensic_pipeline_from_file(p)
            score = res.fusion.evidence.overall_score if res.fusion.evidence else int((res.fusion.score or 0.0) * 100)
            level = res.fusion.risk_level or "LOW"
            pred_tampered = (score > decision_threshold)
            
            if not pred_tampered:
                cm.true_negatives += 1
                is_correct = True
            else:
                cm.false_positives += 1
                is_correct = False

            sig_scores = {k: v.get("normalized_score") for k, v in res.fusion.evidence.signals.items()} if res.fusion.evidence else {}
            explanation = res.fusion.evidence.explanations[0] if (res.fusion.evidence and res.fusion.evidence.explanations) else "Clean document."
            
            results.append(SampleResult(
                filename=fname,
                filepath=p,
                ground_truth="CLEAN",
                predicted_level=level,
                overall_score=score,
                predicted_tampered=pred_tampered,
                is_correct=is_correct,
                signal_scores=sig_scores,
                fused_regions_count=len(res.fusion.evidence.fused_regions) if res.fusion.evidence else 0,
                primary_reason=explanation
            ))
        except Exception as exc:
            print(f"[SKIP] Clean sample {fname} skipped: {exc}")

    # 2. Process Tampered Samples
    for p in tampered_paths:
        if not os.path.exists(p) or not os.path.isfile(p):
            continue
        fname = os.path.basename(p)
        try:
            res = run_forensic_pipeline_from_file(p)
            score = res.fusion.evidence.overall_score if res.fusion.evidence else int((res.fusion.score or 0.0) * 100)
            level = res.fusion.risk_level or "LOW"
            pred_tampered = (score > decision_threshold)
            
            if pred_tampered:
                cm.true_positives += 1
                is_correct = True
            else:
                cm.false_negatives += 1
                is_correct = False

            sig_scores = {k: v.get("normalized_score") for k, v in res.fusion.evidence.signals.items()} if res.fusion.evidence else {}
            explanation = res.fusion.evidence.explanations[0] if (res.fusion.evidence and res.fusion.evidence.explanations) else "Tampered document."
            
            results.append(SampleResult(
                filename=fname,
                filepath=p,
                ground_truth="TAMPERED",
                predicted_level=level,
                overall_score=score,
                predicted_tampered=pred_tampered,
                is_correct=is_correct,
                signal_scores=sig_scores,
                fused_regions_count=len(res.fusion.evidence.fused_regions) if res.fusion.evidence else 0,
                primary_reason=explanation
            ))
        except Exception as exc:
            print(f"[SKIP] Tampered sample {fname} skipped: {exc}")

    # 3. Calculate Score Distributions
    clean_scores = [r.overall_score for r in results if r.ground_truth == "CLEAN"]
    tampered_scores = [r.overall_score for r in results if r.ground_truth == "TAMPERED"]

    stats_clean = {
        "count": len(clean_scores),
        "min": int(np.min(clean_scores)) if clean_scores else 0,
        "mean": float(np.mean(clean_scores)) if clean_scores else 0.0,
        "median": float(np.median(clean_scores)) if clean_scores else 0.0,
        "max": int(np.max(clean_scores)) if clean_scores else 0,
        "std": float(np.std(clean_scores)) if clean_scores else 0.0,
    }

    stats_tampered = {
        "count": len(tampered_scores),
        "min": int(np.min(tampered_scores)) if tampered_scores else 0,
        "mean": float(np.mean(tampered_scores)) if tampered_scores else 0.0,
        "median": float(np.median(tampered_scores)) if tampered_scores else 0.0,
        "max": int(np.max(tampered_scores)) if tampered_scores else 0,
        "std": float(np.std(tampered_scores)) if tampered_scores else 0.0,
    }

    # 4. Optional CSV Export
    if save_csv_path:
        os.makedirs(os.path.dirname(os.path.abspath(save_csv_path)), exist_ok=True)
        with open(save_csv_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Filename", "Ground Truth", "Predicted Level", "Overall Score", 
                "Predicted Tampered", "Is Correct", "Fused Regions", "Primary Reason"
            ])
            for r in results:
                writer.writerow([
                    r.filename, r.ground_truth, r.predicted_level, r.overall_score,
                    r.predicted_tampered, r.is_correct, r.fused_regions_count, r.primary_reason
                ])

    return {
        "confusion_matrix": {
            "TP": cm.true_positives,
            "FP": cm.false_positives,
            "TN": cm.true_negatives,
            "FN": cm.false_negatives,
            "total": cm.total,
        },
        "metrics": {
            "accuracy": cm.accuracy,
            "precision": cm.precision,
            "recall": cm.recall,
            "f1_score": cm.f1_score,
        },
        "clean_distribution": stats_clean,
        "tampered_distribution": stats_tampered,
        "decision_threshold": decision_threshold,
        "samples": results,
    }


def print_benchmark_report(eval_summary: Dict[str, Any]) -> None:
    """Prints a terminal-friendly summary report."""
    cm = eval_summary["confusion_matrix"]
    m = eval_summary["metrics"]
    sc = eval_summary["clean_distribution"]
    st = eval_summary["tampered_distribution"]
    thresh = eval_summary["decision_threshold"]

    print("=" * 78)
    print("      DOCSHIELD AI — FORENSIC TAMPERING BENCHMARK & CALIBRATION REPORT      ")
    print("=" * 78)
    print(f"\nDecision Threshold: Score > {thresh} -> TAMPERED | Score <= {thresh} -> CLEAN\n")

    print("--- 1. EMPIRICAL SCORE DISTRIBUTIONS ---")
    print(f"Clean Documents    (N={sc['count']:2d}): Min={sc['min']:2d}, Mean={sc['mean']:4.1f}, Median={sc['median']:4.1f}, Max={sc['max']:2d}, Std={sc['std']:4.1f}")
    print(f"Tampered Documents (N={st['count']:2d}): Min={st['min']:2d}, Mean={st['mean']:4.1f}, Median={st['median']:4.1f}, Max={st['max']:2d}, Std={st['std']:4.1f}")

    print("\n--- 2. CONFUSION MATRIX ---")
    print("                       PREDICTED")
    print("                    Clean     Tampered")
    print(f"  Actual Clean   |   TN={cm['TN']:2d}   |   FP={cm['FP']:2d}    |")
    print("                 +----------+----------+")
    print(f"  Actual Tamper  |   FN={cm['FN']:2d}   |   TP={cm['TP']:2d}    |")
    print("                 +----------+----------+")

    print("\n--- 3. CLASSIFICATION PERFORMANCE METRICS ---")
    print(f"  Accuracy  : {m['accuracy'] * 100:6.2f}%")
    print(f"  Precision : {m['precision'] * 100:6.2f}%")
    print(f"  Recall    : {m['recall'] * 100:6.2f}%")
    print(f"  F1 Score  : {m['f1_score']:6.4f}")

    print("\n--- 4. PER-SAMPLE AUDIT BREAKDOWN ---")
    print(f"{'Filename':25s} | {'Truth':8s} | {'Score':5s} | {'Pred Level':10s} | {'Status':8s}")
    print("-" * 65)
    for r in eval_summary["samples"]:
        status_str = "CORRECT" if r.is_correct else "MISMATCH"
        print(f"{r.filename:25s} | {r.ground_truth:8s} | {r.overall_score:5d} | {r.predicted_level:10s} | {status_str:8s}")
    print("=" * 78)


def run_default_benchmark() -> Dict[str, Any]:
    """Runs the benchmark on all standard sample directories and uploads."""
    samples_dir = os.path.join(AI_DIR, "image_tampering", "samples")
    upload_dir = os.path.join(AI_DIR, "image_tampering", "upload")
    output_csv = os.path.join(AI_DIR, "image_tampering", "output", "tampering_evaluation.csv")

    clean_files = [
        os.path.join(samples_dir, "clean", f) for f in os.listdir(os.path.join(samples_dir, "clean"))
        if os.path.isfile(os.path.join(samples_dir, "clean", f))
    ]
    # Add uploaded clean benchmarks
    if os.path.exists(os.path.join(upload_dir, "4th sem result.pdf")):
        clean_files.append(os.path.join(upload_dir, "4th sem result.pdf"))
    if os.path.exists(os.path.join(upload_dir, "p2.png")):
        clean_files.append(os.path.join(upload_dir, "p2.png"))

    tampered_files = [
        os.path.join(samples_dir, "tampered", f) for f in os.listdir(os.path.join(samples_dir, "tampered"))
        if os.path.isfile(os.path.join(samples_dir, "tampered", f)) and not f.endswith((".txt", "corrupted.jpg"))
    ]
    # Add uploaded tampered benchmark
    if os.path.exists(os.path.join(upload_dir, "image.png")):
        tampered_files.append(os.path.join(upload_dir, "image.png"))

    summary = evaluate_dataset(
        clean_paths=clean_files,
        tampered_paths=tampered_files,
        decision_threshold=35,
        save_csv_path=output_csv
    )
    print_benchmark_report(summary)
    return summary


if __name__ == "__main__":
    run_default_benchmark()
