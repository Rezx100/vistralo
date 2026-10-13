import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <main className="login-page">
        <div className="login-card" role="alert">
          <h1>Something went wrong</h1>
          <p>
            Vistralo hit an error it could not recover from. Reloading usually
            clears it. Nothing you saved is lost.
          </p>
          <p className="caption">{this.state.error}</p>
          <button className="button button-primary" onClick={() => location.reload()}>
            Reload Vistralo
          </button>
        </div>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
