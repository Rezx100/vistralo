import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, WorkspaceAdapter } from "../../contracts";
import { isTyping, sourceText } from "../../utils";

/** One page of the library. Divides evenly into two, three and four columns. */
export const PAGE_SIZE = 48;

export const libraryLabels = (locale: string) =>
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

/**
 * Everything the library page keeps track of: which projects are in view after the tab,
 * search, filters and sort, which page of them is on screen, and what is selected.
 * Filtering runs over the summaries already read, so it is instant at any size.
 */
export function useLibrary({
  projects,
  view,
  adapter,
  locale,
  onShortcuts,
}: {
  projects: Project[];
  view: string;
  adapter: WorkspaceAdapter;
  locale: string;
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
    [sortMenu, setSortMenu] = useState(false),
    [filterMenu, setFilterMenu] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [focus, setFocus] = useState(0),
    [page, setPage] = useState(0),
    [listMenu, setListMenu] = useState<string | null>(null),
    [thumbs, setThumbs] = useState<Record<string, string>>({}),
    [thumbTick, setThumbTick] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null),
    gridRef = useRef<HTMLDivElement>(null),
    anchor = useRef(0);
  const scope = useMemo(
    () =>
      projects.filter((p) =>
        view === "trash"
          ? p.trashed
          : !p.trashed && (view !== "shared" || p.access === "workspace"),
      ),
    [projects, view],
  );
  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return scope.filter(
      (p) =>
        (type === "all" || p.type === type) &&
        (source === "all" || p.source === source) &&
        (!needle ||
          `${p.name} ${sourceText(p)} ${p.folder || ""}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [scope, type, source, query]);
  const counts = useMemo(() => {
    const result = { all: filtered.length, draft: 0, ready: 0, failed: 0 };
    for (const p of filtered)
      if (p.status === "draft" || p.status === "ready" || p.status === "failed")
        result[p.status]++;
    return result;
  }, [filtered]);
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
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = useMemo(
    () => visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [visible, page],
  );
  useEffect(() => {
    setPage((value) => Math.min(value, Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1)));
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
  // Thumbnails are resolved for the page on screen only, however large the workspace is.
  const pageKey = current.map((p) => `${p.id}:${p.thumbnail || ""}`).join("|");
  useEffect(() => {
    if (!adapter.thumbnails || !current.length) return;
    let ignore = false;
    adapter
      .thumbnails(current)
      .then((resolved) => {
        if (!ignore) setThumbs((known) => ({ ...known, ...resolved }));
      })
      .catch(() => {
        /* A frame without its picture is still a usable card. */
      });
    return () => {
      ignore = true;
    };
  }, [adapter, pageKey, thumbTick]);
  // Signed thumbnail addresses expire; refresh them while the page stays open.
  useEffect(() => {
    if (!adapter.thumbnails) return;
    const timer = setInterval(() => setThumbTick((tick) => tick + 1), 420_000);
    return () => clearInterval(timer);
  }, [adapter]);
  /** The address to load for a project's frame; undefined means "use the project's own". */
  const thumbnailFor = (p: Project) =>
    adapter.thumbnails ? thumbs[p.id] || "" : undefined;

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
      } else if (e.key === "Escape") {
        setSelected([]);
      } else if (e.key === "?") onShortcuts();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [current, onShortcuts]);

  return {
    tab, setTab, query, setQuery, type, setType, source, setSource,
    sort, setSort, order, setOrder, layout, setLayout,
    selected, setSelected, sortMenu, setSortMenu,
    filterMenu, setFilterMenu, searchOpen, setSearchOpen, focus, setFocus,
    page, setPage, pages, listMenu, setListMenu,
    searchRef, gridRef, scope, counts, visible, current,
    thumbnailFor, select, moveFocus,
  };
}

export type LibraryView = ReturnType<typeof useLibrary>;
