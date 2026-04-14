"""Runtime security controls for deployment hardening."""

from __future__ import annotations

import ipaddress
import logging
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import parse_qs, urlparse

from fastapi import Request
from fastapi.responses import RedirectResponse

logger = logging.getLogger(__name__)


def env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _is_local_host(host: str) -> bool:
    host_l = host.strip().lower()
    return host_l in {"localhost", "127.0.0.1", "::1"}


def _is_private_or_local_ip(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local


def _is_non_public_db_host(host: str) -> bool:
    if _is_local_host(host):
        return True
    if _is_private_or_local_ip(host):
        return True
    allowlist_raw = os.environ.get("DB_HOST_ALLOWLIST", "")
    allowlist = {h.strip().lower() for h in allowlist_raw.split(",") if h.strip()}
    return host.strip().lower() in allowlist


def validate_deployment_security() -> None:
    """Fail fast when critical production security controls are missing."""
    app_env = os.environ.get("APP_ENV", "development").strip().lower()
    is_prod_like = app_env in {"production", "prod", "staging"}

    secret_key = os.environ.get("SECRET_KEY", "")
    if len(secret_key) < 32:
        raise EnvironmentError("SECRET_KEY must be at least 32 characters.")

    weak_values = {
        "changeme",
        "secret",
        "dev-secret",
        "insecure-secret",
        "please-change-me",
    }
    if secret_key.strip().lower() in weak_values:
        raise EnvironmentError("SECRET_KEY is using a known weak value.")

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise EnvironmentError("DATABASE_URL environment variable is required.")
    parsed = urlparse(dsn)
    host = parsed.hostname
    if not host:
        raise EnvironmentError("DATABASE_URL is missing a hostname.")

    require_private_db_host = env_bool("REQUIRE_PRIVATE_DB_HOST", is_prod_like)
    if require_private_db_host and not _is_non_public_db_host(host):
        raise EnvironmentError(
            "DATABASE_URL host appears public. Use a private endpoint or set DB_HOST_ALLOWLIST explicitly."
        )

    require_db_ssl = env_bool("REQUIRE_DB_SSL", is_prod_like)
    if require_db_ssl and not (_is_local_host(host) or _is_private_or_local_ip(host)):
        query = parse_qs(parsed.query or "")
        sslmode = (query.get("sslmode", [""])[0] or "").lower()
        if sslmode not in {"require", "verify-ca", "verify-full"}:
            raise EnvironmentError(
                "DATABASE_URL must include sslmode=require (or stronger) for non-local DB hosts."
            )


def is_https_request(request: Request) -> bool:
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    if forwarded_proto:
        proto = forwarded_proto.split(",")[0].strip().lower()
        if proto == "https":
            return True
    return request.url.scheme == "https"


def should_allow_insecure_local_request(request: Request) -> bool:
    if not env_bool("ALLOW_LOCAL_HTTP", True):
        return False
    host = request.url.hostname or ""
    return _is_local_host(host)


def enforce_https_if_needed(request: Request) -> Optional[RedirectResponse]:
    """Return a redirect response if request should be upgraded to HTTPS."""
    enforce_https = env_bool("ENFORCE_HTTPS", os.environ.get("APP_ENV", "").lower() in {"production", "prod", "staging"})
    if not enforce_https:
        return None
    if request.url.path == "/api/health":
        return None
    if is_https_request(request):
        return None
    if should_allow_insecure_local_request(request):
        return None

    https_url = request.url.replace(scheme="https")
    return RedirectResponse(url=str(https_url), status_code=307)


def parse_allowed_hosts() -> list[str]:
    def _normalize_host(raw_value: str) -> str:
        value = (raw_value or "").strip()
        if not value:
            return ""
        if "://" in value:
            return (urlparse(value).hostname or "").strip()
        if "/" in value:
            value = value.split("/", 1)[0]
        if ":" in value:
            value = value.split(":", 1)[0]
        return value.strip()

    raw = os.environ.get("ALLOWED_HOSTS", "").strip()
    hosts = [h.strip() for h in raw.split(",") if h.strip()]

    # Always keep local dev hosts available.
    hosts.extend(["localhost", "127.0.0.1", "::1"])

    for env_name in ("RAILWAY_PUBLIC_DOMAIN", "RAILWAY_PRIVATE_DOMAIN", "RAILWAY_STATIC_URL", "FRONTEND_URL"):
        host = _normalize_host(os.environ.get(env_name, ""))
        if host:
            hosts.append(host)

    on_railway = any(
        os.environ.get(name)
        for name in ("RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID")
    )
    if on_railway:
        # Health checks and routed traffic may arrive on public or internal domains.
        hosts.extend(["*.up.railway.app", "*.railway.app", "*.railway.internal"])

    deduped: list[str] = []
    seen = set()
    for host in hosts:
        if host not in seen:
            deduped.append(host)
            seen.add(host)
    return deduped


@dataclass
class _TrafficBucket:
    request_timestamps: deque[float] = field(default_factory=deque)
    auth_fail_timestamps: deque[float] = field(default_factory=deque)
    last_alert_ts: float = 0.0


@dataclass
class _RateLimitBucket:
    events: deque[float] = field(default_factory=deque)


class SlidingWindowRateLimiter:
    """Simple in-memory sliding-window limiter.

    Note: process-local only. For multi-instance deployments, use Redis/shared store.
    """

    def __init__(self):
        self._buckets: dict[str, _RateLimitBucket] = defaultdict(_RateLimitBucket)

    def _prune(self, bucket: _RateLimitBucket, now: float, window_seconds: int) -> None:
        floor = now - window_seconds
        while bucket.events and bucket.events[0] < floor:
            bucket.events.popleft()

    def check(self, key: str, *, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Return (allowed, retry_after_seconds)."""
        now = time.time()
        safe_limit = max(1, int(limit))
        safe_window = max(1, int(window_seconds))
        bucket = self._buckets[key]
        self._prune(bucket, now, safe_window)

        if len(bucket.events) >= safe_limit:
            oldest = bucket.events[0]
            retry_after = int(max(1.0, safe_window - (now - oldest))) + 1
            return False, retry_after

        bucket.events.append(now)
        return True, 0


class SecurityTrafficMonitor:
    """In-memory traffic monitor for suspicious request patterns."""

    def __init__(
        self,
        *,
        request_window_sec: int = 60,
        auth_window_sec: int = 300,
        request_threshold: int = 240,
        auth_failure_threshold: int = 20,
        alert_cooldown_sec: int = 60,
    ):
        self._request_window_sec = max(10, request_window_sec)
        self._auth_window_sec = max(30, auth_window_sec)
        self._request_threshold = max(20, request_threshold)
        self._auth_failure_threshold = max(5, auth_failure_threshold)
        self._alert_cooldown_sec = max(10, alert_cooldown_sec)
        self._buckets: dict[str, _TrafficBucket] = defaultdict(_TrafficBucket)

    def _prune(self, bucket: _TrafficBucket, now: float) -> None:
        req_floor = now - self._request_window_sec
        while bucket.request_timestamps and bucket.request_timestamps[0] < req_floor:
            bucket.request_timestamps.popleft()
        auth_floor = now - self._auth_window_sec
        while bucket.auth_fail_timestamps and bucket.auth_fail_timestamps[0] < auth_floor:
            bucket.auth_fail_timestamps.popleft()

    def record(self, *, ip: str, status_code: int, method: str, path: str, latency_ms: float, user_agent: str) -> None:
        now = time.time()
        bucket = self._buckets[ip]
        bucket.request_timestamps.append(now)
        if status_code in {401, 403, 429} and path.startswith("/api/auth"):
            bucket.auth_fail_timestamps.append(now)
        self._prune(bucket, now)

        if status_code >= 500:
            logger.error(
                "API error response: ip=%s method=%s path=%s status=%d latency_ms=%.1f ua=%s",
                ip,
                method,
                path,
                status_code,
                latency_ms,
                user_agent,
            )
        elif status_code in {401, 403, 429}:
            logger.warning(
                "Auth/access warning: ip=%s method=%s path=%s status=%d latency_ms=%.1f",
                ip,
                method,
                path,
                status_code,
                latency_ms,
            )

        if now - bucket.last_alert_ts < self._alert_cooldown_sec:
            return

        req_count = len(bucket.request_timestamps)
        auth_fail_count = len(bucket.auth_fail_timestamps)
        if req_count >= self._request_threshold:
            bucket.last_alert_ts = now
            logger.warning(
                "Unusual traffic volume detected: ip=%s requests_in_%ss=%d threshold=%d",
                ip,
                self._request_window_sec,
                req_count,
                self._request_threshold,
            )
            return

        if auth_fail_count >= self._auth_failure_threshold:
            bucket.last_alert_ts = now
            logger.warning(
                "Potential brute-force detected: ip=%s auth_failures_in_%ss=%d threshold=%d",
                ip,
                self._auth_window_sec,
                auth_fail_count,
                self._auth_failure_threshold,
            )
