# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import copy
import json
import os
import threading
import time
from typing import Any, Dict, List, Optional

from logger import HaivenLogger
from persistence.base_data_repository import (
    DEFAULT_PROJECT,
    DEFAULT_PROJECT_SECTIONS,
    DataRepositoryInterface,
)


class JsonDataRepository(DataRepositoryInterface):
    """JSON flat-file implementation of DataRepositoryInterface."""

    def __init__(self, file_path: Optional[str] = None):
        raw_path = (
            file_path
            or os.getenv("HAIVEN_DATA_PATH")
            or os.path.join(os.getcwd(), "data", "haiven_data.json")
        )
        if raw_path.endswith(".db"):
            raw_path = raw_path[:-3] + ".json"
        self.file_path = raw_path
        self._lock = threading.RLock()
        self._data: Dict[str, Any] = self._default_state()
        self._load()

    def _load(self) -> None:
        with self._lock:
            try:
                if os.path.exists(self.file_path):
                    with open(self.file_path, "r", encoding="utf-8") as f:
                        loaded = json.load(f)
                    if isinstance(loaded, dict):
                        projects = self._ensure_default_project(
                            loaded.get("projects", [])
                        )
                        active_id = loaded.get(
                            "activeProjectId", DEFAULT_PROJECT["id"]
                        )
                        if not any(p.get("id") == active_id for p in projects):
                            active_id = DEFAULT_PROJECT["id"]
                        self._data = {
                            "projects": projects,
                            "activeProjectId": active_id,
                            "pinboard": loaded.get("pinboard", {}) or {},
                            "contexts": loaded.get("contexts", {}) or {},
                            "sessions": loaded.get("sessions", {}) or {},
                            "cards": loaded.get("cards", {}) or {},
                            "chats": loaded.get("chats", {}) or {},
                            "followUps": loaded.get("followUps", {}) or {},
                            "tasks": loaded.get("tasks", {}) or {},
                            "workflows": loaded.get("workflows", {}) or {},
                        }
                else:
                    parent_dir = os.path.dirname(self.file_path)
                    if parent_dir:
                        os.makedirs(parent_dir, exist_ok=True)
                    self._save()
            except Exception as e:
                logger = HaivenLogger.get()
                if logger:
                    logger.error(
                        f"Failed to load persisted data from {self.file_path}: {e}"
                    )
                self._data = self._default_state()

    def _save(self) -> None:
        with self._lock:
            try:
                parent_dir = os.path.dirname(self.file_path)
                if parent_dir:
                    os.makedirs(parent_dir, exist_ok=True)
                tmp_path = f"{self.file_path}.tmp"
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(self._data, f, indent=2)
                os.replace(tmp_path, self.file_path)
            except Exception as e:
                logger = HaivenLogger.get()
                if logger:
                    logger.error(
                        f"Failed to save persisted data to {self.file_path}: {e}"
                    )

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            return copy.deepcopy(self._data)

    def set_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            projects = self._ensure_default_project(state.get("projects", []))
            active_id = state.get("activeProjectId", DEFAULT_PROJECT["id"])
            if not any(p.get("id") == active_id for p in projects):
                active_id = DEFAULT_PROJECT["id"]

            if "pinboard" in state and isinstance(state["pinboard"], dict):
                self._data["pinboard"] = state["pinboard"]
            if "contexts" in state and isinstance(state["contexts"], dict):
                self._data["contexts"] = state["contexts"]
            if "sessions" in state and isinstance(state["sessions"], dict):
                self._data["sessions"] = state["sessions"]
            if "cards" in state and isinstance(state["cards"], dict):
                self._data["cards"] = state["cards"]
            if "chats" in state and isinstance(state["chats"], dict):
                self._data["chats"] = state["chats"]
            if "followUps" in state and isinstance(state["followUps"], dict):
                self._data["followUps"] = state["followUps"]
            if "tasks" in state and isinstance(state["tasks"], dict):
                self._data["tasks"] = state["tasks"]
            if "workflows" in state and isinstance(state["workflows"], dict):
                self._data["workflows"] = state["workflows"]

            self._data["projects"] = projects
            self._data["activeProjectId"] = active_id
            self._save()
            return copy.deepcopy(self._data)

    def get_projects(self) -> List[Dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self._data["projects"])

    def get_active_project_id(self) -> str:
        with self._lock:
            return self._data["activeProjectId"]

    def set_active_project_id(self, project_id: str) -> str:
        with self._lock:
            if any(p.get("id") == project_id for p in self._data["projects"]):
                self._data["activeProjectId"] = project_id
            else:
                self._data["activeProjectId"] = DEFAULT_PROJECT["id"]
            self._save()
            return self._data["activeProjectId"]

    def add_project(self, project_data: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            name = (project_data.get("name") or "").strip()
            if not name:
                raise ValueError("Project name is required")
            timestamp = project_data.get("timestamp") or int(time.time() * 1000)
            project_id = project_data.get("id") or f"project-{timestamp}"
            sections = project_data.get("sections")
            if not isinstance(sections, list) or len(sections) == 0:
                sections = copy.deepcopy(DEFAULT_PROJECT_SECTIONS)

            new_project = {
                "id": project_id,
                "name": name,
                "description": (project_data.get("description") or "").strip(),
                "sections": sections,
                "timestamp": timestamp,
                "isDefault": False,
            }
            existing_idx = next(
                (
                    i
                    for i, p in enumerate(self._data["projects"])
                    if p.get("id") == project_id
                ),
                None,
            )
            if existing_idx is not None:
                self._data["projects"][existing_idx] = new_project
            else:
                self._data["projects"].append(new_project)

            self._data["activeProjectId"] = project_id
            self._save()
            return copy.deepcopy(new_project)

    def update_project(
        self, project_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            for project in self._data["projects"]:
                if project.get("id") == project_id:
                    if "name" in updates and str(updates["name"]).strip():
                        project["name"] = str(updates["name"]).strip()
                    if "description" in updates:
                        project["description"] = str(
                            updates["description"]
                        ).strip()
                    if (
                        "sections" in updates
                        and isinstance(updates["sections"], list)
                        and len(updates["sections"]) > 0
                    ):
                        project["sections"] = updates["sections"]
                    self._save()
                    return copy.deepcopy(project)
            return None

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            if not project_id or project_id == DEFAULT_PROJECT["id"]:
                return False
            before_count = len(self._data["projects"])
            self._data["projects"] = [
                p for p in self._data["projects"] if p.get("id") != project_id
            ]
            if len(self._data["projects"]) == before_count:
                return False
            self._data["pinboard"].pop(project_id, None)
            self._data["contexts"].pop(project_id, None)
            if "cards" in self._data:
                self._data["cards"].pop(project_id, None)
            if "chats" in self._data:
                self._data["chats"].pop(project_id, None)
            if "followUps" in self._data:
                self._data["followUps"].pop(project_id, None)
            if "tasks" in self._data:
                self._data["tasks"].pop(project_id, None)
            if "workflows" in self._data:
                self._data["workflows"].pop(project_id, None)
            if self._data["activeProjectId"] == project_id:
                self._data["activeProjectId"] = DEFAULT_PROJECT["id"]
            self._save()
            return True

    def get_pinboard(self, project_id: str) -> Dict[str, Any]:
        with self._lock:
            return copy.deepcopy(self._data["pinboard"].get(project_id, {}))

    def save_pinboard_item(
        self, project_id: str, key: str, value: Any
    ) -> Dict[str, Any]:
        with self._lock:
            project_pins = self._data["pinboard"].get(project_id, {})
            new_pins = {str(key): value}
            for k, v in project_pins.items():
                if k != str(key):
                    new_pins[k] = v
            self._data["pinboard"][project_id] = new_pins
            self._save()
            return copy.deepcopy(new_pins)

    def delete_pinboard_item(self, project_id: str, key: str) -> bool:
        with self._lock:
            project_pins = self._data["pinboard"].get(project_id, {})
            if str(key) in project_pins:
                del project_pins[str(key)]
                self._data["pinboard"][project_id] = project_pins
                self._save()
                return True
            return False

    def get_contexts(self, project_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self._data["contexts"].get(project_id, []))

    def save_context(
        self, project_id: str, context_item: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        with self._lock:
            project_contexts = self._data["contexts"].get(project_id, [])
            timestamp = context_item.get("timestamp") or int(time.time() * 1000)
            entry = {
                "title": context_item.get("title", ""),
                "summary": context_item.get("summary", ""),
                "timestamp": timestamp,
                "isUserDefined": context_item.get("isUserDefined", True),
            }
            project_contexts = [
                c
                for c in project_contexts
                if str(c.get("timestamp")) != str(timestamp)
            ]
            project_contexts.append(entry)
            self._data["contexts"][project_id] = project_contexts
            self._save()
            return copy.deepcopy(project_contexts)

    def delete_context(self, project_id: str, timestamp: Any) -> bool:
        with self._lock:
            project_contexts = self._data["contexts"].get(project_id, [])
            updated = [
                c
                for c in project_contexts
                if str(c.get("timestamp")) != str(timestamp)
            ]
            if len(updated) != len(project_contexts):
                self._data["contexts"][project_id] = updated
                self._save()
                return True
            return False

    def save_session(
        self,
        session_id: str,
        project_id: str,
        category: str,
        messages: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        with self._lock:
            existing = self._data["sessions"].get(session_id, {})
            now = time.time()
            session_record = {
                "session_id": session_id,
                "project_id": project_id
                or existing.get("project_id")
                or self._data["activeProjectId"],
                "category": category or existing.get("category") or "unknown",
                "created_at": existing.get("created_at", now),
                "updated_at": now,
                "messages": messages,
            }
            self._data["sessions"][session_id] = session_record
            self._save()
            return copy.deepcopy(session_record)

    def get_sessions(
        self, project_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        with self._lock:
            sessions = list(self._data["sessions"].values())
            if project_id:
                sessions = [
                    s for s in sessions if s.get("project_id") == project_id
                ]
            sessions.sort(key=lambda s: s.get("updated_at", 0), reverse=True)
            return copy.deepcopy(sessions)

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            session = self._data["sessions"].get(session_id)
            return copy.deepcopy(session) if session else None

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            if session_id in self._data["sessions"]:
                del self._data["sessions"][session_id]
                self._save()
                return True
            return False

    def get_cards(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            project_cards = self._data.get("cards", {}).get(target_project, {})
            if prompt_id is not None:
                return copy.deepcopy(project_cards.get(prompt_id, []))
            return copy.deepcopy(project_cards)

    def save_cards(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        cards: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            if "cards" not in self._data:
                self._data["cards"] = {}
            project_cards = self._data["cards"].setdefault(target_project, {})

            processed_cards = []
            for i, card in enumerate(cards):
                card_copy = copy.deepcopy(card)
                if "id" not in card_copy or not card_copy["id"]:
                    card_copy["id"] = f"card-{int(time.time() * 1000)}-{i}"
                if "timestamp" not in card_copy:
                    card_copy["timestamp"] = int(time.time() * 1000)
                processed_cards.append(card_copy)

            project_cards[target_prompt] = processed_cards
            self._save()
            return copy.deepcopy(processed_cards)

    def add_card(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        card: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            if "cards" not in self._data:
                self._data["cards"] = {}
            project_cards = self._data["cards"].setdefault(target_project, {})
            cards = project_cards.setdefault(target_prompt, [])

            card_copy = copy.deepcopy(card)
            if "id" not in card_copy or not card_copy["id"]:
                card_copy["id"] = f"card-{int(time.time() * 1000)}"
            if "timestamp" not in card_copy:
                card_copy["timestamp"] = int(time.time() * 1000)

            existing_idx = next(
                (
                    i
                    for i, c in enumerate(cards)
                    if str(c.get("id")) == str(card_copy["id"])
                ),
                None,
            )
            if existing_idx is not None:
                cards[existing_idx] = card_copy
            else:
                cards.append(card_copy)

            self._save()
            return copy.deepcopy(cards)

    def delete_cards(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            if (
                "cards" not in self._data
                or target_project not in self._data["cards"]
            ):
                return False
            if prompt_id is not None:
                if prompt_id in self._data["cards"][target_project]:
                    del self._data["cards"][target_project][prompt_id]
                    self._save()
                    return True
                return False
            del self._data["cards"][target_project]
            self._save()
            return True

    def delete_card(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        card_id: str,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            cards = (
                self._data.get("cards", {})
                .get(target_project, {})
                .get(target_prompt, [])
            )
            updated = [c for c in cards if str(c.get("id")) != str(card_id)]
            if len(updated) != len(cards):
                self._data["cards"][target_project][target_prompt] = updated
                self._save()
                return True
            return False

    def get_chats(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            project_chats = self._data.get("chats", {}).get(target_project, {})
            if prompt_id is not None:
                return copy.deepcopy(project_chats.get(prompt_id, {}))
            return copy.deepcopy(project_chats)

    def save_chat(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        chat_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            if "chats" not in self._data:
                self._data["chats"] = {}
            project_chats = self._data["chats"].setdefault(target_project, {})

            chat_copy = (
                copy.deepcopy(chat_data) if isinstance(chat_data, dict) else {}
            )
            if "updatedAt" not in chat_copy:
                chat_copy["updatedAt"] = int(time.time() * 1000)

            project_chats[target_prompt] = chat_copy
            self._save()
            return copy.deepcopy(chat_copy)

    def delete_chats(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            if (
                "chats" not in self._data
                or target_project not in self._data["chats"]
            ):
                return False
            if prompt_id is not None:
                if prompt_id in self._data["chats"][target_project]:
                    del self._data["chats"][target_project][prompt_id]
                    self._save()
                    return True
                return False
            del self._data["chats"][target_project]
            self._save()
            return True

    def get_follow_ups(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            project_follow_ups = self._data.get("followUps", {}).get(
                target_project, {}
            )
            if prompt_id is not None:
                return copy.deepcopy(project_follow_ups.get(prompt_id, {}))
            return copy.deepcopy(project_follow_ups)

    def save_follow_ups(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        follow_ups: Dict[str, Any],
    ) -> Dict[str, Any]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            if "followUps" not in self._data:
                self._data["followUps"] = {}
            project_follow_ups = self._data["followUps"].setdefault(
                target_project, {}
            )

            follow_ups_copy = (
                copy.deepcopy(follow_ups)
                if isinstance(follow_ups, dict)
                else {}
            )
            project_follow_ups[target_prompt] = follow_ups_copy
            self._save()
            return copy.deepcopy(follow_ups_copy)

    def delete_follow_ups(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            if (
                "followUps" not in self._data
                or target_project not in self._data["followUps"]
            ):
                return False
            if prompt_id is not None:
                if prompt_id in self._data["followUps"][target_project]:
                    del self._data["followUps"][target_project][prompt_id]
                    self._save()
                    return True
                return False
            del self._data["followUps"][target_project]
            self._save()
            return True

    def get_tasks(
        self,
        project_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            project_tasks = self._data.get("tasks", {}).get(target_project, [])
            return copy.deepcopy(project_tasks)

    def save_tasks(
        self,
        project_id: Optional[str],
        tasks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            if "tasks" not in self._data:
                self._data["tasks"] = {}

            now_ms = int(time.time() * 1000)
            processed_tasks = []
            for i, task in enumerate(tasks):
                task_copy = copy.deepcopy(task)
                if "id" not in task_copy or not task_copy["id"]:
                    task_copy["id"] = f"task-{now_ms}-{i}"
                if "updatedAt" not in task_copy:
                    task_copy["updatedAt"] = now_ms
                processed_tasks.append(task_copy)

            self._data["tasks"][target_project] = processed_tasks
            self._save()
            return copy.deepcopy(processed_tasks)

    def delete_tasks(
        self,
        project_id: Optional[str] = None,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            if "tasks" not in self._data or target_project not in self._data["tasks"]:
                return False
            del self._data["tasks"][target_project]
            self._save()
            return True

    def get_workflow(
        self,
        project_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            project_workflow = self._data.get("workflows", {}).get(target_project)
            return (
                copy.deepcopy(project_workflow)
                if project_workflow is not None
                else None
            )

    def save_workflow(
        self,
        project_id: Optional[str],
        workflow: Dict[str, Any],
    ) -> Dict[str, Any]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            if "workflows" not in self._data:
                self._data["workflows"] = {}

            now_ms = int(time.time() * 1000)
            workflow_copy = (
                copy.deepcopy(workflow) if isinstance(workflow, dict) else {}
            )
            workflow_copy["projectId"] = target_project
            workflow_copy["updatedAt"] = now_ms

            self._data["workflows"][target_project] = workflow_copy
            self._save()
            return copy.deepcopy(workflow_copy)

    def delete_workflow(
        self,
        project_id: Optional[str] = None,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            if (
                "workflows" not in self._data
                or target_project not in self._data["workflows"]
            ):
                return False
            del self._data["workflows"][target_project]
            self._save()
            return True


