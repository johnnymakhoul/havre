// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import ContextChoice from "../app/_context_choice";

describe("ContextChoice Component", () => {
  const mockContexts = [
    { value: "base", label: "base" },
    { value: "context1", label: "Context 1" },
    { value: "context2", label: "Context 2" },
    { value: "context3", label: "Context 3" },
    { value: "context4", label: "Context 4" },
  ];

  const verifyTooltip = async (testId, tooltipText) => {
    const tooltipElement = screen.getByTestId(testId);
    expect(tooltipElement).toBeInTheDocument();
    fireEvent.mouseOver(tooltipElement.firstChild);
    expect(await screen.findByText(tooltipText)).toBeInTheDocument();
  };

  function verifyAddContextLink() {
    const addContextLink = screen.getByText("Add Context");
    expect(addContextLink).toBeInTheDocument();
    fireEvent.click(addContextLink);

    expect(screen.getByText("Add new Context")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  }

  it("should render context dropdown with multiple choice", async () => {
    render(<ContextChoice contexts={mockContexts} selectedContexts={[]} />);
    expect(screen.getByText("Select your context")).toBeInTheDocument();
    expect(screen.getByTestId("context-select")).toBeInTheDocument();
    await verifyTooltip(
      "context-selection-tooltip",
      "Choose a context from your knowledge pack that is relevant to the domain, architecture, or team you are working on.",
    );

    const select = screen.getByTestId("context-select").firstChild;
    fireEvent.mouseDown(select);

    expect(screen.getByText("Context 1")).toBeInTheDocument();
    expect(screen.getByText("Context 2")).toBeInTheDocument();
    expect(screen.getByText("Context 3")).toBeInTheDocument();
    expect(screen.getByText("Context 4")).toBeInTheDocument();

    verifyAddContextLink();

    const option1 = await screen.findByText("Context 1");
    fireEvent.click(option1);

    const option2 = await screen.findByText("Context 2");
    fireEvent.click(option2);

    expect(within(select).getByText("Context 1")).toBeInTheDocument();
    expect(within(select).getByText("Context 2")).toBeInTheDocument();
    expect(within(select).queryByText("Context 3")).not.toBeInTheDocument();
  });

  it("should allow selecting more than 3 items without hard limit restriction", async () => {
    render(<ContextChoice contexts={mockContexts} selectedContexts={[]} />);
    const select = screen.getByTestId("context-select").firstChild;
    fireEvent.mouseDown(select);

    const option1 = await screen.findByText("Context 1");
    fireEvent.click(option1);
    expect(within(select).getByText("Context 1")).toBeInTheDocument();

    const option2 = await screen.findByText("Context 2");
    fireEvent.click(option2);
    expect(within(select).getByText("Context 2")).toBeInTheDocument();

    const option3 = await screen.findByText("Context 3");
    fireEvent.click(option3);
    expect(within(select).getByText("Context 3")).toBeInTheDocument();

    const option4 = await screen.findByText("Context 4");
    fireEvent.click(option4);
    expect(within(select).getByText("Context 4")).toBeInTheDocument();
  });

  it("should render filled project sections and their items in tree", async () => {
    const customTree = [
      {
        title: "Project Prompts",
        value: "group::project-sections",
        key: "group::project-sections",
        selectable: false,
        checkable: false,
        children: [
          {
            title: "Requirements Breakdown",
            value: "section::req-breakdown",
            key: "section::req-breakdown",
            children: [
              {
                title: "User Authentication",
                value: "card::req-breakdown::card-1",
                key: "card::req-breakdown::card-1",
              },
            ],
          },
        ],
      },
    ];

    render(
      <ContextChoice
        contexts={[]}
        selectedContexts={[]}
        treeData={customTree}
      />,
    );

    const select = screen.getByTestId("context-select").firstChild;
    fireEvent.mouseDown(select);

    expect(screen.getByText("Requirements Breakdown")).toBeInTheDocument();
    expect(screen.getByText("User Authentication")).toBeInTheDocument();
  });
});
