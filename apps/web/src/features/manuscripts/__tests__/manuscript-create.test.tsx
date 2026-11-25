// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ list: vi.fn(), listDeleted: vi.fn(), create: vi.fn(), restoreDeleted: vi.fn() }));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: api }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, string | number>) => values ? key.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? "")) : key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: "member" } }) }));
vi.mock("@/features/projects/components/workspace-common", () => ({ canLeaveWorkspace: async () => true, useUnsavedWorkspace: vi.fn() }));
vi.mock("../manuscript-github", () => ({ ManuscriptGithub: () => null }));
vi.mock("../manuscript-pdf-import", () => ({ ImportManuscriptPdf: () => null }));
import { ManuscriptsPanel, type ManuscriptCreationDraft } from "../manuscripts-panel";

let host: HTMLDivElement, root: Root, client: QueryClient;
const draft: ManuscriptCreationDraft = { title: "Research proposal: Grounded feedback", description: "How can feedback be verified?", documentType: "RESEARCH_PROPOSAL", template: "PROPOSAL", researchLink: { kind: "GAP", id: "gap" } };
const button = (label: string) => [...document.querySelectorAll("button")].find(element => element.textContent === label)!;
async function chooseType(value: string) {
  await act(async () => { const select = document.querySelector<HTMLSelectElement>('#manuscript-create-type')!; select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
function Location() { return <output data-location>{useLocation().pathname}</output>; }
async function render(initial?: ManuscriptCreationDraft, readOnly = false, consumed = vi.fn()) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><ManuscriptsPanel projectId="project" readOnly={readOnly} draft={initial} onDraftConsumed={consumed} /><Location /></MemoryRouter></QueryClientProvider>));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.list.mockResolvedValue([]);
  api.listDeleted.mockResolvedValue([]);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it("confirms a gap proposal before creation, keeps the source link after failure and opens the created editor", async () => {
  const consumed = vi.fn();
  await render(draft, false, consumed);
  expect(document.querySelector<HTMLInputElement>('input')?.value).toBe(draft.title);
  expect(api.create).not.toHaveBeenCalled();
  api.create.mockRejectedValueOnce(new Error("network"));
  await act(async () => button("Create and start writing").click());
  expect(document.body.textContent).toContain("Your input is retained");
  expect(consumed).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>('input')?.value).toBe(draft.title);
  const firstPayload = api.create.mock.calls[0]![1];
  expect(firstPayload).toEqual({ ...draft, clientKey: expect.any(String) });
  api.create.mockResolvedValueOnce({ id: "proposal" });
  await act(async () => button("Create and start writing").click());
  expect(api.create).toHaveBeenLastCalledWith("project", firstPayload);
  expect(consumed).toHaveBeenCalledOnce();
  expect(host.querySelector('[data-location]')?.textContent).toBe("/projects/project/manuscripts/proposal");
});

it("creates an Other document with the selected type", async () => {
  await render({ ...draft, documentType: "OTHER", template: "BLANK" });
  const select = document.querySelector<HTMLSelectElement>('#manuscript-create-type')!;
  expect([...select.options].find(option => option.value === "OTHER")?.text).toBe("Other");
  expect(select.value).toBe("OTHER");
  api.create.mockResolvedValueOnce({ id: "other-document" });
  await act(async () => button("Create and start writing").click());
  expect(api.create).toHaveBeenCalledWith("project", expect.objectContaining({ documentType: "OTHER", template: "BLANK" }));
  expect(host.querySelector('[data-location]')?.textContent).toBe("/projects/project/manuscripts/other-document");
});

it("can dismiss a proposal without creating it", async () => {
  const consumed = vi.fn();
  await render(draft, false, consumed);
  await act(async () => button("Cancel").click());
  expect(api.create).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(consumed).toHaveBeenCalledOnce();
});

it("filters templates, selects compatible defaults and keeps the title when changing document type", async () => {
  await render(draft);
  for (const [type, expected] of [["RESEARCH_PAPER", "ARTICLE"], ["RESEARCH_PROPOSAL", "PROPOSAL"], ["TECHNICAL_REPORT", "REPORT"], ["THESIS", "THESIS"], ["PRESENTATION", "PRESENTATION"], ["OTHER", "BLANK"]]) {
    await chooseType(type!);
    expect(document.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value).toBe(expected);
    expect([...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map(input => input.value).sort()).toEqual([...new Set([expected, "BLANK"])].sort());
    expect(document.querySelector<HTMLInputElement>('#manuscript-create-title')?.value).toBe(draft.title);
    expect(document.querySelector('#manuscript-template-search')).toBeNull();
  }
  expect(document.querySelector('#manuscript-custom-type')).not.toBeNull();
  await chooseType("THESIS");
  expect(document.querySelector('#manuscript-custom-type')).toBeNull();
});

it("expands publisher templates and searches only within the selected document type", async () => {
  await render({ ...draft, documentType: "RESEARCH_PAPER", template: "ARTICLE" });
  await act(async () => button("More conference / journal templates").click());
  expect([...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map(input => input.value)).toEqual(expect.arrayContaining(["IEEE_CONFERENCE", "ELSEVIER", "SPRINGER", "APS"]));
  await act(async () => {
    const search = document.querySelector<HTMLInputElement>('#manuscript-template-search')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "IEEE");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect([...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map(input => input.value)).toEqual(["IEEE_CONFERENCE"]);
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  await chooseType("THESIS");
  expect(document.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value).toBe("THESIS");
  expect(document.querySelector('#manuscript-template-search')).toBeNull();
});

it("guards double-submit and uses a new idempotency key only after the failed input changes", async () => {
  await render(draft);
  let fail!: (reason: Error) => void;
  api.create.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
  await act(async () => { button("Create and start writing").click(); document.querySelector('form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(api.create).toHaveBeenCalledTimes(1);
  const firstKey = api.create.mock.calls[0]![1].clientKey;
  await act(async () => fail(new Error("network")));
  await chooseType("THESIS");
  api.create.mockResolvedValueOnce({ id: "thesis" });
  await act(async () => button("Create and start writing").click());
  expect(api.create.mock.calls[1]![1]).toMatchObject({ documentType: "THESIS", template: "THESIS" });
  expect(api.create.mock.calls[1]![1].clientKey).not.toBe(firstKey);
});

it("opens the existing ZIP import flow from the creation form", async () => {
  await render(draft);
  await act(async () => button("Have your own LaTeX template? Import a ZIP project").click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Import source ZIP");
  expect(document.querySelector('input[type="file"]')).not.toBeNull();
  expect(api.create).not.toHaveBeenCalled();
});

it("does not offer creation for a read-only project even with a proposed draft", async () => {
  await render(draft, true);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(button("Create manuscript")).toBeUndefined();
  expect(api.create).not.toHaveBeenCalled();
});

it("keeps the ordinary manuscript form empty with article defaults", async () => {
  await render();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => button("Create manuscript").click());
  expect(document.querySelector<HTMLInputElement>('input')?.value).toBe("");
  expect([...document.querySelectorAll('select')].map(element => element.value)).toEqual(["RESEARCH_PAPER"]);
  expect(document.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value).toBe("ARTICLE");
  expect(button("Create and start writing").disabled).toBe(true);
  expect(api.create).not.toHaveBeenCalled();
});

it("displays collaborative protection badges and lets authorized users inspect and restore Manuscript Trash", async () => {
  api.list.mockResolvedValueOnce([
    {
      id: "m-shared",
      projectId: "project",
      title: "Team Shared Draft",
      description: "",
      documentType: "RESEARCH_PAPER",
      template: "ARTICLE",
      version: 2,
      mainFileId: null,
      archived: false,
      createdAt: "2026-11-14T10:00:00.000Z",
      updatedAt: "2026-11-14T10:00:00.000Z",
      canWrite: true,
      canDelete: false,
      governance: {
        ownershipScope: "COLLABORATIVE",
        createdBy: { id: "u1", name: "Owner" },
        contributors: [{ id: "u1", name: "Owner" }, { id: "u2", name: "Member" }],
        contributorCount: 2,
        snapshotCount: 1,
        submissionCount: 0,
        reviewThreadCount: 0,
        commentCount: 0,
        hasReviewsOrSubmissions: false,
        remoteBinding: null,
        canArchive: true,
        canUnarchive: false,
        canRestore: false,
        deleteBlockedReason: "COLLABORATIVE_MANUSCRIPT",
        requiresCoAuthorApprovalForDelete: true,
        approvalStatus: "REQUIRES_COAUTHOR_APPROVAL",
      },
    },
  ]);
  api.listDeleted.mockResolvedValueOnce([
    {
      id: "m-trash",
      projectId: "project",
      title: "Deleted Personal Scratchpad",
      description: "",
      documentType: "RESEARCH_PAPER",
      template: "ARTICLE",
      version: 5,
      mainFileId: null,
      archived: false,
      deletedAt: "2026-11-14T09:00:00.000Z",
      createdAt: "2026-11-14T08:00:00.000Z",
      updatedAt: "2026-11-14T09:00:00.000Z",
      canWrite: false,
      canDelete: false,
      governance: {
        ownershipScope: "PERSONAL_DRAFT",
        createdBy: { id: "member", name: "Student" },
        contributors: [{ id: "member", name: "Student" }],
        contributorCount: 1,
        snapshotCount: 2,
        submissionCount: 0,
        reviewThreadCount: 0,
        commentCount: 0,
        hasReviewsOrSubmissions: false,
        remoteBinding: null,
        canArchive: false,
        canUnarchive: false,
        canRestore: true,
        deleteBlockedReason: "ALREADY_DELETED",
        requiresCoAuthorApprovalForDelete: false,
        approvalStatus: "NOT_APPLICABLE",
      },
    },
  ]);

  await render();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });

  expect(host.textContent).toContain("Collaborative draft (2)");
  expect(host.textContent).toContain("Contributors: Owner, Member");
  expect(host.textContent).toContain("Manuscript Trash (1)");

  await act(async () => {
    host.querySelector<HTMLButtonElement>(".writing-trash-toggle")?.click();
  });
  expect(host.textContent).toContain("Deleted Personal Scratchpad");
  expect(host.textContent).toContain("2 snapshots preserved");
  expect(button("Restore")).toBeDefined();
});
