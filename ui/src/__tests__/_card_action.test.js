// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { render, screen, fireEvent } from "@testing-library/react";
import CardActions from "../app/_card_actions";
import { describe, it, expect, vi } from "vitest";
import * as bobaApi from "../app/_boba_api";

vi.mock("../app/_boba_api", () => ({
  executePocSpikeStream: vi.fn(),
  sendPocInstructionStream: vi.fn(),
  stopPocPreview: vi.fn(),
}));

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

  it("allows sending instructions to coding agent when sandbox is active", () => {
    const spikeScenario = {
      title: "SPIKE-002: Live Agent Test",
      target_adr: "ADR-002: Test",
      runtime: "node",
    };

    bobaApi.executePocSpikeStream.mockImplementation((payload, onChunk, onFinish) => {
      onFinish({
        success: true,
        sandbox_id: "sbx_test_123",
        preview_url: "https://sbx_test_123-3000.e2b.dev",
        archive_base64: "UEsDBA==",
        logs: "Built successfully",
        summary: "Ready",
      });
    });

    render(<CardActions {...baseProps} scenario={spikeScenario} />);
    const playBtn = screen.getByRole("button", {
      name: /Generate & Deploy PoC Spike/i,
    });
    fireEvent.click(playBtn);

    const input = screen.getByTestId("poc-instruction-input");
    const sendBtn = screen.getByTestId("poc-instruction-send");

    expect(input).toBeInTheDocument();
    expect(sendBtn).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Add user authentication" } });
    fireEvent.click(sendBtn);

    expect(bobaApi.sendPocInstructionStream).toHaveBeenCalledWith(
      "sbx_test_123",
      "Add user authentication",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });
});
