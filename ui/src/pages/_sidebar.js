// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { Menu } from "antd";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { RiGlobalLine } from "react-icons/ri";
import {
  initialiseMenuCategoriesForSidebar,
  THOUGHTWORKS_ONLY_CATEGORIES,
  SOFTWARE_DELIVERY_CATEGORIES,
} from "../app/_navigation_items";
import { FEATURES } from "../app/feature_toggle";
import { getActiveProject } from "../app/_local_store";
import ProjectSelector from "../app/_project_selector";

const Sidebar = ({ prompts, featureToggleConfig }) => {
  const pathToKey = {
    "/workflow": "workflow",
    "/scenarios": "scenarios",
    "/creative-matrix": "creative-matrix",
    "/knowledge-chat": "knowledgeChat",
    "/tasks": "tasks",
    "/": "dashboard",
  };
  const router = useRouter();
  const currentSelectedKey = pathToKey[router.pathname];

  const [menuItems, setMenuItems] = useState([]);
  const [activeProject, setActiveProject] = useState(() => getActiveProject());

  const typeToUrlMap = {
    chat: "/chat",
    cards: "/cards",
  };

  useEffect(() => {
    const handleProjectUpdate = () => {
      setActiveProject(getActiveProject());
    };
    if (typeof window !== "undefined") {
      window.addEventListener("update-project", handleProjectUpdate);
      return () => {
        window.removeEventListener("update-project", handleProjectUpdate);
      };
    }
  }, []);

  useEffect(() => {
    const isThoughtworksInstance =
      featureToggleConfig[FEATURES.THOUGHTWORKS] === true;
    const menuCategories = initialiseMenuCategoriesForSidebar(
      isThoughtworksInstance,
      activeProject?.sections,
    );

    prompts
      .filter((prompt) => prompt.show !== false)
      .filter((prompt) => {
        if (
          prompt.categories.some((category) =>
            THOUGHTWORKS_ONLY_CATEGORIES.includes(category),
          )
        ) {
          return isThoughtworksInstance;
        }
        return true;
      })
      .forEach((prompt) => {
        const url = typeToUrlMap[prompt.type] || "/chat";
        prompt.categories.forEach((category) => {
          // For categories that are Thoughtworks-only - if they are not available, do not add to "Other"
          if (
            THOUGHTWORKS_ONLY_CATEGORIES.includes(category) &&
            !isThoughtworksInstance
          ) {
            return;
          }
          // If a known software delivery section is disabled in the active project, do not fall back to "Other"
          if (
            SOFTWARE_DELIVERY_CATEGORIES.includes(category) &&
            !menuCategories[category]
          ) {
            return;
          }
          const menuCategory =
            menuCategories[category] || menuCategories["other"];
          // Skip if this is a group or divider type category or if "other" is disabled
          if (
            !menuCategory ||
            menuCategory.type === "divider" ||
            menuCategory.type === "group"
          )
            return;

          menuCategory.children.push({
            key: category + "-" + prompt.identifier,
            label: (
              <Link
                href={`${url}?prompt=${prompt.identifier}`}
                className="submenu-entry"
              >
                {prompt.grounded && (
                  <RiGlobalLine
                    style={{
                      marginTop: "-2px",
                      marginRight: "4px",
                      fontSize: "0.8rem",
                      verticalAlign: "middle",
                    }}
                  />
                )}
                {prompt.title}
              </Link>
            ),
          });
        });
      });

    const finalMenuItems = [];
    Object.keys(menuCategories).forEach((key) => {
      // Handle divider or group type categories
      if (
        menuCategories[key].type === "divider" ||
        menuCategories[key].type === "group"
      ) {
        finalMenuItems.push(menuCategories[key]);
      } else if (!menuCategories[key].children) {
        finalMenuItems.push(menuCategories[key]);
      } else if (menuCategories[key].children.length > 0) {
        menuCategories[key].children.sort((a, b) => {
          const aText = Array.isArray(a.label.props.children)
            ? a.label.props.children[a.label.props.children.length - 1]
            : a.label.props.children;
          const bText = Array.isArray(b.label.props.children)
            ? b.label.props.children[b.label.props.children.length - 1]
            : b.label.props.children;
          return aText.localeCompare(bText);
        });
        finalMenuItems.push(menuCategories[key]);
      }
    });

    setMenuItems(finalMenuItems);
  }, [prompts, featureToggleConfig, activeProject]);

  return (
    <div className="sidebar-wrapper">
      <ProjectSelector onProjectChange={setActiveProject} />
      <Menu
        theme="light"
        mode="inline"
        className="sidebar"
        items={menuItems}
        defaultSelectedKeys={[currentSelectedKey]}
      ></Menu>
    </div>
  );
};

export default Sidebar;
