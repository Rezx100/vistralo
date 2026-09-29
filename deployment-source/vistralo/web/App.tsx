import { cloudConfigured, cloud } from "./cloud";
import { CloudLogin } from "./features/CloudLogin";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createAdapter, readDemoShare } from "./adapters";
import type {
  AppMode,
  Project,
  ProjectSource,
  ShareLink,
  WorkspaceAdapter,
} from "./contracts";
import { Icon } from "./components/Icon";
import {
  Dialog,
  NavigationProgress,
  Menu,
  TextDialog,
  ToolButton,
  type MenuAction,
} from "./components/Primitives";
import { Projects } from "./features/Projects";
import { States } from "./features/States";
import { CreateProject } from "./features/CreateProject";
import { flowFor, type CreateFlow } from "./features/create-flows";
import { ProjectDetail } from "./features/ProjectDetail";
import { ProviderSettings } from "./features/ProviderSettings";
import { copyText, isTyping, statusText } from "./utils";
const docsUrl = "https://vistralo.com/#how";
const getMode = (): AppMode =>
  location.hash.startsWith("#demo") ||
  document
    .querySelector('meta[name="vistralo-mode"]')
    ?.getAttribute("content") === "demo"
    ? "demo"
    : cloudConfigured ? "cloud" : "demo";
function route() {
  return location.hash
    .replace(/^#(?:demo\/?)?/, "")
    .split("/")
    .filter(Boolean);
}
function RailRow({
  icon,
  label,
  onClick,
  active = false,
  children,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      className={`rail-row tooltip-host ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="rail-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="rail-label">{label}</span>
      {children}
      <span className="tooltip" role="tooltip">
        {label}
      </span>
    </button>
  );
}
function ShareDialog({
  projects,
  adapter,
  onClose,
  notify,
}: {
  projects: Project[];
  adapter: WorkspaceAdapter;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const [links, setLinks] = useState<Array<ShareLink & { name: string }>>([]),
    [days, setDays] = useState<1 | 7 | 30>(7),
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
            <option value="7">7 days</option>
            <option value="30">30 days</option>
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
function SharedPage({ demoId }: { demoId?: string }) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState("");
  useEffect(() => {
    if (demoId) {
      readDemoShare(demoId)
        .then(setData)
        .catch((e) => setError(e.message));
      return;
    }
    fetch(`${location.pathname.replace(/\/$/, "")}/data`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || "This link is unavailable");
        setData(result);
      })
      .catch((e) => setError(e.message));
  }, [demoId]);
  const media = (file: string) =>
    `${location.pathname.replace(/\/$/, "")}/media?${new URLSearchParams({ file })}`;
  const poster = data?.thumbnail
    ? demoId
      ? data.thumbnail
      : media(data.thumbnail.file || data.thumbnail)
    : undefined;
  const video = data?.video
    ? demoId
      ? data.video
      : media(data.video)
    : undefined;
  const downloads = data
    ? demoId
      ? data.files.filter((file: any) =>
          /\.(mp4|webm|mov|mkv|md|pdf)$/i.test(file.file),
        )
      : [data.video, data.briefFile]
          .filter(Boolean)
          .map((file: string) => ({ file, url: `${media(file)}&download=1` }))
    : [];
  return (
    <main className="shared-page">
      <a className="shared-brand" href="/">
        Vistralo
      </a>
      {error ? (
        <>
          <h1>Link unavailable</h1>
          <p>{error}</p>
        </>
      ) : data ? (
        <>
          <h1>{data.project?.name || data.name || "Shared project"}</h1>
          <p>
            {demoId
              ? "Read-only demo link · This browser only"
              : "Read-only shared project"}
          </p>
          {video ? (
            <div className="shared-file">
              <video controls preload="metadata" src={video} poster={poster} />
            </div>
          ) : poster ? (
            <div className="shared-file">
              <img src={poster} alt="Project preview" />
            </div>
          ) : null}
          {data.brief && <pre className="brief-text">{data.brief}</pre>}
          {downloads.map((file: any) => (
            <div className="shared-file" key={file.file}>
              <a href={file.url} download className="button">
                Download {file.file.split("/").pop()}
              </a>
            </div>
          ))}
        </>
      ) : (
        <>
          <h1>Opening shared project</h1>
          <p>Loading…</p>
        </>
      )}
    </main>
  );
}
export default function App() {
  const [mode, setMode] = useState<AppMode>(getMode),
    [path, setPath] = useState(route),
    [projects, setProjects] = useState<Project[]>([]),
    [loading, setLoading] = useState(true),
    [authenticated, setAuthenticated] = useState(false),
    [sessionReady, setSessionReady] = useState(() => getMode() !== "cloud"),
    [error, setError] = useState(""),
    [collapsed, setCollapsed] = useState(
      () => localStorage.getItem("vistralo-rail") === "collapsed",
    ),
    [drawer, setDrawer] = useState(false),
    [mobileNavigation, setMobileNavigation] = useState(
      () => window.matchMedia("(max-width: 767px)").matches,
    ),
    [menu, setMenu] = useState(""),
    [modal, setModal] = useState(""),
    [settingsTab, setSettingsTab] = useState<"general" | "ai">("general"),
    [flow, setFlow] = useState<CreateFlow | null>(null),
    [share, setShare] = useState<Project[] | null>(null),
    [edit, setEdit] = useState<{ kind: string; projects: Project[] } | null>(
      null,
    ),
    [deleting, setDeleting] = useState<string[] | null>(null),
    [message, setMessage] = useState(""),
    [undo, setUndo] = useState<string[] | null>(null),
    [theme, setTheme] = useState(
      () => localStorage.getItem("vistralo-theme") || "dark",
    ),
    [locale, setLocale] = useState(
      () => localStorage.getItem("vistralo-locale") || "en",
    ),
    [direction, setDirection] = useState(
      () => localStorage.getItem("vistralo-direction") || "ltr",
    ),
    [profile, setProfile] = useState({
      name: "Rezan Ferdous",
      email: "",
      workspace: "Rezan’s workspace",
    }),
    [health, setHealth] = useState("");
  const adapter = useMemo(() => createAdapter(mode), [mode]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const previousStatuses = useRef<Record<string, string>>({});
  const navigationRef = useRef<HTMLElement>(null);
  const drawerReturnFocus = useRef<HTMLElement | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const notify = useCallback((s: string, error = false) => {
    setToastTone(error ? "error" : "success");
    setMessage(s);
  }, []);
  useEffect(() => {
    if (!message || undo) return;
    const timer = setTimeout(
      () => setMessage(""),
      Math.min(12000, 5000 + message.length * 40),
    );
    return () => clearTimeout(timer);
  }, [message, undo]);
  const refreshGeneration = useRef(0);
  const refreshInFlight = useRef(false);
  const refreshFailures = useRef(0);
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return [];
    refreshInFlight.current = true;
    const generation = ++refreshGeneration.current;
    try {
      const rows = await adapter.list();
      if (generation !== refreshGeneration.current) return rows;
      const changed = rows.filter(
        (p) =>
          previousStatuses.current[p.id] &&
          previousStatuses.current[p.id] !== p.status,
      );
      if (changed.length)
        notify(
          changed
            .map(
              (p) =>
                `${p.name}: ${statusText(p)}`,
            )
            .join(". "),
        );
      previousStatuses.current = Object.fromEntries(
        rows.map((p) => [p.id, p.status]),
      );
      setProjects(rows);
      setAuthenticated(true);
      setError("");
      refreshFailures.current = 0;
      return rows;
    } catch (e) {
      if (generation !== refreshGeneration.current) return [];
      const failure = (e as Error).message;
      // A large upload can saturate the connection and cut one poll short; the next poll usually succeeds.
      const transient = /TypeError|NetworkError|Failed to fetch|Load failed|Content-Length/i.test(failure);
      if (transient && ++refreshFailures.current < 2) return [];
      setError(failure);
      if (
        mode === "cloud" &&
        /sign in to vistralo|auth session missing/i.test(failure)
      ) {
        const stored = await cloud?.auth.getSession();
        if (!stored?.data.session) setAuthenticated(false);
      }
      return [];
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [adapter, mode]);
  useEffect(() => {
    const onHash = () => {
      setPath(route());
      const next = getMode();
      if (next !== mode) {
        setMode(next);
        setProjects([]);
        setLoading(true);
        if (next === "cloud") setSessionReady(false);
        else setAuthenticated(false);
      }
      setDrawer(false);
      setMenu("");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [mode]);
  useEffect(() => {
    if (mode !== "cloud" || !cloud) {
      setSessionReady(true);
      return;
    }
    let ignore = false;
    setSessionReady(false);
    const subscription = cloud.auth.onAuthStateChange((_event, session) => {
      if (ignore) return;
      setAuthenticated(!!session);
      setSessionReady(true);
      if (!session) setProjects([]);
    });
    cloud.auth.getSession().then(({ data }) => {
      if (ignore) return;
      setAuthenticated(!!data.session);
      setSessionReady(true);
    });
    return () => {
      ignore = true;
      subscription.data.subscription.unsubscribe();
    };
  }, [mode]);
  useEffect(() => {
    if (mode === "cloud" && (!sessionReady || !authenticated)) return;
    refresh();
    adapter
      .settings()
      .then((s) => {
        setProfile((p) => ({
          ...p,
          name: String(s.displayName || p.name),
          email: String(s.email || p.email),
          workspace: String(s.name || p.workspace),
        }));
      })
      .catch(() => {});
    const interval = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !document.querySelector("dialog[open]")
      )
        refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [refresh, adapter, mode, sessionReady, authenticated]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    localStorage.setItem("vistralo-theme", theme);
    localStorage.setItem("vistralo-locale", locale);
    localStorage.setItem("vistralo-direction", direction);
  }, [theme, locale, direction]);
  useEffect(() => {
    localStorage.setItem("vistralo-rail", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);
  useEffect(() => {
    if (mode === "cloud" && !authenticated) {
      setDrawer(false);
      setMenu("");
    }
  }, [mode, authenticated]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const change = () => {
      const wasInNavigation = navigationRef.current?.contains(
        document.activeElement,
      );
      setMobileNavigation(query.matches);
      setDrawer(false);
      setMenu("");
      if (query.matches && wasInNavigation)
        requestAnimationFrame(() =>
          document.getElementById("navigation-trigger")?.focus(),
        );
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!mobileNavigation || !drawer) return;
    const navigation = navigationRef.current;
    if (!navigation) return;
    const focusable = () =>
      Array.from(
        navigation.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.closest("[inert]") &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== "hidden",
      );
    const focusStart = () =>
      (
        navigation.querySelector<HTMLElement>(
          'button[aria-label="Close navigation"]',
        ) ||
        focusable()[0] ||
        navigation
      ).focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusStart();
    const key = (event: KeyboardEvent) => {
      // A native modal opened from navigation owns focus until it closes.
      if (document.querySelector("dialog[open]")) return;
      // The drawer owns keyboard interaction; background window shortcuts must
      // not select projects or open search/create controls behind it.
      event.stopPropagation();
      if (
        event.key === "Escape" ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b")
      ) {
        event.preventDefault();
        setMenu("");
        setDrawer(false);
      } else if (event.key === "Tab") {
        const targets = focusable();
        const first = targets[0],
          last = targets[targets.length - 1];
        if (!first) {
          event.preventDefault();
          navigation.focus();
        } else if (
          !navigation.contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (
        !document.querySelector("dialog[open]") &&
        !navigation.contains(event.target as Node)
      )
        focusStart();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (
          !window.matchMedia("(max-width: 767px)").matches ||
          document.querySelector("dialog[open]")
        )
          return;
        const target = drawerReturnFocus.current;
        if (target?.isConnected && !target.closest("[inert]")) target.focus();
        else document.getElementById("navigation-trigger")?.focus();
      });
    };
  }, [mobileNavigation, drawer]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector("dialog[open]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (mobileNavigation) {
          if (!drawer)
            drawerReturnFocus.current = document.activeElement as HTMLElement;
          setDrawer((value) => !value);
          setMenu("");
        } else setCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mobileNavigation, drawer]);
  function go(to: string) {
    location.hash = (mode === "demo" ? "demo/" : "") + to;
  }
  function open(p: Project) {
    adapter
      .update(p.id, { lastOpened: new Date().toISOString() })
      .catch(() => {});
    go("project/" + p.id);
  }
  async function run(fn: () => Promise<any>, success?: string) {
    try {
      await fn();
      if (success) notify(success);
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function download(p: Project) {
    const detail = await adapter.project(p.id);
    const file =
      detail.project.data.output?.file ||
      detail.project.video ||
      detail.files.find((f) => /\.md$/.test(f.file))?.file;
    if (!file)
      throw Error(
        "No completed output to download yet. Open the project to finish it.",
      );
    const a = document.createElement("a");
    a.href = adapter.media(p.id, file, true);
    a.download = "";
    document.body.append(a);
    a.click();
    a.remove();
  }
  async function trash(ids: string[]) {
    await adapter.trash(ids);
    setUndo(ids);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setUndo(null), 8000);
    notify(
      `${ids.length} ${ids.length === 1 ? "project" : "projects"} moved to Trash`,
    );
    await refresh();
  }
  async function bulk(action: string, ids: string[]) {
    const items = projects.filter((p) => ids.includes(p.id));
    try {
      if (action === "trash") await trash(ids);
      if (action === "restore") {
        await adapter.restore(ids);
        notify(`${ids.length} projects restored`);
        await refresh();
      }
      if (action === "delete") setDeleting(ids);
      if (action === "share") setShare(items);
      if (action === "copy") {
        await copyText(
          items
            .map(
              (p) =>
                new URL(
                  `#${mode === "demo" ? "demo/" : ""}project/${p.id}`,
                  location.href,
                ).href,
            )
            .join("\n"),
        );
        notify("Project links copied. Studio sign-in is required.");
      }
      if (action === "move") setEdit({ kind: "move", projects: items });
      if (action === "download") {
        for (const p of items) await download(p);
        notify(`${items.length} downloads requested`);
      }
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  function actions(p: Project): MenuAction[] {
    if (p.trashed)
      return [
        {
          label: "Restore",
          icon: "restore",
          onClick: () => run(() => adapter.restore([p.id]), "Project restored"),
        },
        {
          label: "Delete permanently",
          icon: "trash",
          danger: true,
          onClick: () => setDeleting([p.id]),
        },
      ];
    const normal: MenuAction[] = [
      { label: "Open", icon: "projects", onClick: () => open(p) },
      {
        label: "Share",
        icon: "people",
        disabled: !adapter.capabilities.share,
        onClick: () => setShare([p]),
      },
      {
        label: "Copy link",
        icon: "link",
        onClick: () =>
          run(
            () =>
              copyText(
                new URL(
                  `#${mode === "demo" ? "demo/" : ""}project/${p.id}`,
                  location.href,
                ).href,
              ),
            "Project link copied. Studio sign-in is required.",
          ),
      },
      {
        label: "Rename",
        icon: "edit",
        separator: true,
        onClick: () => setEdit({ kind: "rename", projects: [p] }),
      },
      {
        label: p.pinned ? "Unpin" : "Pin",
        icon: "pin",
        onClick: () =>
          run(
            () => adapter.update(p.id, { pinned: !p.pinned }),
            p.pinned ? "Project unpinned" : "Project pinned",
          ),
      },
      {
        label: "Duplicate",
        icon: "copy",
        onClick: () => run(() => adapter.duplicate(p.id), "Project duplicated"),
      },
      {
        label: "Move to",
        icon: "folder",
        onClick: () => setEdit({ kind: "move", projects: [p] }),
      },
      ...(p.type === "walkthrough"
        ? [
            {
              label: "Download",
              icon: "download",
              disabled: !p.video && !p.data.output?.file,
              onClick: () => run(() => download(p), "Download requested"),
            },
          ]
        : []),
      {
        label: "Delete",
        icon: "trash",
        separator: true,
        danger: true,
        onClick: () => run(() => trash([p.id])),
      },
    ];
    if (
      p.status === "processing" ||
      p.status === "uploading" ||
      p.status === "queued"
    )
      normal.splice(1, 0, {
        label: "Cancel",
        icon: "close",
        onClick: () =>
          run(
            () => adapter.rpc("cancel", { id: p.id }),
            "Cancellation requested",
          ),
      });
    if (p.status === "failed")
      normal.splice(
        1,
        0,
        {
          label: "Retry",
          icon: "restore",
          onClick: () =>
            p.source === "web" && p.url
              ? run(
                  () => adapter.rpc("walkthrough", { id: p.id, url: p.url }),
                  "Website analysis restarted",
                )
              : open(p),
        },
        {
          label: "Remove",
          icon: "trash",
          onClick: () => run(() => trash([p.id])),
        },
      );
    return normal;
  }
  if (location.pathname.startsWith("/share/")) return <SharedPage />;
  if (mode === "demo" && path[0] === "share")
    return <SharedPage demoId={path[1]} />;
  if (mode === "cloud" && !sessionReady)
    return (
      <main className="login-page">
        <div className="login-card">
          <h1>Vistralo</h1>
          <p>Restoring your session…</p>
        </div>
      </main>
    );
  if (mode === "cloud" && (!authenticated || new URLSearchParams(location.search).get("recovery") === "1"))
    return <CloudLogin onReady={async () => { await refresh(); const s = await adapter.settings(); setProfile(p => ({...p,name:String(s.displayName),email:String(s.email),workspace:String(s.name)})); }} />;
  const current = projects.find((p) => p.id === path[1]),
    view = path[0] || "projects";
  const visible = projects.filter((p) => !p.trashed),
    pinned = visible.filter((p) => p.pinned).slice(0, 5),
    recent = visible
      .filter((p) => p.lastOpened)
      .sort((a, b) => String(b.lastOpened).localeCompare(String(a.lastOpened)))
      .slice(0, 5);
  const navLabels =
    locale === "de"
      ? ["Projekte", "Mit mir geteilt", "Papierkorb"]
      : ["Projects", "Shared with me", "Trash"];
  return (
    <div
      className={`app-shell ${collapsed ? "rail-collapsed" : ""} ${drawer ? "drawer-open" : ""}`}
    >
      <a
        className="skip-link"
        inert={mobileNavigation && drawer}
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.querySelector<HTMLElement>("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <button
        className="drawer-scrim"
        aria-label="Close navigation"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => {
          setDrawer(false);
          setMenu("");
        }}
      />
      <aside
        ref={navigationRef}
        id="workspace-navigation"
        className="rail"
        aria-label="Workspace navigation"
        role={mobileNavigation && drawer ? "dialog" : undefined}
        aria-modal={mobileNavigation && drawer ? true : undefined}
        aria-hidden={mobileNavigation && !drawer ? true : undefined}
        inert={mobileNavigation && !drawer}
        tabIndex={-1}
      >
        <div className="rail-header">
          <a
            className="brand"
            href={`#${mode === "demo" ? "demo/" : ""}projects`}
            aria-label="Vistralo projects"
          >
            <img
              src={
                theme === "dark"
                  ? "/assets/brand/emblem-light.svg"
                  : "/assets/brand/emblem-dark.svg"
              }
              alt=""
              width="24"
              height="24"
            />
            <span>vistralo</span>
          </a>
          <ToolButton
            icon={mobileNavigation ? "close" : "sidebar"}
            label={
              mobileNavigation
                ? "Close navigation"
                : `${collapsed ? "Expand" : "Collapse"} sidebar  Ctrl+B`
            }
            aria-expanded={mobileNavigation ? undefined : !collapsed}
            onClick={() => {
              if (mobileNavigation) {
                setDrawer(false);
                setMenu("");
              } else setCollapsed(!collapsed);
            }}
          />
        </div>
        <div className="workspace-switcher menu-anchor">
          <button
            className="workspace-button tooltip-host"
            aria-haspopup="menu"
            aria-expanded={menu === "workspace"}
            onClick={() => setMenu(menu === "workspace" ? "" : "workspace")}
          >
            <span className="workspace-avatar">
              {profile.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="workspace-copy">
              <strong>{profile.workspace}</strong>
              <small>Free plan</small>
            </span>
            <Icon name="chevronDown" size={16} />
            <span className="tooltip" role="tooltip">
              {profile.workspace}
            </span>
          </button>
          {menu === "workspace" && (
            <Menu
              align="start"
              onClose={() => setMenu("")}
              items={[
                {
                  label: profile.workspace,
                  icon: "check",
                  onClick: () => go("projects"),
                },
                {
                  label: "Workspace settings",
                  icon: "settings",
                  onClick: () => setModal("settings"),
                },
                ...(mode === "demo"
                  ? [
                      {
                        label: "Reset demo workspace",
                        icon: "restore",
                        onClick: () => setModal("reset"),
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </div>
        <nav className="primary-nav" aria-label="Main navigation">
          {["projects", "shared", "trash"].map((v, i) => (
            <RailRow
              key={v}
              icon={["projects", "people", "trash"][i]}
              label={navLabels[i]}
              active={view === v}
              onClick={() => go(v)}
            />
          ))}
        </nav>
        <div className="rail-projects">
          <section>
            <h2>Pinned</h2>
            {pinned.map((p) => (
              <RailRow
                key={p.id}
                icon="pin"
                label={p.name}
                onClick={() => open(p)}
              />
            ))}
            {!pinned.length && (
              <p className="rail-empty">Pin projects for quick access</p>
            )}
          </section>
          <section>
            <h2>Recent</h2>
            {recent.map((p) => (
              <RailRow
                key={p.id}
                icon={p.type === "brief" ? "document" : "video"}
                label={p.name}
                onClick={() => open(p)}
              />
            ))}
            {!recent.length && (
              <p className="rail-empty">Projects you open appear here</p>
            )}
          </section>
        </div>
        <div className="rail-footer">
          <div className="menu-anchor">
            <RailRow
              icon="help"
              label="Help"
              onClick={() => setMenu(menu === "help" ? "" : "help")}
            />
            {menu === "help" && (
              <Menu
                align="start"
                onClose={() => setMenu("")}
                items={[
                  {
                    label: "How Vistralo works",
                    icon: "external",
                    onClick: () =>
                      window.open(docsUrl, "_blank", "noopener,noreferrer"),
                  },
                  {
                    label: "Keyboard shortcuts",
                    icon: "keyboard",
                    key: "?",
                    onClick: () => setModal("shortcuts"),
                  },
                  {
                    label: "What's new",
                    icon: "document",
                    onClick: () => setModal("whatsnew"),
                  },
                  {
                    label: "Contact support",
                    icon: "mail",
                    onClick: () => setModal("support"),
                  },
                ]}
              />
            )}
          </div>
          <RailRow
            icon="settings"
            label="Settings"
            onClick={() => setModal("settings")}
          />
          <div className="account-divider" />
          <div className="menu-anchor">
            <button
              className="account-row tooltip-host"
              aria-haspopup="menu"
              aria-expanded={menu === "account"}
              onClick={() => setMenu(menu === "account" ? "" : "account")}
            >
              <span className="account-avatar">
                {profile.name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{profile.name}</strong>
                <small>
                  {profile.email ||
                    (mode === "demo"
                      ? "Demo · This browser"
                      : "Vistralo workspace")}
                </small>
              </span>
              <Icon name="chevronDown" size={16} />
              <span className="tooltip" role="tooltip">
                {profile.name} · {profile.email || "Vistralo workspace"}
              </span>
            </button>
            {menu === "account" && (
              <Menu
                align="start"
                onClose={() => setMenu("")}
                items={[
                  {
                    label: "Profile",
                    icon: "people",
                    onClick: () => setModal("profile"),
                  },
                  {
                    label: "Preferences",
                    icon: "settings",
                    onClick: () => setModal("settings"),
                  },
                  {
                    label: "Sign out",
                    icon: "logout",
                    separator: true,
                    onClick: () =>
                      run(async () => {
                        await adapter.logout();
                        if (mode === "demo") {
                          location.hash = "projects";
                          location.reload();
                        } else {
                          setAuthenticated(false);
                          setProjects([]);
                        }
                      }),
                  },
                ]}
              />
            )}
          </div>
        </div>
      </aside>
      <div className="content-shell" inert={mobileNavigation && drawer}>
        <div className="mobile-navigation">
          <ToolButton
            id="navigation-trigger"
            icon="sidebar"
            label="Open navigation"
            aria-expanded={drawer}
            aria-controls="workspace-navigation"
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              drawerReturnFocus.current = event.currentTarget;
              setDrawer(true);
            }}
          />
          <span>Vistralo</span>
          {mode === "demo" && <small>Demo</small>}
        </div>
        <main id="main-content" tabIndex={-1}>
          <NavigationProgress pending={loading} />
          {error && authenticated && (
            <div className="notice error-message">
              <span>{error}</span>
              <button className="button" onClick={refresh}>
                Retry connection
              </button>
            </div>
          )}
          {view === "states" && mode === "demo" ? (
            <States adapter={adapter} projects={projects} notify={notify} />
          ) : view === "project" ? (
            current ? (
              <ProjectDetail
                key={current.id}
                project={current}
                adapter={adapter}
                onBack={() => go("projects")}
                onChanged={() => refresh()}
                notify={notify}
              />
            ) : loading ? (
              <p>Opening project…</p>
            ) : (
              <section className="empty-state">
                <h1>Project unavailable</h1>
                <p>
                  It may have been deleted or this link belongs to another
                  studio.
                </p>
                <button className="button" onClick={() => go("projects")}>
                  Back to projects
                </button>
              </section>
            )
          ) : (
            <Projects
              projects={projects}
              view={view === "states" ? "projects" : view}
              adapter={adapter}
              locale={locale}
              create={setFlow}
              onOpen={open}
              actions={actions}
              onShare={(p) => setShare([p])}
              bulk={bulk}
              loading={loading}
              onShortcuts={() => setModal("shortcuts")}
            />
          )}
        </main>
      </div>
      <div
        className="live-status sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </div>
      {message && (
        <div
          key={message}
          className={`toast is-${toastTone}`}
          inert={mobileNavigation && drawer}
        >
          <span className="toast-icon" aria-hidden="true">
            <Icon name={toastTone === "error" ? "warning" : "checkCircle"} />
          </span>
          <span className="toast-message">{message}</span>
          {undo && (
            <button
              className="button button-ghost"
              onClick={() =>
                run(async () => {
                  await adapter.restore(undo);
                  setUndo(null);
                }, "Projects restored")
              }
            >
              Undo
            </button>
          )}
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {flow && (
        <CreateProject
          key={flow}
          source={flowFor(flow).source}
          flow={flow}
          adapter={adapter}
          onClose={() => setFlow(null)}
          notify={notify}
          onCreated={(p) => {
            setFlow(null);
            setProjects((rows) => [p, ...rows.filter((row) => row.id !== p.id)]);
            open(p);
            void refresh();
          }}
        />
      )}
      {share && (
        <ShareDialog
          projects={share}
          adapter={adapter}
          onClose={() => {
            setShare(null);
            refresh();
          }}
          notify={notify}
        />
      )}{" "}
      {edit && (
        <TextDialog
          title={edit.kind === "rename" ? "Rename project" : "Move projects"}
          icon={edit.kind === "rename" ? "edit" : "folder"}
          label={edit.kind === "rename" ? "Project name" : "Folder name"}
          initial={
            edit.kind === "rename"
              ? edit.projects[0].name
              : edit.projects[0].folder || ""
          }
          description={
            edit.kind === "move"
              ? "Organize projects with a folder name. Search includes folder names."
              : undefined
          }
          onClose={() => setEdit(null)}
          onSubmit={async (value) => {
            for (const p of edit.projects)
              await adapter.update(
                p.id,
                edit.kind === "rename" ? { name: value } : { folder: value },
              );
            notify(
              edit.kind === "rename" ? "Project renamed" : "Projects moved",
            );
            await refresh();
          }}
        />
      )}
      {deleting && (
        <Dialog
          title="Permanently delete projects?"
          description={`This permanently deletes ${deleting.length} trashed ${deleting.length === 1 ? "project" : "projects"} and their files. This cannot be undone.`}
          icon="trash"
          tone="danger"
          size="compact"
          className="sheet-alert"
          closable={false}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button
                className="button"
                data-autofocus
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button
                className="button button-danger-solid"
                onClick={() =>
                  run(async () => {
                    await adapter.remove(deleting);
                    setDeleting(null);
                  }, "Projects permanently deleted")
                }
              >
                Delete permanently
              </button>
            </>
          }
        />
      )}
      {modal && (
        <Dialog
          title={
            modal === "settings"
              ? "Preferences"
              : modal === "profile"
                ? "Profile"
                : modal === "shortcuts"
                  ? "Keyboard shortcuts"
                  : modal === "support"
                    ? "Contact support"
                    : modal === "reset"
                      ? "Reset demo workspace?"
                      : "What’s new"
          }
          icon={
            modal === "settings"
              ? "settings"
              : modal === "profile"
                ? "person"
                : modal === "shortcuts"
                  ? "keyboard"
                  : modal === "support"
                    ? "mail"
                    : modal === "reset"
                      ? "restore"
                      : "info"
          }
          tone={modal === "reset" ? "danger" : undefined}
          size={
            modal === "support" || modal === "reset" || modal === "profile"
              ? "compact"
              : "default"
          }
          className={modal === "reset" ? "sheet-alert" : ""}
          closable={modal !== "reset"}
          description={
            modal === "support"
              ? "Contact Dynamix LTD for Vistralo support."
              : modal === "reset"
                ? "This removes this browser’s demo changes and restores the eight fictional projects."
                : modal === "profile"
                  ? "These are workspace display details. They do not create a customer account or change studio access."
                  : modal === "settings" || modal === "shortcuts"
                    ? undefined
                    : "A redesigned Projects workspace with search, filters, selection, Trash, persistent project management, resumable uploads, visual briefs, editing and read-only share links."
          }
          onClose={() => setModal("")}
          footer={
            modal === "profile" ? (
              <>
                <button className="button" onClick={() => setModal("")}>
                  Cancel
                </button>
                <button form="profile-form" className="button button-primary">
                  Save profile
                </button>
              </>
            ) : modal === "support" ? (
              <a
                href="mailto:contact@vistralo.com"
                className="button button-primary"
                data-autofocus
              >
                <Icon name="mail" />
                contact@vistralo.com
              </a>
            ) : modal === "reset" ? (
              <>
                <button
                  className="button"
                  data-autofocus
                  onClick={() => setModal("")}
                >
                  Cancel
                </button>
                <button
                  className="button button-danger-solid"
                  onClick={() =>
                    run(async () => {
                      await adapter.rpc("resetDemo");
                      setModal("");
                    }, "Demo reset")
                  }
                >
                  Reset demo
                </button>
              </>
            ) : modal === "settings" || modal === "shortcuts" ? (
              <button
                className="button button-primary"
                data-autofocus={modal === "shortcuts" || undefined}
                onClick={() => setModal("")}
              >
                Done
              </button>
            ) : (
              <a
                className="button button-primary"
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                data-autofocus
              >
                How Vistralo works <Icon name="external" />
              </a>
            )
          }
        >
          {modal === "shortcuts" ? (
            <dl className="shortcut-list">
              {[
                ["Ctrl / ⌘ K or /", "Search projects"],
                ["N", "New project"],
                ["Ctrl / ⌘ B", "Collapse sidebar"],
                ["Ctrl / ⌘ A", "Select visible projects"],
                ["Esc", "Clear selection / close menu"],
                ["Arrow keys", "Move between projects"],
                ["Enter", "Open focused project"],
                ["Space", "Select focused project"],
                ["?", "Keyboard shortcuts"],
              ].map(([key, label]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          ) : modal === "settings" ? (
            <>
              {adapter.capabilities.providers && (
                <div className="sheet-tabs" role="tablist" aria-label="Preferences">
                  {(
                    [
                      ["general", "General"],
                      ["ai", "AI narration"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      id={`settings-tab-${id}`}
                      aria-selected={settingsTab === id}
                      aria-controls={`settings-panel-${id}`}
                      onClick={() => setSettingsTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {adapter.capabilities.providers && settingsTab === "ai" ? (
                <div
                  role="tabpanel"
                  id="settings-panel-ai"
                  aria-labelledby="settings-tab-ai"
                >
                  <ProviderSettings adapter={adapter} notify={notify} />
                </div>
              ) : (
                <div
                  className="sheet-stack"
                  {...(adapter.capabilities.providers
                    ? {
                        role: "tabpanel",
                        id: "settings-panel-general",
                        "aria-labelledby": "settings-tab-general",
                      }
                    : {})}
                >
                  <div className="sheet-group">
                    <label className="sheet-row">
                      <span>Appearance</span>
                      <select
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                      >
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                      </select>
                    </label>
                    <label className="sheet-row">
                      <span>Language preview</span>
                      <select
                        value={locale}
                        onChange={(e) => setLocale(e.target.value)}
                      >
                        <option value="en">English</option>
                        <option value="de">Deutsch — navigation preview</option>
                      </select>
                    </label>
                    <label className="sheet-row">
                      <span>Text direction</span>
                      <select
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                      >
                        <option value="ltr">Left to right</option>
                        <option value="rtl">Right to left</option>
                      </select>
                    </label>
                    <div className="sheet-row">
                      <span>
                        Studio connection
                        <small>
                          {mode === "demo"
                            ? "Demo mode. Changes stay in this browser."
                            : "Connected to your Vistralo cloud workspace. Access is managed by your administrator."}
                        </small>
                      </span>
                      <button
                        className="button"
                        onClick={() =>
                          run(async () => {
                            const value = await adapter.rpc("check");
                            setHealth(JSON.stringify(value, null, 2));
                          })
                        }
                      >
                        Check
                      </button>
                    </div>
                  </div>
                  {health && <pre className="sheet-code">{health}</pre>}
                  <p className="caption">
                    Dates use your device’s time zone. Reduced motion and high
                    contrast follow your system preferences.
                  </p>
                </div>
              )}
            </>
          ) : modal === "profile" ? (
            <form
              id="profile-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await adapter.settings({
                    name: profile.workspace,
                    displayName: profile.name,
                    email: profile.email,
                  });
                  setModal("");
                }, "Profile saved");
              }}
            >
              <label className="field">
                Name
                <input
                  required
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Email
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) =>
                    setProfile({ ...profile, email: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Workspace name
                <input
                  required
                  value={profile.workspace}
                  onChange={(e) =>
                    setProfile({ ...profile, workspace: e.target.value })
                  }
                />
              </label>
            </form>
          ) : modal === "support" ? (
            <p className="caption">
              Include the action that failed and the error message. Keep access
              tokens and private recordings out of your message.
            </p>
          ) : null}
        </Dialog>
      )}
    </div>
  );
}
