from fastapi import FastAPI, UploadFile, File, HTTPException, status
from app.schemas.forensic import ForensicResult
from app.forensic.pipeline import run_forensic_pipeline
import traceback

app = FastAPI(
    title="DocShield AI - Document Tampering Forensic Analysis Engine",
    description="Phase 1: Forensic Image Processing Foundation API",
    version="1.0.0"
)

@app.get("/health", tags=["Health Check"])
def health_check():
    """
    Returns API health status.
    """
    return {
        "status": "healthy",
        "phase": 1,
        "module": "forensic_foundation"
    }

@app.post("/analyze", response_model=ForensicResult, tags=["Forensic Analysis"])
async def analyze_document(
    file: UploadFile = File(...),
    save_debug: bool = False
):
    """
    Upload a document image to process and extract forensic representations.
    
    Supported Formats: JPG, JPEG, PNG, WEBP.
    
    In Phase 1, this initializes all forensic signals with empty configurations
    and a `null` score, while successfully generating normalized grayscale, 
    HSV, LAB, and Noise Residual images along with image quality calculations.
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename."
        )

    try:
        image_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {str(e)}"
        )

    try:
        result = run_forensic_pipeline(
            image_bytes=image_bytes,
            filename=file.filename,
            save_debug=save_debug
        )
        return result
    except ValueError as ve:
        # Handle expected validation failures (invalid size, format, corrupt image)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        # Handle unexpected errors
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during forensic analysis: {str(e)}"
        )
