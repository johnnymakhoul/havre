# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from persistence.data_repository import DataRepository


class CreateProjectRequest(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    sections: Optional[List[str]] = None
    timestamp: Optional[int] = None


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sections: Optional[List[str]] = None


class ActiveProjectRequest(BaseModel):
    projectId: str


class PinboardItemRequest(BaseModel):
    key: str
    value: Any


class ContextItemRequest(BaseModel):
    title: str
    summary: str
    timestamp: Optional[int] = None
    isUserDefined: Optional[bool] = True


class StateSyncRequest(BaseModel):
    projects: Optional[List[Dict[str, Any]]] = None
    activeProjectId: Optional[str] = None
    pinboard: Optional[Dict[str, Any]] = None
    contexts: Optional[Dict[str, Any]] = None
    cards: Optional[Dict[str, Any]] = None
    chats: Optional[Dict[str, Any]] = None


class SaveCardsRequest(BaseModel):
    promptId: Optional[str] = None
    prompt_id: Optional[str] = None
    cards: List[Dict[str, Any]] = []

    def get_prompt_id(self) -> str:
        return self.promptId or self.prompt_id or "default"


class AddCardRequest(BaseModel):
    promptId: Optional[str] = None
    prompt_id: Optional[str] = None
    card: Dict[str, Any]

    def get_prompt_id(self) -> str:
        return self.promptId or self.prompt_id or "default"


class SaveChatRequest(BaseModel):
    promptId: Optional[str] = None
    prompt_id: Optional[str] = None
    chatSessionId: Optional[str] = None
    messages: List[Dict[str, Any]] = []
    tokenUsage: Optional[Dict[str, Any]] = None
    updatedAt: Optional[int] = None

    def get_prompt_id(self) -> str:
        return self.promptId or self.prompt_id or "default"

    def to_chat_data(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "chatSessionId": self.chatSessionId,
            "messages": self.messages,
            "tokenUsage": self.tokenUsage or {"input_tokens": 0, "output_tokens": 0},
        }
        if self.updatedAt is not None:
            data["updatedAt"] = self.updatedAt
        return data


class ApiPersistence:
    def __init__(self, app: FastAPI, data_repository: DataRepository):
        self.app = app
        self.data_repository = data_repository
        self.register_endpoints()

    def register_endpoints(self):
        @self.app.get("/api/persistence/state")
        def get_persistence_state():
            return self.data_repository.get_state()

        @self.app.put("/api/persistence/state")
        def put_persistence_state(request: StateSyncRequest):
            payload = {k: v for k, v in request.model_dump().items() if v is not None}
            return self.data_repository.set_state(payload)

        @self.app.get("/api/projects")
        def get_projects():
            return {
                "projects": self.data_repository.get_projects(),
                "activeProjectId": self.data_repository.get_active_project_id(),
            }

        @self.app.post("/api/projects")
        def create_project(request: CreateProjectRequest):
            if not request.name or not request.name.strip():
                raise HTTPException(status_code=400, detail="Project name is required")
            project = self.data_repository.add_project(request.model_dump())
            return {
                "project": project,
                "activeProjectId": self.data_repository.get_active_project_id(),
            }

        @self.app.put("/api/projects/active")
        def set_active_project(request: ActiveProjectRequest):
            active_id = self.data_repository.set_active_project_id(request.projectId)
            return {"activeProjectId": active_id}

        @self.app.put("/api/projects/{project_id}")
        def update_project(project_id: str, request: UpdateProjectRequest):
            updates = {k: v for k, v in request.model_dump().items() if v is not None}
            updated = self.data_repository.update_project(project_id, updates)
            if not updated:
                raise HTTPException(status_code=404, detail="Project not found")
            return {"project": updated}

        @self.app.delete("/api/projects/{project_id}")
        def delete_project(project_id: str):
            deleted = self.data_repository.delete_project(project_id)
            if not deleted:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete default or non-existent project",
                )
            return {
                "deleted": True,
                "activeProjectId": self.data_repository.get_active_project_id(),
            }

        @self.app.get("/api/projects/{project_id}/pinboard")
        def get_project_pinboard(project_id: str):
            return self.data_repository.get_pinboard(project_id)

        @self.app.post("/api/projects/{project_id}/pinboard")
        def add_project_pinboard_item(project_id: str, request: PinboardItemRequest):
            return self.data_repository.save_pinboard_item(
                project_id, request.key, request.value
            )

        @self.app.delete("/api/projects/{project_id}/pinboard/{timestamp}")
        def delete_project_pinboard_item(project_id: str, timestamp: str):
            deleted = self.data_repository.delete_pinboard_item(project_id, timestamp)
            return {"deleted": deleted}

        @self.app.get("/api/projects/{project_id}/contexts")
        def get_project_contexts(project_id: str):
            return self.data_repository.get_contexts(project_id)

        @self.app.post("/api/projects/{project_id}/contexts")
        def add_project_context(project_id: str, request: ContextItemRequest):
            return self.data_repository.save_context(
                project_id, request.model_dump()
            )

        @self.app.delete("/api/projects/{project_id}/contexts/{timestamp}")
        def delete_project_context(project_id: str, timestamp: str):
            deleted = self.data_repository.delete_context(project_id, timestamp)
            return {"deleted": deleted}

        @self.app.get("/api/projects/{project_id}/sessions")
        def get_project_sessions(project_id: str):
            return self.data_repository.get_sessions(project_id)

        @self.app.get("/api/sessions/{session_id}")
        def get_session_by_id(session_id: str):
            session = self.data_repository.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            return session

        @self.app.get("/api/projects/{project_id}/cards")
        def get_project_cards(
            project_id: str,
            prompt_id: Optional[str] = None,
            promptId: Optional[str] = None,
        ):
            resolved_prompt = prompt_id or promptId
            return self.data_repository.get_cards(
                project_id=project_id, prompt_id=resolved_prompt
            )

        @self.app.post("/api/projects/{project_id}/cards")
        def save_project_cards(project_id: str, request: SaveCardsRequest):
            return self.data_repository.save_cards(
                project_id=project_id,
                prompt_id=request.get_prompt_id(),
                cards=request.cards,
            )

        @self.app.post("/api/projects/{project_id}/card")
        def add_project_card(project_id: str, request: AddCardRequest):
            return self.data_repository.add_card(
                project_id=project_id,
                prompt_id=request.get_prompt_id(),
                card=request.card,
            )

        @self.app.delete("/api/projects/{project_id}/cards")
        def delete_project_cards(
            project_id: str,
            prompt_id: Optional[str] = None,
            promptId: Optional[str] = None,
        ):
            resolved_prompt = prompt_id or promptId
            deleted = self.data_repository.delete_cards(
                project_id=project_id, prompt_id=resolved_prompt
            )
            return {"deleted": deleted}

        @self.app.delete("/api/projects/{project_id}/cards/{card_id}")
        def delete_project_card(
            project_id: str,
            card_id: str,
            prompt_id: Optional[str] = None,
            promptId: Optional[str] = None,
        ):
            resolved_prompt = prompt_id or promptId or "default"
            deleted = self.data_repository.delete_card(
                project_id=project_id, prompt_id=resolved_prompt, card_id=card_id
            )
            return {"deleted": deleted}

        @self.app.get("/api/cards")
        def get_active_project_cards(
            prompt_id: Optional[str] = None,
            promptId: Optional[str] = None,
        ):
            resolved_prompt = prompt_id or promptId
            return self.data_repository.get_cards(
                project_id=self.data_repository.get_active_project_id(),
                prompt_id=resolved_prompt,
            )

        @self.app.post("/api/cards")
        def save_active_project_cards(request: SaveCardsRequest):
            return self.data_repository.save_cards(
                project_id=self.data_repository.get_active_project_id(),
                prompt_id=request.get_prompt_id(),
                cards=request.cards,
            )

        @self.app.delete("/api/cards")
        def delete_active_project_cards(
            prompt_id: Optional[str] = None,
            promptId: Optional[str] = None,
        ):
            resolved_prompt = prompt_id or promptId
            deleted = self.data_repository.delete_cards(
                project_id=self.data_repository.get_active_project_id(),
                prompt_id=resolved_prompt,
            )
            return {"deleted": deleted}

        @self.app.get("/api/projects/{project_id}/chats")
        def get_project_chats(
            project_id: str,
            prompt_id: Optional[str] = None,
            promptId: Optional[str] = None,
        ):
            resolved_prompt = prompt_id or promptId
            return self.data_repository.get_chats(
                project_id=project_id, prompt_id=resolved_prompt
            )

        @self.app.post("/api/projects/{project_id}/chats")
        def save_project_chat(project_id: str, request: SaveChatRequest):
            return self.data_repository.save_chat(
                project_id=project_id,
                prompt_id=request.get_prompt_id(),
                chat_data=request.to_chat_data(),
            )

        @self.app.delete("/api/projects/{project_id}/chats")
        def delete_project_chats(
            project_id: str,
            prompt_id: Optional[str] = None,
            promptId: Optional[str] = None,
        ):
            resolved_prompt = prompt_id or promptId
            deleted = self.data_repository.delete_chats(
                project_id=project_id, prompt_id=resolved_prompt
            )
            return {"deleted": deleted}

        @self.app.get("/api/chats")
        def get_active_project_chats(
            prompt_id: Optional[str] = None,
            promptId: Optional[str] = None,
        ):
            resolved_prompt = prompt_id or promptId
            return self.data_repository.get_chats(
                project_id=self.data_repository.get_active_project_id(),
                prompt_id=resolved_prompt,
            )

        @self.app.post("/api/chats")
        def save_active_project_chat(request: SaveChatRequest):
            return self.data_repository.save_chat(
                project_id=self.data_repository.get_active_project_id(),
                prompt_id=request.get_prompt_id(),
                chat_data=request.to_chat_data(),
            )

        @self.app.delete("/api/chats")
        def delete_active_project_chats(
            prompt_id: Optional[str] = None,
            promptId: Optional[str] = None,
        ):
            resolved_prompt = prompt_id or promptId
            deleted = self.data_repository.delete_chats(
                project_id=self.data_repository.get_active_project_id(),
                prompt_id=resolved_prompt,
            )
            return {"deleted": deleted}
