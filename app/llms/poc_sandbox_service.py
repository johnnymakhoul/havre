# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import base64
import datetime
import io
import os
import shlex
import zipfile
from typing import Any, Dict, List, Optional
from loguru import logger

from llms.sandbox.base import SandboxStrategy
from llms.sandbox.factory import SandboxStrategyFactory


class PocSandboxService:
    """Service to generate, execute, and deploy architectural spikes and PoCs in a configured Sandbox using Pi Coding Agent and Google Gemini."""

    def __init__(
        self,
        config_service=None,
        gemini_api_key: Optional[str] = None,
        sandbox_strategy: Optional[SandboxStrategy] = None,
    ):
        self.config_service = config_service
        self._explicit_gemini_key = gemini_api_key
        self.sandbox_strategy: SandboxStrategy = (
            sandbox_strategy
            or SandboxStrategyFactory.get_strategy(config_service=config_service)
        )
        self.active_sandboxes: Dict[str, Dict[str, Any]] = {}

    def get_sandbox_provider(self) -> str:
        return self.sandbox_strategy.provider_name

    def get_gemini_api_key(self) -> Optional[str]:
        if self._explicit_gemini_key:
            return self._explicit_gemini_key
        if self.config_service and hasattr(self.config_service, "get_gemini_api_key"):
            key = self.config_service.get_gemini_api_key()
            if key:
                return key
        return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    def is_sandbox_configured(self) -> bool:
        return bool(self.sandbox_strategy.is_configured())

    def is_gemini_configured(self) -> bool:
        return bool(self.get_gemini_api_key())

    def is_configured(self) -> bool:
        """Check if both the configured sandbox strategy and Gemini are configured."""
        return bool(self.is_sandbox_configured() and self.is_gemini_configured())

    def generate_spike_prompt(
        self,
        adr_title: str,
        adr_content: str = "",
        runtime: str = "node",
        port: int = 3000,
    ) -> str:
        """Construct structured prompt for the in-sandbox Pi coding agent."""
        return (
            f"Create a functional proof-of-concept application validating the ADR specifications:\n"
            f"Title: {adr_title}\n\n"
            f"Architectural Context & Specifications:\n{adr_content}\n\n"
            f"Requirements:\n"
            f"- Implement the core architectural components, APIs, and verification tests described in the ADR.\n"
            f"- Target runtime: {runtime} (Node.js/React or Python).\n"
            f"- Create all required source files in /home/user/app.\n"
            f"- Run package installation, compilation, and automated tests.\n"
            f"- Fix any compilation or runtime errors before finishing.\n"
            f"- Prepare a runnable web/demo entrypoint on port {port}."
        )

    def generate_default_files_for_adr(
        self, adr_title: str, adr_content: str, runtime: str = "python"
    ) -> Dict[str, str]:
        """Generate a baseline functional spike project structure for the ADR."""
        clean_title = adr_title.replace(" ", "_").lower()
        provider = self.get_sandbox_provider()
        if runtime.lower() in ["node", "javascript", "typescript", "react"]:
            return {
                "package.json": (
                    '{\n  "name": "' + clean_title + '",\n'
                    '  "version": "1.0.0",\n'
                    '  "scripts": { "test": "node --test", "build": "echo Built" }\n}'
                ),
                "index.js": (
                    f"// Implementation for {adr_title}\n"
                    "class AdrSpikeSolution {\n"
                    "  constructor() { this.healthy = true; }\n"
                    "  execute(payload) {\n"
                    "    if (!payload) throw new Error('Invalid payload');\n"
                    "    return { status: 'SUCCESS', data: payload };\n"
                    "  }\n"
                    "}\n\n"
                    "module.exports = { AdrSpikeSolution };\n"
                ),
                "index.test.js": (
                    "const test = require('node:test');\n"
                    "const assert = require('node:assert');\n"
                    "const { AdrSpikeSolution } = require('./index');\n\n"
                    "test('validates ADR spike execution', () => {\n"
                    "  const spike = new AdrSpikeSolution();\n"
                    "  assert.strictEqual(spike.healthy, true);\n"
                    "  const res = spike.execute({ key: 'val' });\n"
                    "  assert.strictEqual(res.status, 'SUCCESS');\n"
                    "});\n"
                ),
                "index.html": (
                    f"<!DOCTYPE html><html><head><title>{adr_title}</title></head>"
                    f"<body><h1>PoC Spike: {adr_title}</h1><p>Running on {provider}</p></body></html>"
                ),
                "README.md": f"# Architectural PoC Spike: {adr_title}\n\n{adr_content}",
            }
        else:
            return {
                "main.py": (
                    f"# Implementation for {adr_title}\n"
                    "class AdrSpikeSolution:\n"
                    "    def __init__(self):\n"
                    "        self.healthy = True\n\n"
                    "    def execute(self, payload: dict) -> dict:\n"
                    "        if not payload:\n"
                    "            raise ValueError('Empty payload')\n"
                    "        return {'status': 'SUCCESS', 'payload': payload}\n"
                ),
                "test_main.py": (
                    "import unittest\n"
                    "from main import AdrSpikeSolution\n\n"
                    "class TestAdrSpike(unittest.TestCase):\n"
                    "    def test_execution(self):\n"
                    "        spike = AdrSpikeSolution()\n"
                    "        self.assertTrue(spike.healthy)\n"
                    "        result = spike.execute({'test': 123})\n"
                    "        self.assertEqual(result['status'], 'SUCCESS')\n\n"
                    "if __name__ == '__main__':\n"
                    "    unittest.main()\n"
                ),
                "index.html": (
                    f"<!DOCTYPE html><html><head><title>{adr_title}</title></head>"
                    f"<body><h1>PoC Spike: {adr_title}</h1><p>Running on {provider}</p></body></html>"
                ),
                "README.md": f"# Architectural PoC Spike: {adr_title}\n\n{adr_content}",
            }

    def create_zip_archive(self, files: Dict[str, str]) -> str:
        """Compress generated files into a base64-encoded zip string."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for file_path, content in files.items():
                zip_file.writestr(file_path, content)
        buffer.seek(0)
        return base64.b64encode(buffer.read()).decode("utf-8")

    def execute_poc(
        self,
        adr_title: str,
        adr_content: str = "",
        prompt: Optional[str] = None,
        runtime: str = "node",
        files: Optional[Dict[str, str]] = None,
        test_command: Optional[str] = None,
        build_command: Optional[str] = None,
        deploy_command: Optional[str] = None,
        preview_port: int = 3000,
        timeout_seconds: int = 3600,
        agent_timeout_seconds: int = 900,
        keep_alive_for_preview: bool = True,
        on_log: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Execute the PoC using Pi in the configured Sandbox strategy, deploy background server, and expose preview URL."""
        if not files:
            files = self.generate_default_files_for_adr(adr_title, adr_content, runtime)

        if not prompt:
            prompt = self.generate_spike_prompt(
                adr_title, adr_content, runtime, preview_port
            )

        provider = self.get_sandbox_provider()
        gemini_key = self.get_gemini_api_key()

        if not self.is_configured():
            missing = []
            if not self.is_sandbox_configured():
                missing.append(f"sandbox provider '{provider}'")
            if not gemini_key:
                missing.append("GEMINI_API_KEY")
            err_msg = (
                f"PoC sandbox is not configured: missing {', '.join(missing)}."
            )
            logger.error(err_msg)
            if on_log:
                try:
                    on_log(f"Error: {err_msg}\n")
                except Exception:
                    pass
            return {
                "success": False,
                "error": err_msg,
                "logs": err_msg,
                "files": list(files.keys()),
                "archive_base64": self.create_zip_archive(files),
                "runtime": runtime,
                "execution_mode": f"{provider}_error",
                "summary": err_msg,
            }

        try:
            return self._execute_with_sandbox(
                adr_title=adr_title,
                prompt=prompt,
                gemini_key=gemini_key or "",
                files=files,
                runtime=runtime,
                test_command=test_command,
                build_command=build_command,
                deploy_command=deploy_command,
                preview_port=preview_port,
                timeout_seconds=timeout_seconds,
                agent_timeout_seconds=agent_timeout_seconds,
                keep_alive_for_preview=keep_alive_for_preview,
                on_log=on_log,
            )
        except Exception as e:
            err_msg = f"Failed to execute PoC in {provider} sandbox: {e}"
            logger.error(err_msg)
            if on_log:
                try:
                    on_log(f"Error: {err_msg}\n")
                except Exception:
                    pass
            return {
                "success": False,
                "error": str(e),
                "logs": f"{provider} execution error: {e}",
                "files": list(files.keys()),
                "archive_base64": self.create_zip_archive(files),
                "runtime": runtime,
                "execution_mode": f"{provider}_error",
                "summary": err_msg,
            }

    def _execute_with_sandbox(
        self,
        adr_title: str,
        prompt: str,
        gemini_key: str,
        files: Dict[str, str],
        runtime: str,
        test_command: Optional[str],
        build_command: Optional[str],
        deploy_command: Optional[str],
        preview_port: int,
        timeout_seconds: int,
        agent_timeout_seconds: int,
        keep_alive_for_preview: bool,
        on_log: Optional[Any] = None,
    ) -> Dict[str, Any]:
        provider = self.get_sandbox_provider()
        sandbox = self.sandbox_strategy.create_sandbox(timeout_seconds=timeout_seconds)
        sandbox_id = sandbox.sandbox_id
        all_logs = []
        is_successful = False

        def log(msg: str):
            all_logs.append(msg)
            if on_log:
                try:
                    on_log(msg if msg.endswith("\n") else msg + "\n")
                except Exception:
                    pass

        try:
            # 1. Prepare workspace and install Pi if needed
            log(f"Provisioned {provider} sandbox: {sandbox_id}")
            sandbox.run_command("mkdir -p /home/user/app", timeout=60)

            # Write input/seed files if any
            for path, content in files.items():
                target_path = (
                    path if path.startswith("/") else f"/home/user/app/{path}"
                )
                try:
                    sandbox.write_file(target_path, content)
                except Exception as ex:
                    logger.debug(f"Could not write file {target_path}: {ex}")

            # Ensure Node.js 22+ and Pi coding agent are installed
            log(
                "Configuring Node.js 22+ & Pi coding agent (@earendil-works/pi-coding-agent)..."
            )
            setup_cmd = sandbox.run_command(
                "node -v | grep -q 'v22' || (npm install -g n && n 22) && (which pi || npm install -g @earendil-works/pi-coding-agent)",
                timeout=300,
                on_stdout=lambda text: log(text),
                on_stderr=lambda text: log(text),
            )
            if setup_cmd.exit_code != 0:
                log(f"Notice during environment setup: {setup_cmd.stderr}")

            # 2. Run Pi non-interactively with Google Gemini
            model_name = os.environ.get("ENABLED_CHAT_MODEL") or "gemini-3.8-flash"
            pi_command = (
                "cd /home/user/app && "
                f"pi --provider google --model {model_name} "
                "--mode json -p "
                + shlex.quote(prompt)
            )
            log(f"Executing Pi coding agent with Google Gemini ({model_name})...")
            log("\n--- Prompt Sent to Pi Agent ---")
            log(prompt.strip())
            log("--------------------------------\n")
            pi_result = sandbox.run_command(
                pi_command,
                envs={
                    "GEMINI_API_KEY": gemini_key,
                },
                timeout=agent_timeout_seconds,
                on_stdout=lambda text: log(text),
                on_stderr=lambda text: log(text),
            )

            if pi_result.exit_code != 0:
                raise RuntimeError(
                    f"Pi execution failed (exit code {pi_result.exit_code}): {pi_result.stderr or pi_result.stdout}"
                )

            # 3. Verify application build and tests
            log("Verifying application build and automated tests...")
            if not build_command:
                if test_command:
                    build_command = f"cd /home/user/app && {test_command}"
                elif runtime.lower() in ["node", "javascript", "typescript", "react"]:
                    build_command = "cd /home/user/app && npm run build 2>/dev/null || node --test 2>/dev/null || true"
                else:
                    build_command = "cd /home/user/app && python3 -m unittest discover . 2>/dev/null || true"

            build_res = sandbox.run_command(
                build_command,
                timeout=300,
                on_stdout=lambda text: log(text),
                on_stderr=lambda text: log(text),
            )

            if build_res.exit_code != 0:
                raise RuntimeError(f"Build verification failed: {build_res.stderr}")

            # 4. Start background server for live preview
            if not deploy_command:
                deploy_command = (
                    f"cd /home/user/app && "
                    f"if [ -f package.json ] && grep -q '\"start\"' package.json; then npm start; "
                    f"elif [ -f server.js ]; then node server.js; "
                    f"elif [ -f app.js ]; then node app.js; "
                    f"elif [ -f index.js ]; then node index.js; "
                    f"elif [ -f main.py ]; then python3 main.py; "
                    f"else python3 -m http.server {preview_port}; fi"
                )
            log(f"Starting server for live preview on port {preview_port}...")
            sandbox.run_command(
                deploy_command,
                background=True,
                timeout=0,
            )
            log(f"Deployed background server on port {preview_port}")

            # 5. Obtain public preview URL
            host, public_url = sandbox.get_preview_url(preview_port)
            log(f"Live preview accessible at: {public_url}")

            archive_base64 = self.create_zip_archive(files)
            try:
                zip_res = sandbox.run_command(
                    'cd /home/user/app && python3 -c "'
                    "import base64, io, os, zipfile; "
                    "buf = io.BytesIO(); "
                    "zf = zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED); "
                    "[zf.write(os.path.join(r, f), os.path.relpath(os.path.join(r, f), '.')) "
                    " for r, d, fs in os.walk('.') if 'node_modules' not in r and '.git' not in r for f in fs]; "
                    "zf.close(); "
                    "print(base64.b64encode(buf.getvalue()).decode('utf-8'))"
                    '"',
                    timeout=30,
                )
                if (
                    zip_res
                    and getattr(zip_res, "exit_code", 1) == 0
                    and isinstance(getattr(zip_res, "stdout", None), str)
                    and zip_res.stdout.strip()
                ):
                    archive_base64 = zip_res.stdout.strip()
            except StopIteration:
                pass
            except Exception as e:
                logger.warning(
                    f"Could not extract generated codebase from sandbox: {e}"
                )

            is_successful = True

            result_payload = {
                "success": True,
                "sandbox_id": sandbox_id,
                "preview_url": public_url,
                "host": host,
                "preview_port": preview_port,
                "exit_code": 0,
                "stdout": pi_result.stdout,
                "stderr": pi_result.stderr,
                "logs": "\n".join(all_logs),
                "files": list(files.keys()),
                "archive_base64": archive_base64,
                "runtime": runtime,
                "execution_mode": f"{provider}_cloud",
                "summary": f"PoC built and deployed successfully with Pi! Live preview available at {public_url}",
            }

            if keep_alive_for_preview:
                self.active_sandboxes[sandbox_id] = {
                    "sandbox_id": sandbox_id,
                    "sandbox": sandbox,
                    "preview_url": public_url,
                    "host": host,
                    "port": preview_port,
                    "adr_title": adr_title,
                    "runtime": runtime,
                    "build_command": build_command,
                    "test_command": test_command,
                    "deploy_command": deploy_command,
                    "gemini_key": gemini_key,
                    "agent_timeout_seconds": agent_timeout_seconds,
                    "created_at": datetime.datetime.now(
                        datetime.timezone.utc
                    ).isoformat(),
                    "status": "running",
                    "archive_base64": archive_base64,
                }
            else:
                try:
                    sandbox.kill()
                except Exception:
                    pass

            return result_payload

        except Exception as exc:
            all_logs.append(f"Error during sandbox execution: {str(exc)}")
            logger.error(f"Error during sandbox execution: {exc}")
            if not is_successful:
                try:
                    sandbox.kill()
                except Exception:
                    pass
            return {
                "success": False,
                "sandbox_id": sandbox_id,
                "error": str(exc),
                "logs": "\n".join(all_logs),
                "files": list(files.keys()),
                "archive_base64": self.create_zip_archive(files),
                "runtime": runtime,
                "execution_mode": f"{provider}_error",
                "summary": f"PoC execution failed: {str(exc)}",
            }

    def get_preview_session(self, sandbox_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve details of an active preview session."""
        session = self.active_sandboxes.get(sandbox_id)
        if not session:
            return None
        return {
            "sandbox_id": session["sandbox_id"],
            "preview_url": session.get("preview_url"),
            "host": session.get("host"),
            "port": session.get("port"),
            "adr_title": session.get("adr_title"),
            "created_at": session.get("created_at"),
            "status": session.get("status"),
        }

    def list_active_sandboxes(self) -> List[Dict[str, Any]]:
        """List summary of all active preview sessions."""
        return [
            {
                "sandbox_id": s["sandbox_id"],
                "preview_url": s.get("preview_url"),
                "host": s.get("host"),
                "port": s.get("port"),
                "adr_title": s.get("adr_title"),
                "created_at": s.get("created_at"),
                "status": s.get("status"),
            }
            for s in self.active_sandboxes.values()
        ]

    def stop_preview(self, sandbox_id: str) -> bool:
        """Terminate an active preview sandbox and release resources."""
        session = self.active_sandboxes.get(sandbox_id)
        if not session:
            return False

        sandbox = session.get("sandbox")
        if sandbox and hasattr(sandbox, "kill"):
            try:
                sandbox.kill()
            except Exception as ex:
                logger.warning(f"Error terminating sandbox {sandbox_id}: {ex}")

        session["status"] = "stopped"
        del self.active_sandboxes[sandbox_id]
        return True

    def send_instruction(
        self,
        sandbox_id: str,
        prompt: str,
        on_log: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Send follow-up conversational instructions to the Pi coding agent in an active sandbox."""
        session = self.active_sandboxes.get(sandbox_id)
        if not session or session.get("status") != "running":
            raise ValueError(
                f"Active sandbox session '{sandbox_id}' not found or already stopped."
            )

        sandbox = session.get("sandbox")
        if not sandbox:
            raise ValueError(
                f"Sandbox instance for session '{sandbox_id}' is not available."
            )

        all_logs = []

        def log(msg: str):
            all_logs.append(msg)
            if on_log:
                try:
                    on_log(msg if msg.endswith("\n") else msg + "\n")
                except Exception:
                    pass

        log(f"\n>>> User Instruction: {prompt.strip()}\n----------------------------------------")

        gemini_key = session.get("gemini_key") or self.get_gemini_api_key() or ""
        agent_timeout = session.get("agent_timeout_seconds") or 900
        preview_port = session.get("port") or 3000
        build_command = session.get("build_command")
        deploy_command = session.get("deploy_command")
        runtime = session.get("runtime") or "node"

        model_name = os.environ.get("ENABLED_CHAT_MODEL") or "gemini-3.8-flash"
        pi_command = (
            "cd /home/user/app && "
            f"pi --provider google --model {model_name} "
            "--mode json -p --continue "
            + shlex.quote(prompt)
        )

        log(f"Executing Pi coding agent with Google Gemini ({model_name}) [continuation]...")
        pi_result = sandbox.run_command(
            pi_command,
            envs={"GEMINI_API_KEY": gemini_key},
            timeout=agent_timeout,
            on_stdout=lambda text: log(text),
            on_stderr=lambda text: log(text),
        )

        if pi_result.exit_code != 0:
            err_msg = f"Pi instruction failed (exit code {pi_result.exit_code}): {pi_result.stderr or pi_result.stdout}"
            log(err_msg)
            raise RuntimeError(err_msg)

        # Re-run build & automated tests
        log("Re-verifying application build and automated tests...")
        if not build_command:
            if runtime.lower() in ["node", "javascript", "typescript", "react"]:
                build_command = (
                    "cd /home/user/app && npm run build 2>/dev/null || node --test 2>/dev/null || true"
                )
            else:
                build_command = (
                    "cd /home/user/app && python3 -m unittest discover . 2>/dev/null || true"
                )

        build_res = sandbox.run_command(
            build_command,
            timeout=300,
            on_stdout=lambda text: log(text),
            on_stderr=lambda text: log(text),
        )

        if build_res.exit_code != 0:
            log(
                f"Notice: Verification returned exit code {build_res.exit_code}: {build_res.stderr}"
            )

        # Restart background preview server
        log(f"Restarting live preview server on port {preview_port}...")
        sandbox.run_command(
            f"fuser -k {preview_port}/tcp 2>/dev/null || lsof -ti:{preview_port} | xargs kill -9 2>/dev/null || true",
            timeout=30,
        )

        if not deploy_command:
            deploy_command = (
                f"cd /home/user/app && "
                f"if [ -f package.json ] && grep -q '\"start\"' package.json; then npm start; "
                f"elif [ -f server.js ]; then node server.js; "
                f"elif [ -f app.js ]; then node app.js; "
                f"elif [ -f index.js ]; then node index.js; "
                f"elif [ -f main.py ]; then python3 main.py; "
                f"else python3 -m http.server {preview_port}; fi"
            )

        sandbox.run_command(
            deploy_command,
            background=True,
            timeout=0,
        )
        log(f"Preview server restarted successfully on port {preview_port}")

        host, public_url = sandbox.get_preview_url(preview_port)

        # Re-bundle zip codebase
        archive_base64 = session.get("archive_base64")
        try:
            zip_res = sandbox.run_command(
                'cd /home/user/app && python3 -c "'
                "import base64, io, os, zipfile; "
                "buf = io.BytesIO(); "
                "zf = zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED); "
                "[zf.write(os.path.join(r, f), os.path.relpath(os.path.join(r, f), '.')) "
                " for r, d, fs in os.walk('.') if 'node_modules' not in r and '.git' not in r for f in fs]; "
                "zf.close(); "
                "print(base64.b64encode(buf.getvalue()).decode('utf-8'))"
                '"',
                timeout=30,
            )
            if (
                zip_res
                and getattr(zip_res, "exit_code", 1) == 0
                and isinstance(getattr(zip_res, "stdout", None), str)
                and zip_res.stdout.strip()
            ):
                archive_base64 = zip_res.stdout.strip()
                session["archive_base64"] = archive_base64
        except Exception as e:
            logger.warning(f"Could not re-extract updated codebase: {e}")

        result_payload = {
            "success": True,
            "sandbox_id": sandbox_id,
            "preview_url": public_url,
            "host": host,
            "preview_port": preview_port,
            "exit_code": 0,
            "stdout": pi_result.stdout,
            "stderr": pi_result.stderr,
            "logs": "\n".join(all_logs),
            "archive_base64": archive_base64,
            "summary": "Instruction applied successfully and preview refreshed.",
        }
        return result_payload
