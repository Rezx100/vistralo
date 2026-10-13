import React, { useEffect, type Dispatch, type SetStateAction } from "react";
import { Icon } from "../components/Icon";
export function useToastDismiss(
  message: string,
  undo: string[] | null,
  setMessage: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    if (!message || undo) return;
    const timer = setTimeout(
      () => setMessage(""),
      Math.min(12000, 5000 + message.length * 40),
    );
    return () => clearTimeout(timer);
  }, [message, undo]);
}
export function Toast({
  message,
  tone,
  undo,
  inert,
  onUndo,
  onDismiss,
}: {
  message: string;
  tone: "success" | "error";
  undo: string[] | null;
  inert: boolean;
  onUndo: (ids: string[]) => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <div
        className="live-status sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </div>
      {message && (
        <div
          key={message}
          className={`toast is-${tone}`}
          inert={inert}
        >
          <span className="toast-icon" aria-hidden="true">
            <Icon name={tone === "error" ? "warning" : "checkCircle"} />
          </span>
          <span className="toast-message">{message}</span>
          {undo && (
            <button
              className="button button-ghost"
              onClick={() => onUndo(undo)}
            >
              Undo
            </button>
          )}
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => onDismiss()}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}
