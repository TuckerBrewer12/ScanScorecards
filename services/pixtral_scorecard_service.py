"""Pixtral vision model service for direct scorecard → markdown table conversion.

Uses the Mistral chat completions API with Pixtral (vision model) to convert
a scorecard image into a single clean 18-hole markdown table in one call.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
import os
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

PIXTRAL_MODEL = "pixtral-large-latest"
MISTRAL_API_BASE = "https://api.mistral.ai"

_PROMPT = (
    "Convert this golf scorecard image into a SINGLE markdown pipe table. "
    "Include all rows (tee yardages, par, handicap, player scores). "
    "Keep all 18 holes on one horizontal line per row — do not split front/back 9 into separate rows. "
    "Columns: label | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | OUT | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | IN | TOT. "
    "Copy every cell value exactly as written — do not convert or interpret any characters. "
    "Output only the markdown table, no explanation."
)


async def extract_scorecard_markdown(image_path: str | Path) -> str:
    """Call Pixtral with the scorecard image; return a markdown table string."""
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise EnvironmentError("MISTRAL_API_KEY environment variable is not set")

    path = Path(image_path)
    raw = path.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    mime_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    data_url = f"data:{mime_type};base64,{encoded}"

    payload = {
        "model": PIXTRAL_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(base_url=MISTRAL_API_BASE, timeout=60.0) as client:
        resp = await client.post("/v1/chat/completions", headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    result = data["choices"][0]["message"]["content"] or ""
    # Strip accidental code fences
    if result.strip().startswith("```"):
        lines = result.strip().splitlines()
        result = "\n".join(line for line in lines if not line.startswith("```")).strip()

    logger.info("Pixtral scorecard extraction: chars=%d", len(result))
    return result
