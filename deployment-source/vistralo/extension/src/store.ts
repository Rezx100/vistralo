// Recordings are written to IndexedDB a second at a time while they are made, so memory stays
// flat and a crash loses at most the last second. Only extension pages open this database.
import type { Mode } from "./session";

export interface StoredSession {
  id: string;
  mode: Mode;
  created: string;
  take: number;
  mime: string;
  title: string;
  url: string;
  microphone: boolean;
  durationMs: number;
  bytes: number;
  /** "recording" until the take is closed; a session still "recording" after a restart of the browser was interrupted. */
  state: "recording" | "complete" | "interrupted";
}

interface StoredChunk {
  session: string;
  take: number;
  seq: number;
  blob: Blob;
}

const DB = "vistralo-extension";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("sessions", { keyPath: "id" });
      db.createObjectStore("chunks", { keyPath: ["session", "take", "seq"] });
    };
    request.onerror = () => reject(request.error ?? new Error("Recording storage is unavailable."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function run<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = work(tx);
      tx.oncomplete = () => resolve(request ? request.result : (undefined as T));
      tx.onerror = tx.onabort = () =>
        reject(tx.error ?? new Error("The recording could not be written to this browser's storage."));
    });
  } finally {
    db.close();
  }
}

export const putSession = (s: StoredSession) =>
  run(["sessions"], "readwrite", (tx) => tx.objectStore("sessions").put(s));

export const getSession = (id: string) =>
  run<StoredSession | undefined>(["sessions"], "readonly", (tx) => tx.objectStore("sessions").get(id));

export const listSessions = () =>
  run<StoredSession[]>(["sessions"], "readonly", (tx) => tx.objectStore("sessions").getAll());

export const putChunk = (session: string, take: number, seq: number, blob: Blob) =>
  run(["chunks"], "readwrite", (tx) =>
    tx.objectStore("chunks").put({ session, take, seq, blob } satisfies StoredChunk),
  );

const takeRange = (session: string, take: number) =>
  IDBKeyRange.bound([session, take, 0], [session, take, Number.MAX_SAFE_INTEGER]);

/** Drops every take of a session except `keep` (or all of them). */
export async function dropChunks(session: string, keep?: number) {
  await run(["chunks"], "readwrite", (tx) => {
    const store = tx.objectStore("chunks");
    const all = IDBKeyRange.bound([session, 0, 0], [session, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
    if (keep === undefined) store.delete(all);
    else {
      if (keep > 0) store.delete(IDBKeyRange.bound([session, 0, 0], [session, keep - 1, Number.MAX_SAFE_INTEGER]));
      store.delete(IDBKeyRange.bound([session, keep + 1, 0], [session, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]));
    }
  });
}

export async function deleteSession(id: string) {
  await dropChunks(id);
  await run(["sessions"], "readwrite", (tx) => tx.objectStore("sessions").delete(id));
}

/**
 * The take as one file. MediaRecorder's pieces of one take form a single WebM stream, so they
 * join in order; a take cut short by a crash still plays up to its last stored second.
 */
export async function takeBlob(session: StoredSession): Promise<Blob> {
  const chunks = await run<StoredChunk[]>(["chunks"], "readonly", (tx) =>
    tx.objectStore("chunks").getAll(takeRange(session.id, session.take)),
  );
  chunks.sort((a, b) => a.seq - b.seq);
  return new Blob(chunks.map((c) => c.blob), { type: session.mime.split(";")[0] || "video/webm" });
}

export function fileName(session: StoredSession) {
  const stamp = session.created.replace(/[:.]/g, "-").replace(/-\d+Z$/, "");
  const ext = session.mime.includes("mp4") ? "mp4" : "webm";
  return `Vistralo recording ${stamp}.${ext}`;
}
