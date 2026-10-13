import { useEffect, type Dispatch, type SetStateAction } from "react";
import { cloudConfigured } from "../cloud";
import type { AppMode, Project } from "../contracts";
export const docsUrl = "https://vistralo.com/#how";
export const getMode = (): AppMode =>
  location.hash.startsWith("#demo") ||
  document
    .querySelector('meta[name="vistralo-mode"]')
    ?.getAttribute("content") === "demo"
    ? "demo"
    : cloudConfigured ? "cloud" : "demo";
export function route() {
  return location.hash
    .replace(/^#(?:demo\/?)?/, "")
    .split("/")
    .filter(Boolean);
}
export function useHashRoute({
  mode,
  setPath,
  setMode,
  setProjects,
  setLoading,
  setSessionReady,
  setAuthenticated,
  setDrawer,
  setMenu,
}: {
  mode: AppMode;
  setPath: Dispatch<SetStateAction<string[]>>;
  setMode: Dispatch<SetStateAction<AppMode>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setSessionReady: Dispatch<SetStateAction<boolean>>;
  setAuthenticated: Dispatch<SetStateAction<boolean>>;
  setDrawer: Dispatch<SetStateAction<boolean>>;
  setMenu: Dispatch<SetStateAction<string>>;
}) {
  useEffect(() => {
    const onHash = () => {
      setPath(route());
      // A new page starts at its top, not wherever the last one was scrolled to.
      window.scrollTo(0, 0);
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
}
