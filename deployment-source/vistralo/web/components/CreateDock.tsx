import React from "react";
import { Icon } from "./Icon";
import { Menu, type MenuAction } from "./Primitives";

export interface DockItem {
  label: string;
  icon: string;
  hint?: string;
  onClick: () => void;
}

/**
 * The create bar at the foot of the project list. The record actions are always
 * visible and the bar never moves, so a button is where the pointer expects it.
 * On narrow screens only the primary button shows; its menu lists every way to start.
 */
export function CreateDock({
  label,
  items,
  menuItems,
  menuOpen,
  onMenu,
}: {
  label: string;
  items: DockItem[];
  menuItems: MenuAction[];
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
}) {
  return (
    <div
      className={`create-dock ${menuOpen ? "is-open" : ""}`}
      role="toolbar"
      aria-label="Create"
    >
      <div className="create-dock-quick">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="dock-action"
            title={item.hint}
            aria-description={item.hint}
            onClick={item.onClick}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
        <span className="create-dock-divider" aria-hidden="true" />
      </div>
      <div className="menu-anchor">
        <button
          type="button"
          className="dock-primary"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-keyshortcuts="N"
          onClick={() => onMenu(!menuOpen)}
        >
          <Icon name="add" />
          <span>{label}</span>
          <kbd aria-hidden="true">N</kbd>
        </button>
        {menuOpen && <Menu items={menuItems} onClose={() => onMenu(false)} />}
      </div>
    </div>
  );
}
