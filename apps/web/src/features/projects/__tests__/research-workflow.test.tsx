// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResearchScreening } from "../components/research-screening";
import { ResearchGapEvaluation } from "../components/research-gap-evaluation";
import { WorkspaceArtifactLink } from "../components/workspace-common";

const mocks = vi.hoisted(() => Object.fromEntries(["evidence", "library", "suggestions", "createEvidence", "editEvidence", "reviewEvidence", "evidenceHistory", "gap", "assessGap", "linkEvidence", "guidance", "plan", "confirm", "updatePaper"].map(key => [key, vi.fn()])));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: mocks.confirm }));
vi.mock("../hooks/use-projects", () => ({ useUpdateProjectPaper: () => ({ mutateAsync: mocks.updatePaper, isPending: false }) }));
vi.mock("../api/project-research.api", () => ({ researchApi: mocks }));
vi.mock("../api/workspace.api", () => ({ workspaceApi: { plan: mocks.plan } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
const page = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
const gap = { gap: { id: "g", version: 3, title: "A bounded gap", description: "Single site limitation", rationale: "Lacks replication", assumptions: "", assessmentStatus: "PROPOSED", assessmentRationale: "" }, evidence: [], questions: [], history: [], discussions: [], guidance: [], canContribute: true };
let root: Root, container: HTMLDivElement, client: QueryClient;
async function render(node: ReactNode, path = "/projects/p?tab=papers&view=evidence") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>));
  await settle();
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); }
async function click(text: string) { const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text); expect(button, text).toBeDefined(); await act(async () => button!.click()); await settle(); }
async function fill(label: string, value: string) {
  const input = [...container.querySelectorAll("label")].find(item => item.textContent?.startsWith(label))?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select"); expect(input, label).toBeDefined();
  await act(async () => { const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value); input!.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }); await settle();
}
async function chooseFilter(label: string, value: string) { const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle(); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); Object.values(mocks).forEach(mock => mock.mockResolvedValue(undefined));
  mocks.evidence!.mockResolvedValue(page); mocks.evidenceHistory!.mockResolvedValue([]); mocks.library!.mockResolvedValue({ ...page, items: [{ paperId: "paper", title: "Source study" }] }); mocks.suggestions!.mockResolvedValue([]); mocks.gap!.mockResolvedValue(gap); mocks.plan!.mockResolvedValue({ version: 1, canEdit: true });
  mocks.confirm!.mockResolvedValue(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["filter", "page", "search"])("protects a screening rationale before changing the %s", async action => {
  const source = { id: "source", paperId: "paper", title: "Source study", tags: [], collectionName: null, screeningStatus: "UNDECIDED", updatedAt: "2026-10-23T00:00:00Z", votes: [], files: [] };
  mocks.library!.mockImplementation(async (_id, params) => ({ ...page, hasNext: true, mode: "EXPLORATORY", canManage: false, people: [], items: params.state || params.page > 1 || params.q ? [] : [source] }));
  await render(<ResearchScreening projectId="p" readOnly={false} />); await act(async () => container.querySelector<HTMLButtonElement>(".research-source-title")!.click()); await settle(); await fill("Decision rationale", "Keep my screening rationale");
  mocks.confirm!.mockResolvedValue(false); const calls = mocks.library!.mock.calls.length;
  if (action === "filter") await chooseFilter("Screening state", "INCLUDED");
  else if (action === "page") await click("Next");
  else { const input = container.querySelector<HTMLInputElement>('[aria-label="Search project sources"]')!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "another"); input.dispatchEvent(new Event("input", { bubbles: true })); }); await click("Search"); }
  expect(mocks.confirm).toHaveBeenCalledOnce(); expect(mocks.library!.mock.calls.length).toBe(calls);
  expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Keep my screening rationale");
});
it("preserves an evidence artifact ID in the project matrix destination", async () => {
  await render(<WorkspaceArtifactLink projectId="p" link={{ kind: "EVIDENCE", id: "e1" }} />);
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/projects/p?tab=papers&view=evidence&evidence=e1");
});
it("does not rebase a drafted team assessment onto a newer gap revision", async () => {
  await render(<ResearchGapEvaluation projectId="p" gapId="g" />); await fill("Assessment rationale", "A cautiously scoped direction");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "gap", "g"], { ...gap, gap: { ...gap.gap, version: 4 } }));
  mocks.assessGap!.mockRejectedValue(new Error("Conflict")); await click("Save team assessment"); expect(mocks.assessGap).toHaveBeenCalledWith("p", "g", expect.objectContaining({ expectedVersion: 3 })); expect(container.textContent).toContain("A cautiously scoped direction");
});
it("shows source changes and counterevidence without presenting team support as scientific proof", async () => {
  mocks.gap!.mockResolvedValue({ ...gap, evidence: [{ id: "link", evidenceKind: "COUNTER", sourceTitle: "Contradictory study", explanation: "Different reported result", sourceChanged: true, reviewed: true }] }); await render(<ResearchGapEvaluation projectId="p" gapId="g" />);
  expect(container.textContent).toContain("not scientific proof"); expect(container.textContent).toContain("Contradictory study"); expect(container.textContent).toContain("The source or extraction changed");
});
it("requires source confirmation and sends the exact evidence versions when recording support", async () => {
  const source = { id: "link", paperId: "paper", evidenceItemId: "e1", evidenceVersion: 2, evidenceKind: "SUPPORTING", sourceTitle: "Source study", excerpt: "Exact source passage", claim: "AI interpretation", discovery: true, reviewState: "PENDING", sourceChanged: false, reviewed: false };
  mocks.gap!.mockResolvedValue({ ...gap, evidence: [source] });
  await render(<ResearchGapEvaluation projectId="p" gapId="g" />); await fill("Assessment", "TEAM_SUPPORTED"); await fill("Assessment rationale", "Checked the paper and its interpretation");
  const save = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Save team assessment")!;
  expect(save.disabled).toBe(true); expect(container.textContent).toContain("AI extraction awaiting source review");
  await act(async () => container.querySelector<HTMLInputElement>('.gap-source-confirm input')!.click());
  expect(save.disabled).toBe(false); await click("Save team assessment");
  expect(mocks.assessGap).toHaveBeenCalledWith("p", "g", expect.objectContaining({ expectedVersion: 3, reviewedEvidence: [{ id: "e1", version: 2 }], status: "TEAM_SUPPORTED" }));
});
it("does not silently re-confirm an AI extraction changed by another member", async () => {
  const source = { id: "link", evidenceItemId: "e1", evidenceVersion: 2, evidenceKind: "SUPPORTING", sourceTitle: "Source study", discovery: true, reviewState: "PENDING", sourceChanged: false, reviewed: false };
  mocks.gap!.mockResolvedValue({ ...gap, evidence: [source] });
  await render(<ResearchGapEvaluation projectId="p" gapId="g" />); await fill("Assessment", "TEAM_SUPPORTED"); await fill("Assessment rationale", "Checked the old source interpretation");
  await act(async () => container.querySelector<HTMLInputElement>('.gap-source-confirm input')!.click());
  await act(async () => client.setQueryData(["project-research", "actor", "p", "gap", "g"], { ...gap, gap: { ...gap.gap, version: 4 }, evidence: [{ ...source, evidenceVersion: 3, sourceChanged: true }] }));
  await settle();
  expect(container.querySelector<HTMLInputElement>('.gap-source-confirm input')?.checked).toBe(false); expect(container.querySelector<HTMLInputElement>('.gap-source-confirm input')?.disabled).toBe(true);
  const save = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Save team assessment")!; expect(save.disabled).toBe(true);
});
it("opens scoped mentor feedback and preserves the revision the author started commenting on", async () => {
  await render(<ResearchGapEvaluation projectId="p" gapId="g" />);
  await click("Request mentor feedback");
  const textarea = [...container.querySelectorAll("label")].find(label => label.textContent?.startsWith("Feedback or request"))?.querySelector("textarea");
  expect(document.activeElement).toBe(textarea);
  expect(textarea?.closest("details")?.open).toBe(true);
  await fill("Feedback or request", "Can you challenge the population assumption?");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "gap", "g"], { ...gap, gap: { ...gap.gap, version: 4 } }));
  mocks.guidance!.mockRejectedValue(new Error("The candidate changed"));
  await click("Send feedback or request");
  expect(mocks.guidance).toHaveBeenCalledWith("p", "g", expect.objectContaining({ expectedVersion: 3 }));
  expect(textarea?.value).toBe("Can you challenge the population assumption?");
});
it("lets mentors comment on the candidate without loading team-only edit resources", async () => {
  await render(<ResearchGapEvaluation projectId="p" gapId="g" mentor />);
  expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.evidence).not.toHaveBeenCalled();
  expect(container.textContent).toContain("A bounded gap");
  expect(container.textContent).toContain("Feedback or request");
  expect(container.textContent).not.toContain("Save team assessment");
  expect(container.textContent).not.toContain("Save candidate revision");
});
