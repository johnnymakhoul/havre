// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { useState, useRef, useEffect } from "react";
import { ProChatProvider } from "@ant-design/pro-chat";
import { Button, Popconfirm } from "antd";
import { RiDeleteBinLine } from "react-icons/ri";
import { toast } from "react-toastify";
import ChatWidget from "../app/_chat";
import VerticalPossibilityPanel from "./_vertical-possibility-panel";
import LLMTokenUsage from "../app/_llm_token_usage";
import {
  getActiveProjectId,
  getExplorationChatKey,
  getProjectChat,
  saveProjectChat,
  deleteProjectChat,
} from "../app/_local_store";
import { formattedUsage } from "../app/utils/tokenUtils";
import { aggregateTokenUsage } from "../app/utils/_aggregate_token_usage";
import { filterSSEEvents } from "../app/utils/_sse_event_filter";

const buildExplorationKeyFromContext = (ctx) => {
  const promptKey =
    ctx?.previousPromptId || ctx?.previousFraming || ctx?.type || "scenarios";
  const cardKey = ctx?.id || ctx?.title || "default";
  return getExplorationChatKey(promptKey, cardKey);
};

export default function ChatExploration({
  context,
  scenarioQueries = [],
  featureToggleConfig = {},
  setTokenUsage: parentSetTokenUsage,
  tokenUsage: parentTokenUsage,
}) {
  const explorationKey = buildExplorationKeyFromContext(context);
  const [activeProjectId, setActiveProjectId] = useState(() =>
    getActiveProjectId(),
  );
  const [resetKey, setResetKey] = useState(0);
  const [initialChats, setInitialChats] = useState(() => {
    const saved = getProjectChat(explorationKey);
    return Array.isArray(saved?.messages) ? saved.messages : [];
  });
  const [promptStarted, setPromptStarted] = useState(() => {
    const saved = getProjectChat(explorationKey);
    return Array.isArray(saved?.messages) && saved.messages.length > 0;
  });
  const [chatSessionId, setChatSessionId] = useState(() => {
    const saved = getProjectChat(explorationKey);
    return saved?.chatSessionId;
  });
  const [previousContext, setPreviousContext] = useState(context);
  // Use parent token usage state if provided, else local
  const [tokenUsage, setTokenUsage] =
    parentTokenUsage !== undefined && parentSetTokenUsage !== undefined
      ? [parentTokenUsage, parentSetTokenUsage]
      : useState(() => {
          const saved = getProjectChat(explorationKey);
          return saved?.tokenUsage || { input_tokens: 0, output_tokens: 0 };
        });

  const chatRef = useRef();
  const latestSessionIdRef = useRef(chatSessionId);
  const latestTokenUsageRef = useRef(tokenUsage);
  const latestMessagesRef = useRef(initialChats);
  const hadPersistedMessagesRef = useRef(initialChats.length > 0);

  useEffect(() => {
    latestSessionIdRef.current = chatSessionId;
  }, [chatSessionId]);

  useEffect(() => {
    latestTokenUsageRef.current = tokenUsage;
  }, [tokenUsage]);

  const loadExplorationState = (targetContext) => {
    const currentProjectId = getActiveProjectId();
    const key = buildExplorationKeyFromContext(targetContext);
    const saved = getProjectChat(key, currentProjectId);
    const savedMessages = Array.isArray(saved?.messages) ? saved.messages : [];
    const hasSaved = savedMessages.length > 0;
    const restoredUsage = saved?.tokenUsage || {
      input_tokens: 0,
      output_tokens: 0,
    };

    setActiveProjectId(currentProjectId);
    setInitialChats(savedMessages);
    setPromptStarted(hasSaved);
    setChatSessionId(hasSaved ? saved?.chatSessionId : undefined);
    if (parentSetTokenUsage === undefined) {
      setTokenUsage(restoredUsage);
    }

    latestMessagesRef.current = savedMessages;
    latestSessionIdRef.current = hasSaved ? saved?.chatSessionId : undefined;
    latestTokenUsageRef.current = restoredUsage;
    hadPersistedMessagesRef.current = hasSaved;
    setResetKey((prev) => prev + 1);
  };

  useEffect(() => {
    if (previousContext !== context) {
      setPreviousContext(context);
      loadExplorationState(context);
    }
  }, [context, previousContext]);

  useEffect(() => {
    const handleProjectChange = () => {
      loadExplorationState(previousContext);
    };
    window.addEventListener("update-project", handleProjectChange);
    return () => {
      window.removeEventListener("update-project", handleProjectChange);
    };
  }, [previousContext]);

  const handleChatsChange = (nextChats) => {
    if (!Array.isArray(nextChats)) return;
    latestMessagesRef.current = nextChats;
    const key = buildExplorationKeyFromContext(previousContext);

    if (nextChats.length === 0) {
      if (hadPersistedMessagesRef.current) {
        hadPersistedMessagesRef.current = false;
        deleteProjectChat(key);
        latestSessionIdRef.current = undefined;
        setChatSessionId(undefined);
        setPromptStarted(false);
      }
      return;
    }

    const hasAssistantResponse = nextChats.some(
      (m) => m.role === "assistant" && m.content && m.content !== "...",
    );
    const isUpdateToPersisted =
      hadPersistedMessagesRef.current &&
      nextChats.every((m) => m.content !== "...");

    if (hasAssistantResponse || isUpdateToPersisted) {
      hadPersistedMessagesRef.current = true;
      saveProjectChat(key, {
        chatSessionId: latestSessionIdRef.current,
        messages: nextChats,
        tokenUsage: latestTokenUsageRef.current,
      });
    }
  };

  const onClearExplorationChat = () => {
    const key = buildExplorationKeyFromContext(previousContext);
    deleteProjectChat(key);
    latestSessionIdRef.current = undefined;
    latestMessagesRef.current = [];
    hadPersistedMessagesRef.current = false;
    setInitialChats([]);
    setChatSessionId(undefined);
    setPromptStarted(false);
    setResetKey((prev) => prev + 1);
    toast.info("Cleared exploration conversation for this card.");
  };

  const submitPromptToBackend = async (messages) => {
    const exploreUri = "/api/prompt/explore";

    // Do not reset token usage here; we want to aggregate per page

    const processSSEResponse = (response) => {
      const sseStream = new ReadableStream({
        start(controller) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          function pump() {
            return reader.read().then(({ done, value }) => {
              if (done) {
                controller.close();
                return;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // Use the reusable filterSSEEvents utility
              const { text, events } = filterSSEEvents(buffer);

              // Send clean text to ProChat
              if (text) {
                controller.enqueue(new TextEncoder().encode(text));
              }

              // Handle token usage events
              events.forEach((event) => {
                if (event.type === "token_usage") {
                  const usage = formattedUsage(event.data);
                  setTokenUsage((prev) => aggregateTokenUsage(prev, usage));
                }
              });

              buffer = "";

              return pump();
            });
          }

          return pump();
        },
      });

      // Create new response with filtered stream
      return new Response(sseStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };

    if (promptStarted !== true) {
      const lastMessage = messages[messages.length - 1];
      const response = await fetch(exploreUri, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userinput: lastMessage?.content,
          item: previousContext?.itemSummary,
          contexts: previousContext?.context || [],
          userContext: previousContext?.userContext || "",
          first_step_input: previousContext?.firstStepInput || "",
          previous_promptid: previousContext?.previousPromptId || "",
          previous_framing: previousContext?.previousFraming || "",
        }),
      });
      const chatId =
        response.headers.get("X-Chat-ID") || response.headers.get("X-Chat-Id");
      setPromptStarted(true);
      setChatSessionId(chatId);
      latestSessionIdRef.current = chatId;
      return processSSEResponse(response);
    } else {
      console.log("Continuing conversation...");
      const lastMessage = messages[messages.length - 1];
      const response = await fetch(exploreUri, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userinput: lastMessage?.content,
          chatSessionId: chatSessionId || latestSessionIdRef.current,
        }),
      });
      return processSSEResponse(response);
    }
  };

  const addMessageToChatWidget = async (prompt) => {
    if (chatRef.current) {
      const key = buildExplorationKeyFromContext(previousContext);
      deleteProjectChat(key);
      latestSessionIdRef.current = undefined;
      latestMessagesRef.current = [];
      hadPersistedMessagesRef.current = false;
      setPromptStarted(false);
      setChatSessionId(undefined);
      chatRef.current.startNewConversation(prompt);
    }
  };

  return (
    <div className="chat-exploration">
      <div
        className="chat-exploration__header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "8px",
        }}
      >
        <p style={{ margin: 0 }}>
          {previousContext?.summary || "No summary available"}
        </p>
        {promptStarted && (
          <Popconfirm
            title="Clear exploration chat"
            description="Are you sure you want to clear this exploration conversation?"
            onConfirm={onClearExplorationChat}
            okText="Yes, clear"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              danger
              className="clear-all"
              data-testid="clear-exploration-chat-button"
            >
              <RiDeleteBinLine fontSize="large" /> CLEAR CHAT
            </Button>
          </Popconfirm>
        )}
      </div>
      {scenarioQueries.length > 0 ? (
        <VerticalPossibilityPanel
          scenarioQueries={scenarioQueries}
          onClick={addMessageToChatWidget}
        />
      ) : null}
      <ProChatProvider
        key={`${activeProjectId}-${explorationKey}-${resetKey}`}
        initialChats={initialChats}
      >
        <ChatWidget
          onSubmitMessage={submitPromptToBackend}
          ref={chatRef}
          visible={true}
          conversationStarted={promptStarted}
          onChatsChange={handleChatsChange}
          helloMessage={
            scenarioQueries.length > 0
              ? "Chat with me! Click on one of the suggested questions, or type your own below."
              : "Chat with me! Type your question below."
          }
        />
        <LLMTokenUsage
          tokenUsage={tokenUsage}
          featureToggleConfig={featureToggleConfig}
        />
      </ProChatProvider>
    </div>
  );
}
