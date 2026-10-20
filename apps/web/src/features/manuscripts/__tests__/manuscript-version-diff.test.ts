import { expect, it } from "vitest";
import { sourceDiff } from "../manuscript-version-diff";
it("compares insertions, removals and edits without losing common content", () => {
  const diff = sourceDiff("Title\nOld sentence\nCitation\nEnd", "Title\nNew sentence\nCitation\nAdded\nEnd");
  expect(diff.filter(line => line.kind !== "added").map(line => line.text).join("\n")).toBe("Title\nOld sentence\nCitation\nEnd");
  expect(diff.filter(line => line.kind !== "removed").map(line => line.text).join("\n")).toBe("Title\nNew sentence\nCitation\nAdded\nEnd");
  expect(diff.some(line => line.kind === "removed" && line.text === "Old sentence")).toBe(true);
});
it("bounds comparisons for large unrelated source files", () => {
  const before = Array.from({ length: 2000 }, (_, i) => `old ${i}`).join("\n"), after = Array.from({ length: 2000 }, (_, i) => `new ${i}`).join("\n");
  const diff = sourceDiff(before, after);
  expect(diff.filter(line => line.kind === "removed")).toHaveLength(2000);
  expect(diff.filter(line => line.kind === "added")).toHaveLength(2000);
});
