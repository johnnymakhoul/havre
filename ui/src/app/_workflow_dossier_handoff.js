// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import React, { useState } from "react";
import { Button, Card, Result, Tag, Collapse, Statistic, Row, Col } from "antd";
import {
  RiDownload2Line,
  RiKanbanView2,
  RiFileCopyLine,
  RiRefreshLine,
  RiCheckDoubleLine,
  RiFileTextLine,
} from "react-icons/ri";
import Link from "next/link";
import { toast } from "react-toastify";
import MarkdownRenderer from "./_markdown_renderer";
import {
  generateDossierMarkdown,
  extractTasksFromWorkflow,
} from "./utils/_workflow_engine";
import { saveProjectTasks, getProjectTasks } from "./_local_store";

const WorkflowDossierHandoff = ({ workflow, onResetWorkflow }) => {
  const [tasksSynced, setTasksSynced] = useState(false);

  const stages = workflow?.stages || [];
  const completedStages = stages.filter((s) => s.status === "completed");
  const totalDeliverables = stages.reduce(
    (acc, s) => acc + (Array.isArray(s.cards) ? s.cards.length : 0),
    0,
  );
  const tasks = extractTasksFromWorkflow(stages);
  const dossierMarkdown = generateDossierMarkdown(workflow);

  const handleDownloadDossier = () => {
    const filename = `${(workflow.projectName || "project")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")}-executive-dossier.md`;
    const blob = new Blob([dossierMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Dossier downloaded as ${filename}`);
  };

  const handleCopyDossier = () => {
    navigator.clipboard.writeText(dossierMarkdown);
    toast.success("Executive Dossier copied to clipboard!");
  };

  const handleSyncToTasks = () => {
    if (tasks.length === 0) {
      toast.info("No actionable deliverables to sync");
      return;
    }
    const currentTasks = getProjectTasks(workflow.projectId);
    const existingTitles = new Set(currentTasks.map((t) => t.title));
    const newTasks = tasks.filter((t) => !existingTitles.has(t.title));
    const merged = [...currentTasks, ...newTasks];
    saveProjectTasks(merged, workflow.projectId);
    setTasksSynced(true);
    toast.success(`${newTasks.length} deliverables synced to Kanban board!`);
  };

  const collapseItems = [
    {
      key: "dossier-preview",
      label: (
        <span style={{ fontWeight: 600 }}>
          <RiFileTextLine style={{ marginRight: 6, verticalAlign: "middle" }} />
          Inspect Consolidated Executive Dossier
        </span>
      ),
      children: (
        <div
          style={{
            maxHeight: 450,
            overflowY: "auto",
            backgroundColor: "#f8f9fa",
            padding: 16,
            borderRadius: 6,
          }}
        >
          <MarkdownRenderer content={dossierMarkdown} />
        </div>
      ),
    },
  ];

  return (
    <div className="workflow-dossier-handoff" style={{ marginTop: 24 }}>
      <Result
        status="success"
        title="Project Automation Workflow Complete!"
        subTitle={`All ${completedStages.length} configured sections for "${workflow.projectName || "Project"}" have been successfully executed and approved.`}
        extra={[
          <Button
            key="download"
            type="primary"
            size="large"
            icon={<RiDownload2Line />}
            onClick={handleDownloadDossier}
          >
            Download Executive Dossier (.md)
          </Button>,
          <Button
            key="tasks"
            size="large"
            icon={<RiKanbanView2 />}
            onClick={handleSyncToTasks}
            disabled={tasksSynced}
          >
            {tasksSynced ? "Deliverables Synced to Tasks" : `Sync ${tasks.length} Deliverables to Tasks`}
          </Button>,
          <Link key="view-tasks" href="/tasks">
            <Button size="large">Go to Kanban Board</Button>
          </Link>,
        ]}
      />

      {/* Metrics Row */}
      <Card style={{ marginBottom: 24, borderRadius: 8 }}>
        <Row gutter={16} justify="space-around">
          <Col span={6} style={{ textAlign: "center" }}>
            <Statistic
              title="Completed Stages"
              value={completedStages.length}
              suffix={`/ ${stages.length}`}
            />
          </Col>
          <Col span={6} style={{ textAlign: "center" }}>
            <Statistic
              title="Approved Deliverables"
              value={totalDeliverables}
              valueStyle={{ color: "#3f8600" }}
            />
          </Col>
          <Col span={6} style={{ textAlign: "center" }}>
            <Statistic
              title="Actionable Tasks"
              value={tasks.length}
              valueStyle={{ color: "#1677ff" }}
            />
          </Col>
          <Col span={6} style={{ textAlign: "center" }}>
            <Statistic
              title="Workflow Status"
              value="COMPLETE"
              valueStyle={{ color: "#52c41a", fontSize: "1.2rem" }}
            />
          </Col>
        </Row>
      </Card>

      {/* Action Bar & Dossier Inspector */}
      <Card
        style={{
          borderRadius: 8,
          borderColor: "#e2e8f0",
        }}
        title="Executive Deliverables Package"
        extra={
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="small" onClick={handleCopyDossier}>
              <RiFileCopyLine style={{ marginRight: 4 }} /> Copy Dossier
            </Button>
            <Button
              size="small"
              danger
              icon={<RiRefreshLine />}
              onClick={onResetWorkflow}
            >
              Restart Workflow
            </Button>
          </div>
        }
      >
        <Collapse items={collapseItems} defaultActiveKey={["dossier-preview"]} />
      </Card>
    </div>
  );
};

export default WorkflowDossierHandoff;

