import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { fingerprints, planSync, mergedFiles, hasIndependentHistories } from "../remote-sync-plan";
const file = (path: string, value: string) => ({ path, content: Buffer.from(value).toString("base64") });
afterEach(() => vi.unstubAllGlobals());
it("distinguishes local and remote changes, deletions and identical concurrent edits", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const base = [file("local.tex", "old"), file("remote.tex", "old"), file("delete.tex", "old"), file("same.tex", "old")];
  const local = [file("local.tex", "new"), file("remote.tex", "old"), file("same.tex", "new")];
  const remote = [file("local.tex", "old"), file("remote.tex", "new"), file("delete.tex", "old"), file("same.tex", "new")];
  const changes = await planSync(await fingerprints(base), local, remote);
  expect(changes.map(change => [change.path, change.kind])).toEqual([["delete.tex", "LOCAL"], ["local.tex", "LOCAL"], ["remote.tex", "REMOTE"], ["same.tex", "SAME"]]);
  expect(mergedFiles(changes, {}).map(file => file.path)).toEqual(["local.tex", "remote.tex", "same.tex"]);
});
it("blocks overlapping edits and delete/edit conflicts until the user chooses", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const baseline = await fingerprints([file("main.tex", "base"), file("figure.tex", "base")]);
  const changes = await planSync(baseline, [file("main.tex", "local")], [file("main.tex", "remote"), file("figure.tex", "edited")]);
  expect(changes.every(change => change.kind === "CONFLICT")).toBe(true);
  expect(() => mergedFiles(changes, {})).toThrow("Resolve all conflicts");
  expect(mergedFiles(changes, { "main.tex": "REMOTE", "figure.tex": "LOCAL" })).toEqual([file("main.tex", "remote")]);
});
it("detects independent unbaselined histories when linking two pre-existing populated sources", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const local = [file("main.tex", "local-content")];
  const remote = [file("intro.tex", "remote-content")];
  expect(hasIndependentHistories([], local, remote)).toBe(true);
  expect(hasIndependentHistories([{ path: "main.tex", sha: "abc" }], local, remote)).toBe(false);
  expect(hasIndependentHistories([], [], remote)).toBe(false);
  expect(hasIndependentHistories([], local, [])).toBe(false);
});
