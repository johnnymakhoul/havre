# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import os
from typing import Any, Dict, List, Optional

from persistence.base_data_repository import (
    DEFAULT_PROJECT,
    DEFAULT_PROJECT_SECTIONS,
    DataRepositoryInterface,
)
from persistence.json_data_repository import JsonDataRepository
from persistence.sqlite_data_repository import SqliteDataRepository


class DataRepository(DataRepositoryInterface):
    """
    Facade / context repository that implements DataRepositoryInterface and
    delegates to a concrete implementation (SqliteDataRepository or JsonDataRepository).
    """

    def __init__(
        self,
        file_path: Optional[str] = None,
        repo_type: Optional[str] = None,
        repository: Optional[DataRepositoryInterface] = None,
    ):
        if repository is not None:
            self.repository: DataRepositoryInterface = repository
        else:
            resolved_type = (
                repo_type
                or os.getenv("HAIVEN_DATA_REPO_TYPE")
                or "sqlite"
            ).strip().lower()

            if resolved_type in ("json", "file"):
                self.repository = JsonDataRepository(file_path=file_path)
            elif resolved_type in ("sqlite", "db"):
                self.repository = SqliteDataRepository(file_path=file_path)
            else:
                raise ValueError(
                    f"Unsupported data repository type '{resolved_type}'. Expected 'sqlite' or 'json'."
                )

    @property
    def file_path(self) -> str:
        return getattr(self.repository, "file_path", "")

    @property
    def db_path(self) -> Optional[str]:
        return getattr(self.repository, "db_path", None)

    def get_state(self) -> Dict[str, Any]:
        return self.repository.get_state()

    def set_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        return self.repository.set_state(state)

    def get_projects(self) -> List[Dict[str, Any]]:
        return self.repository.get_projects()

    def get_active_project_id(self) -> str:
        return self.repository.get_active_project_id()

    def set_active_project_id(self, project_id: str) -> str:
        return self.repository.set_active_project_id(project_id)

    def add_project(self, project_data: Dict[str, Any]) -> Dict[str, Any]:
        return self.repository.add_project(project_data)

    def update_project(
        self, project_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        return self.repository.update_project(project_id, updates)

    def delete_project(self, project_id: str) -> bool:
        return self.repository.delete_project(project_id)

    def get_pinboard(self, project_id: str) -> Dict[str, Any]:
        return self.repository.get_pinboard(project_id)

    def save_pinboard_item(
        self, project_id: str, key: str, value: Any
    ) -> Dict[str, Any]:
        return self.repository.save_pinboard_item(project_id, key, value)

    def delete_pinboard_item(self, project_id: str, key: str) -> bool:
        return self.repository.delete_pinboard_item(project_id, key)

    def get_contexts(self, project_id: str) -> List[Dict[str, Any]]:
        return self.repository.get_contexts(project_id)

    def save_context(
        self, project_id: str, context_item: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        return self.repository.save_context(project_id, context_item)

    def delete_context(self, project_id: str, timestamp: Any) -> bool:
        return self.repository.delete_context(project_id, timestamp)

    def save_session(
        self,
        session_id: str,
        project_id: str,
        category: str,
        messages: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        return self.repository.save_session(
            session_id, project_id, category, messages
        )

    def get_sessions(
        self, project_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        return self.repository.get_sessions(project_id)

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self.repository.get_session(session_id)

    def delete_session(self, session_id: str) -> bool:
        return self.repository.delete_session(session_id)

    def get_cards(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        return self.repository.get_cards(project_id, prompt_id)

    def save_cards(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        cards: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        return self.repository.save_cards(project_id, prompt_id, cards)

    def add_card(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        card: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        return self.repository.add_card(project_id, prompt_id, card)

    def delete_cards(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        return self.repository.delete_cards(project_id, prompt_id)

    def delete_card(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        card_id: str,
    ) -> bool:
        return self.repository.delete_card(project_id, prompt_id, card_id)

    def get_chats(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        return self.repository.get_chats(project_id, prompt_id)

    def save_chat(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        chat_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        return self.repository.save_chat(project_id, prompt_id, chat_data)

    def delete_chats(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        return self.repository.delete_chats(project_id, prompt_id)

    def get_follow_ups(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        return self.repository.get_follow_ups(project_id, prompt_id)

    def save_follow_ups(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        follow_ups: Dict[str, Any],
    ) -> Dict[str, Any]:
        return self.repository.save_follow_ups(
            project_id, prompt_id, follow_ups
        )

    def delete_follow_ups(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        return self.repository.delete_follow_ups(project_id, prompt_id)

    def get_tasks(
        self,
        project_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        return self.repository.get_tasks(project_id)

    def save_tasks(
        self,
        project_id: Optional[str],
        tasks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        return self.repository.save_tasks(project_id, tasks)

    def delete_tasks(
        self,
        project_id: Optional[str] = None,
    ) -> bool:
        return self.repository.delete_tasks(project_id)



__all__ = [
    "DEFAULT_PROJECT",
    "DEFAULT_PROJECT_SECTIONS",
    "DataRepositoryInterface",
    "JsonDataRepository",
    "SqliteDataRepository",
    "DataRepository",
]
