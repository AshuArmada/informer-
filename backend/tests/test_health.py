from fastapi.testclient import TestClient

from app.main import app


def test_health_check_ok():
    # Health itself is independent of startup jobs and database availability.
    client = TestClient(app, base_url="http://localhost", client=("127.0.0.1", 12345))
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
