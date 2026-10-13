import React, { useEffect, useRef, useState } from "react";
import type { Project, ProjectSource, WorkspaceAdapter } from "../contracts";
import { recoverRecording } from "./recording-store";
import { floatingControlsSupported } from "./capture";
import { RecordingTray } from "./RecordingControls";
import type { CreateFlow } from "./create-flows";
import { confirmDialog } from "../components/Primitives";
import { CreateForm } from "./create/CreateForm";
import { RecordFlow } from "./create/RecordFlow";
import { RecordSetup } from "./create/RecordSetup";
import { ScreenshotsFlow } from "./create/ScreenshotsFlow";
import { SiteUrlField } from "./create/SiteUrlField";
import { UploadVideoFlow } from "./create/UploadVideoFlow";
import { WebsiteFlow } from "./create/WebsiteFlow";
import { useFloatingTray, useRecordingMeters, useRecordingSignal } from "./create/recorder-effects";
import { useRecorder } from "./create/useRecorder";
import { useSaveProject } from "./create/useSaveProject";
import "./features.css";

interface Props {
  source: ProjectSource;
  flow?: CreateFlow;
  adapter: WorkspaceAdapter;
  onCreated: (project: Project) => void;
  onClose: () => void;
  notify: (message: string, error?: boolean) => void;
}

export function CreateProject({
  source,
  flow,
  adapter,
  onCreated,
  onClose,
  notify,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    mounted = useRef(true);
  const [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [file, setFile] = useState<File | null>(null);
  const [narrate, setNarrate] = useState(false),
    [voiceover, setVoiceover] = useState(true);
  const [mobile, setMobile] = useState(true);
  const [error, setError] = useState(""),
    // Set when the dialog opens onto a recording left over from an earlier visit.
    [leftOver, setLeftOver] = useState<Date | null>(null),
    [localUrl, setLocalUrl] = useState("");
  const [storageChecked, setStorageChecked] = useState(source !== "screen");
  const screenshots = flow === "narrate-screenshots";
  const [shots, setShots] = useState<File[]>([]);
  const offersVoiceover =
    adapter.mode === "cloud" && adapter.capabilities.providers;
  const rec = useRecorder({ flow, url, mounted, setError, setFile, onDiscard: onClose });
  const {
    recorder,
    spokenTake,
    autoSave,
    spoken,
    setSpoken,
    recording,
    setRecording,
    display,
    floating,
    live,
    recoverySaved,
    setRecoverySaved,
    activeRecording,
    screenSupported,
    trayProps,
    closeFloating,
    popOutControls,
    stopCaptureTracks,
    chooseSource,
  } = rec;
  const { controller, created, busy, progress, building, save } = useSaveProject({
    source,
    flow,
    screenshots,
    adapter,
    name,
    url,
    file,
    shots,
    mobile,
    narrate,
    voiceover,
    spoken,
    activeRecording,
    offersVoiceover,
    mounted,
    setError,
    notify,
    onCreated,
  });
  const siteUrlField = offersVoiceover && (
    <SiteUrlField
      url={url}
      setUrl={setUrl}
      disabled={busy || !!created.current}
    />
  );

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    dialog.current
      ?.querySelector<HTMLInputElement>("input:not([type=checkbox])")
      ?.focus();
    if (source === "screen")
      recoverRecording()
        .then((saved) => {
          if (saved && mounted.current) {
            setFile(saved.file);
            setSpoken(saved.microphone);
            spokenTake.current = saved.microphone;
            setRecording("staged");
            setRecoverySaved(true);
            setLeftOver(new Date(saved.file.lastModified));
          }
          return !!saved;
        })
        .catch(() => false)
        .then((leftOverFound) => {
          if (!mounted.current) return;
          setStorageChecked(true);
          // The click that opened this sheet still counts as the gesture the browser's
          // picker needs, so ask now instead of making the user press a second button.
          if (!leftOverFound && screenSupported && adapter.capabilities.upload)
            void chooseSource(true);
        });
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (recorder.current && recorder.current.state !== "inactive")
        recorder.current.stop();
      stopCaptureTracks();
      closeFloating();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (!file || source !== "screen") {
      setLocalUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setLocalUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, source]);

  useRecordingMeters(rec);

  // Recording must not block the page, so the dialog becomes a non-modal tray.
  useEffect(() => {
    const element = dialog.current;
    if (!element?.open) return;
    const modal = element.matches(":modal");
    if (live && modal) {
      element.close();
      element.show();
    } else if (!live && !modal) {
      element.close();
      element.showModal();
    }
  }, [live]);

  useFloatingTray(rec);
  useRecordingSignal(rec);

  useEffect(() => {
    if (recording !== "staged" || !file || !autoSave.current) return;
    autoSave.current = false;
    void save();
  }, [recording, file]);

  useEffect(() => {
    if (
      !activeRecording &&
      !busy &&
      !(source === "screen" && file && !recoverySaved)
    )
      return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [activeRecording, busy, source, file, recoverySaved]);

  async function close() {
    // Escape during the count-in stops the take before it starts.
    if (rec.counting) {
      rec.cancelCountdown();
      return;
    }
    if (activeRecording) {
      setError(
        "Stop the recording before closing. Your recording will be saved for recovery.",
      );
      return;
    }
    if (busy) {
      setError(
        progress?.phase === "verifying"
          ? "Wait for the import to finish before closing."
          : source === "web"
            ? "Wait for website capture to start before closing."
            : "Pause the upload before closing.",
      );
      return;
    }
    if (
      source === "screen" &&
      file &&
      !recoverySaved &&
      !(await confirmDialog({
        title: "Discard this recording?",
        message:
          "A recovery copy could not be stored in this browser. Download your recording first if you want to keep it.",
        confirmLabel: "Discard and close",
        cancelLabel: "Keep recording",
        tone: "danger",
      }))
    )
      return;
    onClose();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void save();
  }

  return (
    <dialog
      ref={dialog}
      className={
        live
          ? "flow-dialog is-tray"
          : `flow-dialog sheet ${recording === "ready" ? "sheet-wide" : "sheet-default"}`
      }
      {...(live
        ? { "aria-label": "Recording controls" }
        : {
            "aria-labelledby": "create-title",
            "aria-describedby": "create-description",
          })}
      onCancel={(event) => {
        event.preventDefault();
        void close();
      }}
    >
      {live && !floating ? (
        <div className="rec-tray-host">
          <RecordingTray
            {...trayProps}
            canPopOut={floatingControlsSupported && !floating}
            onPopOut={popOutControls}
          />
          {error && (
            <p className="rec-tray-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : live ? (
        error ? (
          <p className="rec-tray-error" role="alert">
            {error}
          </p>
        ) : null
      ) : recording === "ready" && display ? (
        <RecordSetup recorder={rec} display={display} error={error} close={close} />
      ) : (
        <CreateForm
          source={source}
          flow={flow}
          adapter={adapter}
          recorder={rec}
          name={name}
          setName={setName}
          file={file}
          shots={shots}
          screenshots={screenshots}
          storageChecked={storageChecked}
          busy={busy}
          progress={progress}
          building={building}
          controller={controller}
          created={created.current}
          error={error}
          submit={submit}
          close={close}
        >
          {source === "web" ? (
            <WebsiteFlow
              url={url}
              setUrl={setUrl}
              mobile={mobile}
              setMobile={setMobile}
              narrate={narrate}
              setNarrate={setNarrate}
              busy={busy}
              adapter={adapter}
            />
          ) : screenshots ? (
            <ScreenshotsFlow
              shots={shots}
              setShots={setShots}
              busy={busy}
              adapter={adapter}
              offersVoiceover={offersVoiceover}
              siteUrlField={siteUrlField}
              setError={setError}
            />
          ) : source === "upload" ? (
            <UploadVideoFlow
              file={file}
              setFile={setFile}
              voiceover={voiceover}
              setVoiceover={setVoiceover}
              busy={busy}
              adapter={adapter}
              offersVoiceover={offersVoiceover}
              siteUrlField={siteUrlField}
              setError={setError}
            />
          ) : (
            <RecordFlow
              recorder={rec}
              siteUrlField={siteUrlField}
              file={file}
              setFile={setFile}
              localUrl={localUrl}
              leftOver={leftOver}
              setLeftOver={setLeftOver}
              busy={busy}
              setError={setError}
            />
          )}
        </CreateForm>
      )}
    </dialog>
  );
}
