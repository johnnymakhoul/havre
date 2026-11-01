// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { describe, it, expect } from "vitest";
import {
  initWorkflowState,
  buildCumulativeContext,
  extractTasksFromWorkflow,
  generateDossierMarkdown,
} from "../../app/utils/_workflow_engine";

describe("_workflow_engine", () => {
  const mockProject = {
    id: "proj-ecommerce",
    name: "E-Commerce Checkout",
  };

  describe("initWorkflowState", () => {
    it("should initialize all 15 stages in the exact required sequence", () => {
      const state = initWorkflowState(mockProject, "Build a high throughput checkout engine");
      expect(state.projectId).toBe("proj-ecommerce");
      expect(state.projectName).toBe("E-Commerce Checkout");
      expect(state.initialInput).toBe("Build a high throughput checkout engine");
      expect(state.activeStepIndex).toBe(0);
      expect(state.stages.length).toBe(15);

      const stageKeys = state.stages.map((s) => s.key);
      expect(stageKeys).toEqual([
        "project-objectives",
        "sdlc-methodology",
        "requirements-breakdown",
        "requirements-constraints",
        "baseline-architecture",
        "adr",
        "candidate-architectures",
        "schedule-estimation",
        "cost-analysis",
        "legal-contracts",
        "software-specifications",
        "non-functional-requirements",
        "pbs",
        "pdp",
        "wbs",
      ]);
      expect(state.stages[0].status).toBe("in-review");
      expect(state.stages[1].status).toBe("pending");
    });
  });

  describe("buildCumulativeContext", () => {
    it("should format completed stages with cards and follow-ups into structured markdown", () => {
      const stages = [
        {
          key: "project-objectives",
          title: "Project Objectives",
          status: "completed",
          enabled: true,
          cards: [
            { title: "Target Metric: 99.99% Availability", summary: "High transaction volume SLAs" },
          ],
          followUpContent: "Executive summary: High conversion demand",
        },
        {
          key: "software-specifications",
          title: "Software Specifications",
          status: "completed",
          enabled: true,
          cards: [
            { title: "Checkout Workflow", summary: "Step 1: Auth, Step 2: Payment" },
          ],
        },
        {
          key: "adr",
          title: "Architecture Decision Records",
          status: "pending",
          enabled: true,
          cards: [],
        },
      ];

      const context = buildCumulativeContext(stages, 2);
      expect(context).toContain("## Cumulative Project Context from Prior Approved Stages:");
      expect(context).toContain("### Stage 1: Project Objectives");
      expect(context).toContain("Target Metric: 99.99% Availability");
      expect(context).toContain("Executive summary: High conversion demand");
      expect(context).toContain("### Stage 2: Software Specifications");
      expect(context).toContain("Checkout Workflow");
      // Pending stage shouldn't be included
      expect(context).not.toContain("### Stage 3: Architecture Decision Records");
    });

    it("should return empty string when no stages have completed or approved cards", () => {
      const stages = [
        { key: "project-objectives", title: "Project Objectives", status: "pending", cards: [] },
      ];
      expect(buildCumulativeContext(stages, 1)).toBe("");
    });
  });

  describe("extractTasksFromWorkflow", () => {
    it("should strictly extract cards from WBS stage ONLY, ignoring all other stages", () => {
      const stages = [
        {
          key: "project-objectives",
          title: "Project Objectives",
          enabled: true,
          cards: [{ title: "Objective 1", summary: "Deliver by Q3" }],
        },
        {
          key: "pbs",
          title: "Product Breakdown Structure (PBS)",
          enabled: true,
          cards: [{ title: "PBS 1.1: Auth Service", summary: "Auth microservice container" }],
        },
        {
          key: "wbs",
          title: "Detailed Work Breakdown Structure (WBS)",
          promptId: "work-breakdown-structure-cards-7f1a5e3c",
          enabled: true,
          cards: [
            { title: "WBS 1.1: Deploy Auth Service", summary: "Deploy OAuth2 gateway" },
            { title: "WBS 1.2: Setup Postgres DDL", summary: "Run initial migrations" },
          ],
        },
      ];

      const tasks = extractTasksFromWorkflow(stages);
      // Strictly 2 tasks from WBS, none from Objectives or PBS
      expect(tasks.length).toBe(2);
      expect(tasks[0].title).toBe("Deploy Auth Service");
      expect(tasks[0].description).toBe("Deploy OAuth2 gateway");
      expect(tasks[0].status).toBe("backlog");
      expect(tasks[0].hitl.required).toBe(true);
      expect(tasks[0].id).toBeDefined();

      expect(tasks[1].title).toBe("Setup Postgres DDL");
    });
  });

  describe("generateDossierMarkdown", () => {
    it("should compile project deliverables and specs into a unified executive document", () => {
      const workflow = {
        projectName: "Global Retail Engine",
        initialInput: "Modernize backend order orchestration",
        updatedAt: 1730495000000,
        stages: [
          {
            key: "legal-contracts",
            title: "Legal & Contracts",
            status: "completed",
            enabled: true,
            cards: [{ title: "GDPR Compliance DPA", summary: "Standard contractual clauses for EU data transfers" }],
            followUpContent: "Report: 100% GDPR alignment",
          },
        ],
      };

      const dossier = generateDossierMarkdown(workflow);
      expect(dossier).toContain("# Executive Project Dossier: Global Retail Engine");
      expect(dossier).toContain("Modernize backend order orchestration");
      expect(dossier).toContain("Legal & Contracts");
      expect(dossier).toContain("GDPR Compliance DPA");
      expect(dossier).toContain("Report: 100% GDPR alignment");
    });
  });
});
