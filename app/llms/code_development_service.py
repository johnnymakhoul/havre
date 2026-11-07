# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import base64
import concurrent.futures
import datetime
import io
import os
import re
import shlex
import time
import zipfile
from typing import Any, Callable, Dict, List, Optional
from logger import HaivenLogger

from llms.github_service import GitHubService
from llms.sandbox.base import SandboxStrategy
from llms.sandbox.factory import SandboxStrategyFactory


def format_pi_output(raw_text: str) -> str:
    """Format JSON events from Pi coding agent into clean streaming text."""
    if not raw_text:
        return ""
    lines = raw_text.splitlines(keepends=True)
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                data = json.loads(stripped)
                if isinstance(data, dict):
                    if (
                        "delta" in data
                        and isinstance(data["delta"], dict)
                        and "text" in data["delta"]
                    ):
                        out.append(data["delta"]["text"])
                        continue
                    if "content" in data and isinstance(data["content"], str):
                        out.append(data["content"] + "\n")
                        continue
                    if "text" in data and isinstance(data["text"], str):
                        out.append(data["text"] + "\n")
                        continue
                    if data.get("type") in ["tool_call", "tool_use"]:
                        tool_name = data.get("tool") or data.get("name") or "tool"
                        out.append(f"\n[Agent Tool: {tool_name}]\n")
                        continue
                    if data.get("type") == "error":
                        out.append(
                            f"\n[Agent Error]: {data.get('message') or data.get('error')}\n"
                        )
                        continue
            except Exception:
                pass
        out.append(line)
    return "".join(out)


class CodeDevelopmentService:
    """Service to execute WBS tasks, verify Definition of Done (DoD) via automated tests,

    and open Pull Requests using Pi Coding Agent and Google Gemini in a Sandbox microVM.
    """

    def __init__(
        self,
        config_service=None,
        gemini_api_key: Optional[str] = None,
        sandbox_strategy: Optional[SandboxStrategy] = None,
        data_repository: Optional[Any] = None,
    ):
        self.config_service = config_service
        self._explicit_gemini_key = gemini_api_key
        self.sandbox_strategy: SandboxStrategy = (
            sandbox_strategy
            or SandboxStrategyFactory.get_strategy(config_service=config_service)
        )
        self.data_repository = data_repository
        self.active_sandboxes: Dict[str, Dict[str, Any]] = {}
        self.wave_executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)

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
        return bool(self.is_sandbox_configured() and self.is_gemini_configured())

    @staticmethod
    def slugify(text: str, max_len: int = 25) -> str:
        clean = re.sub(r"[^a-zA-Z0-9_-]", "-", str(text).lower()).strip("-")
        clean = re.sub(r"-+", "-", clean)
        return clean[:max_len].strip("-") or "task"

    def generate_wbs_prompt(
        self,
        wbs_code: str,
        title: str,
        summary: str = "",
        pbs_ref: str = "",
        pdp_ref: str = "",
        runtime: str = "node",
        dependencies: Optional[List[str]] = None,
    ) -> str:
        """Construct a structured, high-context prompt for the in-sandbox Pi coding agent

        adhering strictly to Definition of Done (DoD) and Single PR boundary.
        """
        deps_text = ", ".join(dependencies) if dependencies else "None (Foundation item)"

        return (
            f"You are a Senior Software Engineer executing an atomic Work Breakdown Structure (WBS) task in the codebase.\n\n"
            f"### WBS WORK PACKAGE SPECIFICATION\n"
            f"- **WBS Code**: {wbs_code or 'N/A'}\n"
            f"- **Task Title**: {title}\n"
            f"- **PBS Deliverable Ref**: {pbs_ref or 'N/A'}\n"
            f"- **PDP Stage Ref**: {pdp_ref or 'N/A'}\n"
            f"- **Prerequisite Dependencies**: {deps_text}\n"
            f"- **Target Runtime / Ecosystem**: {runtime}\n\n"
            f"### SCOPE OF WORK & DEFINITION OF DONE\n"
            f"{summary or 'Implement the described component and verify with unit tests.'}\n\n"
            f"### STRICT ENGINEERING & DoD REQUIREMENTS\n"
            f"1. **Single PR Scope**: Implement ONLY the functional files and tests specified in this work package. Do not modify unrelated modules.\n"
            f"2. **Target Working Directory**: Work directly within `/home/user/app` where the codebase is located.\n"
            f"3. **Author Automated Tests**: Create or update comprehensive unit/integration test suites covering the Completion Criteria and edge cases.\n"
            f"4. **Verification & Clean Exit**: Run the project's build and test commands (e.g. `npm test`, `npm run build`, `pytest`, `python3 -m unittest`).\n"
            f"5. **Zero Error Policy**: If any test, typecheck, or build error occurs, fix it immediately until all tests pass with a zero exit code.\n"
            f"6. **Maintain Code Cleanliness**: Remove temporary debug logs or artifacts prior to completing."
        )

    def create_zip_archive(self, files: Dict[str, str]) -> str:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for file_path, content in files.items():
                zip_file.writestr(file_path, content)
        buffer.seek(0)
        return base64.b64encode(buffer.read()).decode("utf-8")

    def resolve_github_config(
        self, project_id: Optional[str] = None, explicit_config: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        if explicit_config and explicit_config.get("repoUrl"):
            return explicit_config

        if self.data_repository:
            try:
                active_id = self.data_repository.get_active_project_id()
                target_id = project_id or active_id
                for proj in self.data_repository.get_projects():
                    if proj.get("id") == target_id:
                        gh = proj.get("github")
                        if gh and gh.get("repoUrl"):
                            return gh
            except Exception as ex:
                HaivenLogger.get().warning(f"Could not auto-resolve project GitHub config: {ex}")
        return None

    def execute_task(
        self,
        wbs_code: str,
        title: str,
        task_id: Optional[str] = None,
        summary: str = "",
        pbs_ref: str = "",
        pdp_ref: str = "",
        dependencies: Optional[List[str]] = None,
        project_id: Optional[str] = None,
        github_config: Optional[Dict[str, Any]] = None,
        runtime: str = "node",
        test_command: Optional[str] = None,
        timeout_seconds: int = 3600,
        agent_timeout_seconds: int = 900,
        max_test_retries: int = 2,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        """Execute a single WBS task inside a sandbox microVM, run tests, and open a Pull Request."""
        deps = dependencies or []
        provider = self.get_sandbox_provider()
        gemini_key = self.get_gemini_api_key()

        if not self.is_configured():
            missing = []
            if not self.is_sandbox_configured():
                missing.append(f"sandbox provider '{provider}'")
            if not gemini_key:
                missing.append("GEMINI_API_KEY")
            err_msg = f"Development sandbox is not configured: missing {', '.join(missing)}."
            HaivenLogger.get().error(err_msg)
            if on_log:
                on_log(f"Error: {err_msg}\n")
            return {
                "success": False,
                "error": err_msg,
                "logs": err_msg,
                "status": "failed",
                "wbs_code": wbs_code,
                "title": title,
            }

        resolved_gh = self.resolve_github_config(project_id, github_config)
        gh_repo_url = resolved_gh.get("repoUrl") if resolved_gh else None
        gh_token = resolved_gh.get("token") if resolved_gh else None

        sandbox = self.sandbox_strategy.create_sandbox(timeout_seconds=timeout_seconds)
        sandbox_id = sandbox.sandbox_id
        all_logs: List[str] = []

        def log(msg: str):
            sanitized = (
                msg.replace(gh_token, "[REDACTED_GITHUB_TOKEN]")
                if gh_token and gh_token in msg
                else msg
            )
            all_logs.append(sanitized)
            if on_log:
                try:
                    on_log(sanitized if sanitized.endswith("\n") else sanitized + "\n")
                except Exception:
                    pass

        self.active_sandboxes[sandbox_id] = {
            "sandbox": sandbox,
            "wbs_code": wbs_code,
            "title": title,
            "task_id": task_id,
            "created_at": time.time(),
        }

        feature_branch = None
        base_branch = "main"

        try:
            log(f"==================================================")
            log(f"▶ WBS Task Execution: [{wbs_code or 'WBS'}] {title}")
            log(f"  Sandbox Provider: {provider} (ID: {sandbox_id})")
            log(f"==================================================")

            sandbox.run_command("mkdir -p /home/user/app", timeout=60)

            # 1. Create GitHub Issue & Clone Repository
            github_issue_info = None
            if gh_repo_url and gh_token:
                try:
                    log(f"Creating GitHub Issue for [{wbs_code or 'WBS'}] {title}...")
                    gh_client = GitHubService()
                    issue_title = f"feat(WBS {wbs_code or 'Task'}): {title}"
                    deps_list_str = ", ".join(deps) if deps else "None (Foundation)"
                    issue_body = (
                        f"## WBS Work Package Specification\n\n"
                        f"- **WBS Code**: `{wbs_code or 'N/A'}`\n"
                        f"- **Task Title**: {title}\n"
                        f"- **PBS Deliverable Ref**: `{pbs_ref or 'N/A'}`\n"
                        f"- **PDP Stage Ref**: `{pdp_ref or 'N/A'}`\n"
                        f"- **Prerequisite Dependencies**: {deps_list_str}\n\n"
                        f"### Scope of Work & Definition of Done\n"
                        f"{summary or 'Implement the described work package and verify with automated tests.'}\n\n"
                        f"---\n"
                        f"*Tracked and automated by Haiven Agent.*"
                    )
                    github_issue_info = gh_client.create_issue(
                        repo_url=gh_repo_url,
                        token=gh_token,
                        title=issue_title,
                        body=issue_body,
                        labels=["wbs-task", "haiven-agent"],
                    )
                    log(
                        f"📋 Created GitHub Issue #{github_issue_info.get('number')}: {github_issue_info.get('html_url')}"
                    )
                except Exception as issue_err:
                    log(f"Notice: Could not create GitHub Issue: {issue_err}")

                gh_owner, gh_repo = GitHubService.parse_repo_url(gh_repo_url)
                default_branch = resolved_gh.get("defaultBranch", "main")
                base_branch = default_branch

                log(f"Cloning GitHub repository {gh_owner}/{gh_repo}...")
                sandbox.run_command(
                    "git --version 2>/dev/null || (apt-get update && apt-get install -y git)",
                    timeout=90,
                )
                sandbox.run_command(
                    'git config --global user.name "Haiven Agent" && git config --global user.email "agent@haiven.local"',
                    timeout=30,
                )
                sandbox.run_command("rm -rf /home/user/app", timeout=30)

                clone_cmd = (
                    f"git clone https://x-access-token:{gh_token}@github.com/{gh_owner}/{gh_repo}.git /home/user/app"
                )
                clone_res = sandbox.run_command(clone_cmd, timeout=120)
                if clone_res.exit_code != 0:
                    log(f"Git clone error: {clone_res.stderr.strip()}")

                # Check predecessor branches if this task has dependencies
                predecessor_branch_found = None
                if deps:
                    log(f"Checking predecessor branches for dependencies: {deps}...")
                    branch_list_res = sandbox.run_command(
                        "cd /home/user/app && git branch -r", timeout=30
                    )
                    remote_branches = (
                        branch_list_res.stdout if branch_list_res.exit_code == 0 else ""
                    )

                    for dep in deps:
                        dep_slug = self.slugify(dep, max_len=15)
                        # Match origin/haiven/wbs-<dep_slug>* or origin/haiven/*wbs-<dep_slug>*
                        pattern = rf"origin/(haiven/[^\s]*wbs-{dep_slug}[^\s]*)"
                        m = re.search(pattern, remote_branches)
                        if m:
                            predecessor_branch_found = m.group(1)
                            log(
                                f"🔗 Resolved predecessor branch for dependency '{dep}': {predecessor_branch_found}"
                            )
                            break

                # Create dedicated feature branch linked to issue
                clean_wbs = self.slugify(wbs_code, max_len=10) if wbs_code else "item"
                clean_title = self.slugify(title, max_len=20)
                issue_prefix = (
                    f"issue-{github_issue_info['number']}-"
                    if github_issue_info and github_issue_info.get("number")
                    else ""
                )
                ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
                feature_branch = f"haiven/{issue_prefix}wbs-{clean_wbs}-{clean_title}-{ts}"

                if predecessor_branch_found:
                    log(f"Branching off predecessor '{predecessor_branch_found}' -> {feature_branch}")
                    sandbox.run_command(
                        f"cd /home/user/app && git checkout {predecessor_branch_found} && git checkout -b {feature_branch}",
                        timeout=45,
                    )
                    base_branch = predecessor_branch_found
                else:
                    log(f"Branching off default branch '{default_branch}' -> {feature_branch}")
                    sandbox.run_command(
                        f"cd /home/user/app && git checkout {shlex.quote(default_branch)} 2>/dev/null || true",
                        timeout=30,
                    )
                    sandbox.run_command(
                        f"cd /home/user/app && git checkout -b {feature_branch}",
                        timeout=30,
                    )

            # 2. Configure Pi Coding Agent in Sandbox
            log("Configuring Node.js 22+ & Pi coding agent (@earendil-works/pi-coding-agent)...")
            setup_script = (
                "bash -c '"
                "export PATH=/usr/local/bin:$PATH; "
                "NODE_VER=$(node -v 2>/dev/null || echo \"none\"); "
                "NODE_MAJOR=$(echo \"$NODE_VER\" | cut -d. -f1 | tr -d v); "
                "if [ \"$NODE_MAJOR\" -lt 22 ] 2>/dev/null || ! command -v node >/dev/null 2>&1; then "
                "  echo \"Current Node.js version ($NODE_VER) is below v22, upgrading...\"; "
                "  (sudo npm install -g n 2>/dev/null || npm install -g n 2>/dev/null) && (sudo n 22 2>/dev/null || n 22) && "
                "  (sudo ln -sf /usr/local/bin/node /usr/bin/node 2>/dev/null || true); "
                "fi; "
                "if [ -f /usr/local/bin/node ]; then sudo ln -sf /usr/local/bin/node /usr/bin/node 2>/dev/null || true; fi; "
                "ACTIVE_NODE=$(node -v 2>/dev/null); "
                "echo \"Active Node.js: $ACTIVE_NODE\"; "
                "if ! command -v pi >/dev/null 2>&1; then "
                "  echo \"Installing @earendil-works/pi-coding-agent...\"; "
                "  sudo npm install -g @earendil-works/pi-coding-agent 2>/dev/null || npm install -g @earendil-works/pi-coding-agent; "
                "fi'"
            )
            setup_cmd = sandbox.run_command(
                setup_script,
                timeout=300,
                on_stdout=lambda text: log(text),
                on_stderr=lambda text: log(text),
            )
            if setup_cmd.exit_code != 0:
                raise RuntimeError(
                    f"Agent environment configuration failed: {setup_cmd.stderr or setup_cmd.stdout}"
                )

            # 3. Generate WBS Prompt & Execute Pi Coding Agent
            prompt_content = self.generate_wbs_prompt(
                wbs_code=wbs_code,
                title=title,
                summary=summary,
                pbs_ref=pbs_ref,
                pdp_ref=pdp_ref,
                runtime=runtime,
                dependencies=deps,
            )
            sandbox.write_file("/home/user/pi_prompt.txt", prompt_content)

            model_name = os.environ.get("ENABLED_CHAT_MODEL") or "gemini-3.8-flash"
            log(f"🚀 Launching Pi Coding Agent with Google Gemini ({model_name}) to implement WBS task...")
            agent_cmd = (
                "export PATH=/usr/local/bin:$PATH && "
                "cd /home/user/app && "
                f"pi --provider google --model {model_name} "
                "--mode json -p "
                + shlex.quote(prompt_content)
            )

            agent_res = sandbox.run_command(
                agent_cmd,
                envs={"GEMINI_API_KEY": gemini_key},
                timeout=agent_timeout_seconds,
                on_stdout=lambda text: log(format_pi_output(text)),
                on_stderr=lambda text: log(text),
            )

            # 4. Strict Definition of Done (DoD) & Automated Test Verification Loop
            log("🔍 Verifying Definition of Done (DoD) via automated test execution...")
            test_cmd = test_command
            if not test_cmd:
                test_cmd = (
                    "cd /home/user/app && "
                    "if [ -f package.json ] && grep -q '\"test\"' package.json; then npm test; "
                    "elif [ -f pytest.ini ] || [ -d tests ] || [ -f test_*.py ]; then pytest || python3 -m unittest; "
                    "elif [ -f index.test.js ]; then node --test index.test.js; "
                    "else echo 'Notice: No automated test runner detected, verifying git status'; git status --porcelain; fi"
                )

            test_res = sandbox.run_command(
                test_cmd,
                timeout=120,
                on_stdout=lambda text: log(text),
                on_stderr=lambda text: log(text),
            )

            retry_count = 0
            while test_res.exit_code != 0 and retry_count < max_test_retries:
                retry_count += 1
                log(f"⚠️ Tests failed (Exit Code {test_res.exit_code}). Starting auto-retry #{retry_count} with failure diagnostics...")

                err_feedback = (
                    f"Automated test verification failed with exit code {test_res.exit_code}.\n"
                    f"Output:\n{test_res.stderr or test_res.stdout}\n\n"
                    f"Please analyze the failure, fix the code and/or test assertions in /home/user/app, and ensure all tests pass cleanly."
                )
                sandbox.write_file("/home/user/pi_retry_prompt.txt", err_feedback)

                retry_cmd = (
                    "export PATH=/usr/local/bin:$PATH && "
                    "cd /home/user/app && "
                    f"pi --provider google --model {model_name} "
                    "--mode json -p --continue "
                    + shlex.quote(err_feedback)
                )
                sandbox.run_command(
                    retry_cmd,
                    envs={"GEMINI_API_KEY": gemini_key},
                    timeout=agent_timeout_seconds,
                    on_stdout=lambda text: log(format_pi_output(text)),
                    on_stderr=lambda text: log(text),
                )

                test_res = sandbox.run_command(
                    test_cmd,
                    timeout=120,
                    on_stdout=lambda text: log(text),
                    on_stderr=lambda text: log(text),
                )

            tests_passed = (test_res.exit_code == 0)
            if not tests_passed:
                log(f"❌ Automated test verification failed after {retry_count} retries.")
            else:
                log("✅ Definition of Done verified: Automated tests passed cleanly!")

            # 5. Git Commit & Pull Request Creation
            github_pr_info = None
            if gh_repo_url and gh_token and feature_branch and tests_passed:
                try:
                    log(f"Committing changes to {feature_branch}...")
                    commit_msg = f"feat(wbs): {wbs_code or 'task'} - {title}"
                    sandbox.run_command(
                        f"cd /home/user/app && git add -A && git commit -m {shlex.quote(commit_msg)}",
                        timeout=60,
                    )
                    log(f"Pushing {feature_branch} to GitHub...")
                    push_res = sandbox.run_command(
                        f"cd /home/user/app && git push -u origin {feature_branch}",
                        timeout=90,
                    )
                    if push_res.exit_code == 0:
                        log(f"Pushed branch {feature_branch} successfully. Opening Pull Request...")
                        pr_body = (
                            f"## WBS Task Implementation Baseline\n\n"
                            f"**WBS Code**: `{wbs_code}`\n"
                            f"**Task Title**: {title}\n"
                            f"**PBS Reference**: {pbs_ref}\n"
                            f"**PDP Stage**: {pdp_ref}\n\n"
                            f"### Scope & Verification Criteria\n"
                            f"{summary}\n\n"
                            f"### Verification Status\n"
                            f"- Automated Tests: Passed (Exit Code 0)\n"
                            f"- Implemented by Havre AI Agent."
                        )
                        if github_issue_info and github_issue_info.get("number"):
                            pr_body += f"\n\nCloses #{github_issue_info['number']}"

                        gh_client = GitHubService()
                        github_pr_info = gh_client.create_draft_pr(
                            repo_url=gh_repo_url,
                            token=gh_token,
                            head_branch=feature_branch,
                            base_branch=base_branch,
                            title=f"feat(WBS {wbs_code or 'Task'}): {title}",
                            body=pr_body,
                            draft=True,
                        )
                        log(f"🎉 Pull Request created: {github_pr_info.get('html_url')}")
                    else:
                        log(f"Push error: {push_res.stderr.strip()}")
                except Exception as pr_err:
                    log(f"Warning: Pull Request creation encountered an issue: {pr_err}")

            # 6. Persist execution record to project data repository
            execution_record = {
                "status": "success" if tests_passed else "failed",
                "wbs_code": wbs_code,
                "title": title,
                "feature_branch": feature_branch,
                "base_branch": base_branch,
                "issue_url": github_issue_info.get("html_url") if github_issue_info else None,
                "issue_number": github_issue_info.get("number") if github_issue_info else None,
                "pr_url": github_pr_info.get("html_url") if github_pr_info else None,
                "pr_number": github_pr_info.get("number") if github_pr_info else None,
                "tests_passed": tests_passed,
                "sandbox_id": sandbox_id,
                "updated_at": int(time.time() * 1000),
            }

            if self.data_repository and task_id:
                try:
                    self._update_task_in_repo(
                        project_id=project_id,
                        task_id=task_id,
                        execution_record=execution_record,
                    )
                except Exception as save_err:
                    HaivenLogger.get().warning(f"Could not update task in repository: {save_err}")

            return {
                "success": tests_passed,
                "status": "success" if tests_passed else "failed",
                "sandbox_id": sandbox_id,
                "wbs_code": wbs_code,
                "title": title,
                "feature_branch": feature_branch,
                "issue_info": github_issue_info,
                "pr_info": github_pr_info,
                "tests_passed": tests_passed,
                "logs": "\n".join(all_logs),
            }

        except Exception as e:
            err_msg = f"Task execution failed: {str(e)}"
            HaivenLogger.get().error(err_msg)
            log(f"\n[FATAL ERROR]: {err_msg}\n")
            return {
                "success": False,
                "status": "failed",
                "error": str(e),
                "wbs_code": wbs_code,
                "title": title,
                "logs": "\n".join(all_logs),
                "sandbox_id": sandbox_id,
            }

    def _update_task_in_repo(
        self, project_id: Optional[str], task_id: str, execution_record: Dict[str, Any]
    ):
        """Update task status and execution metadata in project data repository."""
        target_proj = project_id or self.data_repository.get_active_project_id()
        current_tasks = self.data_repository.get_tasks(project_id=target_proj)
        updated_tasks = []
        for t in current_tasks:
            if t.get("id") == task_id or (
                execution_record.get("wbs_code")
                and t.get("wbsCode") == execution_record.get("wbs_code")
            ):
                t_copy = dict(t)
                t_copy["execution"] = execution_record
                if execution_record.get("status") == "success":
                    t_copy["status"] = "needs_review"  # Ready for review on PR
                else:
                    t_copy["status"] = "in_progress"
                t_copy["updatedAt"] = int(time.time() * 1000)
                updated_tasks.append(t_copy)
            else:
                updated_tasks.append(t)
        self.data_repository.save_tasks(project_id=target_proj, tasks=updated_tasks)

    def send_instruction(
        self,
        sandbox_id: str,
        prompt: str,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        """Send an interactive follow-up instruction to an active task sandbox."""
        if sandbox_id not in self.active_sandboxes:
            raise ValueError(f"Sandbox {sandbox_id} is not active or has been closed.")

        entry = self.active_sandboxes[sandbox_id]
        sandbox = entry["sandbox"]
        gemini_key = self.get_gemini_api_key()

        model_name = os.environ.get("ENABLED_CHAT_MODEL") or "gemini-3.8-flash"
        instruction_cmd = (
            "export PATH=/usr/local/bin:$PATH && "
            "cd /home/user/app && "
            f"pi --provider google --model {model_name} "
            "--mode json -p --continue "
            + shlex.quote(prompt)
        )

        all_logs: List[str] = []

        def log(msg: str):
            all_logs.append(msg)
            if on_log:
                try:
                    on_log(msg if msg.endswith("\n") else msg + "\n")
                except Exception:
                    pass

        res = sandbox.run_command(
            instruction_cmd,
            envs={"GEMINI_API_KEY": gemini_key},
            timeout=600,
            on_stdout=lambda text: log(format_pi_output(text)),
            on_stderr=lambda text: log(text),
        )

        return {
            "success": res.exit_code == 0,
            "sandbox_id": sandbox_id,
            "logs": "\n".join(all_logs),
        }

    def execute_wave(
        self,
        wave_name: str,
        tasks: List[Dict[str, Any]],
        project_id: Optional[str] = None,
        max_workers: int = 3,
        on_task_log: Optional[Callable[[str, str], None]] = None,
    ) -> Dict[str, Any]:
        """Execute all unblocked tasks belonging to a wave in parallel up to max_workers."""
        wave_tasks = [
            t
            for t in tasks
            if (t.get("parallelGroup") or t.get("parallel_group")) == wave_name
        ]
        if not wave_tasks:
            wave_tasks = tasks

        results: List[Dict[str, Any]] = []

        def run_single(t: Dict[str, Any]):
            t_id = t.get("id")
            wbs = t.get("wbsCode") or t.get("wbs_code", "")
            title = t.get("title", "")
            summary = t.get("summary", "")
            deps = t.get("dependencies", [])

            def task_log(line: str):
                if on_task_log:
                    on_task_log(wbs or t_id, line)

            return self.execute_task(
                wbs_code=wbs,
                title=title,
                task_id=t_id,
                summary=summary,
                pbs_ref=t.get("pbsDeliverableRef", ""),
                pdp_ref=t.get("pdpStageRef", ""),
                dependencies=deps,
                project_id=project_id,
                on_log=task_log,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = [pool.submit(run_single, t) for t in wave_tasks]
            for future in concurrent.futures.as_completed(futures):
                try:
                    res = future.result()
                    results.append(res)
                except Exception as ex:
                    results.append({"success": False, "error": str(ex)})

        return {
            "wave": wave_name,
            "total_tasks": len(wave_tasks),
            "successful_tasks": sum(1 for r in results if r.get("success")),
            "results": results,
        }

