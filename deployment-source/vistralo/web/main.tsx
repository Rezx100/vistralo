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
        <div>
          <h1>Something went wrong</h1>
          <p>{this.state.error}</p>
          <button className="button" onClick={() => location.reload()}>
            Reload workspace
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
