import React, { useEffect, type Dispatch, type SetStateAction } from "react";
import type { AppMode, WorkspaceAdapter } from "../contracts";
import { ProviderSettings } from "../features/ProviderSettings";
import { BillingSettings, type Billing } from "../billing/Billing";
import type { Run } from "./projectActions";
export type SettingsTab = "general" | "ai" | "billing";
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
export function SettingsBody({
  adapter,
  billing,
  mode,
  settingsTab,
  setSettingsTab,
  theme,
  setTheme,
  locale,
  setLocale,
  direction,
  setDirection,
  health,
  setHealth,
  run,
  notify,
}: {
  adapter: WorkspaceAdapter;
  billing: Billing;
  mode: AppMode;
  settingsTab: SettingsTab;
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>;
  theme: string;
  setTheme: Dispatch<SetStateAction<string>>;
  locale: string;
  setLocale: Dispatch<SetStateAction<string>>;
  direction: string;
  setDirection: Dispatch<SetStateAction<string>>;
  health: string;
  setHealth: Dispatch<SetStateAction<string>>;
  run: Run;
  notify: (s: string, error?: boolean) => void;
}) {
  const settingsTabs: Array<["general" | "ai" | "billing", string]> = [
    ["general", "General"],
    ...(adapter.capabilities.providers
      ? [["ai", "AI narration"] as ["ai", string]]
      : []),
    ...(billing.enabled
      ? [["billing", "Billing"] as ["billing", string]]
      : []),
  ];
  return (
    <>
      {settingsTabs.length > 1 && (
        <div className="sheet-tabs" role="tablist" aria-label="Preferences">
          {settingsTabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-selected={settingsTab === id}
              aria-controls={`settings-panel-${id}`}
              onClick={() => setSettingsTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {adapter.capabilities.providers && settingsTab === "ai" ? (
        <div
          role="tabpanel"
          id="settings-panel-ai"
          aria-labelledby="settings-tab-ai"
        >
          <ProviderSettings adapter={adapter} notify={notify} />
        </div>
      ) : billing.enabled && settingsTab === "billing" ? (
        <div
          role="tabpanel"
          id="settings-panel-billing"
          aria-labelledby="settings-tab-billing"
        >
          <BillingSettings
            billing={billing}
            locale={locale}
            onPlans={() => billing.act("plans")}
          />
        </div>
      ) : (
        <div
          className="sheet-stack"
          {...(settingsTabs.length > 1
            ? {
                role: "tabpanel",
                id: "settings-panel-general",
                "aria-labelledby": "settings-tab-general",
              }
            : {})}
        >
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
                <option value="de">Deutsch — navigation preview</option>
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
                Studio connection
                <small>
                  {mode === "demo"
                    ? "Demo mode. Changes stay in this browser."
                    : "Connected to your Vistralo cloud workspace. Access is managed by your administrator."}
                </small>
              </span>
              <button
                className="button"
                onClick={() =>
                  run(async () => {
                    const value = await adapter.rpc("check");
                    setHealth(JSON.stringify(value, null, 2));
                  })
                }
              >
                Check
              </button>
            </div>
          </div>
          {health && <pre className="sheet-code">{health}</pre>}
          <p className="caption">
            Dates use your device’s time zone. Reduced motion and high
            contrast follow your system preferences.
          </p>
        </div>
      )}
    </>
  );
}
