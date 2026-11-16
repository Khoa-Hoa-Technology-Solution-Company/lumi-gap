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
vi.mock("../manuscript-import", () => ({ ImportManuscript: () => null }));
vi.mock("../manuscript-pdf-import", () => ({ ImportManuscriptPdf: () => null }));
vi.mock("../manuscript-templates", () => ({ ManuscriptTemplates: () => null }));
import { ManuscriptsPanel, type ManuscriptCreationDraft } from "../manuscripts-panel";

let host: HTMLDivElement, root: Root, client: QueryClient;
const draft: ManuscriptCreationDraft = { title: "Research proposal: Grounded feedback", description: "How can feedback be verified?", documentType: "RESEARCH_PROPOSAL", template: "PROPOSAL", researchLink: { kind: "GAP", id: "gap" } };
const button = (label: string) => [...document.querySelectorAll("button")].find(element => element.textContent === label)!;
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
  await act(async () => button("Create and open editor").click());
  expect(document.body.textContent).toContain("Your input is retained");
  expect(consumed).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>('input')?.value).toBe(draft.title);
  const firstPayload = api.create.mock.calls[0]![1];
  expect(firstPayload).toEqual({ ...draft, clientKey: expect.any(String) });
  api.create.mockResolvedValueOnce({ id: "proposal" });
  await act(async () => button("Create and open editor").click());
  expect(api.create).toHaveBeenLastCalledWith("project", firstPayload);
  expect(consumed).toHaveBeenCalledOnce();
  expect(host.querySelector('[data-location]')?.textContent).toBe("/projects/project/manuscripts/proposal");
});

it("can dismiss a proposal without creating it", async () => {
  const consumed = vi.fn();
  await render(draft, false, consumed);
  await act(async () => button("Cancel").click());
  expect(api.create).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(consumed).toHaveBeenCalledOnce();
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
  expect([...document.querySelectorAll('select')].map(element => element.value)).toEqual(["RESEARCH_PAPER", "ARTICLE"]);
  expect(button("Create and open editor").disabled).toBe(true);
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
