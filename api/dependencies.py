import ipaddress
import os

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _trusted_proxy_networks() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    raw = os.environ.get("TRUSTED_PROXY_CIDRS", "127.0.0.1/32,::1/128")
    out: list = []
    for part in raw.split(","):
        cidr = part.strip()
        if not cidr:
            continue
        try:
            out.append(ipaddress.ip_network(cidr, strict=False))
        except ValueError:
            continue
    return out


def _peer_is_trusted_proxy(peer_host: str) -> bool:
    try:
        peer_ip = ipaddress.ip_address(peer_host)
    except ValueError:
        return False
    return any(peer_ip in network for network in _trusted_proxy_networks())


def client_ip(request: Request) -> str:
    peer_host = request.client.host if request.client else "unknown"
    fwd = request.headers.get("x-forwarded-for")
    trust_proxy_headers = _env_bool("TRUST_PROXY_HEADERS", False)
    if fwd and trust_proxy_headers and _peer_is_trusted_proxy(peer_host):
        return fwd.split(",")[0].strip()
    return peer_host

from api.auth_utils import decode_access_token, get_access_token_cookie_name
from database.db_manager import DatabaseManager

bearer_scheme = HTTPBearer(auto_error=False)


def get_db(request: Request) -> DatabaseManager:
    """FastAPI dependency that provides the DatabaseManager."""
    db_manager = getattr(request.app.state, "db_manager", None)
    if db_manager is None:
        raise HTTPException(503, "Database is unavailable. Please retry shortly.")
    return db_manager


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: DatabaseManager = Depends(get_db),
):
    """Decode the Bearer JWT and return the authenticated User."""
    token = credentials.credentials if credentials else request.cookies.get(get_access_token_cookie_name())
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    user_id = payload.get("sub")
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def get_optional_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: DatabaseManager = Depends(get_db),
):
    """Best-effort auth dependency that returns None when unauthenticated/invalid."""
    token = credentials.credentials if credentials else request.cookies.get(get_access_token_cookie_name())
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return await db.users.get_user(user_id)
