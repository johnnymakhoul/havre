// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import {
  getSortedUserContexts,
  getSummaryForTheUserContext,
  getProjectCards,
  getProjectFollowUps,
  getProjectChat,
  getActiveProjectId,
} from "../_local_store";

export const formatTitleFromIdentifier = (identifier) => {
  if (!identifier) return "Untitled Section";
  const cleaned = identifier
    .replace(/-[0-9a-f]{6,12}$/i, "") // remove trailing hash like -3a845a85
    .replace(/[-_]+/g, " ")
    .trim();
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Builds the hierarchical tree data structure for Ant Design TreeSelect.
 */
export const buildContextTreeData = ({
  knowledgePackContexts = [],
  prompts = [],
  activeProjectId = null,
} = {}) => {
  const currentProjectId = activeProjectId || getActiveProjectId();
  const tree = [];

  // 1. Knowledge Pack Contexts
  const kpChildren = (knowledgePackContexts || [])
    .map((ctx) => {
      const val = typeof ctx === "string" ? ctx : ctx?.value || ctx?.title;
      const lbl = typeof ctx === "string" ? ctx : ctx?.label || ctx?.title || val;
      if (!val) return null;
      return {
        title: lbl,
        value: val,
        key: val,
        isKnowledgePack: true,
        rawContextValue: val,
      };
    })
    .filter(Boolean);

  if (kpChildren.length > 0) {
    tree.push({
      title: "Knowledge Pack Contexts",
      value: "group::knowledge-pack",
      key: "group::knowledge-pack",
      selectable: false,
      checkable: false,
      disabled: false,
      children: kpChildren,
    });
  }

  // 2. Custom User Contexts
  const userContexts = getSortedUserContexts() || [];
  const userChildren = userContexts
    .map((ctx) => {
      if (!ctx || !ctx.title) return null;
      return {
        title: ctx.title,
        value: `user::${ctx.title}`,
        key: `user::${ctx.title}`,
        isUserDefined: true,
        summary: ctx.summary,
      };
    })
    .filter(Boolean);

  if (userChildren.length > 0) {
    tree.push({
      title: "Custom User Contexts",
      value: "group::user-context",
      key: "group::user-context",
      selectable: false,
      checkable: false,
      disabled: false,
      children: userChildren,
    });
  }

  // 3. Project Sections (Filled)
  const cardsMap = getProjectCards(null, currentProjectId) || {};
  const followUpsMap = getProjectFollowUps(null, currentProjectId) || {};
  const chatsMap = getProjectChat(null, currentProjectId) || {};

  const promptLookup = new Map();
  (prompts || []).forEach((p) => {
    const id = p?.identifier || p?.value;
    if (id) promptLookup.set(id, p);
  });

  // Collect all unique prompt IDs with any saved data (exclude exploration chats)
  const promptIdSet = new Set([
    ...Object.keys(cardsMap),
    ...Object.keys(followUpsMap),
    ...Object.keys(chatsMap).filter((key) => !key.startsWith("explore:")),
  ]);

  const filledSections = [];

  promptIdSet.forEach((promptId) => {
    if (!promptId || promptId === "default" || promptId.startsWith("explore:")) return;

    const cards = Array.isArray(cardsMap[promptId]) ? cardsMap[promptId] : [];
    const followUps =
      followUpsMap[promptId] && typeof followUpsMap[promptId] === "object"
        ? followUpsMap[promptId]
        : {};
    const chat = chatsMap[promptId];
    const messages = Array.isArray(chat?.messages) ? chat.messages : [];

    const hasCards = cards.length > 0;
    const hasFollowUps = Object.keys(followUps).length > 0;
    const hasChat = messages.length > 0;

    if (!hasCards && !hasFollowUps && !hasChat) return;

    const promptConfig = promptLookup.get(promptId);
    const sectionTitle =
      promptConfig?.title || formatTitleFromIdentifier(promptId);

    const sectionChildren = [];

    // Add cards
    if (hasCards) {
      cards.forEach((card, idx) => {
        const cardId = card?.id || `card-${idx}`;
        const cardTitle = card?.title || `Card ${idx + 1}`;
        sectionChildren.push({
          title: cardTitle,
          value: `card::${promptId}::${cardId}`,
          key: `card::${promptId}::${cardId}`,
          sectionId: promptId,
          sectionTitle,
          cardData: card,
        });
      });
    }

    // Add follow-ups
    if (hasFollowUps) {
      const followUpConfigs = Array.isArray(promptConfig?.followUps)
        ? promptConfig.followUps
        : [];
      const followUpLookup = new Map();
      followUpConfigs.forEach((f) => {
        if (f.identifier) followUpLookup.set(f.identifier, f);
      });

      Object.entries(followUps).forEach(([fId, fResult]) => {
        if (!fResult) return;
        const fCfg = followUpLookup.get(fId);
        const fTitle = fCfg?.title || formatTitleFromIdentifier(fId);
        sectionChildren.push({
          title: `Follow-up: ${fTitle}`,
          value: `followup::${promptId}::${fId}`,
          key: `followup::${promptId}::${fId}`,
          sectionId: promptId,
          sectionTitle,
          followUpTitle: fTitle,
          followUpContent:
            typeof fResult === "string"
              ? fResult
              : JSON.stringify(fResult, null, 2),
        });
      });
    }

    // Add chat history
    if (hasChat) {
      sectionChildren.push({
        title: `Entire Chat History (${messages.length} messages)`,
        value: `chat::${promptId}`,
        key: `chat::${promptId}`,
        sectionId: promptId,
        sectionTitle,
        messages,
      });
    }

    if (sectionChildren.length > 0) {
      filledSections.push({
        title: sectionTitle,
        value: `section::${promptId}`,
        key: `section::${promptId}`,
        sectionId: promptId,
        children: sectionChildren,
      });
    }
  });

  // Sort sections alphabetically by title
  filledSections.sort((a, b) => a.title.localeCompare(b.title));

  if (filledSections.length > 0) {
    tree.push({
      title: "Project Prompts",
      value: "group::project-sections",
      key: "group::project-sections",
      selectable: false,
      checkable: false,
      disabled: false,
      children: filledSections,
    });
  }

  return tree;
};

/**
 * Resolves selected keys into the request parameters:
 * - knowledgePackContexts: string[]
 * - userContext: structured Markdown string combining custom contexts and sections/cards/follow-ups/chats
 */
export const resolveContextsForRequestBody = (
  selectedKeys = [],
  { activeProjectId = null, prompts = [] } = {},
) => {
  if (!Array.isArray(selectedKeys) || selectedKeys.length === 0) {
    return { knowledgePackContexts: [], userContext: "" };
  }

  const currentProjectId = activeProjectId || getActiveProjectId();
  const cardsMap = getProjectCards(null, currentProjectId) || {};
  const followUpsMap = getProjectFollowUps(null, currentProjectId) || {};
  const chatsMap = getProjectChat(null, currentProjectId) || {};

  const promptLookup = new Map();
  (prompts || []).forEach((p) => {
    const id = p?.identifier || p?.value;
    if (id) promptLookup.set(id, p);
  });

  const knowledgePackContexts = [];
  const selectedUserTitles = new Set();

  // Group section-level selections
  const selectedSections = new Set();
  const selectedCardsBySection = new Map();
  const selectedFollowUpsBySection = new Map();
  const selectedChatsBySection = new Set();

  selectedKeys.forEach((rawKey) => {
    if (!rawKey) return;
    const key = typeof rawKey === "string" ? rawKey : rawKey?.value || "";

    if (key.startsWith("kp::")) {
      knowledgePackContexts.push(key.slice(4));
    } else if (key.startsWith("user::")) {
      selectedUserTitles.add(key.slice(6));
    } else if (key.startsWith("section::")) {
      selectedSections.add(key.slice(9));
    } else if (key.startsWith("card::")) {
      const parts = key.split("::");
      const promptId = parts[1];
      const cardId = parts[2];
      if (promptId && cardId) {
        if (!selectedCardsBySection.has(promptId)) {
          selectedCardsBySection.set(promptId, new Set());
        }
        selectedCardsBySection.get(promptId).add(cardId);
      }
    } else if (key.startsWith("followup::")) {
      const parts = key.split("::");
      const promptId = parts[1];
      const followUpId = parts[2];
      if (promptId && followUpId) {
        if (!selectedFollowUpsBySection.has(promptId)) {
          selectedFollowUpsBySection.set(promptId, new Set());
        }
        selectedFollowUpsBySection.get(promptId).add(followUpId);
      }
    } else if (key.startsWith("chat::")) {
      const chatId = key.slice(6);
      if (!chatId.startsWith("explore:")) {
        selectedChatsBySection.add(chatId);
      }
    } else {
      // Check if it's a known user context title
      const summary = getSummaryForTheUserContext(key);
      if (summary) {
        selectedUserTitles.add(key);
      } else {
        knowledgePackContexts.push(key);
      }
    }
  });

  const userContextBlocks = [];

  // Preserve sorted user contexts order (sorted by timestamp descending)
  const sortedUserContexts = getSortedUserContexts() || [];
  if (sortedUserContexts.length > 0) {
    sortedUserContexts.forEach((ctx) => {
      if (ctx && selectedUserTitles.has(ctx.title)) {
        const summary = getSummaryForTheUserContext(ctx.title) || ctx.summary;
        if (summary) {
          userContextBlocks.push(summary);
          selectedUserTitles.delete(ctx.title);
        }
      }
    });
  }
  // Any remaining user titles not found in sortedUserContexts
  selectedUserTitles.forEach((title) => {
    const summary = getSummaryForTheUserContext(title);
    if (summary) {
      userContextBlocks.push(summary);
    }
  });

  // Resolve all unique section IDs touched
  const allSectionIds = new Set([
    ...selectedSections,
    ...selectedCardsBySection.keys(),
    ...selectedFollowUpsBySection.keys(),
    ...selectedChatsBySection,
  ]);

  allSectionIds.forEach((promptId) => {
    const isWholeSection = selectedSections.has(promptId);
    const promptConfig = promptLookup.get(promptId);
    const sectionTitle =
      promptConfig?.title || formatTitleFromIdentifier(promptId);

    const sectionBlocks = [`### Section: ${sectionTitle}`];

    // Cards
    const cards = Array.isArray(cardsMap[promptId]) ? cardsMap[promptId] : [];
    const selectedCardIds = selectedCardsBySection.get(promptId) || new Set();

    cards.forEach((card, idx) => {
      const cardId = card?.id || `card-${idx}`;
      if (isWholeSection || selectedCardIds.has(cardId)) {
        const cardTitle = card?.title || `Card ${idx + 1}`;
        const cardSummary = card?.summary || card?.content || "";
        sectionBlocks.push(`#### ${cardTitle}\n${cardSummary}`);
      }
    });

    // Follow-ups
    const followUps =
      followUpsMap[promptId] && typeof followUpsMap[promptId] === "object"
        ? followUpsMap[promptId]
        : {};
    const selectedFollowUpIds =
      selectedFollowUpsBySection.get(promptId) || new Set();
    const followUpConfigs = Array.isArray(promptConfig?.followUps)
      ? promptConfig.followUps
      : [];
    const followUpLookup = new Map();
    followUpConfigs.forEach((f) => {
      if (f.identifier) followUpLookup.set(f.identifier, f);
    });

    Object.entries(followUps).forEach(([fId, fResult]) => {
      if (!fResult) return;
      if (isWholeSection || selectedFollowUpIds.has(fId)) {
        const fCfg = followUpLookup.get(fId);
        const fTitle = fCfg?.title || formatTitleFromIdentifier(fId);
        const content =
          typeof fResult === "string"
            ? fResult
            : JSON.stringify(fResult, null, 2);
        sectionBlocks.push(`##### Follow-up: ${fTitle}\n${content}`);
      }
    });

    // Chat History
    const chat = chatsMap[promptId];
    const messages = Array.isArray(chat?.messages) ? chat.messages : [];
    if (
      messages.length > 0 &&
      (isWholeSection || selectedChatsBySection.has(promptId))
    ) {
      const formattedMessages = messages
        .filter((m) => m && m.content && m.content !== "...")
        .map((m) => {
          const sender = m.role === "assistant" ? "Assistant" : "User";
          return `- **${sender}**: ${m.content}`;
        })
        .join("\n\n");
      if (formattedMessages) {
        sectionBlocks.push(`#### Chat Conversation\n${formattedMessages}`);
      }
    }

    if (sectionBlocks.length > 1) {
      userContextBlocks.push(sectionBlocks.join("\n\n"));
    }
  });

  return {
    knowledgePackContexts,
    userContext: userContextBlocks.join("\n\n"),
  };
};
