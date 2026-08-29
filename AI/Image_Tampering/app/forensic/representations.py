import cv2
import numpy as np

def generate_noise_residual(gray_image: np.ndarray, kernel_size: int = 5, sigma: float = 0.0) -> np.ndarray:
    """
    Generates a high-frequency noise residual by applying a low-pass filter (Gaussian blur)
    and calculating the absolute difference between the original grayscale image and the blurred version.
    
    Args:
        gray_image: np.ndarray, 2D grayscale image.
        kernel_size: int, size of Gaussian blur kernel (must be odd).
        sigma: float, Gaussian blur standard deviation.
        
    Returns:
        np.ndarray: 2D noise residual image.
    """
    if gray_image is None or len(gray_image.shape) != 2:
        raise ValueError("Input image must be a valid 2D grayscale array.")
        
    # Ensure kernel size is odd
    if kernel_size % 2 == 0:
        kernel_size += 1

    low_pass = cv2.GaussianBlur(gray_image, (kernel_size, kernel_size), sigma)
    # Absolute difference captures high-frequency details (noise, edges)
    noise_residual = cv2.absdiff(gray_image, low_pass)
    return noise_residual


def generate_representations(working_image_rgb: np.ndarray) -> dict:
    """
    Extracts various color space representations and noise residuals from the working RGB image.
    
    Args:
        working_image_rgb: np.ndarray, 3D RGB image array.
        
    Returns:
        dict: containing:
            - "grayscale" (np.ndarray): 2D grayscale image.
            - "hsv" (np.ndarray): HSV color space.
            - "lab" (np.ndarray): CIE LAB color space.
            - "noise_residual" (np.ndarray): High-frequency noise residual.
    """
    if working_image_rgb is None or len(working_image_rgb.shape) != 3:
        raise ValueError("Input image must be a valid 3D RGB image array.")
        
    # Grayscale representation
    grayscale = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2GRAY)
    
    # HSV representation
    hsv = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2HSV)
    
    # LAB representation
    lab = cv2.cvtColor(working_image_rgb, cv2.COLOR_RGB2LAB)
    
    # Noise Residual
    noise_residual = generate_noise_residual(grayscale)
    
    return {
        "grayscale": grayscale,
        "hsv": hsv,
        "lab": lab,
        "noise_residual": noise_residual
    }
