"""Email notifications for auth flows (verification and password reset)."""

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def _send_email(to_email: str, subject: str, text_body: str) -> None:
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    from_email = os.environ.get("AUTH_FROM_EMAIL", "no-reply@scanscorecards.local")

    if not smtp_host:
        logger.info(
            "Auth email (SMTP disabled) to=%s subject=%s body=%s",
            to_email,
            subject,
            text_body,
        )
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(text_body)

    with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
        server.starttls()
        if smtp_user and smtp_pass:
            server.login(smtp_user, smtp_pass)
        server.send_message(msg)


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

