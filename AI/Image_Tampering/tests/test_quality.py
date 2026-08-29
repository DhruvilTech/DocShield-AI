import numpy as np
import cv2
import pytest
from app.forensic.quality import calculate_quality_metrics
from app.forensic.representations import generate_representations, generate_noise_residual

def test_quality_metrics_flat_image():
    # A completely solid gray image (intensity 128)
    flat_img = np.full((300, 400), 128, dtype=np.uint8)
    
    metrics = calculate_quality_metrics(flat_img, blur_threshold=10.0)
    
    assert metrics["brightness"] == 128.0
    assert metrics["contrast"] == 0.0  # No variation
    assert metrics["sharpness"] == 0.0  # Flat surface has no edges/Laplacian variance
    assert metrics["blur_detected"] is True  # 0.0 < 10.0


def test_sharpness_and_blur_detection():
    # Create a sharp high-contrast image (chess board pattern or line grid)
    sharp_img = np.zeros((200, 200), dtype=np.uint8)
    # Draw high contrast white lines
    cv2.line(sharp_img, (0, 100), (200, 100), 255, 5)
    cv2.line(sharp_img, (100, 0), (100, 200), 255, 5)
    
    # Create a blurred version of it
    blurred_img = cv2.GaussianBlur(sharp_img, (25, 25), 0)
    
    sharp_metrics = calculate_quality_metrics(sharp_img, blur_threshold=100.0)
    blur_metrics = calculate_quality_metrics(blurred_img, blur_threshold=100.0)
    
    # The sharp image should have significantly higher Laplacian variance than the blurred one
    assert sharp_metrics["sharpness"] > blur_metrics["sharpness"]
    
    # With a proper threshold (e.g. 100), the blurred one should flag blur_detected=True, while the sharp one is False
    # Let's adjust threshold to be between their sharpness scores dynamically to verify
    midpoint_thresh = (sharp_metrics["sharpness"] + blur_metrics["sharpness"]) / 2.0
    
    sharp_metrics_adj = calculate_quality_metrics(sharp_img, blur_threshold=midpoint_thresh)
    blur_metrics_adj = calculate_quality_metrics(blurred_img, blur_threshold=midpoint_thresh)
    
    assert sharp_metrics_adj["blur_detected"] is False
    assert blur_metrics_adj["blur_detected"] is True


def test_representations_dimensions_and_channels():
    # Generate random RGB image
    np.random.seed(42)
    rgb_img = np.random.randint(0, 256, (300, 400, 3), dtype=np.uint8)
    
    reps = generate_representations(rgb_img)
    
    assert "grayscale" in reps
    assert "hsv" in reps
    assert "lab" in reps
    assert "noise_residual" in reps
    
    # Check dimensions
    assert reps["grayscale"].shape == (300, 400)
    assert reps["hsv"].shape == (300, 400, 3)
    assert reps["lab"].shape == (300, 400, 3)
    assert reps["noise_residual"].shape == (300, 400)


def test_noise_residual_generation():
    # Test that noise residual isolates high frequency components
    flat_img = np.full((100, 100), 128, dtype=np.uint8)
    residual_flat = generate_noise_residual(flat_img, kernel_size=5)
    
    # A completely flat image has no noise residual
    assert np.all(residual_flat == 0)
    
    # Add noise to flat image
    noisy_img = flat_img.copy()
    noisy_img[50, 50] = 255  # impulse noise
    residual_noisy = generate_noise_residual(noisy_img, kernel_size=5)
    
    # The impulse noise must result in a non-zero residual around pixel (50, 50)
    assert np.any(residual_noisy > 0)
    assert residual_noisy[50, 50] > 0
