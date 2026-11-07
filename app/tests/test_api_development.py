# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
from unittest.mock import MagicMock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.api_development import ApiDevelopment


@pytest.fixture
def test_client():
    app = FastAPI()
    mock_dev_service = MagicMock()
    mock_dev_service.get_sandbox_provider.return_value = "e2b"
    mock_dev_service.is_configured.return_value = True
    mock_dev_service.is_sandbox_configured.return_value = True
    mock_dev_service.is_gemini_configured.return_value = True
    mock_dev_service.active_sandboxes = {}

    mock_dev_service.execute_task.return_value = {
        "success": True,
        "status": "success",
        "wbs_code": "1.1",
        "title": "Create User Model",
        "feature_branch": "haiven/wbs-1-1-create-user-model",
        "pr_info": {"html_url": "https://github.com/org/repo/pull/1", "number": 1},
        "tests_passed": True,
        "logs": "Completed successfully",
    }

    mock_dev_service.execute_wave.return_value = {
        "wave": "Wave 1",
        "total_tasks": 1,
        "successful_tasks": 1,
        "results": [{"success": True, "wbs_code": "1.1"}],
    }

    mock_repo = MagicMock()
    mock_repo.get_active_project_id.return_value = "default"
    mock_repo.get_tasks.return_value = [
        {"id": "t1", "wbsCode": "1.1", "title": "Create User Model", "parallelGroup": "Wave 1"}
    ]

    ApiDevelopment(
        app=app,
        dev_service=mock_dev_service,
        data_repository=mock_repo,
    )

    client = TestClient(app)
    return client, mock_dev_service


def test_get_development_status(test_client):
    client, _ = test_client
    resp = client.get("/api/development/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["sandbox_provider"] == "e2b"


def test_execute_wbs_task_sync(test_client):
    client, mock_service = test_client
    payload = {
        "title": "Create User Model",
        "wbs_code": "1.1",
        "summary": "Implement schema",
        "dependencies": [],
    }
    resp = client.post("/api/development/execute-task", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["wbs_code"] == "1.1"
    assert data["pr_info"]["number"] == 1
    assert mock_service.execute_task.called


def test_execute_wbs_task_streaming(test_client):
    client, mock_service = test_client
    payload = {
        "title": "Create User Model",
        "wbs_code": "1.1",
    }
    resp = client.post("/api/development/execute-task?stream=true", json=payload)
    assert resp.status_code == 200
    assert "application/x-ndjson" in resp.headers["content-type"]
    lines = resp.text.strip().split("\n")
    assert len(lines) >= 1


def test_execute_wbs_wave(test_client):
    client, mock_service = test_client
    payload = {
        "wave_name": "Wave 1",
    }
    resp = client.post("/api/development/execute-wave", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["wave"] == "Wave 1"
    assert data["successful_tasks"] == 1

