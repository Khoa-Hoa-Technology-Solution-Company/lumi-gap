import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { fingerprints, planSync, mergedFiles, hasIndependentHistories } from "../remote-sync-plan";
import { mergeSourceText } from "../merge-source-text";
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
it("merges independent line edits only against a verified baseline and preserves CRLF and final newline", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const base = [file("main.tex", "one\r\ntwo\r\nthree")], local = [file("main.tex", "ONE\r\ntwo\r\nthree")], remote = [file("main.tex", "one\r\ntwo\r\nTHREE")];
  const changes = await planSync(await fingerprints(base), local, remote, base);
  expect(changes[0]?.kind).toBe("MERGED");
  expect(mergedFiles(changes, {})).toEqual([file("main.tex", "ONE\r\ntwo\r\nTHREE")]);
  expect((await planSync(await fingerprints(base), local, remote, [file("main.tex", "unrelated")]))[0]?.kind).toBe("CONFLICT");
});
it("keeps overlapping, binary, invalid UTF8 and delete/edit changes for manual review", async () => {
  vi.stubGlobal("crypto", webcrypto);
  for (const [path, original, local, remote] of [
    ["main.tex", "one\ntwo\n", "ONE\ntwo\n", "OTHER\ntwo\n"],
    ["image.pdf", "one\ntwo\n", "ONE\ntwo\n", "one\nTWO\n"],
    ["main.tex", "one\ntwo\n", "ONE\u0000\ntwo\n", "one\nTWO\n"],
  ]) {
    const base = [file(path!, original!)];
    expect((await planSync(await fingerprints(base), [file(path!, local!)], [file(path!, remote!)], base))[0]?.kind).toBe("CONFLICT");
  }
  const base = [file("main.tex", "one\ntwo\n")];
  expect((await planSync(await fingerprints(base), [{ path: "main.tex", content: "/w==" }], [file("main.tex", "one\nTWO\n")], base))[0]?.kind).toBe("CONFLICT");
  expect((await planSync(await fingerprints(base), [], [file("main.tex", "one\nTWO\n")], base))[0]?.kind).toBe("CONFLICT");
});
it("merges independent insertions and deletions, deduplicates identical edits and refuses ambiguous boundaries", () => {
  expect(mergeSourceText("a\nb\nc\nd\n", "a\nc\nd\n", "a\nb\nc\nD\n")).toBe("a\nc\nD\n");
  expect(mergeSourceText("a\nb\nc\n", "start\na\nb\nc\n", "a\nb\nc\nend\n")).toBe("start\na\nb\nc\nend\n");
  expect(mergeSourceText("a\nb\nc\n", "A\nb\nc\n", "A\nb\nC\n")).toBe("A\nb\nC\n");
  expect(mergeSourceText("a\nb\n", "A\nb\n", "insert\na\nb\n")).toBeUndefined();
  expect(mergeSourceText("a\n", "x\na\n", "y\na\n")).toBeUndefined();
  expect(mergeSourceText("a\n".repeat(1000), "b\n".repeat(1000), "c\n".repeat(1000))).toBeUndefined();
  expect(mergeSourceText("a".repeat(128_001), "b", "c")).toBeUndefined();
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
