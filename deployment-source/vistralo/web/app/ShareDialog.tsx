import React, { useEffect, useState } from "react";
import type { Project, ShareLink, WorkspaceAdapter } from "../contracts";
import { Icon } from "../components/Icon";
import { Dialog } from "../components/Primitives";
import { copyText } from "../utils";
export function ShareDialog({
  projects,
  adapter,
  maxDays = 30,
  onClose,
  notify,
}: {
  projects: Project[];
  adapter: WorkspaceAdapter;
  /** The longest link the workspace's plan allows. */
  maxDays?: number;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const [links, setLinks] = useState<Array<ShareLink & { name: string }>>([]),
    [days, setDays] = useState<1 | 7 | 30>(maxDays < 7 ? 1 : 7),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all(
      projects.map(async (p) =>
        (await adapter.shares(p.id)).map((l) => ({ ...l, name: p.name })),
      ),
    )
      .then((all) => setLinks(all.flat()))
      .catch((e) => setError(e.message));
  }, []);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const next: Array<ShareLink & { name: string }> = [];
      for (const p of projects)
        next.push({ ...(await adapter.share(p.id, days)), name: p.name });
      setLinks((v) => [...v, ...next]);
      notify(
        `${next.length} share ${next.length === 1 ? "link" : "links"} created`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        projects.length === 1
          ? `Share ${projects[0].name}`
          : `Share ${projects.length} projects`
      }
      description="Anyone with the link can view the finished video or visual brief until it expires or you revoke it. Other files and job history stay private."
      icon="share"
      onClose={onClose}
    >
      {adapter.mode === "demo" && (
        <p className="sheet-note">
          <Icon name="info" />
          Demo links work only in this browser. Sign in to your studio to create
          a link others can open.
        </p>
      )}
      <div className="sheet-inline">
        <label className="field">
          Link expires after
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as 1 | 7 | 30)}
          >
            <option value="1">1 day</option>
            <option value="7" disabled={maxDays < 7}>
              7 days
            </option>
            <option value="30" disabled={maxDays < 30}>
              {maxDays < 30 ? "30 days (paid plans)" : "30 days"}
            </option>
          </select>
        </label>
        <button
          className="button button-primary"
          disabled={busy || !adapter.capabilities.share}
          onClick={generate}
        >
          <Icon name="link" />
          {busy ? "Creating…" : "Create read-only link"}
        </button>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {links.length > 0 && (
        <ul className="sheet-group sheet-list share-links" aria-label="Share links">
          {links.map((l) => (
            <li className={`share-link ${l.revoked ? "is-revoked" : ""}`} key={l.id}>
              <div className="share-link-title">
                <strong>{l.name}</strong>
                <small>
                  {l.revoked
                    ? "Revoked"
                    : l.expiresAt
                      ? `Expires ${new Date(l.expiresAt).toLocaleString()}`
                      : "Local demo link"}
                </small>
              </div>
              <div className="share-link-row">
                {l.path || l.url ? (
                  <>
                    <input
                      readOnly
                      aria-label={`Share link for ${l.name}`}
                      value={l.url || new URL(l.path!, location.origin).href}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      className="button"
                      onClick={() =>
                        copyText(l.url || new URL(l.path!, location.origin).href)
                          .then(() => notify("Link copied"))
                          .catch((e) => setError(e.message))
                      }
                    >
                      <Icon name="copy" />
                      Copy link
                    </button>
                  </>
                ) : (
                  <span className="caption">
                    Existing link · token is shown only when created
                  </span>
                )}
                <button
                  className="button button-ghost danger-text"
                  disabled={l.revoked}
                  onClick={async () => {
                    try {
                      await adapter.revoke(l.id);
                      setLinks((v) =>
                        v.map((x) => (x.id === l.id ? { ...x, revoked: true } : x)),
                      );
                      notify("Share link revoked");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
