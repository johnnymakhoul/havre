// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { addToPinboard } from "../app/_local_store";
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
} from "antd";
import { toast } from "react-toastify";
import { scenarioToText } from "./_dynamic_data_renderer";
import { executePocSpikeStream, stopPocPreview } from "./_boba_api";
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

    const payload = {
      adr_title:
        scenario.title ||
        (isImplementationCard ? "ADR Implementation" : "ADR PoC Spike"),
      adr_content: scenarioToText(scenario),
      runtime: runtime,
      preview_port: 3000,
      keep_alive_for_preview: true,
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
          {isExecutableScenario && (
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
    </div>
  );
}
