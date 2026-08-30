import os
import cv2
import numpy as np
from typing import Optional

# Import schemas
from image_tampering.schemas.forensic import (
    ForensicResult,
    ImageInfo,
    QualityMetrics,
    RepresentationsStatus,
    Signals,
    FusionResult,
    FusionEvidence,
    FusedRegion,
    SuspiciousRegion,
    ForensicSignal
)

# Import module functions
from image_tampering.forensic.preprocessing import (
    load_and_preprocess_image,
    load_image_from_file,
    load_and_preprocess_pdf,
    is_pdf
)
from image_tampering.forensic.quality import calculate_quality_metrics
from image_tampering.forensic.representations import generate_representations

# Import skeletons
from image_tampering.forensic.ela import analyze_ela
from image_tampering.forensic.noise import analyze_noise
from image_tampering.forensic.copy_move import analyze_copy_move
from image_tampering.forensic.metadata import analyze_metadata
from image_tampering.forensic.stamp import analyze_stamps
from image_tampering.forensic.splicing import analyze_splicing
from image_tampering.forensic.fusion import fuse_signals, fuse_signals_full
from image_tampering.forensic.localization import localize_suspicious_regions

DEFAULT_DEBUG_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "output")
)

def _run_forensic_pipeline_pdf(
    pdf_bytes: bytes,
    filename: str = "document.pdf",
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicResult:
    """
    Executes forensic tampering analysis on a PDF document across all its pages.
    """
    if not debug_dir:
        debug_dir = DEFAULT_DEBUG_DIR

    pages_data = load_and_preprocess_pdf(
        pdf_bytes=pdf_bytes,
        filename=filename,
        max_working_dim=1920,
        scale=2.0
    )

    pdf_debug_base = os.path.join(debug_dir, "pdf_debug") if save_debug else None
    if save_debug:
        os.makedirs(pdf_debug_base, exist_ok=True)

    # Extract Document-level metadata signal
    doc_metadata_sig = analyze_metadata(
        image_bytes=pdf_bytes,
        save_debug=save_debug,
        debug_dir=pdf_debug_base
    )

    page_results = []
    all_regions: list[SuspiciousRegion] = []
    all_fused_regions: list[FusedRegion] = []

    for orig_rgb, work_rgb, mapper, page_num in pages_data:
        page_dir = os.path.join(pdf_debug_base, f"page_{page_num:03d}") if save_debug else None
        if save_debug:
            os.makedirs(page_dir, exist_ok=True)

        # Representations
        reps = generate_representations(work_rgb)
        grayscale = reps["grayscale"]
        hsv = reps["hsv"]
        lab = reps["lab"]
        noise_residual = reps["noise_residual"]

        # Quality
        quality_data = calculate_quality_metrics(grayscale)

        # Detectors
        ela_sig = analyze_ela(
            working_image_rgb=work_rgb,
            quality=95,
            coordinate_mapper=mapper,
            save_debug=save_debug,
            debug_dir=page_dir
        )
        noise_sig = analyze_noise(
            working_image_rgb=work_rgb,
            noise_residual=noise_residual,
            coordinate_mapper=mapper,
            save_debug=save_debug,
            debug_dir=page_dir
        )
        copymove_sig = analyze_copy_move(
            working_image_rgb=work_rgb,
            coordinate_mapper=mapper,
            save_debug=save_debug,
            debug_dir=page_dir
        )
        stamp_sig = analyze_stamps(
            working_image_rgb=work_rgb,
            grayscale=grayscale,
            hsv=hsv,
            lab=lab,
            noise_residual=noise_residual,
            coordinate_mapper=mapper,
            ela_regions=ela_sig.regions if ela_sig else [],
            noise_regions=noise_sig.regions if noise_sig else [],
            copy_move_regions=copymove_sig.regions if copymove_sig else [],
            save_debug=save_debug,
            debug_dir=page_dir
        )
        splicing_sig = analyze_splicing(
            working_image_rgb=work_rgb,
            original_image_rgb=orig_rgb,
            coordinate_mapper=mapper,
            save_debug=save_debug,
            debug_dir=page_dir
        )

        # Tag page on detector regions
        for sig in [ela_sig, noise_sig, copymove_sig, stamp_sig, splicing_sig]:
            if sig and sig.regions:
                for r in sig.regions:
                    r.page = page_num

        page_signals = Signals(
            ela=ela_sig,
            noise=noise_sig,
            copy_move=copymove_sig,
            metadata=doc_metadata_sig,
            stamp=stamp_sig,
            splicing=splicing_sig
        )

        page_regions = localize_suspicious_regions(
            ela_regions=ela_sig.regions if (ela_sig and ela_sig.available) else [],
            noise_regions=noise_sig.regions if (noise_sig and noise_sig.available) else [],
            copy_move_regions=copymove_sig.regions if (copymove_sig and copymove_sig.available) else [],
            stamp_regions=stamp_sig.regions if (stamp_sig and stamp_sig.available) else [],
            splicing_regions=splicing_sig.regions if (splicing_sig and splicing_sig.available) else [],
            overlap_threshold=0.3,
            working_image_rgb=work_rgb,
            coordinate_mapper=mapper,
            save_debug=save_debug,
            debug_dir=page_dir,
            page=page_num
        )

        for r in page_regions:
            r.page = page_num

        page_fusion_res = fuse_signals_full(page_signals, page_regions, page=page_num)

        if save_debug and page_dir:
            working_bgr = cv2.cvtColor(work_rgb, cv2.COLOR_RGB2BGR)
            cv2.imwrite(os.path.join(page_dir, "rendered.png"), working_bgr)
            cv2.imwrite(os.path.join(page_dir, "document_gray.jpg"), grayscale)
            cv2.imwrite(os.path.join(page_dir, "document_noise_residual.jpg"), noise_residual)

        all_regions.extend(page_regions)
        if page_fusion_res.evidence and page_fusion_res.evidence.fused_regions:
            all_fused_regions.extend(page_fusion_res.evidence.fused_regions)

        page_results.append({
            "page_num": page_num,
            "orig_rgb": orig_rgb,
            "work_rgb": work_rgb,
            "quality_data": quality_data,
            "signals": page_signals,
            "regions": page_regions,
            "fusion": page_fusion_res
        })

    # Select the page with the highest tampering / fusion score
    best_page = max(page_results, key=lambda p: (p["fusion"].score or 0.0))
    best_score = best_page["fusion"].score or 0.0
    best_overall_score = best_page["fusion"].evidence.overall_score if best_page["fusion"].evidence else int(round(best_score * 100))
    best_risk_level = best_page["fusion"].risk_level or "LOW"

    # Identify suspicious pages
    suspicious_pages = [p["page_num"] for p in page_results if (p["fusion"].score or 0.0) >= 0.5]

    # Re-index all fused regions with unique IDs
    for idx, fr in enumerate(all_fused_regions):
        fr.region_id = f"R{idx + 1:03d}"

    # Build document-level explanations
    if len(page_results) > 1:
        doc_explanations = []
        if suspicious_pages:
            doc_explanations.append(f"Suspicious page(s) detected: {', '.join(str(pn) for pn in suspicious_pages)} out of {len(page_results)} total page(s).")
        for p in page_results:
            p_score = p["fusion"].score or 0.0
            p_exps = p["fusion"].evidence.explanations if p["fusion"].evidence else []
            if p_score >= 0.3 or p_exps:
                for exp in p_exps:
                    doc_explanations.append(f"Page {p['page_num']}: {exp}")
        if not doc_explanations:
            doc_explanations = best_page["fusion"].evidence.explanations if best_page["fusion"].evidence else []
    else:
        doc_explanations = best_page["fusion"].evidence.explanations if best_page["fusion"].evidence else []

    doc_evidence = FusionEvidence(
        overall_score=best_overall_score,
        overall_level=best_risk_level,
        signals=best_page["fusion"].evidence.signals if best_page["fusion"].evidence else {},
        fused_regions=all_fused_regions,
        explanations=doc_explanations,
        detectors_available=best_page["fusion"].evidence.detectors_available if best_page["fusion"].evidence else [],
        detectors_unavailable=best_page["fusion"].evidence.detectors_unavailable if best_page["fusion"].evidence else [],
        conflict_detected=best_page["fusion"].evidence.conflict_detected if best_page["fusion"].evidence else False,
        conflict_note=best_page["fusion"].evidence.conflict_note if best_page["fusion"].evidence else None
    )

    doc_fusion = FusionResult(
        score=best_score,
        confidence=None,
        risk_level=best_risk_level,
        evidence=doc_evidence
    )

    # Document ImageInfo
    primary_orig = pages_data[0][0]
    primary_work = pages_data[0][1]
    orig_h, orig_w = primary_orig.shape[:2]
    work_h, work_w = primary_work.shape[:2]

    # Combine signals: select the strongest signal for each detector across pages
    def pick_strongest_signal(sig_name: str) -> Optional[ForensicSignal]:
        candidates = [getattr(p["signals"], sig_name) for p in page_results if getattr(p["signals"], sig_name) is not None]
        if not candidates:
            return None
        best_sig = max(candidates, key=lambda s: (s.score or 0.0))
        combined_regions = []
        for s in candidates:
            if s.regions:
                combined_regions.extend(s.regions)
        return ForensicSignal(
            name=best_sig.name,
            score=best_sig.score,
            confidence=best_sig.confidence,
            regions=combined_regions,
            evidence=best_sig.evidence,
            available=best_sig.available,
            stamp_detected=best_sig.stamp_detected,
            statistics=best_sig.statistics,
            quality=best_sig.quality,
            heatmap_path=best_sig.heatmap_path,
            map_path=best_sig.map_path
        )

    doc_signals = Signals(
        ela=pick_strongest_signal("ela"),
        noise=pick_strongest_signal("noise"),
        copy_move=pick_strongest_signal("copy_move"),
        metadata=doc_metadata_sig,
        stamp=pick_strongest_signal("stamp"),
        splicing=pick_strongest_signal("splicing")
    )

    return ForensicResult(
        image=ImageInfo(
            width=orig_w,
            height=orig_h,
            channels=3,
            format="PDF",
            working_width=work_w,
            working_height=work_h
        ),
        quality=QualityMetrics(
            brightness=best_page["quality_data"]["brightness"],
            contrast=best_page["quality_data"]["contrast"],
            sharpness=best_page["quality_data"]["sharpness"],
            blur_detected=best_page["quality_data"]["blur_detected"]
        ),
        representations=RepresentationsStatus(
            grayscale=True,
            hsv=True,
            lab=True,
            noise_residual=True
        ),
        regions=all_regions,
        signals=doc_signals,
        fusion=doc_fusion
    )

def run_forensic_pipeline(
    image_bytes: bytes,
    filename: str = "image.jpg",
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicResult:
    """
    Executes forensic tampering analysis on the provided image or PDF bytes.
    """
    if not debug_dir:
        debug_dir = DEFAULT_DEBUG_DIR

    # PDF detection
    if is_pdf(image_bytes, filename):
        return _run_forensic_pipeline_pdf(
            pdf_bytes=image_bytes,
            filename=filename,
            save_debug=save_debug,
            debug_dir=debug_dir
        )

    # 1. Load and Preprocess Image
    original_rgb, working_rgb, mapper, img_format = load_and_preprocess_image(
        image_bytes=image_bytes,
        filename=filename
    )

    # Dimensions
    orig_h, orig_w = original_rgb.shape[:2]
    work_h, work_w = working_rgb.shape[:2]
    channels = original_rgb.shape[2] if len(original_rgb.shape) == 3 else 1

    # 2. Extract Color Space Representations & Noise Residual
    reps = generate_representations(working_rgb)
    grayscale = reps["grayscale"]
    hsv = reps["hsv"]
    lab = reps["lab"]
    noise_residual = reps["noise_residual"]

    # 3. Quality Analysis (Laplacian Variance, brightness, contrast)
    quality_data = calculate_quality_metrics(grayscale)

    # 4. Generate Forensic Signals (ELA and Noise active in Phase 3, others remain skeletons)
    ela_sig = analyze_ela(
        working_image_rgb=working_rgb,
        quality=95,
        coordinate_mapper=mapper,
        save_debug=save_debug,
        debug_dir=debug_dir
    )
    noise_sig = analyze_noise(
        working_image_rgb=working_rgb,
        noise_residual=noise_residual,
        coordinate_mapper=mapper,
        save_debug=save_debug,
        debug_dir=debug_dir
    )
    copymove_sig = analyze_copy_move(
        working_image_rgb=working_rgb,
        coordinate_mapper=mapper,
        save_debug=save_debug,
        debug_dir=debug_dir
    )
    metadata_sig = analyze_metadata(
        image_bytes=image_bytes,
        save_debug=save_debug,
        debug_dir=debug_dir
    )
    
    # Stamp detector needs access to all representations and existing signals for cross-checks
    stamp_sig = analyze_stamps(
        working_image_rgb=working_rgb,
        grayscale=grayscale,
        hsv=hsv,
        lab=lab,
        noise_residual=noise_residual,
        coordinate_mapper=mapper,
        ela_regions=ela_sig.regions if ela_sig else [],
        noise_regions=noise_sig.regions if noise_sig else [],
        copy_move_regions=copymove_sig.regions if copymove_sig else [],
        save_debug=save_debug,
        debug_dir=debug_dir
    )
    splicing_sig = analyze_splicing(
        working_image_rgb=working_rgb,
        original_image_rgb=original_rgb,
        coordinate_mapper=mapper,
        save_debug=save_debug,
        debug_dir=debug_dir
    )

    # Bundle all signals
    signals = Signals(
        ela=ela_sig,
        noise=noise_sig,
        copy_move=copymove_sig,
        metadata=metadata_sig,
        stamp=stamp_sig,
        splicing=splicing_sig
    )

    # 5. Phase-7: Unified suspicious region localization
    regions = localize_suspicious_regions(
        ela_regions=ela_sig.regions if (ela_sig and ela_sig.available) else [],
        noise_regions=noise_sig.regions if (noise_sig and noise_sig.available) else [],
        copy_move_regions=copymove_sig.regions if (copymove_sig and copymove_sig.available) else [],
        stamp_regions=stamp_sig.regions if (stamp_sig and stamp_sig.available) else [],
        splicing_regions=splicing_sig.regions if (splicing_sig and splicing_sig.available) else [],
        overlap_threshold=0.3,
        working_image_rgb=working_rgb,
        coordinate_mapper=mapper,
        save_debug=save_debug,
        debug_dir=debug_dir,
        page=1
    )

    # 6. Phase-8: Evidence Fusion (full, with region attribution)
    fusion_res = fuse_signals_full(signals, regions, page=1)

    # 7. Save Debug outputs if requested
    if save_debug:
        os.makedirs(debug_dir, exist_ok=True)
        
        # Convert RGB to BGR for OpenCV saving
        working_bgr = cv2.cvtColor(working_rgb, cv2.COLOR_RGB2BGR)
        cv2.imwrite(os.path.join(debug_dir, "document_processed.jpg"), working_bgr)
        cv2.imwrite(os.path.join(debug_dir, "document_gray.jpg"), grayscale)
        cv2.imwrite(os.path.join(debug_dir, "document_noise_residual.jpg"), noise_residual)

    # Assemble and return results
    return ForensicResult(
        image=ImageInfo(
            width=orig_w,
            height=orig_h,
            channels=channels,
            format=img_format,
            working_width=work_w,
            working_height=work_h
        ),
        quality=QualityMetrics(
            brightness=quality_data["brightness"],
            contrast=quality_data["contrast"],
            sharpness=quality_data["sharpness"],
            blur_detected=quality_data["blur_detected"]
        ),
        representations=RepresentationsStatus(
            grayscale=True,
            hsv=True,
            lab=True,
            noise_residual=True
        ),
        regions=regions,
        signals=signals,
        fusion=fusion_res
    )


def run_forensic_pipeline_from_file(
    filepath: str,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> ForensicResult:
    """
    Convenience wrapper to run the forensic pipeline on an image or PDF file path.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")
    with open(filepath, 'rb') as f:
        image_bytes = f.read()
    return run_forensic_pipeline(
        image_bytes=image_bytes,
        filename=os.path.basename(filepath),
        save_debug=save_debug,
        debug_dir=debug_dir
    )
