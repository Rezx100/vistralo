import React, { useEffect, useState } from "react";
import type { WorkspaceAdapter } from "../../contracts";
import { errorMessage } from "../flow-utils";
import {
  MAX_SCREENSHOTS,
  orderScreenshots,
  validateScreenshot,
} from "../../slideshow";
import { Icon } from "../../components/Icon";

function ShotThumb({
  file,
  index,
  disabled,
  onRemove,
}: {
  file: File;
  index: number;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <li className="shot-thumb">
      {src && <img src={src} alt="" loading="lazy" decoding="async" />}
      <span className="shot-index" aria-hidden="true">
        {index + 1}
      </span>
      <button
        type="button"
        className="icon-button shot-remove"
        aria-label={`Remove ${file.name}`}
        title={file.name}
        disabled={disabled}
        onClick={onRemove}
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  );
}

export function ScreenshotsFlow({
  shots,
  setShots,
  busy,
  adapter,
  offersVoiceover,
  siteUrlField,
  setError,
}: {
  shots: File[];
  setShots: React.Dispatch<React.SetStateAction<File[]>>;
  busy: boolean;
  adapter: WorkspaceAdapter;
  offersVoiceover: boolean;
  siteUrlField: React.ReactNode;
  setError: (message: string) => void;
}) {
  return (
    <>
      <label
        className={`sheet-drop ${shots.length ? "has-file" : ""} ${busy || !adapter.capabilities.upload ? "is-disabled" : ""}`}
      >
        <span className="sheet-drop-icon" aria-hidden="true">
          <Icon name="image" />
        </span>
        <span className="sheet-drop-text">
          <strong>
            {shots.length
              ? `${shots.length} screenshot${shots.length > 1 ? "s" : ""}`
              : "Choose screenshots"}
          </strong>
          <small>
            {shots.length
              ? "Choose more to add them. They play in file-name order."
              : `PNG, JPEG or WebP, up to ${MAX_SCREENSHOTS}. They play in file-name order.`}
          </small>
        </span>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          disabled={busy || !adapter.capabilities.upload}
          onChange={(event) => {
            setError("");
            const picked = [...(event.target.files ?? [])];
            event.target.value = "";
            try {
              picked.forEach(validateScreenshot);
              const known = new Set(
                shots.map((shot) => `${shot.name}:${shot.size}`),
              );
              const next = orderScreenshots([
                ...shots,
                ...picked.filter(
                  (shot) => !known.has(`${shot.name}:${shot.size}`),
                ),
              ]);
              if (next.length > MAX_SCREENSHOTS)
                throw new Error(
                  `Use up to ${MAX_SCREENSHOTS} screenshots in one walkthrough.`,
                );
              setShots(next);
            } catch (failure) {
              setError(errorMessage(failure));
            }
          }}
        />
      </label>
      {shots.length > 0 && (
        <ol className="shot-strip" aria-label="Screenshots in order">
          {shots.map((shot, index) => (
            <ShotThumb
              key={`${shot.name}:${shot.size}`}
              file={shot}
              index={index}
              disabled={busy}
              onRemove={() =>
                setShots((current) =>
                  current.filter((item) => item !== shot),
                )
              }
            />
          ))}
        </ol>
      )}
      {siteUrlField}
      {!offersVoiceover && (
        <p className="sheet-note">
          <Icon name="info" />
          <span>
            AI narration runs in the Vistralo cloud workspace. Here
            the screenshots are saved as a video you can play and
            download.
          </span>
        </p>
      )}
    </>
  );
}
