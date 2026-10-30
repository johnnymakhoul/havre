# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Tuple


@dataclass
class CommandResult:
    """Standardized result from running a command inside a sandbox instance."""

    exit_code: int
    stdout: str = ""
    stderr: str = ""


class SandboxInstance(ABC):
    """Abstract interface representing a single provisioned sandbox instance."""

    @property
    @abstractmethod
    def sandbox_id(self) -> str:
        """Unique identifier for this sandbox instance."""

    @abstractmethod
    def write_file(self, path: str, content: str) -> None:
        """Write text content to a file path inside the sandbox."""

    @abstractmethod
    def run_command(
        self,
        command: str,
        timeout: int = 60,
        envs: Optional[Dict[str, str]] = None,
        on_stdout: Optional[Callable[[str], None]] = None,
        on_stderr: Optional[Callable[[str], None]] = None,
        background: bool = False,
    ) -> CommandResult:
        """Execute a shell command inside the sandbox."""

    @abstractmethod
    def get_preview_url(self, port: int) -> Tuple[Optional[str], str]:
        """Return (host, public_url) exposing the given port from the sandbox."""

    @abstractmethod
    def kill(self) -> None:
        """Terminate the sandbox instance and release its resources."""


class SandboxStrategy(ABC):
    """Abstract strategy for checking configuration and provisioning sandbox instances."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Identifier of the sandbox provider (e.g., 'e2b', 'minimal', 'opensandbox')."""

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if all required credentials/settings for this provider are present."""

    @abstractmethod
    def create_sandbox(self, timeout_seconds: int = 3600) -> SandboxInstance:
        """Provision and return a new SandboxInstance."""

