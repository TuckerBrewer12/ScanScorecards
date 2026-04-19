"""JWT and password hashing utilities for authentication."""

import os
import secrets
import uuid
from hashlib import sha256
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

ALGORITHM = "HS256"


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _is_prod_like_runtime() -> bool:
    app_env = os.environ.get("APP_ENV", "development").strip().lower()
    if app_env in {"production", "prod", "staging"}:
        return True
    # Railway deploys should default to hardened cookie behavior even if APP_ENV
    # was not explicitly configured.
    return bool(os.environ.get("RAILWAY_ENVIRONMENT_ID"))


def get_secret_key() -> str:
    key = os.environ.get("SECRET_KEY")
    if not key:
        raise EnvironmentError("SECRET_KEY environment variable is not set")
    return key


def get_jwt_issuer() -> str:
    return os.environ.get("JWT_ISSUER", "scanscorecards-api")


def get_jwt_audience() -> str:
    return os.environ.get("JWT_AUDIENCE", "scanscorecards-users")


def get_access_token_expiry_seconds() -> int:
    minutes = max(_env_int("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 12), 5)
    return minutes * 60


def get_access_token_cookie_name() -> str:
    return os.environ.get("ACCESS_TOKEN_COOKIE_NAME", "golf_access_token")


def get_cookie_secure_flag() -> bool:
    # Keep localhost dev workable while using secure-by-default in production.
    return _env_bool("AUTH_COOKIE_SECURE", _is_prod_like_runtime())


def get_cookie_samesite() -> str:
    raw = os.environ.get("AUTH_COOKIE_SAMESITE", "lax").strip().lower()
    if raw in {"lax", "strict", "none"}:
        return raw
    return "lax"


def get_email_verification_ttl_minutes() -> int:
    return max(_env_int("EMAIL_VERIFICATION_TTL_MINUTES", 60 * 24), 5)


def get_password_reset_ttl_minutes() -> int:
    return max(_env_int("PASSWORD_RESET_TTL_MINUTES", 30), 5)


def hash_password(plain: str) -> str:
    rounds = max(_env_int("BCRYPT_ROUNDS", 12), 12)
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=rounds)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(seconds=get_access_token_expiry_seconds())
    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": now,
        "iss": get_jwt_issuer(),
        "aud": get_jwt_audience(),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, get_secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(
            token,
            get_secret_key(),
            algorithms=[ALGORITHM],
            audience=get_jwt_audience(),
            issuer=get_jwt_issuer(),
        )
    except JWTError:
        return None


def generate_one_time_token() -> str:
    return secrets.token_urlsafe(32)


def hash_one_time_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()
