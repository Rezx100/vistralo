import React, { useRef, useState } from "react";
import type { Project, ShareLink, WorkspaceAdapter } from "../../contracts";
import { Button } from "../../components/Controls";
import { Icon } from "../../components/Icon";
import { copyText } from "../../utils";

/**
 * Offered first when a recording has just been saved: one button makes a read-only link and
 * copies it. Making a link is the person's choice, so nothing is shared until they press it.
 */
export function ShareFirst({
  project,
  adapter,
  onMore,
  onDismiss,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  /** Opens the full share dialog: other expiry times, and links already made. */
  onMore: () => void;
  onDismiss: () => void;
}) {
  const [link, setLink] = useState<ShareLink | null>(null),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const working = project.status === "queued" || project.status === "processing";

  async function copy(url: string) {
    try {
      await copyText(url);
      setCopied(true);
    } catch {
      // The clipboard can refuse; the link is on screen and selected instead.
      setCopied(false);
      requestAnimationFrame(() => field.current?.select());
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const made = await adapter.share(project.id, 7);
      setLink(made);
      if (made.url) await copy(made.url);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="share-first" aria-labelledby="share-first-title">
      <span className="share-first-icon" aria-hidden="true">
        <Icon name="checkCircle" />
      </span>
      <div className="share-first-copy">
        <h2 id="share-first-title">Your recording is saved</h2>
        <p>
          {working
            ? "You can share it now. The link plays this recording until the narrated walkthrough is ready, and plays that from then on."
            : "Anyone with the link can watch it, with no account. The link stops working after 7 days."}
          {adapter.mode === "demo" && " In this demo the link opens only in this browser."}
        </p>
        {link?.url && (
          <div className="share-first-link">
            <input
              ref={field}
              readOnly
              value={link.url}
              aria-label="Share link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button icon="copy" onClick={() => void copy(link.url!)}>
              Copy
            </Button>
          </div>
        )}
        <p className="share-first-status" role="status">
          {link ? (copied ? "Link copied." : "Select the link and copy it.") : ""}
        </p>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="share-first-actions">
        {!link && (
          <Button
            variant="primary"
            icon="link"
            busy={busy}
            busyLabel="Making the link…"
            disabled={!adapter.capabilities.share}
            onClick={() => void create()}
          >
            Copy share link
          </Button>
        )}
        <Button variant="ghost" onClick={onMore}>
          {link ? "Manage links" : "More options"}
        </Button>
        <button
          type="button"
          className="icon-button"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <Icon name="close" />
        </button>
      </div>
    </section>
  );
}
