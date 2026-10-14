import { CloudLogin } from "./features/CloudLogin";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { createAdapter } from "./adapters";
import type { AppMode, Project } from "./contracts";
import { NavigationProgress, ToolButton } from "./components/Primitives";
import { Projects } from "./features/Projects";
import { States } from "./features/States";
import { CreateProject } from "./features/CreateProject";
import { flowFor, type CreateFlow } from "./features/create-flows";
import { ProjectDetail } from "./features/ProjectDetail";
import {
  BillingBanner,
  PricingPage,
  TestCheckout,
  UpgradeDialog,
  useBilling,
} from "./billing/Billing";
import { AI_FLOWS, limitReached } from "./billing/plans";
import { AppModal } from "./app/AppModal";
import { DeleteProjectsDialog, EditProjectsDialog } from "./app/ProjectDialogs";
import { counted, projectActions, type Undo } from "./app/projectActions";
import { Rail } from "./app/Rail";
import { RecordControl, rememberRecordFlow, storedRecordFlow } from "./app/RecordControl";
import { getMode, route, useHashRoute } from "./app/routing";
import { NoWorkspaceScreen, RestoringSession } from "./app/SessionScreens";
import { SettingsPage, usePreferences } from "./app/Settings";
import { ShareDialog } from "./app/ShareDialog";
import { SharedPage } from "./app/SharedPage";
import { useCreateShortcut, useSidebarShortcut } from "./app/Shortcuts";
import { Toast, useToastDismiss } from "./app/Toast";
import { useNavigation } from "./app/useNavigation";
import { useOpenedProject, useProjectPolling, useRefresh, type Library } from "./app/useProjects";
import { useSessionRestore } from "./app/useSession";
import { useExtensionImport } from "./app/useExtensionImport";
export default function App() {
  const [mode, setMode] = useState<AppMode>(getMode),
    [path, setPath] = useState(route),
    [projects, setProjects] = useState<Project[]>([]),
    [library, setLibrary] = useState<Library>({ total: 0, complete: false }),
    [loading, setLoading] = useState(true),
    [authenticated, setAuthenticated] = useState(false),
    [sessionReady, setSessionReady] = useState(() => getMode() !== "cloud"),
    [sessionStalled, setSessionStalled] = useState(false),
    [sessionAttempt, setSessionAttempt] = useState(0),
    [error, setError] = useState(""),
    [noWorkspace, setNoWorkspace] = useState<{ reason: string; email: string } | null>(null),
    [collapsed, setCollapsed] = useState(
      () => localStorage.getItem("vistralo-rail") === "collapsed",
    ),
    [drawer, setDrawer] = useState(false),
    [mobileNavigation, setMobileNavigation] = useState(
      () => window.matchMedia("(max-width: 767px)").matches,
    ),
    [menu, setMenu] = useState(""),
    [modal, setModal] = useState(""),
    [flow, setFlow] = useState<CreateFlow | null>(null),
    [recordFlow, setRecordFlow] = useState<CreateFlow>(storedRecordFlow),
    // The page a recording from the Chrome extension was made on, offered as the website URL.
    [imported, setImported] = useState<{ url: string } | null>(null),
    // The project saved a moment ago, whose page opens with the share link offered first.
    [fresh, setFresh] = useState<string | null>(null),
    [share, setShare] = useState<Project[] | null>(null),
    [edit, setEdit] = useState<{ kind: string; projects: Project[] } | null>(
      null,
    ),
    [deleting, setDeleting] = useState<string[] | null>(null),
    [message, setMessage] = useState(""),
    [undo, setUndo] = useState<Undo | null>(null),
    [theme, setTheme] = useState(
      () => localStorage.getItem("vistralo-theme") || "light",
    ),
    [locale, setLocale] = useState(
      () => localStorage.getItem("vistralo-locale") || "en",
    ),
    [direction, setDirection] = useState(
      () => localStorage.getItem("vistralo-direction") || "ltr",
    ),
    [profile, setProfile] = useState({
      // Neutral until the account loads; a real person's name here would show to everyone.
      name: getMode() === "demo" ? "Demo user" : "Account",
      email: "",
      workspace: getMode() === "demo" ? "Demo workspace" : "Workspace",
    });
  const adapter = useMemo(() => createAdapter(mode), [mode]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const navigationRef = useRef<HTMLElement>(null);
  const drawerReturnFocus = useRef<HTMLElement | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const notify = useCallback((s: string, error = false) => {
    setToastTone(error ? "error" : "success");
    setMessage(s);
  }, []);
  const billing = useBilling({
    adapter,
    mode,
    active: mode === "demo" || (sessionReady && authenticated),
    theme,
    locale,
    notify,
    showPlans: () => {
      setModal("");
      setFlow(null);
      setShare(null);
      go("pricing");
    },
  });
  useToastDismiss(message, undo, setMessage);
  const { refresh, sync } = useRefresh({
    adapter,
    mode,
    notify,
    setProjects,
    setLibrary,
    setAuthenticated,
    setError,
    setNoWorkspace,
    setLoading,
  });
  useHashRoute({
    mode,
    setPath,
    setMode,
    setProjects,
    setLoading,
    setSessionReady,
    setAuthenticated,
    setDrawer,
    setMenu,
  });
  useSessionRestore({
    mode,
    sessionAttempt,
    setSessionReady,
    setSessionStalled,
    setAuthenticated,
    setProjects,
  });
  useProjectPolling({
    refresh,
    sync,
    adapter,
    mode,
    sessionReady,
    authenticated,
    setProfile,
  });
  usePreferences(theme, locale, direction);
  useNavigation({
    mode,
    authenticated,
    collapsed,
    mobileNavigation,
    drawer,
    navigationRef,
    drawerReturnFocus,
    setMobileNavigation,
    setDrawer,
    setMenu,
  });
  useSidebarShortcut({
    mobileNavigation,
    drawer,
    drawerReturnFocus,
    setDrawer,
    setMenu,
    setCollapsed,
  });
  useCreateShortcut(mobileNavigation, setMenu);
  const projectId = path[0] === "project" ? path[1] : undefined;
  const opened = useOpenedProject(
    adapter,
    projectId,
    projectId ? projects.find((p) => p.id === projectId) : undefined,
    !loading && (mode === "demo" || authenticated),
  );
  function go(to: string) {
    location.hash = (mode === "demo" ? "demo/" : "") + to;
  }
  // Asked before a create flow opens, so nobody records or uploads and is then refused.
  function startFlow(next: CreateFlow) {
    const kind = limitReached(billing.state, "projects")
      ? "projects"
      : AI_FLOWS.has(next) && limitReached(billing.state, "jobs")
        ? "jobs"
        : null;
    if (kind) billing.setUpgrade(kind);
    else {
      // The Record button starts whichever way of recording was used last.
      rememberRecordFlow(next);
      setRecordFlow(storedRecordFlow());
      setFlow(next);
    }
  }
  useExtensionImport({
    path,
    active: mode === "demo" || (sessionReady && authenticated),
    notify,
    start: (next, recording) => {
      setImported(recording);
      startFlow(next);
    },
    leave: () => go(""),
  });
  function openBilling() {
    go("settings/billing");
  }
  // Settings and the profile are pages; everything else the rail opens is still a dialog.
  const openModal: typeof setModal = (next) => {
    if (next === "settings") go("settings");
    else if (next === "profile") go("settings/profile");
    else setModal(next);
  };
  const { open, run, bulk, actions } = projectActions({
    adapter,
    mode,
    projects,
    toastTimer,
    notify,
    refresh,
    go,
    setUndo,
    setDeleting,
    setShare,
    setEdit,
  });
  if (location.pathname.startsWith("/share/")) return <SharedPage />;
  if (mode === "demo" && path[0] === "share")
    return <SharedPage demoId={path[1]} />;
  if (mode === "cloud" && !sessionReady)
    return (
      <RestoringSession
        stalled={sessionStalled}
        onRetry={() => setSessionAttempt((attempt) => attempt + 1)}
      />
    );
  if (mode === "cloud" && !authenticated && billing.enabled && path[0] === "pricing")
    return (
      <main className="plans-public">
        <PricingPage billing={billing} onSignIn={() => go("projects")} />
      </main>
    );
  if (mode === "cloud" && (!authenticated || new URLSearchParams(location.search).get("recovery") === "1"))
    return <CloudLogin theme={theme} onPlans={billing.enabled ? () => go("pricing") : undefined} onReady={async () => { await refresh(); const s = await adapter.settings(); setProfile(p => ({...p,name:String(s.displayName||p.name),email:String(s.email||p.email),workspace:String(s.name||p.workspace)})); }} />;
  // Signed in but with no workspace: the shell would only offer actions that fail.
  if (mode === "cloud" && noWorkspace)
    return (
      <NoWorkspaceScreen
        theme={theme}
        noWorkspace={noWorkspace}
        onRetry={() => refresh()}
        onSignOut={async () => {
          await adapter.logout().catch(() => {});
          setNoWorkspace(null);
          setError("");
          setAuthenticated(false);
          setProjects([]);
        }}
      />
    );
  const current = opened.project,
    view = path[0] || "projects";
  return (
    <div
      className={`app-shell ${collapsed ? "rail-collapsed" : ""} ${drawer ? "drawer-open" : ""}`}
    >
      <a
        className="skip-link"
        inert={mobileNavigation && drawer}
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.querySelector<HTMLElement>("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <button
        className="drawer-scrim"
        aria-label="Close navigation"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => {
          setDrawer(false);
          setMenu("");
        }}
      />
      <Rail
        navigationRef={navigationRef}
        mode={mode}
        theme={theme}
        locale={locale}
        projects={projects}
        view={view}
        profile={profile}
        billing={billing}
        mobileNavigation={mobileNavigation}
        drawer={drawer}
        collapsed={collapsed}
        menu={menu}
        setCollapsed={setCollapsed}
        setDrawer={setDrawer}
        setMenu={setMenu}
        setModal={openModal}
        go={go}
        open={open}
        openBilling={openBilling}
        recordFlow={recordFlow}
        create={startFlow}
        onSignOut={() =>
          run(async () => {
            await adapter.logout();
            if (mode === "demo") {
              location.hash = "projects";
              location.reload();
            } else {
              setAuthenticated(false);
              setProjects([]);
            }
          })
        }
      />
      <div className="content-shell" inert={mobileNavigation && drawer}>
        <div className="mobile-navigation">
          <ToolButton
            id="navigation-trigger"
            icon="sidebar"
            label="Open navigation"
            aria-expanded={drawer}
            aria-controls="workspace-navigation"
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              drawerReturnFocus.current = event.currentTarget;
              setDrawer(true);
            }}
          />
          <span>Vistralo</span>
          {mode === "demo" && <small>Demo</small>}
          <RecordControl
            placement="bar"
            flow={recordFlow}
            create={startFlow}
            menuOpen={menu === "create-bar"}
            onMenu={(open) => setMenu(open ? "create-bar" : "")}
          />
        </div>
        <main id="main-content" tabIndex={-1}>
          <NavigationProgress pending={loading} />
          {error && authenticated && (
            <div className="notice error-message">
              <span>{error}</span>
              <button className="button" onClick={refresh}>
                Retry connection
              </button>
            </div>
          )}
          {billing.enabled && <BillingBanner billing={billing} locale={locale} />}
          {view === "pricing" && billing.enabled ? (
            <PricingPage billing={billing} onBack={() => go("projects")} />
          ) : view === "settings" ? (
            <SettingsPage
              tab={path[1]}
              go={go}
              adapter={adapter}
              billing={billing}
              mode={mode}
              theme={theme}
              setTheme={setTheme}
              locale={locale}
              setLocale={setLocale}
              direction={direction}
              setDirection={setDirection}
              profile={profile}
              setProfile={setProfile}
              run={run}
              notify={notify}
            />
          ) : view === "states" && mode === "demo" ? (
            <States adapter={adapter} projects={projects} notify={notify} />
          ) : view === "project" ? (
            current ? (
              <ProjectDetail
                key={current.id}
                project={current}
                adapter={adapter}
                onBack={() => go("projects")}
                onChanged={() => refresh()}
                notify={notify}
                fresh={fresh === current.id}
                onShare={() => setShare([current])}
                onFreshDone={() => setFresh(null)}
              />
            ) : loading || opened.pending ? (
              <div className="project-opening" role="status">
                <div className="thumbnail is-blank" />
                <p>Opening project…</p>
              </div>
            ) : (
              <section className="empty-state">
                <h1>Project unavailable</h1>
                <p>
                  It may have been deleted, or this address belongs to a different
                  workspace from the one you are signed in to.
                </p>
                <button className="button" onClick={() => go("projects")}>
                  Back to projects
                </button>
              </section>
            )
          ) : (
            <Projects
              projects={projects}
              view={view === "states" || view === "pricing" ? "projects" : view}
              adapter={adapter}
              locale={locale}
              create={startFlow}
              onOpen={open}
              actions={actions}
              onShare={(p) => setShare([p])}
              bulk={bulk}
              loading={loading}
              library={library}
              onShortcuts={() => setModal("shortcuts")}
            />
          )}
        </main>
      </div>
      <Toast
        message={message}
        tone={toastTone}
        undo={undo}
        inert={mobileNavigation && drawer}
        onUndo={(ids) =>
          run(async () => {
            await adapter.restore(ids);
            setUndo(null);
          }, `${counted(ids.length)} restored`)
        }
        onDismiss={() => setMessage("")}
      />
      {flow && (
        <CreateProject
          key={flow}
          source={flowFor(flow).source}
          flow={flow}
          adapter={adapter}
          imported={imported}
          onClose={() => {
            setFlow(null);
            setImported(null);
          }}
          notify={notify}
          onCreated={(p) => {
            setFlow(null);
            setImported(null);
            setFresh(p.id);
            sync.upsert(p);
            open(p);
            void refresh();
          }}
        />
      )}
      {share && (
        <ShareDialog
          projects={share}
          adapter={adapter}
          maxDays={
            billing.state?.enforce && !billing.state.admin
              ? billing.state.limits.shareDays
              : 30
          }
          onClose={() => {
            setShare(null);
            refresh();
          }}
          notify={notify}
        />
      )}{" "}
      {billing.upgrade && (
        <UpgradeDialog
          billing={billing}
          kind={billing.upgrade}
          onClose={() => billing.setUpgrade(null)}
          onPlans={() => {
            billing.setUpgrade(null);
            billing.act("plans");
          }}
        />
      )}
      <TestCheckout billing={billing} />
      {edit && (
        <EditProjectsDialog
          edit={edit}
          adapter={adapter}
          notify={notify}
          refresh={refresh}
          onClose={() => setEdit(null)}
        />
      )}
      {deleting && (
        <DeleteProjectsDialog
          deleting={deleting}
          adapter={adapter}
          run={run}
          onClose={() => setDeleting(null)}
        />
      )}
      {modal && (
        <AppModal
          modal={modal}
          setModal={setModal}
          adapter={adapter}
          run={run}
        />
      )}
    </div>
  );
}
