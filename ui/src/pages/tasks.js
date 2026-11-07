// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Head from "next/head";
import {
  Button,
  Card,
  Tag,
  Drawer,
  Modal,
  Input,
  Select,
  Switch,
  Tooltip,
  Dropdown,
  Space,
  Empty,
  Badge,
  Spin,
  Alert,
} from "antd";
import {
  RiKanbanView2,
  RiAddLine,
  RiRefreshLine,
  RiAlertFill,
  RiCheckFill,
  RiTimeLine,
  RiMore2Fill,
  RiDeleteBinLine,
  RiEditLine,
  RiUserSharedLine,
  RiExternalLinkLine,
  RiArrowRightLine,
  RiArrowLeftLine,
  RiShieldCheckLine,
  RiGitMergeLine,
  RiFireLine,
  RiRouteLine,
  RiCodeBoxLine,
  RiPlayCircleLine,
  RiGithubFill,
  RiSendPlaneFill,
} from "react-icons/ri";
import { toast } from "react-toastify";
import {
  getActiveProject,
  getProjectTasks,
  saveProjectTasks,
  syncWbsToTasks,
  createTask,
  updateTask,
  deleteTask,
  extractWbsCode,
} from "../app/_local_store";
import {
  executeWbsTaskStream,
  executeWbsWave,
  sendDevelopmentInstructionStream,
} from "../app/_boba_api";
import MarkdownRenderer from "../app/_markdown_renderer";

const COLUMNS = [
  {
    id: "backlog",
    title: "Backlog",
    color: "#64748b",
    bgColor: "#f8fafc",
    borderColor: "#e2e8f0",
    headerBg: "#f1f5f9",
    description: "Tasks awaiting pickup or newly ingested from WBS",
  },
  {
    id: "in_progress",
    title: "In Progress",
    color: "#2563eb",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
    headerBg: "#dbeafe",
    description: "Work packages actively being executed",
  },
  {
    id: "needs_review",
    title: "Needs Review / HITL",
    color: "#d97706",
    bgColor: "#fffbeb",
    borderColor: "#fde68a",
    headerBg: "#fef3c7",
    description: "Flagged for human-in-the-loop review, feedback, or approval",
  },
  {
    id: "done",
    title: "Done",
    color: "#16a34a",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    headerBg: "#dcfce7",
    description: "Completed work packages verified against Definition of Done",
  },
];

export default function TasksPage() {
  const [activeProject, setActiveProject] = useState(() => getActiveProject());
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterHitlOnly, setFilterHitlOnly] = useState(false);
  const [filterReadyOnly, setFilterReadyOnly] = useState(false);
  const [filterCriticalOnly, setFilterCriticalOnly] = useState(false);
  const [selectedWave, setSelectedWave] = useState("ALL");
  const [pendingMove, setPendingMove] = useState(null);

  // WBS Sandbox Code Execution States
  const [execModalVisible, setExecModalVisible] = useState(false);
  const [executingTask, setExecutingTask] = useState(null);
  const [execLogs, setExecLogs] = useState("");
  const [execLoading, setExecLoading] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [execFollowUp, setExecFollowUp] = useState("");
  const [isSendingExecInstruction, setIsSendingExecInstruction] = useState(false);
  const [isRunningWave, setIsRunningWave] = useState(false);
  const execLogsContainerRef = useRef(null);

  useEffect(() => {
    if (execLogsContainerRef.current) {
      execLogsContainerRef.current.scrollTop =
        execLogsContainerRef.current.scrollHeight;
    }
  }, [execLogs]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find((t) => String(t.id) === String(selectedTaskId)) || null;
  }, [tasks, selectedTaskId]);

  // Form states for Add/Edit
  const [formTitle, setFormTitle] = useState("");
  const [formStatus, setFormStatus] = useState("backlog");
  const [formSummary, setFormSummary] = useState("");
  const [formWbsLevel, setFormWbsLevel] = useState("Work Package");
  const [formWbsCode, setFormWbsCode] = useState("");
  const [formPbsRef, setFormPbsRef] = useState("");
  const [formPdpRef, setFormPdpRef] = useState("");
  const [formDependencies, setFormDependencies] = useState([]);
  const [formIsCriticalPath, setFormIsCriticalPath] = useState(false);
  const [formParallelGroup, setFormParallelGroup] = useState("");
  const [formHitlRequired, setFormHitlRequired] = useState(false);
  const [formHitlReason, setFormHitlReason] = useState("");

  const refreshTasks = useCallback(() => {
    const proj = getActiveProject();
    setActiveProject(proj);
    const synced = syncWbsToTasks(proj?.id);
    setTasks(synced || getProjectTasks(proj?.id));
  }, []);

  useEffect(() => {
    refreshTasks();

    const handleProjectUpdate = () => {
      refreshTasks();
    };

    const handleCardsUpdate = (e) => {
      const proj = getActiveProject();
      if (!e.detail || e.detail.projectId === proj?.id) {
        syncWbsToTasks(proj?.id);
        setTasks(getProjectTasks(proj?.id));
      }
    };

    const handleTasksUpdate = (e) => {
      const proj = getActiveProject();
      if (!e.detail || e.detail.projectId === proj?.id) {
        setTasks(getProjectTasks(proj?.id));
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("update-project", handleProjectUpdate);
      window.addEventListener("update-cards", handleCardsUpdate);
      window.addEventListener("update-tasks", handleTasksUpdate);

      return () => {
        window.removeEventListener("update-project", handleProjectUpdate);
        window.removeEventListener("update-cards", handleCardsUpdate);
        window.removeEventListener("update-tasks", handleTasksUpdate);
      };
    }
  }, [refreshTasks]);

  // Task dependencies analysis map
  const taskDependencyMap = useMemo(() => {
    const map = {};
    const codeToTask = new Map();

    tasks.forEach((t) => {
      const code = t.wbsCode || extractWbsCode(t.title);
      if (code) {
        codeToTask.set(code.toLowerCase(), t);
      }
      if (t.id) {
        codeToTask.set(String(t.id).toLowerCase(), t);
      }
    });

    tasks.forEach((t) => {
      const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
      const resolvedPrereqs = [];
      const unresolvedPrereqs = [];

      deps.forEach((d) => {
        const trimmed = String(d).trim();
        if (!trimmed) return;
        const matched = codeToTask.get(trimmed.toLowerCase());
        if (matched && matched.id !== t.id) {
          if (matched.status === "done") {
            resolvedPrereqs.push({ code: trimmed, task: matched });
          } else {
            unresolvedPrereqs.push({ code: trimmed, task: matched });
          }
        } else {
          // Prerequisite code not matched in current tasks (e.g. external or not yet created)
          unresolvedPrereqs.push({ code: trimmed, task: null });
        }
      });

      const currentCode = t.wbsCode || extractWbsCode(t.title);
      const downstream = tasks.filter((other) => {
        if (other.id === t.id) return false;
        const otherDeps = Array.isArray(other.dependencies)
          ? other.dependencies
          : [];
        return otherDeps.some((depStr) => {
          const depTrimmed = String(depStr).trim().toLowerCase();
          return (
            depTrimmed === String(t.id).toLowerCase() ||
            (currentCode && depTrimmed === currentCode.toLowerCase())
          );
        });
      });

      map[t.id] = {
        isBlocked: unresolvedPrereqs.length > 0,
        isReady: unresolvedPrereqs.length === 0,
        unresolvedPrereqs,
        resolvedPrereqs,
        downstream,
      };
    });

    return map;
  }, [tasks]);

  const availableWaves = useMemo(() => {
    const waves = new Set();
    tasks.forEach((t) => {
      if (
        t.parallelGroup &&
        typeof t.parallelGroup === "string" &&
        t.parallelGroup.trim()
      ) {
        waves.add(t.parallelGroup.trim());
      }
    });
    return Array.from(waves).sort();
  }, [tasks]);

  const handleManualSync = () => {
    const proj = getActiveProject();
    const updated = syncWbsToTasks(proj?.id);
    setTasks(updated || []);
    toast.success("Tasks synced from Detailed WBS cards!");
  };

  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const executeMove = (task, targetColumnId) => {
    let hitlUpdate = task.hitl;
    if (targetColumnId === "needs_review" && !task.hitl?.required) {
      hitlUpdate = {
        required: true,
        reason:
          task.hitl?.reason || "Moved to Needs Review column for verification",
      };
    }

    updateTask(
      task.id,
      { status: targetColumnId, hitl: hitlUpdate },
      activeProject?.id,
    );
    setTasks(getProjectTasks(activeProject?.id));
    toast.info(
      `Moved "${task.title.slice(0, 30)}..." to ${COLUMNS.find((c) => c.id === targetColumnId)?.title}`,
    );
  };

  const handleDrop = (e, targetColumnId) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    setDraggedTaskId(null);

    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetColumnId) return;

    // Soft enforcement: if moving to in_progress and task has unresolved prerequisites, confirm first
    if (
      targetColumnId === "in_progress" &&
      taskDependencyMap[task.id]?.isBlocked
    ) {
      setPendingMove({
        task,
        targetStatus: targetColumnId,
        unresolvedPrereqs: taskDependencyMap[task.id].unresolvedPrereqs,
      });
      return;
    }

    executeMove(task, targetColumnId);
  };

  const handleMoveStatus = (task, newStatus) => {
    // Soft enforcement on status change
    if (newStatus === "in_progress" && taskDependencyMap[task.id]?.isBlocked) {
      setPendingMove({
        task,
        targetStatus: newStatus,
        unresolvedPrereqs: taskDependencyMap[task.id].unresolvedPrereqs,
      });
      return;
    }

    executeMove(task, newStatus);
  };

  const handleToggleHitl = (task, required, reason = "") => {
    const newStatus =
      required && task.status !== "needs_review" ? "needs_review" : task.status;
    const hitl = {
      required,
      reason: reason || (required ? "Requires human-in-the-loop sign-off" : ""),
    };
    updateTask(task.id, { hitl, status: newStatus }, activeProject?.id);
    setTasks(getProjectTasks(activeProject?.id));
    toast.success(
      required ? "Flagged for Human Review (HITL)" : "HITL Flag cleared",
    );
  };

  const handleDelete = (taskId) => {
    deleteTask(taskId, activeProject?.id);
    setTasks(getProjectTasks(activeProject?.id));
    if (selectedTaskId === taskId) {
      setIsDetailDrawerOpen(false);
      setSelectedTaskId(null);
    }
    toast.success("Task deleted");
  };

  const handleExecuteTask = (task) => {
    setExecutingTask(task);
    setExecModalVisible(true);
    setExecLoading(true);
    setExecResult(null);
    setExecLogs(
      `Initializing sandbox execution for [${task.wbsCode || "WBS"}] ${task.title}...\n`,
    );

    const proj = getActiveProject();
    const githubConf = proj?.github?.repoUrl ? proj.github : null;

    const payload = {
      wbs_code: task.wbsCode || extractWbsCode(task.title),
      title: task.title,
      task_id: task.id,
      summary: task.summary || "",
      pbs_deliverable_ref: task.pbsDeliverableRef || "",
      pdp_stage_ref: task.pdpStageRef || "",
      dependencies: task.dependencies || [],
      project_id: proj?.id,
      github_config: githubConf,
    };

    executeWbsTaskStream(
      payload,
      (logChunk) => {
        setExecLogs((prev) => prev + logChunk);
      },
      (result) => {
        setExecResult(result);
        setExecLoading(false);
        if (result && result.logs && result.logs.length > execLogs.length) {
          setExecLogs(result.logs);
        }
        if (result && result.success) {
          toast.success(
            result.pr_info?.html_url
              ? `Task verified against DoD & Pull Request #${result.pr_info.number} created!`
              : "Task automated tests passed cleanly in Sandbox!",
          );
          updateTask(
            task.id,
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
            proj?.id,
          );
          setTasks(getProjectTasks(proj?.id));
        } else {
          toast.error("Task execution completed with errors.");
          updateTask(
            task.id,
            {
              execution: {
                status: "failed",
                branch: result?.feature_branch,
                tests_passed: false,
                updated_at: Date.now(),
              },
            },
            proj?.id,
          );
          setTasks(getProjectTasks(proj?.id));
        }
      },
      (err) => {
        setExecLoading(false);
        setExecResult({
          success: false,
          error: err.message,
        });
        setExecLogs((prev) => prev + `\n[ERROR]: ${err.message}\n`);
        toast.error(`Execution error: ${err.message}`);
      },
    );
  };

  const handleSendExecInstruction = async () => {
    if (
      !execFollowUp.trim() ||
      !execResult ||
      !execResult.sandbox_id ||
      isSendingExecInstruction ||
      execLoading
    ) {
      return;
    }
    const promptToSend = execFollowUp.trim();
    setExecFollowUp("");
    setIsSendingExecInstruction(true);

    const marker = `\n\n========================================\n>>> User Instruction: ${promptToSend}\n========================================\n`;
    setExecLogs((prev) => prev + marker);

    sendDevelopmentInstructionStream(
      execResult.sandbox_id,
      promptToSend,
      (logChunk) => {
        setExecLogs((prev) => prev + logChunk);
      },
      (result) => {
        setIsSendingExecInstruction(false);
        if (result) {
          setExecResult((prev) => ({
            ...prev,
            ...result,
          }));
          if (result.logs && result.logs.length > execLogs.length) {
            setExecLogs(result.logs);
          }
        }
        toast.success("Instruction executed in sandbox!");
      },
      (err) => {
        setIsSendingExecInstruction(false);
        setExecLogs((prev) => prev + `\n[ERROR]: ${err.message}\n`);
        toast.error(`Instruction error: ${err.message}`);
      },
    );
  };

  const handleRunSelectedWave = async () => {
    if (selectedWave === "ALL") return;
    setIsRunningWave(true);
    const proj = getActiveProject();
    try {
      toast.info(`Launching parallel wave execution for "${selectedWave}"...`);
      const res = await executeWbsWave({
        wave_name: selectedWave,
        project_id: proj?.id,
        tasks: tasks,
        max_workers: 3,
      });
      toast.success(
        `Wave "${selectedWave}" completed: ${res.successful_tasks}/${res.total_tasks} tasks verified!`,
      );
      setTasks(getProjectTasks(proj?.id));
    } catch (err) {
      toast.error(`Wave execution failed: ${err.message}`);
    } finally {
      setIsRunningWave(false);
    }
  };

  const openAddModal = () => {
    setEditingTask(null);
    setFormTitle("");
    setFormStatus("backlog");
    setFormSummary("");
    setFormWbsLevel("Work Package");
    setFormWbsCode("");
    setFormPbsRef("");
    setFormPdpRef("");
    setFormDependencies([]);
    setFormIsCriticalPath(false);
    setFormParallelGroup("");
    setFormHitlRequired(false);
    setFormHitlReason("");
    setIsAddModalOpen(true);
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setFormTitle(task.title || "");
    setFormStatus(task.status || "backlog");
    setFormSummary(task.summary || "");
    setFormWbsLevel(task.wbsLevel || "Work Package");
    setFormWbsCode(task.wbsCode || extractWbsCode(task.title));
    setFormPbsRef(task.pbsDeliverableRef || "");
    setFormPdpRef(task.pdpStageRef || "");
    setFormDependencies(
      Array.isArray(task.dependencies) ? task.dependencies : [],
    );
    setFormIsCriticalPath(Boolean(task.isCriticalPath));
    setFormParallelGroup(task.parallelGroup || "");
    setFormHitlRequired(Boolean(task.hitl?.required));
    setFormHitlReason(task.hitl?.reason || "");
    setIsAddModalOpen(true);
  };

  const handleSaveForm = () => {
    if (!formTitle.trim()) {
      toast.error("Please enter a task title");
      return;
    }

    const taskPayload = {
      title: formTitle.trim(),
      status: formStatus,
      summary: formSummary,
      wbsLevel: formWbsLevel,
      wbsCode: formWbsCode.trim(),
      pbsDeliverableRef: formPbsRef,
      pdpStageRef: formPdpRef,
      dependencies: formDependencies,
      isCriticalPath: formIsCriticalPath,
      parallelGroup: formParallelGroup.trim(),
      hitl: {
        required: formHitlRequired,
        reason: formHitlReason,
      },
    };

    if (editingTask) {
      updateTask(editingTask.id, taskPayload, activeProject?.id);
      toast.success("Task updated");
    } else {
      createTask(taskPayload, activeProject?.id);
      toast.success("Task created");
    }

    setTasks(getProjectTasks(activeProject?.id));
    setIsAddModalOpen(false);
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterHitlOnly && !task.hitl?.required) return false;
      if (filterReadyOnly && !taskDependencyMap[task.id]?.isReady) return false;
      if (filterCriticalOnly && !task.isCriticalPath) return false;
      if (
        selectedWave !== "ALL" &&
        (task.parallelGroup || "").trim() !== selectedWave
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = task.title?.toLowerCase().includes(q);
        const matchesSummary = task.summary?.toLowerCase().includes(q);
        const matchesPbs = task.pbsDeliverableRef?.toLowerCase().includes(q);
        const matchesCode = (task.wbsCode || "").toLowerCase().includes(q);
        const matchesWave = (task.parallelGroup || "")
          .toLowerCase()
          .includes(q);
        return (
          matchesTitle ||
          matchesSummary ||
          matchesPbs ||
          matchesCode ||
          matchesWave
        );
      }
      return true;
    });
  }, [
    tasks,
    searchQuery,
    filterHitlOnly,
    filterReadyOnly,
    filterCriticalOnly,
    selectedWave,
    taskDependencyMap,
  ]);

  const taskCounts = useMemo(() => {
    const counts = {
      total: tasks.length,
      backlog: 0,
      in_progress: 0,
      needs_review: 0,
      done: 0,
      hitl: 0,
      ready: 0,
      critical: 0,
    };
    tasks.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++;
      }
      if (t.hitl?.required) {
        counts.hitl++;
      }
      if (taskDependencyMap[t.id]?.isReady) {
        counts.ready++;
      }
      if (t.isCriticalPath) {
        counts.critical++;
      }
    });
    return counts;
  }, [tasks, taskDependencyMap]);

  const dependencyOptions = useMemo(() => {
    return tasks
      .filter((t) => !editingTask || t.id !== editingTask.id)
      .map((t) => {
        const code = t.wbsCode || extractWbsCode(t.title);
        const val = code || t.id;
        return {
          label: code ? `[${code}] ${t.title}` : t.title,
          value: val,
        };
      });
  }, [tasks, editingTask]);

  return (
    <div
      style={{ padding: "24px 32px", minHeight: "100%", background: "#f8fafc" }}
    >
      <Head>
        <title>Tasks - Kanban Board | Haiven</title>
      </Head>

      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "20px",
          paddingBottom: "16px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <RiKanbanView2 style={{ fontSize: "1.8rem", color: "#003d4f" }} />
            <h1
              style={{
                margin: 0,
                fontSize: "1.6rem",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Tasks
            </h1>
            <Tag
              color="blue"
              style={{ fontSize: "0.85rem", padding: "2px 8px" }}
            >
              {activeProject?.name || "Default Project"}
            </Tag>
          </div>
          <p
            style={{
              margin: "4px 0 0 0",
              color: "#64748b",
              fontSize: "0.95rem",
            }}
          >
            Visualise backlog deliverables, track task execution, and manage
            Human-in-the-Loop reviews.
          </p>
        </div>

        {/* Header Action Controls */}
        <Space size="middle" wrap>
          <Input.Search
            placeholder="Search tasks, WBS, waves..."
            allowClear
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 190 }}
          />
          <Button
            type={filterReadyOnly ? "primary" : "default"}
            icon={<RiCheckFill />}
            onClick={() => setFilterReadyOnly(!filterReadyOnly)}
            style={
              filterReadyOnly
                ? { background: "#16a34a", borderColor: "#16a34a" }
                : {}
            }
          >
            Ready (Parallel){" "}
            {taskCounts.ready > 0 ? `(${taskCounts.ready})` : ""}
          </Button>
          <Button
            type={filterCriticalOnly ? "primary" : "default"}
            icon={<RiFireLine />}
            onClick={() => setFilterCriticalOnly(!filterCriticalOnly)}
            style={
              filterCriticalOnly
                ? { background: "#dc2626", borderColor: "#dc2626" }
                : {}
            }
          >
            Critical Path{" "}
            {taskCounts.critical > 0 ? `(${taskCounts.critical})` : ""}
          </Button>
          {availableWaves.length > 0 && (
            <Select
              value={selectedWave}
              onChange={setSelectedWave}
              style={{ width: 160 }}
              options={[
                { label: "All Waves", value: "ALL" },
                ...availableWaves.map((w) => ({ label: `🌊 ${w}`, value: w })),
              ]}
            />
          )}
          {availableWaves.length > 0 && selectedWave !== "ALL" && (
            <Button
              type="primary"
              icon={<RiPlayCircleLine />}
              onClick={handleRunSelectedWave}
              loading={isRunningWave}
              style={{ background: "#722ed1", borderColor: "#722ed1" }}
            >
              Run Wave
            </Button>
          )}
          <Button
            type={filterHitlOnly ? "primary" : "default"}
            icon={<RiAlertFill />}
            onClick={() => setFilterHitlOnly(!filterHitlOnly)}
            style={
              filterHitlOnly
                ? { background: "#d97706", borderColor: "#d97706" }
                : {}
            }
          >
            HITL Only {taskCounts.hitl > 0 ? `(${taskCounts.hitl})` : ""}
          </Button>
          <Tooltip title="Auto-ingest newly generated WBS work package cards into Backlog">
            <Button icon={<RiRefreshLine />} onClick={handleManualSync}>
              Sync WBS
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<RiAddLine />}
            onClick={openAddModal}
            style={{ background: "#003d4f", borderColor: "#003d4f" }}
          >
            Add Task
          </Button>
        </Space>
      </div>

      {/* Kanban Board Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(280px, 1fr))",
          gap: "16px",
          alignItems: "start",
          minHeight: "calc(100vh - 280px)",
        }}
      >
        {COLUMNS.map((column) => {
          const columnTasks = filteredTasks.filter(
            (t) => t.status === column.id,
          );
          const isOver = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
              style={{
                background: isOver ? "#e0f2fe" : column.bgColor,
                border: `1.5px ${isOver ? "dashed #0284c7" : "solid " + column.borderColor}`,
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                minHeight: "450px",
                maxHeight: "calc(100vh - 220px)",
                transition: "all 0.2s ease",
              }}
            >
              {/* Column Header */}
              <div
                style={{
                  padding: "12px 14px",
                  background: column.headerBg,
                  borderBottom: `1px solid ${column.borderColor}`,
                  borderTopLeftRadius: "7px",
                  borderTopRightRadius: "7px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{
                      fontWeight: 700,
                      color: column.color,
                      fontSize: "0.95rem",
                    }}
                  >
                    {column.title}
                  </span>
                  <Tooltip title={column.description}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748b",
                        marginLeft: "6px",
                        cursor: "help",
                      }}
                    >
                      ⓘ
                    </span>
                  </Tooltip>
                </div>
                <Badge
                  count={columnTasks.length}
                  style={{
                    backgroundColor: column.color,
                    boxShadow: "none",
                    fontWeight: 600,
                  }}
                />
              </div>

              {/* Column Body / Drop Zone */}
              <div
                style={{
                  padding: "12px",
                  overflowY: "auto",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {columnTasks.length === 0 ? (
                  <div
                    style={{
                      height: "100%",
                      minHeight: "120px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#94a3b8",
                      fontSize: "0.85rem",
                      fontStyle: "italic",
                    }}
                  >
                    Drop tasks here
                  </div>
                ) : (
                  columnTasks.map((task) => {
                    const depInfo = taskDependencyMap[task.id];
                    return (
                      <Card
                        key={task.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setIsDetailDrawerOpen(true);
                        }}
                        hoverable
                        styles={{ body: { padding: "12px" } }}
                        style={{
                          cursor: "grab",
                          borderRadius: "6px",
                          borderLeft: task.hitl?.required
                            ? "4px solid #d97706"
                            : depInfo?.isBlocked && task.status !== "done"
                              ? "4px solid #f43f5e"
                              : `4px solid ${column.color}`,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                          background: "#ffffff",
                          transition:
                            "transform 0.15s ease, box-shadow 0.15s ease",
                        }}
                      >
                        {/* Top Badges */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "6px",
                          }}
                        >
                          <Space size={4} wrap>
                            {task.source === "wbs_sync" ? (
                              <Tag
                                color="cyan"
                                style={{ fontSize: "0.7rem", margin: 0 }}
                              >
                                WBS
                              </Tag>
                            ) : (
                              <Tag
                                color="default"
                                style={{ fontSize: "0.7rem", margin: 0 }}
                              >
                                Custom
                              </Tag>
                            )}
                            {task.wbsCode && (
                              <Tag
                                color="blue"
                                style={{
                                  fontSize: "0.7rem",
                                  margin: 0,
                                  fontWeight: 600,
                                }}
                              >
                                {task.wbsCode}
                              </Tag>
                            )}
                            {task.isCriticalPath && (
                              <Tag
                                color="red"
                                style={{
                                  fontSize: "0.7rem",
                                  margin: 0,
                                  fontWeight: 700,
                                }}
                              >
                                🔥 Critical
                              </Tag>
                            )}
                            {task.parallelGroup && (
                              <Tag
                                color="geekblue"
                                style={{ fontSize: "0.7rem", margin: 0 }}
                              >
                                🌊 {task.parallelGroup}
                              </Tag>
                            )}
                            {task.pbsDeliverableRef && (
                              <Tag
                                color="purple"
                                style={{ fontSize: "0.7rem", margin: 0 }}
                              >
                                {task.pbsDeliverableRef.split(":")[0]}
                              </Tag>
                            )}
                          </Space>

                          {/* Card Quick Actions Menu */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <Dropdown
                              menu={{
                                items: [
                                  {
                                    key: "backlog",
                                    label: "Move to Backlog",
                                    disabled: task.status === "backlog",
                                    onClick: () =>
                                      handleMoveStatus(task, "backlog"),
                                  },
                                  {
                                    key: "in_progress",
                                    label: "Move to In Progress",
                                    disabled: task.status === "in_progress",
                                    onClick: () =>
                                      handleMoveStatus(task, "in_progress"),
                                  },
                                  {
                                    key: "needs_review",
                                    label: "Flag for Review / HITL",
                                    disabled: task.status === "needs_review",
                                    onClick: () =>
                                      handleMoveStatus(task, "needs_review"),
                                  },
                                  {
                                    key: "done",
                                    label: "Mark as Done",
                                    disabled: task.status === "done",
                                    onClick: () =>
                                      handleMoveStatus(task, "done"),
                                  },
                                  { type: "divider" },
                                  {
                                    key: "execute_sandbox",
                                    icon: <RiCodeBoxLine style={{ color: "#722ed1" }} />,
                                    label: "Execute in Sandbox",
                                    onClick: () => handleExecuteTask(task),
                                  },
                                  { type: "divider" },
                                  {
                                    key: "edit",
                                    icon: <RiEditLine />,
                                    label: "Edit Task",
                                    onClick: () => openEditModal(task),
                                  },
                                  {
                                    key: "delete",
                                    icon: <RiDeleteBinLine />,
                                    label: "Delete",
                                    danger: true,
                                    onClick: () => handleDelete(task.id),
                                  },
                                ],
                              }}
                              trigger={["click"]}
                            >
                              <Button
                                type="text"
                                size="small"
                                icon={
                                  <RiMore2Fill
                                    style={{
                                      fontSize: "1rem",
                                      color: "#94a3b8",
                                    }}
                                  />
                                }
                                style={{
                                  width: "24px",
                                  height: "24px",
                                  padding: 0,
                                }}
                              />
                            </Dropdown>
                          </div>
                        </div>

                        {/* Task Title */}
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "0.9rem",
                            color: "#1e293b",
                            lineHeight: "1.3",
                            marginBottom: "8px",
                          }}
                        >
                          {task.title}
                        </div>

                        {/* HITL Alert Badge if required */}
                        {task.hitl?.required && (
                          <div
                            style={{
                              background: "#fef3c7",
                              border: "1px solid #fde68a",
                              borderRadius: "4px",
                              padding: "4px 8px",
                              marginBottom: "8px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              fontSize: "0.75rem",
                              color: "#92400e",
                              fontWeight: 500,
                            }}
                          >
                            <RiAlertFill
                              style={{ fontSize: "0.85rem", color: "#d97706" }}
                            />
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {task.hitl.reason || "Human Review Required"}
                            </span>
                          </div>
                        )}

                        {/* Dependency & Readiness Status Indicator */}
                        {task.status !== "done" &&
                          (depInfo?.isBlocked ? (
                            <div
                              style={{
                                background: "#fff1f2",
                                border: "1px solid #fecdd3",
                                borderRadius: "4px",
                                padding: "3px 6px",
                                marginBottom: "8px",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                fontSize: "0.75rem",
                                color: "#be123c",
                                fontWeight: 500,
                              }}
                            >
                              <RiAlertFill
                                style={{
                                  fontSize: "0.85rem",
                                  color: "#e11d48",
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Blocked by:{" "}
                                {depInfo.unresolvedPrereqs
                                  .map((p) => `WBS ${p.code}`)
                                  .join(", ")}
                              </span>
                            </div>
                          ) : task.status === "backlog" && depInfo?.isReady ? (
                            <div
                              style={{
                                background: "#f0fdf4",
                                border: "1px solid #bbf7d0",
                                borderRadius: "4px",
                                padding: "3px 6px",
                                marginBottom: "8px",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                fontSize: "0.75rem",
                                color: "#15803d",
                                fontWeight: 500,
                              }}
                            >
                              <RiCheckFill
                                style={{
                                  fontSize: "0.85rem",
                                  color: "#16a34a",
                                  flexShrink: 0,
                                }}
                              />
                              <span>Ready (Parallelizable)</span>
                            </div>
                          ) : null)}

                        {/* Execution Status / GitHub PR link */}
                        {task.execution && (
                          <div
                            style={{
                              marginBottom: "8px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              flexWrap: "wrap",
                            }}
                          >
                            {task.execution.issue_url && (
                              <a
                                href={task.execution.issue_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Tag
                                  color="geekblue"
                                  icon={<RiGithubFill />}
                                  style={{ cursor: "pointer", margin: 0, fontWeight: 500 }}
                                >
                                  Issue #{task.execution.issue_number}
                                </Tag>
                              </a>
                            )}
                            {task.execution.pr_url ? (
                              <a
                                href={task.execution.pr_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Tag
                                  color="green"
                                  icon={<RiGithubFill />}
                                  style={{ cursor: "pointer", margin: 0, fontWeight: 600 }}
                                >
                                  PR #{task.execution.pr_number || "Open"}
                                </Tag>
                              </a>
                            ) : task.execution.status === "failed" ? (
                              <Tag color="red" style={{ margin: 0 }}>
                                Tests Failed
                              </Tag>
                            ) : task.execution.status === "success" ? (
                              <Tag color="blue" style={{ margin: 0 }}>
                                DoD Verified
                              </Tag>
                            ) : null}
                          </div>
                        )}

                        {/* Footer Info */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: "0.75rem",
                            color: "#64748b",
                            borderTop: "1px solid #f1f5f9",
                            paddingTop: "6px",
                            marginTop: "4px",
                          }}
                        >
                          <Space size={6}>
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <RiTimeLine style={{ fontSize: "0.8rem" }} />
                              {task.wbsLevel || "Work Package"}
                            </span>
                            {depInfo?.downstream?.length > 0 && (
                              <Tag
                                color="purple"
                                style={{
                                  fontSize: "0.65rem",
                                  padding: "0 4px",
                                  margin: 0,
                                }}
                              >
                                Blocks {depInfo.downstream.length}
                              </Tag>
                            )}
                          </Space>
                          <Space size={4}>
                            <Button
                              type="primary"
                              size="small"
                              icon={<RiPlayCircleLine />}
                              style={{
                                padding: "0 8px",
                                fontSize: "0.72rem",
                                height: "22px",
                                background: "#722ed1",
                                borderColor: "#722ed1",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExecuteTask(task);
                              }}
                            >
                              Execute
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              style={{
                                padding: 0,
                                fontSize: "0.75rem",
                                height: "auto",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTaskId(task.id);
                                setIsDetailDrawerOpen(true);
                              }}
                            >
                              Details
                            </Button>
                          </Space>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Detail Drawer */}
      <Drawer
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>
              {selectedTask?.title}
            </span>
            <Tag
              color={COLUMNS.find((c) => c.id === selectedTask?.status)?.color}
              style={{ fontWeight: 600 }}
            >
              {COLUMNS.find((c) => c.id === selectedTask?.status)?.title}
            </Tag>
          </div>
        }
        placement="right"
        width={680}
        onClose={() => {
          setIsDetailDrawerOpen(false);
          setSelectedTaskId(null);
        }}
        open={isDetailDrawerOpen && Boolean(selectedTask)}
        destroyOnClose={true}
        extra={
          <Space>
            <Button
              type="primary"
              icon={<RiPlayCircleLine />}
              style={{ background: "#722ed1", borderColor: "#722ed1" }}
              onClick={() => handleExecuteTask(selectedTask)}
            >
              Execute in Sandbox
            </Button>
            <Button
              icon={<RiEditLine />}
              onClick={() => openEditModal(selectedTask)}
            >
              Edit
            </Button>
            <Button
              danger
              icon={<RiDeleteBinLine />}
              onClick={() => handleDelete(selectedTask?.id)}
            >
              Delete
            </Button>
          </Space>
        }
      >
        {selectedTask && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            {/* Human-in-the-Loop Review Banner */}
            <div
              style={{
                background: selectedTask.hitl?.required ? "#fffbeb" : "#f8fafc",
                border: `1.5px solid ${selectedTask.hitl?.required ? "#fde68a" : "#e2e8f0"}`,
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: selectedTask.hitl?.required ? "12px" : "0",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <RiShieldCheckLine
                    style={{
                      fontSize: "1.3rem",
                      color: selectedTask.hitl?.required
                        ? "#d97706"
                        : "#64748b",
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        color: "#1e293b",
                      }}
                    >
                      Human-in-the-Loop (HITL) Status
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      Flag this work item if human review, design sign-off, or
                      intervention is needed.
                    </div>
                  </div>
                </div>
                <Switch
                  checked={Boolean(selectedTask.hitl?.required)}
                  onChange={(checked) =>
                    handleToggleHitl(selectedTask, checked)
                  }
                />
              </div>

              {selectedTask.hitl?.required && (
                <div
                  style={{
                    marginTop: "12px",
                    borderTop: "1px dashed #fde68a",
                    paddingTop: "12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "#92400e",
                      marginBottom: "6px",
                    }}
                  >
                    Reason / Human Attention Required:
                  </div>
                  <Input.TextArea
                    rows={2}
                    value={selectedTask.hitl?.reason || ""}
                    placeholder="Describe what human review or input is required..."
                    onChange={(e) => {
                      const reason = e.target.value;
                      updateTask(
                        selectedTask.id,
                        { hitl: { ...selectedTask.hitl, reason } },
                        activeProject?.id,
                      );
                      setTasks(getProjectTasks(activeProject?.id));
                    }}
                  />
                  <div
                    style={{ marginTop: "10px", display: "flex", gap: "8px" }}
                  >
                    <Button
                      size="small"
                      type="primary"
                      style={{ background: "#16a34a", borderColor: "#16a34a" }}
                      icon={<RiCheckFill />}
                      onClick={() => {
                        handleToggleHitl(selectedTask, false);
                        handleMoveStatus(selectedTask, "done");
                        toast.success("Approved and marked Done!");
                      }}
                    >
                      Approve & Mark Done
                    </Button>
                    <Button
                      size="small"
                      onClick={() => handleToggleHitl(selectedTask, false)}
                    >
                      Clear Flag
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick State Transition Actions */}
            <div
              style={{
                background: "#ffffff",
                padding: "14px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "#475569",
                  marginBottom: "10px",
                }}
              >
                Workflow State Transitions
              </div>
              <Space wrap>
                {COLUMNS.map((col) => (
                  <Button
                    key={col.id}
                    size="small"
                    type={
                      selectedTask.status === col.id ? "primary" : "default"
                    }
                    style={
                      selectedTask.status === col.id
                        ? { background: col.color, borderColor: col.color }
                        : {}
                    }
                    onClick={() => handleMoveStatus(selectedTask, col.id)}
                  >
                    {col.title}
                  </Button>
                ))}
              </Space>
            </div>

            {/* Deliverable Metadata Badges */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
              }}
            >
              {selectedTask.wbsCode && (
                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>WBS Code</div>
                  <div style={metaValueStyle}>{selectedTask.wbsCode}</div>
                </div>
              )}
              {selectedTask.pbsDeliverableRef && (
                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>PBS Deliverable Ref</div>
                  <div style={metaValueStyle}>
                    {selectedTask.pbsDeliverableRef}
                  </div>
                </div>
              )}
              {selectedTask.pdpStageRef && (
                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>PDP Stage Ref</div>
                  <div style={metaValueStyle}>{selectedTask.pdpStageRef}</div>
                </div>
              )}
              {selectedTask.wbsLevel && (
                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>WBS Level</div>
                  <div style={metaValueStyle}>{selectedTask.wbsLevel}</div>
                </div>
              )}
              {selectedTask.source && (
                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>Source Origin</div>
                  <div style={metaValueStyle}>
                    {selectedTask.source === "wbs_sync"
                      ? "WBS Automatic Ingestion"
                      : "Manual Authoring"}
                  </div>
                </div>
              )}
            </div>

            {/* Task Dependencies, Execution Wave & Critical Path */}
            <div
              style={{
                background: "#ffffff",
                padding: "16px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                  borderBottom: "1px solid #f1f5f9",
                  paddingBottom: "8px",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "0.95rem",
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <RiGitMergeLine
                    style={{ color: "#2563eb", fontSize: "1.1rem" }}
                  />
                  Dependencies & Critical Path
                </h3>
                <Space size={4} wrap>
                  {selectedTask.isCriticalPath ? (
                    <Tag color="red" style={{ fontWeight: 700 }}>
                      🔥 Critical Path (Zero Float)
                    </Tag>
                  ) : (
                    <Tag color="default">Standard Path</Tag>
                  )}
                  {selectedTask.parallelGroup && (
                    <Tag color="geekblue">🌊 {selectedTask.parallelGroup}</Tag>
                  )}
                </Space>
              </div>

              {/* Prerequisites Section */}
              <div style={{ marginBottom: "14px" }}>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#475569",
                    marginBottom: "6px",
                  }}
                >
                  Prerequisites (Upstream Tasks):
                </div>
                {!selectedTask.dependencies ||
                selectedTask.dependencies.length === 0 ? (
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "#166534",
                      background: "#f0fdf4",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #bbf7d0",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <RiCheckFill
                      style={{ fontSize: "1rem", color: "#16a34a" }}
                    />
                    <span>
                      No prerequisites — Root deliverable ready for immediate,
                      parallel agent assignment.
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {taskDependencyMap[selectedTask.id]?.unresolvedPrereqs.map(
                      (p) => (
                        <div
                          key={p.code}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 10px",
                            background: "#fff1f2",
                            border: "1px solid #fecdd3",
                            borderRadius: "4px",
                            fontSize: "0.82rem",
                          }}
                        >
                          <span style={{ fontWeight: 600, color: "#9f1239" }}>
                            WBS {p.code}
                            {p.task
                              ? `: ${p.task.title}`
                              : " (External / Not Ingested)"}
                          </span>
                          <Tag color="error">
                            {p.task
                              ? `Pending (${COLUMNS.find((c) => c.id === p.task.status)?.title || p.task.status})`
                              : "Unresolved"}
                          </Tag>
                        </div>
                      ),
                    )}
                    {taskDependencyMap[selectedTask.id]?.resolvedPrereqs.map(
                      (p) => (
                        <div
                          key={p.code}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 10px",
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            borderRadius: "4px",
                            fontSize: "0.82rem",
                          }}
                        >
                          <span style={{ color: "#166534" }}>
                            WBS {p.code}
                            {p.task ? `: ${p.task.title}` : ""}
                          </span>
                          <Tag color="success">Done</Tag>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>

              {/* Downstream Tasks Section */}
              <div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#475569",
                    marginBottom: "6px",
                  }}
                >
                  Downstream Dependents (Tasks waiting on this work package):
                </div>
                {!taskDependencyMap[selectedTask.id]?.downstream ||
                taskDependencyMap[selectedTask.id].downstream.length === 0 ? (
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "#64748b",
                      fontStyle: "italic",
                    }}
                  >
                    No other tasks currently blocked by this work package.
                  </div>
                ) : (
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                  >
                    {taskDependencyMap[selectedTask.id].downstream.map(
                      (down) => (
                        <Tag key={down.id} color="purple">
                          {down.wbsCode ? `[${down.wbsCode}] ` : ""}
                          {down.title} (
                          {COLUMNS.find((c) => c.id === down.status)?.title ||
                            down.status}
                          )
                        </Tag>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Scope, DoD, PERT, and Breakdown Content */}
            {selectedTask.summary ? (
              <div
                style={{
                  background: "#ffffff",
                  padding: "18px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "1rem",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "8px",
                  }}
                >
                  Detailed Work Breakdown & Scope
                </h3>
                <MarkdownRenderer content={selectedTask.summary} />
              </div>
            ) : (
              <Empty description="No scope or summary details provided for this task." />
            )}
          </div>
        )}
      </Drawer>

      {/* Add / Edit Task Modal */}
      <Modal
        title={editingTask ? "Edit Task" : "Create New Task"}
        open={isAddModalOpen}
        onOk={handleSaveForm}
        onCancel={() => setIsAddModalOpen(false)}
        okText={editingTask ? "Save Changes" : "Create Task"}
        okButtonProps={{
          style: { background: "#003d4f", borderColor: "#003d4f" },
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            marginTop: "16px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontWeight: 600,
                fontSize: "0.85rem",
                marginBottom: "4px",
              }}
            >
              Task Title *
            </label>
            <Input
              placeholder="e.g. WBS 2.1.3: Develop Offline Storage Engine"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  marginBottom: "4px",
                }}
              >
                WBS Code
              </label>
              <Input
                placeholder="e.g. 2.1.3"
                value={formWbsCode}
                onChange={(e) => setFormWbsCode(e.target.value)}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  marginBottom: "4px",
                }}
              >
                Parallel Execution Wave / Track
              </label>
              <Input
                placeholder="e.g. Wave 1 - Foundation"
                value={formParallelGroup}
                onChange={(e) => setFormParallelGroup(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  marginBottom: "4px",
                }}
              >
                Column / Status
              </label>
              <Select
                value={formStatus}
                onChange={setFormStatus}
                style={{ width: "100%" }}
                options={COLUMNS.map((c) => ({ label: c.title, value: c.id }))}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  marginBottom: "4px",
                }}
              >
                WBS Level
              </label>
              <Input
                placeholder="Level 3 - Work Package"
                value={formWbsLevel}
                onChange={(e) => setFormWbsLevel(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontWeight: 600,
                fontSize: "0.85rem",
                marginBottom: "4px",
              }}
            >
              Prerequisites / Upstream Dependencies
            </label>
            <Select
              mode="tags"
              placeholder="Select existing task or enter WBS code..."
              value={formDependencies}
              onChange={setFormDependencies}
              style={{ width: "100%" }}
              options={dependencyOptions}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  marginBottom: "4px",
                }}
              >
                PBS Deliverable Ref
              </label>
              <Input
                placeholder="e.g. PBS 1.2: Client Cache"
                value={formPbsRef}
                onChange={(e) => setFormPbsRef(e.target.value)}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  marginBottom: "4px",
                }}
              >
                PDP Stage Ref
              </label>
              <Input
                placeholder="e.g. PDP Stage 3: Core Service"
                value={formPdpRef}
                onChange={(e) => setFormPdpRef(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              background: "#f8fafc",
              padding: "10px 12px",
              borderRadius: "6px",
              border: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    color: "#1e293b",
                  }}
                >
                  🔥 Critical Path Work Item
                </span>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  Directly affects minimum project timeline (zero float).
                </div>
              </div>
              <Switch
                checked={formIsCriticalPath}
                onChange={setFormIsCriticalPath}
              />
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontWeight: 600,
                fontSize: "0.85rem",
                marginBottom: "4px",
              }}
            >
              Scope, Completion Criteria & PERT (Markdown)
            </label>
            <Input.TextArea
              rows={4}
              placeholder="**Scope of Work & Deliverable Outcome**:\n- Activities...\n\n**Time & Effort Estimation (Three-Point PERT)**: ..."
              value={formSummary}
              onChange={(e) => setFormSummary(e.target.value)}
            />
          </div>

          <div
            style={{
              background: "#f8fafc",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                Requires Human-in-the-Loop Review (HITL)
              </span>
              <Switch
                checked={formHitlRequired}
                onChange={setFormHitlRequired}
              />
            </div>
            {formHitlRequired && (
              <div style={{ marginTop: "8px" }}>
                <Input
                  placeholder="Reason for requiring human review..."
                  value={formHitlReason}
                  onChange={(e) => setFormHitlReason(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal for Blocked Task Move */}
      <Modal
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#b45309",
            }}
          >
            <RiAlertFill style={{ fontSize: "1.3rem", color: "#d97706" }} />
            <span>Prerequisites Not Completed</span>
          </div>
        }
        open={Boolean(pendingMove)}
        onOk={() => {
          if (pendingMove) {
            executeMove(pendingMove.task, pendingMove.targetStatus);
            setPendingMove(null);
          }
        }}
        onCancel={() => setPendingMove(null)}
        okText="Proceed to In Progress"
        cancelText="Keep in Backlog"
        okButtonProps={{
          style: { background: "#d97706", borderColor: "#d97706" },
        }}
      >
        {pendingMove && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#334155" }}>
              Task <strong>"{pendingMove.task.title}"</strong> has unresolved
              prerequisite work package(s):
            </p>
            <div
              style={{
                background: "#fffbeb",
                padding: "10px",
                borderRadius: "6px",
                border: "1px solid #fde68a",
              }}
            >
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "20px",
                  fontSize: "0.85rem",
                  color: "#92400e",
                }}
              >
                {pendingMove.unresolvedPrereqs.map((p) => (
                  <li key={p.code}>
                    <strong>WBS {p.code}</strong>
                    {p.task
                      ? ` (${p.task.title} - Status: ${COLUMNS.find((c) => c.id === p.task.status)?.title || p.task.status})`
                      : " (External / Not Ingested)"}
                  </li>
                ))}
              </ul>
            </div>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
              Assigning agents or starting this task before prerequisites finish
              may cause integration conflicts or rework. Do you want to proceed
              anyway?
            </p>
          </div>
        )}
      </Modal>

      {/* WBS Sandbox Code Execution Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <RiCodeBoxLine style={{ color: "#722ed1", fontSize: "1.2rem" }} />
            <span>
              WBS Code Execution:{" "}
              {executingTask?.title || "Task"}
            </span>
            {execLoading && <Spin size="small" />}
          </div>
        }
        open={execModalVisible}
        onCancel={() => setExecModalVisible(false)}
        footer={null}
        width={820}
        destroyOnClose
      >
        <div style={{ marginTop: "12px" }}>
          {execResult && (
            <div style={{ marginBottom: "16px" }}>
              <Space wrap style={{ marginBottom: "8px" }}>
                <Tag color={execResult.success ? "success" : "error"}>
                  {execResult.success
                    ? "DoD VERIFIED & TESTS PASSED"
                    : "TESTS / BUILD FAILED"}
                </Tag>
                {execResult.feature_branch && (
                  <Tag color="purple">Branch: {execResult.feature_branch}</Tag>
                )}
                {execResult.sandbox_id && (
                  <Tag>Sandbox: {execResult.sandbox_id}</Tag>
                )}
              </Space>

              {execResult.pr_info?.html_url && (
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
                        {execResult.issue_info?.html_url && (
                          <Button
                            icon={<RiGithubFill />}
                            href={execResult.issue_info.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Issue #{execResult.issue_info.number}
                          </Button>
                        )}
                        <Button
                          type="primary"
                          icon={<RiGithubFill />}
                          href={execResult.pr_info.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ background: "#24292f" }}
                        >
                          View Pull Request #{execResult.pr_info.number}
                        </Button>
                      </Space>
                    </div>
                  }
                  style={{ marginBottom: "12px" }}
                />
              )}
            </div>
          )}

          {/* Interactive instruction to agent in sandbox */}
          {execResult && execResult.sandbox_id && (
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
                {isSendingExecInstruction && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#722ed1",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Spin size="small" /> Agent executing instruction...
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Input
                  placeholder="Send instructions to agent (e.g., 'Fix edge case in test', 'Update DDL column')..."
                  value={execFollowUp}
                  onChange={(e) => setExecFollowUp(e.target.value)}
                  onPressEnter={handleSendExecInstruction}
                  disabled={isSendingExecInstruction || execLoading}
                  style={{ flex: 1 }}
                />
                <Button
                  type="primary"
                  icon={<RiSendPlaneFill />}
                  loading={isSendingExecInstruction}
                  disabled={!execFollowUp.trim() || execLoading}
                  onClick={handleSendExecInstruction}
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
                {execLoading ? "Live Execution & Test Logs:" : "Execution & Test Logs:"}
              </h4>
              {execLoading && (
                <span style={{ fontSize: "12px", color: "#722ed1" }}>
                  Streaming output from Sandbox & Pi Agent...
                </span>
              )}
            </div>
            <pre
              ref={execLogsContainerRef}
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
              {execLogs || "Initializing execution..."}
            </pre>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const metaBoxStyle = {
  background: "#f8fafc",
  padding: "10px 12px",
  borderRadius: "6px",
  border: "1px solid #e2e8f0",
};

const metaLabelStyle = {
  fontSize: "0.75rem",
  color: "#64748b",
  textTransform: "uppercase",
  fontWeight: 600,
  marginBottom: "2px",
};

const metaValueStyle = {
  fontSize: "0.85rem",
  color: "#1e293b",
  fontWeight: 600,
  wordBreak: "break-word",
};
