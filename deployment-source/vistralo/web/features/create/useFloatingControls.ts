import { useRef, useState, type RefObject } from "react";
import type { Root } from "react-dom/client";
import {
  floatingControlsSupported,
  openFloatingWindow,
  showReturnPrompt,
} from "../capture";

export function useFloatingControls(mounted: RefObject<boolean>) {
  const trayWindow = useRef<Window | null>(null),
    trayRoot = useRef<Root | null>(null),
    floatingWanted = useRef(false);
  const [floating, setFloating] = useState<Window | null>(null);

  function closeFloating() {
    floatingWanted.current = false;
    const current = trayWindow.current;
    trayWindow.current = null;
    if (current && !current.closed) current.close();
    if (mounted.current) setFloating(null);
  }

  // Uses up the click's user activation, so call it after getDisplayMedia and before any await.
  async function popOutControls() {
    if (trayWindow.current || floatingWanted.current || !floatingControlsSupported) return;
    floatingWanted.current = true;
    try {
      const opened = await openFloatingWindow(480, 72);
      if (!opened) {
        floatingWanted.current = false;
        return;
      }
      if (!mounted.current || !floatingWanted.current) {
        opened.close();
        return;
      }
      trayWindow.current = opened;
      setFloating(opened);
    } catch {
      floatingWanted.current = false;
      /* Floating controls are optional; the in-page tray stays available. */
    }
  }

  function releaseFloating() {
    const current = trayWindow.current;
    if (current && !current.closed && document.visibilityState === "hidden") {
      trayWindow.current = null;
      floatingWanted.current = false;
      showReturnPrompt(current);
      if (mounted.current) setFloating(null);
    } else closeFloating();
  }

  return {
    floating,
    setFloating,
    trayWindow,
    trayRoot,
    closeFloating,
    popOutControls,
    releaseFloating,
  };
}
