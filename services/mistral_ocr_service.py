"""Client for calling Mistral OCR API with local files."""

from __future__ import annotations

import base64
import mimetypes
import os
from pathlib import Path
from typing import Any, Dict, Optional

import httpx


class MistralOCRService:
    """Thin wrapper around Mistral OCR API.

    Env vars:
    - MISTRAL_API_KEY (required)
    - MISTRAL_BASE_URL (optional, default: https://api.mistral.ai)
    - MISTRAL_OCR_PATH (optional, default: /v1/ocr)
    - MISTRAL_OCR_MODEL (optional, default: mistral-ocr-latest)
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        ocr_path: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        self._api_key = api_key or os.environ.get("MISTRAL_API_KEY")
        self._base_url = (base_url or os.environ.get("MISTRAL_BASE_URL") or "https://api.mistral.ai").rstrip("/")
        self._ocr_path = ocr_path or os.environ.get("MISTRAL_OCR_PATH") or "/v1/ocr"
        self._model = model or os.environ.get("MISTRAL_OCR_MODEL") or "mistral-ocr-latest"
        self._timeout = timeout_seconds

    async def ocr_file(
        self,
        file_path: str | Path,
        *,
        pages: Optional[str] = None,
        include_images: bool = True,
        include_headers: bool = False,
        include_footers: bool = False,
    ) -> Dict[str, Any]:
        """OCR a local file and return raw Mistral JSON response."""
        if not self._api_key:
            raise EnvironmentError("MISTRAL_API_KEY environment variable is not set")

        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        data_url = self._build_data_url(path)
        payload: Dict[str, Any] = {
            "model": self._model,
            "document": {"type": "document_url", "document_url": data_url},
            "include_image_base64": include_images,
        }
        if pages:
            payload["pages"] = pages
        if include_headers:
            payload["include_headers"] = True
        if include_footers:
            payload["include_footers"] = True

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        path_part = self._ocr_path if self._ocr_path.startswith("/") else f"/{self._ocr_path}"
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            try:
                resp = await client.post(path_part, headers=headers, json=payload)
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(f"Mistral OCR failed: {exc}") from exc

    def _build_data_url(self, path: Path) -> str:
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        raw = path.read_bytes()
        b64 = base64.b64encode(raw).decode("ascii")
        return f"data:{mime_type};base64,{b64}"

    @staticmethod
    def extract_markdown_text(ocr_response: Dict[str, Any]) -> str:
        """Best-effort plain markdown aggregation from OCR JSON response."""
        pages = ocr_response.get("pages")
        if isinstance(pages, list):
            chunks = []
            for page in pages:
                if isinstance(page, dict):
                    text = page.get("markdown") or page.get("text")
                    if isinstance(text, str) and text.strip():
                        chunks.append(text.strip())
            if chunks:
                return "\n\n".join(chunks)

        output_text = ocr_response.get("markdown") or ocr_response.get("text")
        if isinstance(output_text, str):
            return output_text
        return ""
