import React, { useState } from "react";
import { cloud } from "../cloud";
import { billingConfig } from "../billing/config";

export function CloudLogin({
  onReady,
  onPlans,
  theme,
}: {
  onReady: () => Promise<unknown>;
  /** The emblem has a light and a dark drawing; the wrong one disappears into the card. */
  theme: string;
  /** Present when plans are switched on: opens the public price list. */
  onPlans?: () => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [creating, setCreating] = useState(false);
  const recovering = new URLSearchParams(location.search).get("recovery") === "1";
  const signingUp = creating && billingConfig.signup && !recovering;
  const legal = billingConfig.legalUrl.replace(/\/$/, "");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!cloud) throw Error("The cloud connection is not configured.");
      if (signingUp) {
        const created = await cloud.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        });
        if (created.error) throw created.error;
        // With email confirmation on, there is no session until the link in the message is opened.
        if (!created.data.session) {
          setCreating(false);
          setPassword("");
          setMessage("Check your inbox and confirm your email address, then sign in here.");
          return;
        }
      } else {
        const result = recovering
          ? await cloud.auth.updateUser({ password })
          : await cloud.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (recovering) history.replaceState(null, "", "/#projects");
      }
      await onReady();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    try {
      const r = await cloud!.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + "/?recovery=1",
      });
      if (r.error) throw r.error;
      setMessage("If this email has access, check its inbox for a password reset link.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-card">
        <img src={`/assets/brand/emblem-${theme === "dark" ? "light" : "dark"}.svg`} width="32" height="32" alt="" />
        <h1>
          {recovering ? "Set your password" : signingUp ? "Create your Vistralo account" : "Sign in to Vistralo"}
        </h1>
        <p>
          {recovering
            ? "Choose a password with at least 12 characters."
            : signingUp
              ? "Start on the Free plan. We will email a link to confirm your address."
              : "Sign in with the email address that has access to your workspace."}
        </p>
        <form onSubmit={submit}>
          {!recovering && (
            <label className="field">
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          <label className="field">
            Password
            <input
              type="password"
              autoComplete={recovering || signingUp ? "new-password" : "current-password"}
              minLength={recovering || signingUp ? 12 : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {signingUp && <small>At least 12 characters.</small>}
          </label>
          {signingUp && legal && (
            <p className="caption">
              By creating an account you agree to the <a href={`${legal}/terms`}>Terms</a> and the{" "}
              <a href={`${legal}/privacy`}>Privacy notice</a>.
            </p>
          )}
          <button className="button button-primary" disabled={busy}>
            {busy ? "Connecting…" : recovering ? "Save password" : signingUp ? "Create account" : "Sign in"}
          </button>
        </form>
        {!recovering && !signingUp && (
          <button className="button button-ghost" disabled={busy || !email} onClick={reset}>
            Forgot password?
          </button>
        )}
        {message && <p role="status">{message}</p>}
        {billingConfig.signup && !recovering ? (
          <p className="caption login-switch">
            {signingUp ? "Already have an account?" : "New to Vistralo?"}
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                setCreating(!signingUp);
                setMessage("");
              }}
            >
              {signingUp ? "Sign in" : "Create an account"}
            </button>
          </p>
        ) : (
          <p className="caption">
            Need access? Contact <a href="mailto:contact@vistralo.com">contact@vistralo.com</a>.
          </p>
        )}
        {onPlans && !recovering && (
          <button type="button" className="button button-ghost" onClick={onPlans}>
            See plans and prices
          </button>
        )}
      </div>
    </main>
  );
}
