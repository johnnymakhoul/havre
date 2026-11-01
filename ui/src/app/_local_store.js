// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { toast } from "react-toastify";

export const DEFAULT_PROJECT_SECTIONS = [
  "research",
  "ideate",
  "analysis",
  "specification",
  "project-management",
  "coding",
  "testing",
  "architecture",
  "other",
];

export const DEFAULT_PROJECT = {
  id: "default",
  name: "Default Project",
  description: "Default workspace project",
  sections: DEFAULT_PROJECT_SECTIONS,
  isDefault: true,
};

const syncWithBackend = async (url, options = {}) => {
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });
    if (!response || typeof response.json !== "function" || !response.ok) {
      return null;
    }
    return await response.json();
  } catch (e) {
    return null;
  }
};

export const getProjects = () => {
  try {
    const raw = localStorage.getItem("projects");
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [DEFAULT_PROJECT];
    }
    const hasDefault = parsed.some((p) => p.id === DEFAULT_PROJECT.id);
    const list = hasDefault ? parsed : [DEFAULT_PROJECT, ...parsed];
    return list.map((p) => {
      if (
        p.isDefault ||
        p.id === DEFAULT_PROJECT.id ||
        (Array.isArray(p.sections) &&
          p.sections.includes("analysis") &&
          p.sections.includes("architecture") &&
          (!p.sections.includes("specification") ||
            !p.sections.includes("project-management")))
      ) {
        return {
          ...p,
          sections: Array.from(
            new Set([
              ...(p.sections || []),
              "specification",
              "project-management",
            ]),
          ),
        };
      }
      return p;
    });
  } catch (e) {
    return [DEFAULT_PROJECT];
  }
};

export const getActiveProjectId = () => {
  try {
    const activeId = localStorage.getItem("activeProjectId");
    if (!activeId) return DEFAULT_PROJECT.id;
    const projects = getProjects();
    return projects.some((p) => p.id === activeId)
      ? activeId
      : DEFAULT_PROJECT.id;
  } catch (e) {
    return DEFAULT_PROJECT.id;
  }
};

export const getActiveProject = () => {
  const projects = getProjects();
  const activeId = getActiveProjectId();
  return (
    projects.find((p) => p.id === activeId) || projects[0] || DEFAULT_PROJECT
  );
};

export const setActiveProject = (projectId) => {
  const projects = getProjects();
  const target = projects.find((p) => p.id === projectId);
  const resolvedId = target ? target.id : DEFAULT_PROJECT.id;
  localStorage.setItem("activeProjectId", resolvedId);
  syncWithBackend("/api/projects/active", {
    method: "PUT",
    body: JSON.stringify({ projectId: resolvedId }),
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("update-project"));
    window.dispatchEvent(new Event("update-context"));
  }
  return target || DEFAULT_PROJECT;
};

export const addProject = (
  name,
  description = "",
  sections = DEFAULT_PROJECT_SECTIONS,
) => {
  const trimmedName = (name || "").trim();
  if (!trimmedName) {
    return null;
  }
  const projects = getProjects();
  const timestamp = Date.now();
  const newProject = {
    id: `project-${timestamp}`,
    name: trimmedName,
    description: (description || "").trim(),
    sections:
      Array.isArray(sections) && sections.length > 0
        ? sections
        : DEFAULT_PROJECT_SECTIONS,
    timestamp,
    isDefault: false,
  };
  const updatedProjects = [...projects, newProject];
  localStorage.setItem("projects", JSON.stringify(updatedProjects));
  syncWithBackend("/api/projects", {
    method: "POST",
    body: JSON.stringify(newProject),
  });
  setActiveProject(newProject.id);
  return newProject;
};

export const deleteProject = (projectId) => {
  if (!projectId || projectId === DEFAULT_PROJECT.id) {
    return false;
  }
  const projects = getProjects();
  const updatedProjects = projects.filter((p) => p.id !== projectId);
  localStorage.setItem("projects", JSON.stringify(updatedProjects));
  if (typeof localStorage.removeItem === "function") {
    localStorage.removeItem(`pinboard_${projectId}`);
    localStorage.removeItem(`context_${projectId}`);
    localStorage.removeItem(`cards_${projectId}`);
    localStorage.removeItem(`chats_${projectId}`);
    localStorage.removeItem(`follow_ups_${projectId}`);
    localStorage.removeItem(`tasks_${projectId}`);
  } else {
    localStorage.setItem(`pinboard_${projectId}`, JSON.stringify({}));
    localStorage.setItem(`context_${projectId}`, JSON.stringify([]));
    localStorage.setItem(`cards_${projectId}`, JSON.stringify({}));
    localStorage.setItem(`chats_${projectId}`, JSON.stringify({}));
    localStorage.setItem(`follow_ups_${projectId}`, JSON.stringify({}));
    localStorage.setItem(`tasks_${projectId}`, JSON.stringify([]));
  }
  syncWithBackend(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
  if (getActiveProjectId() === projectId) {
    setActiveProject(DEFAULT_PROJECT.id);
  } else if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("update-project"));
  }
  return true;
};

const getPinboardStorageKey = (projectId = null) => {
  const activeId = projectId || getActiveProjectId();
  return activeId && activeId !== DEFAULT_PROJECT.id
    ? `pinboard_${activeId}`
    : "pinboard";
};

const getContextStorageKey = (projectId = null) => {
  const activeId = projectId || getActiveProjectId();
  return activeId && activeId !== DEFAULT_PROJECT.id
    ? `context_${activeId}`
    : "context";
};

export const getCardsStorageKey = (projectId = null) => {
  const activeId = projectId || getActiveProjectId();
  return activeId && activeId !== DEFAULT_PROJECT.id
    ? `cards_${activeId}`
    : "cards";
};

export const getProjectCards = (promptId = null, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getCardsStorageKey(activeId);
    const raw = localStorage.getItem(storageKey);
    const cardsMap = raw ? JSON.parse(raw) : {};
    if (promptId) {
      return cardsMap[promptId] || [];
    }
    return cardsMap || {};
  } catch (e) {
    return promptId ? [] : {};
  }
};

export const saveProjectCards = (promptId, cards, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getCardsStorageKey(activeId);
    const raw = localStorage.getItem(storageKey);
    const cardsMap = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const normalizedCards = Array.isArray(cards)
      ? cards.map((card, idx) => ({
          ...card,
          id: card?.id || `card-${now}-${idx}`,
        }))
      : [];
    cardsMap[promptId] = normalizedCards;
    localStorage.setItem(storageKey, JSON.stringify(cardsMap));
    syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/cards`, {
      method: "POST",
      body: JSON.stringify({ promptId, cards: normalizedCards }),
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("update-cards", {
          detail: { promptId, cards: normalizedCards, projectId: activeId },
        }),
      );
    }
    return normalizedCards;
  } catch (e) {
    console.error("Failed to save project cards", e);
    return cards;
  }
};

export const deleteProjectCards = (promptId = null, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getCardsStorageKey(activeId);
    if (promptId) {
      const raw = localStorage.getItem(storageKey);
      const cardsMap = raw ? JSON.parse(raw) : {};
      delete cardsMap[promptId];
      localStorage.setItem(storageKey, JSON.stringify(cardsMap));
      syncWithBackend(
        `/api/projects/${encodeURIComponent(activeId)}/cards?promptId=${encodeURIComponent(promptId)}`,
        { method: "DELETE" },
      );
    } else {
      localStorage.removeItem(storageKey);
      syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/cards`, {
        method: "DELETE",
      });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("update-cards"));
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const getChatsStorageKey = (projectId = null) => {
  const activeId = projectId || getActiveProjectId();
  return activeId && activeId !== DEFAULT_PROJECT.id
    ? `chats_${activeId}`
    : "chats";
};

export const getProjectChat = (promptId = null, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getChatsStorageKey(activeId);
    const raw = localStorage.getItem(storageKey);
    const chatsMap = raw ? JSON.parse(raw) : {};
    if (promptId) {
      return chatsMap[promptId] || null;
    }
    return chatsMap || {};
  } catch (e) {
    return promptId ? null : {};
  }
};

export const saveProjectChat = (promptId, chatData, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const resolvedPrompt = promptId || "default";
    const storageKey = getChatsStorageKey(activeId);
    const raw = localStorage.getItem(storageKey);
    const chatsMap = raw ? JSON.parse(raw) : {};
    const payload = {
      chatSessionId: chatData?.chatSessionId,
      messages: Array.isArray(chatData?.messages) ? chatData.messages : [],
      tokenUsage: chatData?.tokenUsage || {
        input_tokens: 0,
        output_tokens: 0,
      },
      updatedAt: chatData?.updatedAt || Date.now(),
    };
    chatsMap[resolvedPrompt] = payload;
    localStorage.setItem(storageKey, JSON.stringify(chatsMap));
    syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/chats`, {
      method: "POST",
      body: JSON.stringify({
        promptId: resolvedPrompt,
        ...payload,
      }),
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("update-chats", {
          detail: {
            promptId: resolvedPrompt,
            chat: payload,
            projectId: activeId,
          },
        }),
      );
    }
    return payload;
  } catch (e) {
    console.error("Failed to save project chat", e);
    return chatData;
  }
};

export const deleteProjectChat = (promptId = null, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getChatsStorageKey(activeId);
    if (promptId) {
      const raw = localStorage.getItem(storageKey);
      const chatsMap = raw ? JSON.parse(raw) : {};
      delete chatsMap[promptId];
      localStorage.setItem(storageKey, JSON.stringify(chatsMap));
      syncWithBackend(
        `/api/projects/${encodeURIComponent(activeId)}/chats?promptId=${encodeURIComponent(promptId)}`,
        { method: "DELETE" },
      );
    } else {
      if (typeof localStorage.removeItem === "function") {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify({}));
      }
      syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/chats`, {
        method: "DELETE",
      });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("update-chats"));
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const getExplorationChatKey = (promptId, cardKey) => {
  const resolvedPrompt = promptId || "default";
  const resolvedCard = cardKey || "default";
  return `explore:${resolvedPrompt}:${resolvedCard}`;
};

export const deleteProjectExplorationsForPrompt = (
  promptId,
  projectId = null,
) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getChatsStorageKey(activeId);
    const raw = localStorage.getItem(storageKey);
    const chatsMap = raw ? JSON.parse(raw) : {};
    const prefix = `explore:${promptId || "default"}:`;
    const matchingKeys = Object.keys(chatsMap).filter((k) =>
      k.startsWith(prefix),
    );
    matchingKeys.forEach((key) => {
      delete chatsMap[key];
      syncWithBackend(
        `/api/projects/${encodeURIComponent(activeId)}/chats?promptId=${encodeURIComponent(key)}`,
        { method: "DELETE" },
      );
    });
    localStorage.setItem(storageKey, JSON.stringify(chatsMap));
    if (typeof window !== "undefined" && matchingKeys.length > 0) {
      window.dispatchEvent(new Event("update-chats"));
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const getFollowUpsStorageKey = (projectId = null) => {
  const activeId = projectId || getActiveProjectId();
  return activeId && activeId !== DEFAULT_PROJECT.id
    ? `follow_ups_${activeId}`
    : "follow_ups";
};

export const getProjectFollowUps = (promptId = null, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getFollowUpsStorageKey(activeId);
    const raw = localStorage.getItem(storageKey);
    const followUpsMap = raw ? JSON.parse(raw) : {};
    if (promptId) {
      return followUpsMap[promptId] || {};
    }
    return followUpsMap || {};
  } catch (e) {
    return {};
  }
};

export const saveProjectFollowUps = (
  promptId,
  followUps,
  projectId = null,
) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const resolvedPrompt = promptId || "default";
    const storageKey = getFollowUpsStorageKey(activeId);
    const raw = localStorage.getItem(storageKey);
    const followUpsMap = raw ? JSON.parse(raw) : {};
    const payload =
      followUps && typeof followUps === "object" ? { ...followUps } : {};
    followUpsMap[resolvedPrompt] = payload;
    localStorage.setItem(storageKey, JSON.stringify(followUpsMap));
    syncWithBackend(
      `/api/projects/${encodeURIComponent(activeId)}/follow-ups`,
      {
        method: "POST",
        body: JSON.stringify({
          promptId: resolvedPrompt,
          followUps: payload,
        }),
      },
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("update-follow-ups", {
          detail: {
            promptId: resolvedPrompt,
            followUps: payload,
            projectId: activeId,
          },
        }),
      );
    }
    return payload;
  } catch (e) {
    console.error("Failed to save project follow-ups", e);
    return followUps;
  }
};

export const deleteProjectFollowUps = (promptId = null, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getFollowUpsStorageKey(activeId);
    if (promptId) {
      const raw = localStorage.getItem(storageKey);
      const followUpsMap = raw ? JSON.parse(raw) : {};
      delete followUpsMap[promptId];
      localStorage.setItem(storageKey, JSON.stringify(followUpsMap));
      syncWithBackend(
        `/api/projects/${encodeURIComponent(activeId)}/follow-ups?promptId=${encodeURIComponent(promptId)}`,
        { method: "DELETE" },
      );
    } else {
      if (typeof localStorage.removeItem === "function") {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify({}));
      }
      syncWithBackend(
        `/api/projects/${encodeURIComponent(activeId)}/follow-ups`,
        {
          method: "DELETE",
        },
      );
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("update-follow-ups"));
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const getTasksStorageKey = (projectId = null) => {
  const activeId = projectId || getActiveProjectId();
  return activeId && activeId !== DEFAULT_PROJECT.id
    ? `tasks_${activeId}`
    : "tasks";
};

export const getProjectTasks = (projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getTasksStorageKey(activeId);
    const raw = localStorage.getItem(storageKey);
    const rawTasks = raw ? JSON.parse(raw) : [];
    const tasks = Array.isArray(rawTasks) ? rawTasks : [];

    // Ensure every task has a robust, guaranteed unique id
    let needsResave = false;
    const seenIds = new Set();
    const normalizedTasks = tasks.map((t, idx) => {
      let id = t?.id;
      if (!id || seenIds.has(id)) {
        id = t?.sourceRef
          ? `task-${t.sourceRef}-${idx}`
          : `task-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`;
        needsResave = true;
      }
      seenIds.add(id);
      return {
        ...t,
        id,
        status: t?.status || "backlog",
        hitl: t?.hitl || { required: false, reason: "" },
      };
    });

    if (needsResave && normalizedTasks.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(normalizedTasks));
    }

    if (typeof fetch === "function") {
      syncWithBackend(
        `/api/projects/${encodeURIComponent(activeId)}/tasks`,
      ).then((serverTasks) => {
        if (Array.isArray(serverTasks) && serverTasks.length > 0) {
          localStorage.setItem(storageKey, JSON.stringify(serverTasks));
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("update-tasks", {
                detail: { tasks: serverTasks, projectId: activeId },
              }),
            );
          }
        }
      });
    }

    return normalizedTasks;
  } catch (e) {
    return [];
  }
};

export const saveProjectTasks = (tasks, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getTasksStorageKey(activeId);
    const now = Date.now();
    const normalizedTasks = Array.isArray(tasks)
      ? tasks.map((task, idx) => ({
          ...task,
          id: task?.id || `task-${now}-${idx}`,
          status: task?.status || "backlog",
          hitl: task?.hitl || { required: false, reason: "" },
          updatedAt: task?.updatedAt || now,
        }))
      : [];

    localStorage.setItem(storageKey, JSON.stringify(normalizedTasks));
    syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/tasks`, {
      method: "POST",
      body: JSON.stringify({ tasks: normalizedTasks }),
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("update-tasks", {
          detail: { tasks: normalizedTasks, projectId: activeId },
        }),
      );
    }
    return normalizedTasks;
  } catch (e) {
    console.error("Failed to save project tasks", e);
    return tasks;
  }
};

export const deleteProjectTasks = (projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getTasksStorageKey(activeId);
    localStorage.removeItem(storageKey);
    syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/tasks`, {
      method: "DELETE",
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("update-tasks", {
          detail: { tasks: [], projectId: activeId },
        }),
      );
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const syncWbsToTasks = (projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const wbsPromptId = "work-breakdown-structure-cards-7f1a5e3c";
    const existingCards = getProjectCards(wbsPromptId, activeId);

    if (!Array.isArray(existingCards) || existingCards.length === 0) {
      return getProjectTasks(activeId);
    }

    const currentTasks = getProjectTasks(activeId);
    const existingIds = new Set(
      currentTasks.map((t) => t.sourceRef || t.id || t.title),
    );

    let hasNew = false;
    const newTasks = [];

    existingCards.forEach((card, idx) => {
      const cardRef = card.id || card.title;
      if (!existingIds.has(cardRef) && !existingIds.has(card.title)) {
        hasNew = true;
        const now = Date.now();
        const uniqueId = `task-wbs-${card.id || `item-${idx}`}-${now}-${Math.random().toString(36).substr(2, 5)}`;
        newTasks.push({
          id: uniqueId,
          source: "wbs_sync",
          sourceRef: cardRef,
          title: card.title || "Untitled WBS Work Package",
          wbsLevel: card.wbs_level || "Level 3 - Work Package",
          pbsDeliverableRef: card.pbs_deliverable_ref || "",
          pdpStageRef: card.pdp_stage_ref || "",
          summary: card.summary || "",
          selfReview: card["self-review"] || "",
          status: "backlog",
          hitl: {
            required: false,
            reason: "",
          },
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    if (hasNew && newTasks.length > 0) {
      const merged = [...currentTasks, ...newTasks];
      return saveProjectTasks(merged, activeId);
    }

    return currentTasks;
  } catch (e) {
    console.error("Failed to sync WBS cards to tasks", e);
    return getProjectTasks(projectId);
  }
};

export const createTask = (taskData, projectId = null) => {
  const activeId = projectId || getActiveProjectId();
  const currentTasks = getProjectTasks(activeId);
  const now = Date.now();
  const newTask = {
    id: `task-manual-${now}-${Math.random().toString(36).substr(2, 6)}`,
    source: "manual",
    title: taskData.title || "New Task",
    status: taskData.status || "backlog",
    summary: taskData.summary || "",
    wbsLevel: taskData.wbsLevel || "Work Item",
    pbsDeliverableRef: taskData.pbsDeliverableRef || "",
    pdpStageRef: taskData.pdpStageRef || "",
    hitl: taskData.hitl || { required: false, reason: "" },
    createdAt: now,
    updatedAt: now,
  };
  const updated = [newTask, ...currentTasks];
  saveProjectTasks(updated, activeId);
  return newTask;
};

export const updateTask = (taskId, updates, projectId = null) => {
  const activeId = projectId || getActiveProjectId();
  const currentTasks = getProjectTasks(activeId);
  const now = Date.now();
  const updated = currentTasks.map((t) => {
    if (t.id === taskId) {
      return {
        ...t,
        ...updates,
        updatedAt: now,
      };
    }
    return t;
  });
  saveProjectTasks(updated, activeId);
  return updated.find((t) => t.id === taskId);
};

export const deleteTask = (taskId, projectId = null) => {
  const activeId = projectId || getActiveProjectId();
  const currentTasks = getProjectTasks(activeId);
  const filtered = currentTasks.filter((t) => t.id !== taskId);
  saveProjectTasks(filtered, activeId);
  return true;
};


export const hydrateFromBackend = async () => {
  const serverState = await syncWithBackend("/api/persistence/state", {
    method: "GET",
  });
  if (!serverState || !Array.isArray(serverState.projects)) {
    return null;
  }

  const serverHasCustomData =
    serverState.projects.length > 1 ||
    Object.keys(serverState.pinboard || {}).length > 0 ||
    Object.keys(serverState.contexts || {}).length > 0 ||
    Object.keys(serverState.cards || {}).length > 0 ||
    Object.keys(serverState.chats || {}).length > 0 ||
    Object.keys(serverState.followUps || {}).length > 0;

  if (serverHasCustomData) {
    localStorage.setItem("projects", JSON.stringify(serverState.projects));
    if (serverState.activeProjectId) {
      localStorage.setItem("activeProjectId", serverState.activeProjectId);
    }
    if (serverState.pinboard && typeof serverState.pinboard === "object") {
      Object.entries(serverState.pinboard).forEach(([projId, pins]) => {
        localStorage.setItem(
          getPinboardStorageKey(projId),
          JSON.stringify(pins || {}),
        );
      });
    }
    if (serverState.contexts && typeof serverState.contexts === "object") {
      Object.entries(serverState.contexts).forEach(([projId, ctxs]) => {
        localStorage.setItem(
          getContextStorageKey(projId),
          JSON.stringify(ctxs || []),
        );
      });
    }
    if (serverState.cards && typeof serverState.cards === "object") {
      Object.entries(serverState.cards).forEach(([projId, cards]) => {
        localStorage.setItem(
          getCardsStorageKey(projId),
          JSON.stringify(cards || {}),
        );
      });
    }
    if (serverState.chats && typeof serverState.chats === "object") {
      Object.entries(serverState.chats).forEach(([projId, chats]) => {
        localStorage.setItem(
          getChatsStorageKey(projId),
          JSON.stringify(chats || {}),
        );
      });
    }
    if (serverState.followUps && typeof serverState.followUps === "object") {
      Object.entries(serverState.followUps).forEach(([projId, followUps]) => {
        localStorage.setItem(
          getFollowUpsStorageKey(projId),
          JSON.stringify(followUps || {}),
        );
      });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("update-project"));
      window.dispatchEvent(new Event("update-context"));
      window.dispatchEvent(new Event("update-cards"));
      window.dispatchEvent(new Event("update-chats"));
      window.dispatchEvent(new Event("update-follow-ups"));
    }
  } else {
    // Migrate existing localStorage data to server if present
    const localProjects = getProjects();
    const pinboardByProject = {};
    const contextsByProject = {};
    const cardsByProject = {};
    const chatsByProject = {};
    const followUpsByProject = {};
    localProjects.forEach((p) => {
      const pins =
        JSON.parse(localStorage.getItem(getPinboardStorageKey(p.id))) || {};
      if (Object.keys(pins).length > 0) {
        pinboardByProject[p.id] = pins;
      }
      const ctxs =
        JSON.parse(localStorage.getItem(getContextStorageKey(p.id))) || [];
      if (ctxs.length > 0) {
        contextsByProject[p.id] = ctxs;
      }
      const cards =
        JSON.parse(localStorage.getItem(getCardsStorageKey(p.id))) || {};
      if (Object.keys(cards).length > 0) {
        cardsByProject[p.id] = cards;
      }
      const chats =
        JSON.parse(localStorage.getItem(getChatsStorageKey(p.id))) || {};
      if (Object.keys(chats).length > 0) {
        chatsByProject[p.id] = chats;
      }
      const followUps =
        JSON.parse(localStorage.getItem(getFollowUpsStorageKey(p.id))) || {};
      if (Object.keys(followUps).length > 0) {
        followUpsByProject[p.id] = followUps;
      }
    });
    if (
      localProjects.length > 1 ||
      Object.keys(pinboardByProject).length > 0 ||
      Object.keys(contextsByProject).length > 0 ||
      Object.keys(cardsByProject).length > 0 ||
      Object.keys(chatsByProject).length > 0 ||
      Object.keys(followUpsByProject).length > 0
    ) {
      await syncWithBackend("/api/persistence/state", {
        method: "PUT",
        body: JSON.stringify({
          projects: localProjects,
          activeProjectId: getActiveProjectId(),
          pinboard: pinboardByProject,
          contexts: contextsByProject,
          cards: cardsByProject,
          chats: chatsByProject,
          followUps: followUpsByProject,
        }),
      });
    }
  }
  return serverState;
};

export const initializeLocalStorage = () => {
  if (!localStorage.getItem("pinboard")) {
    localStorage.setItem("pinboard", JSON.stringify({}));
  }
  if (!localStorage.getItem("toggles")) {
    localStorage.setItem("toggles", JSON.stringify({}));
  }
  if (!localStorage.getItem("projects")) {
    localStorage.setItem("projects", JSON.stringify([DEFAULT_PROJECT]));
  }
  if (!localStorage.getItem("activeProjectId")) {
    localStorage.setItem("activeProjectId", DEFAULT_PROJECT.id);
  }
  if (!localStorage.getItem("tasks")) {
    localStorage.setItem("tasks", JSON.stringify([]));
  }
  hydrateFromBackend();
};

export const addToPinboard = (key, content, isUserDefined = false) => {
  try {
    const activeId = getActiveProjectId();
    const storageKey = getPinboardStorageKey(activeId);
    var pinboard = localStorage.getItem(storageKey);
    var pinboardMap = pinboard ? JSON.parse(pinboard) : {};
    var pinboardEntries = Object.entries(pinboardMap);
    if (pinboardMap.hasOwnProperty(key)) {
      toast.warning("This content is already pinned.");
      return;
    }

    const value = isUserDefined ? { content, isUserDefined: true } : content;
    pinboardEntries.unshift([key.toString(), value]);
    pinboardMap = Object.fromEntries(pinboardEntries);
    localStorage.setItem(storageKey, JSON.stringify(pinboardMap));
    syncWithBackend(
      `/api/projects/${encodeURIComponent(activeId)}/pinboard`,
      {
        method: "POST",
        body: JSON.stringify({ key: key.toString(), value }),
      },
    );
    toast.success("Text pinned successfully! You can view it on the Pinboard.");
  } catch (error) {
    console.log(error.message);
    toast.error("Failed to pin the content");
  }
};

const transformPinboardEntry = (value, timestamp) => {
  const isObject = typeof value === "object";
  return {
    timestamp,
    summary: isObject ? value.content : value,
    isUserDefined: isObject ? value.isUserDefined : false,
  };
};

export const saveNote = (newNote) => {
  const activeId = getActiveProjectId();
  const storageKey = getPinboardStorageKey(activeId);
  const timestamp = Date.now().toString();
  const pinboardData = JSON.parse(localStorage.getItem(storageKey)) || {};
  const value = { content: newNote, isUserDefined: true };
  pinboardData[timestamp] = value;
  localStorage.setItem(storageKey, JSON.stringify(pinboardData));
  syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/pinboard`, {
    method: "POST",
    body: JSON.stringify({ key: timestamp, value }),
  });
};

export const getPinboardData = () => {
  const storageKey = getPinboardStorageKey();
  const pinboardData = JSON.parse(localStorage.getItem(storageKey)) || {};
  if (!pinboardData || Array.isArray(pinboardData)) {
    return [];
  }

  const entries = Object.entries(pinboardData).map(([timestamp, value]) =>
    transformPinboardEntry(value, timestamp),
  );

  return entries.sort((a, b) => b.isUserDefined - a.isUserDefined);
};

const getContexts = () => {
  const storageKey = getContextStorageKey();
  return JSON.parse(localStorage.getItem(storageKey)) || [];
};

export const getSortedUserContexts = () => {
  let contexts = getContexts();
  contexts.sort((a, b) => b.timestamp - a.timestamp);
  return contexts;
};

export const saveContext = (title, description) => {
  const activeId = getActiveProjectId();
  const storageKey = getContextStorageKey(activeId);
  const timestamp = Date.now();
  const contextData = getContexts();
  const newContext = {
    title,
    summary: description,
    timestamp,
    isUserDefined: true,
  };
  contextData.push(newContext);
  localStorage.setItem(storageKey, JSON.stringify(contextData));
  syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/contexts`, {
    method: "POST",
    body: JSON.stringify(newContext),
  });
  window.dispatchEvent(new Event("update-context"));
};

export const deleteContextByTimestamp = (timestamp) => {
  const activeId = getActiveProjectId();
  const storageKey = getContextStorageKey(activeId);
  const contextData = getContexts();
  const updatedContextData = contextData.filter(
    (context) => context.timestamp !== timestamp,
  );

  localStorage.setItem(storageKey, JSON.stringify(updatedContextData));
  syncWithBackend(
    `/api/projects/${encodeURIComponent(activeId)}/contexts/${encodeURIComponent(timestamp)}`,
    {
      method: "DELETE",
    },
  );
  window.dispatchEvent(new Event("update-context"));
};

export const deletePinOrNoteByTimestamp = (timestamp) => {
  const activeId = getActiveProjectId();
  const storageKey = getPinboardStorageKey(activeId);
  const pinboardData = JSON.parse(localStorage.getItem(storageKey)) || {};
  delete pinboardData[timestamp];
  localStorage.setItem(storageKey, JSON.stringify(pinboardData));
  syncWithBackend(
    `/api/projects/${encodeURIComponent(activeId)}/pinboard/${encodeURIComponent(timestamp)}`,
    {
      method: "DELETE",
    },
  );
};

export const getSummaryForTheUserContext = (contextTitle) => {
  const userContexts = getSortedUserContexts();
  const context = userContexts.find(
    (context) => context.title === contextTitle,
  );
  return context ? context.summary : "";
};

export const getWorkflowStorageKey = (projectId) => {
  const activeId = projectId || getActiveProjectId();
  return activeId && activeId !== DEFAULT_PROJECT.id
    ? `workflow_${activeId}`
    : "workflow";
};

export const getProjectWorkflow = (projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getWorkflowStorageKey(activeId);
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;

    if (typeof fetch === "function") {
      syncWithBackend(
        `/api/projects/${encodeURIComponent(activeId)}/workflow`,
      ).then((serverWorkflow) => {
        if (
          serverWorkflow &&
          typeof serverWorkflow === "object" &&
          Object.keys(serverWorkflow).length > 0
        ) {
          localStorage.setItem(storageKey, JSON.stringify(serverWorkflow));
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("update-workflow", {
                detail: { workflow: serverWorkflow, projectId: activeId },
              }),
            );
          }
        }
      });
    }

    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (e) {
    return null;
  }
};

export const saveProjectWorkflow = (workflow, projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getWorkflowStorageKey(activeId);
    const now = Date.now();
    const normalized = {
      ...(workflow || {}),
      projectId: activeId,
      updatedAt: now,
    };

    localStorage.setItem(storageKey, JSON.stringify(normalized));
    syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/workflow`, {
      method: "POST",
      body: JSON.stringify({ workflow: normalized }),
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("update-workflow", {
          detail: { workflow: normalized, projectId: activeId },
        }),
      );
    }
    return normalized;
  } catch (e) {
    console.error("Failed to save project workflow", e);
    return workflow;
  }
};

export const deleteProjectWorkflow = (projectId = null) => {
  try {
    const activeId = projectId || getActiveProjectId();
    const storageKey = getWorkflowStorageKey(activeId);
    localStorage.removeItem(storageKey);
    syncWithBackend(`/api/projects/${encodeURIComponent(activeId)}/workflow`, {
      method: "DELETE",
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("update-workflow", {
          detail: { workflow: null, projectId: activeId },
        }),
      );
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const resetProjectWorkflow = (projectId = null) => {
  return deleteProjectWorkflow(projectId);
};

