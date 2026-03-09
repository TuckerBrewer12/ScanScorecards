from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.auth_utils import decode_access_token
from database.db_manager import DatabaseManager

bearer_scheme = HTTPBearer(auto_error=False)


def get_db(request: Request) -> DatabaseManager:
    """FastAPI dependency that provides the DatabaseManager."""
    return request.app.state.db_manager


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: DatabaseManager = Depends(get_db),
):
    """Decode the Bearer JWT and return the authenticated User."""
    if not credentials:
        raise HTTPException(401, "Not authenticated")
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    user_id = payload.get("sub")
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return user
