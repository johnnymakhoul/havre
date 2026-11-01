// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.

export const SECTION_WORKFLOW_DEFINITIONS = [
  {
    key: "project-objectives",
    sectionKey: "analysis",
    title: "Project Objectives",
    description: "Core business imperatives, target KPIs, ROI models, and measurable success criteria",
    promptId: "project-objectives-cards-1f4a7c2e",
    followUpId: "project-objectives-spec-2e5b8d3a",
    promptType: "cards",
    iconName: "RiFlagLine",
  },
  {
    key: "sdlc-methodology",
    sectionKey: "project-management",
    title: "SDLC Methodology",
    description: "Engineering delivery framework selection, team topologies, cadences, and ceremonies",
    promptId: "sdlc-methodologies-cards-1a4b7c9e",
    followUpId: "sdlc-methodologies-report-2b5c8d1f",
    promptType: "cards",
    iconName: "RiGitBranchLine",
  },
  {
    key: "requirements-breakdown",
    sectionKey: "specification",
    title: "Requirements Breakdown",
    description: "Functional capability decomposition, user stories, and acceptance boundaries",
    promptId: "requirements-breakdown-3a845a85",
    followUpId: "requirements-constraints-volere-spec-8f9e1d2c",
    promptType: "cards",
    iconName: "RiFileList3Line",
  },
  {
    key: "requirements-constraints",
    sectionKey: "analysis",
    title: "Requirements Constraints",
    description: "Volere operational constraints, technical guardrails, latency budgets, and compliance",
    promptId: "requirements-constraints-volere-4a1b2c3d",
    followUpId: "requirements-constraints-volere-spec-8f9e1d2c",
    promptType: "cards",
    iconName: "RiShieldCheckLine",
  },
  {
    key: "baseline-architecture",
    sectionKey: "architecture",
    title: "Baseline Architecture Assessment",
    description: "TOGAF baseline assessment, existing IT estate capabilities, debt, and architectural gaps",
    promptId: "togaf-baseline-assessment-cards-7b2e9a1c",
    followUpId: "togaf-baseline-dossier-8c3f1e2a",
    promptType: "cards",
    iconName: "RiBuilding4Line",
  },
  {
    key: "adr",
    sectionKey: "architecture",
    title: "Architecture Decision Records",
    description: "MADR-formatted Architecture Decision Records (ADRs) evaluating candidate trade-offs",
    promptId: "adr-cards-4f8a1c6e",
    followUpId: "adr-madr-spec-5a9b2d7f",
    promptType: "cards",
    iconName: "RiCompasses2Line",
  },
  {
    key: "candidate-architectures",
    sectionKey: "architecture",
    title: "Candidate Software Architectures",
    description: "System topologies, microservices vs modular monolith alternatives, and integration protocols",
    promptId: "software-architecture-candidates-cards-8d2e4f1a",
    followUpId: "software-architecture-candidates-spec-9c3f1e5b",
    promptType: "cards",
    iconName: "RiNodeTree",
  },
  {
    key: "schedule-estimation",
    sectionKey: "project-management",
    title: "Schedule Estimation & Planning",
    description: "Milestones, critical path analysis, 3-point estimates, and delivery roadmaps",
    promptId: "schedule-estimation-cards-6b1d3e8f",
    followUpId: "schedule-roadmap-report-7c2e4f9a",
    promptType: "cards",
    iconName: "RiCalendarLine",
  },
  {
    key: "cost-analysis",
    sectionKey: "analysis",
    title: "Cost Analysis",
    description: "Total Cost of Ownership (TCO), cloud compute/storage licensing, and infra budget models",
    promptId: "cost-analysis-cards-5e8b3c1a",
    followUpId: "cost-analysis-tco-report-6f9d4a2b",
    promptType: "cards",
    iconName: "RiMoneyDollarCircleLine",
  },
  {
    key: "legal-contracts",
    sectionKey: "analysis",
    title: "Legal & Contracts",
    description: "Regulatory data privacy (GDPR/DPA), software licensing (FOSS), vendor MSAs/SLAs, and IP rights",
    promptId: "legal-contracts-cards-8d3f5a1c",
    followUpId: "legal-contracts-report-9e4a6b2d",
    promptType: "cards",
    iconName: "RiAuctionLine",
  },
  {
    key: "software-specifications",
    sectionKey: "specification",
    title: "Software Specifications",
    description: "Subsystems detailed study, formal Cockburn use case workflows, and UML sequence contracts",
    promptId: "software-specification-workflow-cards-9a4b2c1e",
    followUpId: "software-specification-detailed-study-7c3d1f5b",
    promptType: "cards",
    iconName: "RiBookReadLine",
  },
  {
    key: "non-functional-requirements",
    sectionKey: "architecture",
    title: "Non-Functional Requirements (NFRs)",
    description: "Architectural characteristics: latency, availability, fault-tolerance, security, and scalability",
    promptId: "nfr-architecture-characteristics-cards-3e7a9c2d",
    followUpId: "nfr-architecture-characteristics-spec-4f8b1d3e",
    promptType: "cards",
    iconName: "RiCpuLine",
  },
  {
    key: "pbs",
    sectionKey: "specification",
    title: "Product Breakdown Structure (PBS)",
    description: "100% deliverable noun decomposition into tangible modules, schemas, APIs, and containers",
    promptId: "product-breakdown-structure-cards-3b7c1a9e",
    followUpId: "product-breakdown-structure-spec-4c8d2b0f",
    promptType: "cards",
    iconName: "RiStackLine",
  },
  {
    key: "pdp",
    sectionKey: "specification",
    title: "Product Development Process (PDP)",
    description: "Software engineering delivery stages, validation gates, QA environments, and cutover protocols",
    promptId: "product-development-process-cards-5d9e3c1a",
    followUpId: "product-development-process-spec-6e0f4d2b",
    promptType: "cards",
    iconName: "RiPlayListCheckLine",
  },
  {
    key: "wbs",
    sectionKey: "project-management",
    title: "Detailed Work Breakdown Structure (WBS)",
    description: "Tangible work packages decomposed from deliverables, feeding directly into Kanban tasks",
    promptId: "work-breakdown-structure-cards-7f1a5e3c",
    followUpId: "work-breakdown-structure-spec-8a2b6f4d",
    promptType: "cards",
    iconName: "RiKanbanView2",
  },
];

export const isSectionEnabledInProject = (sectionKey, projectSections) => {
  if (!Array.isArray(projectSections) || projectSections.length === 0) {
    return true;
  }
  if (sectionKey === "analysis") {
    return (
      projectSections.includes("analysis") ||
      projectSections.includes("analyse")
    );
  }
  if (sectionKey === "specification") {
    return (
      projectSections.includes("specification") ||
      projectSections.includes("specifications") ||
      projectSections.includes("software-specification")
    );
  }
  if (sectionKey === "project-management") {
    return (
      projectSections.includes("project-management") ||
      projectSections.includes("projectmanagement") ||
      projectSections.includes("project_management")
    );
  }
  return projectSections.includes(sectionKey);
};

export const getOrderedWorkflowStages = (projectSections = null) => {
  // If user has specific project sections, we still support all 15 stages in order
  // Pre-flight allows enabling/disabling any step
  return SECTION_WORKFLOW_DEFINITIONS;
};
