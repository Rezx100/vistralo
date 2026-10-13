import React, {
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { AppMode, Project } from "../contracts";
import { Icon } from "../components/Icon";
import { Menu, ToolButton } from "../components/Primitives";
import type { Billing } from "../billing/Billing";
import { planLabel } from "../billing/plans";
import type { Profile } from "./ProfileForm";
import { docsUrl } from "./routing";
import { RecordControl } from "./RecordControl";
import type { CreateFlow } from "../features/create-flows";
import { projectTitle } from "../utils";
function RailRow({
  icon,
  label,
  onClick,
  active = false,
  children,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      className={`rail-row tooltip-host ${active ? "active" : ""}`}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="rail-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="rail-label">{label}</span>
      {children}
      <span className="tooltip" role="tooltip">
        {label}
      </span>
    </button>
  );
}
export function Rail({
  navigationRef,
  mode,
  theme,
  locale,
  projects,
  view,
  profile,
  billing,
  mobileNavigation,
  drawer,
  collapsed,
  menu,
  setCollapsed,
  setDrawer,
  setMenu,
  setModal,
  go,
  open,
  openBilling,
  onSignOut,
  recordFlow,
  create,
}: {
  navigationRef: RefObject<HTMLElement | null>;
  mode: AppMode;
  theme: string;
  locale: string;
  projects: Project[];
  view: string;
  profile: Profile;
  billing: Billing;
  mobileNavigation: boolean;
  drawer: boolean;
  collapsed: boolean;
  menu: string;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
  setDrawer: Dispatch<SetStateAction<boolean>>;
  setMenu: Dispatch<SetStateAction<string>>;
  setModal: Dispatch<SetStateAction<string>>;
  go: (to: string) => void;
  open: (p: Project) => void;
  openBilling: () => void;
  onSignOut: () => void;
  recordFlow: CreateFlow;
  create: (flow: CreateFlow) => void;
}) {
  const visible = projects.filter((p) => !p.trashed),
    pinned = visible.filter((p) => p.pinned).slice(0, 5),
    recent = visible
      .filter((p) => p.lastOpened)
      .sort((a, b) => String(b.lastOpened).localeCompare(String(a.lastOpened)))
      .slice(0, 5);
  const navLabels =
    locale === "de"
      ? ["Projekte", "Mit mir geteilt", "Papierkorb"]
      : ["Projects", "Shared with me", "Trash"];
  return (
    <aside
      ref={navigationRef}
      id="workspace-navigation"
      className="rail"
      aria-label="Workspace navigation"
      role={mobileNavigation && drawer ? "dialog" : undefined}
      aria-modal={mobileNavigation && drawer ? true : undefined}
      aria-hidden={mobileNavigation && !drawer ? true : undefined}
      inert={mobileNavigation && !drawer}
      tabIndex={-1}
    >
      <div className="rail-header">
        <a
          className="brand"
          href={`#${mode === "demo" ? "demo/" : ""}projects`}
          aria-label="Vistralo projects"
        >
          <img
            src={
              theme === "dark"
                ? "/assets/brand/emblem-light.svg"
                : "/assets/brand/emblem-dark.svg"
            }
            alt=""
            width="24"
            height="24"
          />
          <span>vistralo</span>
        </a>
        <ToolButton
          icon={mobileNavigation ? "close" : "sidebar"}
          label={
            mobileNavigation
              ? "Close navigation"
              : `${collapsed ? "Expand" : "Collapse"} sidebar  Ctrl+B`
          }
          aria-expanded={mobileNavigation ? undefined : !collapsed}
          onClick={() => {
            if (mobileNavigation) {
              setDrawer(false);
              setMenu("");
            } else setCollapsed(!collapsed);
          }}
        />
      </div>
      <div className="workspace-switcher menu-anchor">
        <button
          className="workspace-button tooltip-host"
          aria-labelledby="workspace-label"
          aria-haspopup="menu"
          aria-expanded={menu === "workspace"}
          onClick={() => setMenu(menu === "workspace" ? "" : "workspace")}
        >
          <span className="workspace-avatar">
            {profile.name
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span className="workspace-copy" id="workspace-label">
            <strong>{profile.workspace}</strong>
            <small>
              {billing.enabled ? planLabel(billing.state) : "Free plan"}
            </small>
          </span>
          <Icon name="chevronDown" size={16} />
          <span className="tooltip" role="tooltip">
            {profile.workspace}
          </span>
        </button>
        {menu === "workspace" && (
          <Menu
            align="start"
            onClose={() => setMenu("")}
            items={[
              {
                label: profile.workspace,
                icon: "check",
                onClick: () => go("projects"),
              },
              {
                label: "Workspace settings",
                icon: "settings",
                onClick: () => setModal("settings"),
              },
              ...(billing.enabled
                ? [
                    {
                      label: "Plan and billing",
                      icon: "sparkle",
                      onClick: openBilling,
                    },
                  ]
                : []),
              ...(mode === "demo"
                ? [
                    {
                      label: "Reset demo workspace",
                      icon: "restore",
                      onClick: () => setModal("reset"),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
      <RecordControl
        placement="rail"
        flow={recordFlow}
        create={create}
        menuOpen={menu === "create"}
        onMenu={(open) => setMenu(open ? "create" : "")}
      />
      <nav className="primary-nav" aria-label="Main navigation">
        {["projects", "shared", "trash"].map((v, i) => (
          <RailRow
            key={v}
            icon={["projects", "people", "trash"][i]}
            label={navLabels[i]}
            active={view === v}
            onClick={() => go(v)}
          />
        ))}
      </nav>
      <div className="rail-projects">
        <section>
          <h2>Pinned</h2>
          {pinned.map((p) => (
            <RailRow
              key={p.id}
              icon="pin"
              label={projectTitle(p, locale)}
              onClick={() => open(p)}
            />
          ))}
          {!pinned.length && (
            <p className="rail-empty">Pin projects for quick access</p>
          )}
        </section>
        <section>
          <h2>Recent</h2>
          {recent.map((p) => (
            <RailRow
              key={p.id}
              icon={p.type === "brief" ? "document" : "video"}
              label={projectTitle(p, locale)}
              onClick={() => open(p)}
            />
          ))}
          {!recent.length && (
            <p className="rail-empty">Projects you open appear here</p>
          )}
        </section>
      </div>
      <div className="rail-footer">
        <div className="menu-anchor">
          <RailRow
            icon="help"
            label="Help"
            onClick={() => setMenu(menu === "help" ? "" : "help")}
          />
          {menu === "help" && (
            <Menu
              align="start"
              onClose={() => setMenu("")}
              items={[
                {
                  label: "How Vistralo works",
                  icon: "external",
                  onClick: () =>
                    window.open(docsUrl, "_blank", "noopener,noreferrer"),
                },
                {
                  label: "Keyboard shortcuts",
                  icon: "keyboard",
                  key: "?",
                  onClick: () => setModal("shortcuts"),
                },
                {
                  label: "What's new",
                  icon: "document",
                  onClick: () => setModal("whatsnew"),
                },
                {
                  label: "Contact support",
                  icon: "mail",
                  onClick: () => setModal("support"),
                },
              ]}
            />
          )}
        </div>
        <RailRow
          icon="settings"
          label="Settings"
          onClick={() => setModal("settings")}
        />
        <div className="account-divider" />
        <div className="menu-anchor">
          <button
            className="account-row tooltip-host"
            aria-labelledby="account-label"
            aria-haspopup="menu"
            aria-expanded={menu === "account"}
            onClick={() => setMenu(menu === "account" ? "" : "account")}
          >
            <span className="account-avatar">
              {profile.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span id="account-label">
              <strong>{profile.name}</strong>
              <small>
                {profile.email ||
                  (mode === "demo"
                    ? "Demo · This browser"
                    : "Vistralo workspace")}
              </small>
            </span>
            <Icon name="chevronDown" size={16} />
            <span className="tooltip" role="tooltip">
              {profile.name} · {profile.email || "Vistralo workspace"}
            </span>
          </button>
          {menu === "account" && (
            <Menu
              align="start"
              onClose={() => setMenu("")}
              items={[
                {
                  label: "Profile",
                  icon: "people",
                  onClick: () => setModal("profile"),
                },
                {
                  label: "Settings",
                  icon: "settings",
                  onClick: () => setModal("settings"),
                },
                {
                  label: "Sign out",
                  icon: "logout",
                  separator: true,
                  onClick: () => onSignOut(),
                },
              ]}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
