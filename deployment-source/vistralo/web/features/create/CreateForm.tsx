import React, { type RefObject } from "react";
import type {
  Project,
  ProjectSource,
  UploadProgress,
  WorkspaceAdapter,
} from "../../contracts";
import { flowFor, type CreateFlow } from "../create-flows";
import { Icon } from "../../components/Icon";
import { SheetHeader } from "../../components/Primitives";
import type { Recorder } from "./useRecorder";

const flowIntro: Record<CreateFlow, string> = {
  "ai-walkthrough":
    "Share a screen, window or tab. When you stop, Vistralo pauses on every screen and explains it in an AI voice.",
  "talk-through":
    "Share a screen, window or tab and explain it as you go. Your voice is the narration.",
  section:
    "Share a screen, window or tab, then drag a box over the part you want. Everything outside it is left out.",
  "narrate-video":
    "Upload a screen recording. Vistralo pauses on every screen and explains it in an AI voice.",
  "narrate-screenshots":
    "Add screenshots in the order to explain them. A tall full-page capture is read one screen at a time.",
  website:
    "Capture a public website as a Visual brief with screenshots and observed behavior.",
};

export function CreateForm({
  source,
  flow,
  adapter,
  recorder,
  name,
  setName,
  file,
  shots,
  screenshots,
  storageChecked,
  busy,
  progress,
  building,
  controller,
  created,
  error,
  submit,
  close,
  children,
}: {
  source: ProjectSource;
  flow?: CreateFlow;
  adapter: WorkspaceAdapter;
  recorder: Recorder;
  name: string;
  setName: (name: string) => void;
  file: File | null;
  shots: File[];
  screenshots: boolean;
  storageChecked: boolean;
  busy: boolean;
  progress: UploadProgress | null;
  building: number | null;
  controller: RefObject<AbortController | null>;
  created: Project | null;
  error: string;
  submit: (event: React.FormEvent) => void;
  close: () => Promise<void>;
  children: React.ReactNode;
}) {
  const {
    spoken,
    requestingCapture,
    recording,
    activeRecording,
    screenSupported,
    chooseSource,
  } = recorder;
  const title = flow
    ? flowFor(flow).label
    : source === "web"
      ? "Analyze website"
      : source === "screen"
        ? "Record screen"
        : "Upload recording";
  const label =
    source === "web"
      ? "Analyze website"
      : source === "screen" && spoken
        ? "Save recording"
        : "Create Walkthrough";
  const progressLabel = progress?.phase === "hashing"
      ? "Checking source"
      : progress?.phase === "verifying"
        ? "Verifying source"
        : "Uploading";
  const choosing = source === "screen" && !file && recording === "idle";
  return (
    <form onSubmit={submit} className="sheet-form">
      <SheetHeader
        titleId="create-title"
        descriptionId="create-description"
        icon={
          flow
            ? flowFor(flow).icon
            : source === "web"
              ? "globe"
              : source === "screen"
                ? "record"
                : "upload"
        }
        title={title}
        description={
          flow
            ? flowIntro[flow]
            : source === "web"
            ? "Capture a public website as a Visual brief with screenshots and observed behavior."
            : source === "screen"
              ? "Choose a screen, window or tab. Save the captured video as a Walkthrough."
              : "Turn an existing video into a Walkthrough."
        }
        closeLabel="Close create project"
        onClose={() => void close()}
      />
      <div className="sheet-body">
        {adapter.mode === "demo" && (
          <p className="sheet-note">
            <Icon name="info" />
            <span>
              Demo workspace: projects and uploads stay in this browser.
              Website analysis is simulated. Connect the server for real
              website capture and rendering.
            </span>
          </p>
        )}
        <label className="field">
          <span>
            Project name <span className="flow-muted">(optional)</span>
          </span>
          <input
            autoFocus
            value={name}
            maxLength={120}
            placeholder={
              source === "web" ? "Website design review" : "Untitled Walkthrough"
            }
            onChange={(event) => setName(event.target.value)}
            disabled={busy || !!created}
          />
        </label>
        {children}
        {busy && (
          <div className="flow-stack flow-progress">
            <label htmlFor="create-progress">
              {building !== null
                ? `Turning screenshots into a walkthrough video: ${building}%`
                : progress
                  ? `${progressLabel}${progress.phase === "verifying" ? "…" : `: ${progress.percent}%`}`
                  : source === "web"
                    ? "Starting website analysis…"
                    : "Creating project…"}
            </label>
            <progress
              id="create-progress"
              max={100}
              {...(building !== null
                ? { value: building }
                : progress && progress.phase !== "verifying"
                  ? { value: progress.percent }
                  : {})}
            />
            {building !== null && (
              <p className="flow-caption flow-muted">
                Each screen is held for a few seconds so it gets its own
                explanation. Keep this tab open.
              </p>
            )}
            {source !== "web" &&
              (building !== null ||
                (progress && progress.phase !== "verifying")) && (
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => controller.current?.abort()}
                >
                  {building !== null ? "Stop" : "Pause upload"}
                </button>
              )}
          </div>
        )}
        {error && (
          <p className="flow-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="sheet-footer">
        <button
          className="button"
          type="button"
          onClick={() => void close()}
          disabled={busy || activeRecording}
        >
          Cancel
        </button>
        {choosing ? (
          <button
            className="button button-primary"
            type="button"
            onClick={() => void chooseSource()}
            disabled={
              requestingCapture ||
              !screenSupported ||
              !storageChecked ||
              !adapter.capabilities.upload
            }
          >
            <Icon name="record" />
            {requestingCapture ? "Choose a source…" : "Choose what to record"}
          </button>
        ) : (
          <button
            className="button button-primary"
            type="submit"
            disabled={
              busy ||
              activeRecording ||
              (source !== "web" &&
                ((screenshots ? !shots.length : !file) ||
                  !adapter.capabilities.upload))
            }
          >
            {created && error ? "Try again" : label}
          </button>
        )}
      </footer>
    </form>
  );
}
