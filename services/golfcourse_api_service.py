"""Client for querying external GolfCourseAPI course search."""

import os
from typing import Any, Dict, List, Optional

import httpx


class GolfCourseAPIService:
    """Thin wrapper around GolfCourseAPI search.

    Env vars:
    - GOLFCOURSE_API_KEY (preferred) or golfcourse_api_key
    - GOLFCOURSE_API_BASE_URL (optional, default: https://api.golfcourseapi.com)
    - GOLFCOURSE_API_SEARCH_PATH (optional, default: /v1/search)
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        search_path: Optional[str] = None,
        timeout_seconds: float = 8.0,
    ) -> None:
        self._api_key = (
            api_key
            or os.environ.get("GOLFCOURSE_API_KEY")
            or os.environ.get("golfcourse_api_key")
        )
        self._base_url = (
            (base_url or os.environ.get("GOLFCOURSE_API_BASE_URL") or "https://api.golfcourseapi.com")
            .rstrip("/")
        )
        self._search_path = search_path or os.environ.get("GOLFCOURSE_API_SEARCH_PATH") or "/v1/search"
        self._timeout = timeout_seconds

    async def search_external_courses(self, query: str, *, limit: int = 10) -> List[Dict[str, Any]]:
        """Search courses from GolfCourseAPI and return normalized rows.

        Normalized shape:
        {
          "external_course_id": str|None,
          "name": str|None,
          "city": str|None,
          "state": str|None,
          "source": "golfcourseapi",
          "raw": <original item>
        }
        """
        q = (query or "").strip()
        if len(q) < 2:
            return []
        if not self._api_key:
            raise EnvironmentError(
                "GOLFCOURSE_API_KEY environment variable is not set"
            )

        headers = {"Authorization": f"Key {self._api_key}"}
        path = self._search_path if self._search_path.startswith("/") else f"/{self._search_path}"

        # Try common query parameter names since public docs/shape may vary.
        candidate_params = (
            {"q": q, "limit": limit},
            {"search": q, "limit": limit},
            {"query": q, "limit": limit},
            {"name": q, "limit": limit},
        )

        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            last_error: Optional[Exception] = None
            for params in candidate_params:
                try:
                    resp = await client.get(path, headers=headers, params=params)
                    # If one param style is unsupported, another may still work.
                    if resp.status_code in (400, 404, 405, 422):
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    items = self._extract_items(data)
                    return self._normalize_items(items, limit=limit)
                except Exception as exc:  # noqa: BLE001
                    last_error = exc
                    continue

        if last_error:
            raise RuntimeError(f"GolfCourseAPI search failed: {last_error}") from last_error
        return []

    def _extract_items(self, payload: Any) -> List[Dict[str, Any]]:
        """Extract a list of course objects from varying JSON response shapes."""
        if isinstance(payload, list):
            return [x for x in payload if isinstance(x, dict)]
        if not isinstance(payload, dict):
            return []

        for key in ("courses", "data", "results", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
            if isinstance(value, dict):
                nested = value.get("courses") or value.get("items") or value.get("results")
                if isinstance(nested, list):
                    return [x for x in nested if isinstance(x, dict)]
        return []

    def _normalize_items(self, items: List[Dict[str, Any]], *, limit: int) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for row in items:
            external_id = (
                row.get("id")
                or row.get("course_id")
                or row.get("uuid")
                or row.get("external_course_id")
            )
            out.append(
                {
                    "external_course_id": str(external_id) if external_id is not None else None,
                    "name": row.get("name") or row.get("course_name"),
                    "city": row.get("city"),
                    "state": row.get("state"),
                    "source": "golfcourseapi",
                    "raw": row,
                }
            )
            if len(out) >= max(1, limit):
                break
        return out
