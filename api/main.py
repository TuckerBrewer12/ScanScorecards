"""FastAPI application for the Golf Scorecard API."""

import logging
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s [%(name)s] %(message)s",
)
# Show all llm pipeline logs at DEBUG level
logging.getLogger("llm").setLevel(logging.DEBUG)

from api.security import (
    SecurityTrafficMonitor,
    SlidingWindowRateLimiter,
    enforce_https_if_needed,
    env_bool,
    env_int,
    parse_allowed_hosts,
    validate_deployment_security,
)
from api.auth_utils import get_access_token_cookie_name
from api.dependencies import client_ip

APP_ENV = os.environ.get("APP_ENV", "development").strip().lower()
IS_PROD_LIKE = APP_ENV in {"production", "prod", "staging"}
if env_bool("LOAD_DOTENV", not IS_PROD_LIKE):
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi.middleware.cors import CORSMiddleware

from models import Round, User  # noqa: F401 — Round must be imported for User.model_rebuild()
from database.connection import db
from database.db_manager import DatabaseManager

# Resolve forward reference (User -> Round)
User.model_rebuild()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB pool on startup, close on shutdown."""
    validate_deployment_security()
    dsn = os.environ.get("DATABASE_URL")
    await db.initialize(dsn=dsn)
    app.state.db_manager = DatabaseManager(db.pool)
    yield
    await db.close()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Golf Scorecard API",
        version="1.0.0",
        lifespan=lifespan,
    )

    allowed_hosts = parse_allowed_hosts()
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

    cors_origins_raw = os.environ.get("CORS_ALLOW_ORIGINS", "http://localhost:5173")
    cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    traffic_monitor = SecurityTrafficMonitor(
        request_window_sec=env_int("TRAFFIC_WINDOW_SECONDS", 60),
        auth_window_sec=env_int("AUTH_FAILURE_WINDOW_SECONDS", 300),
        request_threshold=env_int("TRAFFIC_REQUEST_THRESHOLD", 240),
        auth_failure_threshold=env_int("AUTH_FAILURE_THRESHOLD", 20),
        alert_cooldown_sec=env_int("TRAFFIC_ALERT_COOLDOWN_SECONDS", 60),
    )
    api_rate_limiter = SlidingWindowRateLimiter()
    api_rate_window_sec = env_int("API_RATE_LIMIT_WINDOW_SECONDS", 60)
    api_rate_max_requests = env_int("API_RATE_LIMIT_MAX_REQUESTS", 240)
    api_rate_max_unauth_requests = env_int("API_RATE_LIMIT_MAX_UNAUTH_REQUESTS", 90)
    api_scrape_window_sec = env_int("API_SCRAPE_LIMIT_WINDOW_SECONDS", 60)
    api_scrape_max_requests = env_int("API_SCRAPE_LIMIT_MAX_REQUESTS", 60)
    api_bot_window_sec = env_int("API_BOT_LIMIT_WINDOW_SECONDS", 60)
    api_bot_max_requests = env_int("API_BOT_LIMIT_MAX_REQUESTS", 30)
    api_rate_exempt_paths = {"/api/health"}
    scrape_heavy_prefixes = ("/api/courses", "/api/stats", "/api/rounds/user")

    def _scrape_group(path: str) -> str:
        if path.startswith("/api/courses"):
            return "courses"
        if path.startswith("/api/stats"):
            return "stats"
        if path.startswith("/api/rounds/user"):
            return "rounds_user"
        return "other"

    def _looks_like_bot_ua(user_agent: str) -> bool:
        ua = (user_agent or "").lower()
        if not ua:
            return True
        bot_markers = ("bot", "crawler", "spider", "scrapy", "curl", "wget", "python-requests", "httpx")
        return any(marker in ua for marker in bot_markers)

    @app.middleware("http")
    async def security_middleware(request: Request, call_next):
        redirect = enforce_https_if_needed(request)
        if redirect is not None:
            return redirect

        t0 = time.perf_counter()
        ip = client_ip(request)
        user_agent = request.headers.get("user-agent", "")[:200]
        path = request.url.path

        if request.method != "OPTIONS" and path.startswith("/api") and path not in api_rate_exempt_paths:
            cookie_name = get_access_token_cookie_name()
            has_auth = bool(request.headers.get("authorization")) or bool(request.cookies.get(cookie_name))

            allowed, retry_after = api_rate_limiter.check(
                f"api:global:{ip}",
                limit=api_rate_max_requests,
                window_seconds=api_rate_window_sec,
            )
            if not allowed:
                logging.getLogger(__name__).warning(
                    "API rate-limit hit: category=global ip=%s method=%s path=%s retry_after=%s",
                    ip,
                    request.method,
                    path,
                    retry_after,
                )
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please slow down."},
                    headers={"Retry-After": str(retry_after)},
                )

            if not has_auth:
                allowed, retry_after = api_rate_limiter.check(
                    f"api:unauth:{ip}",
                    limit=api_rate_max_unauth_requests,
                    window_seconds=api_rate_window_sec,
                )
                if not allowed:
                    logging.getLogger(__name__).warning(
                        "API rate-limit hit: category=unauth ip=%s method=%s path=%s retry_after=%s",
                        ip,
                        request.method,
                        path,
                        retry_after,
                    )
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Too many unauthenticated requests."},
                        headers={"Retry-After": str(retry_after)},
                    )

            if request.method == "GET" and path.startswith(scrape_heavy_prefixes):
                allowed, retry_after = api_rate_limiter.check(
                    f"api:scrape:{ip}:{_scrape_group(path)}",
                    limit=api_scrape_max_requests,
                    window_seconds=api_scrape_window_sec,
                )
                if not allowed:
                    logging.getLogger(__name__).warning(
                        "API rate-limit hit: category=scrape ip=%s path=%s retry_after=%s ua=%s",
                        ip,
                        path,
                        retry_after,
                        user_agent,
                    )
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Request rate exceeded for this endpoint."},
                        headers={"Retry-After": str(retry_after)},
                    )

            if _looks_like_bot_ua(user_agent):
                allowed, retry_after = api_rate_limiter.check(
                    f"api:bot:{ip}",
                    limit=api_bot_max_requests,
                    window_seconds=api_bot_window_sec,
                )
                if not allowed:
                    logging.getLogger(__name__).warning(
                        "API rate-limit hit: category=bot ip=%s path=%s retry_after=%s ua=%s",
                        ip,
                        path,
                        retry_after,
                        user_agent,
                    )
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Automated traffic limit reached."},
                        headers={"Retry-After": str(retry_after)},
                    )

        try:
            response = await call_next(request)
        except Exception:
            latency_ms = (time.perf_counter() - t0) * 1000.0
            logging.getLogger(__name__).exception(
                "Unhandled API exception: ip=%s method=%s path=%s latency_ms=%.1f ua=%s",
                ip,
                request.method,
                path,
                latency_ms,
                user_agent,
            )
            traffic_monitor.record(
                ip=ip,
                status_code=500,
                method=request.method,
                path=path,
                latency_ms=latency_ms,
                user_agent=user_agent,
            )
            raise

        latency_ms = (time.perf_counter() - t0) * 1000.0
        traffic_monitor.record(
            ip=ip,
            status_code=response.status_code,
            method=request.method,
            path=path,
            latency_ms=latency_ms,
            user_agent=user_agent,
        )

        # Basic hardening headers for API responses.
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").lower().startswith("https"):
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    from api.routers import auth, courses, users, rounds, stats, scan, ai_insights
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(courses.router, prefix="/api/courses", tags=["courses"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(rounds.router, prefix="/api/rounds", tags=["rounds"])
    app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
    app.include_router(scan.router, prefix="/api/scan", tags=["scan"])
    app.include_router(ai_insights.router, prefix="/api/ai-insights", tags=["ai-insights"])

    @app.api_route("/", methods=["GET", "HEAD"])
    async def root_status(request: Request):
        if request.method == "HEAD":
            return Response(status_code=200)
        return JSONResponse(
            status_code=200,
            content={"status": "ok", "service": "backend"},
        )

    @app.api_route("/health", methods=["GET", "HEAD"])
    @app.api_route("/api/health", methods=["GET", "HEAD"])
    async def health(request: Request):
        healthy = await db.health_check()
        if request.method == "HEAD":
            return Response(status_code=200)
        return JSONResponse(
            status_code=200,
            content={"status": "ok" if healthy else "degraded", "database": healthy},
        )

    return app


app = create_app()
