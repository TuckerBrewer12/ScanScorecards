"""Authentication endpoints: register/login/logout/me + verification/reset flows."""

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from api.auth_notifications import send_password_reset_email, send_verification_email
from api.auth_schemas import (
    AuthUserResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from api.auth_utils import (
    create_access_token,
    generate_one_time_token,
    get_access_token_cookie_name,
    get_access_token_expiry_seconds,
    get_cookie_samesite,
    get_cookie_secure_flag,
    get_email_verification_ttl_minutes,
    get_password_reset_ttl_minutes,
    hash_one_time_token,
    hash_password,
    verify_password,
)
from api.dependencies import client_ip, get_current_user, get_db
from api.login_rate_limiter import InMemoryLoginRateLimiter
from api.security import SlidingWindowRateLimiter
from database.db_manager import DatabaseManager
from database.exceptions import DuplicateError
from models import User

router = APIRouter()
logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


login_rate_limiter = InMemoryLoginRateLimiter(
    max_attempts=max(_env_int("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 5), 1),
    window_seconds=max(_env_int("LOGIN_RATE_LIMIT_WINDOW_SECONDS", 15 * 60), 30),
    lock_seconds=max(_env_int("LOGIN_RATE_LIMIT_LOCK_SECONDS", 15 * 60), 30),
)
register_rate_limiter = SlidingWindowRateLimiter()
auth_request_rate_limiter = SlidingWindowRateLimiter()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _email_fingerprint(email: str) -> str:
    normalized = _normalize_email(email)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]


def _check_auth_rate_limit(
    *,
    limiter: SlidingWindowRateLimiter,
    key: str,
    limit: int,
    window_seconds: int,
    detail: str,
) -> int:
    allowed, retry_after = limiter.check(
        key,
        limit=max(1, limit),
        window_seconds=max(1, window_seconds),
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )
    return retry_after


def _build_verification_url(request: Request, token: str) -> str:
    configured = os.environ.get("AUTH_VERIFY_URL_BASE")
    if configured:
        return f"{configured.rstrip('/')}?token={token}"
    frontend_base = os.environ.get("FRONTEND_URL")
    if frontend_base:
        return f"{frontend_base.rstrip('/')}/verify-email?token={token}"
    return f"{request.base_url}api/auth/verify-email?token={token}"


def _build_password_reset_url(request: Request, token: str) -> str:
    configured = os.environ.get("AUTH_PASSWORD_RESET_URL_BASE")
    if configured:
        return f"{configured.rstrip('/')}?token={token}"
    frontend_base = os.environ.get("FRONTEND_URL")
    if frontend_base:
        return f"{frontend_base.rstrip('/')}/reset-password?token={token}"
    return f"{request.base_url}reset-password?token={token}"


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=get_access_token_cookie_name(),
        value=token,
        httponly=True,
        secure=get_cookie_secure_flag(),
        samesite=get_cookie_samesite(),
        max_age=get_access_token_expiry_seconds(),
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=get_access_token_cookie_name(),
        path="/",
        secure=get_cookie_secure_flag(),
        samesite=get_cookie_samesite(),
    )


async def _issue_verification_token(db: DatabaseManager, user: User, request: Request) -> None:
    raw_token = generate_one_time_token()
    token_hash = hash_one_time_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=get_email_verification_ttl_minutes())
    await db.users.create_auth_token(
        user_id=str(user.id),
        token_type="email_verify",
        token_hash=token_hash,
        expires_at=expires_at,
    )
    verify_url = _build_verification_url(request, raw_token)
    try:
        send_verification_email(user.email or "", verify_url)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Auth verification email send failed: user_id=%s email_fp=%s",
            user.id,
            _email_fingerprint(user.email or ""),
        )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, request: Request, db: DatabaseManager = Depends(get_db)):
    normalized_email = _normalize_email(req.email)
    request_ip = client_ip(request)
    _check_auth_rate_limit(
        limiter=register_rate_limiter,
        key=f"register:ip:{request_ip}",
        limit=_env_int("REGISTER_RATE_LIMIT_MAX_ATTEMPTS", 5),
        window_seconds=_env_int("REGISTER_RATE_LIMIT_WINDOW_SECONDS", 3600),
        detail="Too many account creation attempts. Please try again later.",
    )
    _check_auth_rate_limit(
        limiter=register_rate_limiter,
        key=f"register:email:{_email_fingerprint(normalized_email)}",
        limit=_env_int("REGISTER_RATE_LIMIT_PER_EMAIL_ATTEMPTS", 3),
        window_seconds=_env_int("REGISTER_RATE_LIMIT_PER_EMAIL_WINDOW_SECONDS", 3600),
        detail="Too many account creation attempts for this email. Please try again later.",
    )
    existing = await db.users.get_user_by_email(normalized_email)
    if existing:
        logger.warning(
            "Auth register rejected (duplicate): email_fp=%s ip=%s",
            _email_fingerprint(normalized_email),
            request_ip,
        )
        raise HTTPException(409, "An account with this email already exists")

    if req.home_course_id:
        course = await db.courses.get_course(req.home_course_id)
        if not course:
            raise HTTPException(400, "Selected home course was not found")

    password_hash = hash_password(req.password)
    try:
        user = await db.users.create_user(
            User(
                name=req.name,
                email=normalized_email,
                handicap=req.handicap,
                home_course_id=req.home_course_id,
                email_verified=False,
            ),
            password_hash=password_hash,
        )
    except DuplicateError:
        raise HTTPException(409, "An account with this email already exists")

    await _issue_verification_token(db, user, request)
    logger.info(
        "Auth register success: user_id=%s email_fp=%s ip=%s verification_required=true",
        user.id,
        _email_fingerprint(normalized_email),
        request_ip,
    )
    return RegisterResponse(
        message="Account created. Check your email to verify your account before signing in.",
        requires_email_verification=True,
    )


async def _verify_email_token(token: str, db: DatabaseManager) -> str:
    user_id = await db.users.consume_auth_token("email_verify", hash_one_time_token(token))
    if not user_id:
        logger.warning("Auth verify-email failed: reason=invalid_or_expired_token")
        raise HTTPException(400, "Invalid or expired verification token")
    await db.users.mark_email_verified(user_id)
    logger.info("Auth verify-email success: user_id=%s", user_id)
    return user_id


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(req: VerifyEmailRequest, response: Response, db: DatabaseManager = Depends(get_db)):
    user_id = await _verify_email_token(req.token, db)
    _set_auth_cookie(response, create_access_token(user_id))
    return MessageResponse(message="Email verified. You can now sign in.")


@router.get("/verify-email", response_model=MessageResponse)
async def verify_email_from_link(
    response: Response,
    token: str = Query(..., min_length=20, max_length=512),
    db: DatabaseManager = Depends(get_db),
):
    user_id = await _verify_email_token(token, db)
    _set_auth_cookie(response, create_access_token(user_id))
    return MessageResponse(message="Email verified. You can now sign in.")


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    req: ResendVerificationRequest,
    request: Request,
    db: DatabaseManager = Depends(get_db),
):
    normalized_email = _normalize_email(req.email)
    request_ip = client_ip(request)
    _check_auth_rate_limit(
        limiter=auth_request_rate_limiter,
        key=f"resend:req:ip:{request_ip}",
        limit=_env_int("RESEND_VERIFICATION_RATE_LIMIT_MAX_ATTEMPTS", 10),
        window_seconds=_env_int("RESEND_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS", 300),
        detail="Too many verification resend attempts. Please try again later.",
    )
    _check_auth_rate_limit(
        limiter=auth_request_rate_limiter,
        key=f"resend:req:email:{_email_fingerprint(normalized_email)}",
        limit=_env_int("RESEND_VERIFICATION_RATE_LIMIT_PER_EMAIL_ATTEMPTS", 5),
        window_seconds=_env_int("RESEND_VERIFICATION_RATE_LIMIT_PER_EMAIL_WINDOW_SECONDS", 300),
        detail="Too many verification resend attempts for this email. Please try again later.",
    )
    user = await db.users.get_user_by_email(normalized_email)
    if user and not user.email_verified:
        cooldown_floor = datetime.now(timezone.utc) - timedelta(seconds=60)
        has_recent = await db.users.has_recent_auth_token(
            user_id=str(user.id),
            token_type="email_verify",
            min_created_at=cooldown_floor,
        )
        if not has_recent:
            await _issue_verification_token(db, user, request)
            logger.info(
                "Auth resend-verification success: user_id=%s email_fp=%s ip=%s",
                user.id,
                _email_fingerprint(normalized_email),
                request_ip,
            )
        else:
            logger.warning(
                "Auth resend-verification throttled: user_id=%s email_fp=%s ip=%s",
                user.id,
                _email_fingerprint(normalized_email),
                request_ip,
            )
    else:
        logger.warning(
            "Auth resend-verification no-op: email_fp=%s ip=%s",
            _email_fingerprint(normalized_email),
            request_ip,
        )
    return MessageResponse(message="If this account exists, a verification email has been sent.")


@router.post("/login", response_model=AuthUserResponse)
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: DatabaseManager = Depends(get_db),
):
    normalized_email = _normalize_email(req.email)
    request_ip = client_ip(request)
    _check_auth_rate_limit(
        limiter=auth_request_rate_limiter,
        key=f"login:req:ip:{request_ip}",
        limit=_env_int("LOGIN_REQUEST_RATE_LIMIT_MAX_ATTEMPTS", 30),
        window_seconds=_env_int("LOGIN_REQUEST_RATE_LIMIT_WINDOW_SECONDS", 60),
        detail="Too many login requests. Please try again shortly.",
    )

    ip_key = f"ip:{request_ip}"
    email_key = f"email:{normalized_email}"
    retry_after = max(
        login_rate_limiter.retry_after(ip_key) or 0,
        login_rate_limiter.retry_after(email_key) or 0,
    )
    if retry_after > 0:
        logger.warning(
            "Auth login rate-limited: email_fp=%s ip=%s retry_after=%s",
            _email_fingerprint(normalized_email),
            request_ip,
            retry_after,
        )
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Please try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )

    auth_user = await db.users.get_auth_user_by_email(normalized_email)
    pw_hash = auth_user["password_hash"] if auth_user else None
    valid_password = verify_password(req.password, pw_hash) if pw_hash else False
    if not auth_user or not valid_password:
        login_rate_limiter.register_failure(ip_key)
        login_rate_limiter.register_failure(email_key)
        logger.warning(
            "Auth login failed: email_fp=%s ip=%s reason=invalid_credentials",
            _email_fingerprint(normalized_email),
            request_ip,
        )
        raise HTTPException(401, "Invalid email or password")

    if not auth_user["email_verified"]:
        logger.warning(
            "Auth login failed: user_id=%s email_fp=%s ip=%s reason=email_unverified",
            auth_user["id"],
            _email_fingerprint(normalized_email),
            request_ip,
        )
        raise HTTPException(403, "Email not verified. Please verify your email before signing in.")

    login_rate_limiter.register_success(ip_key)
    login_rate_limiter.register_success(email_key)

    token = create_access_token(auth_user["id"])
    _set_auth_cookie(response, token)
    logger.info(
        "Auth login success: user_id=%s email_fp=%s ip=%s",
        auth_user["id"],
        _email_fingerprint(normalized_email),
        request_ip,
    )
    return AuthUserResponse(
        user_id=auth_user["id"],
        name=auth_user["name"] or "",
        email=auth_user["email"] or "",
        email_verified=True,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(request: Request, response: Response):
    _clear_auth_cookie(response)
    logger.info("Auth logout: ip=%s", client_ip(request))
    return MessageResponse(message="Logged out.")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    db: DatabaseManager = Depends(get_db),
):
    normalized_email = _normalize_email(req.email)
    request_ip = client_ip(request)
    _check_auth_rate_limit(
        limiter=auth_request_rate_limiter,
        key=f"forgot:req:ip:{request_ip}",
        limit=_env_int("FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS", 10),
        window_seconds=_env_int("FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS", 300),
        detail="Too many reset attempts. Please try again later.",
    )
    user = await db.users.get_user_by_email(normalized_email)
    if user and user.email_verified:
        cooldown_floor = datetime.now(timezone.utc) - timedelta(seconds=60)
        has_recent = await db.users.has_recent_auth_token(
            user_id=str(user.id),
            token_type="password_reset",
            min_created_at=cooldown_floor,
        )
        if not has_recent:
            raw_token = generate_one_time_token()
            token_hash = hash_one_time_token(raw_token)
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=get_password_reset_ttl_minutes())
            await db.users.create_auth_token(
                user_id=str(user.id),
                token_type="password_reset",
                token_hash=token_hash,
                expires_at=expires_at,
            )
            reset_url = _build_password_reset_url(request, raw_token)
            try:
                send_password_reset_email(user.email or "", reset_url)
            except Exception:  # noqa: BLE001
                logger.exception(
                    "Auth forgot-password email send failed: user_id=%s email_fp=%s ip=%s",
                    user.id,
                    _email_fingerprint(normalized_email),
                    request_ip,
                )
            logger.info(
                "Auth forgot-password success: user_id=%s email_fp=%s ip=%s",
                user.id,
                _email_fingerprint(normalized_email),
                request_ip,
            )
        else:
            logger.warning(
                "Auth forgot-password throttled: user_id=%s email_fp=%s ip=%s",
                user.id,
                _email_fingerprint(normalized_email),
                request_ip,
            )
    else:
        logger.warning(
            "Auth forgot-password no-op: email_fp=%s ip=%s",
            _email_fingerprint(normalized_email),
            request_ip,
        )

    # Always generic to avoid account enumeration.
    return MessageResponse(message="If this account exists, a password reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(req: ResetPasswordRequest, request: Request, db: DatabaseManager = Depends(get_db)):
    user_id = await db.users.consume_auth_token("password_reset", hash_one_time_token(req.token))
    if not user_id:
        logger.warning("Auth reset-password failed: ip=%s reason=invalid_or_expired_token", client_ip(request))
        raise HTTPException(400, "Invalid or expired reset token")

    new_hash = hash_password(req.new_password)
    await db.users.set_password_hash(user_id, new_hash)
    logger.info("Auth reset-password success: user_id=%s ip=%s", user_id, client_ip(request))
    return MessageResponse(message="Password has been reset. You can now sign in.")


@router.get("/me", response_model=AuthUserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return AuthUserResponse(
        user_id=str(current_user.id),
        name=current_user.name or "",
        email=current_user.email or "",
        email_verified=bool(current_user.email_verified),
    )
