// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ProjectGapAnalysisForm, ResearchSynthesis } from "../components/research-synthesis";
import { ProjectResearchWorkspace } from "../components/project-research-workspace";

const mocks = vi.hoisted(() => Object.fromEntries(["synthesis", "synthesisHistory", "saveSynthesis", "acceptSynthesis", "generateSynthesis", "evidence", "questions", "leave"].map(key => [key, vi.fn()])));
vi.mock("../api/project-research.api", () => ({ researchApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../components/workspace-common", async importOriginal => ({ ...await importOriginal<object>(), canLeaveWorkspace: mocks.leave }));

const sources = [1, 2, 3].map(index => ({ id: `e${index}`, paperId: `p${index}`, version: 2, sourceTitle: `Study ${index}`, claim: `Finding ${index}`, revisionId: `r${index}` }));
const synthesis = { id: "p", revisionId: "s1", version: 3, status: "ACCEPTED", sources, commonFindings: "Shared finding [1] [2] [3]", contradictions: "", openQuestions: "", rationale: "Checked", origin: "HUMAN", stale: false };
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.resetAllMocks(); (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.synthesis!.mockResolvedValue(synthesis); mocks.synthesisHistory!.mockResolvedValue([]); mocks.leave!.mockResolvedValue(true);
  mocks.evidence!.mockResolvedValue({ items: sources, page: 1, pageSize: 20, total: 3, hasNext: false });
  mocks.questions!.mockResolvedValue([]);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });
async function render(node: ReactNode, route = "/projects/p?tab=gaps") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}>{node}</MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
async function click(text: string) { const button = [...host.querySelectorAll("button")].find(item => item.textContent === text); expect(button).toBeTruthy(); await act(async () => button!.click()); }
async function fill(label: string, text: string) {
  const input = [...host.querySelectorAll("label")].find(item => item.textContent?.startsWith(label))?.querySelector("input,textarea") as HTMLInputElement;
  expect(input).toBeTruthy();
  await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
it("blocks gap analysis until a synthesis has been accepted", async () => {
  mocks.synthesis!.mockResolvedValue(null); const analyze = vi.fn();
  await render(<ProjectGapAnalysisForm projectId="p" defaultTopic="Learning" isAnalyzing={false} onAnalyze={analyze} />);
  expect(host.textContent).toContain("Review the synthesis before finding gaps"); expect(host.querySelector("form")).toBeNull(); expect(analyze).not.toHaveBeenCalled();
});
it("submits only the pinned synthesis and its exact paper set", async () => {
  const analyze = vi.fn(); await render(<ProjectGapAnalysisForm projectId="p" defaultTopic="Learning" isAnalyzing={false} onAnalyze={analyze} />);
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(analyze).toHaveBeenCalledWith({ projectId: "p", topic: "Learning", synthesisRevisionId: "s1", evidenceMode: "selected", selectedPaperIds: ["p1", "p2", "p3"] });
});
it("blocks an accepted but stale synthesis", async () => {
  mocks.synthesis!.mockResolvedValue({ ...synthesis, stale: true });
  await render(<ProjectGapAnalysisForm projectId="p" isAnalyzing={false} onAnalyze={vi.fn()} />);
  expect(host.querySelector("form")).toBeNull(); expect(host.textContent).toContain("Review the synthesis");
});
it("keeps the version the reviewer opened when another member edits the draft", async () => {
  mocks.synthesis!.mockResolvedValue({ ...synthesis, status: "DRAFT" }); mocks.acceptSynthesis!.mockRejectedValue(new Error("Conflict"));
  await render(<ResearchSynthesis projectId="p" readOnly={false} />);
  await fill("Review rationale", "Checked the cited sources");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "synthesis"], { ...synthesis, version: 4, status: "DRAFT" }));
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.acceptSynthesis).toHaveBeenCalledWith("p", { expectedVersion: 3, rationale: "Checked the cited sources" });
  expect(host.querySelector("input")?.value).toBe("Checked the cited sources");
});
it("keeps the editor's original version and retained text on a conflict", async () => {
  mocks.saveSynthesis!.mockRejectedValue(new Error("Conflict"));
  await render(<ResearchSynthesis projectId="p" readOnly={false} />); await click("Revise synthesis");
  await fill("Shared findings", "My revised finding [1]");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "synthesis"], { ...synthesis, version: 4 }));
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.saveSynthesis).toHaveBeenCalledWith("p", expect.objectContaining({ expectedVersion: 3, commonFindings: "My revised finding [1]" }));
  expect(host.querySelector("textarea")?.value).toBe("My revised finding [1]");
});
it("lets members select multiple sources without repeated discard prompts and queues an unapproved AI draft", async () => {
  mocks.synthesis!.mockResolvedValue(null); mocks.generateSynthesis!.mockResolvedValue({ version: 1 });
  await render(<ResearchSynthesis projectId="p" readOnly={false} />); await click("Prepare synthesis");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  for (const input of host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) await act(async () => input.click());
  expect(mocks.leave).not.toHaveBeenCalled(); await click("Draft with AI · 20 credits");
  expect(mocks.generateSynthesis).toHaveBeenCalledWith("p", { expectedVersion: 0, evidence: sources.map(source => ({ id: source.id, version: source.version })) });
  expect(mocks.acceptSynthesis).not.toHaveBeenCalled();
});
it("shows questions and stale provenance in the existing gap workspace", async () => {
  mocks.questions!.mockResolvedValue([{ id: "q", text: "Does it replicate?", sourceGapId: "gap", sourceGapTitle: "Replication gap", sourceGapVersion: 2, evidenceCount: 3, needsReview: true }]);
  await render(<ProjectResearchWorkspace projectId="p" readOnly><p>Candidate list</p></ProjectResearchWorkspace>, "/projects/p?tab=gaps&research=questions");
  expect(host.textContent).toContain("Does it replicate?"); expect(host.textContent).toContain("Review this research direction again"); expect(host.textContent).not.toContain("Candidate list");
});
it("renders untrusted synthesis as text and hides editing for read-only projects", async () => {
  mocks.synthesis!.mockResolvedValue({ ...synthesis, commonFindings: "<script>attack()</script> [1]" });
  await render(<ResearchSynthesis projectId="p" readOnly />);
  expect(host.textContent).toContain("<script>attack()</script>"); expect(host.querySelector("script")).toBeNull();
  expect(host.textContent).not.toContain("Revise synthesis"); expect(host.textContent).not.toContain("Accept synthesis");
});
