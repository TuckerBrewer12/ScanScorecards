"""FastAPI application for the Golf Scorecard API."""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from api.routers import auth, courses, users, rounds, stats, scan, ai_insights
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(courses.router, prefix="/api/courses", tags=["courses"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(rounds.router, prefix="/api/rounds", tags=["rounds"])
    app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
    app.include_router(scan.router, prefix="/api/scan", tags=["scan"])
    app.include_router(ai_insights.router, prefix="/api/ai-insights", tags=["ai-insights"])

    @app.get("/api/health")
    async def health():
        healthy = await db.health_check()
        return {"status": "ok" if healthy else "degraded", "database": healthy}

    return app


app = create_app()
