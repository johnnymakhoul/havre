// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import ProjectSelector from "../app/_project_selector";
import { addProject, getProjects, setActiveProject } from "../app/_local_store";

describe("ProjectSelector GitHub Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("should display GitHub fields in the Add Project modal and create project with GitHub configuration", async () => {
    await act(async () => {
      render(<ProjectSelector />);
    });

    const addBtn = screen.getByTestId("add-project-button");
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(screen.getByTestId("github-config-section")).toBeInTheDocument();
    expect(screen.getByTestId("github-repo-url-input")).toBeInTheDocument();
    expect(screen.getByTestId("github-branch-input")).toBeInTheDocument();
    expect(screen.getByTestId("github-token-input")).toBeInTheDocument();
    expect(screen.getByTestId("github-draft-pr-checkbox")).toBeInTheDocument();

    // Fill in project and github details
    await act(async () => {
      fireEvent.change(screen.getByTestId("project-name-input"), {
        target: { value: "GitHub Integrated Project" },
      });
      fireEvent.change(screen.getByTestId("github-repo-url-input"), {
        target: { value: "https://github.com/thoughtworks/haiven" },
      });
      fireEvent.change(screen.getByTestId("github-branch-input"), {
        target: { value: "main" },
      });
      fireEvent.change(screen.getByTestId("github-token-input"), {
        target: { value: "ghp_secret_token_123" },
      });
    });

    // Save project
    const saveBtn = screen.getByRole("button", { name: "Save Project" });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    const projects = getProjects();
    const created = projects.find((p) => p.name === "GitHub Integrated Project");
    expect(created).toBeDefined();
    expect(created.github).toBeDefined();
    expect(created.github.repoUrl).toBe("https://github.com/thoughtworks/haiven");
    expect(created.github.defaultBranch).toBe("main");
    expect(created.github.token).toBe("ghp_secret_token_123");
    expect(created.github.draftPr).toBe(true);
  });

  it("should trigger connection verification when Test Connection is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        valid: true,
        full_name: "thoughtworks/haiven",
        default_branch: "main",
      }),
    });

    await act(async () => {
      render(<ProjectSelector />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("add-project-button"));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId("github-repo-url-input"), {
        target: { value: "https://github.com/thoughtworks/haiven" },
      });
      fireEvent.change(screen.getByTestId("github-token-input"), {
        target: { value: "ghp_valid_token" },
      });
    });

    const testBtn = screen.getByTestId("github-test-connection-btn");
    await act(async () => {
      fireEvent.click(testBtn);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/github/verify",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            repo_url: "https://github.com/thoughtworks/haiven",
            token: "ghp_valid_token",
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("github-connection-status")).toBeInTheDocument();
      expect(screen.getByText(/Connected to thoughtworks\/haiven/i)).toBeInTheDocument();
    });
  });

  it("should allow editing GitHub settings on an existing active project", async () => {
    const existing = addProject("Existing App", "App desc", ["coding"]);
    setActiveProject(existing.id);

    await act(async () => {
      render(<ProjectSelector />);
    });

    const editBtn = screen.getByTestId("edit-project-button");
    await act(async () => {
      fireEvent.click(editBtn);
    });

    expect(screen.getByTestId("edit-project-name-input")).toHaveValue("Existing App");

    await act(async () => {
      fireEvent.change(screen.getByTestId("github-repo-url-input"), {
        target: { value: "https://github.com/org/repo-updated" },
      });
      fireEvent.change(screen.getByTestId("github-branch-input"), {
        target: { value: "develop" },
      });
      fireEvent.change(screen.getByTestId("github-token-input"), {
        target: { value: "ghp_new_pat" },
      });
    });

    const saveChangesBtn = screen.getByRole("button", { name: "Save Changes" });
    await act(async () => {
      fireEvent.click(saveChangesBtn);
    });

    const projects = getProjects();
    const updated = projects.find((p) => p.id === existing.id);
    expect(updated.github.repoUrl).toBe("https://github.com/org/repo-updated");
    expect(updated.github.defaultBranch).toBe("develop");
    expect(updated.github.token).toBe("ghp_new_pat");
  });
});

