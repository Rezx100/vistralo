import React from "react";
import { Menu, ToolButton, type MenuAction } from "../components/Primitives";
import {
  createFlows,
  flowFor,
  materialFlows,
  recordFlows,
  type CreateFlow,
} from "../features/create-flows";

const STORAGE_KEY = "vistralo-record-flow";

/** The way of recording that the Record button starts: the one used last, an AI walkthrough at first. */
export function storedRecordFlow(): CreateFlow {
  const stored = localStorage.getItem(STORAGE_KEY);
  return recordFlows.some((item) => item.flow === stored)
    ? (stored as CreateFlow)
    : "ai-walkthrough";
}

export function rememberRecordFlow(flow: CreateFlow) {
  if (recordFlows.some((item) => item.flow === flow))
    localStorage.setItem(STORAGE_KEY, flow);
}

/**
 * The one place a project starts from, in the same spot on every page: Record goes straight
 * to the browser's screen picker, and the button beside it lists every other way to begin.
 */
export function RecordControl({
  flow,
  create,
  menuOpen,
  onMenu,
  placement,
}: {
  flow: CreateFlow;
  create: (flow: CreateFlow) => void;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  /** The rail on a computer, the top bar on a phone. */
  placement: "rail" | "bar";
}) {
  const current = flowFor(flow);
  const items: MenuAction[] = createFlows.map((item) => ({
    label: item.label,
    description: item.description,
    icon: item.icon,
    key: item.key,
    separator: item === materialFlows[0],
    onClick: () => create(item.flow),
  }));
  return (
    <div
      className={`record-control record-control-${placement}`}
      role="group"
      aria-label="Create"
    >
      <button
        type="button"
        className="button button-record button-large record-button tooltip-host"
        aria-label="Record"
        aria-description={current.label}
        onClick={() => create(flow)}
      >
        <span className="record-label">Record</span>
        <span className="tooltip" role="tooltip">
          {current.label}
        </span>
      </button>
      <div className="menu-anchor">
        <ToolButton
          icon="add"
          label="New project"
          className="record-more"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-keyshortcuts="N"
          onClick={() => onMenu(!menuOpen)}
        />
        {menuOpen && (
          <Menu
            items={items}
            align={placement === "bar" ? "end" : "start"}
            onClose={() => onMenu(false)}
          />
        )}
      </div>
    </div>
  );
}
