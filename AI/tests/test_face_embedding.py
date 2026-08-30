"""
DocShield AI — Phase 2: Face Embedding & Similarity Evaluation Suite
Tests ArcFace feature extraction, cosine similarity calculation, and generates evaluation.csv.
"""

import csv
import os
import sys
from pathlib import Path
import numpy as np

# Ensure project root is in python path
ROOT_DIR = Path(__file__).resolve().parent
# sys.path managed by pyproject.toml

from face.embedding import FaceEmbedder, get_embedder, get_embedding, cosine_similarity


def run_embedding_tests():
    print("=" * 65)
    print("DocShield AI -- Phase 2: Face Embedding & ArcFace Verification Test")
    print("=" * 65)

    # 1. Initialize embedder (loads ArcFace model once)
    print("\n[1/4] Initializing FaceEmbedder (loading ArcFace model once)...")
    try:
        embedder = get_embedder()
        print("[OK] FaceEmbedder initialized successfully.")
    except Exception as e:
        print(f"[FAIL] Failed to initialize FaceEmbedder: {e}")
        return False

    # Locate sample faces
    sample_dir = ROOT_DIR / "sample_faces"
    if not sample_dir.exists():
        # Check parent folder if running from inside AI/
        sample_dir = ROOT_DIR.parent / "sample_faces"

    doc_a_path = sample_dir / "person_a_doc.jpg"
    live_a_path = sample_dir / "person_a_live.jpg"
    doc_b_path = sample_dir / "person_b_doc.jpg"
    live_b_path = sample_dir / "person_b_live.jpg"

    # Verify files exist
    for p in [doc_a_path, live_a_path, doc_b_path, live_b_path]:
        if not p.exists():
            print(f"[FAIL] Required sample image missing: {p}")
            return False

    # 2. Extract Embeddings
    print("\n[2/4] Extracting 512-d normalized face embeddings...")
    embeddings = {}
    items = [
        ("Person A (Document)", doc_a_path, "A_doc"),
        ("Person A (Live)", live_a_path, "A_live"),
        ("Person B (Document)", doc_b_path, "B_doc"),
        ("Person B (Live)", live_b_path, "B_live"),
    ]

    for label, path, key in items:
        emb = embedder.extract_embedding(path)
        if emb is None:
            print(f"[FAIL] Failed to extract embedding for {label} at {path}")
            return False
        norm = np.linalg.norm(emb)
        print(f"  -> {label}: shape={emb.shape}, norm={norm:.4f}, dtype={emb.dtype}")
        embeddings[key] = emb

    # 3. Perform Pairwise Cosine Similarity Verification
    print("\n[3/4] Evaluating pairwise similarity (Genuine vs Imposter)...")
    print("-" * 65)
    print(f"{'Pair':<35} | {'Similarity':<10} | {'Expected':<10} | {'Status'}")
    print("-" * 65)

    test_pairs = [
        ("A", "A", "A_doc", "A_live", "genuine", 0.45, True),
        ("A", "B", "A_doc", "B_live", "imposter", 0.45, False),
        ("B", "B", "B_doc", "B_live", "genuine", 0.45, True),
        ("B", "A", "B_doc", "A_live", "imposter", 0.45, False),
    ]

    evaluation_rows = []
    all_passed = True
    SIMILARITY_THRESHOLD = 0.45

    for doc_id, live_id, doc_key, live_key, expected_label, thresh, expect_match in test_pairs:
        emb_doc = embeddings[doc_key]
        emb_live = embeddings[live_key]

        sim = cosine_similarity(emb_doc, emb_live)
        is_match = sim >= thresh
        actual_label = "genuine" if is_match else "imposter"

        passed = (actual_label == expected_label)
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False

        pair_name = f"Person {doc_id} (doc) vs Person {live_id} (live)"
        print(f"{pair_name:<35} | {sim:.4f}     | {expected_label:<10} | {status}")

        evaluation_rows.append({
            "document": doc_id,
            "live": live_id,
            "similarity": f"{sim:.4f}",
            "label": actual_label,
        })

    print("-" * 65)

    # 4. Generate evaluation.csv
    print("\n[4/4] Writing evaluation results to evaluation.csv...")
    output_dirs = [
        ROOT_DIR / "output",
        ROOT_DIR / "AI" / "output" if (ROOT_DIR / "AI").exists() else None,
    ]

    for out_dir in output_dirs:
        if out_dir is None:
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        csv_path = out_dir / "evaluation.csv"

        with open(csv_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["document", "live", "similarity", "label"])
            writer.writeheader()
            writer.writerows(evaluation_rows)

        print(f"[OK] Saved evaluation CSV to: {csv_path}")

    # Display generated CSV content in terminal
    print("\n--- Generated evaluation.csv Content ---")
    print("document,live,similarity,label")
    for r in evaluation_rows:
        print(f"{r['document']},{r['live']},{r['similarity']},{r['label']}")
    print("----------------------------------------")

    # Edge cases
    print("\n[Edge Cases & Error Handling]")
    # Missing file
    try:
        embedder.extract_embedding(sample_dir / "missing.jpg")
        print("[FAIL] Missing file did not raise FileNotFoundError")
        all_passed = False
    except FileNotFoundError:
        print("[OK] Missing file handled cleanly (FileNotFoundError)")

    # Non-face image
    random_img_path = sample_dir / "random_image.jpg"
    if random_img_path.exists():
        non_face_emb = embedder.extract_embedding(random_img_path)
        if non_face_emb is None:
            print("[OK] Non-face image returned None as expected.")
        else:
            print("[FAIL] Non-face image returned an embedding.")
            all_passed = False

    print("\n" + "=" * 65)
    if all_passed:
        print("ALL PHASE 2 FACE EMBEDDING TESTS PASSED (100% SUCCESS) [OK]")
    else:
        print("SOME TESTS FAILED [FAIL]")
    print("=" * 65)

    return all_passed


if __name__ == "__main__":
    success = run_embedding_tests()
    sys.exit(0 if success else 1)
