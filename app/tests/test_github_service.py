# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import json
import unittest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from llms.github_service import GitHubService
from api.api_github import ApiGitHub
from persistence.data_repository import DataRepository


class TestGitHubService(unittest.TestCase):
    def setUp(self):
        self.service = GitHubService()

    def test_parse_repo_url_formats(self):
        # https format
        owner, repo = self.service.parse_repo_url("https://github.com/thoughtworks/haiven")
        self.assertEqual(owner, "thoughtworks")
        self.assertEqual(repo, "haiven")

        # with .git
        owner, repo = self.service.parse_repo_url("https://github.com/octocat/Hello-World.git")
        self.assertEqual(owner, "octocat")
        self.assertEqual(repo, "Hello-World")

        # git ssh format
        owner, repo = self.service.parse_repo_url("git@github.com:facebook/react.git")
        self.assertEqual(owner, "facebook")
        self.assertEqual(repo, "react")

        # simple owner/repo
        owner, repo = self.service.parse_repo_url("tw-haiven/sample-pack")
        self.assertEqual(owner, "tw-haiven")
        self.assertEqual(repo, "sample-pack")

        # invalid url
        with self.assertRaises(ValueError):
            self.service.parse_repo_url("invalid-url-with-no-slash")

    @patch("urllib.request.urlopen")
    def test_verify_connection_success(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "full_name": "thoughtworks/haiven",
            "default_branch": "main",
            "private": True,
            "permissions": {"push": True, "pull": True},
            "html_url": "https://github.com/thoughtworks/haiven",
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = self.service.verify_connection("https://github.com/thoughtworks/haiven", "fake-token")
        self.assertTrue(res["valid"])
        self.assertEqual(res["owner"], "thoughtworks")
        self.assertEqual(res["repo"], "haiven")
        self.assertEqual(res["default_branch"], "main")
        self.assertTrue(res["can_push"])

    @patch("urllib.request.urlopen")
    def test_create_draft_pr_success(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "id": 12345,
            "number": 42,
            "html_url": "https://github.com/thoughtworks/haiven/pull/42",
            "title": "Spike: Auth Refactor",
            "state": "open",
            "draft": True,
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = self.service.create_draft_pr(
            repo_url="https://github.com/thoughtworks/haiven",
            token="fake-token",
            head_branch="haiven/spike-auth",
            base_branch="main",
            title="Spike: Auth Refactor",
            body="Generated spike implementation",
            draft=True,
        )
        self.assertEqual(res["number"], 42)
        self.assertTrue(res["draft"])
        self.assertEqual(res["html_url"], "https://github.com/thoughtworks/haiven/pull/42")


class TestApiGitHub(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.repo = DataRepository(repo_type="json", file_path="/tmp/test_gh_repo.json")
        self.mock_gh_service = MagicMock(spec=GitHubService)
        ApiGitHub(self.app, data_repository=self.repo, github_service=self.mock_gh_service)
        self.client = TestClient(self.app)

    def test_verify_endpoint(self):
        self.mock_gh_service.verify_connection.return_value = {
            "valid": True,
            "owner": "test-owner",
            "repo": "test-repo",
            "default_branch": "main",
            "can_push": True,
        }

        res = self.client.post(
            "/api/projects/github/verify",
            json={"repo_url": "https://github.com/test-owner/test-repo", "token": "ghp_1234567890"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["valid"])
        self.mock_gh_service.verify_connection.assert_called_once_with(
            repo_url="https://github.com/test-owner/test-repo",
            token="ghp_1234567890",
        )

    def test_project_github_status_and_pr_creation(self):
        # Create a test project with github config
        project = self.repo.add_project({
            "name": "Integration Project",
            "github": {
                "repoUrl": "https://github.com/org/repo",
                "defaultBranch": "develop",
                "token": "github_pat_11AAAAABBBBBCCCCCDDDD",
                "draftPr": True,
            },
        })
        proj_id = project["id"]

        # 1. Check status endpoint (verifies token is masked!)
        status_res = self.client.get(f"/api/projects/{proj_id}/github/status")
        self.assertEqual(status_res.status_code, 200)
        status = status_res.json()
        self.assertTrue(status["linked"])
        self.assertEqual(status["repoUrl"], "https://github.com/org/repo")
        self.assertEqual(status["defaultBranch"], "develop")
        self.assertTrue(status["hasToken"])
        self.assertIn("...", status["maskedToken"])
        self.assertNotIn("11AAAAABBBBBCCCCCDDDD", status["maskedToken"])

        # 2. Call PR endpoint
        self.mock_gh_service.create_draft_pr.return_value = {
            "number": 99,
            "html_url": "https://github.com/org/repo/pull/99",
            "draft": True,
        }
        pr_res = self.client.post(
            f"/api/projects/{proj_id}/github/pull-request",
            json={"head_branch": "haiven/feature-test", "title": "Test PR"},
        )
        self.assertEqual(pr_res.status_code, 200)
        self.assertEqual(pr_res.json()["number"], 99)
        self.mock_gh_service.create_draft_pr.assert_called_once()

