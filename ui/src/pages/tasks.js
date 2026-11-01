// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import React, { useState, useEffect, useMemo, useCallback } from "react";
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
} from "../app/_local_store";
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

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find((t) => String(t.id) === String(selectedTaskId)) || null;
  }, [tasks, selectedTaskId]);

  // Form states for Add/Edit
  const [formTitle, setFormTitle] = useState("");
  const [formStatus, setFormStatus] = useState("backlog");
  const [formSummary, setFormSummary] = useState("");
  const [formWbsLevel, setFormWbsLevel] = useState("Work Package");
  const [formPbsRef, setFormPbsRef] = useState("");
  const [formPdpRef, setFormPdpRef] = useState("");
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

  const handleDrop = (e, targetColumnId) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    setDraggedTaskId(null);

    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetColumnId) return;

    // Moving to needs_review automatically flags HITL if not already flagged
    let hitlUpdate = task.hitl;
    if (targetColumnId === "needs_review" && !task.hitl?.required) {
      hitlUpdate = {
        required: true,
        reason: task.hitl?.reason || "Moved to Needs Review column for verification",
      };
    }

    updateTask(taskId, { status: targetColumnId, hitl: hitlUpdate }, activeProject?.id);
    setTasks(getProjectTasks(activeProject?.id));
    toast.info(`Moved "${task.title.slice(0, 30)}..." to ${COLUMNS.find((c) => c.id === targetColumnId)?.title}`);
  };

  const handleMoveStatus = (task, newStatus) => {
    let hitlUpdate = task.hitl;
    if (newStatus === "needs_review" && !task.hitl?.required) {
      hitlUpdate = {
        required: true,
        reason: task.hitl?.reason || "Flagged for Human-in-the-Loop review",
      };
    }
    updateTask(task.id, { status: newStatus, hitl: hitlUpdate }, activeProject?.id);
    setTasks(getProjectTasks(activeProject?.id));
  };

  const handleToggleHitl = (task, required, reason = "") => {
    const newStatus = required && task.status !== "needs_review" ? "needs_review" : task.status;
    const hitl = {
      required,
      reason: reason || (required ? "Requires human-in-the-loop sign-off" : ""),
    };
    updateTask(task.id, { hitl, status: newStatus }, activeProject?.id);
    setTasks(getProjectTasks(activeProject?.id));
    toast.success(required ? "Flagged for Human Review (HITL)" : "HITL Flag cleared");
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

  const openAddModal = () => {
    setEditingTask(null);
    setFormTitle("");
    setFormStatus("backlog");
    setFormSummary("");
    setFormWbsLevel("Work Package");
    setFormPbsRef("");
    setFormPdpRef("");
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
    setFormPbsRef(task.pbsDeliverableRef || "");
    setFormPdpRef(task.pdpStageRef || "");
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
      pbsDeliverableRef: formPbsRef,
      pdpStageRef: formPdpRef,
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
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = task.title?.toLowerCase().includes(q);
        const matchesSummary = task.summary?.toLowerCase().includes(q);
        const matchesPbs = task.pbsDeliverableRef?.toLowerCase().includes(q);
        return matchesTitle || matchesSummary || matchesPbs;
      }
      return true;
    });
  }, [tasks, searchQuery, filterHitlOnly]);

  const taskCounts = useMemo(() => {
    const counts = { total: tasks.length, backlog: 0, in_progress: 0, needs_review: 0, done: 0, hitl: 0 };
    tasks.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++;
      }
      if (t.hitl?.required) {
        counts.hitl++;
      }
    });
    return counts;
  }, [tasks]);

  return (
    <div style={{ padding: "24px 32px", minHeight: "100%", background: "#f8fafc" }}>
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
            <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 700, color: "#0f172a" }}>
              Tasks
            </h1>
            <Tag color="blue" style={{ fontSize: "0.85rem", padding: "2px 8px" }}>
              {activeProject?.name || "Default Project"}
            </Tag>
          </div>
          <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.95rem" }}>
            Visualise backlog deliverables, track task execution, and manage Human-in-the-Loop reviews.
          </p>
        </div>

        {/* Header Action Controls */}
        <Space size="middle">
          <Input.Search
            placeholder="Search tasks..."
            allowClear
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 220 }}
          />
          <Button
            type={filterHitlOnly ? "primary" : "default"}
            icon={<RiAlertFill />}
            onClick={() => setFilterHitlOnly(!filterHitlOnly)}
            style={filterHitlOnly ? { background: "#d97706", borderColor: "#d97706" } : {}}
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
          const columnTasks = filteredTasks.filter((t) => t.status === column.id);
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
                  <span style={{ fontWeight: 700, color: column.color, fontSize: "0.95rem" }}>
                    {column.title}
                  </span>
                  <Tooltip title={column.description}>
                    <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "6px", cursor: "help" }}>
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
                  columnTasks.map((task) => (
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
                          : `4px solid ${column.color}`,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                        background: "#ffffff",
                        transition: "transform 0.15s ease, box-shadow 0.15s ease",
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
                            <Tag color="cyan" style={{ fontSize: "0.7rem", margin: 0 }}>
                              WBS
                            </Tag>
                          ) : (
                            <Tag color="default" style={{ fontSize: "0.7rem", margin: 0 }}>
                              Custom
                            </Tag>
                          )}
                          {task.pbsDeliverableRef && (
                            <Tag color="purple" style={{ fontSize: "0.7rem", margin: 0 }}>
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
                                  onClick: () => handleMoveStatus(task, "backlog"),
                                },
                                {
                                  key: "in_progress",
                                  label: "Move to In Progress",
                                  disabled: task.status === "in_progress",
                                  onClick: () => handleMoveStatus(task, "in_progress"),
                                },
                                {
                                  key: "needs_review",
                                  label: "Flag for Review / HITL",
                                  disabled: task.status === "needs_review",
                                  onClick: () => handleMoveStatus(task, "needs_review"),
                                },
                                {
                                  key: "done",
                                  label: "Mark as Done",
                                  disabled: task.status === "done",
                                  onClick: () => handleMoveStatus(task, "done"),
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
                              icon={<RiMore2Fill style={{ fontSize: "1rem", color: "#94a3b8" }} />}
                              style={{ width: "24px", height: "24px", padding: 0 }}
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
                          <RiAlertFill style={{ fontSize: "0.85rem", color: "#d97706" }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {task.hitl.reason || "Human Review Required"}
                          </span>
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
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <RiTimeLine style={{ fontSize: "0.8rem" }} />
                          {task.wbsLevel || "Work Package"}
                        </span>
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, fontSize: "0.75rem", height: "auto" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTaskId(task.id);
                            setIsDetailDrawerOpen(true);
                          }}
                        >
                          View Details
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Detail Drawer */}
      <Drawer
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
            <Button icon={<RiEditLine />} onClick={() => openEditModal(selectedTask)}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <RiShieldCheckLine
                    style={{
                      fontSize: "1.3rem",
                      color: selectedTask.hitl?.required ? "#d97706" : "#64748b",
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "#1e293b" }}>
                      Human-in-the-Loop (HITL) Status
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      Flag this work item if human review, design sign-off, or intervention is needed.
                    </div>
                  </div>
                </div>
                <Switch
                  checked={Boolean(selectedTask.hitl?.required)}
                  onChange={(checked) => handleToggleHitl(selectedTask, checked)}
                />
              </div>

              {selectedTask.hitl?.required && (
                <div style={{ marginTop: "12px", borderTop: "1px dashed #fde68a", paddingTop: "12px" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#92400e", marginBottom: "6px" }}>
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
                        activeProject?.id
                      );
                      setTasks(getProjectTasks(activeProject?.id));
                    }}
                  />
                  <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
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
            <div style={{ background: "#ffffff", padding: "14px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "10px" }}>
                Workflow State Transitions
              </div>
              <Space wrap>
                {COLUMNS.map((col) => (
                  <Button
                    key={col.id}
                    size="small"
                    type={selectedTask.status === col.id ? "primary" : "default"}
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {selectedTask.pbsDeliverableRef && (
                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>PBS Deliverable Ref</div>
                  <div style={metaValueStyle}>{selectedTask.pbsDeliverableRef}</div>
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
                    {selectedTask.source === "wbs_sync" ? "WBS Automatic Ingestion" : "Manual Authoring"}
                  </div>
                </div>
              )}
            </div>

            {/* Scope, DoD, PERT, and Breakdown Content */}
            {selectedTask.summary ? (
              <div style={{ background: "#ffffff", padding: "18px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "1rem", color: "#0f172a", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
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
        okButtonProps={{ style: { background: "#003d4f", borderColor: "#003d4f" } }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px" }}>
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: "4px" }}>
              Task Title *
            </label>
            <Input
              placeholder="e.g. WBS 2.1.3: Develop Offline Storage Engine"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: "4px" }}>
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
              <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: "4px" }}>
                WBS Level
              </label>
              <Input
                placeholder="Level 3 - Work Package"
                value={formWbsLevel}
                onChange={(e) => setFormWbsLevel(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: "4px" }}>
                PBS Deliverable Ref
              </label>
              <Input
                placeholder="e.g. PBS 1.2: Client Cache"
                value={formPbsRef}
                onChange={(e) => setFormPbsRef(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: "4px" }}>
                PDP Stage Ref
              </label>
              <Input
                placeholder="e.g. PDP Stage 3: Core Service"
                value={formPdpRef}
                onChange={(e) => setFormPdpRef(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: "4px" }}>
              Scope, Completion Criteria & PERT (Markdown)
            </label>
            <Input.TextArea
              rows={4}
              placeholder="**Scope of Work & Deliverable Outcome**:\n- Activities...\n\n**Time & Effort Estimation (Three-Point PERT)**: ..."
              value={formSummary}
              onChange={(e) => setFormSummary(e.target.value)}
            />
          </div>

          <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
