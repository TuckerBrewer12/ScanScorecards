"""Pydantic schemas for auth endpoints (kept separate from domain models)."""

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str
    password: str = Field(..., min_length=8)
    handicap: float | None = Field(default=None, ge=10, le=54)
    home_course_id: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    email: str
