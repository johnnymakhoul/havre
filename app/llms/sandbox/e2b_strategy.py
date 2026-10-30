# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import os
from typing import Any, Callable, Dict, Optional, Tuple

from llms.sandbox.base import CommandResult, SandboxInstance, SandboxStrategy


class E2BSandboxInstance(SandboxInstance):
    """SandboxInstance implementation backed by an E2B cloud microVM."""

    def __init__(self, e2b_sandbox: Any):
        self._sandbox = e2b_sandbox

    @property
    def sandbox_id(self) -> str:
        return getattr(self._sandbox, "sandbox_id", "sandbox_active")

    def write_file(self, path: str, content: str) -> None:
        self._sandbox.files.write(path, content)

    def run_command(
        self,
        command: str,
        timeout: int = 60,
        envs: Optional[Dict[str, str]] = None,
        on_stdout: Optional[Callable[[str], None]] = None,
        on_stderr: Optional[Callable[[str], None]] = None,
        background: bool = False,
    ) -> CommandResult:
        kwargs: Dict[str, Any] = {
            "timeout": 0 if background else timeout,
            "request_timeout": 0,
        }
        if background:
            kwargs["background"] = True
        if envs is not None:
            kwargs["envs"] = envs
        if on_stdout is not None:
            kwargs["on_stdout"] = on_stdout
        if on_stderr is not None:
            kwargs["on_stderr"] = on_stderr

        res = self._sandbox.commands.run(command, **kwargs)
        if background or res is None:
            return CommandResult(exit_code=0, stdout="", stderr="")

        return CommandResult(
            exit_code=getattr(res, "exit_code", 0),
            stdout=getattr(res, "stdout", "") or "",
            stderr=getattr(res, "stderr", "") or "",
        )

    def get_preview_url(self, port: int) -> Tuple[Optional[str], str]:
        host = None
        if hasattr(self._sandbox, "get_host"):
            host = self._sandbox.get_host(port)
        public_url = (
            f"https://{host}" if host else f"https://sandbox-{self.sandbox_id}.e2b.dev"
        )
        return host, public_url

    def kill(self) -> None:
        if hasattr(self._sandbox, "kill"):
            self._sandbox.kill()


class E2BSandboxStrategy(SandboxStrategy):
    """SandboxStrategy implementation for E2B cloud microVMs."""

    def __init__(
        self,
        config_service: Optional[Any] = None,
        api_key: Optional[str] = None,
    ):
        self.config_service = config_service
        self._explicit_api_key = api_key

    @property
    def provider_name(self) -> str:
        return "e2b"

    def get_api_key(self) -> Optional[str]:
        if self._explicit_api_key:
            return self._explicit_api_key
        if self.config_service and hasattr(self.config_service, "get_e2b_api_key"):
            key = self.config_service.get_e2b_api_key()
            if key:
                return key
        env_key = os.environ.get("E2B_API_KEY")
        return env_key if env_key else None

    def is_configured(self) -> bool:
        return bool(self.get_api_key())

    def create_sandbox(self, timeout_seconds: int = 3600) -> SandboxInstance:
        api_key = self.get_api_key()
        if not api_key:
            raise ValueError("E2B API key is not configured.")
        from e2b import Sandbox

        raw_sandbox = Sandbox.create(
            api_key=api_key,
            timeout=timeout_seconds,
            request_timeout=0,
        )
        return E2BSandboxInstance(raw_sandbox)

