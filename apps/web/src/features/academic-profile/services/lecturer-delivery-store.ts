import type { LecturerVerificationSubmission, LecturerVerificationSubmitInput } from "@trend/shared-types";
import type { EvidenceDraft } from "../components/lecturer-evidence-entry";

export type LecturerDelivery = {
  userId: string;
  id: string;
  institutionName: string;
  input: Omit<LecturerVerificationSubmitInput, "sources">;
  sources: EvidenceDraft[];
  uploads: Record<string, { uploadId: string; expiresAt: string }>;
  payload?: LecturerVerificationSubmitInput;
  receipt?: LecturerVerificationSubmission;
  state: "QUEUED" | "UPLOADING" | "SENDING" | "FAILED" | "UNCERTAIN" | "SENT";
  error?: string;
  progress?: number;
  lease?: { owner: string; until: number };
};
export interface DeliveryStore {
  read(userId: string): Promise<LecturerDelivery | undefined>;
  enqueue(job: LecturerDelivery): Promise<void>;
  update(userId: string, change: (job: LecturerDelivery) => LecturerDelivery | undefined): Promise<LecturerDelivery | undefined>;
}

export const deliveryChanged = () => window.dispatchEvent(new Event("lecturer-delivery-changed"));
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lumigap-private-delivery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("lecturer", { keyPath: "userId" });
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error("Close other LumiGap tabs and try again.")); };
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    // Resolve only after commit, so closing the form cannot lose the files.
    const tx = db.transaction("lecturer", mode);
    let result: T, failure: unknown;
    tx.oncomplete = () => { if (mode === "readwrite") deliveryChanged(); resolve(result); };
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error("Could not save evidence on this browser."));
    run(tx.objectStore("lecturer"), value => { result = value; }, error => { failure = error; tx.abort(); });
  });
}

export const lecturerDeliveryStore: DeliveryStore = {
  read: userId => transaction("readonly", (store, done) => {
    const request = store.get(userId);
    request.onsuccess = () => done(request.result as LecturerDelivery | undefined);
  }),
  enqueue: job => transaction("readwrite", (store, done, fail) => {
    const request = store.get(job.userId);
    request.onsuccess = () => {
      if (request.result && request.result.state !== "SENT") return fail(new Error("A verification delivery is already saved. Check its status before starting another."));
      store.put(job); done(undefined);
    };
  }),
  update: (userId, change) => transaction("readwrite", (store, done, fail) => {
    const request = store.get(userId);
    request.onsuccess = () => {
      try {
        if (!request.result) return done(undefined);
        const result = change(request.result as LecturerDelivery);
        if (result) store.put(result); else store.delete(userId);
        done(result);
      } catch (error) { fail(error); }
    };
  }),
};
