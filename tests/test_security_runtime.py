import pytest

from api.security import validate_deployment_security


def test_validate_deployment_security_rejects_weak_secret(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "short")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost:5432/golf_scorecard")
    with pytest.raises(EnvironmentError):
        validate_deployment_security()


def test_validate_deployment_security_requires_db_ssl_for_non_local(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("REQUIRE_PRIVATE_DB_HOST", "false")
    monkeypatch.setenv("REQUIRE_DB_SSL", "true")
    monkeypatch.setenv("DATABASE_URL", "postgresql://db.example.com:5432/golf_scorecard")
    with pytest.raises(EnvironmentError):
        validate_deployment_security()


def test_validate_deployment_security_allows_private_host(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("REQUIRE_PRIVATE_DB_HOST", "true")
    monkeypatch.setenv("REQUIRE_DB_SSL", "false")
    monkeypatch.setenv("DATABASE_URL", "postgresql://10.1.2.3:5432/golf_scorecard")
    validate_deployment_security()

