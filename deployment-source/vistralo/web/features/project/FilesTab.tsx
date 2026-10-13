import React from "react";
import type {
  Project,
  ProjectDetail as ProjectInfo,
  ProjectFile,
  WorkspaceAdapter,
} from "../../contracts";
import { formatBytes } from "../flow-utils";
import { BuildBrief } from "../BuildBrief";

export function FilesTab({
  project,
  adapter,
  info,
  files,
}: {
  project: Project;
  adapter: WorkspaceAdapter;
  info: ProjectInfo | null;
  files: ProjectFile[];
}) {
  return (
    <>
      <div>
        <h2>Project files</h2>
        <p className="flow-muted">
          Download files, at the top of the page, packs everything a coding
          agent needs into one ZIP.
        </p>
      </div>
      <BuildBrief project={project} adapter={adapter} />
      {files.length ? (
        <details>
          <summary>Individual files ({files.length})</summary>
        <div className="flow-table-wrap">
          <table className="flow-files">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Size</th>
                <th scope="col">
                  <span className="sr-only">Download</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.file}>
                  <th scope="row">{file.file}</th>
                  <td>{formatBytes(file.size)}</td>
                  <td>
                    <a
                      className="button button-ghost"
                      href={adapter.media(project.id, file.file, true)}
                      download
                      aria-label={`Download ${file.file}`}
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </details>
      ) : (
        <div className="flow-empty">
          <h3>No files yet</h3>
          <p className="flow-muted">
            Uploaded recordings and captured website evidence will
            appear here.
          </p>
        </div>
      )}
      {!!info?.events.length && (
        <details>
          <summary>Recent project activity</summary>
          <ol className="flow-activity">
            {info.events
              .slice(-12)
              .reverse()
              .map((event: any, index) => (
                <li key={event.id || index}>
                  <strong>
                    {String(
                      event.kind ||
                        event.type ||
                        event.name ||
                        "Project updated",
                    ).replace(/-/g, " ")}
                  </strong>
                  {(event.at || event.created) && (
                    <time dateTime={event.at || event.created}>
                      {new Date(
                        event.at || event.created,
                      ).toLocaleString()}
                    </time>
                  )}
                  {event.data?.error && (
                    <p className="flow-error">{event.data.error}</p>
                  )}
                </li>
              ))}
          </ol>
        </details>
      )}
    </>
  );
}
