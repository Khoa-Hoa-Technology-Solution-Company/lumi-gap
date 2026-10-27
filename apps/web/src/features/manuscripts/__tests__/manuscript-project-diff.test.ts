import { expect, it } from "vitest";
import type { SnapshotFile } from "@trend/shared-types";
import { manifestChanges } from "../manuscript-project-diff";
const file = (id: string, path: string, text: string): SnapshotFile => ({ id, path, text, kind: "TEXT", sequence: 1, checksum: "original", mimeType: null, sizeBytes: text.length });
it("compares stable file identities across additions, removals, renames and content changes", () => {
  const before = [file("rename", "intro.tex", "Original"), file("deleted", "removed.tex", "Removed"), file("modified", "main.tex", "Old"), file("stable", "same.tex", "Same")];
  const after = [{ ...before[0]!, path: "sections/intro.tex", text: "Renamed and edited" }, file("modified", "main.tex", "New"), { ...before[3]!, checksum: "crdt-updated" }, file("new", "new.tex", "Added")];
  const changed = manifestChanges(before, after);
  expect(changed).toHaveLength(4); expect(changed.map(row => row.kind).sort()).toEqual(["added", "modified", "removed", "renamed"]);
  expect(changed.find(row => row.kind === "renamed")?.after?.text).toBe("Renamed and edited");
});
it("compares binary asset checksums and distinguishes replacement at an identical path", () => {
  const image: SnapshotFile = { ...file("image", "figure.png", ""), kind: "ASSET" };
  expect(manifestChanges([image], [{ ...image, checksum: "changed" }])[0]?.kind).toBe("modified");
  expect(manifestChanges([file("old", "same.tex", "Old")], [file("new", "same.tex", "New")]).map(row => row.kind)).toEqual(["removed", "added"]);
});
