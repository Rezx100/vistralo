import React from "react";
import type { Project, WorkspaceAdapter } from "../../contracts";
import { Icon } from "../../components/Icon";
import { Menu, ToolButton, type MenuAction } from "../../components/Primitives";
import { ProjectCard, StatusBadge, Thumbnail } from "../../components/ProjectCard";
import {
  absoluteTime,
  accessIcon,
  accessText,
  projectTitle,
  relativeTime,
  sourceText,
  typeText,
} from "../../utils";
import { createFlows, type CreateFlow } from "../create-flows";
import { PAGE_SIZE, type LibraryView } from "./useLibrary";

interface ViewProps {
  lib: LibraryView;
  adapter: WorkspaceAdapter;
  locale: string;
  onOpen: (p: Project) => void;
  actions: (p: Project) => MenuAction[];
}

const href = (adapter: WorkspaceAdapter, p: Project) =>
  `#${adapter.mode === "demo" ? "demo/" : ""}project/${p.id}`;

/** Frames laid straight on the page, as many columns as fit. Arrow keys move between them. */
export function ProjectGrid({
  lib,
  adapter,
  locale,
  onOpen,
  actions,
  onShare,
}: ViewProps & { onShare: (p: Project) => void }) {
  const { current, selected, focus, setFocus, gridRef, select, moveFocus, thumbnailFor } = lib;
  return (
    <div className="project-grid" ref={gridRef} aria-label="Projects">
      {current.map((p, index) => (
        <ProjectCard
          key={p.id}
          project={p}
          thumbnail={thumbnailFor(p)}
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
          href={href(adapter, p)}
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
  );
}

/** The same projects as rows: a small frame, the name, and the facts in columns. */
export function ProjectTable({ lib, adapter, locale, onOpen, actions }: ViewProps) {
  const {
    current, selected, setSelected, select, sort, setSort, order, setOrder,
    listMenu, setListMenu, thumbnailFor,
  } = lib;
  const sortBy = (column: string) => {
    setSort(column);
    setOrder(order === "asc" ? "desc" : "asc");
  };
  const sorted = (column: string) =>
    sort === column ? (order === "asc" ? "ascending" : "descending") : "none";
  return (
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
            <th colSpan={2} aria-sort={sorted("name")}>
              <button onClick={() => sortBy("name")}>
                Name <Icon name="sort" size={16} />
              </button>
            </th>
            <th>Type</th>
            <th>Status</th>
            <th>Source</th>
            <th>Access</th>
            <th aria-sort={sorted("updated")}>
              <button onClick={() => sortBy("updated")}>
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
                <Thumbnail project={p} src={thumbnailFor(p)} />
              </td>
              <td>
                <a
                  href={href(adapter, p)}
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
  );
}

/** Blank frames in place of projects before the first read arrives. */
export function LibraryLoading() {
  return (
    <div className="project-grid" aria-label="Loading projects">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div className="project-skeleton" key={i}>
          <div className="thumbnail is-blank" />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

/** Says why nothing is listed and offers the one thing that changes that. */
export function LibraryEmpty({
  lib,
  view,
  adapter,
  create,
}: {
  lib: LibraryView;
  view: string;
  adapter: WorkspaceAdapter;
  create: (flow: CreateFlow) => void;
}) {
  const { query, setQuery, scope, tab, setTab, setType, setSource } = lib;
  const first = scope.length === 0 && view === "projects";
  return (
    <section className="empty-state">
      <Icon
        name={view === "trash" ? "trash" : query ? "search" : "projects"}
        size={32}
      />
      <h2>
        {query
          ? `No projects match '${query}'.`
          : first
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
        {first
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
      ) : first ? (
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
  );
}

/** One page of frames is on screen at a time, so the page stays light at any library size. */
export function Pagination({ lib, locale }: { lib: LibraryView; locale: string }) {
  const { page, setPage, pages, visible, gridRef } = lib;
  if (visible.length <= PAGE_SIZE) return null;
  const number = (value: number) => value.toLocaleString(locale);
  const turn = (next: number) => {
    setPage(next);
    // The new page starts at its first frame, not wherever the last one was scrolled to.
    requestAnimationFrame(() =>
      (gridRef.current?.closest("main") || document.scrollingElement)?.scrollTo?.({ top: 0 }),
    );
  };
  return (
    <nav className="pagination" aria-label="Project pages">
      <button
        className="button"
        disabled={!page}
        onClick={() => turn(page - 1)}
      >
        Previous
      </button>
      <span className="edge" aria-live="polite">
        {number(page * PAGE_SIZE + 1)} to{" "}
        {number(Math.min((page + 1) * PAGE_SIZE, visible.length))} of{" "}
        {number(visible.length)}
        <span className="pagination-page">
          {" "}
          · Page {number(page + 1)} of {number(pages)}
        </span>
      </span>
      <button
        className="button"
        disabled={page + 1 >= pages}
        onClick={() => turn(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
