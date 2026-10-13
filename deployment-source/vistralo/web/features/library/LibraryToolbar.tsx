import React from "react";
import { Icon } from "../../components/Icon";
import {
  CounterBadge,
  Menu,
  ToolButton,
  type MenuAction,
} from "../../components/Primitives";
import type { LibraryView, libraryLabels } from "./useLibrary";

type Labels = ReturnType<typeof libraryLabels>;

/** The search field in the page's header row. Ctrl+K or / puts the cursor in it. */
export function LibrarySearch({ lib, labels }: { lib: LibraryView; labels: Labels }) {
  const { query, setQuery, searchOpen, setSearchOpen, searchRef } = lib;
  return (
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
  );
}

/** Pill tabs for status, then type, source, sort and the grid or list switch. */
export function LibraryToolbar({
  lib,
  labels,
  countsReady,
}: {
  lib: LibraryView;
  labels: Labels;
  /** False before the first read, when a zero would look like an empty workspace. */
  countsReady: boolean;
}) {
  const {
    tab, setTab, counts, type, setType, source, setSource, sort, setSort,
    order, setOrder, sortMenu, setSortMenu, filterMenu, setFilterMenu,
    layout, setLayout,
  } = lib;
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
  const sortName =
    sort === "updated" ? "Last updated" : sort === "created" ? "Date created" : "Name";
  const sortOrder =
    sort === "name"
      ? order === "desc"
        ? "Z to A"
        : "A to Z"
      : order === "desc"
        ? "newest first"
        : "oldest first";
  return (
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
            {countsReady && (
              <CounterBadge count={counts[id as keyof typeof counts]} />
            )}
          </button>
        ))}
      </div>
      <div className="toolbar-controls">
        <div className="menu-anchor filter-select">
          <button
            className="button"
            aria-label={`Type filter: ${type}`}
            aria-haspopup="menu"
            aria-expanded={filterMenu === "type"}
            onClick={() => setFilterMenu(filterMenu === "type" ? "" : "type")}
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
            onClick={() => setFilterMenu(filterMenu === "all" ? "" : "all")}
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
            aria-label={`Sort by ${sortName}, ${sortOrder}`}
            aria-haspopup="menu"
            aria-expanded={sortMenu}
            onClick={() => setSortMenu(!sortMenu)}
          >
            <Icon name="sort" />
            <span>{sortName}</span>
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
  );
}

/** Replaces the toolbar while projects are selected. */
export function SelectionBar({
  lib,
  view,
  bulk,
}: {
  lib: LibraryView;
  view: string;
  bulk: (action: string, ids: string[]) => Promise<void>;
}) {
  const { selected, setSelected, current } = lib;
  return (
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
  );
}
