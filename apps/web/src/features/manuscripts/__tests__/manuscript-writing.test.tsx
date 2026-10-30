// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManuscriptWritingReport } from "@trend/shared-types";
import { WritingReportResult, ManuscriptWriting } from "../manuscript-writing";
import { WritingParticipationSuggestions } from "@/features/projects/components/contribution-evaluation";

const api = vi.hoisted(() => ({ writingReports: vi.fn(), requestWritingReport: vi.fn(), writingReport: vi.fn(), writingContribution: vi.fn() }));
const evaluations = vi.hoisted(() => ({ writingSuggestions: vi.fn() }));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: api }));
vi.mock("@/features/projects/api/contribution-evaluation.api", () => ({ contributionEvaluationApi: evaluations }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "writer" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, client: QueryClient;
const report = (): ManuscriptWritingReport => ({ id: "report", manuscriptId: "manuscript", snapshotId: "snapshot", snapshotLabel: "Writing v1", title: "Research paper", sourceVersion: 2, status: "COMPLETED", createdAt: "2026-10-28T00:00:00Z", calculatedAt: "2026-10-28T00:01:00Z", inputHash: "a".repeat(64), isStale: true,
  result: { algorithmVersion: "RETAINED_WRITING_V1", totalWords: 10, attributedWordUnits: 6000, unknownWordUnits: 4000, coverageBasisPoints: 6000,
    members: [{ userId: "a", name: "Alice", retainedWordUnits: 4000, overallBasisPoints: 4000, suggestedBasisPoints: 6667 }, { userId: "b", name: "Bob", retainedWordUnits: 2000, overallBasisPoints: 2000, suggestedBasisPoints: 3333 }], files: [] } });
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function render(node: ReactNode) { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function click(label: string) { const button = [...host.querySelectorAll("button")].find(b => b.textContent === label); expect(button).toBeTruthy(); await act(async () => button!.click()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
describe("writing evidence and explicit contribution suggestions", () => {
  it("shows all-prose shares separately from unknown coverage and explains stale versions", async () => {
    await render(<WritingReportResult report={report()} />);
    expect(host.textContent).toContain("40.00% of all prose"); expect(host.textContent).toContain("Unattributed words: 4");
    expect(host.textContent).toContain("60.00% with recorded attribution"); expect(host.textContent).toContain("This report still describes the saved version");
    expect(host.textContent).toContain("pasted or AI text may be included");
  });
  it("does not manufacture shares when all writing is unknown", async () => {
    const data = report(); data.result = { ...data.result!, attributedWordUnits: 0, coverageBasisPoints: 0, unknownWordUnits: 10000, members: [] };
    await render(<WritingReportResult report={data} />);
    expect(host.textContent).toContain("No attributable writing yet"); expect(host.querySelector(".writing-contributor-list")).toBeNull();
  });
  it("does not mutate participation until the user explicitly applies the suggestion", async () => {
    evaluations.writingSuggestions.mockResolvedValue([report()]); const use = vi.fn();
    await render(<WritingParticipationSuggestions projectId="project" sourceIds={["source"]} participants={["a", "b"]} onUse={use} onRemove={vi.fn()} />);
    expect(use).not.toHaveBeenCalled(); expect(host.textContent).toContain("66.67%"); expect(host.textContent).toContain("Unattributed words: 4");
    await click("Replace participation inputs with this writing suggestion"); expect(use).toHaveBeenCalledWith(expect.objectContaining({ id: "report" }));
  });
  it("blocks applying a suggestion if a measured writer is missing from the work record", async () => {
    evaluations.writingSuggestions.mockResolvedValue([report()]); const use = vi.fn();
    await render(<WritingParticipationSuggestions projectId="project" sourceIds={["source"]} participants={["a"]} onUse={use} onRemove={vi.fn()} />);
    const button = [...host.querySelectorAll("button")].find(b => b.textContent === "Replace participation inputs with this writing suggestion");
    expect(button?.disabled).toBe(true); expect(use).not.toHaveBeenCalled();
  });
  it("saves a version before queueing a report and creates a contribution draft only on request", async () => {
    api.writingReports.mockResolvedValue({ items: [], page: 1, total: 0, hasNext: false }); api.requestWritingReport.mockResolvedValue(report()); api.writingReport.mockResolvedValue(report()); api.writingContribution.mockResolvedValue({ id: "contribution" });
    const prepare = vi.fn().mockResolvedValue("snapshot");
    await render(<ManuscriptWriting projectId="project" manuscriptId="manuscript" canWrite prepare={prepare} />);
    expect(api.requestWritingReport).not.toHaveBeenCalled();
    await click("Save version and calculate writing");
    expect(prepare).toHaveBeenCalledOnce(); expect(api.requestWritingReport).toHaveBeenCalledWith("project", "manuscript", "snapshot");
    expect(api.writingContribution).not.toHaveBeenCalled();
    await click("Create contribution draft from this report"); expect(api.writingContribution).toHaveBeenCalledOnce(); expect(host.textContent).toContain("Open contributions to review and submit");
  });
  it("offers report reading without write actions for a read-only manuscript", async () => {
    api.writingReports.mockResolvedValue({ items: [report()], page: 1, total: 1, hasNext: false }); api.writingReport.mockResolvedValue(report());
    await render(<ManuscriptWriting projectId="project" manuscriptId="manuscript" canWrite={false} prepare={vi.fn()} />);
    expect(host.textContent).toContain("Writing contributions"); expect(host.textContent).not.toContain("Save version and calculate writing"); expect(host.textContent).not.toContain("Create contribution draft from this report");
  });
  it("keeps the selected report fixed while its contribution draft is being saved", async () => {
    api.writingReports.mockResolvedValue({ items: [report()], page: 1, total: 11, hasNext: true }); api.writingReport.mockResolvedValue(report());
    let finish!: (value: { id: string }) => void;
    api.writingContribution.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render(<ManuscriptWriting projectId="project" manuscriptId="manuscript" canWrite prepare={vi.fn()} />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    await click("Create contribution draft from this report");
    expect([...host.querySelectorAll("button")].find(b => b.textContent === "Next")?.disabled).toBe(true);
    expect([...host.querySelectorAll("button")].find(b => b.textContent === "Save version and calculate writing")?.disabled).toBe(true);
    await act(async () => { finish({ id: "contribution" }); });
    expect(host.textContent).toContain("Contribution draft created");
  });
});
