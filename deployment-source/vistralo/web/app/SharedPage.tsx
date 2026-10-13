import React, { useEffect, useState } from "react";
import { readDemoShare } from "../adapters";
export function SharedPage({ demoId }: { demoId?: string }) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState("");
  useEffect(() => {
    if (demoId) {
      readDemoShare(demoId)
        .then(setData)
        .catch((e) => setError(e.message));
      return;
    }
    fetch(`${location.pathname.replace(/\/$/, "")}/data`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || "This link is unavailable");
        setData(result);
      })
      .catch((e) => setError(e.message));
  }, [demoId]);
  const media = (file: string) =>
    `${location.pathname.replace(/\/$/, "")}/media?${new URLSearchParams({ file })}`;
  const poster = data?.thumbnail
    ? demoId
      ? data.thumbnail
      : media(data.thumbnail.file || data.thumbnail)
    : undefined;
  const video = data?.video
    ? demoId
      ? data.video
      : media(data.video)
    : undefined;
  const downloads = data
    ? demoId
      ? data.files.filter((file: any) =>
          /\.(mp4|webm|mov|mkv|md|pdf)$/i.test(file.file),
        )
      : [data.video, data.briefFile]
          .filter(Boolean)
          .map((file: string) => ({ file, url: `${media(file)}&download=1` }))
    : [];
  return (
    <main className="shared-page">
      <a className="shared-brand" href="/">
        Vistralo
      </a>
      {error ? (
        <>
          <h1>Link unavailable</h1>
          <p>{error}</p>
        </>
      ) : data ? (
        <>
          <h1>{data.project?.name || data.name || "Shared project"}</h1>
          <p>
            {demoId
              ? "Read-only demo link · This browser only"
              : "Read-only shared project"}
          </p>
          {video ? (
            <div className="shared-file">
              <video controls preload="metadata" src={video} poster={poster} />
            </div>
          ) : poster ? (
            <div className="shared-file">
              <img src={poster} alt="Project preview" />
            </div>
          ) : null}
          {data.brief && <pre className="brief-text">{data.brief}</pre>}
          {downloads.map((file: any) => (
            <div className="shared-file" key={file.file}>
              <a href={file.url} download className="button">
                Download {file.file.split("/").pop()}
              </a>
            </div>
          ))}
        </>
      ) : (
        <>
          <h1>Opening shared project</h1>
          <p>Loading…</p>
        </>
      )}
    </main>
  );
}
