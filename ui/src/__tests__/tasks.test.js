// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TasksPage from "../pages/tasks";
import {
  saveProjectCards,
  saveProjectTasks,
  getProjectTasks,
  syncWbsToTasks,
  deleteProjectTasks,
} from "../app/_local_store";

// Mock next/navigation and next/router
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: vi.fn(),
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/tasks",
    push: vi.fn(),
  }),
}));

describe("Tasks Kanban Board Page", () => {
  beforeEach(() => {
    localStorage.clear();
    deleteProjectTasks("default");
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should render the Kanban board with all 4 workflow columns and header metrics", async () => {
    await act(async () => {
      render(<TasksPage />);
    });

    // Check main title
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();

    // Check 4 columns
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Needs Review / HITL")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();

    // Check action buttons
    expect(
      screen.getByRole("button", { name: /Add Task/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sync WBS/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /HITL Only/i }),
    ).toBeInTheDocument();
  });

  it("should auto-sync Detailed WBS cards into the Backlog column", async () => {
    // Populate WBS cards in localStorage
    const wbsCards = [
      {
        id: "card-wbs-1",
        title: "WBS 1.1.1: Database Schema & Migration Engine",
        wbs_level: "Level 3 - Work Package",
        pbs_deliverable_ref: "PBS 1.1: Core Storage",
        pdp_stage_ref: "PDP Stage 2: Architecture & Foundation",
        summary:
          "**Scope of Work**: Build SQLite tables and migration scripts.",
      },
      {
        id: "card-wbs-2",
        title: "WBS 1.1.2: Client Sync Queue Worker",
        wbs_level: "Level 3 - Work Package",
        pbs_deliverable_ref: "PBS 1.2: Offline Sync",
        pdp_stage_ref: "PDP Stage 3: Core Service Build",
        summary: "**Scope of Work**: Implement offline queue and retry policy.",
      },
    ];
    saveProjectCards(
      "work-breakdown-structure-cards-7f1a5e3c",
      wbsCards,
      "default",
    );

    await act(async () => {
      render(<TasksPage />);
    });

    // Both WBS items should appear in Backlog
    expect(
      screen.getByText("WBS 1.1.1: Database Schema & Migration Engine"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("WBS 1.1.2: Client Sync Queue Worker"),
    ).toBeInTheDocument();

    // Verify tasks are stored with source=wbs_sync
    const stored = getProjectTasks("default");
    expect(stored.length).toBe(2);
    expect(stored[0].source).toBe("wbs_sync");
    expect(stored[0].status).toBe("backlog");
  });

  it("should perform non-destructive sync preserving in-flight and completed tasks", async () => {
    // Initial task already moved to in_progress and flagged for HITL
    const initialTasks = [
      {
        id: "task-wbs-card-wbs-1-0",
        source: "wbs_sync",
        sourceRef: "card-wbs-1",
        title: "WBS 1.1.1: Database Schema & Migration Engine",
        status: "in_progress",
        hitl: { required: true, reason: "Schema review requested" },
      },
    ];
    saveProjectTasks(initialTasks, "default");

    // Re-generate cards with a new second card
    const wbsCards = [
      {
        id: "card-wbs-1",
        title: "WBS 1.1.1: Database Schema & Migration Engine",
      },
      {
        id: "card-wbs-2",
        title: "WBS 1.1.2: Client Sync Queue Worker",
      },
    ];
    saveProjectCards(
      "work-breakdown-structure-cards-7f1a5e3c",
      wbsCards,
      "default",
    );

    await act(async () => {
      render(<TasksPage />);
    });

    const tasksAfterSync = getProjectTasks("default");
    expect(tasksAfterSync.length).toBe(2);

    // Card 1 must retain its in_progress state and HITL flag!
    const task1 = tasksAfterSync.find((t) => t.sourceRef === "card-wbs-1");
    expect(task1.status).toBe("in_progress");
    expect(task1.hitl.required).toBe(true);

    // Card 2 must be ingested into backlog
    const task2 = tasksAfterSync.find((t) => t.sourceRef === "card-wbs-2");
    expect(task2.status).toBe("backlog");
  });

  it("should allow creating a manual task via Add Task modal", async () => {
    await act(async () => {
      render(<TasksPage />);
    });

    // Click Add Task button
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Add Task/i }));
    });

    // Fill form
    const titleInput = screen.getByPlaceholderText(/e\.g\. WBS 2\.1\.3/i);
    await act(async () => {
      fireEvent.change(titleInput, {
        target: { value: "Custom Security Audit Task" },
      });
    });

    // Submit modal form
    const submitBtn = screen.getByRole("button", { name: "Create Task" });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(screen.getByText("Custom Security Audit Task")).toBeInTheDocument();
    const tasks = getProjectTasks("default");
    expect(tasks.some((t) => t.title === "Custom Security Audit Task")).toBe(
      true,
    );
  });

  it("should open the exact clicked task in the detail drawer when multiple backlog items exist", async () => {
    const initialTasks = [
      {
        id: "task-alpha",
        title: "Task Alpha: First Item",
        status: "backlog",
        summary: "Details of Alpha",
      },
      {
        id: "task-beta",
        title: "Task Beta: Second Item",
        status: "backlog",
        summary: "Details of Beta",
      },
      {
        id: "task-gamma",
        title: "Task Gamma: Third Item",
        status: "backlog",
        summary: "Details of Gamma",
      },
    ];
    saveProjectTasks(initialTasks, "default");

    await act(async () => {
      render(<TasksPage />);
    });

    // Click Task Beta (second item)
    await act(async () => {
      fireEvent.click(screen.getByText("Task Beta: Second Item"));
    });

    // Verify detail drawer shows Task Beta, not Task Alpha
    expect(screen.getByText("Details of Beta")).toBeInTheDocument();
    expect(screen.queryByText("Details of Alpha")).not.toBeInTheDocument();

    // Click Task Gamma (third item)
    await act(async () => {
      fireEvent.click(screen.getByText("Task Gamma: Third Item"));
    });

    // Verify detail drawer shows Task Gamma
    expect(screen.getByText("Details of Gamma")).toBeInTheDocument();
    expect(screen.queryByText("Details of Beta")).not.toBeInTheDocument();
  });

  it("should open task detail drawer and allow toggling Human-in-the-Loop review", async () => {
    const initialTasks = [
      {
        id: "task-100",
        title: "WBS 3.1: API Gateway Contract Implementation",
        status: "backlog",
        summary: "**Scope**: Author OpenAPI contracts.",
        hitl: { required: false, reason: "" },
      },
    ];
    saveProjectTasks(initialTasks, "default");

    await act(async () => {
      render(<TasksPage />);
    });

    // Click on the task card to open drawer
    await act(async () => {
      fireEvent.click(
        screen.getByText("WBS 3.1: API Gateway Contract Implementation"),
      );
    });

    // Drawer header should be present
    expect(
      screen.getByText("Human-in-the-Loop (HITL) Status"),
    ).toBeInTheDocument();

    // Toggle HITL switch to ON
    const hitlSwitch = screen.getByRole("switch");
    await act(async () => {
      fireEvent.click(hitlSwitch);
    });

    // Task should now be moved to Needs Review and have HITL flag set
    const tasks = getProjectTasks("default");
    expect(tasks[0].hitl.required).toBe(true);
    expect(tasks[0].status).toBe("needs_review");
  });

  it("should allow quick moving of tasks across workflow states", async () => {
    const initialTasks = [
      {
        id: "task-200",
        title: "WBS 4.1: Performance Stress Test Suite",
        status: "backlog",
        hitl: { required: false },
      },
    ];
    saveProjectTasks(initialTasks, "default");

    await act(async () => {
      render(<TasksPage />);
    });

    // Open detail drawer
    await act(async () => {
      fireEvent.click(
        screen.getByText("WBS 4.1: Performance Stress Test Suite"),
      );
    });

    // Move to "In Progress" using transition button
    const inProgressBtn = screen.getByRole("button", { name: "In Progress" });
    await act(async () => {
      fireEvent.click(inProgressBtn);
    });

    const tasks = getProjectTasks("default");
    expect(tasks[0].status).toBe("in_progress");
  });

  it("should allow deleting a task", async () => {
    const initialTasks = [
      {
        id: "task-300",
        title: "Task to be Deleted",
        status: "backlog",
      },
    ];
    saveProjectTasks(initialTasks, "default");

    await act(async () => {
      render(<TasksPage />);
    });

    expect(screen.getByText("Task to be Deleted")).toBeInTheDocument();

    // Open detail drawer and click delete
    await act(async () => {
      fireEvent.click(screen.getByText("Task to be Deleted"));
    });

    const deleteBtn = screen.getByRole("button", { name: /Delete/i });
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(screen.queryByText("Task to be Deleted")).not.toBeInTheDocument();
    expect(getProjectTasks("default").length).toBe(0);
  });

  it("should sync WBS cards with structured dependencies, critical path, and parallel wave", async () => {
    const wbsCards = [
      {
        id: "card-wbs-10",
        title: "WBS 1.1: Core Database Engine",
        wbs_code: "1.1",
        dependencies: [],
        is_critical_path: true,
        parallel_group: "Wave 1 - Foundation",
      },
      {
        id: "card-wbs-20",
        title: "WBS 1.2: REST API Contracts",
        wbs_code: "1.2",
        dependencies: ["1.1"],
        is_critical_path: true,
        parallel_group: "Wave 2 - Core Services",
      },
    ];
    saveProjectCards(
      "work-breakdown-structure-cards-7f1a5e3c",
      wbsCards,
      "default",
    );

    await act(async () => {
      render(<TasksPage />);
    });

    const tasks = getProjectTasks("default");
    expect(tasks.length).toBe(2);

    const task1 = tasks.find((t) => t.wbsCode === "1.1");
    const task2 = tasks.find((t) => t.wbsCode === "1.2");

    expect(task1.isCriticalPath).toBe(true);
    expect(task1.parallelGroup).toBe("Wave 1 - Foundation");
    expect(task2.dependencies).toEqual(["1.1"]);

    // Task 1 has no dependencies -> should show Ready (Parallelizable)
    expect(screen.getByText(/Ready \(Parallelizable\)/i)).toBeInTheDocument();

    // Task 2 depends on Task 1 (which is still in Backlog) -> should show Blocked
    expect(screen.getByText(/Blocked by: WBS 1.1/i)).toBeInTheDocument();

    // Both should show Critical tags
    const criticalBadges = screen.getAllByText(/🔥 Critical/i);
    expect(criticalBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("should display soft-enforcement warning when moving a blocked task to In Progress", async () => {
    const initialTasks = [
      {
        id: "task-root",
        title: "WBS 2.1: Data Models",
        wbsCode: "2.1",
        status: "backlog",
        dependencies: [],
      },
      {
        id: "task-child",
        title: "WBS 2.2: Business Logic",
        wbsCode: "2.2",
        status: "backlog",
        dependencies: ["2.1"],
      },
    ];
    saveProjectTasks(initialTasks, "default");

    await act(async () => {
      render(<TasksPage />);
    });

    // Open detail drawer for task-child
    await act(async () => {
      fireEvent.click(screen.getByText("WBS 2.2: Business Logic"));
    });

    // Attempt to move to "In Progress"
    const inProgressBtn = screen.getByRole("button", { name: "In Progress" });
    await act(async () => {
      fireEvent.click(inProgressBtn);
    });

    // Soft-enforcement confirmation modal should appear
    expect(screen.getByText("Prerequisites Not Completed")).toBeInTheDocument();
    expect(
      screen.getByText(/has unresolved prerequisite work package/i),
    ).toBeInTheDocument();

    // Confirm the move
    const proceedBtn = screen.getByRole("button", {
      name: "Proceed to In Progress",
    });
    await act(async () => {
      fireEvent.click(proceedBtn);
    });

    const tasks = getProjectTasks("default");
    const updatedChild = tasks.find((t) => t.id === "task-child");
    expect(updatedChild.status).toBe("in_progress");
  });

  it("should filter tasks by Ready (Parallel) and Critical Path", async () => {
    const initialTasks = [
      {
        id: "task-ready-crit",
        title: "Ready Critical Task",
        wbsCode: "3.1",
        status: "backlog",
        dependencies: [],
        isCriticalPath: true,
      },
      {
        id: "task-blocked-noncrit",
        title: "Blocked NonCritical Task",
        wbsCode: "3.2",
        status: "backlog",
        dependencies: ["99.9"], // external/unresolved
        isCriticalPath: false,
      },
    ];
    saveProjectTasks(initialTasks, "default");

    await act(async () => {
      render(<TasksPage />);
    });

    expect(screen.getByText("Ready Critical Task")).toBeInTheDocument();
    expect(screen.getByText("Blocked NonCritical Task")).toBeInTheDocument();

    // Filter by Ready (Parallel)
    const readyFilterBtn = screen.getByRole("button", {
      name: /Ready \(Parallel\)/i,
    });
    await act(async () => {
      fireEvent.click(readyFilterBtn);
    });

    expect(screen.getByText("Ready Critical Task")).toBeInTheDocument();
    expect(
      screen.queryByText("Blocked NonCritical Task"),
    ).not.toBeInTheDocument();

    // Un-filter Ready and filter by Critical Path
    await act(async () => {
      fireEvent.click(readyFilterBtn); // toggle off
    });
    const critFilterBtn = screen.getByRole("button", {
      name: /Critical Path/i,
    });
    await act(async () => {
      fireEvent.click(critFilterBtn);
    });

    expect(screen.getByText("Ready Critical Task")).toBeInTheDocument();
    expect(
      screen.queryByText("Blocked NonCritical Task"),
    ).not.toBeInTheDocument();
  });
});
