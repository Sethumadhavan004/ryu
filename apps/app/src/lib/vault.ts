import type { Meeting } from "@ryu/core";
import type { StoredAudio, Vault } from "./vault.types";

/**
 * Web vault: IndexedDB (meetings + audio blobs).
 * Browser storage is best-effort by default, so we ask for persistence
 * (Research 03 §2c) and report whether it was granted.
 */
const DB = "ryu";
const VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("meetings")) d.createObjectStore("meetings", { keyPath: "id" });
      if (!d.objectStoreNames.contains("audio")) d.createObjectStore("audio");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const r = fn(t.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export const vault: Vault = {
  async init() {
    await db();
    let persistent = false;
    try {
      persistent = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
    } catch {}
    return { persistent };
  },
  list: () => tx<Meeting[]>("meetings", "readonly", (s) => s.getAll() as IDBRequest<Meeting[]>),
  save: (m) => tx("meetings", "readwrite", (s) => s.put(m)).then(() => undefined),
  remove: async (id) => {
    await tx("meetings", "readwrite", (s) => s.delete(id));
    await tx("audio", "readwrite", (s) => s.delete(id));
  },
  saveAudio: (id, a: StoredAudio) => tx("audio", "readwrite", (s) => s.put({ type: a.type, blob: a.blob }, id)).then(() => undefined),
  getAudio: (id) => tx<StoredAudio | undefined>("audio", "readonly", (s) => s.get(id) as IDBRequest<StoredAudio | undefined>).then((r) => r ?? null),
};
