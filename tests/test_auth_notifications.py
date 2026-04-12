from api.auth_notifications import send_password_reset_email, send_verification_email


def test_resend_disabled_without_api_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    called = False

    def _fake_post(*_args, **_kwargs):
        nonlocal called
        called = True
        raise AssertionError("requests.post should not be called without RESEND_API_KEY")

    monkeypatch.setattr("api.auth_notifications.requests.post", _fake_post)

    send_verification_email("user@example.com", "https://example.com/verify?token=abc")
    assert called is False


def test_resend_api_payload(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "resend_test_key")
    monkeypatch.setenv("AUTH_FROM_EMAIL", "noreply@birdie-eye-view.com")
    monkeypatch.setenv("RESEND_API_URL", "https://api.resend.com/emails")
    monkeypatch.setenv("RESEND_TIMEOUT_SECONDS", "7.5")

    captured = {}

    class _DummyResponse:
        def raise_for_status(self):
            captured["raise_for_status_called"] = True

    def _fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return _DummyResponse()

    monkeypatch.setattr("api.auth_notifications.requests.post", _fake_post)

    send_password_reset_email("user@example.com", "https://example.com/reset?token=def")

    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["headers"]["Authorization"] == "Bearer resend_test_key"
    assert captured["headers"]["Content-Type"] == "application/json"
    assert captured["json"]["from"] == "noreply@birdie-eye-view.com"
    assert captured["json"]["to"] == ["user@example.com"]
    assert captured["json"]["subject"] == "Reset your ScanScorecards password"
    assert "https://example.com/reset?token=def" in captured["json"]["text"]
    assert captured["timeout"] == 7.5
    assert captured["raise_for_status_called"] is True
