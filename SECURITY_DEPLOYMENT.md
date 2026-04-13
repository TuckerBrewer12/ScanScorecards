# Secure Deployment Checklist

This app now includes runtime security controls, but infra hardening still matters.

## 1) Enforce HTTPS

- Terminate TLS at your load balancer/reverse proxy.
- Set:
  - `APP_ENV=production`
  - `ENFORCE_HTTPS=true`
  - `ALLOW_LOCAL_HTTP=false`
  - `AUTH_COOKIE_SECURE=true`
  - `AUTH_COOKIE_SAMESITE=lax` (or `strict` if UX allows)
- Set `ALLOWED_HOSTS` to your real API domains only (comma-separated).

## 2) Store Secrets Securely

- Do not commit `.env` files with secrets.
- Use a secret manager (AWS Secrets Manager, GCP Secret Manager, Vault, etc.).
- Inject secrets as environment variables at runtime.
- Rotate at least:
  - `SECRET_KEY`
  - `DATABASE_URL` credentials
  - `GOOGLE_API_KEY`
  - `MISTRAL_API_KEY`
  - `GOLFCOURSE_API_KEY`
- Run `bash scripts/security/scan_secrets.sh` before push.
- CI also enforces secret scanning via `.github/workflows/secret-scan.yml`.

## 3) Restrict Direct Database Exposure

- Keep DB in a private subnet/VPC network segment.
- Block public ingress (`0.0.0.0/0`) to DB port.
- Only allow app runtime security group/subnet to reach DB.
- Use private DB endpoint where possible.
- Runtime guardrails:
  - `REQUIRE_PRIVATE_DB_HOST=true`
  - `REQUIRE_DB_SSL=true`
  - `DB_HOST_ALLOWLIST` only when you intentionally use a non-private hostname.

## 4) Logging & Detection

The app logs:
- Authentication attempts (success/failure/rate-limit) with email fingerprinting.
- API errors and unhandled exceptions.
- Unusual traffic spikes and repeated auth failure patterns.

Recommended:
- Ship logs to a central destination (CloudWatch/Datadog/ELK/SIEM).
- Alert on:
  - spikes in 401/403/429
  - spikes in 5xx
  - unusual request volume per IP

## 5) Abuse Protection / Bot Throttling

Rate limiting is enforced in three places:
- Login attempts (`/api/auth/login`) with lockout behavior.
- Account creation (`/api/auth/register`) with IP + email-fingerprint limits.
- Global API middleware limits (including stricter unauthenticated and scrape-heavy GET limits).

Optional AI throttles are also enforced on `GET /api/ai-insights/{user_id}`.

Key environment controls:
- `API_RATE_LIMIT_*`
- `API_SCRAPE_LIMIT_*`
- `API_BOT_LIMIT_*`
- `LOGIN_RATE_LIMIT_*`
- `REGISTER_RATE_LIMIT_*`
- `FORGOT_PASSWORD_RATE_LIMIT_*`
- `AI_RATE_LIMIT_*`

## 6) Baseline Production Environment

- `APP_ENV=production`
- `LOAD_DOTENV=false`
- `ENFORCE_HTTPS=true`
- `ALLOW_LOCAL_HTTP=false`
- `AUTH_COOKIE_SECURE=true`
- `REQUIRE_PRIVATE_DB_HOST=true`
- `REQUIRE_DB_SSL=true`
- `CORS_ALLOW_ORIGINS=https://your-frontend-domain`
- `ALLOWED_HOSTS=api.your-domain.com`
- `API_RATE_LIMIT_MAX_UNAUTH_REQUESTS=60` (or lower for public deployments)
