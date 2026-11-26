/**
 * After a deploy the hashed JS/CSS chunks change. A tab that was opened before
 * the deploy still references the old chunk names, so the next lazy route
 * fails to load ("Failed to fetch dynamically imported module"). A single full
 * reload fetches the new index.html and fixes it.
 */
const STALE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite CSS preload
];

/** Reload at most once per window, so a genuinely missing chunk cannot cause a reload loop. */
export const STALE_CHUNK_RELOAD_WINDOW_MS = 10_000;
const STORAGE_KEY = "lumigap:stale-chunk-reload-at";

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(message));
}

/** Reloads the page unless it already did so in the last few seconds. Returns true when a reload was started. */
export function reloadOnceForStaleChunk(now = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(STORAGE_KEY) ?? 0);
    if (now - last < STALE_CHUNK_RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // Storage blocked (private mode, policy): still reload once; the error boundary stays as fallback.
  }
  window.location.reload();
  return true;
}
