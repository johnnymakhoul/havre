# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
from unittest.mock import MagicMock, patch
import pytest

from llms.code_development_service import CodeDevelopmentService


@pytest.fixture
def mock_sandbox_strategy():
    strategy = MagicMock()
    strategy.provider_name = "mock_provider"
    strategy.is_configured.return_value = True

    sandbox = MagicMock()
    sandbox.sandbox_id = "test-sandbox-123"
    # Default successful commands
    cmd_res = MagicMock()
    cmd_res.exit_code = 0
    cmd_res.stdout = "Everything passed"
    cmd_res.stderr = ""
    sandbox.run_command.return_value = cmd_res

    strategy.create_sandbox.return_value = sandbox
    return strategy


@pytest.fixture
def service(mock_sandbox_strategy):
    return CodeDevelopmentService(
        gemini_api_key="mock-gemini-key",
        sandbox_strategy=mock_sandbox_strategy,
    )


def test_slugify():
    assert CodeDevelopmentService.slugify("WBS 1.2.3: Build Auth API") == "wbs-1-2-3-build-auth-api"
    assert CodeDevelopmentService.slugify("---test!!!") == "test"
    assert CodeDevelopmentService.slugify("") == "task"


def test_generate_wbs_prompt(service):
    prompt = service.generate_wbs_prompt(
        wbs_code="2.1.1",
        title="Implement Offline Cache SQLite Schema",
        summary="Create schema migrations and tests.",
        pbs_ref="PBS 1.2.1",
        pdp_ref="Stage 3",
        runtime="node",
        dependencies=["1.1"],
    )
    assert "2.1.1" in prompt
    assert "Implement Offline Cache SQLite Schema" in prompt
    assert "PBS 1.2.1" in prompt
    assert "Stage 3" in prompt
    assert "Prerequisite Dependencies**: 1.1" in prompt
    assert "Single PR Scope" in prompt
    assert "Author Automated Tests" in prompt


def test_execute_task_success_without_github(service, mock_sandbox_strategy):
    sandbox = mock_sandbox_strategy.create_sandbox.return_value
    cmd_success = MagicMock(exit_code=0, stdout="Tests passed 10/10", stderr="")
    sandbox.run_command.return_value = cmd_success

    logs = []
    res = service.execute_task(
        wbs_code="1.1",
        title="Initialize DB",
        summary="Create table DDL",
        on_log=lambda l: logs.append(l),
    )

    assert res["success"] is True
    assert res["wbs_code"] == "1.1"
    assert res["status"] == "success"
    assert any("Definition of Done verified" in l for l in logs)


def test_execute_task_with_github_pr_and_predecessor_branch(mock_sandbox_strategy):
    repo = MagicMock()
    repo.get_active_project_id.return_value = "p1"
    repo.get_tasks.return_value = [
        {"id": "task-1", "wbsCode": "1.2", "title": "Implement API", "status": "backlog"}
    ]

    service = CodeDevelopmentService(
        gemini_api_key="test-key",
        sandbox_strategy=mock_sandbox_strategy,
        data_repository=repo,
    )

    sandbox = mock_sandbox_strategy.create_sandbox.return_value

    def fake_run(cmd, *args, **kwargs):
        res = MagicMock()
        res.exit_code = 0
        res.stdout = ""
        res.stderr = ""
        if "git branch -r" in cmd:
            res.stdout = "  origin/main\n  origin/haiven/wbs-1-1-init-db-2026\n"
        return res

    sandbox.run_command.side_effect = fake_run

    github_config = {
        "repoUrl": "https://github.com/myorg/myrepo",
        "token": "ghp_secrettoken123",
        "defaultBranch": "main",
    }

    with patch("llms.code_development_service.GitHubService") as mock_gh_cls:
        gh_instance = mock_gh_cls.return_value
        mock_gh_cls.parse_repo_url.return_value = ("myorg", "myrepo")
        gh_instance.create_issue.return_value = {
            "html_url": "https://github.com/myorg/myrepo/issues/10",
            "number": 10,
            "title": "feat(WBS 1.2): Implement API",
            "state": "open",
        }
        gh_instance.create_draft_pr.return_value = {
            "html_url": "https://github.com/myorg/myrepo/pull/42",
            "number": 42,
            "title": "feat(WBS 1.2): Implement API",
        }

        logs = []
        res = service.execute_task(
            wbs_code="1.2",
            title="Implement API",
            task_id="task-1",
            dependencies=["1.1"],
            project_id="p1",
            github_config=github_config,
            on_log=lambda l: logs.append(l),
        )

        assert res["success"] is True
        assert gh_instance.create_issue.called
        assert res["issue_info"]["number"] == 10
        assert res["pr_info"]["number"] == 42
        assert "issue-10-wbs-" in res["feature_branch"]
        assert "[REDACTED_GITHUB_TOKEN]" not in "\n".join(logs)
        assert "ghp_secrettoken123" not in "\n".join(logs)
        assert any("Created GitHub Issue #10" in l for l in logs)
        assert any("Resolved predecessor branch for dependency '1.1'" in l for l in logs)
        # Check task in repo was updated
        assert repo.save_tasks.called


def test_execute_task_retry_loop_on_test_failure(mock_sandbox_strategy):
    service = CodeDevelopmentService(
        gemini_api_key="test-key",
        sandbox_strategy=mock_sandbox_strategy,
    )

    sandbox = mock_sandbox_strategy.create_sandbox.return_value

    # First test run fails, second succeeds
    fail_res = MagicMock(exit_code=1, stdout="", stderr="AssertionError in auth.test.js")
    pass_res = MagicMock(exit_code=0, stdout="All tests passed", stderr="")

    call_count = {"test": 0}

    def fake_run(cmd, *args, **kwargs):
        if "if [ -f package.json ]" in cmd or cmd.strip().startswith("npm test"):
            call_count["test"] += 1
            if call_count["test"] == 1:
                return fail_res
            return pass_res
        return MagicMock(exit_code=0, stdout="OK", stderr="")

    sandbox.run_command.side_effect = fake_run

    logs = []
    res = service.execute_task(
        wbs_code="1.3",
        title="Auth Guard",
        summary="DoD assertions",
        max_test_retries=2,
        on_log=lambda l: logs.append(l),
    )

    assert res["success"] is True
    assert any("Starting auto-retry #1" in l for l in logs)
    assert any("Definition of Done verified" in l for l in logs)


def test_execute_wave_concurrency(service, mock_sandbox_strategy):
    sandbox = mock_sandbox_strategy.create_sandbox.return_value
    sandbox.run_command.return_value = MagicMock(exit_code=0, stdout="OK", stderr="")

    tasks = [
        {"id": "t1", "wbsCode": "1.1", "title": "Task 1", "parallelGroup": "Wave 1"},
        {"id": "t2", "wbsCode": "1.2", "title": "Task 2", "parallelGroup": "Wave 1"},
    ]

    wave_res = service.execute_wave(
        wave_name="Wave 1",
        tasks=tasks,
        max_workers=2,
    )

    assert wave_res["wave"] == "Wave 1"
    assert wave_res["total_tasks"] == 2
    assert wave_res["successful_tasks"] == 2
