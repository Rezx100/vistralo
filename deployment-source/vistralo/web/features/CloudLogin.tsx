import React, { useState } from "react";
import { cloud } from "../cloud";
import { billingConfig } from "../billing/config";
import { Button, Field } from "../components/Controls";
import { Icon } from "../components/Icon";

/**
 * Supabase Auth answers in its own words. This says the same thing the way a person would,
 * and what to do about it. Anything it does not recognise is shown as it came.
 */
export function authMessage(error: unknown, email = ""): string {
  const text = error instanceof Error ? error.message : String(error || "");
  const wait = /after (\d+) seconds?/i.exec(text);
  if (/invalid login credentials/i.test(text))
    return "That email and password do not match. Check both and try again.";
  if (/email not confirmed/i.test(text))
    return `Confirm your email address first. We sent a link${email ? ` to ${email}` : ""} when you signed up.`;
  if (wait || /rate limit/i.test(text))
    return wait
      ? `Too many attempts. Wait ${wait[1]} seconds and try again.`
      : "Too many attempts. Wait a minute and try again.";
  if (/password should be at least|weak.password/i.test(text))
    return "Use a password of at least 12 characters.";
  if (/already registered|already exists/i.test(text))
    return "An account with this email already exists. Sign in instead.";
  if (/failed to fetch|networkerror|load failed/i.test(text))
    return "Vistralo could not reach its sign-in service. Check your connection and try again.";
  return text || "Something went wrong. Try again.";
}

export function CloudLogin({
  onReady,
  onPlans,
  theme,
}: {
  onReady: () => Promise<unknown>;
  /** Present when plans are switched on: opens the public price list. */
  onPlans?: () => void;
  /** The emblem has a light and a dark drawing; the wrong one disappears into the page. */
  theme: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [shown, setShown] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false),
    [unconfirmed, setUnconfirmed] = useState(false),
    [creating, setCreating] = useState(false);
  const recovering = new URLSearchParams(location.search).get("recovery") === "1";
  const signingUp = creating && billingConfig.signup && !recovering;
  const legal = billingConfig.legalUrl.replace(/\/$/, "");
  const say = (text: string, error = false) => {
    setMessage(text);
    setFailed(error);
  };
  async function attempt(work: () => Promise<void>) {
    setBusy(true);
    say("");
    setUnconfirmed(false);
    try {
      if (!cloud) throw Error("The cloud connection is not configured.");
      await work();
    } catch (e) {
      setUnconfirmed(/email not confirmed/i.test((e as Error).message));
      say(authMessage(e, email), true);
    } finally {
      setBusy(false);
    }
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      if (signingUp) {
        const created = await cloud!.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        });
        if (created.error) throw created.error;
        // With email confirmation on, there is no session until the link in the message is opened.
        if (!created.data.session) {
          setCreating(false);
          setPassword("");
          say("Check your inbox and confirm your email address, then sign in here.");
          return;
        }
      } else {
        const result = recovering
          ? await cloud!.auth.updateUser({ password })
          : await cloud!.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (recovering) history.replaceState(null, "", "/#projects");
      }
      await onReady();
    });
  };
  const reset = () =>
    attempt(async () => {
      const r = await cloud!.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + "/?recovery=1",
      });
      if (r.error) throw r.error;
      say("If this email has access, check its inbox for a password reset link.");
    });
  const resend = () =>
    attempt(async () => {
      const r = await cloud!.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (r.error) throw r.error;
      say(`We sent the link again to ${email}. It can take a minute to arrive.`);
    });
  return (
    <main className="login-page">
      <aside className="login-aside" aria-label="About Vistralo">
        <p className="login-brand">
          <img src="/assets/brand/emblem-light.svg" width="28" height="28" alt="" />
          vistralo
        </p>
        <p className="login-pitch">
          Record a screen. Get a walkthrough that explains each one.
        </p>
        <ol className="login-steps">
          <li>
            <span className="edge">01</span> It finds every screen in your recording.
          </li>
          <li>
            <span className="edge">02</span> It writes one spoken line for each.
          </li>
          <li>
            <span className="edge">03</span> It holds the picture while the line plays.
          </li>
        </ol>
      </aside>
      <div className="login-card">
        <img
          className="login-emblem"
          src={`/assets/brand/emblem-${theme === "dark" ? "light" : "dark"}.svg`}
          width="32"
          height="32"
          alt=""
        />
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
            <Field label="Email">
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          )}
          <div className="login-password">
            <Field
              label="Password"
              hint={signingUp ? "At least 12 characters." : undefined}
            >
              <input
                type={shown ? "text" : "password"}
                autoComplete={recovering || signingUp ? "new-password" : "current-password"}
                minLength={recovering || signingUp ? 12 : undefined}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="button button-ghost login-reveal"
              aria-label={shown ? "Hide password" : "Show password"}
              aria-pressed={shown}
              onClick={() => setShown(!shown)}
            >
              {shown ? "Hide" : "Show"}
            </button>
          </div>
          {signingUp && legal && (
            <p className="caption">
              By creating an account you agree to the <a href={`${legal}/terms`}>Terms</a> and the{" "}
              <a href={`${legal}/privacy`}>Privacy notice</a>.
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="large"
            busy={busy}
            busyLabel="Connecting…"
          >
            {recovering ? "Save password" : signingUp ? "Create account" : "Sign in"}
          </Button>
        </form>
        {!recovering && !signingUp && (
          <button className="button button-ghost" disabled={busy || !email} onClick={reset}>
            Forgot password?
          </button>
        )}
        {message && (
          <p role="status" className={`login-message ${failed ? "is-error" : ""}`}>
            {failed && <Icon name="warning" size={16} />}
            <span>{message}</span>
          </p>
        )}
        {unconfirmed && email && (
          <button type="button" className="button" disabled={busy} onClick={resend}>
            Send the link again
          </button>
        )}
        {billingConfig.signup && !recovering ? (
          <p className="caption login-switch">
            {signingUp ? "Already have an account?" : "New to Vistralo?"}
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                setCreating(!signingUp);
                say("");
                setUnconfirmed(false);
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
