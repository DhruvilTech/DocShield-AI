"""
DocShield AI Engine — Image Tampering Detection API routes.

Mounted under /api/v1/tampering by the main application.
Handles forensic analysis of document images for tampering detection.

Routes call into image_tampering.forensic.pipeline.
"""
from __future__ import annotations

import traceback

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from image_tampering.schemas.forensic import ForensicResult
from image_tampering.forensic.pipeline import run_forensic_pipeline
from core.logging import logger

router = APIRouter(tags=["Image Tampering"])


@router.get("/health", summary="Tampering module health check")
def tampering_health():
    """Returns tampering module health status."""
    return {
        "status": "healthy",
        "module": "forensic_analysis",
    }


@router.post(
    "/analyze",
    response_model=ForensicResult,
    summary="Run forensic tampering analysis",
    responses={
        400: {"description": "Invalid image or unsupported format"},
        500: {"description": "Forensic analysis failed"},
    },
)
async def analyze_document(
    file: UploadFile = File(...),
    save_debug: bool = False,
):
    """
    Upload a document image to run comprehensive forensic tampering analysis.

    Supported Formats: JPG, JPEG, PNG, WEBP.

    Returns forensic signals (ELA, noise, copy-move, metadata, stamp, splicing),
    suspicious regions, quality metrics, and fusion score.
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename.",
        )

    try:
        image_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {str(e)}",
        )

    try:
        result = run_forensic_pipeline(
            image_bytes=image_bytes,
            filename=file.filename,
            save_debug=save_debug,
        )
        return result
    except ValueError as ve:
        # Handle expected validation failures (invalid size, format, corrupt image)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        # Handle unexpected errors
        logger.error(f"Forensic analysis error: {type(e).__name__}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during forensic analysis: {str(e)}",
        )
