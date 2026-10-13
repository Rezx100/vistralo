import React from "react";
import { counted } from "./projectActions";
import type { Project, WorkspaceAdapter } from "../contracts";
import { Dialog, TextDialog } from "../components/Primitives";
import type { ProjectEdit, Run } from "./projectActions";
export function EditProjectsDialog({
  edit,
  adapter,
  notify,
  refresh,
  onClose,
}: {
  edit: ProjectEdit;
  adapter: WorkspaceAdapter;
  notify: (s: string, error?: boolean) => void;
  refresh: () => Promise<Project[]>;
  onClose: () => void;
}) {
  return (
    <TextDialog
      title={edit.kind === "rename" ? "Rename project" : "Move projects"}
      icon={edit.kind === "rename" ? "edit" : "folder"}
      label={edit.kind === "rename" ? "Project name" : "Folder name"}
      initial={
        edit.kind === "rename"
          ? edit.projects[0].name
          : edit.projects[0].folder || ""
      }
      description={
        edit.kind === "move"
          ? "Organize projects with a folder name. Search includes folder names."
          : undefined
      }
      onClose={onClose}
      onSubmit={async (value) => {
        for (const p of edit.projects)
          await adapter.update(
            p.id,
            edit.kind === "rename" ? { name: value } : { folder: value },
          );
        notify(
          edit.kind === "rename"
            ? "Project renamed"
            : `${counted(edit.projects.length)} moved`,
        );
        await refresh();
      }}
    />
  );
}
export function DeleteProjectsDialog({
  deleting,
  adapter,
  run,
  onClose,
}: {
  deleting: string[];
  adapter: WorkspaceAdapter;
  run: Run;
  onClose: () => void;
}) {
  return (
    <Dialog
      title="Permanently delete projects?"
      description={`This permanently deletes ${deleting.length} trashed ${deleting.length === 1 ? "project" : "projects"} and their files. This cannot be undone.`}
      icon="trash"
      tone="danger"
      size="compact"
      className="sheet-alert"
      closable={false}
      onClose={onClose}
      footer={
        <>
          <button
            className="button"
            data-autofocus
            onClick={() => onClose()}
          >
            Cancel
          </button>
          <button
            className="button button-danger-solid"
            onClick={() =>
              run(async () => {
                await adapter.remove(deleting);
                onClose();
              }, `${counted(deleting.length)} permanently deleted`)
            }
          >
            Delete permanently
          </button>
        </>
      }
    />
  );
}
