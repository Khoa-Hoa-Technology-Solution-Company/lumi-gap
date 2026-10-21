import { expect, it } from "vitest";
import * as Y from "yjs";
import { captureAiSelection, resolveAiSelection } from "../ai-selection";

it("tracks a selection when a collaborator inserts text before it", () => {
  const doc = new Y.Doc(), text = doc.getText("source"); text.insert(0, "Intro. Original passage. End.");
  const target = captureAiSelection("main", text, 7, 23);
  text.insert(0, "New context. ");
  expect(resolveAiSelection(target, "main", text)).toEqual({ from: 20, to: 36 });
  expect(resolveAiSelection(target, "other", text)).toBeNull(); doc.destroy();
});
it("refuses replacement after selected text is edited or deleted", () => {
  const doc = new Y.Doc(), text = doc.getText("source"); text.insert(0, "Original passage");
  const target = captureAiSelection("main", text, 0, text.length);
  text.insert(5, "team edit"); expect(resolveAiSelection(target, "main", text)).toBeNull();
  text.delete(0, text.length); expect(resolveAiSelection(target, "main", text)).toBeNull(); doc.destroy();
});
it("refuses cursor insertion when adjacent context changed", () => {
  const doc = new Y.Doc(), text = doc.getText("source"); text.insert(0, "Before. After.");
  const target = captureAiSelection("main", text, 8, 8);
  expect(resolveAiSelection(target, "main", text)).toEqual({ from: 8, to: 8 });
  text.insert(8, "Team addition"); expect(resolveAiSelection(target, "main", text)).toBeNull(); doc.destroy();
});
it("keeps the original passage replaceable after inserting several citations at its end", () => {
  const doc = new Y.Doc(), text = doc.getText("source"); text.insert(0, "Original passage. End.");
  const target = captureAiSelection("main", text, 0, 17);
  text.insert(resolveAiSelection(target, "main", text)!.to, "\\cite{one}");
  text.insert(resolveAiSelection(target, "main", text)!.to, "\\cite{two}");
  const range = resolveAiSelection(target, "main", text)!;
  expect(range).toEqual({ from: 0, to: 17 });
  text.delete(range.from, range.to - range.from); text.insert(range.from, "Improved passage.");
  expect(text.toString()).toBe("Improved passage.\\cite{two}\\cite{one} End.");
  doc.destroy();
});
it("checks adjacent context while allowing unrelated text before the captured passage", () => {
  const doc = new Y.Doc(), text = doc.getText("source"); text.insert(0, "Intro. Original passage. End.");
  const target = captureAiSelection("main", text, 7, 23);
  text.insert(0, "Unrelated prefix. ");
  expect(resolveAiSelection(target, "main", text, true)).not.toBeNull();
  const range = resolveAiSelection(target, "main", text)!;
  text.insert(range.to + 1, "Changed interpretation. ");
  expect(resolveAiSelection(target, "main", text, true)).toBeNull();
  doc.destroy();
});
