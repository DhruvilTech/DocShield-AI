from __future__ import annotations
from enum import Enum

class DocumentType(str, Enum):
    PASSPORT = "passport"
    VISA = "visa"
    NATIONAL_ID = "national_id"
    DRIVING_LICENSE = "driving_license"
    PERMIT = "permit"
