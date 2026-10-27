# Issue #32: ADR Implementation & Production Code Generation Workflow

## 1. Overview & Context

In modern agile and architecture-driven software delivery, the journey from business requirements to working production code involves distinct, rigorous phases:
1. **Requirements & Constraints Analysis**: Volere constraints, TOGAF baseline and gap assessments, cost modeling.
2. **Architecture Decision Records (ADRs)**: Documenting key architectural decisions using MADR / Nygard formats.
3. **PoC & Architectural Spikes**: De-risking uncertain architectural assumptions with automated, empirical spike experiments running in isolated execution sandboxes (e.g. E2B microVMs).
4. **Production Code Generation & Implementation**: Taking the validated ADR and empirical spike learnings to generate complete, production-ready implementation modules, domain models, integration adapters, configuration manifests, and automated test suites.

Issue **#32** implements the **Production Code Generation Workflow** following ADR spikes, closing the loop from architectural decision-making to production deployment.

---

## 2. Problem Statement

While ADRs capture the rationale and trade-offs of architectural decisions, and PoC spikes empirically validate technical feasibility, software engineering teams often encounter significant friction and latency when transitioning from a validated spike to the full production codebase:
- **Disconnect Between Spike and Production**: Spikes often focus solely on narrow hypotheses, leaving the production domain architecture, error handling, configuration, and integration adapters unspecified.
- **Scaffold Fatigue**: Manually scaffolding hexagonal / clean architecture layers (domain entities, ports, primary and secondary adapters, migration scripts, CI manifests) for each accepted decision is time-consuming and error-prone.
- **Traceability Loss**: The link between why a technical decision was made (the ADR), what was empirically proven (the Spike), and how it is implemented in production code is frequently lost over time.

---

## 3. Solution & Implemented Capabilities

### 3.1. Modular Implementation Prompt Cards
- **File**: `app/resources/prompts_chat/adr_code_generation_cards.md`
- **Identifier**: `adr-code-generation-cards-5c8e2a1f`
- **Categories**: `["coding", "architecture"]`
- **Description**: Decomposes an accepted ADR and its validated spike findings into 3 to 6 structured production implementation module cards (`IMPL-001`, `IMPL-002`, etc.).
- **Card Schema**:
  - `title`: `IMPL-00X: <Descriptive Module Name>`
  - `target_adr`: Target ADR ID and Title
  - `module_type`: `Core Domain | API & Transport | Data & Persistence | Infrastructure & Resilience | Security & Auth | Integration Adapter`
  - `runtime_or_language`: Target programming language and runtime (e.g. `Python 3.12 / FastAPI`, `TypeScript / Node.js 22`)
  - `target_files`: Array of relative file paths comprising the module
  - `summary`:
    - **Implementation Scope & Architectural Role**: Realizing the ADR and incorporating empirical spike results.
    - **Domain & Technical Design**: Domain patterns, classes, interfaces, algorithms.
    - **Production Quality & NFRs**: Concurrency, error handling, resilience, telemetry, security guardrails.
    - **Verification & Test Strategy**: Unit tests, integration adapters, property-based tests, exact validation commands.
  - `self-review`: Self-validation indicator (`✅` / `🤔`) checking modular boundaries and testability.

### 3.2. Production Code Generator & Implementation Specification
- **File**: `app/resources/prompts_chat/adr_code_generation_spec.md`
- **Identifier**: `adr-code-generation-spec-8b3d6a2e`
- **Categories**: `["coding", "architecture"]`
- **Description**: Generates an exhaustive, production-grade, unabbreviated codebase for the chosen implementation module.
- **Specification Structure**:
  1. Implementation Architecture & ADR Context (ADR forces + validated PoC benchmark metrics).
  2. Complete Repository Directory Tree & File Manifest.
  3. Complete Production Source Code (Zero `TODO`s, clean architecture, domain entities, ports, adapters).
  4. Configuration, Dependency Manifests & Runtime Environment (`pyproject.toml`, `package.json`, `.env.example`, `Dockerfile`).
  5. Automated Test Suite & Quality Verification (Full test suites with edge cases and coverage).
  6. Build, Deployment & CI/CD Pipeline (Linting, test commands, GitHub Actions workflow).
  7. ADR Lifecycle Transition & Production Readiness Gate (Moving ADR status to `Implemented / Production Ready`).

### 3.3. Prompt Flow Connections
- **File**: `app/resources/prompts_chat/prompt_flows.yaml`
- Follow-ups configured from:
  - `adr-cards-4f8a1c6e` (ADRs) $\rightarrow$ `adr-code-generation-spec-8b3d6a2e`
  - `adr-poc-spike-cards-2f9b4e1a` (PoC Spikes) $\rightarrow$ `adr-code-generation-spec-8b3d6a2e`
- Dedicated first-step flow for `adr-code-generation-cards-5c8e2a1f` linking to:
  - `adr-code-generation-spec-8b3d6a2e`
  - `adr-poc-spike-spec-3e0a5f2b`
  - `adr-madr-spec-5a9b2d7f`
  - `quality-assurance-risk-matrix-spec-6c9f3b2e`
  - `work-breakdown-structure-spec-8a2b6f4d`
  - `schedule-roadmap-report-7c2e4f9a`
  - `software-specification-detailed-study-7c3d1f5b`

### 3.4. Interactive UI & Sandbox Execution
- **File**: `ui/src/app/_card_actions.js`
- Enhanced card action triggers to detect implementation cards (`module_type`, `target_files`, `IMPL-` title prefix).
- Generates and deploys implementation code directly into isolated cloud sandboxes (E2B microVMs) with live log streaming.
- Allows live interactive preview and codebase `.zip` archive download.

---

## 4. Verification & Testing

### 4.1. Backend Unit & Rendering Tests
- **File**: `app/tests/test_prompts.py`
- Added `test_adr_code_generation_prompts_and_flows` asserting:
  - Prompt list loads `adr-code-generation-cards-5c8e2a1f` with category `["coding", "architecture"]` and JSON schema compatibility.
  - Template variables (`context`, `user_input`) render cleanly with domain context and requirements.
  - Spec prompt `adr-code-generation-spec-8b3d6a2e` loads properly with all sections.
  - Follow-up linkages from ADR cards, PoC Spike cards, and Implementation cards.

### 4.2. Frontend Component & Sidebar Tests
- **Files**: `ui/src/__tests__/_sidebar.test.js`, `ui/src/__tests__/_card_action.test.js`
- Verified:
  - ADR Implementation Code Generation appears under the **Coding** and **Architecture** sections in the sidebar menu.
  - Implementation cards display the `Generate & Deploy Implementation (E2B + Pi)` action button with appropriate tooltips and modal states.

---

## 5. Acceptance Checklist

- [x] Code generation prompt cards created with clean JSON output schema.
- [x] Detailed production code specification prompt created with 7 comprehensive sections.
- [x] Integrated into `prompt_flows.yaml` across ADR and PoC flows.
- [x] UI Card Actions support implementation deployment and codebase download.
- [x] All backend prompt tests pass (`pytest app/tests/test_prompts.py`).
- [x] All frontend tests pass (`yarn test`).
- [x] Pre-commit hooks run and validated.
- [x] Pushed to remote repository branch `32-code-generation`.
