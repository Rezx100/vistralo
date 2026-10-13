import React, { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { AppMode, WorkspaceAdapter } from "../contracts";
import { Button } from "../components/Controls";
import { ProviderSettings } from "../features/ProviderSettings";
import { BillingSettings, type Billing } from "../billing/Billing";
import { ProfileForm, type Profile } from "./ProfileForm";
import type { Run } from "./projectActions";
export type SettingsTab = "general" | "profile" | "ai" | "billing";
export function usePreferences(
  theme: string,
  locale: string,
  direction: string,
) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    localStorage.setItem("vistralo-theme", theme);
    localStorage.setItem("vistralo-locale", locale);
    localStorage.setItem("vistralo-direction", direction);
  }, [theme, locale, direction]);
}

/**
 * Settings is a page with its own address, not a window over the page: General, Profile,
 * AI narration (where the workspace uses its own provider keys) and Billing (when plans are on).
 */
export function SettingsPage({
  tab,
  go,
  adapter,
  billing,
  mode,
  theme,
  setTheme,
  locale,
  setLocale,
  direction,
  setDirection,
  profile,
  setProfile,
  run,
  notify,
}: {
  /** From the address: settings, settings/profile, settings/ai, settings/billing. */
  tab: string | undefined;
  go: (to: string) => void;
  adapter: WorkspaceAdapter;
  billing: Billing;
  mode: AppMode;
  theme: string;
  setTheme: Dispatch<SetStateAction<string>>;
  locale: string;
  setLocale: Dispatch<SetStateAction<string>>;
  direction: string;
  setDirection: Dispatch<SetStateAction<string>>;
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  run: Run;
  notify: (s: string, error?: boolean) => void;
}) {
  const [connection, setConnection] = useState("");
  const tabs: Array<[SettingsTab, string]> = [
    ["general", "General"],
    ["profile", "Profile"],
    ...(adapter.capabilities.providers ? [["ai", "AI narration"] as [SettingsTab, string]] : []),
    ...(billing.enabled ? [["billing", "Billing"] as [SettingsTab, string]] : []),
  ];
  const current = tabs.some(([id]) => id === tab) ? (tab as SettingsTab) : "general";
  const open = (id: SettingsTab) => go(id === "general" ? "settings" : `settings/${id}`);
  return (
    <div className="settings-page">
      <header className="page-header">
        <div className="page-heading">
          <h1 tabIndex={-1}>Settings</h1>
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label="Settings">
        {tabs.map(([id, label], index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={current === id}
            aria-controls="settings-panel"
            tabIndex={current === id ? 0 : -1}
            onClick={() => open(id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const step = (event.key === "ArrowRight" ? 1 : -1) * (document.documentElement.dir === "rtl" ? -1 : 1);
              const next = (index + step + tabs.length) % tabs.length;
              open(tabs[next][0]);
              (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        className="settings-panel"
        role="tabpanel"
        id="settings-panel"
        aria-labelledby={`settings-tab-${current}`}
      >
        {current === "ai" ? (
          <ProviderSettings adapter={adapter} notify={notify} />
        ) : current === "billing" ? (
          <BillingSettings
            billing={billing}
            locale={locale}
            onPlans={() => billing.act("plans")}
          />
        ) : current === "profile" ? (
          <div className="sheet-stack">
            <p>
              Your name and workspace name are shown in this workspace. Changing the
              email here does not change the address you sign in with.
            </p>
            <ProfileForm
              profile={profile}
              setProfile={setProfile}
              adapter={adapter}
              run={run}
            />
            <div>
              <Button type="submit" form="profile-form" variant="primary">
                Save profile
              </Button>
            </div>
          </div>
        ) : (
          <div className="sheet-stack">
            <div className="sheet-group">
              <label className="sheet-row">
                <span>Appearance</span>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="sheet-row">
                <span>Language preview</span>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="de">Deutsch (navigation only)</option>
                </select>
              </label>
              <label className="sheet-row">
                <span>Text direction</span>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option value="ltr">Left to right</option>
                  <option value="rtl">Right to left</option>
                </select>
              </label>
              <div className="sheet-row">
                <span>
                  Connection
                  <small role="status">
                    {connection ||
                      (mode === "demo"
                        ? "Demo mode. Changes stay in this browser."
                        : "Connected to your Vistralo cloud workspace.")}
                  </small>
                </span>
                <button
                  className="button"
                  onClick={() =>
                    run(async () => {
                      const value = await adapter.rpc("check");
                      setConnection(connectionText(value));
                    })
                  }
                >
                  Check
                </button>
              </div>
            </div>
            <p className="caption">
              Dates use your device’s time zone. Reduced motion and high
              contrast follow your system preferences.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/** What "Check" found, in a sentence. */
function connectionText(value: any): string {
  if (value?.database === "connected")
    return value.worker
      ? "Connected. The worker that makes walkthroughs is online."
      : "Connected. The worker that makes walkthroughs is offline, so new walkthroughs will wait.";
  if (value?.mode === "demo" || value?.demo) return "Demo mode. Nothing leaves this browser.";
  return "Checked. No problem was reported.";
}
