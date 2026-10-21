// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { percentBasisPoints, AllocationRevisionDetail } from "../components/contribution-allocation";
import { heatmapDays, heatmapCalendar, ContributionActivityPanel } from "../components/contribution-activity";
import { WorkDetail } from "../components/work-contributions";
import { contributionDate } from "../utils/contribution-date";
import type { AllocationRevisionView, WorkContribution } from "@trend/shared-types";
const mocks = vi.hoisted(() => ({ activity: vi.fn(), decide: vi.fn(), submitDraft: vi.fn(), challenge: vi.fn(), review: vi.fn() }));
vi.mock("../api/contributions.api", () => ({ contributionsApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "me" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
let container: HTMLDivElement, root: ReturnType<typeof createRoot>, client: QueryClient;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); mocks.activity.mockResolvedValue({ items: [], total: 0, hasNext: false, days: [], members: [], timeZone: "UTC" }); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
async function render(element: React.ReactNode) { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter></QueryClientProvider>)); await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
describe("contribution UI governance", () => {
  function revision(): AllocationRevisionView {
    const roster = [{ id: "me", name: "Researcher", reasons: ["MEMBERSHIP_DURING_PERIOD"], unavailable: false }];
    return { id: "r", revision: 1, draftVersion: 1, status: "DRAFT", period: { id: "period", title: "Writing phase", description: "Phase description", scope: "Research writing effort", periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-10-14T00:00:00Z", policyVersion: "CORE_TEAM_UNANIMOUS_V1", roster, historyIncomplete: false }, rationale: "Team proposal based on documented work", roster, shares: [{ userId: "me", basisPoints: 10000, rationale: "Phase work" }], approvals: [], evidenceSummary: [], submittedAt: null, finalizedAt: null, selfAcknowledged: true, canManage: true, canRespond: false, rosterChallenges: [], canChallengeRoster: false };
  }
  it("disables proposal submission for incomplete totals, precision, roster and zero-share rationale", async () => {
    const item = revision();
    const invalids = [
      { ...item, shares: [{ ...item.shares[0]!, basisPoints: 9999 }] },
      { ...item, shares: [{ ...item.shares[0]!, basisPoints: 10001 }] },
      { ...item, shares: [{ ...item.shares[0]!, basisPoints: 9999.9 }] },
      { ...item, shares: [] },
      { ...item, rationale: "Too short" },
      { ...item, roster: [...item.roster, { ...item.roster[0]!, id: "peer" }], shares: [...item.shares, { userId: "peer", basisPoints: 0, rationale: "" }] },
    ];
    for (const value of invalids) {
      await render(<AllocationRevisionDetail projectId="p" item={value} />);
      const submit = [...container.querySelectorAll("button")].find(button => button.textContent === "Submit proposal")!;
      expect(submit.disabled).toBe(true); await act(async () => submit.click());
    }
    expect(mocks.submitDraft).not.toHaveBeenCalled();
    await render(<AllocationRevisionDetail projectId="p" item={item} />);
    expect([...container.querySelectorAll("button")].find(button => button.textContent === "Submit proposal")!.disabled).toBe(false);
  });
  it("keeps failed decisions unresolved and displays a recoverable error", async () => {
    const item = { ...revision(), status: "AWAITING_APPROVAL" as const, submittedAt: "2026-10-14T01:00:00Z", canRespond: true };
    mocks.decide.mockRejectedValue(new Error("Network response lost"));
    await render(<AllocationRevisionDetail projectId="p" item={item} />);
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Approve this exact revision")!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.textContent).toContain("This proposal has not been approved by every participant.");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Export agreed allocation");
  });
  it("offers a historical collaborator the authorized challenge action without independent acceptance", async () => {
    const item: WorkContribution = { id: "c", projectId: "p", version: 2, title: "Corrected methodology", description: "Corrected team methodology record", source: "MANUAL", workDate: "2026-10-14T00:00:00Z", status: "SELF_RECORDED", createdBy: { id: "owner", name: "Creator" }, participants: [{ userId: "owner", name: "Creator", roles: [] }], evidence: "", evidenceRefs: [], reviews: [], history: [], createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", viewerId: "me", readOnly: false, canManage: false, reviewActions: ["NEEDS_CHANGES", "DISPUTE"] };
    mocks.review.mockResolvedValue(item); await render(<WorkDetail projectId="p" item={item} currentUserId="me" readOnly={false} />);
    expect(container.textContent).not.toContain("Acknowledge as independent peer"); expect(container.textContent).not.toContain("Acknowledge my roles");
    const feedback = container.querySelector("textarea")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(feedback, "The correction wrongly removes my work"); feedback.dispatchEvent(new Event("input", { bubbles: true })); });
    const challenge = [...container.querySelectorAll("button")].find(b => b.textContent === "Challenge attribution")!;
    await act(async () => challenge.click()); expect(mocks.review).toHaveBeenCalledWith("p", "c", { expectedVersion: 2, decision: "DISPUTE", note: "The correction wrongly removes my work" });
    await render(<WorkDetail projectId="p" item={{ ...item, status: "DRAFT", viewerId: "owner", reviewActions: [] }} currentUserId="owner" readOnly={false} />);
    expect(container.textContent).not.toContain("Submit for acknowledgement");
  });
  it("keeps calendar labels consistent across UTC and the research team's midnight", () => { expect(contributionDate("2026-10-13T17:30:00Z")).toBe("2026-10-14"); expect(contributionDate("2026-10-13T17:30:00Z", "UTC")).toBe("2026-10-13"); });
  it("converts two-decimal percentages exactly and rejects floating input beyond that precision", () => { expect(percentBasisPoints("33.33")).toBe(3333); expect(percentBasisPoints("100.00")).toBe(10000); for (const invalid of ["33.333", "100.01", "-1", "1e2", "NaN", ""]) expect(percentBasisPoints(invalid)).toBeNull(); });
  it("uses a calendar range across a leap day", () => { expect(heatmapDays("2024-02-28", "2024-03-01")).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]); });
  it("aligns calendar columns to Monday and pads partial weeks without inventing dates", () => {
    expect(heatmapCalendar([])).toEqual([]);
    const days = heatmapDays("2026-09-30", "2026-10-05");
    const cells = heatmapCalendar(days);
    expect(cells).toHaveLength(14);
    expect(cells.slice(0, 3)).toEqual([null, null, "2026-09-30"]);
    expect(cells[6]).toBe("2026-10-04");
    expect(cells[7]).toBe("2026-10-05");
    expect(cells.filter(Boolean)).toEqual(days);
    expect(cells.slice(8)).toEqual(Array(6).fill(null));
  });
  it("shows persisted empty activity and requests selected-day details from the server", async () => { await render(<ContributionActivityPanel projectId="p" />); expect(container.textContent).toContain("Meaningful research actions will appear here as your team works."); expect(container.textContent).toContain("Recorded activity does not automatically determine contribution percentages."); const cell = container.querySelector<HTMLButtonElement>('[aria-label*="recorded activities"]'); expect(cell).not.toBeNull(); await act(async () => cell!.click()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); expect(mocks.activity).toHaveBeenLastCalledWith("p", expect.objectContaining({ eventDay: expect.any(String), page: 1 })); });
  it("does not display unresolved shares as a final agreement or offer owner finalization", async () => {
    const item: AllocationRevisionView = { id: "r", revision: 2, draftVersion: 1, status: "AWAITING_APPROVAL", period: { id: "period", title: "Writing phase", description: "Phase description", scope: "Research writing effort", periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-10-14T00:00:00Z", policyVersion: "CORE_TEAM_UNANIMOUS_V1", roster: [], historyIncomplete: false }, rationale: "Team proposal based on documented work", roster: [{ id: "me", name: "Researcher with a long name", reasons: ["MEMBERSHIP_DURING_PERIOD"], unavailable: false }], shares: [{ userId: "me", basisPoints: 10000, rationale: "Phase work" }], approvals: [], evidenceSummary: [], submittedAt: "2026-10-14T01:00:00Z", finalizedAt: null, selfAcknowledged: true, canManage: true, canRespond: true, rosterChallenges: [], canChallengeRoster: true };
    mocks.decide.mockResolvedValue(item); await render(<AllocationRevisionDetail projectId="p" item={item} />); expect(container.textContent).toContain("This proposal has not been approved by every participant."); expect(container.textContent).toContain("Single-participant result: self-acknowledged"); expect(container.textContent).not.toContain("Export agreed allocation"); const approval = [...container.querySelectorAll("button")].find(b => b.textContent === "Approve this exact revision"); await act(async () => approval!.click()); expect(mocks.decide).toHaveBeenCalledWith("p", "r", "APPROVE", ""); expect(mocks.submitDraft).not.toHaveBeenCalled();
    await render(<AllocationRevisionDetail projectId="p" item={{ ...item, canManage: false, canRespond: false, canChallengeRoster: false }} />); expect(container.textContent).not.toContain("Approve this exact revision"); expect(container.textContent).not.toContain("Challenge participant roster");
  });
});
