from fastapi import Request
from database.db_manager import DatabaseManager


def get_db(request: Request) -> DatabaseManager:
    """FastAPI dependency that provides the DatabaseManager."""
    return request.app.state.db_manager
