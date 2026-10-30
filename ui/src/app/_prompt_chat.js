// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
"use client";
import { ProChatProvider } from "@ant-design/pro-chat";
import { useEffect, useState, useRef } from "react";
import { Button, Input, Popconfirm, Select } from "antd";
import { toast } from "react-toastify";
import { DownOutlined } from "@ant-design/icons";
import { RiDeleteBinLine } from "react-icons/ri";

const { TextArea } = Input;
import ChatWidget from "./_chat";
import DescribeImage from "./_image_description";
import HelpTooltip from "./_help_tooltip";
import ContextChoice from "./_context_choice";
import ChatHeader from "../pages/_chat_header";
import PromptPreview from "./_prompt_preview";
import {
  getActiveProjectId,
  getProjectChat,
  saveProjectChat,
  deleteProjectChat,
  getSortedUserContexts,
  getSummaryForTheUserContext,
} from "./_local_store";
import DownloadPrompt from "./_download_prompt";
import LLMTokenUsage from "./_llm_token_usage";
import { formattedUsage } from "../app/utils/tokenUtils";
import { aggregateTokenUsage } from "./utils/_aggregate_token_usage";
import { filterSSEEvents } from "./utils/_sse_event_filter";

const PromptChat = ({
  promptId,
  prompts,
  contexts,
  documents,
  models,
  showImageDescription = true,
  showTextSnippets = true,
  showDocuments = true,
  pageTitle,
  pageIntro,
  initialInput = "",
  featureToggleConfig = {},
}) => {
  const chatRef = useRef();

  // User inputs
  const [selectedPrompt, setPromptSelection] = useState(promptId); // via query parameter
  const [selectedContexts, setSelectedContexts] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [imageDescription, setImageDescription] = useState("");
  const [userInput, setUserInput] = useState(initialInput);

  // Chat state
  const resolvedPromptKey =
    promptId || selectedPrompt?.identifier || "default";
  const [activeProjectId, setActiveProjectId] = useState(() =>
    getActiveProjectId(),
  );
  const [resetKey, setResetKey] = useState(0);
  const [initialChats, setInitialChats] = useState(() => {
    const saved = getProjectChat(promptId || "default");
    return Array.isArray(saved?.messages) ? saved.messages : [];
  });
  const [conversationStarted, setConversationStarted] = useState(() => {
    const saved = getProjectChat(promptId || "default");
    return Array.isArray(saved?.messages) && saved.messages.length > 0;
  });
  const [chatSessionId, setChatSessionId] = useState(() => {
    const saved = getProjectChat(promptId || "default");
    return saved?.chatSessionId;
  });
  const [usePromptId, setUsePromptId] = useState(true);
  const [placeholder, setPlaceholder] = useState("");
  const [allContexts, setAllContexts] = useState([]);
  // Aggregate token usage per page
  const [tokenUsage, setTokenUsage] = useState(() => {
    const saved = getProjectChat(promptId || "default");
    return saved?.tokenUsage || { input_tokens: 0, output_tokens: 0 };
  });

  const latestSessionIdRef = useRef(chatSessionId);
  const latestTokenUsageRef = useRef(tokenUsage);
  const latestMessagesRef = useRef(initialChats);
  const hadPersistedMessagesRef = useRef(initialChats.length > 0);
  const previousPromptIdRef = useRef(promptId);

  useEffect(() => {
    latestSessionIdRef.current = chatSessionId;
  }, [chatSessionId]);

  useEffect(() => {
    latestTokenUsageRef.current = tokenUsage;
  }, [tokenUsage]);

  const MAX_COUNT = 3;
  function combineAllContexts(contexts) {
    const userContexts = getSortedUserContexts();
    const userContextsForDropdown = userContexts.map((context) => ({
      value: context.title,
      label: context.title,
      isUserDefined: true,
    }));
    if (contexts !== undefined && contexts.length > 0) {
      setAllContexts(contexts.concat(userContextsForDropdown));
    } else {
      setAllContexts(userContextsForDropdown);
    }
  }

  useEffect(() => {
    if (initialInput && chatRef.current) {
      chatRef.current.setPromptValue(initialInput);
    }
    combineAllContexts(contexts);

    const handleStorageChange = () => {
      combineAllContexts(contexts);
    };

    const loadChatForCurrentProjectAndPrompt = () => {
      const currentProjectId = getActiveProjectId();
      const targetPromptKey = promptId || "default";
      const saved = getProjectChat(targetPromptKey, currentProjectId);
      const savedMessages = Array.isArray(saved?.messages)
        ? saved.messages
        : [];
      const hasSaved = savedMessages.length > 0;
      const restoredUsage = saved?.tokenUsage || {
        input_tokens: 0,
        output_tokens: 0,
      };

      setActiveProjectId(currentProjectId);
      setInitialChats(savedMessages);
      setConversationStarted(hasSaved);
      setChatSessionId(hasSaved ? saved?.chatSessionId : undefined);
      setTokenUsage(restoredUsage);

      latestMessagesRef.current = savedMessages;
      latestSessionIdRef.current = hasSaved ? saved?.chatSessionId : undefined;
      latestTokenUsageRef.current = restoredUsage;
      hadPersistedMessagesRef.current = hasSaved;
      setResetKey((prev) => prev + 1);
    };

    const handleProjectChange = () => {
      combineAllContexts(contexts);
      loadChatForCurrentProjectAndPrompt();
    };

    if (previousPromptIdRef.current !== promptId) {
      previousPromptIdRef.current = promptId;
      loadChatForCurrentProjectAndPrompt();
    }

    window.addEventListener("update-context", handleStorageChange);
    window.addEventListener("update-project", handleProjectChange);

    return () => {
      window.removeEventListener("update-context", handleStorageChange);
      window.removeEventListener("update-project", handleProjectChange);
    };
  }, [initialInput, contexts, promptId]);

  const appendImageDescription = (userInput) => {
    if (imageDescription && imageDescription !== "") {
      userInput += "\n\n" + imageDescription;
    }
    return userInput;
  };

  const attachContextsToRequestBody = (requestBody) => {
    const userContextsSummary = selectedContexts
      .filter((context) => context.isUserDefined)
      .map((context) => getSummaryForTheUserContext(context.value))
      .join("\n\n");

    const knowledgePackContexts = selectedContexts
      .map((context) => (!context.isUserDefined ? context.value : null))
      .filter((value) => value !== null);

    if (userContextsSummary !== "") {
      requestBody.userContext = userContextsSummary;
    }
    if (knowledgePackContexts.length > 0) {
      requestBody.contexts = knowledgePackContexts;
    }
    return requestBody;
  };

  const buildFirstChatRequestBody = (userInput) => {
    const requestBody = {
      userinput: usePromptId ? appendImageDescription(userInput) : userInput,
      promptid: usePromptId ? selectedPrompt?.identifier : undefined,
      chatSessionId: chatSessionId,
      document: selectedDocuments,
    };
    attachContextsToRequestBody(requestBody);
    return requestBody;
  };

  const startNewChat = async (userInput) => {
    if (chatRef.current) {
      deleteProjectChat(resolvedPromptKey);
      latestSessionIdRef.current = undefined;
      latestMessagesRef.current = [];
      hadPersistedMessagesRef.current = false;
      setChatSessionId(undefined);
      setConversationStarted(false);
      chatRef.current.startNewConversation(userInput);
    }
  };

  const onClearChat = () => {
    deleteProjectChat(resolvedPromptKey);
    latestSessionIdRef.current = undefined;
    latestMessagesRef.current = [];
    latestTokenUsageRef.current = { input_tokens: 0, output_tokens: 0 };
    hadPersistedMessagesRef.current = false;
    setInitialChats([]);
    setChatSessionId(undefined);
    setConversationStarted(false);
    setTokenUsage({ input_tokens: 0, output_tokens: 0 });
    setResetKey((prev) => prev + 1);
    toast.info("Cleared conversation for this prompt.");
  };

  const handleChatsChange = (nextChats) => {
    if (!Array.isArray(nextChats)) return;
    latestMessagesRef.current = nextChats;

    if (nextChats.length === 0) {
      if (hadPersistedMessagesRef.current) {
        hadPersistedMessagesRef.current = false;
        deleteProjectChat(resolvedPromptKey);
        latestSessionIdRef.current = undefined;
        setChatSessionId(undefined);
        setConversationStarted(false);
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
      saveProjectChat(resolvedPromptKey, {
        chatSessionId: latestSessionIdRef.current,
        messages: nextChats,
        tokenUsage: latestTokenUsageRef.current,
      });
    }
  };

  const renderPromptRequest = () => {
    if (chatRef.current) {
      return buildFirstChatRequestBody(chatRef.current.prompt);
    }
  };

  const submitPromptToBackend = async (messages) => {
    const lastMessage = messages[messages.length - 1];

    let requestBody;
    if (!conversationStarted) {
      requestBody = buildFirstChatRequestBody(lastMessage?.content);
    } else {
      requestBody = {
        userinput: lastMessage?.content,
        chatSessionId: chatSessionId,
        ...(selectedDocuments !== "base" && { document: selectedDocuments }),
      };
    }

    try {
      const response = await fetch("/api/prompt", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        const detailedErrorMessage =
          errorBody.detail || "An unknown error occurred.";
        throw new Error(`ERROR: ${detailedErrorMessage}`);
      }

      const chatId =
        response.headers.get("X-Chat-ID") || response.headers.get("X-Chat-Id");
      setPlaceholder("");

      if (!conversationStarted) {
        setConversationStarted(true);
        setChatSessionId(chatId);
        latestSessionIdRef.current = chatId;
      } else if (chatId && !latestSessionIdRef.current) {
        setChatSessionId(chatId);
        latestSessionIdRef.current = chatId;
      }

      // Create a stream that filters out token usage events and extracts clean content for ProChat
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
                  setTokenUsage((prev) => {
                    const updated = aggregateTokenUsage(prev, usage);
                    latestTokenUsageRef.current = updated;
                    if (
                      hadPersistedMessagesRef.current &&
                      latestMessagesRef.current.length > 0
                    ) {
                      saveProjectChat(resolvedPromptKey, {
                        chatSessionId: latestSessionIdRef.current,
                        messages: latestMessagesRef.current,
                        tokenUsage: updated,
                      });
                    }
                    return updated;
                  });
                }
              });
              buffer = "";

              return pump();
            });
          }

          return pump();
        },
      });

      // Return new response with filtered stream
      return new Response(sseStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      toast.error(error.message);
    }
  };

  function handlePromptSelection(value) {
    const selectedPrompt = prompts.find(
      (prompt) => prompt.identifier === value,
    );
    setPromptSelection(selectedPrompt);
    setPlaceholder(
      selectedPrompt && selectedPrompt.help_user_input
        ? selectedPrompt.help_user_input
        : pageIntro,
    );
  }

  const handleContextSelection = (values) => {
    const userSelectedContexts = allContexts.filter((context) =>
      values.includes(context.value),
    );
    setSelectedContexts(userSelectedContexts);
  };

  useEffect(() => {
    handlePromptSelection(promptId);
  }, [promptId, prompts]);

  const imageDescriptionUserInput = showImageDescription ? (
    <div className="user-input">
      <label>
        Upload image
        <HelpTooltip
          text={
            <>
              <div>
                Get AI to describe an image (e.g. a diagram) to help with your
                input. You can edit this description before you start the chat.
              </div>
              Only JPEG/JPG/PNG types are allowed.
            </>
          }
          testid="upload-image-tooltip"
        />
      </label>
      <DescribeImage
        onImageDescriptionChange={setImageDescription}
        imageDescription={imageDescription}
      />
    </div>
  ) : (
    <></>
  );

  const dropdownSuffix = (
    <>
      <span>
        {selectedDocuments.length} / {MAX_COUNT}
      </span>
      <DownOutlined />
    </>
  );

  const documentsMenu =
    showDocuments && documents ? (
      <div className="user-input">
        <label>
          Select document
          <HelpTooltip
            text="Select a document from your knowledge pack that might have useful information for your context. Haiven will try to find useful information in this document during the first chat interaction."
            testid="document-selection-tooltip"
          />
        </label>
        <Select
          onChange={setSelectedDocuments}
          options={documents}
          mode="multiple"
          maxCount={MAX_COUNT}
          placeholder="Please select the document(s)"
          suffixIcon={dropdownSuffix}
          data-testid="document-select"
        ></Select>
      </div>
    ) : (
      <></>
    );

  const contextsMenu = showTextSnippets ? (
    <ContextChoice
      onChange={handleContextSelection}
      selectedContexts={selectedContexts}
      contexts={allContexts}
    />
  ) : (
    <></>
  );

  const title = (
    <div className="title">
      <h3>
        {selectedPrompt?.title || pageTitle}
        <HelpTooltip
          text={
            selectedPrompt?.help_prompt_description ||
            "Ask general questions & document based queries"
          }
          testid="page-title-tooltip"
        />
      </h3>
      {selectedPrompt && <DownloadPrompt prompt={selectedPrompt} />}
      {conversationStarted && (
        <Popconfirm
          title="Clear conversation"
          description="Are you sure you want to clear this conversation?"
          onConfirm={onClearChat}
          okText="Yes, clear"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button
            type="link"
            danger
            className="clear-all"
            data-testid="clear-chat-button"
          >
            <RiDeleteBinLine fontSize="large" /> CLEAR CHAT
          </Button>
        </Popconfirm>
      )}
      <LLMTokenUsage
        tokenUsage={tokenUsage}
        featureToggleConfig={featureToggleConfig}
      />
    </div>
  );

  const promptPreview = showTextSnippets ? (
    <PromptPreview
      selectedContexts={selectedContexts}
      renderPromptRequest={renderPromptRequest}
      startNewChat={startNewChat}
      setUsePromptId={setUsePromptId}
      sampleInput={selectedPrompt?.help_sample_input}
    />
  ) : null;

  const advancedPromptingMenu = (
    <div className="prompting-dropdown-menu">
      {contextsMenu}
      {documentsMenu}
      {imageDescriptionUserInput}
    </div>
  );

  return (
    <>
      <div className="prompt-chat-container">
        <div className="chat-container-wrapper">
          <ChatHeader models={models} titleComponent={title} />
          <div className="chat-container">
            <div className="chat-widget-container">
              <ProChatProvider
                key={`${activeProjectId}-${resolvedPromptKey}-${resetKey}`}
                initialChats={initialChats}
              >
                <ChatWidget
                  onSubmitMessage={submitPromptToBackend}
                  ref={chatRef}
                  placeholder={placeholder}
                  promptPreviewComponent={promptPreview}
                  advancedPromptingMenu={advancedPromptingMenu}
                  conversationStarted={conversationStarted}
                  onChatsChange={handleChatsChange}
                />
              </ProChatProvider>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PromptChat;
