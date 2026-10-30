// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { describe, it, expect, vi } from "vitest";
import {
  addToPinboard,
  getPinboardData,
  getSortedUserContexts,
  deletePinOrNoteByTimestamp,
  saveContext,
  saveNote,
  deleteContextByTimestamp,
  getSummaryForTheUserContext,
  getProjects,
  getActiveProject,
  setActiveProject,
  addProject,
  deleteProject,
  hydrateFromBackend,
  DEFAULT_PROJECT_SECTIONS,
  getProjectCards,
  saveProjectCards,
  deleteProjectCards,
  getProjectChat,
  saveProjectChat,
  deleteProjectChat,
  getExplorationChatKey,
  deleteProjectExplorationsForPrompt,
  getProjectFollowUps,
  saveProjectFollowUps,
  deleteProjectFollowUps,
} from "../app/_local_store";
import { toast } from "react-toastify";

vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("Local Store", () => {
  describe("addToPinboard", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should add content to pinboard and show success message", () => {
      const content = "Test content";
      const key = Date.now();

      addToPinboard(key, content);

      const pinboard = JSON.parse(localStorage.getItem("pinboard"));
      expect(Object.values(pinboard)).toContain(content);
      expect(toast.success).toHaveBeenCalledWith(
        "Text pinned successfully! You can view it on the Pinboard.",
      );
    });

    it("should handle errors and show error message", () => {
      const content = "Test content";
      const key = Date.now();
      const errorMessage = "Failed to pin the content";
      const newLocal = vi.spyOn(localStorage, "setItem");
      newLocal.mockImplementation(() => {
        throw new Error("Storage error");
      });

      addToPinboard(key, content);

      expect(toast.error).toHaveBeenCalledWith(errorMessage);
      newLocal.mockRestore();
    });

    it("should initialize pinboard if it does not exist", () => {
      const content = "Test content";
      const timestamp = 1729881106012;

      addToPinboard(timestamp, content);

      const pinboard = JSON.parse(localStorage.getItem("pinboard"));
      expect(pinboard).toBeDefined();
      expect(Object.entries(pinboard)[0]).toEqual([
        timestamp.toString(),
        content,
      ]);
    });

    it("should add new content to the top of pinboard", () => {
      const content1 = "Test content 1";
      const timestamp1 = 1729881106013;

      const content2 = "Test content 2";
      const timestamp2 = 1729881106014;

      addToPinboard(timestamp1, content1);
      addToPinboard(timestamp2, content2);

      const pinboard = JSON.parse(localStorage.getItem("pinboard"));
      expect(Object.entries(pinboard)[0]).toContain(content2);
      expect(Object.entries(pinboard)[1]).toContain(content1);
    });
  });

  describe("getPinboardData", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should return empty array for empty pinboard", () => {
      const result = getPinboardData();
      expect(result).toEqual([]);
    });

    it("should transform regular pinned content correctly", () => {
      const content = "Regular content";
      const timestamp = "1234";

      addToPinboard(timestamp, content);

      const result = getPinboardData();
      expect(result).toEqual([
        {
          timestamp: timestamp,
          summary: content,
          isUserDefined: false,
        },
      ]);
    });

    it("should transform user-defined content correctly", () => {
      const content = "User content";
      const timestamp = "1234";

      addToPinboard(timestamp, content, true);

      const result = getPinboardData();
      expect(result).toEqual([
        {
          timestamp: timestamp,
          summary: content,
          isUserDefined: true,
        },
      ]);
    });

    it("should sort user-defined content to the top", () => {
      addToPinboard("1", "Regular content");
      addToPinboard("2", "User content", true);
      addToPinboard("3", "Another regular content");

      const result = getPinboardData();
      expect(result[0].isUserDefined).toBe(true);
      expect(result[0].summary).toBe("User content");
      expect(result.length).toBe(3);
    });
  });

  describe("getSortedUserContexts", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should return an empty array if no contexts are set", () => {
      const result = getSortedUserContexts();
      expect(result).toEqual([]);
    });

    it("should return contexts sorted by timestamp in descending order", () => {
      const context1 = {
        title: "Context 1",
        summary: "Summary 1",
        timestamp: 1,
      };
      const context2 = {
        title: "Context 2",
        summary: "Summary 2",
        timestamp: 2,
      };
      const context3 = {
        title: "Context 3",
        summary: "Summary 3",
        timestamp: 3,
      };

      localStorage.setItem(
        "context",
        JSON.stringify([context1, context2, context3]),
      );

      const result = getSortedUserContexts();
      expect(result).toEqual([context3, context2, context1]);
    });
  });

  describe("deletePinOrNoteByTimestamp", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should delete the pin or note by timestamp", () => {
      const timestamp1 = "1234";
      const timestamp2 = "5678";
      const content1 = "Content 1";
      const content2 = "Content 2";

      addToPinboard(timestamp1, content1);
      addToPinboard(timestamp2, content2);

      deletePinOrNoteByTimestamp(timestamp1);

      const pinboard = JSON.parse(localStorage.getItem("pinboard"));
      expect(pinboard[timestamp1]).toBeUndefined();
      expect(pinboard[timestamp2]).toBeDefined();
    });

    it("should do nothing if the timestamp does not exist", () => {
      const timestamp1 = "1234";
      const content1 = "Content 1";

      addToPinboard(timestamp1, content1);

      deletePinOrNoteByTimestamp("5678");

      const pinboard = JSON.parse(localStorage.getItem("pinboard"));
      expect(pinboard[timestamp1]).toBeDefined();
    });
  });

  describe("saveNote", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should save a new note with a timestamp", () => {
      const newNote = "This is a new note";

      saveNote(newNote);

      const pinboard = JSON.parse(localStorage.getItem("pinboard"));
      const timestamps = Object.keys(pinboard);
      expect(timestamps.length).toBe(1);
      expect(pinboard[timestamps[0]].content).toBe(newNote);
      expect(pinboard[timestamps[0]].isUserDefined).toBe(true);
    });

    it("should add a new note to an existing pinboard", () => {
      const existingNote = "Existing note";
      const newNote = "This is a new note";

      vi.setSystemTime(1629881106012);
      saveNote(existingNote);

      vi.setSystemTime(1629881106014);
      saveNote(newNote);

      const pinboard = JSON.parse(localStorage.getItem("pinboard"));
      const timestamps = Object.keys(pinboard);
      expect(timestamps.length).toBe(2);
      expect(pinboard["1629881106014"].content).toBe(newNote);
      expect(pinboard["1629881106014"].isUserDefined).toBe(true);
    });
  });

  describe("saveContext", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should save a new context with a timestamp", () => {
      const title = "Context Title";
      const description = "Context Description";
      vi.setSystemTime(1629881106012);
      saveContext(title, description);

      const contexts = JSON.parse(localStorage.getItem("context"));
      expect(contexts.length).toBe(1);
      expect(contexts[0].title).toBe(title);
      expect(contexts[0].summary).toBe(description);
      expect(contexts[0].isUserDefined).toBe(true);
      expect(contexts[0].timestamp).toBeDefined();

      expect(contexts[0].timestamp).toBe(1629881106012);
      vi.useRealTimers();
    });

    it("should add a new context to an existing list", () => {
      const title1 = "Context Title 1";
      const description1 = "Context Description 1";
      const title2 = "Context Title 2";
      const description2 = "Context Description 2";

      saveContext(title1, description1);
      saveContext(title2, description2);

      const contexts = JSON.parse(localStorage.getItem("context"));
      expect(contexts.length).toBe(2);
      expect(contexts[1].title).toBe(title2);
      expect(contexts[1].summary).toBe(description2);
      expect(contexts[1].isUserDefined).toBe(true);
    });
  });

  describe("deleteContextByTimestamp", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should delete the context by timestamp", () => {
      const title1 = "Context Title 1";
      const description1 = "Context Description 1";
      const title2 = "Context Title 2";
      const description2 = "Context Description 2";

      vi.setSystemTime(1629881106012);
      saveContext(title1, description1);

      vi.setSystemTime(1629881106014);
      saveContext(title2, description2);

      deleteContextByTimestamp(1629881106014);

      const contexts = JSON.parse(localStorage.getItem("context"));
      expect(contexts.length).toBe(1);
      expect(contexts[0].title).toBe(title1);
    });

    it("should do nothing if the timestamp does not exist", () => {
      const timestamp1 = Date.now();
      const title1 = "Context Title 1";
      const description1 = "Context Description 1";

      saveContext(title1, description1);

      deleteContextByTimestamp(timestamp1 + 1);

      const contexts = JSON.parse(localStorage.getItem("context"));
      expect(contexts.length).toBe(1);
      expect(contexts[0].title).toBe(title1);
    });
  });

  describe("getSummaryForTheUserContext", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should return an empty string if no context matches the title", () => {
      const title = "Non-existent Context";
      const result = getSummaryForTheUserContext(title);
      expect(result).toBe("");
    });

    it("should return the summary for the matching context title", () => {
      const context1 = {
        title: "Context 1",
        summary: "Summary 1",
        timestamp: 1,
      };
      const context2 = {
        title: "Context 2",
        summary: "Summary 2",
        timestamp: 2,
      };

      localStorage.setItem("context", JSON.stringify([context1, context2]));

      const result = getSummaryForTheUserContext("Context 2");
      expect(result).toBe("Summary 2");
    });
  });

  describe("Projects management", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should return default project when no projects exist in localStorage", () => {
      const projects = getProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].id).toBe("default");
      expect(projects[0].name).toBe("Default Project");
      expect(projects[0].sections).toEqual(DEFAULT_PROJECT_SECTIONS);
      expect(getActiveProject().id).toBe("default");
    });

    it("should add a new project with custom sections and set it as active", () => {
      const created = addProject("Alpha Project", "Alpha description", [
        "research",
        "coding",
      ]);

      expect(created).not.toBeNull();
      expect(created.name).toBe("Alpha Project");
      expect(created.description).toBe("Alpha description");
      expect(created.sections).toEqual(["research", "coding"]);

      const projects = getProjects();
      expect(projects.length).toBe(2);
      expect(getActiveProject().id).toBe(created.id);
    });

    it("should switch between projects and isolate pinboard and context data", () => {
      // Save data in Default Project
      saveNote("Default project note");
      saveContext("Default Context", "Default Summary");

      // Create and switch to Project B
      const projectB = addProject("Project B", "B desc", ["ideate"]);
      expect(getActiveProject().id).toBe(projectB.id);

      // Project B should start with empty pinboard and contexts
      expect(getPinboardData()).toEqual([]);
      expect(getSortedUserContexts()).toEqual([]);

      // Save data in Project B
      saveNote("Project B note");
      saveContext("Project B Context", "Project B Summary");
      expect(getPinboardData().length).toBe(1);
      expect(getPinboardData()[0].summary).toBe("Project B note");
      expect(getSortedUserContexts().length).toBe(1);
      expect(getSortedUserContexts()[0].title).toBe("Project B Context");

      // Switch back to Default Project
      setActiveProject("default");
      expect(getActiveProject().id).toBe("default");
      expect(getPinboardData().length).toBe(1);
      expect(getPinboardData()[0].summary).toBe("Default project note");
      expect(getSortedUserContexts().length).toBe(1);
      expect(getSortedUserContexts()[0].title).toBe("Default Context");
    });

    it("should delete a non-default project and revert active project to default", () => {
      const projectB = addProject("Project B", "Desc", ["coding"]);
      expect(getActiveProject().id).toBe(projectB.id);

      const deleted = deleteProject(projectB.id);
      expect(deleted).toBe(true);
      expect(getProjects().length).toBe(1);
      expect(getActiveProject().id).toBe("default");
    });

    it("should not allow deleting the default project", () => {
      expect(deleteProject("default")).toBe(false);
      expect(getProjects().length).toBe(1);
    });

    it("should hydrate projects, pinboard, and contexts from backend API", async () => {
      const serverPayload = {
        projects: [
          {
            id: "default",
            name: "Default Project",
            sections: DEFAULT_PROJECT_SECTIONS,
            isDefault: true,
          },
          {
            id: "project-500",
            name: "Server Project",
            description: "Loaded from server",
            sections: ["research", "architecture"],
            isDefault: false,
          },
        ],
        activeProjectId: "project-500",
        pinboard: {
          "project-500": {
            "17000099": { content: "Server pinned note", isUserDefined: true },
          },
        },
        contexts: {
          "project-500": [
            {
              title: "Server Context",
              summary: "Server Context Summary",
              timestamp: 17000099,
              isUserDefined: true,
            },
          ],
        },
      };

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => serverPayload,
      });

      await hydrateFromBackend();

      expect(getActiveProject().id).toBe("project-500");
      expect(getActiveProject().name).toBe("Server Project");
      expect(getPinboardData()[0].summary).toBe("Server pinned note");
      expect(getSortedUserContexts()[0].title).toBe("Server Context");

      fetchSpy.mockRestore();
    });
  });

  describe("Cards management", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should return empty array when no cards exist for prompt", () => {
      expect(getProjectCards("prompt-1")).toEqual([]);
    });

    it("should save cards and retrieve them by prompt and project", () => {
      const cards = [
        { title: "Candidate A", summary: "Modular Monolith" },
        { title: "Candidate B", summary: "Microservices" },
      ];

      saveProjectCards("prompt-1", cards);

      const retrieved = getProjectCards("prompt-1");
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].title).toBe("Candidate A");
    });

    it("should isolate cards between different projects", () => {
      saveProjectCards("prompt-1", [{ title: "Default Card" }], "default");
      saveProjectCards("prompt-1", [{ title: "Proj 2 Card" }], "project-2");

      expect(getProjectCards("prompt-1", "default")[0].title).toBe("Default Card");
      expect(getProjectCards("prompt-1", "project-2")[0].title).toBe("Proj 2 Card");
    });

    it("should delete cards for a specific prompt", () => {
      saveProjectCards("prompt-1", [{ title: "Card 1" }]);
      saveProjectCards("prompt-2", [{ title: "Card 2" }]);

      deleteProjectCards("prompt-1");

      expect(getProjectCards("prompt-1")).toEqual([]);
      expect(getProjectCards("prompt-2")).toHaveLength(1);
    });

    it("should hydrate cards from backend state", async () => {
      const serverPayload = {
        projects: [
          {
            id: "default",
            name: "Default Project",
            description: "Default workspace project",
            sections: DEFAULT_PROJECT_SECTIONS,
            isDefault: true,
          },
        ],
        activeProjectId: "default",
        pinboard: {},
        contexts: {},
        cards: {
          default: {
            "prompt-arch": [{ title: "Hydrated Card", summary: "From server" }],
          },
        },
      };

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => serverPayload,
      });

      await hydrateFromBackend();

      const cards = getProjectCards("prompt-arch", "default");
      expect(cards).toHaveLength(1);
      expect(cards[0].title).toBe("Hydrated Card");

      fetchSpy.mockRestore();
    });
  });

  describe("Chats management", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should return null when no chat exists for prompt", () => {
      expect(getProjectChat("prompt-1")).toBeNull();
    });

    it("should save chat and retrieve it by prompt and project", () => {
      const chatData = {
        chatSessionId: "boba-chat-101",
        messages: [
          { id: "1", role: "user", content: "Hello" },
          { id: "2", role: "assistant", content: "Hi there!" },
        ],
        tokenUsage: { input_tokens: 10, output_tokens: 20 },
      };

      saveProjectChat("prompt-1", chatData);

      const retrieved = getProjectChat("prompt-1");
      expect(retrieved.chatSessionId).toBe("boba-chat-101");
      expect(retrieved.messages).toHaveLength(2);
      expect(retrieved.messages[1].content).toBe("Hi there!");
    });

    it("should isolate chats between different projects", () => {
      saveProjectChat(
        "prompt-1",
        {
          chatSessionId: "session-def",
          messages: [{ id: "1", role: "assistant", content: "Default reply" }],
        },
        "default",
      );
      saveProjectChat(
        "prompt-1",
        {
          chatSessionId: "session-p2",
          messages: [{ id: "1", role: "assistant", content: "Proj 2 reply" }],
        },
        "project-2",
      );

      expect(getProjectChat("prompt-1", "default").messages[0].content).toBe(
        "Default reply",
      );
      expect(getProjectChat("prompt-1", "project-2").messages[0].content).toBe(
        "Proj 2 reply",
      );
    });

    it("should delete chat for a specific prompt", () => {
      saveProjectChat("prompt-1", {
        chatSessionId: "s1",
        messages: [{ id: "1", role: "user", content: "Msg 1" }],
      });
      saveProjectChat("prompt-2", {
        chatSessionId: "s2",
        messages: [{ id: "2", role: "user", content: "Msg 2" }],
      });

      deleteProjectChat("prompt-1");

      expect(getProjectChat("prompt-1")).toBeNull();
      expect(getProjectChat("prompt-2").chatSessionId).toBe("s2");
    });

    it("should hydrate chats from backend state", async () => {
      const serverPayload = {
        projects: [
          {
            id: "default",
            name: "Default Project",
            description: "Default workspace project",
            sections: DEFAULT_PROJECT_SECTIONS,
            isDefault: true,
          },
        ],
        activeProjectId: "default",
        pinboard: {},
        contexts: {},
        cards: {},
        chats: {
          default: {
            "prompt-chat-1": {
              chatSessionId: "server-session-1",
              messages: [
                { id: "m1", role: "user", content: "From server user" },
                { id: "m2", role: "assistant", content: "From server AI" },
              ],
            },
          },
        },
      };

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => serverPayload,
      });

      await hydrateFromBackend();

      const chat = getProjectChat("prompt-chat-1", "default");
      expect(chat.chatSessionId).toBe("server-session-1");
      expect(chat.messages).toHaveLength(2);
      expect(chat.messages[1].content).toBe("From server AI");

      fetchSpy.mockRestore();
    });

    it("should build exploration chat keys and delete all explorations for a prompt", () => {
      const key1 = getExplorationChatKey("prompt-a", "card-1");
      const key2 = getExplorationChatKey("prompt-a", "card-2");
      const keyOther = getExplorationChatKey("prompt-b", "card-1");

      expect(key1).toBe("explore:prompt-a:card-1");

      saveProjectChat(key1, {
        chatSessionId: "exp-1",
        messages: [{ id: "1", role: "assistant", content: "Explore 1" }],
      });
      saveProjectChat(key2, {
        chatSessionId: "exp-2",
        messages: [{ id: "2", role: "assistant", content: "Explore 2" }],
      });
      saveProjectChat(keyOther, {
        chatSessionId: "exp-other",
        messages: [{ id: "3", role: "assistant", content: "Explore Other" }],
      });

      deleteProjectExplorationsForPrompt("prompt-a");

      expect(getProjectChat(key1)).toBeNull();
      expect(getProjectChat(key2)).toBeNull();
      expect(getProjectChat(keyOther)?.chatSessionId).toBe("exp-other");
    });
  });

  describe("Follow-ups management", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("should return empty object when no follow-ups exist for prompt", () => {
      expect(getProjectFollowUps("prompt-1")).toEqual({});
    });

    it("should save follow-ups and retrieve them by prompt and project", () => {
      const followUps = {
        "follow-1": "Follow-up 1 markdown output",
        "follow-2": "Follow-up 2 markdown output",
      };

      saveProjectFollowUps("prompt-1", followUps);

      const retrieved = getProjectFollowUps("prompt-1");
      expect(retrieved["follow-1"]).toBe("Follow-up 1 markdown output");
      expect(retrieved["follow-2"]).toBe("Follow-up 2 markdown output");
    });

    it("should isolate follow-ups between different projects", () => {
      saveProjectFollowUps("prompt-1", { f1: "Default follow-up" }, "default");
      saveProjectFollowUps(
        "prompt-1",
        { f1: "Project 2 follow-up" },
        "project-2",
      );

      expect(getProjectFollowUps("prompt-1", "default").f1).toBe(
        "Default follow-up",
      );
      expect(getProjectFollowUps("prompt-1", "project-2").f1).toBe(
        "Project 2 follow-up",
      );
    });

    it("should delete follow-ups for a specific prompt", () => {
      saveProjectFollowUps("prompt-1", { f1: "Output 1" });
      saveProjectFollowUps("prompt-2", { f2: "Output 2" });

      deleteProjectFollowUps("prompt-1");

      expect(getProjectFollowUps("prompt-1")).toEqual({});
      expect(getProjectFollowUps("prompt-2").f2).toBe("Output 2");
    });

    it("should hydrate follow-ups from backend state", async () => {
      const serverPayload = {
        projects: [
          {
            id: "default",
            name: "Default Project",
            description: "Default workspace project",
            sections: DEFAULT_PROJECT_SECTIONS,
            isDefault: true,
          },
        ],
        activeProjectId: "default",
        pinboard: {},
        contexts: {},
        cards: {},
        chats: {},
        followUps: {
          default: {
            "prompt-arch": {
              "follow-up-a": "Hydrated follow-up response",
            },
          },
        },
      };

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => serverPayload,
      });

      await hydrateFromBackend();

      const followUps = getProjectFollowUps("prompt-arch", "default");
      expect(followUps["follow-up-a"]).toBe("Hydrated follow-up response");

      fetchSpy.mockRestore();
    });
  });
});
