"""Pydantic schemas for auth endpoints (kept separate from domain models)."""

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str
    password: str = Field(..., min_length=8)
    handicap: float | None = Field(default=None, ge=-10, le=54)
    home_course_id: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthUserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    email_verified: bool = True


class RegisterResponse(BaseModel):
    message: str
    requires_email_verification: bool = True


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=20)


class ResendVerificationRequest(BaseModel):
    email: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=20)
    new_password: str = Field(..., min_length=8)


class MessageResponse(BaseModel):
    message: str
