import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import type { ManuscriptSyncState } from "@trend/shared-types";
import { api, API_BASE_URL } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";

export const encodeBytes = (bytes: Uint8Array) => { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); };
export const decodeBytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
type Pending = { type: "update"; clientSessionId: string; clientSequence: number; update: string };
type State = { status: ManuscriptSyncState; canWrite: boolean; ready: boolean; pending: number; sequence: number; fileVersion: number; error: string | null };

/** A Yjs provider with application-level PostgreSQL receipts, independent of awareness/sync. */
export class ManuscriptProvider {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  readonly text = this.doc.getText("source");
  readonly clientSessionId = crypto.randomUUID();
  private socket: WebSocket | null = null;
  private queue: Pending[] = [];
  private nextSequence = 1;
  private sent = false;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private renewal: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private listeners = new Set<() => void>();
  private controller = new AbortController();
  private unsubscribeAuth: () => void;
  private state: State = { status: "CONNECTING", canWrite: false, ready: false, pending: 0, sequence: 0, fileVersion: 1, error: null };
  constructor(readonly projectId: string, readonly manuscriptId: string, readonly fileId: string, readonly userId: string, private metadata: () => void) {
    this.doc.on("update", this.onUpdate);
    this.awareness.on("update", this.onAwareness);
    this.unsubscribeAuth = useAuthStore.subscribe(state => { if (state.user?.id !== userId) this.destroy(); });
    void this.connect();
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private set(change: Partial<State>) { this.state = { ...this.state, ...change, pending: this.queue.length }; for (const listener of this.listeners) listener(); }
  private onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.stopped) return;
    this.queue.push({ type: "update", clientSessionId: this.clientSessionId, clientSequence: this.nextSequence++, update: encodeBytes(update) });
    this.set({ status: this.socket?.readyState === WebSocket.OPEN ? "SYNCING" : "OFFLINE" }); this.flush();
  };
  private onAwareness = ({ added, updated }: { added: number[]; updated: number[] }, origin: unknown) => {
    if (origin === this || ![...added, ...updated].includes(this.doc.clientID)) return;
    if (this.socket?.readyState === WebSocket.OPEN && this.state.ready) this.socket.send(JSON.stringify({ type: "presence", clock: this.awareness.meta.get(this.doc.clientID)?.clock ?? 0, cursor: this.awareness.getLocalState()?.cursor ?? null }));
  };
  private flush() {
    if (this.sent || !this.state.ready || !this.state.canWrite || this.socket?.readyState !== WebSocket.OPEN || !this.queue.length || this.stopped) return;
    this.sent = true; this.socket.send(JSON.stringify(this.queue[0]));
  }
  private async connect() {
    if (this.stopped || useAuthStore.getState().user?.id !== this.userId) return;
    this.set({ status: this.failures ? "RECONNECTING" : "CONNECTING", ready: false });
    try {
      const response = await api.post<{ data: { ticket: string } }>(`/projects/${this.projectId}/manuscripts/${this.manuscriptId}/files/${this.fileId}/ticket`, {}, { expectedUserId: this.userId, signal: this.controller.signal });
      if (this.stopped) return;
      const base = new URL(API_BASE_URL, window.location.origin);
      const url = new URL(`${base.pathname.replace(/\/$/, "")}/manuscript-collaboration`, base.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url); this.socket = socket;
      socket.onopen = () => socket.send(JSON.stringify({ type: "hello", ticket: response.data.data.ticket, clientId: this.doc.clientID }));
      socket.onmessage = event => {
        if (this.stopped || this.socket !== socket) return;
        try {
          const frame = JSON.parse(String(event.data));
          if (frame.type === "state") {
            Y.applyUpdate(this.doc, decodeBytes(frame.update), this);
            this.sent = false; this.failures = 0;
            this.awareness.setLocalStateField("user", frame.user);
            this.set({ ready: true, canWrite: frame.canWrite, sequence: frame.sequence, fileVersion: frame.fileVersion, status: !frame.canWrite ? "READ_ONLY" : this.queue.length ? "SYNCING" : "SAVED", error: null });
            this.onAwareness({ added: [], updated: [this.doc.clientID] }, null); this.flush();
          } else if (frame.type === "receipt") {
            if (frame.clientSessionId !== this.clientSessionId || frame.clientSequence !== this.queue[0]?.clientSequence) return;
            Y.applyUpdate(this.doc, decodeBytes(frame.update), this);
            this.queue.shift(); this.sent = false;
            this.set({ sequence: Math.max(this.state.sequence, frame.sequence), fileVersion: frame.fileVersion, status: this.queue.length ? "SYNCING" : "SAVED", error: null }); this.flush();
          } else if (frame.type === "update") {
            Y.applyUpdate(this.doc, decodeBytes(frame.update), this); this.set({ sequence: Math.max(this.state.sequence, frame.sequence), fileVersion: frame.fileVersion });
          } else if (frame.type === "presence") {
            const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, frame.entries.length);
            for (const entry of frame.entries) { encoding.writeVarUint(encoder, entry.clientId); encoding.writeVarUint(encoder, entry.clock); encoding.writeVarString(encoder, JSON.stringify(entry.state)); }
            applyAwarenessUpdate(this.awareness, encoding.toUint8Array(encoder), this); this.set({});
          } else if (frame.type === "metadata") this.metadata();
          else if (frame.type === "permission") { this.set({ canWrite: frame.canWrite, status: !frame.canWrite ? "READ_ONLY" : this.queue.length ? "SYNCING" : "SAVED" }); this.flush(); }
          else if (frame.type === "error") this.set({ status: "SYNC_ERROR", error: frame.code });
        } catch { this.set({ status: "SYNC_ERROR", error: "SYNC_ERROR" }); socket.close(); }
      };
      socket.onclose = () => {
        if (this.socket !== socket || this.stopped) return;
        clearTimeout(this.renewal); this.sent = false;
        removeAwarenessStates(this.awareness, [...this.awareness.getStates().keys()].filter(id => id !== this.doc.clientID), this);
        this.set({ ready: false, status: navigator.onLine ? "RECONNECTING" : "OFFLINE" });
        this.retry = setTimeout(() => void this.connect(), Math.min(1000 * 2 ** this.failures++, 10000));
      };
      socket.onerror = () => this.set({ error: "NETWORK_INTERRUPTED" });
      this.renewal = setTimeout(() => socket.close(1000, "Renew authentication"), 240000);
    } catch (error) {
      if (this.stopped) return;
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403 || status === 404 || status === 409) { this.set({ status: "SYNC_ERROR", canWrite: false, ready: false, error: "ACCESS_REVOKED" }); return; }
      this.set({ status: "OFFLINE", error: "NETWORK_INTERRUPTED" });
      this.retry = setTimeout(() => void this.connect(), Math.min(1000 * 2 ** this.failures++, 10000));
    }
  }
  async waitForSaved() {
    if (!this.queue.length && this.state.ready) return;
    await new Promise<void>((resolve, reject) => {
      const stop = this.subscribe(() => { if (!this.queue.length && this.state.ready) { clearTimeout(timeout); stop(); resolve(); } });
      const timeout = setTimeout(() => { stop(); reject(new Error("SOURCE_NOT_SAVED")); }, 10000);
    });
  }
  destroy() {
    if (this.stopped) return; this.stopped = true; this.controller.abort(); clearTimeout(this.retry); clearTimeout(this.renewal); this.socket?.close(); this.unsubscribeAuth(); this.doc.off("update", this.onUpdate); this.awareness.off("update", this.onAwareness); this.awareness.destroy(); this.doc.destroy(); this.listeners.clear();
  }
}
