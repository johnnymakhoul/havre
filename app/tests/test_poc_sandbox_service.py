# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import base64
import io
import os
import unittest
import zipfile
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.api_poc import ApiPoc
from config_service import ConfigService
from llms.poc_sandbox_service import PocSandboxService


class TestPocSandboxService(unittest.TestCase):
    def setUp(self):
        self.original_e2b = os.environ.get("E2B_API_KEY")
        self.original_gemini = os.environ.get("GEMINI_API_KEY")
        self.original_google = os.environ.get("GOOGLE_API_KEY")
        if "E2B_API_KEY" in os.environ:
            del os.environ["E2B_API_KEY"]
        if "GEMINI_API_KEY" in os.environ:
            del os.environ["GEMINI_API_KEY"]
        if "GOOGLE_API_KEY" in os.environ:
            del os.environ["GOOGLE_API_KEY"]

    def tearDown(self):
        if self.original_e2b is not None:
            os.environ["E2B_API_KEY"] = self.original_e2b
        elif "E2B_API_KEY" in os.environ:
            del os.environ["E2B_API_KEY"]

        if self.original_gemini is not None:
            os.environ["GEMINI_API_KEY"] = self.original_gemini
        elif "GEMINI_API_KEY" in os.environ:
            del os.environ["GEMINI_API_KEY"]

        if self.original_google is not None:
            os.environ["GOOGLE_API_KEY"] = self.original_google
        elif "GOOGLE_API_KEY" in os.environ:
            del os.environ["GOOGLE_API_KEY"]

    def test_is_configured_with_explicit_keys(self):
        service = PocSandboxService(
            e2b_api_key="e2b_test_123",
            gemini_api_key="gemini_test_456",
        )
        self.assertTrue(service.is_configured())
        self.assertTrue(service.is_e2b_configured())
        self.assertTrue(service.is_gemini_configured())
        self.assertEqual(service.get_e2b_api_key(), "e2b_test_123")
        self.assertEqual(service.get_gemini_api_key(), "gemini_test_456")

    def test_is_configured_with_config_service(self):
        mock_config = MagicMock(spec=ConfigService)
        mock_config.get_e2b_api_key.return_value = "config_e2b_key"
        mock_config.get_gemini_api_key.return_value = "config_gemini_key"

        service = PocSandboxService(config_service=mock_config)
        self.assertTrue(service.is_configured())
        self.assertEqual(service.get_e2b_api_key(), "config_e2b_key")
        self.assertEqual(service.get_gemini_api_key(), "config_gemini_key")

    def test_is_configured_with_env_vars(self):
        os.environ["E2B_API_KEY"] = "env_e2b"
        os.environ["GEMINI_API_KEY"] = "env_gemini"

        service = PocSandboxService()
        self.assertTrue(service.is_configured())
        self.assertEqual(service.get_e2b_api_key(), "env_e2b")
        self.assertEqual(service.get_gemini_api_key(), "env_gemini")

    def test_is_not_configured_when_empty(self):
        service = PocSandboxService()
        self.assertFalse(service.is_configured())
        self.assertFalse(service.is_e2b_configured())
        self.assertFalse(service.is_gemini_configured())
        self.assertIsNone(service.get_e2b_api_key())
        self.assertIsNone(service.get_gemini_api_key())

    def test_generate_spike_prompt(self):
        service = PocSandboxService()
        prompt = service.generate_spike_prompt(
            adr_title="ADR-001 Sync",
            adr_content="Decision details",
            runtime="node",
            port=3000,
        )
        self.assertIn("ADR-001 Sync", prompt)
        self.assertIn("Decision details", prompt)
        self.assertIn("port 3000", prompt)

    def test_generate_default_files_for_adr_node(self):
        service = PocSandboxService()
        files = service.generate_default_files_for_adr(
            adr_title="ADR-002 Node Sync",
            adr_content="Use Node.js for client sync.",
            runtime="node",
        )
        self.assertIn("package.json", files)
        self.assertIn("index.js", files)
        self.assertIn("index.test.js", files)
        self.assertIn("index.html", files)
        self.assertIn("README.md", files)
        self.assertIn("AdrSpikeSolution", files["index.js"])
        self.assertIn("node:test", files["index.test.js"])

    def test_generate_default_files_for_adr_python(self):
        service = PocSandboxService()
        files = service.generate_default_files_for_adr(
            adr_title="ADR-001 Modular Monolith",
            adr_content="Decision to deploy a modular monolith on Container Apps.",
            runtime="python",
        )
        self.assertIn("main.py", files)
        self.assertIn("test_main.py", files)
        self.assertIn("index.html", files)
        self.assertIn("README.md", files)
        self.assertIn("AdrSpikeSolution", files["main.py"])
        self.assertIn("unittest", files["test_main.py"])

    def test_create_zip_archive(self):
        service = PocSandboxService()
        files = {
            "hello.txt": "Hello, World!",
            "src/app.py": "print('hello')",
        }
        b64_zip = service.create_zip_archive(files)
        raw_zip = base64.b64decode(b64_zip)
        with zipfile.ZipFile(io.BytesIO(raw_zip), "r") as zf:
            namelist = zf.namelist()
            self.assertIn("hello.txt", namelist)
            self.assertIn("src/app.py", namelist)
            self.assertEqual(zf.read("hello.txt").decode("utf-8"), "Hello, World!")
            self.assertEqual(zf.read("src/app.py").decode("utf-8"), "print('hello')")

    def test_execute_poc_simulation_mode(self):
        service = PocSandboxService()
        result = service.execute_poc(
            adr_title="ADR-001 Microservices",
            adr_content="Decision content",
            runtime="node",
        )
        self.assertTrue(result["success"])
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(result["execution_mode"], "simulated")
        self.assertIn("preview_url", result)
        self.assertIn("sim-adr-001-micros", result["sandbox_id"])
        self.assertIn("https://", result["preview_url"])
        self.assertIsNotNone(result["archive_base64"])

        # Check preview session is registered
        session = service.get_preview_session(result["sandbox_id"])
        self.assertIsNotNone(session)
        self.assertEqual(session["status"], "running")

        # Stop preview
        stopped = service.stop_preview(result["sandbox_id"])
        self.assertTrue(stopped)
        self.assertIsNone(service.get_preview_session(result["sandbox_id"]))

    def test_execute_poc_with_mock_sandbox_success(self):
        mock_sandbox = MagicMock()
        mock_sandbox.sandbox_id = "sbx_test_456"
        mock_sandbox.get_host.return_value = "sbx_test_456-3000.e2b.dev"

        # Mock commands run results:
        # 1. mkdir
        # 2. npm install -g pi
        # 3. pi run
        # 4. build check
        # 5. nohup server
        mock_mkdir = MagicMock(exit_code=0, stdout="", stderr="")
        mock_setup = MagicMock(exit_code=0, stdout="Pi installed", stderr="")
        mock_pi = MagicMock(exit_code=0, stdout="App created and built", stderr="")
        mock_build = MagicMock(exit_code=0, stdout="Build OK", stderr="")
        mock_server = MagicMock(exit_code=0, stdout="", stderr="")

        mock_sandbox.commands.run.side_effect = [
            mock_mkdir,
            mock_setup,
            mock_pi,
            mock_build,
            mock_server,
        ]

        service = PocSandboxService(
            sandbox_factory=lambda: mock_sandbox,
            gemini_api_key="gemini_mock_key",
        )
        result = service.execute_poc(
            adr_title="ADR-003 GraphQL Gateway",
            runtime="node",
            preview_port=3000,
            keep_alive_for_preview=True,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["sandbox_id"], "sbx_test_456")
        self.assertEqual(result["preview_url"], "https://sbx_test_456-3000.e2b.dev")
        self.assertEqual(result["execution_mode"], "e2b_cloud")

        # Verify Pi execution call included Gemini API keys in environment
        calls = mock_sandbox.commands.run.call_args_list
        pi_call = calls[2]
        self.assertIn("pi --provider google", pi_call[0][0])
        self.assertEqual(pi_call[1]["envs"]["GEMINI_API_KEY"], "gemini_mock_key")

        # Verify preview session was kept alive and registered
        self.assertIn("sbx_test_456", service.active_sandboxes)
        previews = service.list_active_sandboxes()
        self.assertEqual(len(previews), 1)
        self.assertEqual(previews[0]["sandbox_id"], "sbx_test_456")

        # Stop preview
        stopped = service.stop_preview("sbx_test_456")
        self.assertTrue(stopped)
        mock_sandbox.kill.assert_called_once()
        self.assertEqual(len(service.list_active_sandboxes()), 0)

    def test_execute_poc_with_mock_sandbox_pi_failure(self):
        mock_sandbox = MagicMock()
        mock_sandbox.sandbox_id = "sbx_fail_789"

        mock_mkdir = MagicMock(exit_code=0, stdout="", stderr="")
        mock_setup = MagicMock(exit_code=0, stdout="", stderr="")
        mock_pi = MagicMock(exit_code=1, stdout="Syntax error", stderr="Failed to generate code")

        mock_sandbox.commands.run.side_effect = [
            mock_mkdir,
            mock_setup,
            mock_pi,
        ]

        service = PocSandboxService(
            sandbox_factory=lambda: mock_sandbox,
            gemini_api_key="gemini_key",
        )
        result = service.execute_poc(
            adr_title="ADR-004 Broken Spike",
            runtime="node",
        )

        self.assertFalse(result["success"])
        self.assertIn("Pi execution failed", result["error"])
        mock_sandbox.kill.assert_called_once()

    def test_execute_poc_live_api_keys_handles_network_error(self):
        service = PocSandboxService(
            e2b_api_key="offline_e2b_key",
            gemini_api_key="offline_gemini_key",
        )
        with patch("e2b.Sandbox.create", side_effect=Exception("E2B API unreachable")):
            result = service.execute_poc(adr_title="ADR-005 Connection Check")
            self.assertFalse(result["success"])
            self.assertEqual(result["execution_mode"], "e2b_error")
            self.assertIn("E2B API unreachable", result["error"])


class TestApiPoc(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.mock_config = MagicMock(spec=ConfigService)
        self.mock_poc_service = MagicMock(spec=PocSandboxService)
        self.mock_poc_service.active_sandboxes = {}
        self.api_poc = ApiPoc(
            self.app,
            config_service=self.mock_config,
            poc_service=self.mock_poc_service,
        )
        self.client = TestClient(self.app)

    def test_get_poc_status(self):
        self.mock_poc_service.is_configured.return_value = True
        self.mock_poc_service.is_e2b_configured.return_value = True
        self.mock_poc_service.is_gemini_configured.return_value = True
        self.mock_poc_service.list_active_sandboxes.return_value = []

        response = self.client.get("/api/poc/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["configured"])
        self.assertTrue(data["e2b_configured"])
        self.assertTrue(data["gemini_configured"])
        self.assertEqual(data["engine"], "e2b_sandbox_pi")
        self.assertEqual(data["provider"], "google")

    def test_execute_poc_endpoint_success(self):
        self.mock_poc_service.execute_poc.return_value = {
            "success": True,
            "sandbox_id": "sbx_test_001",
            "preview_url": "https://sbx_test_001.e2b.dev",
            "exit_code": 0,
            "stdout": "Build succeeded",
            "stderr": "",
            "logs": "Execution logs",
            "files": ["package.json", "index.js"],
            "archive_base64": "dummy_zip",
            "runtime": "node",
            "execution_mode": "e2b_cloud",
            "summary": "PoC executed and deployed successfully",
        }
        payload = {
            "adr_title": "ADR-001 Microservices",
            "adr_content": "Full decision content",
            "runtime": "node",
            "preview_port": 3000,
        }
        response = self.client.post("/api/poc/execute", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["preview_url"], "https://sbx_test_001.e2b.dev")
        self.mock_poc_service.execute_poc.assert_called_once()

    def test_preview_lifecycle_endpoints(self):
        # 1. List previews
        self.mock_poc_service.list_active_sandboxes.return_value = [
            {
                "sandbox_id": "sbx_live_1",
                "preview_url": "https://sbx_live_1.e2b.dev",
                "status": "running",
            }
        ]
        resp_list = self.client.get("/api/poc/previews")
        self.assertEqual(resp_list.status_code, 200)
        self.assertEqual(len(resp_list.json()["previews"]), 1)

        # 2. Get single preview details
        self.mock_poc_service.get_preview_session.return_value = {
            "sandbox_id": "sbx_live_1",
            "preview_url": "https://sbx_live_1.e2b.dev",
            "status": "running",
        }
        resp_detail = self.client.get("/api/poc/preview/sbx_live_1")
        self.assertEqual(resp_detail.status_code, 200)
        self.assertEqual(resp_detail.json()["sandbox_id"], "sbx_live_1")

        # 3. Stop preview
        self.mock_poc_service.stop_preview.return_value = True
        resp_stop = self.client.delete("/api/poc/preview/sbx_live_1")
        self.assertEqual(resp_stop.status_code, 200)
        self.assertEqual(resp_stop.json()["status"], "stopped")

    def test_download_poc_archive_endpoint(self):
        sample_bytes = b"PK\x03\x04test_zip_contents"
        b64_content = base64.b64encode(sample_bytes).decode("utf-8")
        self.mock_poc_service.active_sandboxes = {
            "sbx_download_1": {"archive_base64": b64_content}
        }

        response = self.client.get("/api/poc/sbx_download_1/download")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, sample_bytes)
        self.assertEqual(response.headers["content-type"], "application/zip")
