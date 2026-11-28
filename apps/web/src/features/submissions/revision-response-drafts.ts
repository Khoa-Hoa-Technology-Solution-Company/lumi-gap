import { useCallback, useEffect, useState } from "react";

export interface RevisionDraftScope {
  userId?: string;
  projectId?: string;
  submissionId?: string;
  requestId?: string;
}

const DRAFT_EVENT = "lumigap:revision-drafts-changed";
const memoryFallback = new Map<string, Record<string, string>>();

function buildStorageKey(scope: RevisionDraftScope): string | null {
  if (!scope.submissionId || !scope.requestId) return null;
  return `lumigap:rev-draft:${scope.userId ?? "anon"}:${scope.projectId ?? "standalone"}:${scope.submissionId}:${scope.requestId}`;
}

function readRaw(key: string): Record<string, string> {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
      }
    }
  } catch {
    // Fall back to in-memory map if sessionStorage is unavailable.
  }
  return { ...(memoryFallback.get(key) ?? {}) };
}

function writeRaw(key: string, next: Record<string, string>) {
  const cleaned = Object.fromEntries(Object.entries(next).filter(([, value]) => value.length > 0));
  memoryFallback.set(key, cleaned);
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      if (Object.keys(cleaned).length === 0) window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, JSON.stringify(cleaned));
    }
  } catch {
    // Ignore quota or storage restriction errors; in-memory state stays intact.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { key } }));
  }
}

export function readRevisionDrafts(scope: RevisionDraftScope): Record<string, string> {
  const key = buildStorageKey(scope);
  return key ? readRaw(key) : {};
}

export function writeRevisionDraft(scope: RevisionDraftScope, itemId: string, text: string) {
  const key = buildStorageKey(scope);
  if (!key) return;
  const current = readRaw(key);
  if (!text) delete current[itemId];
  else current[itemId] = text;
  writeRaw(key, current);
}

export function clearRevisionDrafts(scope: RevisionDraftScope, itemIds?: string[]) {
  const key = buildStorageKey(scope);
  if (!key) return;
  if (!itemIds) {
    writeRaw(key, {});
    return;
  }
  const current = readRaw(key);
  for (const id of itemIds) delete current[id];
  writeRaw(key, current);
}

export function useRevisionResponseDrafts(scope: RevisionDraftScope) {
  const key = buildStorageKey(scope);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => (key ? readRaw(key) : {}));

  useEffect(() => {
    setDrafts(key ? readRaw(key) : {});
    if (!key || typeof window === "undefined") return;
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail?.key || detail.key === key) {
        setDrafts(readRaw(key));
      }
    };
    window.addEventListener(DRAFT_EVENT, onChange);
    return () => window.removeEventListener(DRAFT_EVENT, onChange);
  }, [key]);

  const setDraft = useCallback(
    (itemId: string, text: string) => {
      if (!key) return;
      const current = readRaw(key);
      if (!text) delete current[itemId];
      else current[itemId] = text;
      writeRaw(key, current);
      setDrafts(current);
    },
    [key],
  );

  const clearDrafts = useCallback(
    (itemIds?: string[]) => {
      if (!key) return;
      if (!itemIds) {
        writeRaw(key, {});
        setDrafts({});
        return;
      }
      const current = readRaw(key);
      for (const id of itemIds) delete current[id];
      writeRaw(key, current);
      setDrafts(current);
    },
    [key],
  );

  return { drafts, setDraft, clearDrafts };
}
