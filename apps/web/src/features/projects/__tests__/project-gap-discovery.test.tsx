// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectGapDiscoveryResult } from "@trend/shared-types";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiscoveryResults, ProjectGapDiscovery } from "../components/project-gap-discovery";
import { ProjectResearchWorkspace } from "../components/project-research-workspace";

const mocks = vi.hoisted(() => ({ discovery: vi.fn(), library: vi.fn(), analyze: vi.fn(), getAnalysisStatus: vi.fn() }));
vi.mock("../api/project-research.api", () => ({ researchApi: mocks }));
vi.mock("@/features/gaps/api/gaps.api", () => ({ gapsApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string, variables?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(variables?.[name] ?? name)) }) }));
const library = { items: [1, 2, 3].map(i => ({ paperId: `p${i}`, title: `Relevant study ${i}`, dataStatus: "active" })), total: 3, hasNext: false, page: 1, pageSize: 50 };
const result: ProjectGapDiscoveryResult = { stage: "ready", total: 2, completed: 2, papers: [{ id: "p1", title: "First source", sourceKind: "abstract", warnings: ["Abstract-only coverage"], contentHash: "hash", analysis: { summary: null, dataset: null, contributions: [], keyTerms: [], extractedBy: "llm", analysisPromptVersion: "test", extractedAt: "2026-10-19T00:00:00Z", researchQuestions: ["Does it replicate?"], methods: "Survey", findings: ["Mixed outcomes"], limitations: [], futureWork: ["More research"] }, passages: [{ id: "chunk-1", pageNumber: null, text: "Exact source quotation <script>bad()</script>" }] }], synthesis: { commonFindings: "Similar outcomes [1] [2]", contradictions: "", openQuestions: "Transfer? [1]" } };
const ready = { id: "a", status: "ready", topic: "Learning", gapIds: ["g1", "g2"], discovery: result };
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.discovery.mockResolvedValue({ eligibleCount: 3, minPapers: 2, maxPapers: 10, latestAnalysis: null }); mocks.library.mockResolvedValue(library);
  mocks.analyze.mockResolvedValue({ analysisId: "a" }); mocks.getAnalysisStatus.mockResolvedValue({ ...ready, status: "analyzing", discovery: { ...result, stage: "extracting", completed: 1 } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function render(node: ReactNode = <ProjectGapDiscovery projectId="p" defaultTopic="Learning" />) { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>)); await settle(); }
function button(text = "Analyze papers") { return [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text)!; }
async function click(text?: string) { await act(async () => button(text).click()); await settle(); }

it("shows the eligible count and one primary action without competing workflow tabs", async () => {
  await render(<ProjectResearchWorkspace projectId="p" readOnly={false}><ProjectGapDiscovery projectId="p" defaultTopic="Learning" /></ProjectResearchWorkspace>);
  expect(host.textContent).toContain("3 selected for analysis"); expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(3); expect(host.querySelector('[aria-label="Search relevant papers"]')).not.toBeNull(); expect(button().disabled).toBe(false);
  expect(host.querySelector("nav.research-step-nav")).toBeNull(); expect(host.textContent).not.toContain("New Gap Analysis");
  expect(mocks.library).toHaveBeenCalledWith("p", { state: "INCLUDED", page: 1, pageSize: 50, q: "" });
});
it("explains an empty literature scope, links Literature and disables analysis", async () => {
  mocks.discovery.mockResolvedValue({ eligibleCount: 0, minPapers: 2, maxPapers: 10, latestAnalysis: null }); mocks.library.mockResolvedValue({ ...library, items: [] });
  await render(); expect(host.textContent).toContain("Mark at least 2 papers Relevant / Included"); expect(host.querySelector('a[href="/projects/p?tab=papers"]')).not.toBeNull(); expect(button().disabled).toBe(true);
});
it("keeps the primary action disabled while eligibility is loading", async () => {
  let finish!: (value: unknown) => void;
  mocks.discovery.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); expect(button().disabled).toBe(true); expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
  await act(async () => finish({ eligibleCount: 3, minPapers: 2, maxPapers: 10, latestAnalysis: null })); await settle(); expect(button().disabled).toBe(false);
});
it("submits only selected eligible papers into the existing analyze API", async () => {
  mocks.library.mockResolvedValue({ ...library, items: [...library.items, { paperId: "archived", title: "Inactive paper", dataStatus: "archived" }] });
  await render();
  await act(async () => host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[2]!.click()); await click();
  expect(mocks.analyze).toHaveBeenCalledTimes(1); expect(mocks.analyze).toHaveBeenCalledWith({ projectId: "p", projectDiscovery: true, topic: "Learning", evidenceMode: "selected", selectedPaperIds: ["p1", "p2"] });
  expect(host.textContent).toContain("Analyzing source papers"); expect(host.textContent).toContain("1 / 2 papers analyzed"); expect(button("Analysis in progress").disabled).toBe(true);
  expect(host.textContent).not.toContain("Inactive paper");
});
it("resumes team progress after reload and disables a duplicate run", async () => {
  mocks.discovery.mockResolvedValue({ eligibleCount: 3, minPapers: 2, maxPapers: 10, latestAnalysis: { ...ready, status: "analyzing", discovery: { ...result, stage: "synthesizing" } } });
  await render(); expect(host.textContent).toContain("Comparing findings across papers"); expect(button("Analysis in progress").disabled).toBe(true); expect(mocks.analyze).not.toHaveBeenCalled();
});
it("retains selections after a failed enqueue", async () => {
  mocks.analyze.mockRejectedValue(new Error("Offline")); await render(); await click();
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.textContent).toContain("Your selection is kept");
  expect([...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter(input => input.checked)).toHaveLength(3); expect(button().disabled).toBe(false);
});
it("shows source passages, coverage, missing fields and synthesis in saved results", async () => {
  mocks.discovery.mockResolvedValue({ eligibleCount: 3, minPapers: 2, maxPapers: 10, latestAnalysis: ready }); await render();
  expect(host.textContent).toContain("2 candidate gaps found"); expect(host.textContent).not.toContain("Analysis results and source evidence");
  await render(<DiscoveryResults projectId="p" result={result} />); expect(host.textContent).toContain("Similar outcomes [1] [2]"); expect(host.textContent).toContain("Does it replicate?");
  expect(host.textContent).toContain("Not reported in the available sources"); expect(host.textContent).toContain("Abstract-only coverage"); expect(host.textContent).toContain("chunk-1");
  expect(host.querySelector("script")).toBeNull(); expect(host.textContent).toContain("<script>bad()</script>");
});
it("keeps a failed run compact without presenting partial extraction as results", async () => {
  mocks.discovery.mockResolvedValue({ eligibleCount: 3, minPapers: 2, maxPapers: 10, latestAnalysis: { ...ready, status: "failed", errorMessage: "Source changed" } }); await render();
  expect(host.textContent).toContain("Source changed"); expect(host.textContent).not.toContain("First source"); expect(button().disabled).toBe(false);
});
it("blocks writes for archived projects and shows loading and API error states", async () => {
  await render(<ProjectGapDiscovery projectId="p" defaultTopic="Learning" readOnly />); expect(button().disabled).toBe(true);
  mocks.discovery.mockRejectedValue(new Error("Unavailable")); await act(async () => client.invalidateQueries({ queryKey: ["project-research"] })); await settle(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it("identifies the saved generic failure as a previous attempt and keeps retry enabled", async () => {
  mocks.discovery.mockResolvedValue({ eligibleCount: 3, minPapers: 2, maxPapers: 10, latestAnalysis: { ...ready, status: "failed", errorMessage: "Gap analysis failed. Please try again later." } });
  await render(); expect(host.textContent).toContain("The previous analysis failed. Try again with the selected papers."); expect(button().disabled).toBe(false);
  expect(mocks.analyze).not.toHaveBeenCalled();
});

it("enforces the minimum and maximum selection without another form", async () => {
  mocks.library.mockResolvedValue({ ...library, items: Array.from({ length: 12 }, (_, i) => ({ paperId: 'p' + i, title: 'Study ' + i, dataStatus: 'active' })) });
  await render();
  const inputs = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(inputs.filter(input => input.checked)).toHaveLength(10); expect(inputs[10]!.disabled).toBe(true);
  await act(async () => inputs[0]!.click()); expect(inputs[10]!.disabled).toBe(false);
  await act(async () => inputs.slice(1, 9).forEach(input => input.click()));
  expect(button().disabled).toBe(true);
});
it("shows a completed zero-result analysis without partial evidence sections", async () => {
  mocks.discovery.mockResolvedValue({ eligibleCount: 3, minPapers: 2, maxPapers: 10, latestAnalysis: { ...ready, gapIds: [] } });
  await render(); expect(host.textContent).toContain("No grounded gap found"); expect(host.textContent).not.toContain("Analysis results and source evidence");
});
it("supports clearing and bulk selection with an actionable minimum hint", async () => {
  await render(); await click("Clear selection");
  expect(button().disabled).toBe(true); expect(host.textContent).toContain("Choose 2 more papers to analyze.");
  await click("Select all"); expect(button().disabled).toBe(false);
  expect([...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter(input => input.checked)).toHaveLength(3);
});
it("preserves selections while searching and keeps the analysis payload scoped to them", async () => {
  mocks.library.mockImplementation((_id: string, params: { q: string }) => Promise.resolve(params.q ? { ...library, items: [library.items[1]] } : library));
  await render();
  const input = host.querySelector<HTMLInputElement>('[aria-label="Search relevant papers"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Relevant study 2"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); }); await settle();
  expect(mocks.library).toHaveBeenLastCalledWith("p", { state: "INCLUDED", page: 1, pageSize: 50, q: "Relevant study 2" });
  expect(host.textContent).toContain("Selected outside this view"); expect(host.textContent).toContain("3 selected for analysis");
  await click(); expect(mocks.analyze.mock.calls[0]?.[0].selectedPaperIds).toEqual(["p1", "p2", "p3"]);
});
it("explains that changed selections do not change already saved results", async () => {
  mocks.discovery.mockResolvedValue({ eligibleCount: 3, minPapers: 2, maxPapers: 10, latestAnalysis: ready });
  await render(); expect(host.textContent).toContain("Based on 1 analyzed papers"); expect(host.textContent).toContain("Your current selection applies to the next analysis.");
});
