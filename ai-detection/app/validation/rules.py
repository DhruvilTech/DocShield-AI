from __future__ import annotations
import json
import os
from dataclasses import dataclass, field
from app.schemas.document import DocumentType

@dataclass
class RuleSet:
    """Parsed validation rules for a document type."""
    required_fields: list[str]
    patterns: dict[str, str]
    date_rules: dict[str, dict]

_RULES_DIR = os.path.join(os.path.dirname(__file__), "..", "config", "rules")

class RuleSetLoader:
    """Loads and caches validation rule JSON files.
    Requirements: 10.1-10.4, 20.3, 21.2
    """

    def __init__(self) -> None:
        self._cache: dict[str, RuleSet] = {}

    def load(self, document_type: DocumentType) -> RuleSet:
        key = document_type.value
        if key in self._cache:
            return self._cache[key]

        path = os.path.normpath(
            os.path.join(_RULES_DIR, f"{key}_rules.json")
        )
        if not os.path.exists(path):
            raise FileNotFoundError(f"Rule file not found: {path}")

        with open(path, encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Malformed rule JSON at {path}: {exc}") from exc

        for required_key in ("required_fields", "patterns", "date_rules"):
            if required_key not in data:
                raise ValueError(
                    f"Rule file {path} is missing required key: {required_key!r}"
                )

        ruleset = RuleSet(
            required_fields=data["required_fields"],
            patterns=data["patterns"],
            date_rules=data["date_rules"],
        )
        self._cache[key] = ruleset
        return ruleset
