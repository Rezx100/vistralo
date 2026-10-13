import React from "react";
export function RestoringSession({
  stalled,
  onRetry,
}: {
  stalled: boolean;
  onRetry: () => void;
}) {
  return (
    <main className="login-page">
      <div className="login-card">
        <h1>Vistralo</h1>
        {stalled ? (
          <>
            <p role="alert">
              Vistralo cannot reach its sign-in service. Check your
              connection, or try another network if this one blocks it.
            </p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => onRetry()}
            >
              Try again
            </button>
          </>
        ) : (
          <p role="status">Restoring your session…</p>
        )}
      </div>
    </main>
  );
}
export function NoWorkspaceScreen({
  theme,
  noWorkspace,
  onRetry,
  onSignOut,
}: {
  theme: string;
  noWorkspace: { reason: string; email: string };
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="login-page">
      <div className="login-card">
        <img src={`/assets/brand/emblem-${theme === "dark" ? "light" : "dark"}.svg`} width="32" height="32" alt="" />
        <h1>This account has no workspace yet</h1>
        <p role="alert">{noWorkspace.reason}</p>
        {noWorkspace.email && <p className="caption">Signed in as {noWorkspace.email}</p>}
        <button type="button" className="button button-primary" onClick={() => onRetry()}>
          Try again
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={() => onSignOut()}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
