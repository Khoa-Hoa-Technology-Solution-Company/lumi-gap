import { expect, it } from "vitest";
import * as Y from "yjs";
import type { ManuscriptSuggestion } from "@trend/shared-types";
import { captureAiSelection } from "../ai-selection";
import { sourceProposalRange } from "../source-proposals";

it("rebases persisted review anchors and hides stale or foreign proposals", () => {
  const doc = new Y.Doc(), text = doc.getText("source"); text.insert(0, "prefix ".repeat(20) + "original" + " suffix".repeat(20));
  const from = text.toString().indexOf("original"), target = captureAiSelection("file", text, from, from + 8);
  const row = { fileId: "file", status: "PENDING", original: "original", anchor: JSON.parse(JSON.stringify(target)) } as ManuscriptSuggestion;
  text.insert(0, "Remote edit\n");
  const range = sourceProposalRange(row, "file", text)!;
  expect(text.toString().slice(range.from, range.to)).toBe("original");
  expect(sourceProposalRange(row, "other", text)).toBeNull();
  text.insert(range.from + 2, "changed");
  expect(sourceProposalRange(row, "file", text)).toBeNull();
  expect(sourceProposalRange({ ...row, anchor: null }, "file", text)).toBeNull();
  doc.destroy();
});
