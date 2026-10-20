// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ManuscriptTrackedEditing } from "../manuscript-tracked-editing";
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/projects/components/workspace-common", () => ({ useUnsavedWorkspace: vi.fn() }));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label)!;
async function type(text: string) { await act(async () => { const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); }); }
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); }
it("autosaves an independent proposal in StrictMode and retains typing after failure until explicit retry", async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ id: "proposal", revision: 1 });
  const update = vi.fn(async () => ({ id: "proposal", revision: 2 })), dirty = vi.fn();
  await act(async () => root.render(<StrictMode><ManuscriptTrackedEditing original="Original" filename="main.tex" disabled={false} create={create} update={update} onDirty={dirty} onClose={() => undefined} onReview={() => undefined} /></StrictMode>));
  await type("First edit"); await tick();
  expect(host.textContent).toContain("Proposal save interrupted"); expect(dirty).toHaveBeenLastCalledWith(true);
  await type("Later edit"); await tick(); expect(create).toHaveBeenCalledOnce();
  expect(host.querySelector(".cm-content")?.textContent).toBe("Later edit");
  await act(async () => button("Retry save").click());
  expect(create.mock.calls).toEqual([["First edit"], ["First edit"]]);
  expect(update).toHaveBeenCalledWith({ id: "proposal", revision: 1 }, "Later edit");
  expect(host.textContent).toContain("Proposal saved for review"); expect(dirty).toHaveBeenLastCalledWith(false);
});
it("blocks over-limit autosaves and editing after permissions are revoked", async () => {
  const create = vi.fn(async () => ({ id: "proposal", revision: 1 }));
  const props = { original: "Original", filename: "main.tex", create, update: vi.fn(), onDirty: vi.fn(), onClose: vi.fn(), onReview: vi.fn() };
  await act(async () => root.render(<ManuscriptTrackedEditing {...props} disabled={false} />));
  await type("x".repeat(100001)); await tick(); expect(create).not.toHaveBeenCalled(); expect(button("Save proposal").disabled).toBe(true);
  await type("Within limit");
  await act(async () => root.render(<ManuscriptTrackedEditing {...props} disabled />));
  await tick(); expect(create).not.toHaveBeenCalled();
  const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
  expect(view.state.readOnly).toBe(true); expect(host.textContent).toContain("permissions recover");
});
