# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import os
from typing import Any, Optional

from llms.sandbox.base import SandboxStrategy
from llms.sandbox.e2b_strategy import E2BSandboxStrategy


class SandboxStrategyFactory:
    """Factory for resolving and instantiating a SandboxStrategy based on configuration."""

    @classmethod
    def get_strategy(
        cls,
        config_service: Optional[Any] = None,
        provider: Optional[str] = None,
        **kwargs: Any,
    ) -> SandboxStrategy:
        resolved_provider = provider
        if (
            not resolved_provider
            and config_service
            and hasattr(config_service, "load_sandbox_provider")
        ):
            resolved_provider = config_service.load_sandbox_provider()
        if not resolved_provider:
            resolved_provider = os.environ.get("SANDBOX_PROVIDER") or "e2b"

        normalized = resolved_provider.strip().lower()

        if normalized == "e2b":
            return E2BSandboxStrategy(config_service=config_service, **kwargs)

        raise NotImplementedError(
            f"Sandbox strategy '{normalized}' is not implemented."
        )

