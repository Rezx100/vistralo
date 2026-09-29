import React, { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { Menu, type MenuAction } from "./Primitives";

export interface DockItem {
  label: string;
  icon: string;
  hint?: string;
  onClick: () => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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
  const dock = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = dock.current;
    if (!element) return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const rest = () => {
      element.dataset.near = "false";
      element.style.setProperty("--dock-dx", "0");
      element.style.setProperty("--dock-dy", "0");
    };
    const apply = () => {
      frame = 0;
      if (!pointer) return;
      const box = element.getBoundingClientRect();
      const reach =
        parseFloat(getComputedStyle(element).getPropertyValue("--dock-reach")) || 180;
      const dx = pointer.x - (box.left + box.width / 2);
      const dy = pointer.y - (box.top + box.height / 2);
      const gap = Math.hypot(
        Math.max(0, Math.abs(dx) - box.width / 2),
        Math.max(0, Math.abs(dy) - box.height / 2),
      );
      if (gap >= reach) {
        rest();
        return;
      }
      const pull = 1 - gap / reach;
      element.dataset.near = "true";
      element.style.setProperty(
        "--dock-dx",
        (clamp(dx / (box.width / 2 + reach), -1, 1) * pull).toFixed(3),
      );
      element.style.setProperty(
        "--dock-dy",
        (clamp(dy / (box.height / 2 + reach), -1, 1) * pull).toFixed(3),
      );
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !finePointer.matches) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    const leave = () => {
      pointer = null;
      rest();
    };
    rest();
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
  }, []);

  return (
    <div
      ref={dock}
      className={`create-dock ${menuOpen ? "is-open" : ""}`}
      role="toolbar"
      aria-label="Create"
    >
      <div className="create-dock-quick">
        <div>
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
