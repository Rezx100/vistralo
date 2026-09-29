import type { UploadOptions } from "./contracts";

export const abortIfNeeded = (signal?: AbortSignal) => {
  if (signal?.aborted)
    throw new DOMException(
      "Upload paused. Select the same file to resume.",
      "AbortError",
    );
};

/** SHA-256 in a worker, 1 MB at a time, so multi-gigabyte files never sit in memory. */
export function checksum(file: File, options: UploadOptions): Promise<string> {
  abortIfNeeded(options.signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker("/hash-worker.js");
    const clean = () => {
      worker.terminate();
      options.signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      clean();
      reject(
        new DOMException(
          "Upload paused. Select the same file to resume.",
          "AbortError",
        ),
      );
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) {
        options.onProgress?.({ phase: "hashing", percent: data.progress });
        return;
      }
      clean();
      if (data.error) reject(new Error(data.error));
      else if (
        typeof data.digest !== "string" ||
        !/^[a-f0-9]{64}$/.test(data.digest)
      )
        reject(new Error("The source checksum is invalid."));
      else resolve(data.digest);
    };
    worker.onerror = () => {
      clean();
      reject(
        new Error(
          "Could not calculate the source checksum. Refresh the page and try again.",
        ),
      );
    };
    worker.postMessage(file);
  });
}
