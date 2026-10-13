import React, { type Dispatch, type SetStateAction } from "react";
import type { AppMode, WorkspaceAdapter } from "../contracts";
import { Icon } from "../components/Icon";
import { Dialog } from "../components/Primitives";
import type { Billing } from "../billing/Billing";
import { ProfileForm, type Profile } from "./ProfileForm";
import type { Run } from "./projectActions";
import { docsUrl } from "./routing";
import { SettingsBody, type SettingsTab } from "./Settings";
import { ShortcutList } from "./Shortcuts";
export function AppModal({
  modal,
  setModal,
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
  profile,
  setProfile,
  run,
  notify,
}: {
  modal: string;
  setModal: Dispatch<SetStateAction<string>>;
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
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  run: Run;
  notify: (s: string, error?: boolean) => void;
}) {
  return (
    <Dialog
      title={
        modal === "settings"
          ? "Preferences"
          : modal === "profile"
            ? "Profile"
            : modal === "shortcuts"
              ? "Keyboard shortcuts"
              : modal === "support"
                ? "Contact support"
                : modal === "reset"
                  ? "Reset demo workspace?"
                  : "What’s new"
      }
      icon={
        modal === "settings"
          ? "settings"
          : modal === "profile"
            ? "person"
            : modal === "shortcuts"
              ? "keyboard"
              : modal === "support"
                ? "mail"
                : modal === "reset"
                  ? "restore"
                  : "info"
      }
      tone={modal === "reset" ? "danger" : undefined}
      size={
        modal === "support" || modal === "reset" || modal === "profile"
          ? "compact"
          : "default"
      }
      className={modal === "reset" ? "sheet-alert" : ""}
      closable={modal !== "reset"}
      description={
        modal === "support"
          ? "Contact Dynamix LTD for Vistralo support."
          : modal === "reset"
            ? "This removes this browser’s demo changes and restores the eight fictional projects."
            : modal === "profile"
              ? "These are workspace display details. They do not create a customer account or change studio access."
              : modal === "settings" || modal === "shortcuts"
                ? undefined
                : "A redesigned Projects workspace with search, filters, selection, Trash, persistent project management, resumable uploads, visual briefs, editing and read-only share links."
      }
      onClose={() => setModal("")}
      footer={
        modal === "profile" ? (
          <>
            <button className="button" onClick={() => setModal("")}>
              Cancel
            </button>
            <button form="profile-form" className="button button-primary">
              Save profile
            </button>
          </>
        ) : modal === "support" ? (
          <a
            href="mailto:contact@vistralo.com"
            className="button button-primary"
            data-autofocus
          >
            <Icon name="mail" />
            contact@vistralo.com
          </a>
        ) : modal === "reset" ? (
          <>
            <button
              className="button"
              data-autofocus
              onClick={() => setModal("")}
            >
              Cancel
            </button>
            <button
              className="button button-danger-solid"
              onClick={() =>
                run(async () => {
                  await adapter.rpc("resetDemo");
                  setModal("");
                }, "Demo reset")
              }
            >
              Reset demo
            </button>
          </>
        ) : modal === "settings" || modal === "shortcuts" ? (
          <button
            className="button button-primary"
            data-autofocus={modal === "shortcuts" || undefined}
            onClick={() => setModal("")}
          >
            Done
          </button>
        ) : (
          <a
            className="button button-primary"
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            data-autofocus
          >
            How Vistralo works <Icon name="external" />
          </a>
        )
      }
    >
      {modal === "shortcuts" ? (
        <ShortcutList />
      ) : modal === "settings" ? (
        <SettingsBody
          adapter={adapter}
          billing={billing}
          mode={mode}
          settingsTab={settingsTab}
          setSettingsTab={setSettingsTab}
          theme={theme}
          setTheme={setTheme}
          locale={locale}
          setLocale={setLocale}
          direction={direction}
          setDirection={setDirection}
          health={health}
          setHealth={setHealth}
          run={run}
          notify={notify}
        />
      ) : modal === "profile" ? (
        <ProfileForm
          profile={profile}
          setProfile={setProfile}
          adapter={adapter}
          run={run}
          setModal={setModal}
        />
      ) : modal === "support" ? (
        <p className="caption">
          Include the action that failed and the error message. Keep access
          tokens and private recordings out of your message.
        </p>
      ) : null}
    </Dialog>
  );
}
