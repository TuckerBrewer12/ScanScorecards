import time

from api.security import SlidingWindowRateLimiter


def test_sliding_window_rate_limiter_blocks_after_limit():
    limiter = SlidingWindowRateLimiter()
    key = "ip:127.0.0.1"

    allowed_1, retry_1 = limiter.check(key, limit=2, window_seconds=1)
    allowed_2, retry_2 = limiter.check(key, limit=2, window_seconds=1)
    allowed_3, retry_3 = limiter.check(key, limit=2, window_seconds=1)

    assert allowed_1 is True and retry_1 == 0
    assert allowed_2 is True and retry_2 == 0
    assert allowed_3 is False
    assert retry_3 >= 1


def test_sliding_window_rate_limiter_recovers_after_window():
    limiter = SlidingWindowRateLimiter()
    key = "ip:127.0.0.1"

    limiter.check(key, limit=1, window_seconds=1)
    allowed_blocked, _ = limiter.check(key, limit=1, window_seconds=1)
    assert allowed_blocked is False

    time.sleep(1.05)
    allowed_after, retry_after = limiter.check(key, limit=1, window_seconds=1)
    assert allowed_after is True
    assert retry_after == 0


def test_sliding_window_rate_limiter_isolated_keys():
    limiter = SlidingWindowRateLimiter()

    allowed_a, _ = limiter.check("key:a", limit=1, window_seconds=60)
    blocked_a, _ = limiter.check("key:a", limit=1, window_seconds=60)
    allowed_b, _ = limiter.check("key:b", limit=1, window_seconds=60)

    assert allowed_a is True
    assert blocked_a is False
    assert allowed_b is True

