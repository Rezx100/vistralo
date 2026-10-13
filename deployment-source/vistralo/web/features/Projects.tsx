import React from "react";
import type { Project, WorkspaceAdapter } from "../contracts";
import type { MenuAction } from "../components/Primitives";
import type { Library } from "../app/useProjects";
import type { CreateFlow } from "./create-flows";
import {
  LibrarySearch,
  LibraryToolbar,
  SelectionBar,
} from "./library/LibraryToolbar";
import {
  LibraryEmpty,
  LibraryLoading,
  Pagination,
  ProjectGrid,
  ProjectTable,
} from "./library/LibraryViews";
import { libraryLabels, useLibrary } from "./library/useLibrary";

/**
 * The library: a header row (title, count, search), a row of filters, then one page of
 * frames. It filters the summaries the app has already read; `library` says how far that
 * reading has got in a large workspace.
 */
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
  library,
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
  library: Library;
  onShortcuts: () => void;
}) {
  const lib = useLibrary({ projects, view, adapter, locale, onShortcuts });
  const labels = libraryLabels(locale);
  const { selected, current, scope, visible, layout } = lib;
  const waiting = loading && !projects.length;
  const number = (value: number) => value.toLocaleString(locale);
  const filteredOut = visible.length !== scope.length;
  return (
    <>
      <header className="page-header">
        <div className="page-heading">
          <h1 tabIndex={-1}>
            {view === "trash"
              ? labels.trash
              : view === "shared"
                ? labels.shared
                : labels.projects}
          </h1>
          {!waiting && (
            <p className="page-count edge" role="status">
              {filteredOut
                ? `${number(visible.length)} of ${number(scope.length)}`
                : `${number(scope.length)} ${scope.length === 1 ? "project" : "projects"}`}
              {!library.complete && library.total > projects.length && (
                <span className="page-reading">
                  {" "}
                  · Reading {number(projects.length)} of {number(library.total)}
                </span>
              )}
            </p>
          )}
        </div>
        <LibrarySearch lib={lib} labels={labels} />
      </header>
      {view !== "projects" && (
        <p className="page-note">
          {view === "trash"
            ? "Deleted projects stay here until you restore or permanently delete them."
            : "Projects others have shared with you."}
        </p>
      )}
      <div className="workspace-toolbar">
        {selected.length ? (
          <SelectionBar lib={lib} view={view} bulk={bulk} />
        ) : (
          <LibraryToolbar lib={lib} labels={labels} countsReady={!waiting} />
        )}
      </div>
      {waiting ? (
        <LibraryLoading />
      ) : !current.length ? (
        <LibraryEmpty lib={lib} view={view} adapter={adapter} create={create} />
      ) : layout === "grid" ? (
        <ProjectGrid
          lib={lib}
          adapter={adapter}
          locale={locale}
          onOpen={onOpen}
          actions={actions}
          onShare={onShare}
        />
      ) : (
        <ProjectTable
          lib={lib}
          adapter={adapter}
          locale={locale}
          onOpen={onOpen}
          actions={actions}
        />
      )}
      <Pagination lib={lib} locale={locale} />
    </>
  );
}
