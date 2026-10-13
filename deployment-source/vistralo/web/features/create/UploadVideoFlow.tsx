import React from "react";
import type { WorkspaceAdapter } from "../../contracts";
import { errorMessage, formatBytes, validateVideo } from "../flow-utils";
import { Icon } from "../../components/Icon";
import { SheetToggle } from "../../components/Primitives";

export function UploadVideoFlow({
  file,
  setFile,
  voiceover,
  setVoiceover,
  busy,
  adapter,
  offersVoiceover,
  siteUrlField,
  setError,
}: {
  file: File | null;
  setFile: (file: File | null) => void;
  voiceover: boolean;
  setVoiceover: (voiceover: boolean) => void;
  busy: boolean;
  adapter: WorkspaceAdapter;
  offersVoiceover: boolean;
  siteUrlField: React.ReactNode;
  setError: (message: string) => void;
}) {
  return (
    <>
      <label
        className={`sheet-drop ${file ? "has-file" : ""} ${busy || !adapter.capabilities.upload ? "is-disabled" : ""}`}
      >
        <span className="sheet-drop-icon" aria-hidden="true">
          <Icon name={file ? "video" : "upload"} />
        </span>
        <span className="sheet-drop-text">
          <strong>{file ? file.name : "Choose a recording"}</strong>
          <small>
            {file
              ? `${formatBytes(file.size)} · Choose another file to replace it`
              : `Drop a file here or browse. MP4, WebM, MOV or MKV up to ${adapter.mode === "cloud" ? "50" : "20"} GB.`}
          </small>
        </span>
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mkv,.mp4,.webm,.mov"
          disabled={busy || !adapter.capabilities.upload}
          onChange={(event) => {
            setError("");
            const next = event.target.files?.[0] ?? null;
            try {
              if (next) validateVideo(next, adapter.mode === "cloud");
              setFile(next);
            } catch (failure) {
              setFile(null);
              setError(errorMessage(failure));
            }
          }}
          aria-describedby="upload-help"
        />
      </label>
      <p id="upload-help" className="flow-caption flow-muted">
        {adapter.mode === "cloud"
          ? "Keep this page open while it uploads; if the upload stops, select the same file again to resume."
          : "Interrupted uploads can resume when you select the same file for the same project."}
      </p>
      {offersVoiceover && (
        <div className="sheet-group">
          <SheetToggle
            label="Add an AI voice-over"
            hint={
              voiceover
                ? "After the upload, Vistralo finds every screen in the video, pauses on each one and explains its design in an AI voice. The narrated video is longer than the recording. It uses your OpenAI and HeyGen keys within your cost cap."
                : "The video keeps its own audio. You can add an AI voice-over later from the project."
            }
            checked={voiceover}
            onChange={setVoiceover}
            disabled={busy}
          />
        </div>
      )}
      {voiceover && siteUrlField}
      {!adapter.capabilities.upload && (
        <p className="sheet-note">
          <Icon name="info" />
          <span>
            Uploads are unavailable in this connection. Connect to the
            Vistralo server to upload a recording.
          </span>
        </p>
      )}
    </>
  );
}
