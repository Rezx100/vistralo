import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { cloud, NoWorkspaceError } from "../cloud";
import type { AppMode, Project, WorkspaceAdapter } from "../contracts";
import { statusText } from "../utils";
import type { Profile } from "./ProfileForm";
export type NoWorkspace = { reason: string; email: string };
export function useRefresh({
  adapter,
  mode,
  notify,
  setProjects,
  setAuthenticated,
  setError,
  setNoWorkspace,
  setLoading,
}: {
  adapter: WorkspaceAdapter;
  mode: AppMode;
  notify: (s: string, error?: boolean) => void;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setAuthenticated: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNoWorkspace: Dispatch<SetStateAction<NoWorkspace | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
}) {
  const previousStatuses = useRef<Record<string, string>>({});
  const refreshGeneration = useRef(0);
  const refreshInFlight = useRef(false);
  const refreshFailures = useRef(0);
  return useCallback(async () => {
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
      setNoWorkspace(null);
      refreshFailures.current = 0;
      return rows;
    } catch (e) {
      if (generation !== refreshGeneration.current) return [];
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
  }, [adapter, mode]);
}
export function useProjectPolling({
  refresh,
  adapter,
  mode,
  sessionReady,
  authenticated,
  setProfile,
}: {
  refresh: () => Promise<Project[]>;
  adapter: WorkspaceAdapter;
  mode: AppMode;
  sessionReady: boolean;
  authenticated: boolean;
  setProfile: Dispatch<SetStateAction<Profile>>;
}) {
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
}
