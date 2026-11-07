# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import asyncio
import json
import queue
import threading
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from logger import HaivenLogger

from llms.code_development_service import CodeDevelopmentService
from config_service import ConfigService


class WbsTaskExecutionRequest(BaseModel):
    title: str
    wbs_code: Optional[str] = ""
    task_id: Optional[str] = None
    summary: Optional[str] = ""
    pbs_deliverable_ref: Optional[str] = ""
    pdp_stage_ref: Optional[str] = ""
    dependencies: Optional[List[str]] = []
    project_id: Optional[str] = None
    github_config: Optional[Dict[str, Any]] = None
    runtime: Optional[str] = "node"
    test_command: Optional[str] = None
    timeout_seconds: Optional[int] = 3600
    agent_timeout_seconds: Optional[int] = 900
    max_test_retries: Optional[int] = 2


class WbsWaveExecutionRequest(BaseModel):
    wave_name: str
    project_id: Optional[str] = None
    tasks: Optional[List[Dict[str, Any]]] = None
    max_workers: Optional[int] = 3


class WbsInstructionRequest(BaseModel):
    sandbox_id: str
    prompt: str


class ApiDevelopment:
    def __init__(
        self,
        app: FastAPI,
        config_service: Optional[ConfigService] = None,
        dev_service: Optional[CodeDevelopmentService] = None,
        data_repository: Optional[Any] = None,
    ):
        self.config_service = config_service
        self.data_repository = data_repository
        self.dev_service = dev_service or CodeDevelopmentService(
            config_service=config_service, data_repository=data_repository
        )

        @app.get("/api/development/status")
        async def get_development_status(request: Request):
            """Check if sandbox strategy and Gemini are configured for WBS code development."""
            sandbox_provider = self.dev_service.get_sandbox_provider()
            return JSONResponse(
                {
                    "configured": self.dev_service.is_configured(),
                    "sandbox_configured": self.dev_service.is_sandbox_configured(),
                    "gemini_configured": self.dev_service.is_gemini_configured(),
                    "sandbox_provider": sandbox_provider,
                    "supported_runtimes": ["node", "python", "typescript", "react"],
                    "active_sandboxes": len(self.dev_service.active_sandboxes),
                }
            )

        @app.post("/api/development/execute-task")
        async def execute_wbs_task(request: Request, body: WbsTaskExecutionRequest):
            """Execute a single WBS task inside a sandbox microVM, run tests, and open a PR."""
            if request.query_params.get("stream") == "true":
                log_queue = queue.Queue()

                def run_in_thread():
                    try:
                        def on_log(text: str):
                            log_queue.put({"type": "log", "message": text})

                        res = self.dev_service.execute_task(
                            wbs_code=body.wbs_code or "",
                            title=body.title,
                            task_id=body.task_id,
                            summary=body.summary or "",
                            pbs_ref=body.pbs_deliverable_ref or "",
                            pdp_ref=body.pdp_stage_ref or "",
                            dependencies=body.dependencies or [],
                            project_id=body.project_id,
                            github_config=body.github_config,
                            runtime=body.runtime or "node",
                            test_command=body.test_command,
                            timeout_seconds=body.timeout_seconds or 3600,
                            agent_timeout_seconds=body.agent_timeout_seconds or 900,
                            max_test_retries=body.max_test_retries or 2,
                            on_log=on_log,
                        )
                        log_queue.put({"type": "result", "data": res})
                    except Exception as exc:
                        log_queue.put({"type": "error", "message": str(exc)})
                    finally:
                        log_queue.put(None)

                threading.Thread(target=run_in_thread, daemon=True).start()

                async def event_generator():
                    while True:
                        try:
                            item = log_queue.get_nowait()
                        except queue.Empty:
                            await asyncio.sleep(0.08)
                            continue

                        if item is None:
                            break

                        yield json.dumps(item) + "\n"

                return StreamingResponse(
                    event_generator(),
                    media_type="application/x-ndjson",
                    headers={
                        "Cache-Control": "no-cache",
                        "X-Accel-Buffering": "no",
                        "Connection": "keep-alive",
                    },
                )

            res = self.dev_service.execute_task(
                wbs_code=body.wbs_code or "",
                title=body.title,
                task_id=body.task_id,
                summary=body.summary or "",
                pbs_ref=body.pbs_deliverable_ref or "",
                pdp_ref=body.pdp_stage_ref or "",
                dependencies=body.dependencies or [],
                project_id=body.project_id,
                github_config=body.github_config,
                runtime=body.runtime or "node",
                test_command=body.test_command,
                timeout_seconds=body.timeout_seconds or 3600,
                agent_timeout_seconds=body.agent_timeout_seconds or 900,
                max_test_retries=body.max_test_retries or 2,
            )
            return JSONResponse(res)

        @app.post("/api/development/execute-wave")
        async def execute_wbs_wave(request: Request, body: WbsWaveExecutionRequest):
            """Execute all unblocked tasks within a wave in parallel up to max_workers."""
            tasks = body.tasks
            if not tasks and self.data_repository:
                target_project = (
                    body.project_id or self.data_repository.get_active_project_id()
                )
                tasks = self.data_repository.get_tasks(project_id=target_project)

            if not tasks:
                return JSONResponse(
                    {
                        "wave": body.wave_name,
                        "total_tasks": 0,
                        "successful_tasks": 0,
                        "results": [],
                        "message": "No tasks found for wave",
                    }
                )

            res = self.dev_service.execute_wave(
                wave_name=body.wave_name,
                tasks=tasks,
                project_id=body.project_id,
                max_workers=body.max_workers or 3,
            )
            return JSONResponse(res)

        @app.post("/api/development/instruction")
        async def send_development_instruction(
            request: Request, body: WbsInstructionRequest
        ):
            """Send follow-up instruction to an active sandbox."""
            if request.query_params.get("stream") == "true":
                log_queue = queue.Queue()

                def run_instruction_thread():
                    try:
                        def on_log(text: str):
                            log_queue.put({"type": "log", "message": text})

                        res = self.dev_service.send_instruction(
                            sandbox_id=body.sandbox_id,
                            prompt=body.prompt,
                            on_log=on_log,
                        )
                        log_queue.put({"type": "result", "data": res})
                    except Exception as exc:
                        log_queue.put({"type": "error", "message": str(exc)})
                    finally:
                        log_queue.put(None)

                threading.Thread(target=run_instruction_thread, daemon=True).start()

                async def instruction_event_generator():
                    while True:
                        try:
                            item = log_queue.get_nowait()
                        except queue.Empty:
                            await asyncio.sleep(0.08)
                            continue

                        if item is None:
                            break

                        yield json.dumps(item) + "\n"

                return StreamingResponse(
                    instruction_event_generator(),
                    media_type="application/x-ndjson",
                    headers={
                        "Cache-Control": "no-cache",
                        "X-Accel-Buffering": "no",
                        "Connection": "keep-alive",
                    },
                )

            res = self.dev_service.send_instruction(
                sandbox_id=body.sandbox_id,
                prompt=body.prompt,
            )
            return JSONResponse(res)

        @app.delete("/api/development/sandbox/{sandbox_id}")
        async def close_sandbox(sandbox_id: str):
            """Close an active development sandbox."""
            if sandbox_id in self.dev_service.active_sandboxes:
                entry = self.dev_service.active_sandboxes.pop(sandbox_id, None)
                try:
                    if entry and hasattr(entry["sandbox"], "close"):
                        entry["sandbox"].close()
                except Exception as ex:
                    HaivenLogger.get().warning(f"Error closing sandbox {sandbox_id}: {ex}")
                return {"closed": True, "sandbox_id": sandbox_id}
            return {"closed": False, "sandbox_id": sandbox_id, "message": "Sandbox not found"}

