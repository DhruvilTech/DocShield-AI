import numpy as np
import cv2

def calculate_quality_metrics(gray_image: np.ndarray, blur_threshold: float = 100.0) -> dict:
    """
    Computes brightness, contrast, sharpness (Laplacian variance), and blur status of a grayscale image.
    Note: These metrics are contextual indicators and do not directly verify document forgery.
    
    Args:
        gray_image: np.ndarray, 2D grayscale image.
        blur_threshold: float, threshold below which the image is flagged as blurred.
        
    Returns:
        dict: containing:
            - brightness (float): grayscale mean.
            - contrast (float): grayscale standard deviation.
            - sharpness (float): Laplacian variance.
            - blur_detected (bool): True if sharpness < blur_threshold.
    """
    if gray_image is None or len(gray_image.shape) != 2:
        raise ValueError("Input image must be a valid 2D grayscale array.")

    # Brightness (mean pixel intensity)
    brightness = float(np.mean(gray_image))
    
    # Contrast (standard deviation of pixel intensity)
    contrast = float(np.std(gray_image))
    
    # Sharpness (Laplacian variance)
    # Use float64 to prevent overflow during variance calculation
    laplacian_var = float(cv2.Laplacian(gray_image, cv2.CV_64F).var())
    
    # Blur Indicator
    blur_detected = laplacian_var < blur_threshold
    
    return {
        "brightness": brightness,
        "contrast": contrast,
        "sharpness": laplacian_var,
        "blur_detected": blur_detected
    }
