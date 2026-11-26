// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STALE_CHUNK_RELOAD_WINDOW_MS, isStaleChunkError, reloadOnceForStaleChunk } from "../stale-chunk";

describe("isStaleChunkError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://lumigap.io.vn/assets/login-abc123.js",
    "error loading dynamically imported module: https://lumigap.io.vn/assets/x.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/page-1.css",
  ])("recognises %s", (message) => {
    expect(isStaleChunkError(new Error(message))).toBe(true);
  });

  it("ignores ordinary rendering errors", () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  const reload = vi.fn();
  beforeEach(() => {
    window.sessionStorage.clear();
    reload.mockReset();
    vi.stubGlobal("location", { ...window.location, reload });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reloads the first time", () => {
    expect(reloadOnceForStaleChunk(1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not reload again within the window, so a missing chunk cannot loop", () => {
    reloadOnceForStaleChunk(1_000_000);
    expect(reloadOnceForStaleChunk(1_000_000 + STALE_CHUNK_RELOAD_WINDOW_MS - 1)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads again after the window", () => {
    reloadOnceForStaleChunk(1_000_000);
    expect(reloadOnceForStaleChunk(1_000_000 + STALE_CHUNK_RELOAD_WINDOW_MS)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
