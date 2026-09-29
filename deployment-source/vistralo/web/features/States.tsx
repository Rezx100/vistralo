import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Project, ProjectStatus, WorkspaceAdapter } from "../contracts";
import { ProjectCard, StatusBadge, Thumbnail } from "../components/ProjectCard";
import { Dialog, type MenuAction } from "../components/Primitives";
import { Icon } from "../components/Icon";
import { createDemoFixtures, PROJECT_STATUSES } from "../fixtures";
import {
  absoluteTime,
  accessText,
  copyText,
  relativeTime,
  sourceText,
  typeText,
} from "../utils";
import "../styles/states.css";

type Scenario =
  | "lifecycle"
  | ProjectStatus
  | "loading"
  | "empty"
  | "selected"
  | "list";
type Empty = "workspace" | "search" | "drafts" | "ready" | "shared" | "trash";
interface Props {
  adapter: WorkspaceAdapter;
  projects: Project[];
  notify: (message: string, error?: boolean) => void;
}

const namesGerman: Record<string, string> = {
  "demo-homepage-motion": "Bewegungsabläufe auf der Startseite untersuchen",
  "demo-storefront-review":
    "Gestaltungsprüfung des Online-Shops mit Handlungsempfehlungen",
  "demo-product-references":
    "Referenzsammlung für die ausführliche Produktdemonstration",
  "demo-design-handoff":
    "Übergabe des Gestaltungssystems an das Entwicklungsteam",
  "demo-onboarding-breakdown":
    "Schrittweise Untersuchung des Einführungsprozesses",
  "demo-video-workflow":
    "Arbeitsablauf für die Videobearbeitung und Veröffentlichung",
  "demo-pricing-teardown": "Analyse der Preisübersicht und der Tarifauswahl",
  "demo-checkout-audit":
    "Barrierefreiheitsprüfung des Bestellvorgangs für die Frühlingskampagne und ihre umfangreichen Zielseiten",
  "state-queued": "Website-Analyse wartet auf die nächste Verarbeitung",
};

export function States({ adapter, projects, notify }: Props) {
  const [scenario, setScenario] = useState<Scenario>("lifecycle"),
    [empty, setEmpty] = useState<Empty>("workspace");
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  const [direction, setDirection] = useState<"ltr" | "rtl">(() =>
      document.documentElement.dir === "rtl" ? "rtl" : "ltr",
    ),
    [locale, setLocale] = useState<"en" | "de">(() =>
      document.documentElement.lang.startsWith("de") ? "de" : "en",
    );
  const [selected, setSelected] = useState<string[]>([]),
    [focused, setFocused] = useState(0),
    [inspect, setInspect] = useState<Project | null>(null);
  const [query, setQuery] = useState("xyz"),
    [overrides, setOverrides] = useState<Record<string, Partial<Project>>>({});
  const [forced, setForced] = useState(
    () => matchMedia("(forced-colors: active)").matches,
  );
  const grid = useRef<HTMLDivElement>(null),
    transitionTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fixtures = useMemo(() => {
    const base = createDemoFixtures();
    return [
      ...base,
      {
        ...base[2],
        id: "state-queued",
        name: "Website analysis in queue",
        status: "queued" as const,
        data: {
          demo: true,
          fictional: true,
          simulationState: "Isolated queued state example.",
        },
      },
    ];
  }, []);
  const copies = fixtures.map((project) => ({
    ...project,
    ...overrides[project.id],
    name:
      locale === "de" ? namesGerman[project.id] || project.name : project.name,
  }));
  const shown = PROJECT_STATUSES.includes(scenario as ProjectStatus)
    ? copies.filter((project) => project.status === scenario)
    : copies;
  const german = locale === "de";

  useEffect(() => {
    const root = document.documentElement,
      previous = { theme: root.dataset.theme, dir: root.dir, lang: root.lang };
    return () => {
      if (previous.theme) root.dataset.theme = previous.theme;
      else delete root.dataset.theme;
      root.dir = previous.dir;
      root.lang = previous.lang;
      transitionTimers.current.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.dir = direction;
  }, [direction]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const query = matchMedia("(forced-colors: active)"),
      change = () => setForced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    transitionTimers.current.forEach(clearTimeout);
    transitionTimers.current = [];
    setSelected(
      scenario === "selected" ? [fixtures[0].id, fixtures[1].id] : [],
    );
    setFocused(0);
  }, [scenario]);

  function select(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }
  function focus(index: number) {
    const next = Math.max(0, Math.min(shown.length - 1, index));
    setFocused(next);
    grid.current
      ?.querySelector<HTMLElement>(`[data-card-index="${next}"] .card-title`)
      ?.focus();
  }
  function simulateRetry(project: Project) {
    setOverrides((current) => ({
      ...current,
      [project.id]: { status: "queued", error: undefined },
    }));
    transitionTimers.current.push(
      setTimeout(
        () =>
          setOverrides((current) => ({
            ...current,
            [project.id]: { status: "processing", error: undefined },
          })),
        800,
      ),
    );
    transitionTimers.current.push(
      setTimeout(() => {
        setOverrides((current) => ({
          ...current,
          [project.id]: { status: "draft", error: undefined },
        }));
        notify(
          "State preview finished. No website was analyzed or project changed.",
        );
      }, 2200),
    );
    notify(
      "Previewing retry: queued, processing, then draft. This does not start a server job.",
    );
  }
  function actions(project: Project): MenuAction[] {
    return [
      {
        label: german ? "Zustand untersuchen" : "Inspect state",
        icon: "document",
        onClick: () => setInspect(project),
      },
      ...(project.status === "failed"
        ? [
            {
              label: "Retry",
              icon: "restore",
              onClick: () => simulateRetry(project),
            },
          ]
        : []),
      ...(["queued", "processing", "uploading"].includes(project.status)
        ? [
            {
              label: german ? "Vorschau abbrechen" : "Cancel preview",
              icon: "close",
              onClick: () => {
                transitionTimers.current.forEach(clearTimeout);
                transitionTimers.current = [];
                setOverrides((current) => ({
                  ...current,
                  [project.id]: { status: "draft", progress: undefined },
                }));
                notify(
                  "Preview changed to draft. No running job was cancelled.",
                );
              },
            },
          ]
        : []),
      {
        label: german ? "Zustandsdaten kopieren" : "Copy state JSON",
        icon: "copy",
        onClick: () => {
          void copyText(JSON.stringify(project, null, 2)).then(
            () => notify("Fictional state data copied."),
            (error) => notify(error.message, true),
          );
        },
      },
    ];
  }
  const scenarios: { value: Scenario; label: string }[] = [
    {
      value: "lifecycle",
      label: german ? "Alle Lebenszykluszustände" : "All lifecycle states",
    },
    ...PROJECT_STATUSES.map((value) => ({
      value,
      label: {
        uploading: german ? "Wird hochgeladen" : "Uploading",
        queued: german ? "In der Warteschlange" : "Queued",
        processing: german ? "Wird verarbeitet" : "Processing",
        failed: german ? "Fehlgeschlagen" : "Failed",
        draft: german ? "Entwurf" : "Draft",
        ready: german ? "Fertig" : "Ready",
      }[value],
    })),
    { value: "loading", label: german ? "Ladezustand" : "Loading" },
    { value: "empty", label: german ? "Leerer Zustand" : "Empty" },
    {
      value: "selected",
      label: german ? "Ausgewählte Projekte" : "Selected cards",
    },
    { value: "list", label: german ? "Listenansicht" : "List view" },
  ];
  const emptyTitles: Record<Empty, string> = german
    ? {
        workspace: "Erstellen Sie Ihr erstes Projekt",
        search: `Keine Projekte entsprechen „${query}“.`,
        drafts: "Keine Projektentwürfe",
        ready: "Keine fertigen Projekte",
        shared: "Keine mit Ihnen geteilten Projekte",
        trash: "Der Papierkorb ist leer",
      }
    : {
        workspace: "Create your first project",
        search: `No projects match '${query}'.`,
        drafts: "No draft projects",
        ready: "No ready projects",
        shared: "No projects shared with you",
        trash: "Trash is empty",
      };

  if (adapter.mode !== "demo")
    return (
      <section className="empty-state">
        <h1>State previews require the demo workspace</h1>
        <p>Open the isolated demo to inspect these states.</p>
        <a className="button" href="#demo/states">
          Open demo state previews
        </a>
      </section>
    );

  return (
    <div className="states-page">
      <header className="page-header">
        <h1>
          {german ? "Oberflächenzustände prüfen" : "Workspace state previews"}
        </h1>
        <p>
          {german
            ? "Isolierte Beispieldaten für Gestaltung, Tastaturbedienung und Bildschirmgrößen."
            : "Isolated examples for visual, keyboard and responsive checks."}
        </p>
      </header>
      <p className="states-disclosure">
        {german
          ? "Nur Vorschau: Diese Steuerelemente verändern keine gespeicherten Projekte oder Einstellungen."
          : "Preview only: these controls do not change saved projects or preferences."}{" "}
        <a href="#demo/projects">
          {german ? "Zurück zu den Projekten" : "Back to projects"}
        </a>
      </p>
      <div
        className="states-controls"
        aria-label={german ? "Vorschaueinstellungen" : "Preview controls"}
      >
        <label className="field">
          {german ? "Szenario" : "Scenario"}
          <select
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as Scenario);
              setOverrides({});
            }}
          >
            {scenarios.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {german ? "Farbschema" : "Theme"}
          <select
            value={theme}
            onChange={(event) =>
              setTheme(event.target.value as "dark" | "light")
            }
          >
            <option value="dark">{german ? "Dunkel" : "Dark"}</option>
            <option value="light">{german ? "Hell" : "Light"}</option>
          </select>
        </label>
        <label className="field">
          {german ? "Schreibrichtung" : "Direction"}
          <select
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as "ltr" | "rtl")
            }
          >
            <option value="ltr">
              {german ? "Links nach rechts" : "Left to right"}
            </option>
            <option value="rtl">
              {german ? "Rechts nach links" : "Right to left"}
            </option>
          </select>
        </label>
        <label className="field">
          {german ? "Texterweiterung" : "Text expansion"}
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as "en" | "de")}
          >
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
        {scenario === "empty" && (
          <label className="field">
            {german ? "Leerer Bereich" : "Empty area"}
            <select
              value={empty}
              onChange={(event) => setEmpty(event.target.value as Empty)}
            >
              {(
                [
                  "workspace",
                  "search",
                  "drafts",
                  "ready",
                  "shared",
                  "trash",
                ] as Empty[]
              ).map((value) => (
                <option key={value} value={value}>
                  {
                    {
                      workspace: "Workspace",
                      search: "Search",
                      drafts: "Drafts",
                      ready: "Ready",
                      shared: "Shared with me",
                      trash: "Trash",
                    }[value]
                  }
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="button"
          onClick={() => {
            transitionTimers.current.forEach(clearTimeout);
            transitionTimers.current = [];
            setOverrides({});
            setSelected(
              scenario === "selected" ? [fixtures[0].id, fixtures[1].id] : [],
            );
            setQuery("xyz");
            notify(
              "Preview examples reset. Saved demo projects are unchanged.",
            );
          }}
        >
          {german ? "Beispiele zurücksetzen" : "Reset examples"}
        </button>
      </div>
      <p className="states-context">
        {forced
          ? "System forced colors are active."
          : "System forced colors are inactive. Enable your operating system’s contrast theme to check the actual forced-colors rendering."}{" "}
        {german &&
          "German text expansion is shown in names, dates and harness controls; shared component status vocabulary remains English."}{" "}
        {projects.length > 0 && (
          <span>{projects.length} saved demo projects remain untouched.</span>
        )}
      </p>
      {selected.length > 0 &&
        scenario !== "loading" &&
        scenario !== "empty" && (
          <div className="selection-toolbar states-selection">
            <span>
              {selected.length} {german ? "ausgewählt" : "selected"}
            </span>
            <div className="flow-actions">
              <button
                className="button"
                onClick={() => setSelected(shown.map((project) => project.id))}
              >
                {german ? "Alle auswählen" : "Select all"}
              </button>
              <button
                className="button button-ghost"
                onClick={() => setSelected([])}
              >
                {german ? "Auswahl aufheben" : "Clear selection"}
              </button>
            </div>
          </div>
        )}
      {scenario === "loading" ? (
        <section aria-busy="true" aria-label="Loading project examples">
          <p className="sr-only">Loading project examples</p>
          <div className="project-grid">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="project-skeleton" key={index}>
                <div className="document-skeleton">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : scenario === "empty" ? (
        <section className="empty-state">
          <Icon
            name={
              empty === "trash"
                ? "trash"
                : empty === "search"
                  ? "search"
                  : "projects"
            }
            size={32}
          />
          <h2>{emptyTitles[empty]}</h2>
          <p>
            {empty === "workspace"
              ? "Record your screen, analyze a website, or upload a video. Vistralo turns it into a walkthrough or a visual brief you can share."
              : empty === "search"
                ? "Try a different name or clear your search."
                : empty === "trash"
                  ? "Projects you delete will appear here."
                  : "Your projects will appear here as they progress."}
          </p>
          {empty === "search" ? (
            <button
              className="button"
              onClick={() => {
                setQuery("");
                setScenario("lifecycle");
              }}
            >
              Clear search
            </button>
          ) : empty === "workspace" ? (
            <div className="creation-tiles">
              {[
                { icon: "video", label: "Record screen" },
                { icon: "globe", label: "Analyze website" },
                { icon: "upload", label: "Upload recording" },
              ].map((item) => (
                <a
                  className="creation-tile"
                  href="#demo/projects"
                  key={item.label}
                >
                  <Icon name={item.icon} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>Open the demo workspace to create a project</small>
                  </span>
                  <Icon name="chevronRight" />
                </a>
              ))}
            </div>
          ) : null}
        </section>
      ) : scenario === "list" ? (
        <div className="table-scroll">
          <table className="project-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all state examples"
                    checked={selected.length === shown.length}
                    onChange={() =>
                      setSelected(
                        selected.length === shown.length
                          ? []
                          : shown.map((project) => project.id),
                      )
                    }
                  />
                </th>
                <th colSpan={2}>{german ? "Projektname" : "Name"}</th>
                <th>{german ? "Projekttyp" : "Type"}</th>
                <th>Status</th>
                <th>{german ? "Quelle" : "Source"}</th>
                <th>{german ? "Zugriff" : "Access"}</th>
                <th>{german ? "Aktualisiert" : "Updated"}</th>
                <th>
                  <span className="sr-only">Inspect</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((project) => (
                <tr
                  key={project.id}
                  className={selected.includes(project.id) ? "is-selected" : ""}
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${project.name}`}
                      checked={selected.includes(project.id)}
                      onChange={() => select(project.id)}
                    />
                  </td>
                  <td className="list-thumbnail">
                    <Thumbnail project={project} />
                  </td>
                  <th scope="row">
                    <button
                      className="states-row-link"
                      onClick={() => setInspect(project)}
                    >
                      {project.name}
                    </button>
                  </th>
                  <td>{typeText(project)}</td>
                  <td>
                    <StatusBadge project={project} />
                  </td>
                  <td>{sourceText(project)}</td>
                  <td>{accessText(project)}</td>
                  <td>
                    <time
                      dateTime={project.updated}
                      title={absoluteTime(project.updated, locale)}
                    >
                      {relativeTime(project.updated, locale)}
                    </time>
                  </td>
                  <td>
                    <button
                      className="button button-ghost"
                      onClick={() => setInspect(project)}
                    >
                      {german ? "Prüfen" : "Inspect"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="project-grid"
          ref={grid}
          aria-label="Project state examples"
        >
          {shown.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              selected={selected.includes(project.id)}
              anySelected={selected.length > 0}
              onSelect={() => select(project.id)}
              onOpen={() => setInspect(project)}
              actions={actions(project)}
              onShare={() => {
                setInspect(project);
                notify(
                  "This is an isolated example. Share real demo projects from the Projects page.",
                );
              }}
              locale={locale}
              index={index}
              focused={focused === index}
              onFocus={() => setFocused(index)}
              href="#demo/states"
              onKeyDown={(event) => {
                if (
                  !(event.target as HTMLElement).classList.contains(
                    "card-title",
                  )
                )
                  return;
                const columns = grid.current
                  ? getComputedStyle(grid.current).gridTemplateColumns.split(
                      " ",
                    ).length
                  : 1;
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key,
                  )
                ) {
                  event.preventDefault();
                  const forward = direction === "rtl" ? -1 : 1;
                  focus(
                    index +
                      (event.key === "ArrowRight"
                        ? forward
                        : event.key === "ArrowLeft"
                          ? -forward
                          : event.key === "ArrowDown"
                            ? columns
                            : -columns),
                  );
                }
                if (event.key === " ") {
                  event.preventDefault();
                  select(project.id);
                }
                if (event.key === "Escape") setSelected([]);
              }}
            />
          ))}
        </div>
      )}
      {inspect && (
        <Dialog
          title={
            german ? "Isoliertes Zustandsbeispiel" : "Isolated state example"
          }
          onClose={() => setInspect(null)}
        >
          <div className="flow-stack">
            <h3>{inspect.name}</h3>
            <StatusBadge project={inspect} />
            <p>
              {inspect.data.simulationState ||
                "Fictional preview data. Opening or inspecting this example does not change a saved project."}
            </p>
            <dl className="flow-metadata">
              <div>
                <dt>Type</dt>
                <dd>{typeText(inspect)}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{sourceText(inspect)}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{accessText(inspect)}</dd>
              </div>
            </dl>
            <div className="flow-actions">
              <button
                className="button"
                onClick={() => {
                  void copyText(JSON.stringify(inspect, null, 2)).then(
                    () => notify("Fictional state data copied."),
                    (error) => notify(error.message, true),
                  );
                }}
              >
                Copy state JSON
              </button>
              <button
                className="button button-primary"
                onClick={() => setInspect(null)}
              >
                Done
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
