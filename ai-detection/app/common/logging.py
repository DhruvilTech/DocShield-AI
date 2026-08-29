"""
Standard-library logger and privacy-safe masking helpers for DocShield AI.

Uses Python's built-in `logging` module — no third-party dependency.

⚠️  PRIVACY WARNING — READ BEFORE ADDING LOG STATEMENTS ⚠️
--------------------------------------------------------------
This system processes sensitive identity documents. The following categories of
data MUST NEVER appear in log output:

    • Holder names (e.g., SURNAME / GIVEN NAME fields)
    • Dates of birth
    • Raw OCR text (may contain all of the above)
    • Raw image bytes or file content

When you need to reference a document identifier (passport number, visa number,
etc.) in a log message, use the `mask_identifier` helper so that only the first
three characters are visible, e.g. "A12****".

Permitted log content:
    • document_type value (e.g., "passport")
    • Validation outcome (e.g., "valid=True")
    • Field names without values (e.g., "passport_number is missing")
    • System-level metrics and error messages that contain no field values

Example — CORRECT usage::

    from app.common.logging import logger, mask_identifier

    logger.info(f"Processing {document_type}: {mask_identifier(passport_number)}")
    logger.info(f"Validation complete: document_type={document_type} valid={result.valid}")

Example — INCORRECT usage (never do this)::

    logger.debug(f"Extracted name: {name}")          # PII — forbidden
    logger.debug(f"DOB: {date_of_birth}")             # PII — forbidden
    logger.debug(f"Raw OCR text: {raw_text}")         # May contain all PII — forbidden
    logger.debug(f"Image data: {image_bytes[:100]}")  # Document content — forbidden
"""

import logging
import sys

# ---------------------------------------------------------------------------
# Logger configuration
# ---------------------------------------------------------------------------

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(logging.Formatter(fmt=_LOG_FORMAT, datefmt=_DATE_FORMAT))

# Root logger for the entire application
logger = logging.getLogger("docshield")
logger.setLevel(logging.INFO)
logger.addHandler(_handler)
# Prevent log records from propagating to the root logger (avoids duplicate output)
logger.propagate = False


# ---------------------------------------------------------------------------
# Privacy-safe masking helper
# ---------------------------------------------------------------------------

def mask_identifier(value: str) -> str:
    """Return a masked version of a document identifier for safe log output.

    Only the first three characters are preserved; the remainder is replaced
    with ``"****"``.  When the value is three characters or shorter, the
    entire value is masked and only ``"****"`` is returned.

    This function MUST be used whenever a document identifier (passport
    number, visa number, etc.) needs to appear in a log message.

    Args:
        value: The raw document identifier string.

    Returns:
        A masked string safe for log output, e.g. ``"A12****"`` or ``"****"``.

    Examples:
        >>> mask_identifier("A1234567")
        'A12****'
        >>> mask_identifier("AB3")
        '****'
        >>> mask_identifier("AB")
        '****'
    """
    if len(value) > 3:
        return value[:3] + "****"
    return "****"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
__all__ = ["logger", "mask_identifier"]
