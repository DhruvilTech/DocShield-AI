"""
DocShield AI — Unified Face Biometrics Service
CLI and microservice orchestrator connecting Face Detection, Embedding, 1:1 Verification, and Liveness Detection.
"""

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, Optional, Union

# Ensure root AI directory is in path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from face.detector import FaceDetector, get_detector
from face.embedding import FaceEmbedder, get_embedder
from face.verification import FaceVerifier, get_verifier
from face.liveness import LivenessDetector, check_liveness, get_liveness_detector


class FaceBiometricsService:
    """
    Unified Biometrics Service providing detection, embedding, verification, and liveness methods.
    """

    def __init__(
        self,
        threshold: Optional[float] = None,
        detector: Optional[FaceDetector] = None,
        embedder: Optional[FaceEmbedder] = None,
        verifier: Optional[FaceVerifier] = None,
        liveness_detector: Optional[LivenessDetector] = None,
    ):
        self.detector = detector or get_detector()
        self.embedder = embedder or get_embedder()
        self.verifier = verifier or get_verifier(threshold=threshold)
        self.liveness_detector = liveness_detector or get_liveness_detector()

    def detect_faces(self, image_input: Union[str, Path]) -> Dict[str, Any]:
        """Detect all faces in an image."""
        faces = self.detector.detect(image_input)
        return {
            "success": True,
            "data": {
                "faces_detected": len(faces),
                "faces": [f.to_dict() for f in faces],
            },
        }

    def verify_faces(
        self,
        doc_image: Union[str, Path],
        live_image: Union[str, Path],
        threshold: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Verify document face vs live capture face (safe, non-raising)."""
        return self.verifier.verify_safe(doc_image, live_image, threshold=threshold)

    def verify_liveness(
        self,
        video_input: Union[str, Path, int],
        timeout_seconds: float = 10.0,
    ) -> Dict[str, Any]:
        """Run active liveness challenge verification on video file or camera input."""
        return check_liveness(
            video_input,
            detector=self.liveness_detector,
            timeout_seconds=timeout_seconds,
        )


# Shared service instance
_service_instance: Optional[FaceBiometricsService] = None


def get_service() -> FaceBiometricsService:
    """Return shared FaceBiometricsService instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = FaceBiometricsService()
    return _service_instance


def main():
    """CLI Entry point for backend integration and automated testing."""
    parser = argparse.ArgumentParser(description="DocShield Face Biometrics Service CLI")
    subparsers = parser.add_subparsers(dest="command", help="Subcommand to execute")

    # Command: verify
    verify_parser = subparsers.add_parser("verify", help="Run 1:1 Face Verification")
    verify_parser.add_argument("doc_image", help="Path to document image")
    verify_parser.add_argument("live_image", help="Path to live capture image")
    verify_parser.add_argument("--threshold", type=float, default=None, help="Match threshold (default 0.45)")

    # Command: detect
    detect_parser = subparsers.add_parser("detect", help="Run Face Detection")
    detect_parser.add_argument("image", help="Path to image file")

    # Command: liveness
    liveness_parser = subparsers.add_parser("liveness", help="Run Active Liveness Challenge Verification")
    liveness_parser.add_argument("video_input", help="Path to video file or camera index (default 0)")
    liveness_parser.add_argument("--timeout", type=float, default=10.0, help="Challenge timeout in seconds (default 10.0)")

    args = parser.parse_args()
    service = get_service()

    if args.command == "verify":
        result = service.verify_faces(args.doc_image, args.live_image, threshold=args.threshold)
        print("__DOCSHIELD_JSON_START__")
        print(json.dumps(result, indent=2))
        print("__DOCSHIELD_JSON_END__")
        sys.exit(0)

    elif args.command == "detect":
        result = service.detect_faces(args.image)
        print("__DOCSHIELD_JSON_START__")
        print(json.dumps(result, indent=2))
        print("__DOCSHIELD_JSON_END__")
        sys.exit(0 if result.get("success") else 1)

    elif args.command == "liveness":
        video_src = int(args.video_input) if args.video_input.isdigit() else args.video_input
        result = service.verify_liveness(video_src, timeout_seconds=args.timeout)
        print("__DOCSHIELD_JSON_START__")
        print(json.dumps(result, indent=2))
        print("__DOCSHIELD_JSON_END__")
        status = result.get("liveness", {}).get("status")
        sys.exit(0 if status == "PASS" else 1)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
