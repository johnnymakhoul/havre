// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WorkflowPage from "../pages/workflow";
import WorkflowStageReview from "../app/_workflow_stage_review";
import WorkflowDossierHandoff from "../app/_workflow_dossier_handoff";
import {
  saveProjectWorkflow,
  resetProjectWorkflow,
  getProjectWorkflow,
  getProjectTasks,
} from "../app/_local_store";

// Mock window.matchMedia for Ant Design components
window.matchMedia =
  window.matchMedia ||
  function () {
    return {
      matches: false,
      addListener: function () {},
      removeListener: function () {},
      addEventListener: function () {},
      removeEventListener: function () {},
      dispatchEvent: function () {},
    };
  };

// Mock next/router and next/navigation
vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/workflow",
    push: vi.fn(),
  }),
}));

vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("Project Automation Workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    resetProjectWorkflow("default");
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should render workflow page with pre-flight checklist and initial brief", async () => {
    await act(async () => {
      render(<WorkflowPage prompts={[]} contexts={[]} featureToggleConfig={{}} />);
    });

    expect(screen.getByText("Project Automation Workflow")).toBeInTheDocument();
    expect(screen.getByText(/Pipeline Pre-flight & Project Brief/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Automated Workflow/i })).toBeInTheDocument();
  });

  it("should allow starting the workflow and transitioning to active stage review", async () => {
    await act(async () => {
      render(<WorkflowPage prompts={[]} contexts={[]} featureToggleConfig={{}} />);
    });

    const startBtn = screen.getByRole("button", { name: /Start Automated Workflow/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(screen.getByText(/Ready to generate deliverables for/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Stage Deliverables/i })).toBeInTheDocument();
  });

  it("should support inline editing of deliverable cards in WorkflowStageReview", async () => {
    const mockStage = {
      key: "research",
      title: "Research",
      description: "Market research",
      status: "in-review",
      cards: [
        { id: "c1", title: "Original Card Title", summary: "Original Card Summary" },
      ],
    };

    const handleUpdateCards = vi.fn();
    const handleApprove = vi.fn();

    await act(async () => {
      render(
        <WorkflowStageReview
          stage={mockStage}
          stageIndex={0}
          totalStages={4}
          cumulativeContext=""
          isGenerating={false}
          generationProgress={0}
          onGenerate={vi.fn()}
          onRefine={vi.fn()}
          onUpdateCards={handleUpdateCards}
          onGenerateFollowUp={vi.fn()}
          onApproveAndNext={handleApprove}
          onPrevStage={vi.fn()}
          onSkipStage={vi.fn()}
        />,
      );
    });

    expect(screen.getByDisplayValue("Original Card Title")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Original Card Summary")).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue("Original Card Title");
    fireEvent.change(titleInput, { target: { value: "Updated Card Title" } });
    expect(handleUpdateCards).toHaveBeenCalledWith([
      { id: "c1", title: "Updated Card Title", summary: "Original Card Summary" },
    ]);

    const approveBtn = screen.getByRole("button", { name: /Approve & Proceed to Next Stage/i });
    expect(approveBtn).not.toBeDisabled();
    fireEvent.click(approveBtn);
    expect(handleApprove).toHaveBeenCalled();
  });

  it("should allow adding a deliverable manually in WorkflowStageReview", async () => {
    const mockStage = {
      key: "specification",
      title: "Software Specification",
      description: "Use case workflows",
      status: "in-review",
      cards: [],
    };

    const handleUpdateCards = vi.fn();

    await act(async () => {
      render(
        <WorkflowStageReview
          stage={{ ...mockStage, cards: [{ title: "Existing Card" }] }}
          stageIndex={1}
          totalStages={4}
          cumulativeContext="## Previous context"
          isGenerating={false}
          generationProgress={0}
          onGenerate={vi.fn()}
          onRefine={vi.fn()}
          onUpdateCards={handleUpdateCards}
          onGenerateFollowUp={vi.fn()}
          onApproveAndNext={vi.fn()}
          onPrevStage={vi.fn()}
          onSkipStage={vi.fn()}
        />,
      );
    });

    const addBtn = screen.getByRole("button", { name: /Add Deliverable/i });
    fireEvent.click(addBtn);

    const titleInput = screen.getByPlaceholderText(/Deliverable Title.../i);
    const summaryInput = screen.getByPlaceholderText(/Summary \/ details of deliverable.../i);

    fireEvent.change(titleInput, { target: { value: "New Manual Workflow Card" } });
    fireEvent.change(summaryInput, { target: { value: "Manual Summary Details" } });

    const saveBtn = screen.getByRole("button", { name: /Save Deliverable/i });
    fireEvent.click(saveBtn);

    expect(handleUpdateCards).toHaveBeenCalledWith([
      { title: "Existing Card" },
      {
        title: "New Manual Workflow Card",
        summary: "Manual Summary Details",
        manual: true,
      },
    ]);
  });

  it("should render completion handoff and allow syncing deliverables to tasks", async () => {
    const mockCompletedWorkflow = {
      projectId: "default",
      projectName: "Test Project",
      status: "completed",
      stages: [
        {
          key: "research",
          title: "Research",
          status: "completed",
          cards: [{ title: "Market Need A", summary: "Summary A" }],
        },
        {
          key: "wbs",
          title: "Detailed Work Breakdown Structure (WBS)",
          promptId: "work-breakdown-structure-cards-7f1a5e3c",
          status: "completed",
          cards: [{ title: "WBS 1.1: Setup CI Pipeline", summary: "Automated test runner" }],
        },
      ],
    };

    await act(async () => {
      render(
        <WorkflowDossierHandoff
          workflow={mockCompletedWorkflow}
          onResetWorkflow={vi.fn()}
        />,
      );
    });

    expect(screen.getByText("Project Automation Workflow Complete!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download Executive Dossier/i })).toBeInTheDocument();

    const syncBtn = screen.getByRole("button", { name: /Sync 1 Deliverables to Tasks/i });
    expect(syncBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(syncBtn);
    });

    const savedTasks = getProjectTasks("default");
    expect(savedTasks.length).toBe(1);
    expect(savedTasks[0].title).toBe("Setup CI Pipeline");
  });

  it("should support toggling Auto-Pilot mode and starting with Auto-Pilot", async () => {
    await act(async () => {
      render(<WorkflowPage prompts={[]} contexts={[]} featureToggleConfig={{}} />);
    });

    // Auto-Pilot switch in header
    expect(screen.getByText("Auto-Pilot")).toBeInTheDocument();
    const autoPilotCheckbox = screen.getByRole("checkbox", {
      name: /Enable Auto-Pilot Mode/i,
    });
    expect(autoPilotCheckbox).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(autoPilotCheckbox);
    });

    const launchBtn = screen.getByRole("button", {
      name: /Launch Workflow \(Auto-Pilot\)/i,
    });
    expect(launchBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(launchBtn);
    });

    const wf = getProjectWorkflow("default");
    expect(wf.status).toBe("in-progress");
    expect(wf.autoPilot).toBe(true);
  });
});
