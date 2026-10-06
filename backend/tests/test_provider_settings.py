import json
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.models import ProviderSettings
from app.provider_settings import ProviderUpdate, decode_overrides, effective_settings, public_settings
from app.routers import settings as routes
from app.security import decrypt_token, encrypt_token


def payload(**updates):
    return dict(ai_provider="ollama", openai_model="gpt-test", gemini_model="gemini-test",
                ollama_model="local-test", ollama_base_url="http://127.0.0.1:11434",
                ai_timeout_seconds=180) | updates


@pytest.mark.parametrize("url", ["http://localhost:11434", "https://evil.example", "http://169.254.169.254:11434",
    "http://127.0.0.1:8000", "http://user:password@127.0.0.1:11434", "http://127.0.0.1:11434/proxy",
    "http://127.0.0.1:11434?url=evil", "http://127.0.0.1:11434#fragment", "http://127.0.0.1:bad"])
def test_ui_cannot_redirect_provider_requests(url):
    with pytest.raises(ValidationError):
        ProviderUpdate(**payload(ollama_base_url=url))


def test_secrets_are_redacted_and_public_status_excludes_keys():
    update = ProviderUpdate(**payload(openai_api_key="secret-openai"))
    assert "secret-openai" not in repr(update)
    settings = Settings(_env_file=None, secret_key="test", openai_api_key="secret-openai", gemini_api_key="secret-gemini")
    result = json.dumps(public_settings(settings))
    assert "secret-openai" not in result and "secret-gemini" not in result


@pytest.mark.asyncio
async def test_encrypted_save_keeps_omitted_keys_and_empty_key_disables_fallback(monkeypatch):
    row = ProviderSettings(id=1, encrypted_payload=encrypt_token(json.dumps({"openai_api_key": "old-key"})))
    db = AsyncMock()
    selected = MagicMock()
    selected.scalar_one.return_value = row
    db.execute.return_value = selected
    monkeypatch.setattr(routes, "get_settings", lambda: Settings(_env_file=None, secret_key="test", openai_api_key="environment-key"))
    response = await routes.update_providers(ProviderUpdate(**payload(gemini_api_key="new-gemini")), db)
    stored = json.loads(decrypt_token(row.encrypted_payload))
    assert stored["openai_api_key"] == "old-key"
    assert stored["gemini_api_key"] == "new-gemini"
    assert "new-gemini" not in row.encrypted_payload
    assert "new-gemini" not in json.dumps(response)
    response = await routes.update_providers(ProviderUpdate(**payload(openai_api_key="")), db)
    assert not next(p for p in response["providers"] if p["id"] == "openai")["configured"]
    db.commit.assert_awaited()


def test_wrong_encryption_key_fails_closed():
    with pytest.raises(HTTPException) as exc:
        decode_overrides(ProviderSettings(id=1, encrypted_payload="corrupted"))
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_saved_overrides_are_used_by_advisor_settings(monkeypatch):
    import app.provider_settings as store
    monkeypatch.setattr(store, "get_settings", lambda: Settings(_env_file=None, secret_key="test", openai_model="environment-model"))
    db = AsyncMock()
    db.get.return_value = ProviderSettings(id=1, encrypted_payload=encrypt_token(json.dumps({"openai_model": "ui-model", "openai_api_key": "saved-key"})))
    result = await effective_settings(db)
    assert result.openai_model == "ui-model" and result.openai_api_key == "saved-key"


def test_connection_test_uses_saved_key_and_does_not_follow_redirects(monkeypatch):
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[effective_settings] = lambda: Settings(_env_file=None, secret_key="test", openai_api_key="private-key")
    original = httpx.AsyncClient
    calls = []
    def handler(request):
        calls.append(request)
        assert request.url.host == "api.openai.com"
        assert request.headers["Authorization"] == "Bearer private-key"
        return httpx.Response(302, headers={"Location": "https://evil.example"}, text="private-key")
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    response = TestClient(app).post("/api/settings/providers/openai/test")
    assert response.status_code == 502
    assert "private-key" not in response.text
    assert len(calls) == 1
