import time

from api.auth_utils import (
    create_access_token,
    decode_access_token,
    generate_one_time_token,
    hash_one_time_token,
    hash_password,
    verify_password,
)
from api.login_rate_limiter import InMemoryLoginRateLimiter


def test_password_hash_and_verify_roundtrip():
    plain = "Sup3rSecurePassword!"
    hashed = hash_password(plain)

    assert hashed != plain
    assert verify_password(plain, hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_access_token_includes_expected_claims(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-jwt")
    monkeypatch.setenv("JWT_ISSUER", "test-issuer")
    monkeypatch.setenv("JWT_AUDIENCE", "test-aud")
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")

    token = create_access_token("user-123")
    payload = decode_access_token(token)

    assert payload is not None
    assert payload["sub"] == "user-123"
    assert payload["iss"] == "test-issuer"
    assert payload["aud"] == "test-aud"
    assert "exp" in payload
    assert "iat" in payload
    assert "jti" in payload


def test_one_time_token_hashing():
    token = generate_one_time_token()
    token_hash = hash_one_time_token(token)

    assert token_hash == hash_one_time_token(token)
    assert token_hash != hash_one_time_token(generate_one_time_token())
    assert len(token_hash) == 64


def test_login_rate_limiter_locks_after_limit():
    limiter = InMemoryLoginRateLimiter(max_attempts=2, window_seconds=60, lock_seconds=1)
    key = "ip:127.0.0.1"

    assert limiter.retry_after(key) is None
    limiter.register_failure(key)
    assert limiter.retry_after(key) is None
    limiter.register_failure(key)

    retry_after = limiter.retry_after(key)
    assert retry_after is not None
    assert retry_after >= 1

    time.sleep(1.1)
    assert limiter.retry_after(key) is None
