// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionEvaluationSnapshot, OutcomeEvaluation } from "@trend/shared-types";
import { EvaluationComparison, EvaluationReview, EvaluationSnapshotResult } from "../components/contribution-evaluation";

const api = vi.hoisted(() => ({ snapshots: vi.fn(), snapshot: vi.fn(), detail: vi.fn(), decide: vi.fn() }));
vi.mock("../api/contribution-evaluation.api", () => ({ contributionEvaluationApi: api }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "me" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function render(element: ReactNode) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}
function snapshot(): ContributionEvaluationSnapshot {
  return {
    id: "snapshot-1", projectId: "project", periodId: "period", period: { id: "period", scope: "Methodology", periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-10-28T00:00:00Z" }, rounding: "LARGEST_REMAINDER_UUID_ASC_V1", inputHash: "a".repeat(64), inputVersion: "1", calculatedAt: "2026-10-28T00:00:00Z", calculatedBy: "me", isStale: true,
    rule: { id: "rule", version: 1, title: "Research methodology", rationale: "Agreed work scope and inputs", defaultWeight: 1, maxWeight: 100, createdAt: "2026-10-01T00:00:00Z" },
    roster: [{ id: "me", name: "Researcher A", reasons: ["MEMBERSHIP_DURING_PERIOD"], unavailable: false }, { id: "peer", name: "Researcher B", reasons: ["MEMBERSHIP_DURING_PERIOD"], unavailable: false }],
    coverage: { total: 20, eligible: 12, pending: 5, disputed: 3, excluded: 0 },
    calculation: { algorithmVersion: "WEIGHTED_CONFIRMED_V1", status: "PROVISIONAL", totalRawScore: "100000", scores: [{ userId: "me", rawScore: "60000", basisPoints: 6000, components: [{ outcomeKey: "METHOD-01", weight: 10, participationBasisPoints: 6000, rawScore: "60000" }] }, { userId: "peer", rawScore: "40000", basisPoints: 4000, components: [] }] },
    outcomes: [{ outcomeId: "disputed", outcomeKey: "DUPLICATE", title: "Overlapping methodology", eligibility: "DISPUTED", reasons: ["DISPUTED"], sources: [], evaluation: null, verificationMode: null }],
  };
}
function review(): OutcomeEvaluation {
  return { id: "evaluation", version: 2, payloadHash: "b".repeat(64), createdAt: "2026-10-28T00:00:00Z", createdById: "me", decisions: [], canApprove: true, canApproveWeight: true, canChallenge: true,
    payload: { ruleId: "rule", outcomeKey: "METHOD-01", weight: 10, rationale: "Agreed effort and documented experiment design", retrospectiveWeight: true, sources: [{ id: "source", version: 1, title: "Protocol design", description: "Experiment design", workDate: "2026-10-20T00:00:00Z", status: "ACCEPTED", evidence: "Dated protocol review notes", evidenceRefs: [], participants: ["me"] }], participation: [{ userId: "me", basisPoints: 10000 }] },
  };
}
describe("evaluation suggestions and exact input consent", () => {
  it("clearly labels 12/20 as provisional, exposes exclusions and compares without mutating a proposal", async () => {
    const shares = [{ userId: "me", basisPoints: 5500, rationale: "Additional offline work" }, { userId: "peer", basisPoints: 4500, rationale: "Other agreed effort" }];
    await render(<EvaluationSnapshotResult snapshot={snapshot()} shares={shares} />);
    expect(host.textContent).toContain("Provisional"); expect(host.textContent).toContain("12/20");
    expect(host.textContent).toContain("Source data changed after this calculation");
    expect(host.textContent).toContain("60.00%"); expect(host.textContent).toContain("55.00%"); expect(host.textContent).toContain("-5.00");
    expect(host.textContent).toContain("Overlapping methodology: An unresolved objection exists");
    expect(shares.map(s => s.basisPoints)).toEqual([5500, 4500]);
  });
  it("shows insufficient data with no fabricated distribution", async () => {
    const s = snapshot(); s.calculation = { ...s.calculation, status: "INSUFFICIENT_DATA", totalRawScore: "0", scores: s.calculation.scores.map(x => ({ ...x, rawScore: "0", basisPoints: null, components: [] })) };
    await render(<EvaluationSnapshotResult snapshot={s} />);
    expect(host.textContent).toContain("Insufficient confirmed data"); expect(host.textContent).toContain("Confirm at least one outcome");
    expect(host.querySelector("table")).toBeNull(); expect(host.textContent).not.toContain("100.00%");
  });
  it("only attaches a calculation after an explicit selection", async () => {
    const s = snapshot(), select = vi.fn();
    api.snapshots.mockResolvedValue({ items: [{ id: s.id, calculatedAt: s.calculatedAt, inputHash: s.inputHash, isStale: true }], page: 1, pageSize: 20, total: 1, hasNext: false });
    api.snapshot.mockResolvedValue(s);
    await render(<EvaluationComparison projectId="project" periodId="period" shares={[]} selectedId={null} select={select} />);
    expect(select).not.toHaveBeenCalled();
    await act(async () => { const input = host.querySelector("select")!; input.value = s.id; input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(select).toHaveBeenCalledWith(s.id);
  });
  it("never auto signs and submits separate owner/participant consent tied to the exact hash", async () => {
    const e = review(); api.detail.mockResolvedValue({ evaluation: e, rule: snapshot().rule, people: [{ id: "me", name: "Researcher A" }] }); api.decide.mockResolvedValue({ recorded: true });
    await render(<EvaluationReview projectId="project" evaluationId={e.id} />);
    expect(api.decide).not.toHaveBeenCalled();
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Confirm proposed weight as owner")!.click());
    expect(api.decide).toHaveBeenCalledWith("project", e.id, { kind: "WEIGHT", decision: "APPROVE", payloadHash: e.payloadHash, note: "" });
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Confirm my participation and evaluation inputs")!.click());
    expect(api.decide).toHaveBeenLastCalledWith("project", e.id, { kind: "PARTICIPANT", decision: "APPROVE", payloadHash: e.payloadHash, note: "" });
  });
  it("retains a failed dispute for retry and honors restricted review permissions", async () => {
    const e = review(); e.canApprove = false; e.canApproveWeight = false;
    api.detail.mockResolvedValue({ evaluation: e, rule: snapshot().rule, people: [] }); api.decide.mockRejectedValue(new Error("Network lost"));
    await render(<EvaluationReview projectId="project" evaluationId={e.id} />);
    expect(host.textContent).not.toContain("Confirm proposed weight as owner");
    const textarea = host.querySelector("textarea")!, note = "The current revision omits my documented contribution";
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, note); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Dispute this evaluation")!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(textarea.value).toBe(note); expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(api.decide).toHaveBeenCalledWith("project", e.id, { kind: "CHALLENGE", decision: "DISPUTE", payloadHash: e.payloadHash, note });
  });
  it("keeps an unsent objection when the user confirms a separate weight decision", async () => {
    const e = review(); api.detail.mockResolvedValue({ evaluation: e, rule: snapshot().rule, people: [] }); api.decide.mockResolvedValue({ recorded: true });
    await render(<EvaluationReview projectId="project" evaluationId={e.id} />);
    const textarea = host.querySelector("textarea")!, note = "My pending objection should not disappear after confirming the weight";
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, note); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Confirm proposed weight as owner")!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(textarea.value).toBe(note);
    expect(api.decide).toHaveBeenCalledWith("project", e.id, { kind: "WEIGHT", decision: "APPROVE", payloadHash: e.payloadHash, note: "" });
  });
  it("shows carried objections and sends an explicit explanation to resolve them", async () => {
    const e = { ...review(), canResolveObjection: true, canApprove: false, canApproveWeight: false, unresolvedObjections: [{ userId: "me", evaluationId: "old", version: 1, note: "Missing methodology attribution" }] };
    api.detail.mockResolvedValue({ evaluation: e, rule: snapshot().rule, people: [{ id: "me", name: "Researcher A" }] }); api.decide.mockResolvedValue({ recorded: true });
    await render(<EvaluationReview projectId="project" evaluationId={e.id} />);
    expect(host.textContent).toContain("Missing methodology attribution"); expect(api.decide).not.toHaveBeenCalled();
    const resolve = [...host.querySelectorAll("button")].find(b => b.textContent === "Accept this revision as resolving my objection")!;
    expect(resolve.disabled).toBe(true);
    const textarea = host.querySelector("textarea")!, note = "The corrected attribution now accurately explains my work";
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, note); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => resolve.click());
    expect(api.decide).toHaveBeenCalledWith("project", e.id, { kind: "RESOLUTION", decision: "APPROVE", payloadHash: e.payloadHash, note });
  });
});
