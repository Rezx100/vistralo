import React from "react";
import type { WorkspaceAdapter } from "../../contracts";
import { SheetToggle } from "../../components/Primitives";

export function WebsiteFlow({
  url,
  setUrl,
  mobile,
  setMobile,
  narrate,
  setNarrate,
  busy,
  adapter,
}: {
  url: string;
  setUrl: (url: string) => void;
  mobile: boolean;
  setMobile: (mobile: boolean) => void;
  narrate: boolean;
  setNarrate: (narrate: boolean) => void;
  busy: boolean;
  adapter: WorkspaceAdapter;
}) {
  return (
    <>
      <label className="field">
        Website URL
        <input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={url}
          placeholder="example.com"
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
          aria-describedby="website-help"
        />
        <small id="website-help">
          Public pages only. Sign-in screens and sites that block
          automated access may not be captured.
        </small>
      </label>
      <div className="sheet-group">
        <SheetToggle
          label="Include mobile viewport"
          checked={mobile}
          onChange={setMobile}
          disabled={busy}
        />
        {adapter.capabilities.providers && (
          <SheetToggle
            label="Draft an AI narration script"
            hint={
              narrate
                ? "Evidence frames are sent to OpenAI to draft a script. You review and approve it before any voice is generated, and each request must fit your per-job cost cap."
                : "No paid AI runs in this flow."
            }
            checked={narrate}
            onChange={setNarrate}
            disabled={busy}
          />
        )}
      </div>
    </>
  );
}
