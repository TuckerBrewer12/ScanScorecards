"""Email notifications for auth flows (verification and password reset)."""

import logging
import os

import requests

logger = logging.getLogger(__name__)


def _send_email(to_email: str, subject: str, text_body: str) -> None:
    resend_api_key = os.environ.get("RESEND_API_KEY")
    from_email = os.environ.get("AUTH_FROM_EMAIL", "no-reply@scanscorecards.local")
    resend_api_url = os.environ.get("RESEND_API_URL", "https://api.resend.com/emails")
    request_timeout_seconds = float(os.environ.get("RESEND_TIMEOUT_SECONDS", "10"))

    if not resend_api_key:
        logger.info(
            "Auth email (Resend disabled) to=%s subject=%s",
            to_email,
            subject,
        )
        return

    response = requests.post(
        resend_api_url,
        headers={
            "Authorization": f"Bearer {resend_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": text_body,
        },
        timeout=request_timeout_seconds,
    )
    response.raise_for_status()


def send_verification_email(email: str, verify_url: str) -> None:
    subject = "Verify your ScanScorecards account"
    body = (
        "Welcome to ScanScorecards.\n\n"
        "Please verify your email by opening this link:\n"
        f"{verify_url}\n\n"
        "If you did not create this account, you can ignore this email."
    )
    _send_email(email, subject, body)


def send_password_reset_email(email: str, reset_url: str) -> None:
    subject = "Reset your ScanScorecards password"
    body = (
        "We received a request to reset your ScanScorecards password.\n\n"
        "Reset link:\n"
        f"{reset_url}\n\n"
        "If you did not request this, you can safely ignore this email."
    )
    _send_email(email, subject, body)
