import React, { useEffect, useState } from "react";
import type { WorkspaceAdapter } from "../contracts";
import { Button, Field } from "../components/Controls";
import { Icon } from "../components/Icon";
import { errorMessage } from "./flow-utils";

type Settings = {
  openai: boolean;
  heygen: boolean;
  voiceId: string;
  cap: number;
  workerKey: boolean;
  /** The plan includes AI narration on Vistralo's own keys, so the account's own keys are optional. */
  included?: boolean;
};

/**
 * Whether a key is on file. The key itself is never read back, so this is all the page can show.
 * On a plan that includes AI narration, no key of one's own means the included one is used.
 */
function KeyState({ saved, included }: { saved: boolean; included: boolean }) {
  const label = included ? (saved ? "Your key" : "Included") : saved ? "Saved" : "Not added";
  return (
    <span className={`key-state ${saved || included ? "is-saved" : ""}`.trim()}>
      <Icon name={saved || included ? "checkCircle" : "lock"} />
      {label}
    </span>
  );
}

/**
 * AI narration settings: the workspace's own OpenAI and HeyGen keys, the voice, and the most a
 * single job may cost. Keys are sealed in this browser before they are sent.
 */
export function ProviderSettings({
  adapter,
  notify,
}: {
  adapter: WorkspaceAdapter;
  notify: (message: string) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [openai, setOpenai] = useState("");
  const [heygen, setHeygen] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [cap, setCap] = useState("1.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    adapter
      .rpc("providerSettings")
      .then((value: Settings) => {
        if (cancelled) return;
        setSettings(value);
        setVoiceId(value.voiceId);
        setCap(value.cap.toFixed(2));
      })
      .catch((failure) => {
        if (!cancelled) setError(errorMessage(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await adapter.rpc("providerSave", { openai, heygen, voiceId, cap: Number(cap) });
      setOpenai("");
      setHeygen("");
      setSettings(await adapter.rpc("providerSettings"));
      notify("AI provider settings saved");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const included = !!settings?.included;
  const keyLabel = (name: string, saved: boolean) =>
    included
      ? `Your own ${name} key (optional)`
      : saved
        ? `Replace the ${name} key`
        : `${name} API key`;

  if (!settings && !error)
    return (
      <p className="caption" role="status">
        Loading AI settings…
      </p>
    );

  return (
    <form className="sheet-stack provider-settings" onSubmit={save}>
      {included ? (
        <p>
          Your plan includes AI narration. Vistralo writes it with OpenAI and speaks it with
          HeyGen on its own accounts, so you need no keys. To run narration on your own
          accounts instead, add your keys below.
        </p>
      ) : (
        <p>
          On the Free plan, Vistralo writes the narration with OpenAI and speaks it with HeyGen
          using keys from your own accounts, and each provider bills you for what you use. Pro
          and Studio include AI narration with no keys needed.
        </p>
      )}
      {settings && !settings.workerKey && (
        <p className="provider-notice" role="status">
          <Icon name="warning" />
          The worker that makes walkthroughs has not published its encryption key yet, so
          keys cannot be saved. Try again once it is running.
        </p>
      )}
      <section className="provider-group" aria-labelledby="provider-keys-title">
        <h2 id="provider-keys-title">Provider keys</h2>
        <div className="sheet-group">
          <div className="provider-row">
            <div className="provider-row-head">
              <span>
                OpenAI
                <small>Looks at each screen and drafts the line spoken over it.</small>
              </span>
              <KeyState saved={!!settings?.openai} included={included} />
            </div>
            <Field
              label={keyLabel("OpenAI", !!settings?.openai)}
              hint={settings?.openai ? "Leave empty to keep the saved key." : undefined}
            >
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-…"
                value={openai}
                onChange={(e) => setOpenai(e.target.value)}
              />
            </Field>
          </div>
          <div className="provider-row">
            <div className="provider-row-head">
              <span>
                HeyGen
                <small>Speaks the approved script in the chosen voice.</small>
              </span>
              <KeyState saved={!!settings?.heygen} included={included} />
            </div>
            <Field
              label={keyLabel("HeyGen", !!settings?.heygen)}
              hint={settings?.heygen ? "Leave empty to keep the saved key." : undefined}
            >
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={heygen}
                onChange={(e) => setHeygen(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <p className="provider-sealed">
          <Icon name="lock" />
          Keys are encrypted in this browser for the worker alone. Nobody can read them
          back, including you, so a saved key is shown only as {included ? "“Your key”" : "“Saved”"}.
        </p>
      </section>
      <section className="provider-group" aria-labelledby="provider-voice-title">
        <h2 id="provider-voice-title">Voice and spending</h2>
        <div className="sheet-group">
          <div className="provider-row">
            <Field label="HeyGen voice ID" hint="Leave empty to use the default voice.">
              <input
                value={voiceId}
                spellCheck={false}
                onChange={(e) => setVoiceId(e.target.value)}
              />
            </Field>
          </div>
          <div className="provider-row">
            <Field
              label="Most a job may cost (US dollars)"
              hint={
                included
                  ? "Applies to jobs on your own keys. Jobs on the included keys stay within Vistralo's own limit, which this can lower but not raise. The same request is never sent twice."
                  : "A job whose estimate is higher is refused before anything is sent. The same request is never sent twice."
              }
            >
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                max="50"
                step="0.01"
                required
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </section>
      {error && (
        <p className="field-error" role="alert">
          <Icon name="warning" />
          {error}
        </p>
      )}
      <div>
        <Button variant="primary" type="submit" busy={busy} busyLabel="Saving…">
          Save AI settings
        </Button>
      </div>
    </form>
  );
}
