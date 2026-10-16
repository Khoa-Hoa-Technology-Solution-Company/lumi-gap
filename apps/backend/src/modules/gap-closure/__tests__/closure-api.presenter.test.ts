import { describe, expect, it } from "vitest";
import { toGapClosureSummary, toGapListItem, type GapListDoc } from "../../gaps/gap-presenter.js";

const baseDoc: GapListDoc = {
  _id: "gap-1",
  topic: "telehealth",
  normalizedTopic: "telehealth",
  title: "Telehealth gap",
  description: "d",
  rationale: "r",
  confidence: 0.5,
  source: "standalone",
  userId: "u1",
  status: "active",
  createdAt: new Date("2026-10-15T00:00:00.000Z"),
};

describe("gap list closure fields", () => {
  it("summarises the latest closure check", () => {
    const decidedAt = new Date("2026-10-15T08:00:00.000Z");
    expect(toGapClosureSummary({ id: "c1", status: "DECIDED", decision: "OPEN_CERTIFIED", bound: 0.153, judgeKind: "AI", decidedAt })).toEqual({
      checkId: "c1",
      status: "DECIDED",
      decision: "OPEN_CERTIFIED",
      bound: 0.153,
      judgeKind: "AI",
      decidedAt: decidedAt.toISOString(),
    });
    const running = toGapClosureSummary({ id: "c2", status: "SCREENING", decision: null, bound: null, judgeKind: null, decidedAt: null });
    expect(running).toMatchObject({ checkId: "c2", status: "SCREENING" });
    expect(running.decision).toBeUndefined();
    expect(running.decidedAt).toBeUndefined();
  });

  it("passes closureStatus, facets and the latest check through to the list item", () => {
    const latest = toGapClosureSummary({ id: "c1", status: "DECIDED", decision: "CLOSED", bound: null, judgeKind: "HUMAN", decidedAt: new Date() });
    const item = toGapListItem({ ...baseDoc, closureStatus: "CLOSED", questionFacets: { population: "adults" }, latestClosureCheck: latest }, new Map());
    expect(item.closureStatus).toBe("CLOSED");
    expect(item.questionFacets).toEqual({ population: "adults" });
    expect(item.latestClosureCheck?.checkId).toBe("c1");
  });

  it("leaves the fields undefined for a gap that was never checked", () => {
    const item = toGapListItem(baseDoc, new Map());
    expect(item.latestClosureCheck).toBeUndefined();
    expect(item.questionFacets).toBeUndefined();
  });
});
