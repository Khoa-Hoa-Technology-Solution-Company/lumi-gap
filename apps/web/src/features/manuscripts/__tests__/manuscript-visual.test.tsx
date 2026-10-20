// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import * as Y from "yjs";
import { ManuscriptVisual } from "../manuscript-visual";
import type { ManuscriptProvider } from "../collaboration-provider";
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/projects/components/workspace-common", () => ({ useUnsavedWorkspace: vi.fn() }));
it("opens a visual table, previews changed cells, and applies only after explicit acceptance", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const doc = new Y.Doc(), text = doc.getText("source"), original = "\\begin{tabular}{ll}\nName & Value \\\\\nTest & 42 \\\\\n\\end{tabular}";
  text.insert(0, original);
  const provider = { fileId: "main", text, getSnapshot: () => ({ canWrite: true, pending: 0 }) } as ManuscriptProvider;
  const host = document.createElement("div"), root = createRoot(host), apply = vi.fn(async (_target: unknown, _text: string) => undefined), dirty = vi.fn(); document.body.append(host);
  try {
    await act(async () => root.render(<ManuscriptVisual provider={provider} canWrite apply={apply} source={vi.fn()} onDirty={dirty} />));
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Table editor")!.click());
    // The editor loads on demand; query the real modal instead of testing only parsing.
    await act(async () => { await vi.dynamicImportSettled(); });
    await vi.waitFor(async () => { await act(async () => undefined); expect(document.querySelector('[role="dialog"]')).not.toBeNull(); }, { timeout: 5000 });
    expect(dirty).toHaveBeenLastCalledWith(true); expect(apply).not.toHaveBeenCalled(); expect(text.toString()).toBe(original);
    const input = document.querySelector<HTMLInputElement>('[aria-label="Cell 2, 2"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "50%"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === "Apply to source")!.click());
    expect(apply).toHaveBeenCalledOnce(); expect(apply.mock.calls[0]?.[1]).toContain("50\\%");
    expect(text.toString()).toBe(original); expect(dirty).toHaveBeenLastCalledWith(false);
  } finally { await act(async () => root.unmount()); host.remove(); doc.destroy(); vi.unstubAllGlobals(); }
});
