"""
Phase 10 — Spatial Evidence Correlation Engine
===============================================
Correlates suspicious regions from independent detectors (ELA, Noise, Copy-Move,
Stamp, Splicing, and Content Alteration) based on their spatial overlap in the
original image coordinate frame.

When multiple independent detectors flag the same document area, their spatial
corroboration produces strong unified regional evidence.
"""

from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

from image_tampering.schemas.forensic import SuspiciousRegion, FusedRegion, Signals
from image_tampering.fusion.config import (
    REGION_IOU_THRESHOLD,
    EVIDENCE_STRENGTH_THRESHOLDS,
    COPY_MOVE_STRENGTH_MINIMUM,
    SCORE_NORMALIZATION_CAPS,
)
from image_tampering.fusion.normalizer import normalize_score

logger = logging.getLogger(__name__)

# Minimum score for a detector to be considered supporting evidence
DEFAULT_MIN_SUPPORT_SCORE: float = 0.30


# ── Coordinate Normalization Helper ──────────────────────────────────────────

def extract_box_tuple(box: Any) -> Tuple[int, int, int, int]:
    """Extract (x, y, w, h) from SuspiciousRegion, tuple, list, or dict."""
    if isinstance(box, SuspiciousRegion):
        return int(box.x), int(box.y), int(box.width), int(box.height)
    if isinstance(box, (tuple, list)):
        return int(box[0]), int(box[1]), int(box[2]), int(box[3])
    if isinstance(box, dict):
        return int(box.get("x", 0)), int(box.get("y", 0)), int(box.get("width", 0)), int(box.get("height", 0))
    raise ValueError(f"Unsupported box format: {box}")


def normalize_box_to_original(
    box: Any,
    coordinate_mapper: Any = None,
) -> Tuple[int, int, int, int]:
    """
    Ensure a bounding box is in the original image coordinate frame.
    If coordinate_mapper is provided, maps working box to original box.
    """
    x, y, w, h = extract_box_tuple(box)
    if coordinate_mapper is not None:
        if hasattr(coordinate_mapper, "box_to_original"):
            ox, oy, ow, oh = coordinate_mapper.box_to_original(x, y, w, h)
            return int(round(ox)), int(round(oy)), int(round(ow)), int(round(oh))
        elif hasattr(coordinate_mapper, "to_original_box"):
            ox, oy, ow, oh = coordinate_mapper.to_original_box(x, y, w, h)
            return int(round(ox)), int(round(oy)), int(round(ow)), int(round(oh))
    return x, y, w, h


# ── IoU and Overlap Math ──────────────────────────────────────────────────────

def compute_iou(
    box1: Tuple[int, int, int, int] | List[int],
    box2: Tuple[int, int, int, int] | List[int],
) -> float:
    """
    Standard Intersection-over-Union (IoU) = intersection_area / union_area.
    Returns 0.0 if boxes do not overlap.
    """
    x1, y1, w1, h1 = extract_box_tuple(box1)
    x2, y2, w2, h2 = extract_box_tuple(box2)

    ix1 = max(x1, x2)
    iy1 = max(y1, y2)
    ix2 = min(x1 + w1, x2 + w2)
    iy2 = min(y1 + h1, y2 + h2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    inter_area = (ix2 - ix1) * (iy2 - iy1)
    union_area = (w1 * h1) + (w2 * h2) - inter_area
    return float(inter_area / union_area) if union_area > 0 else 0.0


def compute_overlap_ratio_smaller(
    box1: Tuple[int, int, int, int] | List[int],
    box2: Tuple[int, int, int, int] | List[int],
) -> float:
    """
    Computes spatial intersection relative to the smaller bounding box area:
    intersection_area / min(area1, area2).
    """
    x1, y1, w1, h1 = extract_box_tuple(box1)
    x2, y2, w2, h2 = extract_box_tuple(box2)

    ix1 = max(x1, x2)
    iy1 = max(y1, y2)
    ix2 = min(x1 + w1, x2 + w2)
    iy2 = min(y1 + h1, y2 + h2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    inter_area = (ix2 - ix1) * (iy2 - iy1)
    min_area = min(w1 * h1, w2 * h2)
    return float(inter_area / min_area) if min_area > 0 else 0.0


def boxes_overlap(
    box1: Tuple[int, int, int, int] | List[int],
    box2: Tuple[int, int, int, int] | List[int],
    iou_threshold: float = REGION_IOU_THRESHOLD,
) -> bool:
    """
    Determine if two bounding boxes should be considered the same spatial region.
    Returns True if standard IoU >= iou_threshold OR containment ratio >= max(iou_threshold, 0.40).
    """
    iou = compute_iou(box1, box2)
    if iou >= iou_threshold:
        return True
    containment = compute_overlap_ratio_smaller(box1, box2)
    return containment >= max(iou_threshold, 0.40)


def merge_boxes(
    box1: Tuple[int, int, int, int] | List[int],
    box2: Tuple[int, int, int, int] | List[int],
) -> Tuple[int, int, int, int]:
    """Computes the enclosing bounding box of the union of two boxes."""
    x1, y1, w1, h1 = extract_box_tuple(box1)
    x2, y2, w2, h2 = extract_box_tuple(box2)

    nx1 = min(x1, x2)
    ny1 = min(y1, y2)
    nx2 = max(x1 + w1, x2 + w2)
    ny2 = max(y1 + h1, y2 + h2)

    return nx1, ny1, nx2 - nx1, ny2 - ny1


# ── Evidence Strength Evaluation ──────────────────────────────────────────────

def calculate_evidence_strength(
    supporting_detectors: List[str],
    signals: Dict[str, float],
) -> str:
    """
    Evidence strength based on independent corroborating detectors:
    - 3+ independent detectors → STRONG
    - 2 independent detectors  → MODERATE
    - 1 detector               → WEAK
    - 0 detectors              → NONE

    Special rule: copy_move with confident score is elevated to MODERATE.
    """
    count = len(supporting_detectors)
    has_copy_move = "copy_move" in [d.lower() for d in supporting_detectors]
    cm_score = signals.get("copy_move", 0.0)

    if count >= 3:
        return "STRONG"
    if count == 2:
        return "MODERATE"
    if count == 1:
        if has_copy_move and cm_score >= 0.40:
            return COPY_MOVE_STRENGTH_MINIMUM
        return "WEAK"
    return "NONE"


def _format_detector_list(detectors: List[str]) -> str:
    """Format list of detector names for natural narrative."""
    formatted = [d.upper() for d in detectors]
    if not formatted:
        return ""
    if len(formatted) == 1:
        return formatted[0]
    if len(formatted) == 2:
        return f"{formatted[0]} and {formatted[1]}"
    return f"{', '.join(formatted[:-1])} and {formatted[-1]}"


# ── Spatial Evidence Correlation Core ─────────────────────────────────────────

def correlate_spatial_evidence(
    detector_regions_map: Dict[str, List[Any]],
    coordinate_mapper: Any = None,
    iou_threshold: float = REGION_IOU_THRESHOLD,
    min_support_score: float = DEFAULT_MIN_SUPPORT_SCORE,
    page: int = 1,
) -> List[FusedRegion]:
    """
    Phase 10: Spatial Evidence Correlation
    Correlates suspicious regions from independent detectors by spatial overlap.

    Parameters
    ----------
    detector_regions_map : dict mapping detector name -> list of SuspiciousRegions or bounding boxes
    coordinate_mapper    : optional CoordinateMapper to normalize scales
    iou_threshold        : IoU overlap threshold (default from config)
    min_support_score    : threshold below which detector scores are not considered supporting evidence
    page                 : page index for PDF/multi-page processing

    Returns
    -------
    list[FusedRegion] with unified spatial correlation metadata.
    """
    # 1. Flatten all detector regions into normalized detection items
    flat_items: List[Dict[str, Any]] = []
    for detector_name, regions in detector_regions_map.items():
        if not regions:
            continue
        for r in regions:
            raw_score = getattr(r, "score", None)
            if raw_score is None and isinstance(r, dict):
                raw_score = r.get("score", 0.5)
            elif raw_score is None:
                raw_score = 0.5

            norm_box = normalize_box_to_original(r, coordinate_mapper)

            target_box = None
            if hasattr(r, "target_x") and r.target_x is not None:
                target_box = normalize_box_to_original(
                    (r.target_x, r.target_y, r.target_width, r.target_height),
                    coordinate_mapper
                )
            elif isinstance(r, dict) and "target_x" in r and r["target_x"] is not None:
                target_box = normalize_box_to_original(
                    (r["target_x"], r["target_y"], r["target_width"], r["target_height"]),
                    coordinate_mapper
                )

            item_page = getattr(r, "page", None) or (r.get("page") if isinstance(r, dict) else None) or page

            flat_items.append({
                "detector": detector_name.lower(),
                "score": float(raw_score),
                "box": norm_box,
                "target_box": target_box,
                "page": item_page,
                "raw_region": r,
            })

    if not flat_items:
        return []

    # 2. Cluster overlapping regions using Union-Find algorithm
    num_items = len(flat_items)
    parent = list(range(num_items))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        root_i = find(i)
        root_j = find(j)
        if root_i != root_j:
            parent[root_i] = root_j

    for i in range(num_items):
        for j in range(i + 1, num_items):
            # Only cluster within the same page
            if flat_items[i]["page"] != flat_items[j]["page"]:
                continue
            if boxes_overlap(flat_items[i]["box"], flat_items[j]["box"], iou_threshold=iou_threshold):
                union(i, j)

    # Group flat items by cluster root
    clusters: Dict[int, List[Dict[str, Any]]] = {}
    for i in range(num_items):
        root = find(i)
        clusters.setdefault(root, []).append(flat_items[i])

    # 3. Assemble unified correlated regions
    correlated_regions: List[FusedRegion] = []

    for cluster_idx, (_, items) in enumerate(clusters.items()):
        region_id = f"R{cluster_idx + 1:03d}"
        cluster_page = items[0]["page"]

        # Calculate union bounding box
        merged_box = items[0]["box"]
        for it in items[1:]:
            merged_box = merge_boxes(merged_box, it["box"])

        # Aggregate raw detector signals
        signals: Dict[str, float] = {}
        signal_scores: Dict[str, int] = {}
        target_box_final: Optional[Tuple[int, int, int, int]] = None

        for it in items:
            det = it["detector"]
            score = it["score"]
            current_max = signals.get(det, 0.0)
            if score >= current_max:
                signals[det] = round(score, 4)
            if it["target_box"] is not None and target_box_final is None:
                target_box_final = it["target_box"]

        # Calculate normalized 0-100 scores
        for det, raw_sc in signals.items():
            cap = SCORE_NORMALIZATION_CAPS.get(det, 1.0)
            norm = normalize_score(raw_sc, cap)
            if norm is not None:
                signal_scores[det.upper()] = norm

        # Determine supporting detectors (exclude low/no support scores)
        supporting_detectors = [
            det.upper()
            for det, sc in signals.items()
            if sc >= min_support_score
        ]
        detector_count = len(supporting_detectors)

        # Evidence strength
        evidence_strength = calculate_evidence_strength(supporting_detectors, signals)

        # Severity categorization
        max_norm = max(signal_scores.values()) if signal_scores else 0
        if evidence_strength == "STRONG":
            severity = "HIGH"
        elif evidence_strength == "MODERATE":
            severity = "HIGH" if max_norm >= 70 else "MEDIUM"
        elif evidence_strength == "WEAK":
            severity = "MEDIUM" if max_norm >= 75 else "LOW"
        else:
            severity = "LOW"

        # Generate XAI explanation reason
        if detector_count >= 2:
            dets_str = _format_detector_list(supporting_detectors)
            reason = f"Region {region_id} is suspicious because {dets_str} independently detected anomalies in the same area."
        elif detector_count == 1:
            reason = f"Single forensic indicator ({supporting_detectors[0]}) flags this region as suspicious."
        else:
            reason = "Low-level forensic indicator; no multi-signal corroboration."

        # Bounding box representations
        bbox_dict = {
            "x": merged_box[0],
            "y": merged_box[1],
            "width": merged_box[2],
            "height": merged_box[3],
        }
        bbox_list = [merged_box[0], merged_box[1], merged_box[2], merged_box[3]]

        target_bbox_dict = None
        if target_box_final is not None:
            target_bbox_dict = {
                "x": target_box_final[0],
                "y": target_box_final[1],
                "width": target_box_final[2],
                "height": target_box_final[3],
            }

        correlated_regions.append(FusedRegion(
            region_id=region_id,
            page=cluster_page,
            bbox=bbox_dict,
            severity=severity,
            evidence_strength=evidence_strength,
            evidence_count=detector_count,
            detector_count=detector_count,
            supporting_signals=supporting_detectors,
            supporting_detectors=supporting_detectors,
            signals=signals,
            signal_scores=signal_scores,
            reason=reason,
            target_bbox=target_bbox_dict,
        ))

    # Sort regions by severity and detector count descending
    sev_rank = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}
    correlated_regions.sort(
        key=lambda r: (sev_rank.get(r.severity, 0), r.detector_count, max(r.signals.values()) if r.signals else 0),
        reverse=True
    )

    # Re-index region IDs sequentially R001, R002, ...
    for idx, cr in enumerate(correlated_regions):
        cr.region_id = f"R{idx + 1:03d}"
        # Update reason with correct region ID if necessary
        if cr.detector_count >= 2:
            dets_str = _format_detector_list(cr.supporting_detectors)
            cr.reason = f"Region {cr.region_id} is suspicious because {dets_str} independently detected anomalies in the same area."

    return correlated_regions
