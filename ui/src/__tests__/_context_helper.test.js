// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  formatTitleFromIdentifier,
  buildContextTreeData,
  resolveContextsForRequestBody,
} from "../app/utils/_context_helper";
import * as localStore from "../app/_local_store";

vi.mock("../app/_local_store", () => ({
  getSortedUserContexts: vi.fn(),
  getSummaryForTheUserContext: vi.fn(),
  getProjectCards: vi.fn(),
  getProjectFollowUps: vi.fn(),
  getProjectChat: vi.fn(),
  getActiveProjectId: vi.fn(),
}));

describe("_context_helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStore.getActiveProjectId.mockReturnValue("project-1");
    localStore.getSortedUserContexts.mockReturnValue([]);
    localStore.getSummaryForTheUserContext.mockReturnValue("");
    localStore.getProjectCards.mockReturnValue({});
    localStore.getProjectFollowUps.mockReturnValue({});
    localStore.getProjectChat.mockReturnValue({});
  });

  describe("formatTitleFromIdentifier", () => {
    it("cleans and formats kebab-case and hex hashes into Title Case", () => {
      expect(
        formatTitleFromIdentifier("requirements-breakdown-3a845a85"),
      ).toBe("Requirements Breakdown");
      expect(formatTitleFromIdentifier("architecture_constraints")).toBe(
        "Architecture Constraints",
      );
      expect(formatTitleFromIdentifier("")).toBe("Untitled Section");
    });
  });

  describe("buildContextTreeData", () => {
    it("creates tree with Knowledge Pack, User Contexts, and Filled Sections", () => {
      localStore.getSortedUserContexts.mockReturnValue([
        { title: "Team Standards", summary: "Follow standard coding practices." },
      ]);
      localStore.getProjectCards.mockReturnValue({
        "req-breakdown": [
          { id: "c1", title: "Authentication", summary: "OAuth2 implementation" },
        ],
      });
      localStore.getProjectFollowUps.mockReturnValue({
        "req-breakdown": {
          "edge-cases": "Handle token expiration",
        },
      });
      localStore.getProjectChat.mockReturnValue({
        "code-review": {
          messages: [
            { role: "user", content: "Review this PR" },
            { role: "assistant", content: "Looks good" },
          ],
        },
      });

      const prompts = [
        {
          identifier: "req-breakdown",
          title: "Requirements Breakdown",
          followUps: [{ identifier: "edge-cases", title: "Edge Cases Analysis" }],
        },
        {
          identifier: "code-review",
          title: "Code Review Assistant",
        },
      ];

      const tree = buildContextTreeData({
        knowledgePackContexts: [{ label: "Architecture Doc", value: "arch-doc" }],
        prompts,
        activeProjectId: "project-1",
      });

      expect(tree).toHaveLength(3);

      // 1. Knowledge Pack
      expect(tree[0].title).toBe("Knowledge Pack Contexts");
      expect(tree[0].children[0].title).toBe("Architecture Doc");
      expect(tree[0].children[0].value).toBe("arch-doc");

      // 2. Custom User Contexts
      expect(tree[1].title).toBe("Custom User Contexts");
      expect(tree[1].children[0].title).toBe("Team Standards");
      expect(tree[1].children[0].value).toBe("user::Team Standards");

      // 3. Project Sections
      expect(tree[2].title).toBe("Project Prompts");
      const sectionTitles = tree[2].children.map((c) => c.title);
      expect(sectionTitles).toContain("Requirements Breakdown");
      expect(sectionTitles).toContain("Code Review Assistant");

      const reqSection = tree[2].children.find(
        (c) => c.title === "Requirements Breakdown",
      );
      expect(reqSection.children).toHaveLength(2);
      expect(reqSection.children[0].title).toBe("Authentication");
      expect(reqSection.children[0].value).toBe("card::req-breakdown::c1");
      expect(reqSection.children[1].title).toBe("Follow-up: Edge Cases Analysis");
      expect(reqSection.children[1].value).toBe("followup::req-breakdown::edge-cases");

      const reviewSection = tree[2].children.find(
        (c) => c.title === "Code Review Assistant",
      );
      expect(reviewSection.children[0].title).toBe(
        "Entire Chat History (2 messages)",
      );
      expect(reviewSection.children[0].value).toBe("chat::code-review");
    });

    it("excludes exploration chats from the tree", () => {
      localStore.getProjectChat.mockReturnValue({
        "explore:req-breakdown:c1": {
          messages: [{ role: "user", content: "Explore details" }],
        },
      });

      const tree = buildContextTreeData({
        knowledgePackContexts: [],
        prompts: [],
        activeProjectId: "project-1",
      });

      const projectPromptsGroup = tree.find(
        (g) => g.title === "Project Prompts",
      );
      expect(projectPromptsGroup).toBeUndefined();
    });
  });

  describe("resolveContextsForRequestBody", () => {
    it("handles empty selections", () => {
      const res = resolveContextsForRequestBody([]);
      expect(res).toEqual({ knowledgePackContexts: [], userContext: "" });
    });

    it("resolves knowledge pack contexts and user contexts", () => {
      localStore.getSummaryForTheUserContext.mockImplementation((title) => {
        if (title === "My Context") return "My custom context summary";
        return "";
      });

      const res = resolveContextsForRequestBody([
        "kp::doc-1",
        "kp::doc-2",
        "user::My Context",
      ]);

      expect(res.knowledgePackContexts).toEqual(["doc-1", "doc-2"]);
      expect(res.userContext).toContain("My custom context summary");
    });

    it("resolves entire section when section key is selected", () => {
      localStore.getProjectCards.mockReturnValue({
        "req-breakdown": [
          { id: "c1", title: "Auth", summary: "Auth summary" },
          { id: "c2", title: "Billing", summary: "Billing summary" },
        ],
      });
      localStore.getProjectFollowUps.mockReturnValue({
        "req-breakdown": {
          "edge-cases": "Edge case details",
        },
      });

      const prompts = [
        {
          identifier: "req-breakdown",
          title: "Requirements Breakdown",
          followUps: [{ identifier: "edge-cases", title: "Edge Cases" }],
        },
      ];

      const res = resolveContextsForRequestBody(["section::req-breakdown"], {
        prompts,
        activeProjectId: "project-1",
      });

      expect(res.userContext).toContain("### Section: Requirements Breakdown");
      expect(res.userContext).toContain("#### Auth\nAuth summary");
      expect(res.userContext).toContain("#### Billing\nBilling summary");
      expect(res.userContext).toContain("##### Follow-up: Edge Cases\nEdge case details");
    });

    it("resolves only selected individual card or follow-up when section is not checked", () => {
      localStore.getProjectCards.mockReturnValue({
        "req-breakdown": [
          { id: "c1", title: "Auth", summary: "Auth summary" },
          { id: "c2", title: "Billing", summary: "Billing summary" },
        ],
      });
      localStore.getProjectFollowUps.mockReturnValue({
        "req-breakdown": {
          "edge-cases": "Edge case details",
        },
      });

      const res = resolveContextsForRequestBody(["card::req-breakdown::c2"], {
        prompts: [{ identifier: "req-breakdown", title: "Requirements Breakdown" }],
      });

      expect(res.userContext).toContain("### Section: Requirements Breakdown");
      expect(res.userContext).toContain("#### Billing\nBilling summary");
      expect(res.userContext).not.toContain("#### Auth");
      expect(res.userContext).not.toContain("##### Follow-up: Edge Cases");
    });

    it("resolves chat history when chat key is selected", () => {
      localStore.getProjectChat.mockReturnValue({
        "arch-chat": {
          messages: [
            { role: "user", content: "How do we scale?" },
            { role: "assistant", content: "Use horizontal scaling." },
          ],
        },
      });

      const res = resolveContextsForRequestBody(["chat::arch-chat"], {
        prompts: [{ identifier: "arch-chat", title: "Architecture Chat" }],
      });

      expect(res.userContext).toContain("### Section: Architecture Chat");
      expect(res.userContext).toContain("#### Chat Conversation");
      expect(res.userContext).toContain("- **User**: How do we scale?");
      expect(res.userContext).toContain("- **Assistant**: Use horizontal scaling.");
    });

    it("supports legacy values without prefixes for backwards compatibility", () => {
      localStore.getSummaryForTheUserContext.mockImplementation((title) => {
        if (title === "Legacy Context") return "Legacy summary";
        return "";
      });

      const res = resolveContextsForRequestBody([
        "Legacy Context",
        "Legacy Knowledge Doc",
      ]);

      expect(res.knowledgePackContexts).toContain("Legacy Knowledge Doc");
      expect(res.userContext).toContain("Legacy summary");
    });
  });
});
