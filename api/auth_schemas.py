"""Pydantic schemas for auth endpoints (kept separate from domain models)."""

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.input_validation import (
    ensure_uuid_str,
    normalize_email,
    normalize_handicap_value,
    sanitize_user_text,
)


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=100)
    email: str
    password: str = Field(..., min_length=8, max_length=128)
    handicap: float | None = Field(default=None, ge=-10, le=54)
    home_course_id: str | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str) -> str:
        return sanitize_user_text(v, field_name="name", max_length=100)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("handicap", mode="before")
    @classmethod
    def _normalize_handicap(cls, v: object) -> object:
        return normalize_handicap_value(v)

    @field_validator("home_course_id")
    @classmethod
    def _validate_home_course_id(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return ensure_uuid_str(v, "home_course_id")


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: str
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        return normalize_email(v)


class AuthUserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    email_verified: bool = True


class RegisterResponse(BaseModel):
    message: str
    requires_email_verification: bool = True


class VerifyEmailRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    token: str = Field(..., min_length=20, max_length=512)


class ResendVerificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: str

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        return normalize_email(v)


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: str

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        return normalize_email(v)


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    token: str = Field(..., min_length=20, max_length=512)
    new_password: str = Field(..., min_length=8, max_length=128)


class MessageResponse(BaseModel):
    message: str
