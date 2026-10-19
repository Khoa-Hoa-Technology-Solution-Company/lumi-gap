// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { ManuscriptProvider } from "../collaboration-provider";
import { SourceEditor } from "../source-editor";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const providers: Array<ReturnType<typeof fixture>> = [];
let root: Root | undefined, host: HTMLDivElement | undefined, view: EditorView | null = null;
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
function fixture(initial: string) {
  const doc = new Y.Doc(), text = doc.getText("source"), awareness = new Awareness(doc);
  text.insert(0, initial);
  const undoManager = new Y.UndoManager(text, { trackedOrigins: new Set() });
  const listeners = new Set<() => void>();
  let state = { canWrite: true };
  const value = { doc, text, awareness, undoManager,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    permission: (canWrite: boolean) => { state = { canWrite }; listeners.forEach(listener => listener()); },
    destroy: () => { undoManager.destroy(); awareness.destroy(); doc.destroy(); },
  };
  return value;
}
async function open(provider: ReturnType<typeof fixture>, filename: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!host) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); }
  await act(async () => root!.render(<SourceEditor provider={provider as unknown as ManuscriptProvider} filename={filename} citationKeys={[]} onView={next => { view = next; }} />));
}
const undo = (shiftKey = false) => view!.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: shiftKey ? "Z" : "z", code: "KeyZ", keyCode: 90, ctrlKey: true, shiftKey, bubbles: true, cancelable: true }));
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const provider of providers.splice(0)) provider.destroy();
  host?.remove(); host = undefined; root = undefined; view = null; vi.unstubAllGlobals();
});

it("keeps the original file's undo across file switches and renames, preserving remote edits", async () => {
  const first = fixture("Original"), second = fixture("Other file"); providers.push(first, second);
  await open(first, "main.tex");
  await act(async () => view!.dispatch({ changes: { from: first.text.length, insert: " local" } }));
  await open(second, "other.tex");
  first.doc.transact(() => first.text.insert(0, "Remote "), "remote-provider");
  await open(first, "renamed.tex");
  await act(async () => { undo(); });
  expect(first.text.toString()).toBe("Remote Original");
  expect(second.text.toString()).toBe("Other file");
  expect(view!.state.doc.toString()).toBe("Remote Original");
});

it("blocks undo and redo while read-only, preserving history if write permission returns", async () => {
  const provider = fixture("Original"); providers.push(provider);
  await open(provider, "main.tex");
  await act(async () => view!.dispatch({ changes: { from: provider.text.length, insert: " saved" } }));
  await act(async () => provider.permission(false));
  expect(view!.state.readOnly).toBe(true);
  await act(async () => { undo(); });
  expect(provider.text.toString()).toBe("Original saved");
  await act(async () => provider.permission(true));
  await act(async () => { undo(); });
  expect(provider.text.toString()).toBe("Original");
  await act(async () => provider.permission(false));
  await act(async () => { undo(true); });
  expect(provider.text.toString()).toBe("Original");
  await act(async () => provider.permission(true));
  await act(async () => { undo(true); });
  expect(provider.text.toString()).toBe("Original saved");
});
