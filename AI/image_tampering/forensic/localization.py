import os
import cv2
import numpy as np
from typing import List, Optional
from image_tampering.schemas.forensic import SuspiciousRegion
from image_tampering.forensic.preprocessing import CoordinateMapper

def calculate_overlap_ratio_smaller(box1: tuple, box2: tuple) -> float:
    """
    Computes the spatial intersection ratio relative to the smaller box's area.
    box is (x, y, w, h)
    """
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2
    
    ix1 = max(x1, x2)
    iy1 = max(y1, y2)
    ix2 = min(x1 + w1, x2 + w2)
    iy2 = min(y1 + h1, y2 + h2)
    
    if ix2 > ix1 and iy2 > iy1:
        intersection_area = (ix2 - ix1) * (iy2 - iy1)
        area1 = w1 * h1
        area2 = w2 * h2
        min_area = min(area1, area2)
        return float(intersection_area / min_area) if min_area > 0 else 0.0
    return 0.0

def merge_boxes(box1: tuple, box2: tuple) -> tuple:
    """
    Computes the bounding box of the union of two boxes.
    box is (x, y, w, h)
    """
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2
    
    nx1 = min(x1, x2)
    ny1 = min(y1, y2)
    nx2 = max(x1 + w1, x2 + w2)
    ny2 = max(y1 + h1, y2 + h2)
    
    return nx1, ny1, nx2 - nx1, ny2 - ny1

def localize_suspicious_regions(
    ela_regions: List[SuspiciousRegion],
    noise_regions: List[SuspiciousRegion],
    copy_move_regions: List[SuspiciousRegion],
    stamp_regions: List[SuspiciousRegion],
    overlap_threshold: float = 0.3,
    working_image_rgb: Optional[np.ndarray] = None,
    coordinate_mapper: Optional[CoordinateMapper] = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None
) -> List[SuspiciousRegion]:
    """
    Phase 7: Suspicious-Region Localization layer.
    Combines spatial evidence from ELA, Noise, Copy-Move, and Stamp detectors,
    and merges overlapping boxes using a Union-Find disjoint-set algorithm.
    """
    # 1. Gather all regions
    all_regions = []
    if ela_regions:
        all_regions.extend(ela_regions)
    if noise_regions:
        all_regions.extend(noise_regions)
    if copy_move_regions:
        all_regions.extend(copy_move_regions)
    if stamp_regions:
        all_regions.extend(stamp_regions)

    if not all_regions:
        return []

    # 2. Group overlapping regions using Union-Find on disjoint sets
    n = len(all_regions)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        root_i = find(i)
        root_j = find(j)
        if root_i != root_j:
            parent[root_i] = root_j

    for i in range(n):
        for j in range(i + 1, n):
            box1 = (all_regions[i].x, all_regions[i].y, all_regions[i].width, all_regions[i].height)
            box2 = (all_regions[j].x, all_regions[j].y, all_regions[j].width, all_regions[j].height)
            
            # Check overlap relative to smaller box area
            if calculate_overlap_ratio_smaller(box1, box2) > overlap_threshold:
                union(i, j)

    # Group components
    components = {}
    for i in range(n):
        root = find(i)
        if root not in components:
            components[root] = []
        components[root].append(all_regions[i])

    merged_regions = []
    severity_map = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}
    inv_severity_map = {1: "LOW", 2: "MEDIUM", 3: "HIGH"}

    for root, comp in components.items():
        if len(comp) == 1:
            merged_regions.append(comp[0])
            continue

        # Merge overlapping regions
        r0 = comp[0]
        merged_box = (r0.x, r0.y, r0.width, r0.height)
        max_score = r0.score
        sources = {r0.source}
        reasons = [f"[{r0.source}] {r0.reason}"]
        max_sev_val = severity_map.get(r0.severity, 1)
        
        target_x = r0.target_x
        target_y = r0.target_y
        target_w = r0.target_width
        target_h = r0.target_height

        for r in comp[1:]:
            merged_box = merge_boxes(merged_box, (r.x, r.y, r.width, r.height))
            max_score = max(max_score, r.score)
            sources.add(r.source)
            reasons.append(f"[{r.source}] {r.reason}")
            max_sev_val = max(max_sev_val, severity_map.get(r.severity, 1))
            
            # Preserve target coordinates if present
            if r.target_x is not None:
                target_x = r.target_x
                target_y = r.target_y
                target_w = r.target_width
                target_h = r.target_height

        merged_regions.append(SuspiciousRegion(
            x=merged_box[0],
            y=merged_box[1],
            width=merged_box[2],
            height=merged_box[3],
            score=max_score,
            severity=inv_severity_map[max_sev_val],
            source="+".join(sorted(list(sources))),
            reason=" | ".join(reasons),
            target_x=target_x,
            target_y=target_y,
            target_width=target_w,
            target_height=target_h
        ))

    # Sort merged regions by score descending
    merged_regions.sort(key=lambda r: r.score, reverse=True)

    # 3. Save Unified Localization Heatmap / Debug Image
    if save_debug and debug_dir and working_image_rgb is not None:
        os.makedirs(debug_dir, exist_ok=True)
        vis_bgr = cv2.cvtColor(working_image_rgb.copy(), cv2.COLOR_RGB2BGR)
        
        for idx, r in enumerate(merged_regions):
            # Map back from original to working image coordinates for drawing
            if coordinate_mapper:
                w_x = int(round(r.x * coordinate_mapper.scale_x))
                w_y = int(round(r.y * coordinate_mapper.scale_y))
                w_w = int(round(r.width * coordinate_mapper.scale_x))
                w_h = int(round(r.height * coordinate_mapper.scale_y))
            else:
                w_x, w_y, w_w, w_h = r.x, r.y, r.width, r.height

            # Color coding: Red for HIGH, Orange for MEDIUM, Green for LOW
            if r.severity == "HIGH":
                color = (0, 0, 255)
            elif r.severity == "MEDIUM":
                color = (0, 165, 255)
            else:
                color = (0, 255, 0)

            cv2.rectangle(vis_bgr, (w_x, w_y), (w_x + w_w, w_y + w_h), color, 2)
            cv2.putText(
                vis_bgr,
                f"L#{idx+1} {r.source} Score:{r.score:.2f}",
                (w_x, w_y - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.4,
                color,
                1
            )
            
            # If target mapping coordinates exist, draw target box and translation line
            if r.target_x is not None:
                if coordinate_mapper:
                    t_x = int(round(r.target_x * coordinate_mapper.scale_x))
                    t_y = int(round(r.target_y * coordinate_mapper.scale_y))
                    t_w = int(round(r.target_width * coordinate_mapper.scale_x))
                    t_h = int(round(r.target_height * coordinate_mapper.scale_y))
                else:
                    t_x, t_y, t_w, t_h = r.target_x, r.target_y, r.target_width, r.target_height
                
                # Draw target box (dotted/thin line)
                cv2.rectangle(vis_bgr, (t_x, t_y), (t_x + t_w, t_y + t_h), (255, 0, 255), 1)
                # Connecting line between source and target anchors
                cv2.line(vis_bgr, (w_x + w_w // 2, w_y + w_h // 2), (t_x + t_w // 2, t_y + t_h // 2), (255, 255, 0), 1)

        cv2.imwrite(os.path.join(debug_dir, "document_localized.jpg"), vis_bgr)

    return merged_regions
