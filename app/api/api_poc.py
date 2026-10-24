# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import base64
import sys
import threading
import traceback
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from llms.poc_sandbox_service import PocSandboxService
from config_service import ConfigService


class PocExecutionRequest(BaseModel):
    adr_title: str
    adr_content: Optional[str] = ""
    prompt: Optional[str] = None
    runtime: Optional[str] = "node"
    files: Optional[Dict[str, str]] = None
    test_command: Optional[str] = None
    build_command: Optional[str] = None
    deploy_command: Optional[str] = None
    preview_port: Optional[int] = 3000
    timeout_seconds: Optional[int] = 3600
    agent_timeout_seconds: Optional[int] = 900
    keep_alive_for_preview: Optional[bool] = True


class ApiPoc:
    def __init__(
        self,
        app: FastAPI,
        config_service: Optional[ConfigService] = None,
        poc_service: Optional[PocSandboxService] = None,
    ):
        self.config_service = config_service
        self.poc_service = poc_service or PocSandboxService(config_service=config_service)

        @app.get("/api/debug/threads")
        async def get_thread_dump(request: Request):
            """Return full thread dump of all active threads and their stack frames."""
            lines = []
            for thread_id, frame in sys._current_frames().items():
                thread_obj = threading._active.get(thread_id)
                name = thread_obj.name if thread_obj else f"Thread-{thread_id}"
                is_daemon = thread_obj.daemon if thread_obj else "unknown"
                lines.append(f"=== Thread: {name} (ID: {thread_id}, Daemon: {is_daemon}) ===")
                for stack_line in traceback.format_stack(frame):
                    lines.append(stack_line.rstrip())
                lines.append("")
            return Response(content="\n".join(lines), media_type="text/plain")

        @app.get("/api/poc/status")
        async def get_poc_status(request: Request):
            """Check if E2B and Gemini are configured and available for PoC executions."""
            return JSONResponse(
                {
                    "configured": self.poc_service.is_configured(),
                    "e2b_configured": self.poc_service.is_e2b_configured(),
                    "gemini_configured": self.poc_service.is_gemini_configured(),
                    "supported_runtimes": ["node", "python", "typescript", "react"],
                    "engine": "e2b_sandbox_pi",
                    "provider": "google",
                    "active_previews": len(self.poc_service.list_active_sandboxes()),
                }
            )

        @app.post("/api/poc/execute")
        @app.post("/api/poc/generate")
        async def execute_poc_spike(request: Request, body: PocExecutionRequest):
            """Execute an ADR PoC spike with Pi & Gemini in an E2B Sandbox with live deployment."""
            if request.query_params.get("stream") == "true":
                import queue
                import asyncio
                import json
                from fastapi.responses import StreamingResponse

                log_queue = queue.Queue()

                def run_task():
                    try:
                        def on_log(text: str):
                            log_queue.put({"type": "log", "message": text})

                        res = self.poc_service.execute_poc(
                            adr_title=body.adr_title,
                            adr_content=body.adr_content or "",
                            prompt=body.prompt,
                            runtime=body.runtime or "node",
                            files=body.files,
                            test_command=body.test_command,
                            build_command=body.build_command,
                            deploy_command=body.deploy_command,
                            preview_port=body.preview_port or 3000,
                            timeout_seconds=body.timeout_seconds or 3600,
                            agent_timeout_seconds=body.agent_timeout_seconds or 900,
                            keep_alive_for_preview=True if body.keep_alive_for_preview is None else body.keep_alive_for_preview,
                            on_log=on_log,
                        )
                        log_queue.put({"type": "result", "data": res})
                    except Exception as exc:
                        log_queue.put({"type": "error", "message": str(exc)})
                    finally:
                        log_queue.put(None)

                threading.Thread(target=run_task, daemon=True).start()

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
                        "Connection": "keep-alive",
                        "X-Accel-Buffering": "no",
                    },
                )

            try:
                result = self.poc_service.execute_poc(
                    adr_title=body.adr_title,
                    adr_content=body.adr_content or "",
                    prompt=body.prompt,
                    runtime=body.runtime or "node",
                    files=body.files,
                    test_command=body.test_command,
                    build_command=body.build_command,
                    deploy_command=body.deploy_command,
                    preview_port=body.preview_port or 3000,
                    timeout_seconds=body.timeout_seconds or 3600,
                    agent_timeout_seconds=body.agent_timeout_seconds or 900,
                    keep_alive_for_preview=True if body.keep_alive_for_preview is None else body.keep_alive_for_preview,
                )
                return JSONResponse(result)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"PoC execution failed: {str(e)}")

        @app.get("/api/poc/previews")
        async def list_previews(request: Request):
            """List all active live preview sandboxes."""
            return JSONResponse({"previews": self.poc_service.list_active_sandboxes()})

        @app.get("/api/poc/preview/{sandbox_id}")
        async def get_preview_details(request: Request, sandbox_id: str):
            """Get details and URL for an active preview sandbox."""
            session = self.poc_service.get_preview_session(sandbox_id)
            if not session:
                raise HTTPException(status_code=404, detail=f"Preview sandbox {sandbox_id} not found")
            return JSONResponse(session)

        @app.delete("/api/poc/preview/{sandbox_id}")
        async def stop_preview_sandbox(request: Request, sandbox_id: str):
            """Stop and release an active preview sandbox."""
            stopped = self.poc_service.stop_preview(sandbox_id)
            if not stopped:
                raise HTTPException(status_code=404, detail=f"Preview sandbox {sandbox_id} not found")
            return JSONResponse({"status": "stopped", "sandbox_id": sandbox_id})

        @app.get("/api/poc/{sandbox_id}/download")
        async def download_poc_archive(request: Request, sandbox_id: str):
            """Download the generated codebase as a zip archive."""
            session = self.poc_service.active_sandboxes.get(sandbox_id)
            if not session or "archive_base64" not in session:
                raise HTTPException(status_code=404, detail=f"No archive found for sandbox {sandbox_id}")

            raw_zip = base64.b64decode(session["archive_base64"])
            return Response(
                content=raw_zip,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename=poc_{sandbox_id}.zip"},
            )
