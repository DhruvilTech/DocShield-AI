import os
import cv2
import numpy as np
from typing import Optional
from app.schemas.forensic import ForensicSignal, SuspiciousRegion
from app.forensic.preprocessing import CoordinateMapper

def analyze_copy_move(
    working_image_rgb: np.ndarray,
    coordinate_mapper: Optional[CoordinateMapper] = None,
    save_debug: bool = False,
    debug_dir: Optional[str] = None,
    ratio: float = 0.7,
    min_dist_ratio: float = 0.05,
    min_inliers: int = 5
) -> ForensicSignal:
    """
    Performs Copy-Move duplicate tampering detection.
    
    Algorithm:
    1. Extracts SIFT features (keypoints and descriptors) capped at 1,000 for CPU performance.
    2. Performs internal descriptor matching using Brute-Force k-NN matching (k=3).
    3. Filters out self-matches and enforces queryIdx < trainIdx to prevent duplicates.
    4. Filters out close-proximity matches below a spatial distance threshold 
       (default 5% of maximum image dimension) to avoid matching adjacent characters.
    5. Applies Lowe's ratio test comparing the 2nd nearest (other) to 3rd nearest descriptor.
    6. Groups matched points using iterative RANSAC homography estimation.
    7. Extracts source and target bounding boxes for each cluster and maps them to 
       original coordinates.
    8. Generates debug visualization lines mapping copy-move source to target regions.
    """
    if working_image_rgb is None or len(working_image_rgb.shape) != 3:
        raise ValueError("Input image must be a valid 3D RGB image array.")

    # 1. Grayscale Conversion
    gray = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2GRAY)
    h_limit, w_limit = working_image_rgb.shape[:2]

    # 2. SIFT Feature Detection & Descriptor Extraction (Cap at 1,000 keypoints)
    sift = cv2.SIFT_create(nfeatures=1000)
    kp, des = sift.detectAndCompute(gray, None)

    # If no features or too few features are detected, return clean signal
    if des is None or len(kp) < 15:
        statistics = {
            "keypoints": float(len(kp)) if kp is not None else 0.0,
            "candidate_matches": 0.0,
            "verified_matches": 0.0,
            "clusters": 0.0,
            "largest_cluster": 0.0
        }
        return ForensicSignal(
            name="copy_move",
            score=0.0,
            confidence=None,
            regions=[],
            evidence=[{"message": "Insufficient visual features to run copy-move check.", "severity": "LOW"}],
            available=True,
            statistics=statistics
        )

    # 3. Descriptor Matching (k=3 since 1st is the keypoint itself at distance 0.0)
    bf = cv2.BFMatcher(cv2.NORM_L2)
    matches = bf.knnMatch(des, des, k=3)

    # 4. Filter Candidate Matches
    candidate_matches = []
    max_dim = max(h_limit, w_limit)
    min_spatial_dist = max_dim * min_dist_ratio

    for m in matches:
        if len(m) < 3:
            continue
        m0, m1, m2 = m[0], m[1], m[2]
        
        # Enforce queryIdx < trainIdx to ignore symmetry duplicates (B->A is ignored if A->B kept)
        if m1.queryIdx >= m1.trainIdx:
            continue
            
        # Lowe's ratio test: Compare 2nd closest neighbor to 3rd closest neighbor
        if m1.distance < ratio * m2.distance:
            # Check spatial distance between keypoint pairs
            pt1 = kp[m1.queryIdx].pt
            pt2 = kp[m1.trainIdx].pt
            spatial_dist = np.linalg.norm(np.array(pt1) - np.array(pt2))
            
            if spatial_dist >= min_spatial_dist:
                candidate_matches.append(m1)

    # 5. Iterative RANSAC Geometric Verification
    verified_matches = []
    clusters = []
    remaining_matches = candidate_matches.copy()

    while len(remaining_matches) >= min_inliers:
        src_pts = np.float32([kp[m.queryIdx].pt for m in remaining_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp[m.trainIdx].pt for m in remaining_matches]).reshape(-1, 1, 2)
        
        # RANSAC homography search
        H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
        if mask is None:
            break
            
        inliers_count = int(np.sum(mask))
        if inliers_count < min_inliers:
            break
            
        inliers_mask = mask.ravel() == 1
        inlier_matches = [m for i, m in enumerate(remaining_matches) if inliers_mask[i]]
        
        clusters.append(inlier_matches)
        verified_matches.extend(inlier_matches)
        
        # Remove RANSAC inliers to search for other independent copy-move clusters
        remaining_matches = [m for i, m in enumerate(remaining_matches) if not inliers_mask[i]]

    # 6. Bounding Box Segmentation & Coordinate Restoration
    regions = []
    for idx, cluster in enumerate(clusters):
        # Enforce consistent mapping direction using anchor distance splitting
        src_coords = []
        dst_coords = []
        # Use the first query point as the anchor for the source region
        anchor = np.array(kp[cluster[0].queryIdx].pt)
        
        for m in cluster:
            pt1 = np.array(kp[m.queryIdx].pt)
            pt2 = np.array(kp[m.trainIdx].pt)
            
            d1 = np.linalg.norm(pt1 - anchor)
            d2 = np.linalg.norm(pt2 - anchor)
            
            if d1 < d2:
                src_coords.append(pt1)
                dst_coords.append(pt2)
            else:
                src_coords.append(pt2)
                dst_coords.append(pt1)
                
        src_coords = np.array(src_coords)
        dst_coords = np.array(dst_coords)
        
        # Bounding limits
        min_src_x, min_src_y = np.min(src_coords, axis=0)
        max_src_x, max_src_y = np.max(src_coords, axis=0)
        min_dst_x, min_dst_y = np.min(dst_coords, axis=0)
        max_dst_x, max_dst_y = np.max(dst_coords, axis=0)
        
        # Add 15px bounding box padding
        padding = 15
        src_x = int(max(min_src_x - padding, 0))
        src_y = int(max(min_src_y - padding, 0))
        src_w = int(min(max_src_x + padding, w_limit - 1)) - src_x
        src_h = int(min(max_src_y + padding, h_limit - 1)) - src_y
        
        dst_x = int(max(min_dst_x - padding, 0))
        dst_y = int(max(min_dst_y - padding, 0))
        dst_w = int(min(max_dst_x + padding, w_limit - 1)) - dst_x
        dst_h = int(min(max_dst_y + padding, h_limit - 1)) - dst_y

        # Translate coordinates back to original image resolution
        if coordinate_mapper:
            orig_src_x, orig_src_y, orig_src_w, orig_src_h = coordinate_mapper.box_to_original(src_x, src_y, src_w, src_h)
            orig_dst_x, orig_dst_y, orig_dst_w, orig_dst_h = coordinate_mapper.box_to_original(dst_x, dst_y, dst_w, dst_h)
            
            orig_src_x = int(round(orig_src_x))
            orig_src_y = int(round(orig_src_y))
            orig_src_w = int(round(orig_src_w))
            orig_src_h = int(round(orig_src_h))
            
            orig_dst_x = int(round(orig_dst_x))
            orig_dst_y = int(round(orig_dst_y))
            orig_dst_w = int(round(orig_dst_w))
            orig_dst_h = int(round(orig_dst_h))
        else:
            orig_src_x, orig_src_y, orig_src_w, orig_src_h = src_x, src_y, src_w, src_h
            orig_dst_x, orig_dst_y, orig_dst_w, orig_dst_h = dst_x, dst_y, dst_w, dst_h

        # Score is proportional to cluster match size (1.0 at 25+ matches)
        cluster_score = float(min(len(cluster) / 25.0, 1.0))
        severity = "HIGH" if cluster_score > 0.7 else ("MEDIUM" if cluster_score > 0.4 else "LOW")

        regions.append(SuspiciousRegion(
            x=orig_src_x,
            y=orig_src_y,
            width=orig_src_w,
            height=orig_src_h,
            score=cluster_score,
            severity=severity,
            source="copy_move",
            reason=f"Potential duplicated visual region (cluster size: {len(cluster)} matches)",
            target_x=orig_dst_x,
            target_y=orig_dst_y,
            target_width=orig_dst_w,
            target_height=orig_dst_h
        ))

    # Sort regions by region score descending
    regions.sort(key=lambda r: r.score, reverse=True)

    # 7. Document-wide Anomaly Score (0.0 to 1.0)
    # Score is proportional to the number of consistent matches and clusters found
    score = 0.02 * len(verified_matches) + 0.1 * len(clusters)
    score = float(min(max(score, 0.0), 1.0))

    # 8. Statistics
    statistics = {
        "keypoints": float(len(kp)),
        "candidate_matches": float(len(candidate_matches)),
        "verified_matches": float(len(verified_matches)),
        "clusters": float(len(clusters)),
        "largest_cluster": float(max(len(c) for c in clusters) if clusters else 0)
    }

    # 9. Debug Visualization Mapping
    vis_bgr = cv2.cvtColor(working_image_rgb.copy(), cv2.COLOR_RGB2BGR)
    
    # Draw matches on debug image
    for m in verified_matches:
        pt1 = kp[m.queryIdx].pt
        pt2 = kp[m.trainIdx].pt
        
        # Circle at source (green) and target (red)
        cv2.circle(vis_bgr, (int(pt1[0]), int(pt1[1])), 4, (0, 255, 0), -1)
        cv2.circle(vis_bgr, (int(pt2[0]), int(pt2[1])), 4, (0, 0, 255), -1)
        # Connecting line (yellow)
        cv2.line(vis_bgr, (int(pt1[0]), int(pt1[1])), (int(pt2[0]), int(pt2[1])), (0, 255, 255), 1)

    # Save output if debug is active
    matches_rel_path = None
    map_rel_path = None
    if save_debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(debug_dir, "document_copy_move_matches.jpg"), vis_bgr)
        # Also generate the required binary anomaly map showing matching regions
        map_img = np.zeros((h_limit, w_limit), dtype=np.uint8)
        for r in regions:
            # Recompute working coordinates to paint matching shapes
            rx = int(round(r.x * coordinate_mapper.scale_x)) if coordinate_mapper else r.x
            ry = int(round(r.y * coordinate_mapper.scale_y)) if coordinate_mapper else r.y
            rw = int(round(r.width * coordinate_mapper.scale_x)) if coordinate_mapper else r.width
            rh = int(round(r.height * coordinate_mapper.scale_y)) if coordinate_mapper else r.height
            cv2.rectangle(map_img, (rx, ry), (rx + rw, ry + rh), 255, -1)
            
            tx = int(round(r.target_x * coordinate_mapper.scale_x)) if coordinate_mapper else r.target_x
            ty = int(round(r.target_y * coordinate_mapper.scale_y)) if coordinate_mapper else r.target_y
            tw = int(round(r.target_width * coordinate_mapper.scale_x)) if coordinate_mapper else r.target_width
            th = int(round(r.target_height * coordinate_mapper.scale_y)) if coordinate_mapper else r.target_height
            cv2.rectangle(map_img, (tx, ty), (tx + tw, ty + th), 255, -1)
            
        cv2.imwrite(os.path.join(debug_dir, "document_copy_move_map.png"), map_img)
        
        matches_rel_path = "outputs/debug/document_copy_move_matches.jpg"
        map_rel_path = "outputs/debug/document_copy_move_map.png"

    # 10. Human-readable Evidence
    evidence = []
    if len(regions) > 0:
        evidence.append({
            "message": f"Potential duplicated region detected in {len(regions)} localized region(s).",
            "severity": "HIGH" if score > 0.5 else "MEDIUM"
        })
    else:
        evidence.append({
            "message": "No significant duplicated visual content was detected.",
            "severity": "LOW"
        })

    return ForensicSignal(
        name="copy_move",
        score=score,
        confidence=None,  # Do not invent confidence; return null
        regions=regions,
        evidence=evidence,
        available=True,
        statistics=statistics,
        heatmap_path=matches_rel_path,
        map_path=map_rel_path
    )
