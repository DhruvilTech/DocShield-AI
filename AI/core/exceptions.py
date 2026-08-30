"""
Custom exception classes for the DocShield AI Engine.

Each exception maps to a specific failure mode in the pipeline, allowing callers
to handle errors precisely and map them to the appropriate HTTP status codes.
"""


class OCRFailureError(Exception):
    """PaddleOCR engine failed to process the image.

    Raised by PaddleOCREngine when the underlying PaddleOCR library raises any
    exception during inference. Maps to HTTP 500.
    """

    def __init__(self, message: str = "OCR engine failed to process the image") -> None:
        super().__init__(message)
        self.message = message


class InvalidImageError(Exception):
    """Image bytes cannot be decoded or are in an unsupported format.

    Raised when the uploaded file cannot be opened as a PIL image, or when
    the file size exceeds the configured MAX_FILE_SIZE_MB limit. Maps to HTTP 400.
    """

    def __init__(self, message: str = "Image bytes cannot be decoded or are in an unsupported format") -> None:
        super().__init__(message)
        self.message = message


class UnsupportedDocumentTypeError(Exception):
    """No extractor or validator is registered for this document type.

    Raised by OCRService or ValidationService when the requested document_type
    has no registered extractor or validator in the respective registry.
    Maps to HTTP 422.
    """

    def __init__(self, message: str = "No extractor or validator is registered for this document type") -> None:
        super().__init__(message)
        self.message = message


class UnsupportedFileTypeError(Exception):
    """Uploaded file MIME type is not in SUPPORTED_FILE_TYPES.

    Raised by the API route handler when the uploaded file's content_type is
    not present in the configured SUPPORTED_FILE_TYPES list. Maps to HTTP 415.
    """

    def __init__(self, message: str = "Uploaded file MIME type is not supported") -> None:
        super().__init__(message)
        self.message = message


class FieldExtractionError(Exception):
    """Field extractor encountered an unrecoverable error.

    Raised by a BaseFieldExtractor implementation when field extraction fails
    in a way that cannot be handled gracefully (e.g., corrupted OCRResult data).
    """

    def __init__(self, message: str = "Field extractor encountered an unrecoverable error") -> None:
        super().__init__(message)
        self.message = message


class ValidationError(Exception):
    """Validator encountered an unrecoverable error.

    Raised by a BaseDocumentValidator implementation when validation logic
    fails in an unexpected way. The ValidationService catches this and surfaces
    it in ValidationResult.errors with valid=False.
    """

    def __init__(self, message: str = "Validator encountered an unrecoverable error") -> None:
        super().__init__(message)
        self.message = message


class LowConfidenceError(Exception):
    """OCR confidence is below the minimum acceptable threshold.

    Raised when the overall OCR confidence for a document falls below the
    configured OCR_CONFIDENCE_THRESHOLD, indicating the result may be unreliable.
    """

    def __init__(self, message: str = "OCR confidence is below the minimum acceptable threshold") -> None:
        super().__init__(message)
        self.message = message


class ForensicAnalysisError(Exception):
    """Forensic analysis pipeline encountered an error.

    Raised when the image tampering forensic pipeline fails during processing.
    Maps to HTTP 500.
    """

    def __init__(self, message: str = "Forensic analysis pipeline failed") -> None:
        super().__init__(message)
        self.message = message
