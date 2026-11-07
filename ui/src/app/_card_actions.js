// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import {
  addToPinboard,
  getActiveProject,
  getProjectTasks,
  updateTask,
  extractWbsCode,
} from "../app/_local_store";
import {
  RiFileCopyLine,
  RiChat2Line,
  RiPushpinLine,
  RiAlertLine,
  RiCheckboxCircleLine,
  RiPlayCircleLine,
  RiExternalLinkLine,
  RiStopCircleLine,
  RiDownload2Line,
  RiSendPlaneFill,
  RiGithubFill,
  RiCodeBoxLine,
  RiGitPullRequestLine,
} from "react-icons/ri";
import {
  Button,
  Progress,
  Tooltip,
  Modal,
  Spin,
  Tag,
  Space,
  Alert,
  Input,
} from "antd";
import { toast } from "react-toastify";
import { scenarioToText } from "./_dynamic_data_renderer";
import {
  executePocSpikeStream,
  stopPocPreview,
  sendPocInstructionStream,
  executeWbsTaskStream,
  sendDevelopmentInstructionStream,
  stopDevelopmentSandbox,
} from "./_boba_api";
import React, { useState, useRef, useEffect } from "react";

export default function CardActions({
  featureToggleConfig,
  scenario = {},
  onExploreHandler,
  selfReview,
  progress,
  isGenerating,
}) {
  const colorFlamingo = "#f2617aff";
  let review = null;

  const [pocModalVisible, setPocModalVisible] = useState(false);
  const [pocLoading, setPocLoading] = useState(false);
  const [pocResult, setPocResult] = useState(null);
  const [pocLogs, setPocLogs] = useState("");
  const [isStopping, setIsStopping] = useState(false);
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [isSendingInstruction, setIsSendingInstruction] = useState(false);
  const logsContainerRef = useRef(null);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop =
        logsContainerRef.current.scrollHeight;
    }
  }, [pocLogs]);

  if (selfReview) {
    const firstChar = selfReview.charAt(0);
    const restOfText = selfReview.substring(1).trim();

    review = {
      status: firstChar,
      explanation: restOfText,
    };
  }

  const unsureIcon = (
    <div className="review-icon unsure">
      <RiAlertLine fontSize="large" />
    </div>
  );

  const prettySureIcon = (
    <div className="review-icon pretty-sure">
      <RiCheckboxCircleLine fontSize="large" />
    </div>
  );

  const copySuccess = () => {
    toast.success("Content copied successfully!");
  };

  const onCopyOne = (scenario) => {
    navigator.clipboard.writeText(scenarioToText(scenario));
    copySuccess();
  };

  const onPin = () => {
    const timestamp = Math.floor(Date.now()).toString();
    addToPinboard(timestamp, scenarioToText(scenario));
  };

  const isImplementationCard = Boolean(
    scenario &&
    (scenario.module_type ||
      scenario.target_files ||
      (typeof scenario.title === "string" &&
        scenario.title.startsWith("IMPL-"))),
  );

  const isWbsCard = Boolean(
    scenario &&
    (scenario.wbs_code ||
      scenario.wbsCode ||
      scenario.dependencies !== undefined ||
      scenario.parallel_group ||
      (typeof scenario.title === "string" &&
        (scenario.title.startsWith("WBS") || scenario.title.startsWith("WBS-")))),
  );

  const isExecutableScenario = Boolean(
    scenario &&
    (scenario.title ||
      scenario.verification_command ||
      scenario.target_adr ||
      scenario.hypothesis ||
      scenario.adr_domain ||
      scenario.module_type ||
      scenario.target_files),
  );

  const [wbsModalVisible, setWbsModalVisible] = useState(false);
  const [wbsLoading, setWbsLoading] = useState(false);
  const [wbsResult, setWbsResult] = useState(null);
  const [wbsLogs, setWbsLogs] = useState("");
  const [wbsFollowUpPrompt, setWbsFollowUpPrompt] = useState("");
  const [isSendingWbsInstruction, setIsSendingWbsInstruction] = useState(false);
  const wbsLogsContainerRef = useRef(null);

  useEffect(() => {
    if (wbsLogsContainerRef.current) {
      wbsLogsContainerRef.current.scrollTop =
        wbsLogsContainerRef.current.scrollHeight;
    }
  }, [wbsLogs]);

  const handleRunWbsTask = () => {
    setWbsModalVisible(true);
    setWbsLoading(true);
    setWbsResult(null);
    setWbsLogs("Provisioning Sandbox & configuring Pi Coding Agent...\n");

    const activeProj = getActiveProject();
    const githubConf = activeProj?.github?.repoUrl ? activeProj.github : null;
    const wbsCode =
      scenario.wbs_code ||
      scenario.wbsCode ||
      extractWbsCode(scenario.title);

    const runtime =
      scenario.runtime ||
      (scenario.summary &&
      scenario.summary.toLowerCase().includes("python")
        ? "python"
        : "node") ||
      "node";

    const payload = {
      wbs_code: wbsCode,
      title: scenario.title || "WBS Task",
      task_id: scenario.id || null,
      summary: scenario.summary || scenarioToText(scenario),
      pbs_deliverable_ref:
        scenario.pbs_deliverable_ref || scenario.pbsDeliverableRef || "",
      pdp_stage_ref: scenario.pdp_stage_ref || scenario.pdpStageRef || "",
      dependencies: scenario.dependencies || [],
      runtime: runtime,
      project_id: activeProj?.id,
      github_config: githubConf,
    };

    executeWbsTaskStream(
      payload,
      (logChunk) => {
        setWbsLogs((prev) => prev + logChunk);
      },
      (result) => {
        setWbsResult(result);
        setWbsLoading(false);
        if (result && result.logs && result.logs.length > wbsLogs.length) {
          setWbsLogs(result.logs);
        }
        if (result && result.success) {
          toast.success(
            result.pr_info?.html_url
              ? `WBS Task completed & Pull Request #${result.pr_info.number} created!`
              : "WBS Task tests passed successfully in Sandbox!",
          );
          if (activeProj?.id) {
            const currentTasks = getProjectTasks(activeProj.id);
            const matched = currentTasks.find(
              (t) =>
                (wbsCode && t.wbsCode === wbsCode) ||
                t.title === scenario.title,
            );
            if (matched) {
              updateTask(
                matched.id,
                {
                  status: "needs_review",
                  execution: {
                    status: "success",
                    branch: result.feature_branch,
                    pr_url: result.pr_info?.html_url,
                    pr_number: result.pr_info?.number,
                    tests_passed: true,
                    updated_at: Date.now(),
                  },
                },
                activeProj.id,
              );
            }
          }
        } else {
          toast.error("WBS Task execution completed with test or build errors.");
        }
      },
      (err) => {
        setWbsLoading(false);
        setWbsResult({
          success: false,
          error: err.message,
          summary: "Failed to execute WBS task.",
        });
        setWbsLogs((prev) => prev + `\n[ERROR]: ${err.message}\n`);
        toast.error(`WBS execution failed: ${err.message}`);
      },
    );
  };

  const handleSendWbsInstruction = async () => {
    if (
      !wbsFollowUpPrompt.trim() ||
      !wbsResult ||
      !wbsResult.sandbox_id ||
      isSendingWbsInstruction ||
      wbsLoading
    ) {
      return;
    }
    const promptToSend = wbsFollowUpPrompt.trim();
    setWbsFollowUpPrompt("");
    setIsSendingWbsInstruction(true);

    const marker = `\n\n========================================\n>>> User Instruction: ${promptToSend}\n========================================\n`;
    setWbsLogs((prev) => prev + marker);

    sendDevelopmentInstructionStream(
      wbsResult.sandbox_id,
      promptToSend,
      (logChunk) => {
        setWbsLogs((prev) => prev + logChunk);
      },
      (result) => {
        setIsSendingWbsInstruction(false);
        if (result) {
          setWbsResult((prev) => ({
            ...prev,
            ...result,
          }));
          if (result.logs && result.logs.length > wbsLogs.length) {
            setWbsLogs(result.logs);
          }
        }
        toast.success("Instruction executed in sandbox!");
      },
      (err) => {
        setIsSendingWbsInstruction(false);
        setWbsLogs((prev) => prev + `\n[ERROR]: ${err.message}\n`);
        toast.error(`Instruction error: ${err.message}`);
      },
    );
  };

  const handleRunPoc = () => {
    setPocModalVisible(true);
    setPocLoading(true);
    setPocResult(null);
    setPocLogs("Connecting to E2B Cloud Sandbox...\n");

    const runtime =
      scenario.runtime ||
      (scenario.runtime_or_language &&
      scenario.runtime_or_language.toLowerCase().includes("python")
        ? "python"
        : "node") ||
      "node";

    const activeProj = getActiveProject();
    const githubConf = activeProj?.github?.repoUrl ? activeProj.github : null;

    const payload = {
      adr_title:
        scenario.title ||
        (isImplementationCard ? "ADR Implementation" : "ADR PoC Spike"),
      adr_content: scenarioToText(scenario),
      runtime: runtime,
      preview_port: 3000,
      keep_alive_for_preview: true,
      project_id: activeProj?.id,
      github_config: githubConf,
    };

    executePocSpikeStream(
      payload,
      (logChunk) => {
        setPocLogs((prev) => prev + logChunk);
      },
      (result) => {
        setPocResult(result);
        setPocLoading(false);
        if (result && result.logs && result.logs.length > pocLogs.length) {
          setPocLogs(result.logs);
        }
        if (result && result.success) {
          toast.success(
            isImplementationCard
              ? "Implementation generated and deployed to E2B successfully!"
              : "PoC generated and deployed to E2B successfully!",
          );
        } else {
          toast.error(
            isImplementationCard
              ? "Implementation execution completed with errors."
              : "PoC execution completed with errors.",
          );
        }
      },
      (err) => {
        setPocLoading(false);
        setPocResult({
          success: false,
          error: err.message,
          summary: "Failed to execute PoC spike in E2B sandbox.",
        });
        setPocLogs((prev) => prev + `\n[ERROR]: ${err.message}\n`);
        toast.error(`PoC failed: ${err.message}`);
      },
    );
  };

  const handleStopPreview = async () => {
    if (!pocResult || !pocResult.sandbox_id) return;
    setIsStopping(true);
    try {
      await stopPocPreview(pocResult.sandbox_id);
      toast.info("Preview sandbox terminated.");
      setPocResult((prev) => ({
        ...prev,
        preview_url: null,
        stopped: true,
      }));
    } catch (err) {
      toast.error(`Failed to stop preview: ${err.message}`);
    } finally {
      setIsStopping(false);
    }
  };

  const downloadArchive = () => {
    if (pocResult && pocResult.archive_base64) {
      const link = document.createElement("a");
      link.href = `data:application/zip;base64,${pocResult.archive_base64}`;
      link.download = `poc_${pocResult.sandbox_id || "spike"}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleSendInstruction = async () => {
    if (
      !followUpPrompt.trim() ||
      !pocResult ||
      !pocResult.sandbox_id ||
      isSendingInstruction ||
      pocLoading
    ) {
      return;
    }
    const promptToSend = followUpPrompt.trim();
    setFollowUpPrompt("");
    setIsSendingInstruction(true);

    const marker = `\n\n========================================\n>>> User Instruction: ${promptToSend}\n========================================\n`;
    setPocLogs((prev) => prev + marker);

    sendPocInstructionStream(
      pocResult.sandbox_id,
      promptToSend,
      (logChunk) => {
        setPocLogs((prev) => prev + logChunk);
      },
      (result) => {
        setIsSendingInstruction(false);
        if (result) {
          setPocResult((prev) => ({
            ...prev,
            ...result,
          }));
          if (result.logs && result.logs.length > pocLogs.length) {
            setPocLogs(result.logs);
          }
        }
        toast.success("Agent instruction applied successfully!");
      },
      (err) => {
        setIsSendingInstruction(false);
        setPocLogs((prev) => prev + `\n[ERROR]: ${err.message}\n`);
        toast.error(`Instruction failed: ${err.message}`);
      },
    );
  };

  return (
    <div>
      <div className="card-actions-footer">
        <div className="actions-container">
          {onExploreHandler && (
            <Tooltip title="Chat with Haiven" key="chat">
              <Button type="link" onClick={() => onExploreHandler(scenario)}>
                <RiChat2Line fontSize="large" />
              </Button>
            </Tooltip>
          )}
          {isWbsCard && (
            <Tooltip
              title="Execute WBS Task (Code Development with DoD Tests)"
              key="wbs-dev"
            >
              <Button
                type="link"
                aria-label="Execute WBS Task"
                onClick={handleRunWbsTask}
                style={{ color: "#722ed1", paddingRight: "4px" }}
              >
                <RiCodeBoxLine fontSize="large" />
              </Button>
            </Tooltip>
          )}
          {!isWbsCard && isExecutableScenario && (
            <Tooltip
              title={
                isImplementationCard
                  ? "Generate & Deploy Implementation (E2B + Pi)"
                  : "Generate & Deploy PoC Spike (E2B + Pi)"
              }
              key="poc"
            >
              <Button
                type="link"
                aria-label={
                  isImplementationCard
                    ? "Generate & Deploy Implementation"
                    : "Generate & Deploy PoC Spike"
                }
                onClick={handleRunPoc}
                style={{ color: "#1677ff", paddingRight: "4px" }}
              >
                <RiPlayCircleLine fontSize="large" />
              </Button>
            </Tooltip>
          )}
          <Tooltip title="Copy" key="copy">
            <Button type="link" onClick={() => onCopyOne(scenario)}>
              <RiFileCopyLine fontSize="large" />
            </Button>
          </Tooltip>
          <Tooltip title="Pin to pinboard" key="pin">
            <Button
              type="link"
              onClick={() => onPin()}
              style={{ paddingRight: "0" }}
            >
              <RiPushpinLine fontSize="large" />
            </Button>
          </Tooltip>
        </div>
        {review &&
          review.status &&
          review.explanation &&
          review.explanation !== "" && (
            <div className="review-container">
              <Tooltip title={review.explanation} key="review">
                {review.status === "🤔" || review.status === "\uD83E"
                  ? unsureIcon
                  : review.status === "✅" || review.status === "\u2705"
                    ? prettySureIcon
                    : null}
              </Tooltip>
            </div>
          )}
      </div>
      {isGenerating && (
        <Progress
          data-testid="progress-bar"
          percent={progress}
          showInfo={false}
          status="active"
          strokeColor={colorFlamingo}
        />
      )}

      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>
              {isImplementationCard
                ? "ADR Implementation Sandbox: "
                : "ADR PoC Spike Sandbox: "}
              {scenario.title || ""}
            </span>
            {pocLoading && <Spin size="small" />}
          </div>
        }
        open={pocModalVisible}
        onCancel={() => setPocModalVisible(false)}
        footer={null}
        width={780}
        destroyOnClose
      >
        <div style={{ marginTop: "12px" }}>
          {pocResult && (
            <div style={{ marginBottom: "16px" }}>
              <Tag color={pocResult.success ? "success" : "error"}>
                {pocResult.success ? "VERIFIED & DEPLOYED" : "EXECUTION FAILED"}
              </Tag>
              {pocResult.execution_mode && (
                <Tag color="blue">{pocResult.execution_mode.toUpperCase()}</Tag>
              )}
              {pocResult.sandbox_id && (
                <Tag>Sandbox: {pocResult.sandbox_id}</Tag>
              )}
              <p style={{ marginTop: "8px" }}>
                <strong>Summary:</strong>{" "}
                {pocResult.summary ||
                  (pocResult.success
                    ? "Deployed successfully."
                    : "Execution failed.")}
              </p>
            </div>
          )}

          {pocResult && pocResult.preview_url && !pocResult.stopped && (
            <Alert
              message="Live Interactive Preview Ready"
              description={
                <div style={{ marginTop: "8px" }}>
                  <p>
                    Your application is running live inside the E2B microVM.
                  </p>
                  <Space>
                    <Button
                      type="primary"
                      icon={<RiExternalLinkLine />}
                      href={pocResult.preview_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Live Preview ({pocResult.preview_url})
                    </Button>
                    <Button
                      danger
                      icon={<RiStopCircleLine />}
                      loading={isStopping}
                      onClick={handleStopPreview}
                    >
                      Stop Preview
                    </Button>
                  </Space>
                </div>
              }
              type="success"
              showIcon
              style={{ marginBottom: "16px" }}
            />
          )}

          {pocResult && pocResult.github_pr && (
            <Alert
              message={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <RiGithubFill style={{ fontSize: "18px" }} />
                  GitHub Pull Request Created
                </span>
              }
              description={
                <div style={{ marginTop: "6px" }}>
                  <p style={{ marginBottom: "8px" }}>
                    Branch <code>{pocResult.github_pr.head}</code> pushed and Draft PR #{pocResult.github_pr.number} created on GitHub.
                  </p>
                  <Button
                    type="primary"
                    icon={<RiExternalLinkLine />}
                    href={pocResult.github_pr.html_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View Draft Pull Request #{pocResult.github_pr.number}
                  </Button>
                </div>
              }
              type="info"
              showIcon
              style={{ marginBottom: "16px" }}
            />
          )}

          {pocResult && pocResult.stopped && (
            <Alert
              message="Preview Sandbox Stopped"
              description="The E2B microVM preview was terminated and resources released."
              type="info"
              showIcon
              style={{ marginBottom: "16px" }}
            />
          )}

          {pocResult && pocResult.archive_base64 && (
            <div style={{ marginBottom: "16px" }}>
              <Button icon={<RiDownload2Line />} onClick={downloadArchive}>
                Download Codebase (.zip)
              </Button>
            </div>
          )}

          {pocResult && pocResult.sandbox_id && !pocResult.stopped && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px",
                backgroundColor: "#f8fafc",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "13px",
                    color: "#334155",
                  }}
                >
                  Prompt Coding Agent in Sandbox:
                </span>
                {isSendingInstruction && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#1677ff",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Spin size="small" /> Agent working on instruction...
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Input
                  data-testid="poc-instruction-input"
                  placeholder="Send follow-up instruction (e.g. 'Add a search bar', 'Make tests pass')..."
                  value={followUpPrompt}
                  onChange={(e) => setFollowUpPrompt(e.target.value)}
                  onPressEnter={handleSendInstruction}
                  disabled={isSendingInstruction || pocLoading}
                  style={{ flex: 1 }}
                />
                <Button
                  type="primary"
                  icon={<RiSendPlaneFill />}
                  loading={isSendingInstruction}
                  disabled={!followUpPrompt.trim() || pocLoading}
                  onClick={handleSendInstruction}
                  data-testid="poc-instruction-send"
                >
                  Send
                </Button>
              </div>
            </div>
          )}

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
              }}
            >
              <h4 style={{ margin: 0 }}>
                {pocLoading ? "Live Execution Logs:" : "Sandbox & Agent Logs:"}
              </h4>
              {pocLoading && (
                <span style={{ fontSize: "12px", color: "#1677ff" }}>
                  Streaming output from E2B sandbox...
                </span>
              )}
            </div>
            <pre
              ref={logsContainerRef}
              style={{
                backgroundColor: "#1e1e1e",
                color: "#68d391",
                padding: "12px",
                borderRadius: "6px",
                maxHeight: "320px",
                overflowY: "auto",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {pocLogs || "Starting execution..."}
            </pre>
          </div>
        </div>
      </Modal>

      {/* WBS Code Development Execution Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <RiCodeBoxLine style={{ color: "#722ed1", fontSize: "1.2rem" }} />
            <span>
              WBS Code Development:{" "}
              {scenario.title || (scenario.wbs_code ? `WBS ${scenario.wbs_code}` : "Task")}
            </span>
            {wbsLoading && <Spin size="small" />}
          </div>
        }
        open={wbsModalVisible}
        onCancel={() => setWbsModalVisible(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <div style={{ marginTop: "12px" }}>
          {wbsResult && (
            <div style={{ marginBottom: "16px" }}>
              <Space wrap style={{ marginBottom: "8px" }}>
                <Tag color={wbsResult.success ? "success" : "error"}>
                  {wbsResult.success
                    ? "DoD VERIFIED & TESTS PASSED"
                    : "TESTS / BUILD FAILED"}
                </Tag>
                {wbsResult.feature_branch && (
                  <Tag color="purple">Branch: {wbsResult.feature_branch}</Tag>
                )}
                {wbsResult.sandbox_id && (
                  <Tag>Sandbox: {wbsResult.sandbox_id}</Tag>
                )}
              </Space>

              {wbsResult.pr_info?.html_url && (
                <Alert
                  type="success"
                  showIcon
                  message="Pull Request Created Successfully"
                  description={
                    <div style={{ marginTop: "8px" }}>
                      <p style={{ margin: "0 0 8px 0" }}>
                        The AI agent verified tests against the Definition of Done (DoD)
                        and submitted a Draft Pull Request.
                      </p>
                      <Space wrap>
                        {wbsResult.issue_info?.html_url && (
                          <Button
                            icon={<RiGithubFill />}
                            href={wbsResult.issue_info.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Issue #{wbsResult.issue_info.number}
                          </Button>
                        )}
                        <Button
                          type="primary"
                          icon={<RiGithubFill />}
                          href={wbsResult.pr_info.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ background: "#24292f" }}
                        >
                          View Pull Request #{wbsResult.pr_info.number}
                        </Button>
                      </Space>
                    </div>
                  }
                  style={{ marginBottom: "12px" }}
                />
              )}
            </div>
          )}

          {/* Follow-up Interactive Agent Instruction */}
          {wbsResult && wbsResult.sandbox_id && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px",
                background: "#f9fafb",
                borderRadius: "6px",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>
                  Interactive Follow-up Prompt to Sandbox:
                </span>
                {isSendingWbsInstruction && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#722ed1",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Spin size="small" /> Agent working on instruction...
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Input
                  placeholder="Send instructions to agent (e.g., 'Fix the edge case in auth test', 'Refactor query')..."
                  value={wbsFollowUpPrompt}
                  onChange={(e) => setWbsFollowUpPrompt(e.target.value)}
                  onPressEnter={handleSendWbsInstruction}
                  disabled={isSendingWbsInstruction || wbsLoading}
                  style={{ flex: 1 }}
                />
                <Button
                  type="primary"
                  icon={<RiSendPlaneFill />}
                  loading={isSendingWbsInstruction}
                  disabled={!wbsFollowUpPrompt.trim() || wbsLoading}
                  onClick={handleSendWbsInstruction}
                  style={{ background: "#722ed1", borderColor: "#722ed1" }}
                >
                  Send
                </Button>
              </div>
            </div>
          )}

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
              }}
            >
              <h4 style={{ margin: 0 }}>
                {wbsLoading ? "Live Execution & Test Logs:" : "Execution & Test Logs:"}
              </h4>
              {wbsLoading && (
                <span style={{ fontSize: "12px", color: "#722ed1" }}>
                  Streaming output from Sandbox & Pi Agent...
                </span>
              )}
            </div>
            <pre
              ref={wbsLogsContainerRef}
              style={{
                backgroundColor: "#0d1117",
                color: "#58a6ff",
                padding: "12px",
                borderRadius: "6px",
                maxHeight: "340px",
                overflowY: "auto",
                fontSize: "12px",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {wbsLogs || "Initializing execution..."}
            </pre>
          </div>
        </div>
      </Modal>
    </div>
  );
}
