import { expect, it } from "vitest";
import { diffContent } from "./content-diff";

it("keeps matching lines aligned when lines are inserted, removed and edited", () => {
  const before = "Tiêu đề\nPhương pháp cũ\nKết quả", after = "Tiêu đề\nDữ liệu mới\nPhương pháp sửa\nKết quả";
  const diff = diffContent(before, after)!;
  expect(diff.filter((line) => line.kind !== "added").map((line) => line.text).join("\n")).toBe(before);
  expect(diff.filter((line) => line.kind !== "removed").map((line) => line.text).join("\n")).toBe(after);
  expect(diff.filter((line) => line.kind === "same").map((line) => line.text)).toEqual(["Tiêu đề", "Kết quả"]);
});

it("uses a bounded fallback for very long content", () => {
  expect(diffContent("line\n".repeat(1100), "line\n".repeat(1100))).toBeNull();
  expect(diffContent("", "")).toEqual([{ kind: "same", text: "" }]);
});
