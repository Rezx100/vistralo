import type { Dispatch, RefObject, SetStateAction } from "react";
import { downloadAgentKit } from "../agent-kit";
import type { AppMode, Project, WorkspaceAdapter } from "../contracts";
import type { MenuAction } from "../components/Primitives";
import { copyText } from "../utils";
export type Run = (fn: () => Promise<any>, success?: string) => Promise<void>;
export type ProjectEdit = { kind: string; projects: Project[] };
export function projectActions({
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
}: {
  adapter: WorkspaceAdapter;
  mode: AppMode;
  projects: Project[];
  toastTimer: RefObject<ReturnType<typeof setTimeout> | undefined>;
  notify: (s: string, error?: boolean) => void;
  refresh: () => Promise<Project[]>;
  go: (to: string) => void;
  setUndo: Dispatch<SetStateAction<string[] | null>>;
  setDeleting: Dispatch<SetStateAction<string[] | null>>;
  setShare: Dispatch<SetStateAction<Project[] | null>>;
  setEdit: Dispatch<SetStateAction<ProjectEdit | null>>;
}) {
  function open(p: Project) {
    adapter
      .update(p.id, { lastOpened: new Date().toISOString() })
      .catch(() => {});
    go("project/" + p.id);
  }
  async function run(fn: () => Promise<any>, success?: string) {
    try {
      await fn();
      if (success) notify(success);
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function download(p: Project) {
    const detail = await adapter.project(p.id);
    if (!detail.files.length && !detail.brief)
      throw Error(
        "Nothing to download yet. Open the project to finish it.",
      );
    notify("Preparing the build kit…");
    await downloadAgentKit(
      adapter,
      detail.project,
      () => {},
      detail.project.type === "brief" ? detail.brief || "" : "",
    );
  }
  async function trash(ids: string[]) {
    await adapter.trash(ids);
    setUndo(ids);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setUndo(null), 8000);
    notify(
      `${ids.length} ${ids.length === 1 ? "project" : "projects"} moved to Trash`,
    );
    await refresh();
  }
  async function bulk(action: string, ids: string[]) {
    const items = projects.filter((p) => ids.includes(p.id));
    try {
      if (action === "trash") await trash(ids);
      if (action === "restore") {
        await adapter.restore(ids);
        notify(`${ids.length} projects restored`);
        await refresh();
      }
      if (action === "delete") setDeleting(ids);
      if (action === "share") setShare(items);
      if (action === "copy") {
        await copyText(
          items
            .map(
              (p) =>
                new URL(
                  `#${mode === "demo" ? "demo/" : ""}project/${p.id}`,
                  location.href,
                ).href,
            )
            .join("\n"),
        );
        notify("Project links copied. Studio sign-in is required.");
      }
      if (action === "move") setEdit({ kind: "move", projects: items });
      if (action === "download") {
        for (const p of items) await download(p);
        notify(`${items.length} downloads requested`);
      }
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  function actions(p: Project): MenuAction[] {
    if (p.trashed)
      return [
        {
          label: "Restore",
          icon: "restore",
          onClick: () => run(() => adapter.restore([p.id]), "Project restored"),
        },
        {
          label: "Delete permanently",
          icon: "trash",
          danger: true,
          onClick: () => setDeleting([p.id]),
        },
      ];
    const normal: MenuAction[] = [
      { label: "Open", icon: "projects", onClick: () => open(p) },
      {
        label: "Share",
        icon: "people",
        disabled: !adapter.capabilities.share,
        onClick: () => setShare([p]),
      },
      {
        label: "Copy link",
        icon: "link",
        onClick: () =>
          run(
            () =>
              copyText(
                new URL(
                  `#${mode === "demo" ? "demo/" : ""}project/${p.id}`,
                  location.href,
                ).href,
              ),
            "Project link copied. Studio sign-in is required.",
          ),
      },
      {
        label: "Rename",
        icon: "edit",
        separator: true,
        onClick: () => setEdit({ kind: "rename", projects: [p] }),
      },
      {
        label: p.pinned ? "Unpin" : "Pin",
        icon: "pin",
        onClick: () =>
          run(
            () => adapter.update(p.id, { pinned: !p.pinned }),
            p.pinned ? "Project unpinned" : "Project pinned",
          ),
      },
      {
        label: "Duplicate",
        icon: "copy",
        onClick: () => run(() => adapter.duplicate(p.id), "Project duplicated"),
      },
      {
        label: "Move to",
        icon: "folder",
        onClick: () => setEdit({ kind: "move", projects: [p] }),
      },
      ...(p.type === "walkthrough"
        ? [
            {
              label: "Download",
              icon: "download",
              disabled: !p.video && !p.data.output?.file,
              onClick: () => run(() => download(p), "Build kit downloaded"),
            },
          ]
        : []),
      {
        label: "Delete",
        icon: "trash",
        separator: true,
        danger: true,
        onClick: () => run(() => trash([p.id])),
      },
    ];
    if (
      p.status === "processing" ||
      p.status === "uploading" ||
      p.status === "queued"
    )
      normal.splice(1, 0, {
        label: "Cancel",
        icon: "close",
        onClick: () =>
          run(
            () => adapter.rpc("cancel", { id: p.id }),
            "Cancellation requested",
          ),
      });
    if (p.status === "failed")
      normal.splice(
        1,
        0,
        {
          label: "Retry",
          icon: "restore",
          onClick: () =>
            p.source === "web" && p.url
              ? run(
                  () => adapter.rpc("walkthrough", { id: p.id, url: p.url }),
                  "Website analysis restarted",
                )
              : open(p),
        },
        {
          label: "Remove",
          icon: "trash",
          onClick: () => run(() => trash([p.id])),
        },
      );
    return normal;
  }
  return { open, run, download, trash, bulk, actions };
}
