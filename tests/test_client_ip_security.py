from starlette.requests import Request

from api.dependencies import client_ip


def _request_with_client(*, peer_host: str, x_forwarded_for: str | None = None) -> Request:
    headers = []
    if x_forwarded_for is not None:
        headers.append((b"x-forwarded-for", x_forwarded_for.encode("utf-8")))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers,
        "client": (peer_host, 12345),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


def test_client_ip_uses_peer_by_default(monkeypatch):
    monkeypatch.delenv("TRUST_PROXY_HEADERS", raising=False)
    monkeypatch.delenv("TRUSTED_PROXY_CIDRS", raising=False)
    request = _request_with_client(peer_host="198.51.100.9", x_forwarded_for="203.0.113.10")
    assert client_ip(request) == "198.51.100.9"


def test_client_ip_trusts_forwarded_header_only_from_trusted_proxy(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
    request = _request_with_client(peer_host="10.1.2.3", x_forwarded_for="203.0.113.10, 10.1.2.3")
    assert client_ip(request) == "203.0.113.10"


def test_client_ip_ignores_forwarded_header_from_untrusted_peer(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
    request = _request_with_client(peer_host="198.51.100.9", x_forwarded_for="203.0.113.10")
    assert client_ip(request) == "198.51.100.9"

