# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import copy
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

DEFAULT_PROJECT_SECTIONS = [
    "research",
    "ideate",
    "analysis",
    "coding",
    "testing",
    "architecture",
    "other",
]

DEFAULT_PROJECT = {
    "id": "default",
    "name": "Default Project",
    "description": "Default workspace project",
    "sections": DEFAULT_PROJECT_SECTIONS,
    "isDefault": True,
}


class DataRepositoryInterface(ABC):
    """Common abstract interface for Haiven workspace persistence implementations."""

    def _default_state(self) -> Dict[str, Any]:
        return {
            "projects": [copy.deepcopy(DEFAULT_PROJECT)],
            "activeProjectId": DEFAULT_PROJECT["id"],
            "pinboard": {},
            "contexts": {},
            "sessions": {},
            "cards": {},
            "chats": {},
            "followUps": {},
            "tasks": {},
            "workflows": {},
        }

    def _ensure_default_project(
        self, projects: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        if not isinstance(projects, list) or len(projects) == 0:
            return [copy.deepcopy(DEFAULT_PROJECT)]
        has_default = any(p.get("id") == DEFAULT_PROJECT["id"] for p in projects)
        if not has_default:
            return [copy.deepcopy(DEFAULT_PROJECT)] + projects
        return projects

    @abstractmethod
    def get_state(self) -> Dict[str, Any]:
        pass

    @abstractmethod
    def set_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def get_projects(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_active_project_id(self) -> str:
        pass

    @abstractmethod
    def set_active_project_id(self, project_id: str) -> str:
        pass

    @abstractmethod
    def add_project(self, project_data: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def update_project(
        self, project_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def delete_project(self, project_id: str) -> bool:
        pass

    @abstractmethod
    def get_pinboard(self, project_id: str) -> Dict[str, Any]:
        pass

    @abstractmethod
    def save_pinboard_item(
        self, project_id: str, key: str, value: Any
    ) -> Dict[str, Any]:
        pass

    @abstractmethod
    def delete_pinboard_item(self, project_id: str, key: str) -> bool:
        pass

    @abstractmethod
    def get_contexts(self, project_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def save_context(
        self, project_id: str, context_item: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def delete_context(self, project_id: str, timestamp: Any) -> bool:
        pass

    @abstractmethod
    def save_session(
        self,
        session_id: str,
        project_id: str,
        category: str,
        messages: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        pass

    @abstractmethod
    def get_sessions(
        self, project_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def delete_session(self, session_id: str) -> bool:
        pass

    @abstractmethod
    def get_cards(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        pass

    @abstractmethod
    def save_cards(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        cards: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def add_card(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        card: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def delete_cards(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        pass

    @abstractmethod
    def delete_card(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        card_id: str,
    ) -> bool:
        pass

    @abstractmethod
    def get_chats(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        pass

    @abstractmethod
    def save_chat(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        chat_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        pass

    @abstractmethod
    def delete_chats(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        pass

    @abstractmethod
    def get_follow_ups(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        pass

    @abstractmethod
    def save_follow_ups(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        follow_ups: Dict[str, Any],
    ) -> Dict[str, Any]:
        pass

    @abstractmethod
    def delete_follow_ups(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        pass

    @abstractmethod
    def get_tasks(
        self,
        project_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def save_tasks(
        self,
        project_id: Optional[str],
        tasks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def delete_tasks(
        self,
        project_id: Optional[str] = None,
    ) -> bool:
        pass

    @abstractmethod
    def get_workflow(
        self,
        project_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def save_workflow(
        self,
        project_id: Optional[str],
        workflow: Dict[str, Any],
    ) -> Dict[str, Any]:
        pass

    @abstractmethod
    def delete_workflow(
        self,
        project_id: Optional[str] = None,
    ) -> bool:
        pass


