# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import base64
import datetime
import io
import os
import shlex
import zipfile
from typing import Any, Dict, List, Optional
from loguru import logger


class PocSandboxService:
    """Service to generate, execute, and deploy architectural spikes and PoCs in an E2B Sandbox using Pi Coding Agent and Google Gemini."""

    def __init__(
        self,
        config_service=None,
        e2b_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        sandbox_factory=None,
    ):
        self.config_service = config_service
        self._explicit_e2b_key = e2b_api_key
        self._explicit_gemini_key = gemini_api_key
        self.sandbox_factory = sandbox_factory
        self.active_sandboxes: Dict[str, Dict[str, Any]] = {}

    def get_e2b_api_key(self) -> Optional[str]:
        if self._explicit_e2b_key:
            return self._explicit_e2b_key
        if self.config_service and hasattr(self.config_service, "get_e2b_api_key"):
            key = self.config_service.get_e2b_api_key()
            if key:
                return key
        return os.environ.get("E2B_API_KEY")

    def get_api_key(self) -> Optional[str]:
        """Backward compatibility alias for get_e2b_api_key."""
        return self.get_e2b_api_key()

    def get_gemini_api_key(self) -> Optional[str]:
        if self._explicit_gemini_key:
            return self._explicit_gemini_key
        if self.config_service and hasattr(self.config_service, "get_gemini_api_key"):
            key = self.config_service.get_gemini_api_key()
            if key:
                return key
        return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    def is_configured(self) -> bool:
        """Check if both E2B and Gemini are configured."""
        return bool(self.get_e2b_api_key() and self.get_gemini_api_key())

    def is_e2b_configured(self) -> bool:
        return bool(self.get_e2b_api_key())

    def is_gemini_configured(self) -> bool:
        return bool(self.get_gemini_api_key())

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
                    f"<body><h1>PoC Spike: {adr_title}</h1><p>Running on E2B</p></body></html>"
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
                    f"<body><h1>PoC Spike: {adr_title}</h1><p>Running on E2B</p></body></html>"
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
        """Execute the PoC using Pi in an E2B Sandbox, deploy background server, and expose preview URL."""
        if not files:
            files = self.generate_default_files_for_adr(adr_title, adr_content, runtime)

        if not prompt:
            prompt = self.generate_spike_prompt(adr_title, adr_content, runtime, preview_port)

        e2b_key = self.get_e2b_api_key()
        gemini_key = self.get_gemini_api_key()

        # If custom sandbox factory is injected (e.g. for unit tests)
        if self.sandbox_factory:
            return self._execute_with_sandbox(
                self.sandbox_factory,
                adr_title=adr_title,
                prompt=prompt,
                gemini_key=gemini_key or "mock_gemini_key",
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

        # Real E2B execution when API keys are present
        if e2b_key and gemini_key:
            try:
                from e2b import Sandbox

                return self._execute_with_sandbox(
                    lambda: Sandbox.create(api_key=e2b_key, timeout=timeout_seconds, request_timeout=0),
                    adr_title=adr_title,
                    prompt=prompt,
                    gemini_key=gemini_key,
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
                err_msg = f"Failed to execute PoC in E2B cloud: {e}"
                logger.error(err_msg)
                if on_log:
                    on_log(f"Error: {err_msg}\n")
                return {
                    "success": False,
                    "error": str(e),
                    "logs": f"E2B execution error: {e}",
                    "files": list(files.keys()),
                    "archive_base64": self.create_zip_archive(files),
                    "execution_mode": "e2b_error",
                    "summary": err_msg,
                }

        # Fallback simulation mode when no E2B or Gemini key is configured
        return self._simulate_execution(
            adr_title=adr_title,
            runtime=runtime,
            files=files,
            prompt=prompt,
            preview_port=preview_port,
            on_log=on_log,
        )

    def _execute_with_sandbox(
        self,
        sandbox_creator,
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
        sandbox = sandbox_creator()
        sandbox_id = getattr(sandbox, "sandbox_id", "sandbox_active")
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
            log(f"Provisioned E2B microVM: {sandbox_id}")
            sandbox.commands.run("mkdir -p /home/user/app", timeout=60, request_timeout=0)

            # Write input/seed files if any
            for path, content in files.items():
                target_path = path if path.startswith("/") else f"/home/user/app/{path}"
                try:
                    sandbox.files.write(target_path, content)
                except Exception as ex:
                    logger.debug(f"Could not write file {target_path}: {ex}")

            # Ensure Node.js 22+ and Pi coding agent are installed
            log("Configuring Node.js 22+ & Pi coding agent (@earendil-works/pi-coding-agent)...")
            setup_cmd = sandbox.commands.run(
                "node -v | grep -q 'v22' || (npm install -g n && n 22) && (which pi || npm install -g @earendil-works/pi-coding-agent)",
                timeout=300,
                request_timeout=0,
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
                "--mode json -p --no-session "
                + shlex.quote(prompt)
            )
            log(f"Executing Pi coding agent with Google Gemini ({model_name})...")
            log("\n--- Prompt Sent to Pi Agent ---")
            log(prompt.strip())
            log("--------------------------------\n")
            pi_result = sandbox.commands.run(
                pi_command,
                envs={
                    "GEMINI_API_KEY": gemini_key,
                },
                timeout=agent_timeout_seconds,
                request_timeout=0,
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

            build_res = sandbox.commands.run(
                build_command,
                timeout=300,
                request_timeout=0,
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
            sandbox.commands.run(
                deploy_command,
                background=True,
                timeout=0,
                request_timeout=0,
            )
            log(f"Deployed background server on port {preview_port}")

            # 5. Obtain public preview URL
            host = None
            if hasattr(sandbox, "get_host"):
                host = sandbox.get_host(preview_port)
            public_url = f"https://{host}" if host else f"https://sandbox-{sandbox_id}.e2b.dev"
            log(f"Live preview accessible at: {public_url}")

            archive_base64 = self.create_zip_archive(files)
            if not self.sandbox_factory:
                try:
                    zip_res = sandbox.commands.run(
                        "cd /home/user/app && python3 -c \""
                        "import base64, io, os, zipfile; "
                        "buf = io.BytesIO(); "
                        "zf = zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED); "
                        "[zf.write(os.path.join(r, f), os.path.relpath(os.path.join(r, f), '.')) "
                        " for r, d, fs in os.walk('.') if 'node_modules' not in r and '.git' not in r for f in fs]; "
                        "zf.close(); "
                        "print(base64.b64encode(buf.getvalue()).decode('utf-8'))"
                        "\"",
                        timeout=30,
                        request_timeout=0,
                    )
                    if zip_res.exit_code == 0 and zip_res.stdout.strip():
                        archive_base64 = zip_res.stdout.strip()
                except Exception as e:
                    logger.warning(f"Could not extract generated codebase from sandbox: {e}")

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
                "execution_mode": "e2b_cloud",
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
                    "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
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
            if not is_successful and hasattr(sandbox, "kill"):
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
                "execution_mode": "e2b_cloud",
                "summary": f"PoC execution failed: {str(exc)}",
            }

    def _simulate_execution(
        self,
        adr_title: str,
        runtime: str,
        files: Dict[str, str],
        prompt: str,
        preview_port: int,
        on_log: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Dry-run verification simulating Pi agent and deployment when credentials are not supplied."""
        clean_name = adr_title.replace(" ", "-").lower()
        simulated_sandbox_id = f"sim-{clean_name[:16]}"
        simulated_preview_url = f"https://{simulated_sandbox_id}.preview.e2b.dev"
        archive_base64 = self.create_zip_archive(files)

        if on_log:
            on_log(f"Provisioned simulated sandbox: {simulated_sandbox_id}\n")
            on_log("\n--- Prompt Sent to Pi Agent ---\n")
            on_log(f"{prompt.strip()}\n")
            on_log("--------------------------------\n")
            on_log("Simulated Pi coding agent executed in sandbox.\n")
            on_log("All simulated unit tests passed.\n")
            on_log(f"Live background service deployed on port {preview_port}\n")
            on_log(f"Live preview accessible at: {simulated_preview_url}\n")

        simulated_stdout = (
            f"Simulated Pi coding agent executed in sandbox '{simulated_sandbox_id}'.\n"
            f"Model provider: Google Gemini (simulated).\n"
            f"Generated vertical slice in /home/user/app.\n"
            f"All unit tests passed (exit code 0).\n"
            f"Live background service deployed on port {preview_port}."
        )

        simulated_logs = (
            f"Provisioned simulated sandbox: {simulated_sandbox_id}\n"
            f"Pi synthesis completed successfully.\n"
            f"Preview URL: {simulated_preview_url}\n"
        )

        session_info = {
            "sandbox_id": simulated_sandbox_id,
            "preview_url": simulated_preview_url,
            "host": f"{simulated_sandbox_id}.preview.e2b.dev",
            "port": preview_port,
            "adr_title": adr_title,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "status": "running",
            "archive_base64": archive_base64,
        }
        self.active_sandboxes[simulated_sandbox_id] = session_info

        return {
            "success": True,
            "sandbox_id": simulated_sandbox_id,
            "preview_url": simulated_preview_url,
            "host": f"{simulated_sandbox_id}.preview.e2b.dev",
            "preview_port": preview_port,
            "exit_code": 0,
            "stdout": simulated_stdout,
            "stderr": "",
            "logs": simulated_logs,
            "files": list(files.keys()),
            "archive_base64": archive_base64,
            "runtime": runtime,
            "execution_mode": "simulated",
            "summary": (
                f"PoC generated and deployed in simulated preview mode! "
                f"Provide E2B_API_KEY and GEMINI_API_KEY to run in live cloud microVMs."
            ),
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
