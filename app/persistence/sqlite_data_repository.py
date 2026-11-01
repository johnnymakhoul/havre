# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import copy
import json
import os
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional

from logger import HaivenLogger
from persistence.base_data_repository import (
    DEFAULT_PROJECT,
    DEFAULT_PROJECT_SECTIONS,
    DataRepositoryInterface,
)


class SqliteDataRepository(DataRepositoryInterface):
    """SQLite-backed implementation of DataRepositoryInterface."""

    def __init__(self, file_path: Optional[str] = None):
        raw_path = (
            file_path
            or os.getenv("HAIVEN_DB_PATH")
            or os.getenv("HAIVEN_DATA_PATH")
            or os.path.join(os.getcwd(), "data", "haiven.db")
        )
        if raw_path != ":memory:" and raw_path.endswith(".json"):
            self.db_path = raw_path[:-5] + ".db"
            self.legacy_json_path: Optional[str] = raw_path
        else:
            self.db_path = raw_path
            self.legacy_json_path = (
                os.path.join(os.path.dirname(raw_path), "haiven_data.json")
                if raw_path != ":memory:"
                else None
            )

        self.file_path = self.db_path
        self._lock = threading.RLock()
        self._memory_conn: Optional[sqlite3.Connection] = None
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        if self.db_path == ":memory:":
            if self._memory_conn is None:
                self._memory_conn = sqlite3.connect(
                    ":memory:", check_same_thread=False
                )
                self._memory_conn.row_factory = sqlite3.Row
            return self._memory_conn

        parent_dir = os.path.dirname(self.db_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        conn = sqlite3.connect(self.db_path, timeout=30.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _close(self, conn: sqlite3.Connection) -> None:
        if self.db_path != ":memory:":
            conn.close()

    def _init_db(self) -> None:
        with self._lock:
            db_existed = (
                self.db_path != ":memory:" and os.path.exists(self.db_path)
            )
            conn = self._connect()
            try:
                with conn:
                    conn.executescript(
                        """
                        CREATE TABLE IF NOT EXISTS app_settings (
                            key TEXT PRIMARY KEY,
                            value TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS projects (
                            seq INTEGER PRIMARY KEY AUTOINCREMENT,
                            id TEXT UNIQUE NOT NULL,
                            project_json TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS pinboard_items (
                            seq INTEGER PRIMARY KEY AUTOINCREMENT,
                            project_id TEXT NOT NULL,
                            item_key TEXT NOT NULL,
                            value_json TEXT NOT NULL,
                            UNIQUE(project_id, item_key)
                        );
                        CREATE INDEX IF NOT EXISTS idx_pinboard_project
                            ON pinboard_items(project_id);

                        CREATE TABLE IF NOT EXISTS contexts (
                            seq INTEGER PRIMARY KEY AUTOINCREMENT,
                            project_id TEXT NOT NULL,
                            timestamp_key TEXT NOT NULL,
                            item_json TEXT NOT NULL,
                            UNIQUE(project_id, timestamp_key)
                        );
                        CREATE INDEX IF NOT EXISTS idx_contexts_project
                            ON contexts(project_id);

                        CREATE TABLE IF NOT EXISTS sessions (
                            session_id TEXT PRIMARY KEY,
                            project_id TEXT NOT NULL,
                            category TEXT NOT NULL,
                            created_at REAL NOT NULL,
                            updated_at REAL NOT NULL,
                            messages_json TEXT NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS idx_sessions_project
                            ON sessions(project_id);

                        CREATE TABLE IF NOT EXISTS prompt_cards (
                            project_id TEXT NOT NULL,
                            prompt_id TEXT NOT NULL,
                            cards_json TEXT NOT NULL,
                            updated_at INTEGER NOT NULL,
                            PRIMARY KEY (project_id, prompt_id)
                        );

                        CREATE TABLE IF NOT EXISTS prompt_chats (
                            project_id TEXT NOT NULL,
                            prompt_id TEXT NOT NULL,
                            chat_json TEXT NOT NULL,
                            updated_at INTEGER NOT NULL,
                            PRIMARY KEY (project_id, prompt_id)
                        );

                        CREATE TABLE IF NOT EXISTS prompt_follow_ups (
                            project_id TEXT NOT NULL,
                            prompt_id TEXT NOT NULL,
                            follow_ups_json TEXT NOT NULL,
                            updated_at INTEGER NOT NULL,
                            PRIMARY KEY (project_id, prompt_id)
                        );

                        CREATE TABLE IF NOT EXISTS project_tasks (
                            project_id TEXT NOT NULL,
                            tasks_json TEXT NOT NULL,
                            updated_at INTEGER NOT NULL,
                            PRIMARY KEY (project_id)
                        );
                        """
                    )

                row = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM projects"
                ).fetchone()
                is_empty = row is None or row["cnt"] == 0
            finally:
                self._close(conn)

            if is_empty:
                migrated = False
                if (
                    not db_existed
                    and self.legacy_json_path
                    and os.path.exists(self.legacy_json_path)
                ):
                    migrated = self._migrate_from_json_file(self.legacy_json_path)

                if not migrated:
                    self._seed_defaults()

    def _migrate_from_json_file(self, json_path: str) -> bool:
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                self.set_state(loaded)
                return True
        except Exception as e:
            logger = HaivenLogger.get()
            if logger:
                logger.error(
                    f"Failed to migrate legacy JSON data from {json_path}: {e}"
                )
        return False

    def _seed_defaults(self) -> None:
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    "INSERT OR IGNORE INTO projects (id, project_json) VALUES (?, ?)",
                    (DEFAULT_PROJECT["id"], json.dumps(DEFAULT_PROJECT)),
                )
                conn.execute(
                    "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('activeProjectId', ?)",
                    (DEFAULT_PROJECT["id"],),
                )
        finally:
            self._close(conn)

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            conn = self._connect()
            try:
                projects = [
                    json.loads(r["project_json"])
                    for r in conn.execute(
                        "SELECT project_json FROM projects ORDER BY seq ASC"
                    ).fetchall()
                ]
                projects = self._ensure_default_project(projects)

                active_row = conn.execute(
                    "SELECT value FROM app_settings WHERE key = 'activeProjectId'"
                ).fetchone()
                active_id = (
                    active_row["value"] if active_row else DEFAULT_PROJECT["id"]
                )
                if not any(p.get("id") == active_id for p in projects):
                    active_id = DEFAULT_PROJECT["id"]

                pinboard: Dict[str, Dict[str, Any]] = {}
                for r in conn.execute(
                    "SELECT project_id, item_key, value_json FROM pinboard_items ORDER BY seq DESC"
                ).fetchall():
                    proj_pins = pinboard.setdefault(r["project_id"], {})
                    proj_pins[r["item_key"]] = json.loads(r["value_json"])

                contexts: Dict[str, List[Dict[str, Any]]] = {}
                for r in conn.execute(
                    "SELECT project_id, item_json FROM contexts ORDER BY seq ASC"
                ).fetchall():
                    proj_ctxs = contexts.setdefault(r["project_id"], [])
                    proj_ctxs.append(json.loads(r["item_json"]))

                sessions: Dict[str, Dict[str, Any]] = {}
                for r in conn.execute("SELECT * FROM sessions").fetchall():
                    sessions[r["session_id"]] = {
                        "session_id": r["session_id"],
                        "project_id": r["project_id"],
                        "category": r["category"],
                        "created_at": r["created_at"],
                        "updated_at": r["updated_at"],
                        "messages": json.loads(r["messages_json"]),
                    }

                cards: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
                for r in conn.execute(
                    "SELECT project_id, prompt_id, cards_json FROM prompt_cards"
                ).fetchall():
                    proj_cards = cards.setdefault(r["project_id"], {})
                    proj_cards[r["prompt_id"]] = json.loads(r["cards_json"])

                chats: Dict[str, Dict[str, Dict[str, Any]]] = {}
                for r in conn.execute(
                    "SELECT project_id, prompt_id, chat_json FROM prompt_chats"
                ).fetchall():
                    proj_chats = chats.setdefault(r["project_id"], {})
                    proj_chats[r["prompt_id"]] = json.loads(r["chat_json"])

                follow_ups: Dict[str, Dict[str, Dict[str, Any]]] = {}
                for r in conn.execute(
                    "SELECT project_id, prompt_id, follow_ups_json FROM prompt_follow_ups"
                ).fetchall():
                    proj_fu = follow_ups.setdefault(r["project_id"], {})
                    proj_fu[r["prompt_id"]] = json.loads(r["follow_ups_json"])

                return {
                    "projects": projects,
                    "activeProjectId": active_id,
                    "pinboard": pinboard,
                    "contexts": contexts,
                    "sessions": sessions,
                    "cards": cards,
                    "chats": chats,
                    "followUps": follow_ups,
                }
            finally:
                self._close(conn)

    def set_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            projects = self._ensure_default_project(state.get("projects", []))
            active_id = state.get("activeProjectId", DEFAULT_PROJECT["id"])
            if not any(p.get("id") == active_id for p in projects):
                active_id = DEFAULT_PROJECT["id"]

            conn = self._connect()
            try:
                with conn:
                    conn.execute("DELETE FROM projects")
                    for p in projects:
                        conn.execute(
                            "INSERT INTO projects (id, project_json) VALUES (?, ?)",
                            (p["id"], json.dumps(p)),
                        )

                    conn.execute(
                        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('activeProjectId', ?)",
                        (active_id,),
                    )

                    if "pinboard" in state and isinstance(state["pinboard"], dict):
                        conn.execute("DELETE FROM pinboard_items")
                        for proj_id, items in state["pinboard"].items():
                            if isinstance(items, dict):
                                for k, v in reversed(list(items.items())):
                                    conn.execute(
                                        "INSERT INTO pinboard_items (project_id, item_key, value_json) VALUES (?, ?, ?)",
                                        (proj_id, str(k), json.dumps(v)),
                                    )

                    if "contexts" in state and isinstance(state["contexts"], dict):
                        conn.execute("DELETE FROM contexts")
                        for proj_id, ctx_list in state["contexts"].items():
                            if isinstance(ctx_list, list):
                                for idx, c in enumerate(ctx_list):
                                    ts_key = str(c.get("timestamp", idx))
                                    conn.execute(
                                        "INSERT OR REPLACE INTO contexts (project_id, timestamp_key, item_json) VALUES (?, ?, ?)",
                                        (proj_id, ts_key, json.dumps(c)),
                                    )

                    if "sessions" in state and isinstance(state["sessions"], dict):
                        conn.execute("DELETE FROM sessions")
                        for sid, sdata in state["sessions"].items():
                            if isinstance(sdata, dict):
                                now = time.time()
                                conn.execute(
                                    """
                                    INSERT INTO sessions (session_id, project_id, category, created_at, updated_at, messages_json)
                                    VALUES (?, ?, ?, ?, ?, ?)
                                    """,
                                    (
                                        sid,
                                        sdata.get("project_id") or active_id,
                                        sdata.get("category") or "unknown",
                                        sdata.get("created_at", now),
                                        sdata.get("updated_at", now),
                                        json.dumps(sdata.get("messages", [])),
                                    ),
                                )

                    if "cards" in state and isinstance(state["cards"], dict):
                        conn.execute("DELETE FROM prompt_cards")
                        now_ms = int(time.time() * 1000)
                        for proj_id, prompts_map in state["cards"].items():
                            if isinstance(prompts_map, dict):
                                for prompt_id, card_list in prompts_map.items():
                                    conn.execute(
                                        "INSERT INTO prompt_cards (project_id, prompt_id, cards_json, updated_at) VALUES (?, ?, ?, ?)",
                                        (
                                            proj_id,
                                            prompt_id,
                                            json.dumps(card_list),
                                            now_ms,
                                        ),
                                    )

                    if "chats" in state and isinstance(state["chats"], dict):
                        conn.execute("DELETE FROM prompt_chats")
                        now_ms = int(time.time() * 1000)
                        for proj_id, prompts_map in state["chats"].items():
                            if isinstance(prompts_map, dict):
                                for prompt_id, chat_obj in prompts_map.items():
                                    conn.execute(
                                        "INSERT INTO prompt_chats (project_id, prompt_id, chat_json, updated_at) VALUES (?, ?, ?, ?)",
                                        (
                                            proj_id,
                                            prompt_id,
                                            json.dumps(chat_obj),
                                            now_ms,
                                        ),
                                    )

                    if "followUps" in state and isinstance(
                        state["followUps"], dict
                    ):
                        conn.execute("DELETE FROM prompt_follow_ups")
                        now_ms = int(time.time() * 1000)
                        for proj_id, prompts_map in state["followUps"].items():
                            if isinstance(prompts_map, dict):
                                for prompt_id, fu_obj in prompts_map.items():
                                    conn.execute(
                                        "INSERT INTO prompt_follow_ups (project_id, prompt_id, follow_ups_json, updated_at) VALUES (?, ?, ?, ?)",
                                        (
                                            proj_id,
                                            prompt_id,
                                            json.dumps(fu_obj),
                                            now_ms,
                                        ),
                                    )
            finally:
                self._close(conn)

            return self.get_state()

    def get_projects(self) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    "SELECT project_json FROM projects ORDER BY seq ASC"
                ).fetchall()
                projects = [json.loads(r["project_json"]) for r in rows]
                return self._ensure_default_project(projects)
            finally:
                self._close(conn)

    def get_active_project_id(self) -> str:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT value FROM app_settings WHERE key = 'activeProjectId'"
                ).fetchone()
                return row["value"] if row else DEFAULT_PROJECT["id"]
            finally:
                self._close(conn)

    def set_active_project_id(self, project_id: str) -> str:
        with self._lock:
            conn = self._connect()
            try:
                exists = conn.execute(
                    "SELECT 1 FROM projects WHERE id = ?", (project_id,)
                ).fetchone()
                target_id = (
                    project_id if exists else DEFAULT_PROJECT["id"]
                )
                with conn:
                    conn.execute(
                        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('activeProjectId', ?)",
                        (target_id,),
                    )
                return target_id
            finally:
                self._close(conn)

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

            conn = self._connect()
            try:
                with conn:
                    existing = conn.execute(
                        "SELECT seq FROM projects WHERE id = ?", (project_id,)
                    ).fetchone()
                    if existing:
                        conn.execute(
                            "UPDATE projects SET project_json = ? WHERE id = ?",
                            (json.dumps(new_project), project_id),
                        )
                    else:
                        conn.execute(
                            "INSERT INTO projects (id, project_json) VALUES (?, ?)",
                            (project_id, json.dumps(new_project)),
                        )
                    conn.execute(
                        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('activeProjectId', ?)",
                        (project_id,),
                    )
                return copy.deepcopy(new_project)
            finally:
                self._close(conn)

    def update_project(
        self, project_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT project_json FROM projects WHERE id = ?",
                    (project_id,),
                ).fetchone()
                if not row:
                    return None
                project = json.loads(row["project_json"])
                if "name" in updates and str(updates["name"]).strip():
                    project["name"] = str(updates["name"]).strip()
                if "description" in updates:
                    project["description"] = str(updates["description"]).strip()
                if (
                    "sections" in updates
                    and isinstance(updates["sections"], list)
                    and len(updates["sections"]) > 0
                ):
                    project["sections"] = updates["sections"]

                with conn:
                    conn.execute(
                        "UPDATE projects SET project_json = ? WHERE id = ?",
                        (json.dumps(project), project_id),
                    )
                return project
            finally:
                self._close(conn)

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            if not project_id or project_id == DEFAULT_PROJECT["id"]:
                return False
            conn = self._connect()
            try:
                with conn:
                    cursor = conn.execute(
                        "DELETE FROM projects WHERE id = ?", (project_id,)
                    )
                    if cursor.rowcount == 0:
                        return False
                    conn.execute(
                        "DELETE FROM pinboard_items WHERE project_id = ?",
                        (project_id,),
                    )
                    conn.execute(
                        "DELETE FROM contexts WHERE project_id = ?",
                        (project_id,),
                    )
                    conn.execute(
                        "DELETE FROM prompt_cards WHERE project_id = ?",
                        (project_id,),
                    )
                    conn.execute(
                        "DELETE FROM prompt_chats WHERE project_id = ?",
                        (project_id,),
                    )
                    conn.execute(
                        "DELETE FROM prompt_follow_ups WHERE project_id = ?",
                        (project_id,),
                    )
                    active_row = conn.execute(
                        "SELECT value FROM app_settings WHERE key = 'activeProjectId'"
                    ).fetchone()
                    if active_row and active_row["value"] == project_id:
                        conn.execute(
                            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('activeProjectId', ?)",
                            (DEFAULT_PROJECT["id"],),
                        )
                return True
            finally:
                self._close(conn)

    def get_pinboard(self, project_id: str) -> Dict[str, Any]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    "SELECT item_key, value_json FROM pinboard_items WHERE project_id = ? ORDER BY seq DESC",
                    (project_id,),
                ).fetchall()
                return {r["item_key"]: json.loads(r["value_json"]) for r in rows}
            finally:
                self._close(conn)

    def save_pinboard_item(
        self, project_id: str, key: str, value: Any
    ) -> Dict[str, Any]:
        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    conn.execute(
                        "DELETE FROM pinboard_items WHERE project_id = ? AND item_key = ?",
                        (project_id, str(key)),
                    )
                    conn.execute(
                        "INSERT INTO pinboard_items (project_id, item_key, value_json) VALUES (?, ?, ?)",
                        (project_id, str(key), json.dumps(value)),
                    )
            finally:
                self._close(conn)
            return self.get_pinboard(project_id)

    def delete_pinboard_item(self, project_id: str, key: str) -> bool:
        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    cursor = conn.execute(
                        "DELETE FROM pinboard_items WHERE project_id = ? AND item_key = ?",
                        (project_id, str(key)),
                    )
                    return cursor.rowcount > 0
            finally:
                self._close(conn)

    def get_contexts(self, project_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    "SELECT item_json FROM contexts WHERE project_id = ? ORDER BY seq ASC",
                    (project_id,),
                ).fetchall()
                return [json.loads(r["item_json"]) for r in rows]
            finally:
                self._close(conn)

    def save_context(
        self, project_id: str, context_item: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        with self._lock:
            timestamp = context_item.get("timestamp") or int(time.time() * 1000)
            entry = {
                "title": context_item.get("title", ""),
                "summary": context_item.get("summary", ""),
                "timestamp": timestamp,
                "isUserDefined": context_item.get("isUserDefined", True),
            }
            conn = self._connect()
            try:
                with conn:
                    conn.execute(
                        "DELETE FROM contexts WHERE project_id = ? AND timestamp_key = ?",
                        (project_id, str(timestamp)),
                    )
                    conn.execute(
                        "INSERT INTO contexts (project_id, timestamp_key, item_json) VALUES (?, ?, ?)",
                        (project_id, str(timestamp), json.dumps(entry)),
                    )
            finally:
                self._close(conn)
            return self.get_contexts(project_id)

    def delete_context(self, project_id: str, timestamp: Any) -> bool:
        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    cursor = conn.execute(
                        "DELETE FROM contexts WHERE project_id = ? AND timestamp_key = ?",
                        (project_id, str(timestamp)),
                    )
                    return cursor.rowcount > 0
            finally:
                self._close(conn)

    def save_session(
        self,
        session_id: str,
        project_id: str,
        category: str,
        messages: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        with self._lock:
            now = time.time()
            active_id = self.get_active_project_id()
            conn = self._connect()
            try:
                existing = conn.execute(
                    "SELECT project_id, category, created_at FROM sessions WHERE session_id = ?",
                    (session_id,),
                ).fetchone()
                resolved_project = (
                    project_id
                    or (existing["project_id"] if existing else None)
                    or active_id
                )
                resolved_category = (
                    category
                    or (existing["category"] if existing else None)
                    or "unknown"
                )
                created_at = existing["created_at"] if existing else now

                session_record = {
                    "session_id": session_id,
                    "project_id": resolved_project,
                    "category": resolved_category,
                    "created_at": created_at,
                    "updated_at": now,
                    "messages": copy.deepcopy(messages),
                }
                with conn:
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO sessions
                        (session_id, project_id, category, created_at, updated_at, messages_json)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            session_id,
                            resolved_project,
                            resolved_category,
                            created_at,
                            now,
                            json.dumps(messages),
                        ),
                    )
                return session_record
            finally:
                self._close(conn)

    def get_sessions(
        self, project_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                if project_id:
                    rows = conn.execute(
                        "SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC",
                        (project_id,),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM sessions ORDER BY updated_at DESC"
                    ).fetchall()
                return [
                    {
                        "session_id": r["session_id"],
                        "project_id": r["project_id"],
                        "category": r["category"],
                        "created_at": r["created_at"],
                        "updated_at": r["updated_at"],
                        "messages": json.loads(r["messages_json"]),
                    }
                    for r in rows
                ]
            finally:
                self._close(conn)

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                r = conn.execute(
                    "SELECT * FROM sessions WHERE session_id = ?",
                    (session_id,),
                ).fetchone()
                if not r:
                    return None
                return {
                    "session_id": r["session_id"],
                    "project_id": r["project_id"],
                    "category": r["category"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "messages": json.loads(r["messages_json"]),
                }
            finally:
                self._close(conn)

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    cursor = conn.execute(
                        "DELETE FROM sessions WHERE session_id = ?",
                        (session_id,),
                    )
                    return cursor.rowcount > 0
            finally:
                self._close(conn)

    def get_cards(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            conn = self._connect()
            try:
                if prompt_id is not None:
                    row = conn.execute(
                        "SELECT cards_json FROM prompt_cards WHERE project_id = ? AND prompt_id = ?",
                        (target_project, prompt_id),
                    ).fetchone()
                    return json.loads(row["cards_json"]) if row else []
                rows = conn.execute(
                    "SELECT prompt_id, cards_json FROM prompt_cards WHERE project_id = ?",
                    (target_project,),
                ).fetchall()
                return {
                    r["prompt_id"]: json.loads(r["cards_json"]) for r in rows
                }
            finally:
                self._close(conn)

    def save_cards(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        cards: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            now_ms = int(time.time() * 1000)

            processed_cards = []
            for i, card in enumerate(cards):
                card_copy = copy.deepcopy(card)
                if "id" not in card_copy or not card_copy["id"]:
                    card_copy["id"] = f"card-{now_ms}-{i}"
                if "timestamp" not in card_copy:
                    card_copy["timestamp"] = now_ms
                processed_cards.append(card_copy)

            conn = self._connect()
            try:
                with conn:
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO prompt_cards
                        (project_id, prompt_id, cards_json, updated_at)
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            target_project,
                            target_prompt,
                            json.dumps(processed_cards),
                            now_ms,
                        ),
                    )
                return copy.deepcopy(processed_cards)
            finally:
                self._close(conn)

    def add_card(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        card: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            now_ms = int(time.time() * 1000)

            cards = self.get_cards(target_project, target_prompt)
            card_copy = copy.deepcopy(card)
            if "id" not in card_copy or not card_copy["id"]:
                card_copy["id"] = f"card-{now_ms}"
            if "timestamp" not in card_copy:
                card_copy["timestamp"] = now_ms

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

            conn = self._connect()
            try:
                with conn:
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO prompt_cards
                        (project_id, prompt_id, cards_json, updated_at)
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            target_project,
                            target_prompt,
                            json.dumps(cards),
                            now_ms,
                        ),
                    )
                return copy.deepcopy(cards)
            finally:
                self._close(conn)

    def delete_cards(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            conn = self._connect()
            try:
                with conn:
                    if prompt_id is not None:
                        cursor = conn.execute(
                            "DELETE FROM prompt_cards WHERE project_id = ? AND prompt_id = ?",
                            (target_project, prompt_id),
                        )
                    else:
                        cursor = conn.execute(
                            "DELETE FROM prompt_cards WHERE project_id = ?",
                            (target_project,),
                        )
                    return cursor.rowcount > 0
            finally:
                self._close(conn)

    def delete_card(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        card_id: str,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            cards = self.get_cards(target_project, target_prompt)
            updated = [c for c in cards if str(c.get("id")) != str(card_id)]
            if len(updated) != len(cards):
                now_ms = int(time.time() * 1000)
                conn = self._connect()
                try:
                    with conn:
                        conn.execute(
                            """
                            INSERT OR REPLACE INTO prompt_cards
                            (project_id, prompt_id, cards_json, updated_at)
                            VALUES (?, ?, ?, ?)
                            """,
                            (
                                target_project,
                                target_prompt,
                                json.dumps(updated),
                                now_ms,
                            ),
                        )
                finally:
                    self._close(conn)
                return True
            return False

    def get_chats(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            conn = self._connect()
            try:
                if prompt_id is not None:
                    row = conn.execute(
                        "SELECT chat_json FROM prompt_chats WHERE project_id = ? AND prompt_id = ?",
                        (target_project, prompt_id),
                    ).fetchone()
                    return json.loads(row["chat_json"]) if row else {}
                rows = conn.execute(
                    "SELECT prompt_id, chat_json FROM prompt_chats WHERE project_id = ?",
                    (target_project,),
                ).fetchall()
                return {
                    r["prompt_id"]: json.loads(r["chat_json"]) for r in rows
                }
            finally:
                self._close(conn)

    def save_chat(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        chat_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            now_ms = int(time.time() * 1000)

            chat_copy = (
                copy.deepcopy(chat_data) if isinstance(chat_data, dict) else {}
            )
            if "updatedAt" not in chat_copy:
                chat_copy["updatedAt"] = now_ms

            conn = self._connect()
            try:
                with conn:
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO prompt_chats
                        (project_id, prompt_id, chat_json, updated_at)
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            target_project,
                            target_prompt,
                            json.dumps(chat_copy),
                            now_ms,
                        ),
                    )
                return copy.deepcopy(chat_copy)
            finally:
                self._close(conn)

    def delete_chats(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            conn = self._connect()
            try:
                with conn:
                    if prompt_id is not None:
                        cursor = conn.execute(
                            "DELETE FROM prompt_chats WHERE project_id = ? AND prompt_id = ?",
                            (target_project, prompt_id),
                        )
                    else:
                        cursor = conn.execute(
                            "DELETE FROM prompt_chats WHERE project_id = ?",
                            (target_project,),
                        )
                    return cursor.rowcount > 0
            finally:
                self._close(conn)

    def get_follow_ups(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> Any:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            conn = self._connect()
            try:
                if prompt_id is not None:
                    row = conn.execute(
                        "SELECT follow_ups_json FROM prompt_follow_ups WHERE project_id = ? AND prompt_id = ?",
                        (target_project, prompt_id),
                    ).fetchone()
                    return json.loads(row["follow_ups_json"]) if row else {}
                rows = conn.execute(
                    "SELECT prompt_id, follow_ups_json FROM prompt_follow_ups WHERE project_id = ?",
                    (target_project,),
                ).fetchall()
                return {
                    r["prompt_id"]: json.loads(r["follow_ups_json"])
                    for r in rows
                }
            finally:
                self._close(conn)

    def save_follow_ups(
        self,
        project_id: Optional[str],
        prompt_id: Optional[str],
        follow_ups: Dict[str, Any],
    ) -> Dict[str, Any]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            target_prompt = prompt_id or "default"
            now_ms = int(time.time() * 1000)

            follow_ups_copy = (
                copy.deepcopy(follow_ups)
                if isinstance(follow_ups, dict)
                else {}
            )

            conn = self._connect()
            try:
                with conn:
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO prompt_follow_ups
                        (project_id, prompt_id, follow_ups_json, updated_at)
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            target_project,
                            target_prompt,
                            json.dumps(follow_ups_copy),
                            now_ms,
                        ),
                    )
                return copy.deepcopy(follow_ups_copy)
            finally:
                self._close(conn)

    def delete_follow_ups(
        self,
        project_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            conn = self._connect()
            try:
                with conn:
                    if prompt_id is not None:
                        cursor = conn.execute(
                            "DELETE FROM prompt_follow_ups WHERE project_id = ? AND prompt_id = ?",
                            (target_project, prompt_id),
                        )
                    else:
                        cursor = conn.execute(
                            "DELETE FROM prompt_follow_ups WHERE project_id = ?",
                            (target_project,),
                        )
                    return cursor.rowcount > 0
            finally:
                self._close(conn)

    def get_tasks(
        self,
        project_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT tasks_json FROM project_tasks WHERE project_id = ?",
                    (target_project,),
                ).fetchone()
                if row and row["tasks_json"]:
                    return json.loads(row["tasks_json"])
                return []
            finally:
                self._close(conn)

    def save_tasks(
        self,
        project_id: Optional[str],
        tasks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            now_ms = int(time.time() * 1000)

            processed_tasks = []
            for i, task in enumerate(tasks):
                task_copy = copy.deepcopy(task)
                if "id" not in task_copy or not task_copy["id"]:
                    task_copy["id"] = f"task-{now_ms}-{i}"
                if "updatedAt" not in task_copy:
                    task_copy["updatedAt"] = now_ms
                processed_tasks.append(task_copy)

            conn = self._connect()
            try:
                with conn:
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO project_tasks
                        (project_id, tasks_json, updated_at)
                        VALUES (?, ?, ?)
                        """,
                        (
                            target_project,
                            json.dumps(processed_tasks),
                            now_ms,
                        ),
                    )
                return copy.deepcopy(processed_tasks)
            finally:
                self._close(conn)

    def delete_tasks(
        self,
        project_id: Optional[str] = None,
    ) -> bool:
        with self._lock:
            target_project = project_id or self.get_active_project_id()
            conn = self._connect()
            try:
                with conn:
                    cursor = conn.execute(
                        "DELETE FROM project_tasks WHERE project_id = ?",
                        (target_project,),
                    )
                    return cursor.rowcount > 0
            finally:
                self._close(conn)

