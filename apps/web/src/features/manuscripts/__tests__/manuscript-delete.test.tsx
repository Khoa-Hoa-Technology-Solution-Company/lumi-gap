// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ManuscriptSummary } from "@trend/shared-types";
const api = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: api }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import { DeleteManuscript } from "../manuscript-delete";

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
const manuscript: ManuscriptSummary = { id: "draft", projectId: "project", title: "Team paper", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", version: 3, mainFileId: "main", archived: false, canWrite: true, canDelete: true, createdAt: "2026-10-20", updatedAt: "2026-10-20" };
const button = (name: string) => [...document.querySelectorAll("button")].find(element => element.textContent === name)!;

it("requires confirmation, preserves the dialog after a failed delete and prevents double submission", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host), deleted = vi.fn(), refresh = vi.fn(); document.body.append(host);
  try {
    await act(async () => root.render(<DeleteManuscript projectId="project" manuscript={manuscript} onDeleted={deleted} onRefresh={refresh} />));
    await act(async () => button("Delete").click());
    expect(api.remove).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Team paper");
    await act(async () => button("Cancel").click());
    expect(api.remove).not.toHaveBeenCalled();
    await act(async () => button("Delete").click());
    api.remove.mockRejectedValueOnce(new Error("network"));
    await act(async () => button("Delete manuscript").click());
    expect(document.body.textContent).toContain("Could not delete the manuscript");
    expect(deleted).not.toHaveBeenCalled();
    let finish!: () => void;
    api.remove.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await act(async () => { const confirm = button("Delete manuscript"); confirm.click(); confirm.click(); });
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(api.remove).toHaveBeenLastCalledWith("project", "draft", 3);
    await act(async () => finish());
    expect(deleted).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("hides unauthorized deletion and requires a fresh confirmation after a version conflict", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host), deleted = vi.fn(), refresh = vi.fn(); document.body.append(host);
  const render = (row: ManuscriptSummary) => root.render(<DeleteManuscript projectId="project" manuscript={row} onDeleted={deleted} onRefresh={refresh} />);
  try {
    await act(async () => render({ ...manuscript, canDelete: false }));
    expect(button("Delete")).toBeUndefined();
    await act(async () => render(manuscript));
    await act(async () => button("Delete").click());
    // A background list refresh must not silently change the confirmed version.
    await act(async () => render({ ...manuscript, version: 4 }));
    api.remove.mockRejectedValueOnce({ response: { status: 409 } });
    await act(async () => button("Delete manuscript").click());
    expect(api.remove).toHaveBeenLastCalledWith("project", "draft", 3);
    expect(button("Delete manuscript").disabled).toBe(true);
    expect(refresh).toHaveBeenCalledOnce(); expect(deleted).not.toHaveBeenCalled();
    await act(async () => button("Cancel").click());
    await act(async () => button("Delete").click());
    api.remove.mockResolvedValueOnce({ id: "draft" });
    await act(async () => button("Delete manuscript").click());
    expect(api.remove).toHaveBeenLastCalledWith("project", "draft", 4);
    expect(deleted).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
