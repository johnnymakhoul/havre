# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
from typing import Any, Dict, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from llms.github_service import GitHubService
from persistence.data_repository import DataRepository


class GitHubVerifyRequest(BaseModel):
    repo_url: str
    token: str


class GitHubPrRequest(BaseModel):
    head_branch: str
    base_branch: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    draft: Optional[bool] = True


class ApiGitHub:
    """API endpoints for GitHub Source Control verification, status, and PR operations."""

    def __init__(
        self,
        app: FastAPI,
        data_repository: Optional[DataRepository] = None,
        github_service: Optional[GitHubService] = None,
    ):
        self.data_repository = data_repository
        self.github_service = github_service or GitHubService()

        @app.post("/api/projects/github/verify")
        async def verify_github_connection(request: Request, body: GitHubVerifyRequest):
            """Verify repository access and token permissions."""
            if not body.repo_url or not body.token:
                raise HTTPException(
                    status_code=400, detail="Repository URL and Personal Access Token are required."
                )
            try:
                result = self.github_service.verify_connection(
                    repo_url=body.repo_url, token=body.token
                )
                return JSONResponse(result)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

        @app.get("/api/projects/{project_id}/github/status")
        async def get_project_github_status(project_id: str, request: Request):
            """Get linked repository metadata for a project (token masked for security)."""
            if not self.data_repository:
                raise HTTPException(status_code=500, detail="Data repository not available")

            projects = self.data_repository.get_projects()
            project = next((p for p in projects if p.get("id") == project_id), None)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")

            github_config = project.get("github") or {}
            token = github_config.get("token") or ""
            masked_token = (
                f"{token[:4]}...{token[-4:]}" if len(token) > 8 else ("***" if token else "")
            )

            return JSONResponse(
                {
                    "linked": bool(github_config.get("repoUrl")),
                    "repoUrl": github_config.get("repoUrl", ""),
                    "defaultBranch": github_config.get("defaultBranch", "main"),
                    "draftPr": github_config.get("draftPr", True),
                    "hasToken": bool(token),
                    "maskedToken": masked_token,
                }
            )

        @app.post("/api/projects/{project_id}/github/pull-request")
        async def create_project_pr(project_id: str, body: GitHubPrRequest, request: Request):
            """Create a Pull Request on the project's linked GitHub repository."""
            if not self.data_repository:
                raise HTTPException(status_code=500, detail="Data repository not available")

            projects = self.data_repository.get_projects()
            project = next((p for p in projects if p.get("id") == project_id), None)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")

            github_config = project.get("github") or {}
            repo_url = github_config.get("repoUrl")
            token = github_config.get("token")

            if not repo_url or not token:
                raise HTTPException(
                    status_code=400,
                    detail="Project does not have a linked GitHub repository or PAT configured.",
                )

            base_branch = body.base_branch or github_config.get("defaultBranch") or "main"
            draft = body.draft if body.draft is not None else github_config.get("draftPr", True)

            try:
                pr_result = self.github_service.create_draft_pr(
                    repo_url=repo_url,
                    token=token,
                    head_branch=body.head_branch,
                    base_branch=base_branch,
                    title=body.title,
                    body=body.body,
                    draft=draft,
                )
                return JSONResponse(pr_result)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to create PR: {str(e)}")

