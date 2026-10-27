from unittest.mock import Mock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.internal_routes import internal_router


@pytest.fixture
def internal_client():
    security = Mock()
    security.settings.return_value = {}
    app = FastAPI()
    app.include_router(internal_router(None, security))
    with TestClient(app) as client:
        yield client, security


@pytest.mark.parametrize("header", [{}, {"X-Internal-Key": "arbitrary"}])
def test_missing_configuration_rejects_all_internal_requests(internal_client, monkeypatch, header):
    client, security = internal_client
    monkeypatch.delenv("INTERNAL_SERVICE_KEY", raising=False)
    assert client.get("/internal/health", headers=header).status_code == 503
    security.settings.assert_not_called()


@pytest.mark.parametrize("header", [{}, {"X-Internal-Key": "wrong-key"}])
def test_unauthorized_requests_never_reach_handlers(internal_client, monkeypatch, header):
    client, security = internal_client
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "internal-test-key")
    with patch("app.internal_routes.run_pre_review") as review:
        assert client.get("/internal/health", headers=header).status_code == 403
        assert client.post("/internal/pre-review", json={}, headers=header).status_code == 403
        assert client.post("/internal/format-check", headers=header).status_code == 403
        assert client.post("/internal/extract-text", headers=header).status_code == 403
        review.assert_not_called()
    security.settings.assert_not_called()


def test_valid_key_allows_health(internal_client, monkeypatch):
    client, security = internal_client
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "internal-test-key")
    assert client.get("/internal/health", headers={"X-Internal-Key": "internal-test-key"}).status_code == 200
    security.settings.assert_called_once_with(reveal=False)
