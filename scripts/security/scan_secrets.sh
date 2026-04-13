#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "error: ripgrep (rg) is required for secret scanning."
  exit 2
fi

failures=0
scan_git_history="${SCAN_GIT_HISTORY:-1}"

echo "[1/5] Scanning tracked files for known secret token formats..."
LITERAL_PATTERNS='(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z\-_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----)'
literal_hits="$(git ls-files -z | xargs -0 rg -n --pcre2 "$LITERAL_PATTERNS" 2>/dev/null || true)"
if [[ -n "$literal_hits" ]]; then
  echo "FAILED: possible hardcoded secrets detected:"
  echo "$literal_hits"
  failures=1
fi

echo "[2/5] Scanning tracked files for direct credential assignments..."
ASSIGNMENT_PATTERNS='((GOOGLE_API_KEY|MISTRAL_API_KEY|OPENAI_API_KEY|GOLFCOURSE_API_KEY|DATABASE_URL|SECRET_KEY|JWT_SECRET|SMTP_PASSWORD)\s*[:=]\s*["'"'"'"][^"'"'"'"]{6,}["'"'"'"])'
assignment_hits="$(
  git ls-files -z | xargs -0 rg -n --pcre2 "$ASSIGNMENT_PATTERNS" 2>/dev/null \
  | rg -v '(^|/)\.env\.example:' \
  || true
)"
if [[ -n "$assignment_hits" ]]; then
  echo "FAILED: hardcoded credential assignments detected (outside .env.example):"
  echo "$assignment_hits"
  failures=1
fi

echo "[3/5] Ensuring frontend never references backend secret env vars..."
FRONTEND_SECRET_PATTERNS='(MISTRAL_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|GOLFCOURSE_API_KEY|SECRET_KEY|DATABASE_URL|JWT_SECRET|SMTP_PASSWORD|VITE_[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD))'
frontend_secret_hits="$(git ls-files -z frontend | xargs -0 rg -n --pcre2 "$FRONTEND_SECRET_PATTERNS" 2>/dev/null || true)"
if [[ -n "$frontend_secret_hits" ]]; then
  echo "FAILED: frontend appears to reference sensitive variables:"
  echo "$frontend_secret_hits"
  failures=1
fi

echo "[4/5] Ensuring frontend does not call AI providers directly..."
FRONTEND_PROVIDER_PATTERNS='https?://(api\.mistral\.ai|generativelanguage\.googleapis\.com|api\.openai\.com)'
frontend_provider_hits="$(git ls-files -z frontend | xargs -0 rg -n --pcre2 "$FRONTEND_PROVIDER_PATTERNS" 2>/dev/null || true)"
if [[ -n "$frontend_provider_hits" ]]; then
  echo "FAILED: frontend calls provider APIs directly:"
  echo "$frontend_provider_hits"
  failures=1
fi

if [[ "$scan_git_history" == "1" ]]; then
  echo "[5/5] Scanning git history for known secret token formats..."
  history_hits="$(git log --all --format='%h %s' -G "$LITERAL_PATTERNS" -- . || true)"
  if [[ -n "$history_hits" ]]; then
    echo "FAILED: secret-like values found in commit history:"
    echo "$history_hits"
    echo "Rotate the exposed key(s), then rewrite history (git filter-repo/BFG) and force-push."
    failures=1
  fi
else
  echo "[5/5] Git history scan skipped (SCAN_GIT_HISTORY=$scan_git_history)."
fi

if [[ "$failures" -ne 0 ]]; then
  echo "Secret scan failed."
  exit 1
fi

echo "Secret scan passed."
