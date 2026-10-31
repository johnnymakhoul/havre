// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { useState, useEffect, useMemo, useCallback } from "react";
import { TreeSelect, Tooltip, Button } from "antd";
import { RiAddBoxLine } from "react-icons/ri";
import { DownOutlined } from "@ant-design/icons";

import HelpTooltip from "./_help_tooltip";
import AddContext from "../app/_add_context";
import { buildContextTreeData } from "./utils/_context_helper";

function ContextChoice({
  contexts = [],
  selectedContexts = [],
  onChange,
  prompts = [],
  activeProjectId = null,
  treeData: propTreeData = null,
}) {
  const [isAddingContext, setIsAddingContext] = useState(false);
  const [version, setVersion] = useState(0);
  const [internalSelected, setInternalSelected] = useState([]);

  const refreshTree = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.addEventListener("update-context", refreshTree);
    window.addEventListener("update-cards", refreshTree);
    window.addEventListener("update-follow-ups", refreshTree);
    window.addEventListener("update-chats", refreshTree);
    window.addEventListener("update-project", refreshTree);

    return () => {
      window.removeEventListener("update-context", refreshTree);
      window.removeEventListener("update-cards", refreshTree);
      window.removeEventListener("update-follow-ups", refreshTree);
      window.removeEventListener("update-chats", refreshTree);
      window.removeEventListener("update-project", refreshTree);
    };
  }, [refreshTree]);

  const treeData = useMemo(() => {
    if (propTreeData && Array.isArray(propTreeData) && propTreeData.length > 0) {
      return propTreeData;
    }
    return buildContextTreeData({
      knowledgePackContexts: contexts,
      prompts,
      activeProjectId,
    });
  }, [propTreeData, contexts, prompts, activeProjectId, version]);

  const tooltipMessage =
    contexts.length === 1
      ? "There are no contexts configured in the knowledge pack. Contexts can provide project-specific information about domain and architecture that Haiven can reuse across prompts."
      : "Choose a context from your knowledge pack that is relevant to the domain, architecture, or team you are working on.";

  const normalizedSelected = useMemo(() => {
    if (!Array.isArray(selectedContexts)) return [];
    return selectedContexts.map((c) =>
      typeof c === "string" ? c : c?.value || c?.key || "",
    );
  }, [selectedContexts]);

  const currentSelection =
    normalizedSelected.length > 0 ? normalizedSelected : internalSelected;

  const dropdownSuffix = (
    <>
      {currentSelection.length > 0 && (
        <span style={{ marginRight: 4, fontSize: "0.85em", color: "#888" }}>
          {currentSelection.length} selected
        </span>
      )}
      <DownOutlined />
    </>
  );

  const handleChange = (values, labelList, extra) => {
    setInternalSelected(values || []);
    if (onChange) {
      onChange(values, labelList, extra);
    }
  };

  return (
    <div className="user-input">
      <div className="input-context-label">
        <label>
          Select your context
          <HelpTooltip
            text={tooltipMessage}
            testid="context-selection-tooltip"
          />
        </label>
        <Tooltip title="Add your project context to be reused in your Haiven inputs. This will be included in the context dropdown.">
          <Button
            type="link"
            className="add-context-icon-button"
            onClick={() => setIsAddingContext(true)}
          >
            <RiAddBoxLine fontSize="large" />
            Add Context
          </Button>
        </Tooltip>
      </div>

      <TreeSelect
        treeData={treeData}
        value={currentSelection}
        onChange={handleChange}
        treeCheckable={true}
        showCheckedStrategy={TreeSelect.SHOW_PARENT}
        placeholder="Please select the context(s)"
        data-testid="context-select"
        style={{ width: "100%" }}
        suffixIcon={dropdownSuffix}
        treeDefaultExpandAll={true}
        allowClear
      />
      <AddContext
        isAddingContext={isAddingContext}
        setIsAddingContext={setIsAddingContext}
      />
    </div>
  );
}

export default ContextChoice;
