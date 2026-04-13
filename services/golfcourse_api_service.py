"""Client for querying external GolfCourseAPI course search."""

import os
import re
from typing import Any, Dict, List, Optional

import httpx

_GOLF_STOP_WORDS = re.compile(r"\b(golf|course|club|country|links|gc|cc)\b")


def _normalize_course_name(value: str) -> str:
    """Lowercase, strip punctuation and common golf-specific words for comparison."""
    base = re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()
    base = _GOLF_STOP_WORDS.sub(" ", base)
    return " ".join(base.split())


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
        q = self._normalize_search_query(query)
        if len(q) < 2:
            return []
        if not self._api_key:
            raise EnvironmentError(
                "GOLFCOURSE_API_KEY environment variable is not set"
            )

        headers = {"Authorization": f"Key {self._api_key}"}
        path = self._search_path if self._search_path.startswith("/") else f"/{self._search_path}"

        params = {"search_query": q, "limit": limit}
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            try:
                resp = await client.get(path, headers=headers, params=params)
                resp.raise_for_status()
                data = resp.json()
                items = self._extract_items(data)
                return self._normalize_items(items, limit=limit)
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(f"GolfCourseAPI search failed: {exc}") from exc

    def _normalize_search_query(self, query: str) -> str:
        """Normalize user query to provider-friendly form while keeping one request."""
        cleaned = _normalize_course_name(query)
        return cleaned or " ".join((query or "").strip().split())

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
            external_id = self._extract_external_id(row)
            location_obj = row.get("location") if isinstance(row.get("location"), dict) else {}
            club_name = row.get("club_name")
            course_name = row.get("course_name")
            resolved_name = (
                row.get("name")
                or row.get("course_name")
                or (
                    f"{club_name} {course_name}".strip()
                    if club_name and course_name
                    else club_name or course_name
                )
            )
            out.append(
                {
                    "external_course_id": str(external_id) if external_id is not None else None,
                    "name": resolved_name,
                    "city": row.get("city") or location_obj.get("city"),
                    "state": row.get("state") or location_obj.get("state"),
                    "source": "golfcourseapi",
                    "raw": row,
                }
            )
            if len(out) >= max(1, limit):
                break
        return out

    def _extract_external_id(self, row: Dict[str, Any]) -> Optional[Any]:
        """Best-effort external ID extraction across common API response shapes."""
        direct_keys = (
            "id",
            "course_id",
            "courseId",
            "golf_course_id",
            "facility_id",
            "club_id",
            "uuid",
            "external_course_id",
        )
        for key in direct_keys:
            value = row.get(key)
            if value not in (None, ""):
                return value

        nested_candidates = (
            row.get("course"),
            row.get("facility"),
            row.get("club"),
            row.get("data"),
        )
        for nested in nested_candidates:
            if not isinstance(nested, dict):
                continue
            for key in direct_keys:
                value = nested.get(key)
                if value not in (None, ""):
                    return value
        return None
