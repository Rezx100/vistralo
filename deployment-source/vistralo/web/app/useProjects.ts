import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { cloud, NoWorkspaceError } from "../cloud";
import type { AppMode, Project, WorkspaceAdapter } from "../contracts";
import { statusText } from "../utils";
import type { Profile } from "./ProfileForm";
import { ProjectSync } from "./projectSync";
export type NoWorkspace = { reason: string; email: string };
/** How much of the workspace the library has read so far. */
export type Library = { total: number; complete: boolean };
export function useRefresh({
  adapter,
  mode,
  notify,
  setProjects,
  setLibrary,
  setAuthenticated,
  setError,
  setNoWorkspace,
  setLoading,
}: {
  adapter: WorkspaceAdapter;
  mode: AppMode;
  notify: (s: string, error?: boolean) => void;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setLibrary: Dispatch<SetStateAction<Library>>;
  setAuthenticated: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNoWorkspace: Dispatch<SetStateAction<NoWorkspace | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
}) {
  const sync = useMemo(
    () =>
      new ProjectSync(adapter, (state) => {
        setProjects(state.projects);
        setLibrary({ total: state.total, complete: state.complete });
      }),
    [adapter],
  );
  const refreshInFlight = useRef(false);
  const refreshFailures = useRef(0);
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return [];
    refreshInFlight.current = true;
    try {
      const { projects, changed } = await sync.refresh();
      if (changed.length)
        notify(
          changed
            .map(
              (p) =>
                `${p.name}: ${statusText(p)}`,
            )
            .join(". "),
        );
      setAuthenticated(true);
      setError("");
      setNoWorkspace(null);
      refreshFailures.current = 0;
      return projects;
    } catch (e) {
      const failure = (e as Error).message;
      // A large upload can saturate the connection and cut one poll short; the next poll usually succeeds.
      const transient = /TypeError|NetworkError|Failed to fetch|Load failed|Content-Length/i.test(failure);
      if (transient && ++refreshFailures.current < 2) return [];
      setError(failure);
      if (e instanceof NoWorkspaceError) {
        const stored = await cloud?.auth.getSession();
        setNoWorkspace({ reason: failure, email: stored?.data.session?.user.email || "" });
      }
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
  }, [sync, mode]);
  return { refresh, sync };
}
export function useProjectPolling({
  refresh,
  sync,
  adapter,
  mode,
  sessionReady,
  authenticated,
  setProfile,
}: {
  refresh: () => Promise<Project[]>;
  sync: ProjectSync;
  adapter: WorkspaceAdapter;
  mode: AppMode;
  sessionReady: boolean;
  authenticated: boolean;
  setProfile: Dispatch<SetStateAction<Profile>>;
}) {
  useEffect(() => {
    if (mode === "cloud" && (!sessionReady || !authenticated)) {
      // Signed out: the next person to sign in starts from an empty library.
      sync.reset();
      return;
    }
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
    const poll = () => {
      if (
        document.visibilityState === "visible" &&
        !document.querySelector("dialog[open]")
      )
        refresh();
    };
    const interval = setInterval(poll, 5000);
    // Coming back to the tab should not wait up to five seconds for what changed meanwhile.
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh, sync, adapter, mode, sessionReady, authenticated]);
}
/**
 * The project for a page opened by address, when the library has not read it yet
 * (a large workspace still loading, or a link to something outside the first chunk).
 */
export function useOpenedProject(
  adapter: WorkspaceAdapter,
  id: string | undefined,
  listed: Project | undefined,
  ready: boolean,
) {
  const [opened, setOpened] = useState<{ id: string; project: Project | null } | null>(null);
  useEffect(() => {
    if (!id || listed || !ready) return;
    let ignore = false;
    adapter
      .project(id)
      .then((detail) => {
        if (!ignore) setOpened({ id, project: detail.project });
      })
      .catch(() => {
        if (!ignore) setOpened({ id, project: null });
      });
    return () => {
      ignore = true;
    };
  }, [adapter, id, !!listed, ready]);
  const match = opened?.id === id ? opened : null;
  return {
    project: listed || match?.project || undefined,
    /** True while the page is still being looked for. */
    pending: !!id && !listed && ready && !match,
  };
}
