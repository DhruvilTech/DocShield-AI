"""
DocShield AI Engine — Face Verification API routes.

Mounted under /api/v1/face by the main application.
Handles face detection, 1:1 verification, and liveness checking.

Routes call into face.service.FaceBiometricsService (internal library).
"""
from __future__ import annotations

import io
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from core.logging import logger

router = APIRouter(tags=["Face Verification"])


def _get_service():
    """Lazy-load face biometrics service to avoid import-time model loading."""
    from face.service import get_service
    return get_service()


@router.post(
    "/detect",
    summary="Detect faces in an image",
    responses={
        400: {"description": "Invalid image"},
        500: {"description": "Face detection failed"},
    },
)
async def detect_faces(file: UploadFile = File(...)):
    """
    Upload an image and detect all faces present.

    Returns bounding boxes, confidence scores, and face count.
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
        # Write to temp file (face module expects file paths)
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        service = _get_service()
        result = service.detect_faces(tmp_path)
        return result
    except Exception as e:
        logger.error(f"Face detection failed: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Face detection failed: {str(e)}",
        )
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass


@router.post(
    "/verify",
    summary="1:1 face verification",
    responses={
        400: {"description": "Invalid images"},
        500: {"description": "Verification failed"},
    },
)
async def verify_faces(
    doc_image: UploadFile = File(..., description="Document image containing a face"),
    live_image: UploadFile = File(..., description="Live capture image for comparison"),
    threshold: float | None = None,
):
    """
    Compare a document face against a live capture face (1:1 verification).

    Returns similarity score, match status, and confidence.
    """
    try:
        doc_bytes = await doc_image.read()
        live_bytes = await live_image.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded files: {str(e)}",
        )

    tmp_doc = None
    tmp_live = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(doc_bytes)
            tmp_doc = tmp.name

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(live_bytes)
            tmp_live = tmp.name

        service = _get_service()
        result = service.verify_faces(tmp_doc, tmp_live, threshold=threshold)
        return result
    except Exception as e:
        logger.error(f"Face verification failed: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Face verification failed: {str(e)}",
        )
    finally:
        for p in (tmp_doc, tmp_live):
            if p:
                try:
                    Path(p).unlink(missing_ok=True)
                except Exception:
                    pass


@router.post(
    "/liveness",
    summary="Active liveness challenge check",
    responses={
        400: {"description": "Invalid video"},
        500: {"description": "Liveness check failed"},
    },
)
async def check_liveness(
    video: UploadFile = File(..., description="Video file for liveness challenge"),
    timeout: float = 10.0,
):
    """
    Run active liveness challenge verification on a video file.

    Returns liveness status (PASS/FAIL), confidence, and stages completed.
    """
    try:
        video_bytes = await video.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded video: {str(e)}",
        )

    tmp_video = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(video_bytes)
            tmp_video = tmp.name

        service = _get_service()
        result = service.verify_liveness(tmp_video, timeout_seconds=timeout)
        return result
    except Exception as e:
        logger.error(f"Liveness check failed: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Liveness check failed: {str(e)}",
        )
    finally:
        if tmp_video:
            try:
                Path(tmp_video).unlink(missing_ok=True)
            except Exception:
                pass
