import React, {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { isTyping } from "../utils";
export function useSidebarShortcut({
  mobileNavigation,
  drawer,
  drawerReturnFocus,
  setDrawer,
  setMenu,
  setCollapsed,
}: {
  mobileNavigation: boolean;
  drawer: boolean;
  drawerReturnFocus: RefObject<HTMLElement | null>;
  setDrawer: Dispatch<SetStateAction<boolean>>;
  setMenu: Dispatch<SetStateAction<string>>;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector("dialog[open]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (mobileNavigation) {
          if (!drawer)
            drawerReturnFocus.current = document.activeElement as HTMLElement;
          setDrawer((value) => !value);
          setMenu("");
        } else setCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mobileNavigation, drawer]);
}
export function ShortcutList() {
  return (
    <dl className="shortcut-list">
      {[
        ["Ctrl / ⌘ K or /", "Search projects"],
        ["N", "New project"],
        ["Ctrl / ⌘ B", "Collapse sidebar"],
        ["Ctrl / ⌘ A", "Select visible projects"],
        ["Esc", "Clear selection / close menu"],
        ["Arrow keys", "Move between projects"],
        ["Enter", "Open focused project"],
        ["Space", "Select focused project"],
        ["?", "Keyboard shortcuts"],
      ].map(([key, label]) => (
        <div key={key}>
          <dt>
            <kbd>{key}</kbd>
          </dt>
          <dd>{label}</dd>
        </div>
      ))}
    </dl>
  );
}
