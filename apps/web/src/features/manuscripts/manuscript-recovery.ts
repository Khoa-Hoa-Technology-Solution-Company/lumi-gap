export type PendingSourceUpdate = { type: "update"; clientSessionId: string; clientSequence: number; update: string };
type Recovery = { id: string; scope: string; user: string; updated: number; state: string; queue: PendingSourceUpdate[] };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("lumigap-manuscript-recovery", 1);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore("edits", { keyPath: "id" }); store.createIndex("scope", "scope"); store.createIndex("user", "user"); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try { return await new Promise<T>((resolve, reject) => { const tx = db.transaction("edits", mode), request = run(tx.objectStore("edits")); tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
export const manuscriptRecovery = {
  load: async (scope: string) => {
    const rows = await transaction<Recovery[]>("readonly", store => store.index("scope").getAll(scope));
    // These are unacknowledged writes, not a cache. Age or typing volume cannot
    // establish that the server has saved them. Only receipts/logout remove them.
    return rows.sort((left, right) => left.updated - right.updated || left.id.localeCompare(right.id));
  },
  save: (record: Recovery) => transaction("readwrite", store => store.put(record)),
  remove: (id: string) => transaction("readwrite", store => store.delete(id)),
  removeIfUnchanged: async (record: Recovery) => {
    const db = await database();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("edits", "readwrite"), store = tx.objectStore("edits"), read = store.get(record.id);
      read.onsuccess = () => { const current = read.result as Recovery | undefined; if (current?.updated === record.updated && current.state === record.state && JSON.stringify(current.queue) === JSON.stringify(record.queue)) store.delete(record.id); };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  },
  clearUser: async (user: string) => {
    const keys = await transaction<IDBValidKey[]>("readonly", store => store.index("user").getAllKeys(user));
    await Promise.all(keys.map(key => transaction("readwrite", store => store.delete(key))));
  },
};
