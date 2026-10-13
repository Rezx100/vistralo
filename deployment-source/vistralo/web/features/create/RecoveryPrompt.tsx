import React from "react";
import { clearRecording } from "../recording-store";
import { formatBytes } from "../flow-utils";
import { Icon } from "../../components/Icon";
import { confirmDialog } from "../../components/Primitives";
import type { Recorder } from "./useRecorder";

export interface RecoveryProps {
  recorder: Recorder;
  file: File | null;
  setFile: (file: File | null) => void;
  localUrl: string;
  leftOver: Date | null;
  setLeftOver: (leftOver: Date | null) => void;
  busy: boolean;
  setError: (message: string) => void;
}

export function RecoveryPrompt({
  recorder,
  file,
  setFile,
  localUrl,
  leftOver,
  setLeftOver,
  busy,
  setError,
}: RecoveryProps) {
  const {
    spokenTake,
    spoken,
    setSpoken,
    setRecording,
    recoverySaved,
    setRecoverySaved,
  } = recorder;
  return (
    <>
      <p className={`sheet-status ${recoverySaved ? "is-success" : "is-warning"}`}>
        <Icon name={recoverySaved ? "checkCircle" : "warning"} />
        <span>
          {leftOver
            ? `This is an unsaved recording from ${leftOver.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Save or download it, or discard it to record a new one. `
            : ""}
          {spoken
            ? "Your voice is in this recording. Save it to keep that audio. AI narration will not run."
            : recoverySaved
              ? leftOver
                ? "It is kept in this browser until you decide."
                : "Your recording is saved for recovery in this browser."
              : "Download a recovery copy before closing this page."}
          {spoken && !recoverySaved
            ? " Download a recovery copy before closing this page."
            : ""}
        </span>
      </p>
      {localUrl && (
        <video
          className="flow-recording-preview"
          src={localUrl}
          controls
          playsInline
          preload="metadata"
          aria-label="Preview captured recording"
        />
      )}
      <div className="sheet-media-bar">
        {file && (
          <span
            className="flow-caption flow-muted flow-file-summary"
            title={file.name}
          >
            {formatBytes(file.size)} · {file.name}
          </span>
        )}
        {localUrl && (
          <a className="button" href={localUrl} download={file?.name}>
            <Icon name="download" />
            Download
          </a>
        )}
        <button
          type="button"
          className="button button-ghost danger-text"
          disabled={busy}
          onClick={async () => {
            if (
              !(await confirmDialog({
                title: "Discard this recording?",
                message:
                  "You will start again from the beginning. Download a copy first if you want to keep it.",
                confirmLabel: "Discard",
                cancelLabel: "Keep it",
                icon: "trash",
                tone: "danger",
              }))
            )
              return;
            await clearRecording().catch(() => {});
            setFile(null);
            setSpoken(false);
            spokenTake.current = false;
            setRecording("idle");
            setRecoverySaved(false);
            setLeftOver(null);
            setError("");
          }}
        >
          <Icon name="trash" />
          Discard
        </button>
      </div>
    </>
  );
}
