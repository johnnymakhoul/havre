// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import React, { useState, useEffect, useRef } from "react";
import Head from "next/head";
import {
  Card,
  Steps,
  Button,
  Input,
  Checkbox,
  Tag,
  Tooltip,
  Popconfirm,
  Badge,
  Switch,
  Alert,
} from "antd";
import {
  RiPlayLine,
  RiRefreshLine,
  RiSettings3Line,
  RiSparkling2Line,
  RiCheckDoubleLine,
  RiKanbanView2,
  RiRocketLine,
} from "react-icons/ri";
import { parse } from "best-effort-json-parser";
import { toast } from "react-toastify";
import { fetchSSE } from "../app/_fetch_sse";
import {
  getActiveProject,
  getProjectWorkflow,
  saveProjectWorkflow,
  resetProjectWorkflow,
  saveProjectCards,
} from "../app/_local_store";
import {
  initWorkflowState,
  buildCumulativeContext,
} from "../app/utils/_workflow_engine";
import { extractTopLevelJsonArray } from "../app/utils/jsonArrayStream";
import { filterSSEEvents } from "../app/utils/_sse_event_filter";
import WorkflowStageReview from "../app/_workflow_stage_review";
import WorkflowDossierHandoff from "../app/_workflow_dossier_handoff";
import useLoader from "../hooks/useLoader";

const { TextArea } = Input;

const WorkflowPage = ({ prompts, contexts, featureToggleConfig }) => {
  const [activeProject, setActiveProject] = useState(() => getActiveProject());
  const [workflow, setWorkflow] = useState(null);
  const [initialPromptInput, setInitialPromptInput] = useState(
    "Develop a cloud-native order checkout and payment settlement platform with real-time inventory management and PCI-DSS compliance.",
  );
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const { loading: isGenerating, startLoad, abortLoad } = useLoader();

  // Auto-Pilot & Auto-Advance state
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(null);

  const countdownIntervalRef = useRef(null);
  const isAutoPilotRef = useRef(false);
  const workflowRef = useRef(null);
  const isGeneratingRef = useRef(false);

  // Load / initialize workflow state for active project
  const syncWorkflow = (project = null) => {
    const proj = project || getActiveProject();
    setActiveProject(proj);
    const existing = getProjectWorkflow(proj?.id);
    if (existing && existing.stages && existing.stages.length > 0) {
      setWorkflow(existing);
      workflowRef.current = existing;
      if (typeof existing.autoPilot === "boolean") {
        setIsAutoPilot(existing.autoPilot);
        isAutoPilotRef.current = existing.autoPilot;
      }
      if (existing.initialInput) {
        setInitialPromptInput(existing.initialInput);
      }
    } else {
      const fresh = initWorkflowState(proj, initialPromptInput);
      setWorkflow(fresh);
      workflowRef.current = fresh;
    }
  };

  useEffect(() => {
    syncWorkflow();

    const handleProjectChange = () => syncWorkflow(getActiveProject());
    const handleWorkflowUpdate = (e) => {
      if (e?.detail?.workflow) {
        setWorkflow(e.detail.workflow);
        workflowRef.current = e.detail.workflow;
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("update-project", handleProjectChange);
      window.addEventListener("update-workflow", handleWorkflowUpdate);
      return () => {
        window.removeEventListener("update-project", handleProjectChange);
        window.removeEventListener("update-workflow", handleWorkflowUpdate);
      };
    }
  }, []);

  useEffect(() => {
    workflowRef.current = workflow;
  }, [workflow]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  if (!workflow) {
    return <div style={{ padding: 24 }}>Loading project workflow...</div>;
  }

  const stages = workflow.stages || [];
  const currentStageIndex = workflow.activeStepIndex || 0;
  const currentStage = stages[currentStageIndex] || stages[0];
  const isWorkflowCompleted = workflow.status === "completed";

  // Pre-flight toggle stages
  const handleToggleStage = (idx) => {
    const updatedStages = [...stages];
    updatedStages[idx] = {
      ...updatedStages[idx],
      enabled: !updatedStages[idx].enabled,
    };
    const updated = { ...workflow, stages: updatedStages };
    setWorkflow(updated);
    workflowRef.current = updated;
    saveProjectWorkflow(updated, activeProject?.id);
  };

  const stopAutoPilot = (reasonMessage = null) => {
    setIsAutoPilot(false);
    isAutoPilotRef.current = false;
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoAdvanceCountdown(null);
    const currentWf = workflowRef.current;
    if (currentWf) {
      const updated = { ...currentWf, autoPilot: false };
      setWorkflow(updated);
      workflowRef.current = updated;
      saveProjectWorkflow(updated, activeProject?.id);
    }
    if (reasonMessage) {
      toast.info(reasonMessage);
    }
  };

  const startAutoAdvanceCountdown = (fromStageIndex) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setAutoAdvanceCountdown(5);

    let remaining = 5;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setAutoAdvanceCountdown(remaining);
      } else {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        setAutoAdvanceCountdown(null);
        if (isAutoPilotRef.current) {
          handleApproveAndNext(fromStageIndex, true);
        }
      }
    }, 1000);
  };

  const handleToggleAutoPilot = (checked) => {
    setIsAutoPilot(checked);
    isAutoPilotRef.current = checked;
    if (workflowRef.current) {
      const updated = { ...workflowRef.current, autoPilot: checked };
      setWorkflow(updated);
      workflowRef.current = updated;
      saveProjectWorkflow(updated, activeProject?.id);
    }
    if (checked) {
      toast.success("Auto-Pilot enabled. Phases will advance automatically.");
      const currentWf = workflowRef.current;
      const currentIdx = currentWf?.activeStepIndex || 0;
      const currentStageObj = currentWf?.stages?.[currentIdx];
      if (
        currentStageObj &&
        (!Array.isArray(currentStageObj.cards) || currentStageObj.cards.length === 0) &&
        !isGeneratingRef.current
      ) {
        handleGenerateDeliverables(null, currentIdx);
      } else if (
        currentStageObj &&
        Array.isArray(currentStageObj.cards) &&
        currentStageObj.cards.length > 0 &&
        currentStageObj.status !== "completed"
      ) {
        startAutoAdvanceCountdown(currentIdx);
      }
    } else {
      stopAutoPilot("Auto-Pilot paused.");
    }
  };

  // Start workflow
  const handleStartWorkflow = (autoPilotLaunch = false) => {
    if (!initialPromptInput.trim()) {
      toast.error("Please provide an initial project brief or objectives");
      return;
    }
    const shouldAutoPilot = autoPilotLaunch || isAutoPilot;
    setIsAutoPilot(shouldAutoPilot);
    isAutoPilotRef.current = shouldAutoPilot;

    const updated = {
      ...workflow,
      status: "in-progress",
      initialInput: initialPromptInput,
      activeStepIndex: 0,
      autoPilot: shouldAutoPilot,
    };
    const firstEnabledIndex = updated.stages.findIndex((s) => s.enabled !== false);
    if (firstEnabledIndex !== -1) {
      updated.activeStepIndex = firstEnabledIndex;
      updated.stages[firstEnabledIndex].status = "in-review";
    }
    setWorkflow(updated);
    workflowRef.current = updated;
    saveProjectWorkflow(updated, activeProject?.id);
    setIsConfiguring(false);
    toast.success(
      shouldAutoPilot
        ? "Project Automation Workflow started in Auto-Pilot mode!"
        : "Project Automation Workflow started!"
    );

    if (shouldAutoPilot && firstEnabledIndex !== -1) {
      setTimeout(() => {
        handleGenerateDeliverables(null, firstEnabledIndex);
      }, 350);
    }
  };

  // Update cards in stage
  const handleUpdateCurrentStageCards = (cards, stageIdxOverride = null) => {
    const currentWf = workflowRef.current || workflow;
    const targetIdx =
      typeof stageIdxOverride === "number"
        ? stageIdxOverride
        : currentWf.activeStepIndex || 0;
    const updatedStages = [...(currentWf.stages || [])];
    if (!updatedStages[targetIdx]) return;

    updatedStages[targetIdx] = {
      ...updatedStages[targetIdx],
      cards,
    };
    const updated = { ...currentWf, stages: updatedStages };
    setWorkflow(updated);
    workflowRef.current = updated;
    saveProjectWorkflow(updated, activeProject?.id);
    if (updatedStages[targetIdx]?.promptId) {
      saveProjectCards(updatedStages[targetIdx].promptId, cards, activeProject?.id);
    }
  };

  // Generate stage deliverables via streaming API
  const handleGenerateDeliverables = (refineInstruction = null, stageIndexOverride = null) => {
    const currentWf = workflowRef.current || workflow;
    if (!currentWf) return;
    const targetIdx =
      typeof stageIndexOverride === "number"
        ? stageIndexOverride
        : currentWf.activeStepIndex || 0;
    const wfStages = currentWf.stages || [];
    const stageToRun = wfStages[targetIdx];
    if (!stageToRun) return;

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoAdvanceCountdown(null);

    const cumulativeContext = buildCumulativeContext(wfStages, targetIdx);
    const userinput = refineInstruction
      ? `${currentWf.initialInput || ""}\n\nRefinement Request: ${refineInstruction}`
      : currentWf.initialInput || stageToRun.title;

    const requestData = {
      userinput,
      promptid: stageToRun.promptId,
      userContext: cumulativeContext,
      json: true,
    };

    let ms = "";
    let parsedCards = null;
    setGenerationProgress(20);

    fetchSSE(
      "/api/prompt",
      {
        method: "POST",
        signal: startLoad(),
        body: JSON.stringify(requestData),
      },
      {
        json: true,
        onErrorHandle: () => {
          abortLoad();
          setGenerationProgress(0);
          toast.error("Failed to generate stage deliverables. Please retry.");
          if (isAutoPilotRef.current) {
            stopAutoPilot("Auto-Pilot paused due to generation error. Please review and retry.");
          }
        },
        onFinish: () => {
          abortLoad();
          setGenerationProgress(100);
          if (Array.isArray(parsedCards) && parsedCards.length > 0) {
            handleUpdateCurrentStageCards(parsedCards, targetIdx);
            toast.success(`Generated ${parsedCards.length} deliverables for ${stageToRun.title}`);
            if (isAutoPilotRef.current) {
              startAutoAdvanceCountdown(targetIdx);
            }
          } else {
            toast.warning("Generation complete, but no structured cards returned. Please retry or add cards manually.");
            if (isAutoPilotRef.current) {
              stopAutoPilot("Auto-Pilot paused due to empty deliverables. Please review or retry.");
            }
          }
        },
        onMessageHandle: (data) => {
          if (typeof data === "string") {
            const { text } = filterSSEEvents(data);
            ms += text;
          } else if (data?.data) {
            ms += data.data;
          }

          const cleaned = extractTopLevelJsonArray(ms);
          if (cleaned.startsWith("[")) {
            try {
              const result = parse(cleaned || "[]");
              if (Array.isArray(result)) {
                parsedCards = result;
                setGenerationProgress(Math.min(90, 20 + result.length * 15));
              }
            } catch (e) {
              // incremental parsing
            }
          }
        },
      },
    );
  };

  // Generate follow-up specification if available
  const handleGenerateFollowUp = () => {
    if (!currentStage || !currentStage.followUpId) return;

    const cumulativeContext = buildCumulativeContext(stages, currentStageIndex);
    const requestData = {
      userinput: workflow.initialInput || currentStage.title,
      promptid: currentStage.followUpId,
      scenarios: currentStage.cards || [],
      previous_promptid: currentStage.promptId,
      userContext: cumulativeContext,
    };

    let specText = "";
    fetchSSE(
      "/api/prompt/follow-up",
      {
        method: "POST",
        signal: startLoad(),
        body: JSON.stringify(requestData),
      },
      {
        onErrorHandle: () => {
          abortLoad();
          toast.error("Failed to generate follow-up spec");
        },
        onFinish: () => {
          abortLoad();
          const updatedStages = [...stages];
          updatedStages[currentStageIndex] = {
            ...updatedStages[currentStageIndex],
            followUpContent: specText,
          };
          const updated = { ...workflow, stages: updatedStages };
          setWorkflow(updated);
          saveProjectWorkflow(updated, activeProject?.id);
          toast.success("Follow-up specification generated!");
        },
        onMessageHandle: (data) => {
          if (typeof data === "string") {
            const { text } = filterSSEEvents(data);
            specText += text;
          } else if (data?.data) {
            specText += data.data;
          }
        },
      },
    );
  };

  // Approve & Next Stage Gate
  const handleApproveAndNext = (stageIndexOverride = null, isAutoAdvance = false) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoAdvanceCountdown(null);

    const currentWf = workflowRef.current || workflow;
    const targetIdx =
      typeof stageIndexOverride === "number"
        ? stageIndexOverride
        : currentWf.activeStepIndex || 0;
    const updatedStages = [...(currentWf.stages || [])];
    const targetStage = updatedStages[targetIdx];
    if (!targetStage) return;

    updatedStages[targetIdx] = {
      ...targetStage,
      status: "completed",
      approvedAt: Date.now(),
    };

    // Find next enabled stage
    let nextIndex = targetIdx + 1;
    while (nextIndex < updatedStages.length && updatedStages[nextIndex].enabled === false) {
      nextIndex++;
    }

    if (nextIndex < updatedStages.length) {
      updatedStages[nextIndex] = {
        ...updatedStages[nextIndex],
        status: "in-review",
      };
      const updated = {
        ...currentWf,
        activeStepIndex: nextIndex,
        status: "in-progress",
        stages: updatedStages,
      };
      setWorkflow(updated);
      workflowRef.current = updated;
      saveProjectWorkflow(updated, activeProject?.id);
      toast.success(`Approved ${targetStage.title}! Advancing to ${updatedStages[nextIndex].title}.`);

      if (isAutoPilotRef.current) {
        const nextStageObj = updatedStages[nextIndex];
        if (!Array.isArray(nextStageObj.cards) || nextStageObj.cards.length === 0) {
          setTimeout(() => {
            handleGenerateDeliverables(null, nextIndex);
          }, 350);
        } else {
          startAutoAdvanceCountdown(nextIndex);
        }
      }
    } else {
      const updated = {
        ...currentWf,
        activeStepIndex: targetIdx,
        status: "completed",
        stages: updatedStages,
      };
      setWorkflow(updated);
      workflowRef.current = updated;
      saveProjectWorkflow(updated, activeProject?.id);
      stopAutoPilot();
      toast.success("All workflow stages approved! Executive Dossier is ready.");
    }
  };

  const handlePrevStage = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoAdvanceCountdown(null);

    const currentWf = workflowRef.current || workflow;
    const currentIdx = currentWf.activeStepIndex || 0;
    if (currentIdx <= 0) return;
    let prevIndex = currentIdx - 1;
    while (prevIndex >= 0 && currentWf.stages[prevIndex]?.enabled === false) {
      prevIndex--;
    }
    if (prevIndex >= 0) {
      const updated = { ...currentWf, activeStepIndex: prevIndex };
      setWorkflow(updated);
      workflowRef.current = updated;
      saveProjectWorkflow(updated, activeProject?.id);
    }
  };

  const handleSkipStage = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoAdvanceCountdown(null);

    const currentWf = workflowRef.current || workflow;
    const currentIdx = currentWf.activeStepIndex || 0;
    const updatedStages = [...(currentWf.stages || [])];
    if (!updatedStages[currentIdx]) return;

    updatedStages[currentIdx] = {
      ...updatedStages[currentIdx],
      status: "skipped",
    };
    let nextIndex = currentIdx + 1;
    while (nextIndex < updatedStages.length && updatedStages[nextIndex].enabled === false) {
      nextIndex++;
    }
    if (nextIndex < updatedStages.length) {
      updatedStages[nextIndex] = {
        ...updatedStages[nextIndex],
        status: "in-review",
      };
      const updated = {
        ...currentWf,
        activeStepIndex: nextIndex,
        stages: updatedStages,
      };
      setWorkflow(updated);
      workflowRef.current = updated;
      saveProjectWorkflow(updated, activeProject?.id);

      if (isAutoPilotRef.current) {
        const nextStageObj = updatedStages[nextIndex];
        if (!Array.isArray(nextStageObj.cards) || nextStageObj.cards.length === 0) {
          setTimeout(() => {
            handleGenerateDeliverables(null, nextIndex);
          }, 350);
        } else {
          startAutoAdvanceCountdown(nextIndex);
        }
      }
    } else {
      const updated = {
        ...currentWf,
        status: "completed",
        stages: updatedStages,
      };
      setWorkflow(updated);
      workflowRef.current = updated;
      saveProjectWorkflow(updated, activeProject?.id);
      stopAutoPilot();
    }
  };

  const handleResetWorkflow = () => {
    stopAutoPilot();
    resetProjectWorkflow(activeProject?.id);
    const fresh = initWorkflowState(activeProject, initialPromptInput);
    setWorkflow(fresh);
    workflowRef.current = fresh;
    setIsConfiguring(true);
    toast.info("Workflow reset. You can customize stages and restart.");
  };

  // Convert stages to Steps items
  const stepsItems = stages
    .filter((s) => s.enabled !== false)
    .map((s, idx) => {
      let stepStatus = "wait";
      if (s.status === "completed") stepStatus = "finish";
      else if (idx === currentStageIndex && !isWorkflowCompleted) stepStatus = "process";

      return {
        key: s.key,
        title: s.title,
        status: stepStatus,
        description: s.status === "completed" ? "Approved" : s.status === "skipped" ? "Skipped" : undefined,
      };
    });

  return (
    <div className="workflow-page" style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <Head>
        <title>Project Automation Workflow | Haiven</title>
      </Head>

      {/* Page Title & Project Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.7rem", fontWeight: 700 }}>
            Project Automation Workflow
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "#64748b" }}>
            Autonomous section chaining with Human-in-the-Loop review gates for{" "}
            <strong>{activeProject?.name || "Default Project"}</strong>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Auto-Pilot Toggle Switch */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 12px",
              background: isAutoPilot ? "#f0fdf4" : "#f8fafc",
              borderRadius: 20,
              border: `1px solid ${isAutoPilot ? "#86efac" : "#cbd5e1"}`,
              transition: "all 0.2s ease",
            }}
          >
            <RiRocketLine
              style={{
                color: isAutoPilot ? "#16a34a" : "#64748b",
                fontSize: 18,
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: isAutoPilot ? "#15803d" : "#475569",
              }}
            >
              Auto-Pilot
            </span>
            <Switch
              checked={isAutoPilot}
              onChange={handleToggleAutoPilot}
              size="small"
            />
          </div>

          {!isWorkflowCompleted && workflow.status === "in-progress" && (
            <Button
              icon={<RiSettings3Line />}
              onClick={() => setIsConfiguring(!isConfiguring)}
            >
              {isConfiguring ? "Hide Pipeline Config" : "Pipeline Config"}
            </Button>
          )}
          <Popconfirm
            title="Reset Workflow"
            description="Restart workflow pipeline from scratch for this project?"
            onConfirm={handleResetWorkflow}
            okText="Reset"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<RiRefreshLine />}>
              Reset
            </Button>
          </Popconfirm>
        </div>
      </div>

      {/* Stepper Navigation Bar */}
      <Card
        style={{
          marginBottom: 24,
          borderRadius: 8,
          borderColor: "#e2e8f0",
          backgroundColor: "#ffffff",
          overflowX: "auto",
        }}
        styles={{
          body: {
            minWidth: 1400,
            padding: "16px 20px",
          },
        }}
      >
        <Steps
          size="small"
          current={isWorkflowCompleted ? stepsItems.length : currentStageIndex}
          items={stepsItems}
          onChange={(targetStep) => {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            setAutoAdvanceCountdown(null);
            if (stages[targetStep] && stages[targetStep].enabled !== false) {
              const updated = { ...workflow, activeStepIndex: targetStep };
              setWorkflow(updated);
              workflowRef.current = updated;
              saveProjectWorkflow(updated, activeProject?.id);
            }
          }}
        />
      </Card>

      {/* Pre-flight / Configuration Card */}
      {(workflow.status === "not-started" || isConfiguring) && !isWorkflowCompleted && (
        <Card
          title="Pipeline Pre-flight & Project Brief"
          style={{
            marginBottom: 24,
            borderRadius: 8,
            borderColor: "#93c5fd",
            backgroundColor: "#f0f7ff",
          }}
        >
          <p style={{ color: "#475569", marginBottom: 12 }}>
            Define the initial solution objectives and select which sections will be chained in this automated run:
          </p>
          <TextArea
            rows={3}
            value={initialPromptInput}
            onChange={(e) => setInitialPromptInput(e.target.value)}
            placeholder="Enter project requirements, context, or domain specifications..."
            style={{ marginBottom: 16 }}
          />

          <h4 style={{ margin: "0 0 8px 0" }}>Chained Project Sections:</h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {stages.map((stage, idx) => (
              <div
                key={stage.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "#ffffff",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                }}
              >
                <Checkbox
                  checked={stage.enabled !== false}
                  onChange={() => handleToggleStage(idx)}
                >
                  <span style={{ fontWeight: 600 }}>{stage.title}</span>
                </Checkbox>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <Checkbox
              checked={isAutoPilot}
              onChange={(e) => {
                const val = e.target.checked;
                setIsAutoPilot(val);
                isAutoPilotRef.current = val;
              }}
            >
              <span style={{ fontSize: 13, color: "#334155" }}>
                Enable <strong>Auto-Pilot Mode</strong> (hands-free automatic generation & transitions)
              </span>
            </Checkbox>

            {workflow.status === "not-started" && (
              <Button
                type="primary"
                size="large"
                icon={<RiPlayLine />}
                onClick={() => handleStartWorkflow(isAutoPilot)}
              >
                {isAutoPilot ? "Launch Workflow (Auto-Pilot)" : "Start Automated Workflow"}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Auto-Advance Countdown Banner */}
      {autoAdvanceCountdown !== null && !isWorkflowCompleted && (
        <Alert
          message={
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Badge
                  count={autoAdvanceCountdown}
                  style={{
                    backgroundColor: "#10b981",
                    fontWeight: 700,
                    boxShadow: "0 0 0 1px #059669 inset",
                  }}
                />
                <span style={{ fontSize: 14 }}>
                  <strong>Auto-Pilot Active:</strong> Auto-advancing to next phase in{" "}
                  <strong>{autoAdvanceCountdown}s</strong>...
                </span>
              </div>
              <Button
                size="small"
                type="primary"
                danger
                onClick={() =>
                  stopAutoPilot("Auto-advance paused. You can now edit deliverables.")
                }
              >
                Pause & Edit
              </Button>
            </div>
          }
          type="info"
          showIcon
          style={{
            marginBottom: 20,
            borderColor: "#86efac",
            backgroundColor: "#f0fdf4",
          }}
        />
      )}

      {/* Main Content: Stage Review or Completion Dossier */}
      {isWorkflowCompleted ? (
        <WorkflowDossierHandoff
          workflow={workflow}
          onResetWorkflow={handleResetWorkflow}
        />
      ) : (
        <WorkflowStageReview
          stage={currentStage}
          stageIndex={currentStageIndex}
          totalStages={stages.filter((s) => s.enabled !== false).length}
          cumulativeContext={buildCumulativeContext(stages, currentStageIndex)}
          isGenerating={isGenerating}
          generationProgress={generationProgress}
          onGenerate={() => handleGenerateDeliverables()}
          onRefine={(instructions) => handleGenerateDeliverables(instructions)}
          onUpdateCards={handleUpdateCurrentStageCards}
          onGenerateFollowUp={handleGenerateFollowUp}
          onApproveAndNext={handleApproveAndNext}
          onPrevStage={handlePrevStage}
          onSkipStage={handleSkipStage}
        />
      )}
    </div>
  );
};

export default WorkflowPage;

