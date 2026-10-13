import React from "react";
import { areaCaptureSupported, floatingControlsSupported } from "../capture";
import { AreaSelector } from "../RecordingControls";
import { Icon } from "../../components/Icon";
import { SheetHeader } from "../../components/Primitives";
import { DEFAULT_AREA, type ChosenDisplay } from "./recording-media";
import type { Recorder } from "./useRecorder";

export function RecordSetup({
  recorder,
  display,
  error,
  close,
}: {
  recorder: Recorder;
  display: ChosenDisplay;
  error: string;
  close: () => Promise<void>;
}) {
  const {
    selectArea,
    setSelectArea,
    area,
    setArea,
    cancelSource,
    chooseSource,
    beginRecording,
  } = recorder;
  const areaSize =
    display && selectArea && area
      ? `${Math.round(area.width * display.width)} × ${Math.round(area.height * display.height)}`
      : display
        ? `${display.width} × ${display.height}`
        : "";
  const surfaceName =
    display?.surface === "monitor"
      ? "Entire screen"
      : display?.surface === "window"
        ? "Window"
        : display?.surface === "browser"
          ? "Browser tab"
          : "Shared screen";
  return (
    <>
      <SheetHeader
        titleId="create-title"
        descriptionId="create-description"
        icon={selectArea ? "selectArea" : "fullscreen"}
        title="Set up your recording"
        description={
          selectArea
            ? "Drag over the part you want. Everything outside the box is left out."
            : "Everything you shared will be recorded."
        }
        closeLabel="Close create project"
        onClose={() => void close()}
      />
      <div className="sheet-body rec-ready">
        <AreaSelector
          stream={display.stream}
          still={display.surface === "monitor"}
          width={display.width}
          height={display.height}
          area={area}
          selecting={selectArea}
          onChange={setArea}
        />
        <div className="rec-ready-bar">
          <fieldset className="rec-segmented">
            <legend className="sr-only">What to record</legend>
            <label>
              <input
                type="radio"
                name="capture-mode"
                checked={!selectArea}
                onChange={() => setSelectArea(false)}
              />
              <Icon name="fullscreen" />
              {display.surface === "browser"
                ? "Whole tab"
                : display.surface === "window"
                  ? "Whole window"
                  : "Whole screen"}
            </label>
            <label>
              <input
                type="radio"
                name="capture-mode"
                checked={selectArea}
                disabled={!areaCaptureSupported}
                onChange={() => {
                  setSelectArea(true);
                  setArea((current) => current ?? DEFAULT_AREA);
                }}
              />
              <Icon name="selectArea" />
              Select area
            </label>
          </fieldset>
          <p className="flow-caption flow-muted rec-ready-meta">
            {[surfaceName, areaSize].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ul className="rec-tips flow-caption flow-muted">
          {!areaCaptureSupported && <li>Selecting an area needs Chrome or Edge.</li>}
          {display.surface === "browser" && (
            <li>After you press Start recording, switch to the shared tab.</li>
          )}
          <li>
            {floatingControlsSupported
              ? "Recording controls float above your other windows, so you can switch away from this tab."
              : "Recording controls stay at the bottom of this tab."}
          </li>
        </ul>
        {error && (
          <p className="flow-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="sheet-footer">
        <button
          type="button"
          className="button button-ghost sheet-footer-start"
          onClick={() => {
            cancelSource();
            void chooseSource();
          }}
        >
          Choose another source
        </button>
        <button type="button" className="button" onClick={cancelSource}>
          Back
        </button>
        <button
          type="button"
          className="button button-primary rec-start"
          onClick={() => beginRecording()}
          disabled={selectArea && !area}
          autoFocus
        >
          <span className="rec-dot" aria-hidden="true" />
          Start recording
        </button>
      </footer>
    </>
  );
}
