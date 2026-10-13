import React from "react";

// Recordings and uploads cannot tell which page they show, so the address is asked for.
export function SiteUrlField({
  url,
  setUrl,
  disabled,
}: {
  url: string;
  setUrl: (url: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="field">
      <span>
        Website URL <span className="flow-muted">(optional)</span>
      </span>
      <input
        type="text"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={url}
        placeholder="example.com"
        onChange={(event) => setUrl(event.target.value)}
        disabled={disabled}
        aria-describedby="site-url-help"
      />
      <small id="site-url-help">
        If this shows a public website, Vistralo reads its code to name the
        real tech behind each effect.
      </small>
    </label>
  );
}
