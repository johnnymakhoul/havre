// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import React, { useState } from "react";
import {
  Button,
  Card,
  Collapse,
  Input,
  Progress,
  Tag,
  Tooltip,
  Popconfirm,
  Badge,
} from "antd";
import {
  RiCheckLine,
  RiArrowRightLine,
  RiArrowLeftLine,
  RiSparkling2Line,
  RiAddLine,
  RiDeleteBinLine,
  RiInformationLine,
  RiFileCopyLine,
  RiSkipForwardLine,
} from "react-icons/ri";
import { toast } from "react-toastify";
import MarkdownRenderer from "./_markdown_renderer";
import { DynamicDataRenderer, scenarioToText } from "./_dynamic_data_renderer";

const { TextArea } = Input;

const WorkflowStageReview = ({
  stage,
  stageIndex,
  totalStages,
  cumulativeContext,
  isGenerating,
  generationProgress,
  onGenerate,
  onRefine,
  onUpdateCards,
  onGenerateFollowUp,
  onApproveAndNext,
  onPrevStage,
  onSkipStage,
}) => {
  const [refinementText, setRefinementText] = useState("");
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardSummary, setNewCardSummary] = useState("");

  const cards = stage.cards || [];

  const handleCardTitleChange = (idx, newTitle) => {
    const updated = [...cards];
    updated[idx] = { ...updated[idx], title: newTitle };
    onUpdateCards(updated);
  };

  const handleCardSummaryChange = (idx, newSummary) => {
    const updated = [...cards];
    updated[idx] = { ...updated[idx], summary: newSummary };
    onUpdateCards(updated);
  };

  const handleDeleteCard = (idx) => {
    const updated = cards.filter((_, i) => i !== idx);
    onUpdateCards(updated);
    toast.info("Deliverable card removed");
  };

  const handleAddCardSubmit = () => {
    if (!newCardTitle.trim()) {
      toast.error("Please enter a title for the deliverable card");
      return;
    }
    const updated = [
      ...cards,
      {
        title: newCardTitle.trim(),
        summary: newCardSummary.trim(),
        manual: true,
      },
    ];
    onUpdateCards(updated);
    setNewCardTitle("");
    setNewCardSummary("");
    setIsAddingCard(false);
    toast.success("Deliverable card added");
  };

  const handleCopyAllCards = () => {
    const text = cards.map(scenarioToText).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    toast.success("All deliverables copied to clipboard!");
  };

  const handleRefineSubmit = () => {
    if (!refinementText.trim()) {
      toast.error("Please enter refinement instructions");
      return;
    }
    onRefine(refinementText);
    setRefinementText("");
  };

  const contextCollapseItems = [
    {
      key: "cumulative-context",
      label: (
        <span style={{ fontWeight: 600 }}>
          <RiInformationLine
            style={{ marginRight: 6, verticalAlign: "middle" }}
          />
          View Forwarded Project Context ({stageIndex} prior stages approved)
        </span>
      ),
      children: cumulativeContext ? (
        <div
          style={{
            maxHeight: 220,
            overflowY: "auto",
            backgroundColor: "#f8f9fa",
            padding: 12,
            borderRadius: 6,
            fontSize: "0.85rem",
          }}
        >
          <MarkdownRenderer content={cumulativeContext} />
        </div>
      ) : (
        <p style={{ margin: 0, color: "#8c8c8c", fontStyle: "italic" }}>
          Initial stage: no prior context forwarded yet.
        </p>
      ),
    },
  ];

  return (
    <div className="workflow-stage-review" style={{ marginTop: 24 }}>
      {/* Header Info */}
      <Card
        bordered
        style={{
          marginBottom: 20,
          borderRadius: 8,
          borderColor: "#e2e8f0",
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700 }}>
                {stage.title}
              </h2>
              <Tag
                color={
                  stage.status === "completed"
                    ? "green"
                    : stage.status === "in-review"
                      ? "blue"
                      : "default"
                }
              >
                {stage.status.toUpperCase()}
              </Tag>
            </div>
            <p style={{ color: "#4a5568", marginTop: 6, marginBottom: 0 }}>
              {stage.description}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span
              style={{ fontSize: "0.85rem", color: "#718096", fontWeight: 500 }}
            >
              Stage {stageIndex + 1} of {totalStages}
            </span>
          </div>
        </div>

        {/* Forwarded Context Collapse */}
        <div style={{ marginTop: 16 }}>
          <Collapse ghost size="small" items={contextCollapseItems} />
        </div>
      </Card>

      {/* Generation Bar / CTA if no cards yet */}
      {cards.length === 0 && !isGenerating && (
        <Card
          style={{
            textAlign: "center",
            padding: "36px 20px",
            background: "#f8fafc",
            borderRadius: 8,
            marginBottom: 24,
          }}
        >
          <RiSparkling2Line
            style={{ fontSize: "2.5rem", color: "#3b82f6", marginBottom: 12 }}
          />
          <h3 style={{ margin: 0, fontWeight: 600 }}>
            Ready to generate deliverables for {stage.title}
          </h3>
          <p
            style={{
              color: "#64748b",
              maxWidth: 540,
              margin: "8px auto 20px auto",
            }}
          >
            Haiven will analyze the project brief and forward all approved
            context from previous stages to produce structured deliverables.
          </p>
          <Button
            type="primary"
            size="large"
            icon={<RiSparkling2Line />}
            onClick={onGenerate}
          >
            Generate Stage Deliverables
          </Button>
        </Card>
      )}

      {/* Streaming Progress Bar */}
      {isGenerating && (
        <Card style={{ marginBottom: 20, borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Progress
              percent={generationProgress}
              status="active"
              style={{ flex: 1, margin: 0 }}
            />
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Synthesizing deliverables...
            </span>
          </div>
        </Card>
      )}

      {/* Cards List / HITL Review */}
      {cards.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
              Generated Deliverables ({cards.length})
            </h3>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="small" onClick={handleCopyAllCards}>
                <RiFileCopyLine style={{ marginRight: 4 }} /> Copy All
              </Button>
              <Button
                size="small"
                type="dashed"
                onClick={() => setIsAddingCard(!isAddingCard)}
              >
                <RiAddLine style={{ marginRight: 4 }} /> Add Deliverable
              </Button>
            </div>
          </div>

          {/* Inline Add Card Drawer */}
          {isAddingCard && (
            <Card
              size="small"
              style={{
                marginBottom: 16,
                borderColor: "#93c5fd",
                backgroundColor: "#eff6ff",
              }}
            >
              <h4 style={{ margin: "0 0 8px 0" }}>New Deliverable Item</h4>
              <Input
                placeholder="Deliverable Title..."
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <TextArea
                rows={3}
                placeholder="Summary / details of deliverable..."
                value={newCardSummary}
                onChange={(e) => setNewCardSummary(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button size="small" onClick={() => setIsAddingCard(false)}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  type="primary"
                  onClick={handleAddCardSubmit}
                >
                  Save Deliverable
                </Button>
              </div>
            </Card>
          )}

          {/* Cards Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {cards.map((card, idx) => (
              <Card
                key={card.id || idx}
                bordered
                hoverable
                style={{
                  borderRadius: 8,
                  borderColor: "#e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                }}
                styles={{
                  body: {
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    padding: 16,
                  },
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <Input
                    value={card.title || ""}
                    onChange={(e) => handleCardTitleChange(idx, e.target.value)}
                    style={{
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      borderColor: "transparent",
                      padding: "2px 4px",
                      backgroundColor: "transparent",
                    }}
                  />
                  <Popconfirm
                    title="Remove deliverable"
                    description="Remove this deliverable from the workflow?"
                    onConfirm={() => handleDeleteCard(idx)}
                    okText="Remove"
                    cancelText="Cancel"
                  >
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<RiDeleteBinLine />}
                    />
                  </Popconfirm>
                </div>

                <div style={{ flex: 1, marginBottom: 8 }}>
                  <TextArea
                    rows={5}
                    value={card.summary || card.content || ""}
                    onChange={(e) => handleCardSummaryChange(idx, e.target.value)}
                    style={{ fontSize: "0.85rem", resize: "vertical" }}
                  />
                </div>

                {/* Additional metadata tags if present */}
                <DynamicDataRenderer
                  data={card}
                  exclude={["title", "summary", "content", "id", "manual"]}
                  className="scenario-summary"
                />
              </Card>
            ))}
          </div>

          {/* Refinement Prompt */}
          <Card
            size="small"
            style={{
              marginTop: 20,
              borderRadius: 8,
              backgroundColor: "#fdfefe",
              border: "1px dashed #cbd5e1",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <TextArea
                rows={2}
                placeholder="Give feedback or instructions to refine deliverables (e.g. 'Emphasize GDPR compliance', 'Add 2 offline-first cards')..."
                value={refinementText}
                onChange={(e) => setRefinementText(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                type="default"
                icon={<RiSparkling2Line />}
                loading={isGenerating}
                onClick={handleRefineSubmit}
              >
                Refine
              </Button>
            </div>
          </Card>

          {/* Follow-up Specification Generation if configured */}
          {stage.followUpId && (
            <Card
              size="small"
              style={{
                marginTop: 16,
                borderRadius: 8,
                backgroundColor: "#f8fafc",
                borderColor: "#e2e8f0",
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
                  <h4 style={{ margin: 0, fontWeight: 600 }}>
                    Synthesized Detailed Study / Spec
                  </h4>
                  <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                    Synthesizes these approved cards into a full architectural / delivery specification.
                  </p>
                </div>
                {!stage.followUpContent ? (
                  <Button
                    size="small"
                    onClick={onGenerateFollowUp}
                    loading={isGenerating}
                  >
                    Generate Spec
                  </Button>
                ) : (
                  <Tag color="green">SPEC GENERATED</Tag>
                )}
              </div>
              {stage.followUpContent && (
                <div
                  style={{
                    marginTop: 12,
                    maxHeight: 200,
                    overflowY: "auto",
                    backgroundColor: "#ffffff",
                    padding: 12,
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <MarkdownRenderer content={stage.followUpContent} />
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Navigation & Approval Actions */}
      <Card
        style={{
          marginTop: 24,
          borderRadius: 8,
          borderColor: "#cbd5e1",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            {stageIndex > 0 && (
              <Button icon={<RiArrowLeftLine />} onClick={onPrevStage}>
                Previous Stage
              </Button>
            )}
            <Button
              type="text"
              icon={<RiSkipForwardLine />}
              onClick={onSkipStage}
            >
              Skip Stage
            </Button>
          </div>

          <div>
            <Button
              type="primary"
              size="large"
              icon={<RiCheckLine />}
              disabled={cards.length === 0}
              onClick={onApproveAndNext}
            >
              {stageIndex + 1 === totalStages
                ? "Approve & Complete Workflow"
                : "Approve & Proceed to Next Stage"}
              <RiArrowRightLine style={{ marginLeft: 6 }} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default WorkflowStageReview;

