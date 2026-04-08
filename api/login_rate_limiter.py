"""In-memory login rate limiter to slow brute-force attempts."""

import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class _Bucket:
    failures: deque[float] = field(default_factory=deque)
    locked_until: float = 0.0


class InMemoryLoginRateLimiter:
    def __init__(self, max_attempts: int = 5, window_seconds: int = 15 * 60, lock_seconds: int = 15 * 60):
        self._max_attempts = max(1, max_attempts)
        self._window_seconds = max(1, window_seconds)
        self._lock_seconds = max(1, lock_seconds)
        self._buckets: dict[str, _Bucket] = {}

    def _prune(self, bucket: _Bucket, now: float) -> None:
        floor = now - self._window_seconds
        while bucket.failures and bucket.failures[0] < floor:
            bucket.failures.popleft()

    def retry_after(self, key: str) -> int | None:
        now = time.time()
        bucket = self._buckets.get(key)
        if not bucket:
            return None

        if bucket.locked_until > now:
            return int(bucket.locked_until - now) + 1

        self._prune(bucket, now)
        if not bucket.failures:
            self._buckets.pop(key, None)
        return None

    def register_failure(self, key: str) -> None:
        now = time.time()
        bucket = self._buckets.setdefault(key, _Bucket())
        if bucket.locked_until > now:
            return
        self._prune(bucket, now)
        bucket.failures.append(now)
        if len(bucket.failures) >= self._max_attempts:
            bucket.failures.clear()
            bucket.locked_until = now + self._lock_seconds

    def register_success(self, key: str) -> None:
        self._buckets.pop(key, None)
