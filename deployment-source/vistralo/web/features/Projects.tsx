import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Project, ProjectSource, WorkspaceAdapter } from "../contracts";
import { Icon } from "../components/Icon";
import { Menu, ToolButton, CounterBadge, type MenuAction } from "../components/Primitives";
import { ProjectCard, Thumbnail, StatusBadge } from "../components/ProjectCard";
import { CreateDock } from "../components/CreateDock";
import {
  accessIcon,
  accessText,
  absoluteTime,
  isTyping,
  relativeTime,
  sourceText,
  typeText,
  projectTitle,
} from "../utils";
import {
  createFlows,
  materialFlows,
  recordFlows,
  type CreateFlow,
} from "./create-flows";
export function Projects({
  projects,
  view,
  adapter,
  locale,
  create,
  onOpen,
  actions,
  onShare,
  bulk,
  loading,
  onShortcuts,
}: {
  projects: Project[];
  view: string;
  adapter: WorkspaceAdapter;
  locale: string;
  create: (flow: CreateFlow) => void;
  onOpen: (p: Project) => void;
  actions: (p: Project) => MenuAction[];
  onShare: (p: Project) => void;
  bulk: (action: string, ids: string[]) => Promise<void>;
  loading: boolean;
  onShortcuts: () => void;
}) {
  const [tab, setTab] = useState("all"),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [source, setSource] = useState("all"),
    [sort, setSort] = useState("updated"),
    [order, setOrder] = useState("desc"),
    [layout, setLayout] = useState(
      () => localStorage.getItem("vistralo-view") || "grid",
    ),
    [selected, setSelected] = useState<string[]>([]),
    [createMenu, setCreateMenu] = useState(false),
    [sortMenu, setSortMenu] = useState(false),
    [filterMenu, setFilterMenu] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [focus, setFocus] = useState(0),
    [page, setPage] = useState(0),
    [listMenu, setListMenu] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null),
    gridRef = useRef<HTMLDivElement>(null),
    anchor = useRef(0);
  const labels =
    locale === "de"
      ? {
          projects: "Projekte",
          shared: "Mit mir geteilt",
          trash: "Papierkorb",
          all: "Alle",
          drafts: "Entwürfe",
          ready: "Fertig",
          attention: "Benötigt Aufmerksamkeit",
          new: "Neues Projekt",
          search: "Projekte suchen",
        }
      : {
          projects: "Projects",
          shared: "Shared with me",
          trash: "Trash",
          all: "All",
          drafts: "Drafts",
          ready: "Ready",
          attention: "Needs attention",
          new: "New project",
          search: "Search projects",
        };
  const scope = useMemo(
    () =>
      projects.filter((p) =>
        view === "trash"
          ? p.trashed
          : !p.trashed && (view !== "shared" || p.access === "workspace"),
      ),
    [projects, view],
  );
  const filtered = useMemo(
    () =>
      scope.filter(
        (p) =>
          (type === "all" || p.type === type) &&
          (source === "all" || p.source === source) &&
          `${p.name} ${sourceText(p)} ${p.folder || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [scope, type, source, query],
  );
  const counts = {
    all: filtered.length,
    draft: filtered.filter((p) => p.status === "draft").length,
    ready: filtered.filter((p) => p.status === "ready").length,
    failed: filtered.filter((p) => p.status === "failed").length,
  };
  const visible = useMemo(
    () =>
      filtered
        .filter((p) => tab === "all" || p.status === tab)
        .sort((a, b) => {
          const result =
            sort === "name"
              ? a.name.localeCompare(b.name, locale)
              : Date.parse(sort === "created" ? a.created : a.updated) -
                Date.parse(sort === "created" ? b.created : b.updated);
          return order === "asc" ? result : -result;
        }),
    [filtered, tab, sort, order, locale],
  );
  const current = visible.slice(page * 50, (page + 1) * 50);
  useEffect(() => {
    setPage((value) => Math.min(value, Math.max(0, Math.ceil(visible.length / 50) - 1)));
  }, [visible.length]);
  useEffect(() => {
    setPage(0);
    setSelected([]);
    setFocus(0);
  }, [tab, query, type, source, view]);
  useEffect(() => {
    setSelected((ids) => ids.filter((id) => scope.some((p) => p.id === id)));
  }, [projects]);
  useEffect(() => {
    if (tab === "failed" && !counts.failed) setTab("all");
  }, [counts.failed, tab]);
  useEffect(() => {
    localStorage.setItem("vistralo-view", layout);
  }, [layout]);
  function select(index: number, e?: any) {
    const id = current[index].id;
    if (e?.shiftKey) {
      const ids = current
        .slice(
          Math.min(index, anchor.current),
          Math.max(index, anchor.current) + 1,
        )
        .map((p) => p.id);
      setSelected((prev) => Array.from(new Set([...prev, ...ids])));
    } else {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
      );
      anchor.current = index;
    }
  }
  function moveFocus(index: number) {
    const next = Math.max(0, Math.min(current.length - 1, index));
    setFocus(next);
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-card-index="${next}"] .card-title`)
      ?.focus();
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        isTyping(e.target) ||
        document.querySelector("dialog[open]") ||
        document.querySelector('[role="menu"]')
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(current.map((p) => p.id));
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") ||
        e.key === "/"
      ) {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setCreateMenu(true);
      } else if (e.key === "Escape") {
        setSelected([]);
      } else if (e.key === "?") onShortcuts();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [current, onShortcuts]);
  const createActions: MenuAction[] = materialFlows.map((item) => ({
    label: item.label,
    description: item.description,
    icon: item.icon,
    key: item.key,
    onClick: () => create(item.flow),
  }));
  const sortItems: MenuAction[] = [
    ["updated", "Last updated"],
    ["created", "Date created"],
    ["name", "Name"],
  ].map(([id, label]) => ({
    label,
    checked: sort === id,
    role: "menuitemradio",
    onClick: () => setSort(id),
  }));
  sortItems.push(
    {
      label: sort === "name" ? "Z to A" : "Newest first",
      role: "menuitemradio",
      checked: order === "desc",
      separator: true,
      onClick: () => setOrder("desc"),
    },
    {
      label: sort === "name" ? "A to Z" : "Oldest first",
      role: "menuitemradio",
      checked: order === "asc",
      onClick: () => setOrder("asc"),
    },
  );
  const filterItems: MenuAction[] = [
    {
      label: "All types",
      role: "menuitemradio",
      checked: type === "all",
      onClick: () => setType("all"),
    },
    {
      label: "Walkthrough",
      role: "menuitemradio",
      checked: type === "walkthrough",
      onClick: () => setType("walkthrough"),
    },
    {
      label: "Visual brief",
      role: "menuitemradio",
      checked: type === "brief",
      onClick: () => setType("brief"),
    },
    ...["all", "screen", "web", "upload"].map((s, i) => ({
      label: (
        {
          all: "All sources",
          screen: "Screen recording",
          web: "Website",
          upload: "Uploaded video",
        } as any
      )[s],
      role: "menuitemradio" as const,
      checked: source === s,
      separator: i === 0,
      onClick: () => setSource(s),
    })),
  ];
  return (
    <>
      <header className="page-header">
        <h1 tabIndex={-1}>
          {view === "trash"
            ? labels.trash
            : view === "shared"
              ? labels.shared
              : labels.projects}
        </h1>
        <p>
          {view === "trash"
            ? "Deleted projects stay here until you restore or permanently delete them."
            : view === "shared"
              ? "Projects others have shared with you."
              : "Walkthroughs and visual briefs from your recordings, websites and videos."}
        </p>
      </header>
      <div className="workspace-toolbar">
        {selected.length ? (
          <div className="selection-toolbar">
            <label>
              <input
                type="checkbox"
                checked={selected.length === current.length}
                onChange={() =>
                  setSelected(
                    selected.length === current.length
                      ? []
                      : current.map((p) => p.id),
                  )
                }
              />{" "}
              {selected.length} selected
            </label>
            <div className="bulk-actions">
              {view === "trash" ? (
                <>
                  <button
                    className="button button-ghost"
                    onClick={() =>
                      bulk("restore", selected).then(() => setSelected([]))
                    }
                  >
                    <Icon name="restore" />
                    Restore
                  </button>
                  <button
                    className="button button-ghost danger-text"
                    onClick={() => bulk("delete", selected)}
                  >
                    <Icon name="trash" />
                    Delete permanently
                  </button>
                </>
              ) : (
                <>
                  {[
                    ["share", "Share"],
                    ["copy", "Copy link"],
                    ["move", "Move to"],
                    ["download", "Download"],
                    ["trash", "Delete"],
                  ].map(([action, label]) => (
                    <button
                      key={action}
                      className="button button-ghost"
                      onClick={() =>
                        bulk(action, selected).then(() => {
                          if (action === "trash") setSelected([]);
                        })
                      }
                    >
                      <Icon
                        name={
                          action === "share"
                            ? "people"
                            : action === "move"
                              ? "folder"
                              : action
                        }
                      />
                      {label}
                    </button>
                  ))}
                </>
              )}
              <ToolButton
                icon="close"
                label="Clear selection"
                onClick={() => setSelected([])}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="tabs" role="tablist" aria-label="Project status">
              {[
                ["all", labels.all],
                ["draft", labels.drafts],
                ["ready", labels.ready],
                ...(counts.failed ? [["failed", labels.attention]] : []),
              ].map(([id, label], index, arr) => (
                <button
                  role="tab"
                  key={id}
                  aria-selected={tab === id}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setTab(id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      const next =
                        (index +
                          (e.key === "ArrowRight" ? 1 : -1) * (document.documentElement.dir === "rtl" ? -1 : 1) +
                          arr.length) %
                        arr.length;
                      setTab(arr[next][0]);
                      (
                        e.currentTarget.parentElement?.children[
                          next
                        ] as HTMLElement
                      )?.focus();
                    }
                  }}
                >
                  {label}
                  <CounterBadge count={counts[id as keyof typeof counts]} />
                </button>
              ))}
            </div>
            <div className="toolbar-controls">
              <div className={`search-field ${searchOpen ? "expanded" : ""}`}>
                <ToolButton
                  icon="search"
                  label="Search projects  Ctrl+K"
                  onClick={() => {
                    setSearchOpen(!searchOpen);
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }}
                />
                <input
                  ref={searchRef}
                  placeholder={labels.search}
                  aria-label="Search projects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      if (query) setQuery("");
                      else {
                        e.currentTarget.blur();
                        setSearchOpen(false);
                      }
                    }
                  }}
                />
                {!query && (
                  <kbd className="search-key">
                    {navigator.platform.includes("Mac") ? "⌘K" : "Ctrl K"}
                  </kbd>
                )}
                {query && (
                  <ToolButton
                    icon="close"
                    label="Clear search"
                    onClick={() => setQuery("")}
                  />
                )}
              </div>
              <div className="menu-anchor filter-select">
                <button
                  className="button"
                  aria-label={`Type filter: ${type}`}
                  aria-haspopup="menu"
                  aria-expanded={filterMenu === "type"}
                  onClick={() =>
                    setFilterMenu(filterMenu === "type" ? "" : "type")
                  }
                >
                  Type
                  <Icon name="chevronDown" size={16} />
                </button>
                {filterMenu === "type" && (
                  <Menu
                    items={filterItems.slice(0, 3)}
                    onClose={() => setFilterMenu("")}
                  />
                )}
              </div>
              <div className="menu-anchor filter-select">
                <button
                  className="button"
                  aria-label={`Source filter: ${source}`}
                  aria-haspopup="menu"
                  aria-expanded={filterMenu === "source"}
                  onClick={() =>
                    setFilterMenu(filterMenu === "source" ? "" : "source")
                  }
                >
                  Source
                  <Icon name="chevronDown" size={16} />
                </button>
                {filterMenu === "source" && (
                  <Menu
                    items={filterItems.slice(3)}
                    onClose={() => setFilterMenu("")}
                  />
                )}
              </div>
              <div className="menu-anchor merged-filter">
                <button
                  className="button"
                  aria-haspopup="menu"
                  aria-expanded={filterMenu === "all"}
                  onClick={() =>
                    setFilterMenu(filterMenu === "all" ? "" : "all")
                  }
                >
                  <Icon name="filter" />
                  <span>Filter</span>
                  {(type !== "all" || source !== "all") && (
                    <CounterBadge count={Number(type !== "all") + Number(source !== "all")} />
                  )}
                </button>
                {filterMenu === "all" && (
                  <Menu items={filterItems} onClose={() => setFilterMenu("")} />
                )}
              </div>
              <div className="menu-anchor">
                <button
                  className="button sort-control tooltip-host"
                  aria-label={`Sort by ${sort === "updated" ? "Last updated" : sort === "created" ? "Date created" : "Name"}, ${sort === "name" ? (order === "desc" ? "Z to A" : "A to Z") : (order === "desc" ? "newest first" : "oldest first")}`}
                  aria-haspopup="menu"
                  aria-expanded={sortMenu}
                  onClick={() => setSortMenu(!sortMenu)}
                >
                  <Icon name="sort" />
                  <span>
                    {sort === "updated"
                      ? "Last updated"
                      : sort === "created"
                        ? "Date created"
                        : "Name"}
                  </span>
                  <Icon name="chevronDown" size={16} />
                  <span className="sort-direction" aria-hidden="true">{order === "desc" ? "↓" : "↑"}</span>
                  <span className="tooltip" role="tooltip">
                    Sort projects
                  </span>
                </button>
                {sortMenu && (
                  <Menu items={sortItems} onClose={() => setSortMenu(false)} />
                )}
              </div>
              <div className="view-toggle" role="group" aria-label="View">
                <ToolButton
                  icon="grid"
                  label="Grid view"
                  pressed={layout === "grid"}
                  onClick={() => setLayout("grid")}
                />
                <ToolButton
                  icon="list"
                  label="List view"
                  pressed={layout === "list"}
                  onClick={() => setLayout("list")}
                />
              </div>
            </div>
          </>
        )}
      </div>
      {loading && !projects.length ? (
        <div className="project-grid" aria-label="Loading projects">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="project-skeleton" key={i}>
              <div className="document-skeleton">
                <span />
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      ) : !current.length ? (
        <section className="empty-state">
          <Icon
            name={view === "trash" ? "trash" : query ? "search" : "projects"}
            size={32}
          />
          <h2>
            {query
              ? `No projects match '${query}'.`
              : scope.length === 0 && view === "projects"
                ? "Create your first project"
                : view === "trash"
                  ? "Trash is empty"
                  : view === "shared"
                    ? "No projects shared with you"
                    : tab === "draft"
                      ? "No draft projects"
                      : tab === "ready"
                        ? "No ready projects"
                        : "No projects match these filters"}
          </h2>
          <p>
            {scope.length === 0 && view === "projects"
              ? "Record your screen, or bring a video, screenshots or a website. Vistralo turns it into a narrated walkthrough or a visual brief you can share."
              : view === "shared" && !adapter.capabilities.workspaceAccess
                ? "Team invitations are not available yet. Use a read-only share link to share a completed project."
                : query
                  ? "Try a different name or clear your search."
                  : view === "trash"
                    ? "Projects you delete will appear here."
                    : "Your projects will appear here as they progress."}
          </p>
          {query ? (
            <button className="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          ) : scope.length === 0 && view === "projects" ? (
            <div className="creation-tiles">
              {createFlows.map((item) => (
                <button
                  className="creation-tile"
                  key={item.flow}
                  onClick={() => create(item.flow)}
                >
                  <Icon name={item.icon} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <Icon name="chevronRight" />
                </button>
              ))}
            </div>
          ) : scope.length > 0 ? (
            <button
              className="button"
              onClick={() => {
                setType("all");
                setSource("all");
                setTab("all");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </section>
      ) : layout === "grid" ? (
        <div className="project-grid" ref={gridRef} aria-label="Projects">
          {current.map((p, index) => (
            <ProjectCard
              key={p.id}
              project={p}
              selected={selected.includes(p.id)}
              anySelected={!!selected.length}
              onSelect={(e) => select(index, e)}
              onOpen={() => onOpen(p)}
              actions={actions(p)}
              onShare={() => onShare(p)}
              locale={locale}
              index={index}
              focused={focus === index}
              onFocus={() => setFocus(index)}
              href={`#${adapter.mode === "demo" ? "demo/" : ""}project/${p.id}`}
              onKeyDown={(e) => {
                if (!(e.target as HTMLElement).classList.contains("card-title"))
                  return;
                let columns = 1;
                if (gridRef.current)
                  columns = getComputedStyle(
                    gridRef.current,
                  ).gridTemplateColumns.split(" ").length;
                if (
                  ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  moveFocus(
                    index +
                      (e.key === "ArrowRight"
                        ? (document.documentElement.dir === "rtl" ? -1 : 1)
                        : e.key === "ArrowLeft"
                          ? (document.documentElement.dir === "rtl" ? 1 : -1)
                          : e.key === "ArrowDown"
                            ? columns
                            : -columns),
                  );
                }
                if (e.key === " ") {
                  e.preventDefault();
                  select(index, e);
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="project-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all visible projects"
                    checked={selected.length === current.length}
                    onChange={() =>
                      setSelected(
                        selected.length === current.length
                          ? []
                          : current.map((p) => p.id),
                      )
                    }
                  />
                </th>
                <th
                  colSpan={2}
                  aria-sort={
                    sort === "name"
                      ? order === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() => {
                      setSort("name");
                      setOrder(order === "asc" ? "desc" : "asc");
                    }}
                  >
                    Name <Icon name="sort" size={16} />
                  </button>
                </th>
                <th>Type</th>
                <th>Status</th>
                <th>Source</th>
                <th>Access</th>
                <th
                  aria-sort={
                    sort === "updated"
                      ? order === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() => {
                      setSort("updated");
                      setOrder(order === "asc" ? "desc" : "asc");
                    }}
                  >
                    Updated <Icon name="sort" size={16} />
                  </button>
                </th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {current.map((p, index) => (
                <tr
                  key={p.id}
                  className={selected.includes(p.id) ? "is-selected" : ""}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setListMenu(p.id);
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.name}`}
                      checked={selected.includes(p.id)}
                      onChange={(e) => select(index, e)}
                    />
                  </td>
                  <td className="list-thumbnail">
                    <Thumbnail project={p} />
                  </td>
                  <td>
                    <a
                      href={`#${adapter.mode === "demo" ? "demo/" : ""}project/${p.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onOpen(p);
                      }}
                    >
                      {projectTitle(p, locale)}
                    </a>
                  </td>
                  <td>{typeText(p)}</td>
                  <td>
                    <StatusBadge project={p} />
                  </td>
                  <td>{sourceText(p)}</td>
                  <td>
                    <span title={accessText(p)}>
                      <Icon name={accessIcon(p)} size={16} />
                    </span>
                  </td>
                  <td>
                    <time
                      title={absoluteTime(p.updated, locale)}
                      dateTime={p.updated}
                    >
                      {relativeTime(p.updated, locale)}
                    </time>
                  </td>
                  <td>
                    <div className="menu-anchor">
                      <ToolButton
                        icon="more"
                        label={`More actions for ${p.name}`}
                        aria-haspopup="menu"
                        aria-expanded={listMenu === p.id}
                        onClick={() =>
                          setListMenu(listMenu === p.id ? null : p.id)
                        }
                      />
                      {listMenu === p.id && (
                        <Menu
                          items={actions(p)}
                          onClose={() => setListMenu(null)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible.length > 50 && (
        <nav className="pagination" aria-label="Project pages">
          <button
            className="button"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            {page * 50 + 1}–{Math.min((page + 1) * 50, visible.length)} of{" "}
            {visible.length}
          </span>
          <button
            className="button"
            disabled={(page + 1) * 50 >= visible.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
      {view !== "trash" && (
        <CreateDock
          label={labels.new}
          items={recordFlows.map((item) => ({
            label: item.dockLabel,
            hint: item.description,
            icon: item.icon,
            onClick: () => create(item.flow),
          }))}
          menuItems={createActions}
          menuOpen={createMenu}
          onMenu={setCreateMenu}
        />
      )}
    </>
  );
}
