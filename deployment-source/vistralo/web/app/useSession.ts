import { useEffect, type Dispatch, type SetStateAction } from "react";
import { cloud } from "../cloud";
import type { AppMode, Project } from "../contracts";
const SESSION_RESTORE_TIMEOUT_MS = 10000;
export function useSessionRestore({
  mode,
  sessionAttempt,
  setSessionReady,
  setSessionStalled,
  setAuthenticated,
  setProjects,
}: {
  mode: AppMode;
  sessionAttempt: number;
  setSessionReady: Dispatch<SetStateAction<boolean>>;
  setSessionStalled: Dispatch<SetStateAction<boolean>>;
  setAuthenticated: Dispatch<SetStateAction<boolean>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
}) {
  useEffect(() => {
    if (mode !== "cloud" || !cloud) {
      setSessionReady(true);
      return;
    }
    let ignore = false;
    setSessionReady(false);
    setSessionStalled(false);
    // An expired session is refreshed over the network. If the sign-in service cannot
    // be reached that never settles, so say so instead of waiting without end.
    const stalled = setTimeout(() => {
      if (!ignore) setSessionStalled(true);
    }, SESSION_RESTORE_TIMEOUT_MS);
    const settle = (signedIn: boolean) => {
      if (ignore) return;
      clearTimeout(stalled);
      setSessionStalled(false);
      setAuthenticated(signedIn);
      setSessionReady(true);
    };
    const subscription = cloud.auth.onAuthStateChange((_event, session) => {
      settle(!!session);
      if (!ignore && !session) setProjects([]);
    });
    cloud.auth
      .getSession()
      .then(({ data }) => settle(!!data.session))
      .catch(() => {
        if (!ignore) setSessionStalled(true);
      });
    return () => {
      ignore = true;
      clearTimeout(stalled);
      subscription.data.subscription.unsubscribe();
    };
  }, [mode, sessionAttempt]);
}
