// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { render, screen } from "@testing-library/react";
import CardActions from "../app/_card_actions";
import { describe, it, expect, vi } from "vitest";

describe("CardActions", () => {
  const baseProps = {
    featureToggleConfig: {},
    scenario: {},
    onExploreHandler: vi.fn(),
    selfReview: null,
    progress: 42,
    isGenerating: false,
  };

  it("does not render progress bar when isGenerating is false", () => {
    render(<CardActions {...baseProps} />);
    expect(screen.queryByTestId("progress-bar")).not.toBeInTheDocument();
  });

  it("renders progress bar with correct percent when isGenerating is true", () => {
    render(<CardActions {...baseProps} isGenerating={true} />);
    const progress = screen.getByTestId("progress-bar");
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveAttribute("aria-valuenow", "42");
  });

  it("renders implementation play button with correct tooltip for IMPL card", () => {
    const implScenario = {
      title: "IMPL-001: Core CRDT Domain Model",
      target_adr: "ADR-001: Offline Sync",
      module_type: "Core Domain",
      target_files: ["src/domain/crdt.ts"],
    };
    render(<CardActions {...baseProps} scenario={implScenario} />);
    const button = screen.getByRole("button", {
      name: /Generate & Deploy Implementation/i,
    });
    expect(button).toBeInTheDocument();
  });

  it("renders spike play button for spike card", () => {
    const spikeScenario = {
      title: "SPIKE-001: CRDT Latency Benchmark",
      target_adr: "ADR-001: Offline Sync",
      verification_command: "python -m unittest test_main.py",
      runtime: "python",
    };
    render(<CardActions {...baseProps} scenario={spikeScenario} />);
    const button = screen.getByRole("button", {
      name: /Generate & Deploy PoC Spike/i,
    });
    expect(button).toBeInTheDocument();
  });
});
