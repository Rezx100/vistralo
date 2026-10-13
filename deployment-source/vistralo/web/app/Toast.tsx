import React, { useEffect, type Dispatch, type SetStateAction } from "react";
import { Toast as ToastSurface } from "../components/Controls";
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
        <ToastSurface
          key={message}
          tone={tone}
          message={message}
          inert={inert}
          action={undo ? { label: "Undo", onClick: () => onUndo(undo) } : undefined}
          onDismiss={onDismiss}
        />
      )}
    </>
  );
}
