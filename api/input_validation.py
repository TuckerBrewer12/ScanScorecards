"""Central input validation/sanitization helpers for API entry points."""

from __future__ import annotations

import re
import unicodedata
from uuid import UUID

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EMAIL_RE = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.IGNORECASE)
_SEARCH_ATTACK_RE = re.compile(
    r"(?i)(<\s*script|javascript:|onerror\s*=|onload\s*=|union\s+select|drop\s+table|/\*|\*/|--|`|\$\()"
)


def ensure_uuid_str(value: str, field_name: str) -> str:
    """Return canonical UUID string or raise ValueError."""
    try:
        return str(UUID(str(value)))
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"{field_name} must be a valid UUID.") from exc


def normalize_email(value: str) -> str:
    normalized = (value or "").strip().lower()
    if not _EMAIL_RE.fullmatch(normalized):
        raise ValueError("Invalid email format.")
    return normalized


def sanitize_user_text(
    value: str,
    *,
    field_name: str,
    max_length: int,
    allow_newlines: bool = False,
    allow_empty: bool = False,
) -> str:
    """Sanitize user-supplied plain text and reject unsafe payloads."""
    text = unicodedata.normalize("NFKC", value or "")
    if not allow_newlines:
        text = text.replace("\r", " ").replace("\n", " ")
    else:
        text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.strip()

    if not allow_empty and not text:
        raise ValueError(f"{field_name} cannot be empty.")
    if len(text) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters.")
    if _CONTROL_CHARS_RE.search(text):
        raise ValueError(f"{field_name} contains invalid control characters.")
    # Reject HTML/script vectors to reduce stored-XSS risk.
    if "<" in text or ">" in text:
        raise ValueError(f"{field_name} cannot contain HTML markup.")
    return text


def sanitize_search_query(value: str, *, max_length: int = 120) -> str:
    query = sanitize_user_text(
        value,
        field_name="q",
        max_length=max_length,
        allow_newlines=False,
        allow_empty=False,
    )
    if _SEARCH_ATTACK_RE.search(query):
        raise ValueError("q contains unsafe patterns.")
    return query


def sanitize_ocr_text(value: str, *, max_length: int = 300_000) -> str:
    """Sanitize large OCR text blobs while preserving markdown structure."""
    text = unicodedata.normalize("NFKC", value or "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if len(text) > max_length:
        raise ValueError(f"ocr_text exceeds maximum size ({max_length} characters).")
    if _CONTROL_CHARS_RE.search(text):
        raise ValueError("ocr_text contains invalid control characters.")
    return text


def normalize_handicap_value(value: object) -> object:
    """
    Normalize handicap inputs so '+X' is treated as a plus handicap (stored as -X).

    Examples:
    - '+3.2' -> -3.2
    - '12.5' -> '12.5' (left for float parsing)
    - -2.1   -> -2.1
    """
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.startswith("+"):
            number_portion = text[1:].strip()
            if not number_portion:
                raise ValueError("Invalid handicap format.")
            try:
                parsed = float(number_portion)
            except ValueError as exc:
                raise ValueError("Invalid handicap format.") from exc
            return -parsed
        return text
    return value
