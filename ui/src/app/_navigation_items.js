// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import Link from "next/link";
import {
  RiFlaskLine,
  RiLightbulbLine,
  RiCodeBoxLine,
  RiBookReadLine,
  RiFileList3Line,
  RiShieldCheckLine,
  RiChat2Line,
  RiChatQuoteLine,
  RiCompasses2Line,
  RiBook2Line,
  RiDashboardHorizontalLine,
  RiGlobalLine,
  RiBriefcase2Line,
  RiKanbanView2,
  RiSparkling2Line,
} from "react-icons/ri";

// Keeping the implementation of menu items for the "static" features in one place
// Will usually be enhanced by the dynamically loaded prompts afterwards

export const THOUGHTWORKS_ONLY_CATEGORIES = [
  "client-research",
  "deliveryManagement",
];

export const SOFTWARE_DELIVERY_CATEGORIES = [
  "research",
  "ideate",
  "analysis",
  "specification",
  "project-management",
  "coding",
  "testing",
  "architecture",
  "other",
];

export const PROJECT_SECTION_OPTIONS = [
  { key: "research", label: "Research", group: "Software Delivery" },
  { key: "ideate", label: "Ideate", group: "Software Delivery" },
  { key: "analysis", label: "Analyse", group: "Software Delivery" },
  {
    key: "specification",
    label: "Software Specification",
    group: "Software Delivery",
  },
  {
    key: "project-management",
    label: "Project Management",
    group: "Software Delivery",
  },
  { key: "coding", label: "Coding", group: "Software Delivery" },
  { key: "testing", label: "Testing", group: "Software Delivery" },
  { key: "architecture", label: "Architecture", group: "Software Delivery" },
  { key: "other", label: "Other", group: "Software Delivery" },
];

export const initialiseMenuCategoriesForSidebar = (
  isThoughtworksInstance,
  projectSections = null,
) => {
  const isSectionEnabled = (sectionKey) => {
    if (!Array.isArray(projectSections)) {
      return true;
    }
    if (sectionKey === "analysis") {
      return (
        projectSections.includes("analysis") ||
        projectSections.includes("analyse")
      );
    }
    if (sectionKey === "specification") {
      return (
        projectSections.includes("specification") ||
        projectSections.includes("specifications") ||
        projectSections.includes("software-specification")
      );
    }
    if (sectionKey === "project-management") {
      return (
        projectSections.includes("project-management") ||
        projectSections.includes("projectmanagement") ||
        projectSections.includes("project_management")
      );
    }
    return projectSections.includes(sectionKey);
  };

  const addThoughtworksMenuItems = (categories) => {
    categories.thoughtworksLabel = {
      key: "thoughtworksLabel",
      label: "Thoughtworks",
      className: "menu-divider",
      type: "group",
    };
    categories["client-research"] = {
      key: "client-research",
      label: "Client research",
      icon: <RiGlobalLine style={{ fontSize: "large" }} />,
      children: [
        {
          key: "company-research",
          label: <Link href="/company-research">Company overview</Link>,
          icon: (
            <RiGlobalLine
              style={{
                marginTop: "-2px",
                fontSize: "0.8rem",
                verticalAlign: "middle",
              }}
            />
          ),
        },
        {
          key: "company-research-ai-tool",
          label: (
            <Link href="/company-research?config=ai-tool">
              Company overview: AI tools
            </Link>
          ),
          icon: (
            <RiGlobalLine
              style={{
                marginTop: "-2px",
                fontSize: "0.8rem",
                verticalAlign: "middle",
              }}
            />
          ),
        },
      ],
    };
    categories.deliveryManagement = {
      key: "deliveryManagement",
      label: "Delivery",
      icon: <RiDashboardHorizontalLine style={{ fontSize: "large" }} />,
      children: [],
    };
  };

  const addSoftwareDeliveryMenuItems = (categories) => {
    const hasAnySoftwareDeliverySection = SOFTWARE_DELIVERY_CATEGORIES.some(
      (key) => isSectionEnabled(key),
    );
    if (!hasAnySoftwareDeliverySection) {
      return;
    }

    categories.softwareDeliveryLabel = {
      key: "softwareDeliveryLabel",
      label: "Software Delivery",
      className: "menu-divider",
      type: "group",
    };
    if (isSectionEnabled("research")) {
      categories.research = {
        key: "research",
        label: "Research",
        icon: <RiBook2Line style={{ fontSize: "large" }} />,
        children: [],
      };
    }
    if (isSectionEnabled("ideate")) {
      categories.ideate = {
        key: "ideate",
        label: "Ideate",
        icon: <RiLightbulbLine style={{ fontSize: "large" }} />,
        children: [
          {
            key: "creative-matrix",
            label: <Link href="/creative-matrix">Creative Matrix</Link>,
          },
          {
            key: "scenarios",
            label: <Link href="/scenarios">Scenario Design</Link>,
          },
        ],
      };
    }
    if (isSectionEnabled("analysis")) {
      categories.analysis = {
        key: "analyse",
        label: "Analyse",
        icon: <RiBookReadLine style={{ fontSize: "large" }} />,
        children: [],
      };
    }
    if (isSectionEnabled("specification")) {
      categories.specification = {
        key: "specification",
        label: "Software Specification",
        icon: <RiFileList3Line style={{ fontSize: "large" }} />,
        children: [],
      };
    }
    if (isSectionEnabled("project-management")) {
      categories["project-management"] = {
        key: "project-management",
        label: "Project Management",
        icon: <RiShieldCheckLine style={{ fontSize: "large" }} />,
        children: [
          {
            key: "project-management-tasks",
            label: (
              <Link href="/tasks" className="submenu-entry">
                Tasks
              </Link>
            ),
          },
        ],
      };
    }
    if (isSectionEnabled("coding")) {
      categories.coding = {
        key: "coding",
        label: "Coding",
        icon: <RiCodeBoxLine style={{ fontSize: "large" }} />,
        children: [],
      };
    }
    if (isSectionEnabled("testing")) {
      categories.testing = {
        key: "testing",
        label: "Testing",
        icon: <RiFlaskLine style={{ fontSize: "large" }} />,
        children: [],
      };
    }
    if (isSectionEnabled("architecture")) {
      categories.architecture = {
        key: "architecture",
        label: "Architecture",
        icon: <RiCompasses2Line style={{ fontSize: "large" }} />,
        children: [],
      };
    }
    if (isSectionEnabled("other")) {
      categories.other = {
        key: "other",
        label: "Other",
        icon: <RiChat2Line style={{ fontSize: "large" }} />,
        children: [],
      };
    }
  };

  const categories = {
    dashboard: {
      key: "dashboard",
      label: <Link href="/">Dashboard</Link>,
      icon: <RiDashboardHorizontalLine style={{ fontSize: "large" }} />,
    },
    workflow: {
      key: "workflow",
      label: <Link href="/workflow">Project Workflow</Link>,
      icon: <RiSparkling2Line style={{ fontSize: "large" }} />,
    },
    tasks: {
      key: "tasks",
      label: <Link href="/tasks">Tasks</Link>,
      icon: <RiKanbanView2 style={{ fontSize: "large" }} />,
    },
    knowledgeChat: {
      key: "knowledgeChat",
      label: <Link href="/knowledge-chat">Chat with Haiven</Link>,
      icon: <RiChatQuoteLine style={{ fontSize: "large" }} />,
    },
  };

  if (isThoughtworksInstance) {
    addThoughtworksMenuItems(categories);
  }
  addSoftwareDeliveryMenuItems(categories);

  return categories;
};

export const staticFeaturesForDashboard = () => {
  return [
    {
      identifier: "project-automation-workflow",
      title: "Project Automation Workflow",
      help_prompt_description:
        "Chain project sections end-to-end with autonomous AI generation, Human-in-the-Loop review gates, and executive dossier synthesis.",
      categories: ["project-management", "research", "specification"],
      type: "static",
      link: "/workflow",
    },
    {
      identifier: "boba-creative-matrix",
      title: "Creative Matrix",
      help_prompt_description:
        'Create a "Creative Matrix" to generate new ideas across dimensions that you can define yourself.',
      categories: ["ideate"],
      type: "static",
      link: "/creative-matrix",
    },
    {
      identifier: "boba-scenarios",
      title: "Scenario Design",
      help_prompt_description:
        "Brainstorm a range of scenarios for your product domain based on criteria like time horizon, realism, and optimism.",
      categories: ["ideate"],
      type: "static",
      link: "/scenarios",
    },
    {
      identifier: "boba-tasks",
      title: "Tasks",
      help_prompt_description:
        "Kanban board to track project deliverables, Work Breakdown Structure (WBS) tasks, and Human-in-the-Loop review states.",
      categories: ["project-management"],
      type: "static",
      link: "/tasks",
    },
  ];
};
