interface StagedRecording {
  key: "pending";
  blob: Blob;
  name: string;
  created: string;
  microphone?: boolean;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("vistralo-recording-recovery", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("recordings", { keyPath: "key" });
    request.onerror = () =>
      reject(
        request.error ?? new Error("Browser recovery storage is unavailable."),
      );
    request.onsuccess = () => resolve(request.result);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("recordings", mode),
        request = run(tx.objectStore("recordings"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () =>
        reject(
          tx.error ??
            request.error ??
            new Error("Could not save the browser recovery copy."),
        );
    });
  } finally {
    // Close even when a synchronous quota, DataClone or transaction error occurs.
    db.close();
  }
}

export async function stageRecording(
  file: File,
  microphone = false,
): Promise<void> {
  await transaction("readwrite", (store) =>
    store.put({
      key: "pending",
      blob: file,
      name: file.name,
      created: new Date().toISOString(),
      microphone,
    } satisfies StagedRecording),
  );
}

export async function recoverRecording(): Promise<{
  file: File;
  microphone: boolean;
} | null> {
  const item = await transaction<StagedRecording | undefined>(
    "readonly",
    (store) => store.get("pending"),
  );
  return item
    ? {
        file: new File([item.blob], item.name, {
          type: item.blob.type,
          lastModified: new Date(item.created).getTime(),
        }),
        microphone: item.microphone === true,
      }
    : null;
}

export async function clearRecording(): Promise<void> {
  await transaction("readwrite", (store) => store.delete("pending"));
}
