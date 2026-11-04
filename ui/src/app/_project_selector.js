// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import React, { useState, useEffect } from "react";
import { Select, Button, Modal, Input, Checkbox, Tooltip, Alert } from "antd";
import {
  RiAddBoxLine,
  RiBriefcase2Line,
  RiDeleteBinLine,
  RiSettings4Line,
  RiGithubFill,
  RiCheckLine,
} from "react-icons/ri";
import { toast } from "react-toastify";
import {
  getProjects,
  getActiveProject,
  setActiveProject,
  addProject,
  updateProject,
  deleteProject,
  DEFAULT_PROJECT_SECTIONS,
} from "./_local_store";
import { PROJECT_SECTION_OPTIONS } from "./_navigation_items";

const ProjectSelector = ({ onProjectChange }) => {
  const [projects, setProjects] = useState(() => getProjects());
  const [activeProject, setActiveProjectState] = useState(() =>
    getActiveProject(),
  );

  // Add Project Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [selectedSections, setSelectedSections] = useState(
    DEFAULT_PROJECT_SECTIONS,
  );

  // Edit Project Settings Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSections, setEditSections] = useState(DEFAULT_PROJECT_SECTIONS);

  // GitHub Configuration State
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [githubToken, setGithubToken] = useState("");
  const [githubDraftPr, setGithubDraftPr] = useState(true);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  const syncProjects = () => {
    const updatedProjects = getProjects();
    const currentActive = getActiveProject();
    setProjects(updatedProjects);
    setActiveProjectState(currentActive);
    if (onProjectChange) {
      onProjectChange(currentActive);
    }
  };

  useEffect(() => {
    syncProjects();
    if (typeof window !== "undefined") {
      window.addEventListener("update-project", syncProjects);
      return () => {
        window.removeEventListener("update-project", syncProjects);
      };
    }
  }, []);

  const handleSelectProject = (projectId) => {
    const selected = setActiveProject(projectId);
    setActiveProjectState(selected);
    if (onProjectChange) {
      onProjectChange(selected);
    }
  };

  const resetAddModal = () => {
    setProjectName("");
    setProjectDescription("");
    setSelectedSections(DEFAULT_PROJECT_SECTIONS);
    setGithubRepoUrl("");
    setGithubBranch("main");
    setGithubToken("");
    setGithubDraftPr(true);
    setConnectionStatus(null);
    setIsAddModalOpen(false);
  };

  const openEditModal = () => {
    if (!activeProject) return;
    setEditName(activeProject.name || "");
    setEditDescription(activeProject.description || "");
    setEditSections(activeProject.sections || DEFAULT_PROJECT_SECTIONS);
    const gh = activeProject.github || {};
    setGithubRepoUrl(gh.repoUrl || "");
    setGithubBranch(gh.defaultBranch || "main");
    setGithubToken(gh.token || "");
    setGithubDraftPr(gh.draftPr !== false);
    setConnectionStatus(null);
    setIsEditModalOpen(true);
  };

  const resetEditModal = () => {
    setConnectionStatus(null);
    setIsEditModalOpen(false);
  };

  const handleTestConnection = async () => {
    if (!githubRepoUrl.trim() || !githubToken.trim()) {
      toast.error("Please provide both Repository URL and Personal Access Token");
      return;
    }
    setIsTestingConnection(true);
    setConnectionStatus(null);
    try {
      const res = await fetch("/api/projects/github/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: githubRepoUrl.trim(),
          token: githubToken.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setConnectionStatus({
          success: true,
          message: `Connected to ${data.full_name} (Default branch: ${data.default_branch})`,
        });
        if (!githubBranch.trim()) {
          setGithubBranch(data.default_branch || "main");
        }
        toast.success(`Verified access to ${data.full_name}`);
      } else {
        const errorMsg = data.detail || "Verification failed";
        setConnectionStatus({ success: false, message: errorMsg });
        toast.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err.message || "Failed to connect";
      setConnectionStatus({ success: false, message: errorMsg });
      toast.error(`Verification error: ${errorMsg}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleAddProject = () => {
    if (!projectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }
    if (!selectedSections || selectedSections.length === 0) {
      toast.error("Please select at least one project section");
      return;
    }

    const githubConfig = githubRepoUrl.trim()
      ? {
          enabled: true,
          repoUrl: githubRepoUrl.trim(),
          defaultBranch: githubBranch.trim() || "main",
          token: githubToken.trim(),
          draftPr: githubDraftPr,
        }
      : null;

    const created = addProject(
      projectName,
      projectDescription,
      selectedSections,
      githubConfig,
    );
    if (created) {
      toast.success(`Project "${created.name}" created!`);
      resetAddModal();
      syncProjects();
    }
  };

  const handleSaveEditProject = () => {
    if (!activeProject) return;
    if (!editName.trim()) {
      toast.error("Please enter a project name");
      return;
    }
    if (!editSections || editSections.length === 0) {
      toast.error("Please select at least one project section");
      return;
    }

    const githubConfig = githubRepoUrl.trim()
      ? {
          enabled: true,
          repoUrl: githubRepoUrl.trim(),
          defaultBranch: githubBranch.trim() || "main",
          token: githubToken.trim() || activeProject.github?.token || "",
          draftPr: githubDraftPr,
        }
      : null;

    const updated = updateProject(activeProject.id, {
      name: editName.trim(),
      description: editDescription.trim(),
      sections: editSections,
      github: githubConfig,
    });

    if (updated) {
      toast.success(`Project "${updated.name}" updated!`);
      resetEditModal();
      syncProjects();
    }
  };

  const handleDeleteProject = () => {
    if (!activeProject || activeProject.isDefault) return;
    const deletedName = activeProject.name;
    if (deleteProject(activeProject.id)) {
      toast.success(`Project "${deletedName}" deleted!`);
      syncProjects();
    }
  };

  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: (
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{project.name}</span>
        {project.github?.repoUrl && (
          <Tooltip title={`Linked to ${project.github.repoUrl}`}>
            <RiGithubFill style={{ marginLeft: "6px", color: "#1677ff", fontSize: "14px" }} />
          </Tooltip>
        )}
      </span>
    ),
  }));

  const sectionCheckboxOptions = PROJECT_SECTION_OPTIONS.map((opt) => ({
    label: opt.label,
    value: opt.key,
  }));

  const renderGitHubFormFields = () => (
    <div
      className="github-config-section"
      data-testid="github-config-section"
      style={{
        marginTop: "16px",
        padding: "12px",
        background: "#f9fafb",
        borderRadius: "6px",
        border: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "10px",
          fontWeight: 600,
          color: "#1f2937",
        }}
      >
        <RiGithubFill style={{ marginRight: "6px", fontSize: "18px" }} />
        <span>GitHub Source Control (Agents)</span>
      </div>

      <div className="project-form-field" style={{ marginBottom: "10px" }}>
        <label className="label" htmlFor="github-repo-url" style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>
          Repository URL
        </label>
        <Input
          id="github-repo-url"
          value={githubRepoUrl}
          onChange={(e) => setGithubRepoUrl(e.target.value)}
          placeholder="e.g. https://github.com/my-org/my-project"
          data-testid="github-repo-url-input"
          size="small"
        />
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor="github-branch-input" style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>
            Target Branch
          </label>
          <Input
            id="github-branch-input"
            value={githubBranch}
            onChange={(e) => setGithubBranch(e.target.value)}
            placeholder="main"
            data-testid="github-branch-input"
            size="small"
          />
        </div>

        <div style={{ flex: 1.5 }}>
          <label className="label" htmlFor="github-token-input" style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>
            Personal Access Token (PAT)
          </label>
          <Input.Password
            id="github-token-input"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder={activeProject?.github?.token ? "•••••••• (configured)" : "Fine-grained PAT with repo scope"}
            data-testid="github-token-input"
            size="small"
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <Checkbox
          checked={githubDraftPr}
          onChange={(e) => setGithubDraftPr(e.target.checked)}
          data-testid="github-draft-pr-checkbox"
        >
          <span style={{ fontSize: "12px" }}>Open Draft Pull Requests</span>
        </Checkbox>

        <Button
          size="small"
          onClick={handleTestConnection}
          loading={isTestingConnection}
          disabled={!githubRepoUrl || !githubToken}
          data-testid="github-test-connection-btn"
          icon={<RiCheckLine />}
        >
          Test Connection
        </Button>
      </div>

      {connectionStatus && (
        <Alert
          type={connectionStatus.success ? "success" : "error"}
          message={connectionStatus.message}
          showIcon
          style={{ marginTop: "8px", fontSize: "12px" }}
          data-testid="github-connection-status"
        />
      )}
    </div>
  );

  return (
    <div className="project-selector-container" data-testid="project-selector">
      <div className="project-selector-header">
        <span className="project-selector-title">
          <RiBriefcase2Line
            style={{
              marginRight: "6px",
              fontSize: "1rem",
              verticalAlign: "middle",
            }}
          />
          Project
        </span>
        <div className="project-selector-actions">
          {activeProject && (
            <Tooltip title="Project settings & GitHub integration">
              <Button
                type="link"
                size="small"
                onClick={openEditModal}
                data-testid="edit-project-button"
                aria-label="Project settings"
                className="project-action-btn"
              >
                <RiSettings4Line fontSize="medium" />
              </Button>
            </Tooltip>
          )}
          {!activeProject?.isDefault && (
            <Tooltip title="Delete current project">
              <Button
                type="link"
                size="small"
                onClick={handleDeleteProject}
                data-testid="delete-project-button"
                aria-label="Delete project"
                className="project-action-btn"
              >
                <RiDeleteBinLine fontSize="medium" />
              </Button>
            </Tooltip>
          )}
          <Tooltip title="Add a new project">
            <Button
              type="link"
              size="small"
              onClick={() => setIsAddModalOpen(true)}
              data-testid="add-project-button"
              aria-label="Add project"
              className="project-action-btn"
            >
              <RiAddBoxLine fontSize="medium" /> Add
            </Button>
          </Tooltip>
        </div>
      </div>

      <Select
        value={activeProject?.id}
        onChange={handleSelectProject}
        options={projectOptions}
        data-testid="project-select"
        className="project-select-dropdown"
        size="small"
        style={{ width: "100%" }}
      />

      {/* Add Project Modal */}
      <Modal
        title="Add new Project"
        open={isAddModalOpen}
        onCancel={resetAddModal}
        onOk={handleAddProject}
        okText="Save Project"
        className="add-project-modal"
      >
        <div className="project-form-field">
          <label className="label" htmlFor="project-name-input">
            Project Name
          </label>
          <Input
            id="project-name-input"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g., Retail Modernization"
            data-testid="project-name-input"
          />
        </div>

        <div className="project-form-field" style={{ marginTop: "12px" }}>
          <label className="label" htmlFor="project-description-input">
            Description (optional)
          </label>
          <Input.TextArea
            id="project-description-input"
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            placeholder="Brief description of the project"
            autoSize={{ minRows: 2, maxRows: 5 }}
            data-testid="project-description-input"
          />
        </div>

        <div className="project-form-field" style={{ marginTop: "12px" }}>
          <label className="label" style={{ display: "block", marginBottom: "6px" }}>
            Project Sections (Software Delivery)
          </label>
          <Checkbox.Group
            options={sectionCheckboxOptions}
            value={selectedSections}
            onChange={(checkedValues) => setSelectedSections(checkedValues)}
            data-testid="project-sections-checkbox-group"
          />
        </div>

        {renderGitHubFormFields()}
      </Modal>

      {/* Edit Project Settings Modal */}
      <Modal
        title={`Project Settings: ${activeProject?.name || ""}`}
        open={isEditModalOpen}
        onCancel={resetEditModal}
        onOk={handleSaveEditProject}
        okText="Save Changes"
        className="edit-project-modal"
      >
        <div className="project-form-field">
          <label className="label" htmlFor="edit-project-name-input">
            Project Name
          </label>
          <Input
            id="edit-project-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Project Name"
            data-testid="edit-project-name-input"
          />
        </div>

        <div className="project-form-field" style={{ marginTop: "12px" }}>
          <label className="label" htmlFor="edit-project-description-input">
            Description
          </label>
          <Input.TextArea
            id="edit-project-description-input"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Brief description of the project"
            autoSize={{ minRows: 2, maxRows: 5 }}
            data-testid="edit-project-description-input"
          />
        </div>

        <div className="project-form-field" style={{ marginTop: "12px" }}>
          <label className="label" style={{ display: "block", marginBottom: "6px" }}>
            Project Sections (Software Delivery)
          </label>
          <Checkbox.Group
            options={sectionCheckboxOptions}
            value={editSections}
            onChange={(checkedValues) => setEditSections(checkedValues)}
            data-testid="edit-project-sections-checkbox-group"
          />
        </div>

        {renderGitHubFormFields()}
      </Modal>
    </div>
  );
};

export default ProjectSelector;
