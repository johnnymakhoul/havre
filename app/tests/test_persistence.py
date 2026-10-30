# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import json
import os
import tempfile
from fastapi import FastAPI
from fastapi.testclient import TestClient

from persistence.data_repository import (
    DataRepository,
    DataRepositoryInterface,
    JsonDataRepository,
    SqliteDataRepository,
    DEFAULT_PROJECT_SECTIONS,
)
from api.api_persistence import ApiPersistence


def test_data_repository_persists_across_instances():
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = os.path.join(tmpdir, "haiven_data.json")
        repo1 = DataRepository(file_path=file_path)

        # Default state
        assert len(repo1.get_projects()) == 1
        assert repo1.get_active_project_id() == "default"

        # Add project, pinboard item, context, and session
        project = repo1.add_project(
            {
                "id": "project-100",
                "name": "Persistent Project",
                "description": "Saved to disk",
                "sections": ["research", "coding"],
            }
        )
        assert project["id"] == "project-100"
        assert repo1.get_active_project_id() == "project-100"

        repo1.save_pinboard_item(
            "project-100", "17000001", {"content": "Pinned note", "isUserDefined": True}
        )
        repo1.save_context(
            "project-100",
            {
                "title": "Domain Context",
                "summary": "E-commerce domain",
                "timestamp": 17000002,
                "isUserDefined": True,
            },
        )
        repo1.save_session(
            session_id="chat-1",
            project_id="project-100",
            category="research",
            messages=[{"role": "HaivenHumanMessage", "content": "Hello"}],
        )
        repo1.save_cards(
            project_id="project-100",
            prompt_id="software-arch",
            cards=[
                {"title": "Modular Monolith", "summary": "Clean arch in single deployable"},
                {"title": "Microservices", "summary": "Decoupled domain services"},
            ],
        )

        # Create a brand new repository instance pointing to the same file
        repo2 = DataRepository(file_path=file_path)
        assert len(repo2.get_projects()) == 2
        assert repo2.get_active_project_id() == "project-100"
        assert repo2.get_pinboard("project-100")["17000001"]["content"] == "Pinned note"
        contexts = repo2.get_contexts("project-100")
        assert len(contexts) == 1
        assert contexts[0]["title"] == "Domain Context"
        sessions = repo2.get_sessions("project-100")
        assert len(sessions) == 1
        assert sessions[0]["session_id"] == "chat-1"
        cards = repo2.get_cards("project-100", "software-arch")
        assert len(cards) == 2
        assert cards[0]["title"] == "Modular Monolith"
        assert cards[0]["id"] is not None


def test_api_persistence_endpoints():
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = os.path.join(tmpdir, "haiven_data.json")
        repo = DataRepository(file_path=file_path)
        app = FastAPI()
        ApiPersistence(app, repo)
        client = TestClient(app)

        # 1. Initial state
        res = client.get("/api/projects")
        assert res.status_code == 200
        assert res.json()["activeProjectId"] == "default"
        assert len(res.json()["projects"]) == 1

        # 2. Create project
        res = client.post(
            "/api/projects",
            json={
                "id": "project-200",
                "name": "API Project",
                "description": "Created via API",
                "sections": ["ideate", "architecture"],
            },
        )
        assert res.status_code == 200
        assert res.json()["project"]["name"] == "API Project"
        assert res.json()["activeProjectId"] == "project-200"

        # 3. Add pinboard note to project
        res = client.post(
            "/api/projects/project-200/pinboard",
            json={"key": "12345", "value": {"content": "Note 1", "isUserDefined": True}},
        )
        assert res.status_code == 200
        assert "12345" in res.json()

        # 4. Add context to project
        res = client.post(
            "/api/projects/project-200/contexts",
            json={
                "title": "Arch Context",
                "summary": "Microservices",
                "timestamp": 999,
                "isUserDefined": True,
            },
        )
        assert res.status_code == 200
        assert len(res.json()) == 1

        # 5. Get full persistence state
        res = client.get("/api/persistence/state")
        assert res.status_code == 200
        state = res.json()
        assert state["activeProjectId"] == "project-200"
        assert "12345" in state["pinboard"]["project-200"]
        assert state["contexts"]["project-200"][0]["title"] == "Arch Context"

        # 6. Delete context and pinboard note
        res = client.delete("/api/projects/project-200/contexts/999")
        assert res.status_code == 200
        assert res.json()["deleted"] is True

        res = client.delete("/api/projects/project-200/pinboard/12345")
        assert res.status_code == 200
        assert res.json()["deleted"] is True

        # 7. Delete project
        res = client.delete("/api/projects/project-200")
        assert res.status_code == 200
        assert res.json()["activeProjectId"] == "default"


def test_card_repository_methods():
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = os.path.join(tmpdir, "haiven_data.json")
        repo = DataRepository(file_path=file_path)

        # 1. Save cards using active project fallback
        saved = repo.save_cards(
            project_id=None,
            prompt_id="prompt-a",
            cards=[{"title": "Card 1", "summary": "Summary 1"}],
        )
        assert len(saved) == 1
        assert saved[0]["title"] == "Card 1"
        assert saved[0]["id"] is not None

        # 2. Add single card
        updated = repo.add_card(
            project_id=None,
            prompt_id="prompt-a",
            card={"id": "custom-card-2", "title": "Card 2", "summary": "Summary 2"},
        )
        assert len(updated) == 2
        assert any(c["id"] == "custom-card-2" for c in updated)

        # 3. Retrieve all cards for active project vs prompt
        all_cards = repo.get_cards()
        assert "prompt-a" in all_cards
        assert len(all_cards["prompt-a"]) == 2

        prompt_cards = repo.get_cards(prompt_id="prompt-a")
        assert len(prompt_cards) == 2

        # 4. Delete single card
        assert repo.delete_card(None, "prompt-a", "custom-card-2") is True
        assert len(repo.get_cards(prompt_id="prompt-a")) == 1

        # 5. Delete cards for prompt
        assert repo.delete_cards(None, "prompt-a") is True
        assert repo.get_cards(prompt_id="prompt-a") == []


def test_api_cards_endpoints():
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = os.path.join(tmpdir, "haiven_data.json")
        repo = DataRepository(file_path=file_path)
        app = FastAPI()
        ApiPersistence(app, repo)
        client = TestClient(app)

        # 1. Save cards via active project endpoint
        res = client.post(
            "/api/cards",
            json={
                "promptId": "arch-cards",
                "cards": [
                    {"title": "Style A", "summary": "Modular"},
                    {"title": "Style B", "summary": "Serverless"},
                ],
            },
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

        # 2. Get cards via active project endpoint
        res = client.get("/api/cards?promptId=arch-cards")
        assert res.status_code == 200
        cards = res.json()
        assert len(cards) == 2
        assert cards[0]["title"] == "Style A"

        # 3. Add single card via project-scoped endpoint
        res = client.post(
            "/api/projects/default/card",
            json={
                "promptId": "arch-cards",
                "card": {"id": "c-3", "title": "Style C", "summary": "Event-Driven"},
            },
        )
        assert res.status_code == 200
        assert len(res.json()) == 3

        # 4. Delete single card
        res = client.delete("/api/projects/default/cards/c-3?promptId=arch-cards")
        assert res.status_code == 200
        assert res.json()["deleted"] is True

        # 5. Delete cards for prompt
        res = client.delete("/api/projects/default/cards?promptId=arch-cards")
        assert res.status_code == 200
        assert res.json()["deleted"] is True

        # 6. Verify cards included in state sync
        res = client.get("/api/persistence/state")
        assert res.status_code == 200
        assert "cards" in res.json()


def test_chat_repository_methods_and_endpoints():
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = os.path.join(tmpdir, "haiven_data.json")
        repo = DataRepository(file_path=file_path)
        app = FastAPI()
        ApiPersistence(app, repo)
        client = TestClient(app)

        # 1. Save chat via active project endpoint
        res = client.post(
            "/api/chats",
            json={
                "promptId": "user-persona",
                "chatSessionId": "boba-chat-123",
                "messages": [
                    {"id": "m1", "role": "user", "content": "Create a persona"},
                    {"id": "m2", "role": "assistant", "content": "Here is Persona A"},
                ],
                "tokenUsage": {"input_tokens": 15, "output_tokens": 30},
            },
        )
        assert res.status_code == 200
        saved = res.json()
        assert saved["chatSessionId"] == "boba-chat-123"
        assert len(saved["messages"]) == 2
        assert saved["tokenUsage"]["input_tokens"] == 15

        # 2. Retrieve chat by promptId
        res = client.get("/api/chats?promptId=user-persona")
        assert res.status_code == 200
        chat = res.json()
        assert chat["chatSessionId"] == "boba-chat-123"
        assert chat["messages"][1]["content"] == "Here is Persona A"

        # 3. Verify isolation across projects
        repo.add_project({"id": "project-2", "name": "Project 2"})
        res = client.get("/api/projects/project-2/chats?promptId=user-persona")
        assert res.status_code == 200
        assert res.json() == {}

        # 4. Delete chat for prompt
        res = client.delete("/api/projects/default/chats?promptId=user-persona")
        assert res.status_code == 200
        assert res.json()["deleted"] is True
        assert repo.get_chats("default", "user-persona") == {}

        # 5. Verify chats included in state sync
        res = client.get("/api/persistence/state")
        assert res.status_code == 200
        assert "chats" in res.json()


def test_follow_ups_repository_methods_and_endpoints():
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = os.path.join(tmpdir, "haiven_data.json")
        repo = DataRepository(file_path=file_path)
        app = FastAPI()
        ApiPersistence(app, repo)
        client = TestClient(app)

        # 1. Save follow-ups via active project endpoint
        res = client.post(
            "/api/follow-ups",
            json={
                "promptId": "arch-prompt",
                "followUps": {
                    "follow-up-1": "Detailed follow-up output 1",
                    "follow-up-2": "Detailed follow-up output 2",
                },
            },
        )
        assert res.status_code == 200
        saved = res.json()
        assert saved["follow-up-1"] == "Detailed follow-up output 1"
        assert saved["follow-up-2"] == "Detailed follow-up output 2"

        # 2. Retrieve follow-ups by promptId
        res = client.get("/api/follow-ups?promptId=arch-prompt")
        assert res.status_code == 200
        follow_ups = res.json()
        assert follow_ups["follow-up-1"] == "Detailed follow-up output 1"

        # 3. Verify isolation across projects
        repo.add_project({"id": "project-2", "name": "Project 2"})
        res = client.get("/api/projects/project-2/follow-ups?promptId=arch-prompt")
        assert res.status_code == 200
        assert res.json() == {}

        # 4. Delete follow-ups for prompt
        res = client.delete("/api/projects/default/follow-ups?promptId=arch-prompt")
        assert res.status_code == 200
        assert res.json()["deleted"] is True
        assert repo.get_follow_ups("default", "arch-prompt") == {}

        # 5. Verify followUps included in state sync
        res = client.get("/api/persistence/state")
        assert res.status_code == 200
        assert "followUps" in res.json()


def test_sqlite_auto_migrates_legacy_json_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        legacy_json_path = os.path.join(tmpdir, "haiven_data.json")
        legacy_state = {
            "projects": [
                {
                    "id": "default",
                    "name": "Default Project",
                    "description": "Default workspace project",
                    "sections": DEFAULT_PROJECT_SECTIONS,
                    "isDefault": True,
                },
                {
                    "id": "legacy-proj",
                    "name": "Legacy JSON Project",
                    "description": "Migrated from JSON",
                    "sections": ["research"],
                    "isDefault": False,
                },
            ],
            "activeProjectId": "legacy-proj",
            "pinboard": {
                "legacy-proj": {
                    "p1": {"content": "Legacy pin", "isUserDefined": True}
                }
            },
            "contexts": {
                "legacy-proj": [
                    {
                        "title": "Legacy Context",
                        "summary": "From flat file",
                        "timestamp": 17000001,
                        "isUserDefined": True,
                    }
                ]
            },
            "cards": {
                "legacy-proj": {
                    "prompt-1": [{"id": "c1", "title": "Legacy Card"}]
                }
            },
            "chats": {
                "legacy-proj": {
                    "prompt-chat": {
                        "chatSessionId": "legacy-session",
                        "messages": [{"id": "m1", "role": "user", "content": "Hi"}],
                    }
                }
            },
            "followUps": {
                "legacy-proj": {
                    "prompt-1": {"fu-1": "Legacy follow-up markdown"}
                }
            },
        }
        with open(legacy_json_path, "w", encoding="utf-8") as f:
            json.dump(legacy_state, f)

        repo = DataRepository(file_path=legacy_json_path)
        assert repo.db_path.endswith("haiven_data.db")
        assert os.path.exists(repo.db_path)
        assert repo.get_active_project_id() == "legacy-proj"
        assert repo.get_pinboard("legacy-proj")["p1"]["content"] == "Legacy pin"
        assert repo.get_contexts("legacy-proj")[0]["title"] == "Legacy Context"
        assert repo.get_cards("legacy-proj", "prompt-1")[0]["title"] == "Legacy Card"
        assert (
            repo.get_chats("legacy-proj", "prompt-chat")["chatSessionId"]
            == "legacy-session"
        )
        assert (
            repo.get_follow_ups("legacy-proj", "prompt-1")["fu-1"]
            == "Legacy follow-up markdown"
        )


def test_common_interface_with_json_and_sqlite_implementations():
    with tempfile.TemporaryDirectory() as tmpdir:
        json_path = os.path.join(tmpdir, "json_store.json")
        sqlite_path = os.path.join(tmpdir, "sqlite_store.db")

        json_repo = DataRepository(file_path=json_path, repo_type="json")
        sqlite_repo = DataRepository(file_path=sqlite_path, repo_type="sqlite")

        assert isinstance(json_repo.repository, JsonDataRepository)
        assert isinstance(sqlite_repo.repository, SqliteDataRepository)
        assert isinstance(json_repo.repository, DataRepositoryInterface)
        assert isinstance(sqlite_repo.repository, DataRepositoryInterface)

        for repo in (json_repo, sqlite_repo):
            repo.add_project({"id": "proj-x", "name": "Project X"})
            repo.save_cards(
                "proj-x", "prompt-x", [{"id": "c-1", "title": "Card X"}]
            )
            repo.save_chat(
                "proj-x",
                "prompt-x",
                {
                    "chatSessionId": "sess-x",
                    "messages": [{"id": "1", "role": "user", "content": "Hi"}],
                },
            )
            repo.save_follow_ups("proj-x", "prompt-x", {"f-1": "Follow-up X"})

            assert repo.get_active_project_id() == "proj-x"
            assert repo.get_cards("proj-x", "prompt-x")[0]["title"] == "Card X"
            assert (
                repo.get_chats("proj-x", "prompt-x")["chatSessionId"]
                == "sess-x"
            )
            assert repo.get_follow_ups("proj-x", "prompt-x")["f-1"] == "Follow-up X"





