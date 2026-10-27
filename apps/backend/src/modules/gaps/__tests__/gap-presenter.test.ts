import { describe, expect, it } from "vitest";
import { canAccessGap, gapNextStep, isGapLowSample, sortGapRows, toGapListItem, type GapSortRow } from "../gap-presenter.js";

describe("canAccessGap", () => {
  it("allows the gap owner", () => {
    expect(canAccessGap("user-1", { userId: "user-1" })).toBe(true);
  });

  it("allows project owners and members for project gaps", () => {
    const gap = { userId: "creator", projectId: "project-1" };
    const project = {
      ownerId: "owner-1",
      members: [{ targetId: "member-1" }],
    };

    expect(canAccessGap("owner-1", gap, project)).toBe(true);
    expect(canAccessGap("member-1", gap, project)).toBe(true);
  });

  it("rejects unrelated users", () => {
    expect(
      canAccessGap(
        "stranger",
        { userId: "creator", projectId: "project-1" },
        { ownerId: "owner-1", members: [{ targetId: "member-1" }] },
      ),
    ).toBe(false);
  });
});

describe("toGapListItem", () => {
  it("marks report gaps without a corpus probe as ai_only and expands supporting papers", () => {
    const item = toGapListItem(
      {
        _id: "gap-1",
        topic: "AI education",
        normalizedTopic: "ai education",
        title: "Missing classroom validation",
        description: "desc",
        rationale: "why",
        evidencePaperIds: ["paper-1", "paper-2"],
        supportingPaperIds: ["paper-1"],
        confidence: 0.8,
        evidenceConfidence: 0.8,
        source: "report",
        sourceReportId: "report-1",
        userId: "user-1",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
      new Map([
        [
          "paper-1",
          {
            id: "paper-1",
            title: "LLM Feedback in Classrooms",
            publicationYear: 2025,
            citationCount: 12,
            journalName: "Computers & Education",
          },
        ],
        [
          "paper-2",
          {
            id: "paper-2",
            title: "Longitudinal AI Learning",
            publicationYear: 2024,
            citationCount: 7,
          },
        ],
      ]),
    );

    expect(item.evidenceStatus).toBe("ai_only");
    expect(item.supportingPapers).toEqual([
      {
        id: "paper-1",
        title: "LLM Feedback in Classrooms",
        publicationYear: 2025,
        citationCount: 12,
        journalName: "Computers & Education",
      },
    ]);
    expect(item.evidencePaperIds).toEqual(["paper-1", "paper-2"]);
    expect(item.evidencePapers.map((paper) => paper.id)).toEqual(["paper-1", "paper-2"]);
  });

  it("marks standalone gaps with high evidence confidence as confirmed", () => {
    const item = toGapListItem(
      {
        _id: "gap-2",
        topic: "AI education",
        normalizedTopic: "ai education",
        title: "Missing longitudinal studies",
        description: "desc",
        rationale: "why",
        supportingPaperIds: [],
        confidence: 0.7,
        evidenceConfidence: 0.76,
        evidenceScopeSize: 1000,
        source: "standalone",
        userId: "user-1",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        probe: { topicA: "LLM feedback", topicB: "longitudinal learning" },
      },
      new Map(),
    );

    expect(item.evidenceStatus).toBe("confirmed");
  });

  it("marks low-evidence standalone gaps as weak", () => {
    const item = toGapListItem(
      {
        _id: "gap-3",
        topic: "AI education",
        normalizedTopic: "ai education",
        title: "Possible gap",
        description: "desc",
        rationale: "why",
        supportingPaperIds: [],
        confidence: 0.7,
        evidenceConfidence: 0.2,
        source: "standalone",
        userId: "user-1",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        probe: { topicA: "LLM feedback", topicB: "rural education" },
      },
      new Map(),
    );

    expect(item.evidenceStatus).toBe("weak");
  });

  it("exposes the counting scope and the project-level evidence without letting it decide the label", () => {
    const base = {
      _id: "gap-scope",
      topic: "AI education",
      normalizedTopic: "ai education",
      title: "Scoped gap",
      description: "desc",
      rationale: "why",
      supportingPaperIds: [],
      confidence: 0.7,
      evidenceConfidence: 0.2,
      source: "standalone" as const,
      userId: "user-1",
      status: "active" as const,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      probe: { topicA: "LLM feedback", topicB: "rural education" },
    };
    const projectEvidence = { intersectionCount: 0, parentCounts: { a: 7, b: 7 }, scopePaperCount: 7, evidenceConfidence: 0.95 };

    const item = toGapListItem({ ...base, evidenceScopeSize: 1200, projectEvidence }, new Map());
    expect(item.evidenceScopeSize).toBe(1200);
    expect(item.projectEvidence).toEqual(projectEvidence);
    expect(item.evidenceStatus).toBe("weak");

    const legacy = toGapListItem(base, new Map());
    expect(legacy.evidenceScopeSize).toBeUndefined();
    expect(legacy.projectEvidence).toBeUndefined();
  });

  describe("evidence status and the recorded counting scope", () => {
    const gap = (evidenceScopeSize?: number) => toGapListItem(
      {
        _id: "gap-scope-status",
        topic: "AI education",
        normalizedTopic: "ai education",
        title: "Scope status gap",
        description: "desc",
        rationale: "why",
        supportingPaperIds: [],
        confidence: 0.9,
        evidenceConfidence: 0.9,
        evidenceScopeSize,
        source: "standalone",
        userId: "user-1",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        probe: { topicA: "LLM feedback", topicB: "rural education" },
      },
      new Map(),
    );

    it("never confirms a gap whose counting scope was not recorded", () => {
      expect(gap(undefined).evidenceStatus).toBe("weak");
    });

    it("confirms a gap with a recorded scope and a high evidence score", () => {
      expect(gap(1000).evidenceStatus).toBe("confirmed");
    });
  });

  it("uses supporting papers as evidence for legacy gaps", () => {
    const item = toGapListItem(
      {
        _id: "gap-legacy",
        topic: "AI education",
        normalizedTopic: "ai education",
        title: "Legacy gap",
        description: "desc",
        rationale: "why",
        supportingPaperIds: ["paper-1"],
        confidence: 0.6,
        source: "report",
        userId: "user-1",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
      new Map([
        ["paper-1", { id: "paper-1", title: "Legacy evidence" }],
      ]),
    );

    expect(item.evidencePaperIds).toEqual(["paper-1"]);
    expect(item.evidencePapers).toHaveLength(1);
  });
});

describe("under-explored signal recomputed from stored counts", () => {
  const base = {
    _id: "gap-signal",
    topic: "AI education",
    normalizedTopic: "ai education",
    title: "Signal gap",
    description: "desc",
    rationale: "why",
    supportingPaperIds: [],
    confidence: 0.4,
    source: "standalone" as const,
    userId: "user-1",
    status: "active" as const,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    probe: { topicA: "federated learning", topicB: "medical imaging" },
  };

  it("re-ranks an old row whose stored score came from the co-mention rule", () => {
    // Stored 0.95 under the old rule, but 0 papers where 0.3 would be expected is chance.
    const item = toGapListItem({ ...base, evidenceConfidence: 0.95, evidenceScopeSize: 1000, intersectionCount: 0, parentCounts: { a: 20, b: 15 } }, new Map(), { minParentPapers: 5 });
    expect(item.evidenceStatus).toBe("weak");
    expect(item.evidenceConfidence).toBe(0.25);
    expect(item.underExplored?.expected).toBeCloseTo(0.3, 10);
    expect(item.underExplored?.pValue).toBeCloseTo(0.7408, 4);
  });

  it("exposes expected, ratio and p for a significant shortfall", () => {
    const item = toGapListItem({ ...base, evidenceConfidence: 0.1, evidenceScopeSize: 20000, intersectionCount: 1, parentCounts: { a: 400, b: 300 } }, new Map(), { minParentPapers: 5 });
    expect(item.evidenceStatus).toBe("confirmed");
    expect(item.evidenceConfidence).toBe(0.92);
    expect(item.underExplored?.ratio).toBeCloseTo(1 / 6, 10);
    expect(item.underExplored?.pValue).toBeCloseTo(0.0174, 4);
  });

  it("falls back to the stored score when a count is missing", () => {
    const item = toGapListItem({ ...base, evidenceConfidence: 0.8, evidenceScopeSize: 1000, parentCounts: { a: 20, b: 15 } }, new Map(), { minParentPapers: 5 });
    expect(item.evidenceStatus).toBe("confirmed");
    expect(item.evidenceConfidence).toBe(0.8);
    expect(item.underExplored).toBeUndefined();
  });

  it("ranks by the recomputed signal", () => {
    const row = (id: string, intersectionCount: number, stored: number): GapSortRow => ({ id, confidence: 0.5, evidenceConfidence: stored, evidenceScopeSize: 20000, intersectionCount, createdAt: new Date("2026-01-01T00:00:00Z"), source: "standalone", probe: base.probe, parentCounts: { a: 400, b: 300 }, supportingCount: 0 });
    const ordered = sortGapRows([row("stale-high", 6, 0.99), row("real-shortfall", 1, 0.1)], "recommended", 5).map((item) => item.id);
    expect(ordered).toEqual(["real-shortfall", "stale-high"]);
  });

  it("is not confirmed when OpenAlex finds the intersection well covered, and ranks behind an agreeing gap", () => {
    const openAlex = (intersectionCount: number) => ({ source: "openalex" as const, intersectionCount, parentCounts: { a: 50_000, b: 40_000 }, scopeSize: 10_000_000, fetchedAt: "2026-10-20T00:00:00.000Z" });
    const doc = { ...base, intersectionCount: 1, evidenceScopeSize: 20000, parentCounts: { a: 400, b: 300 } };
    const vetoed = toGapListItem({ ...doc, globalEvidence: openAlex(180) }, new Map(), { minParentPapers: 5 });
    expect(vetoed.evidenceStatus).toBe("weak");
    expect(vetoed.underExplored).toMatchObject({ vetoedByGlobal: true, global: { expected: 200 } });
    // Only the broad probe area is known to be busy, not the gap's own claim.
    expect(vetoed.nextStep).toMatchObject({ kind: "busy_area", globalWellCovered: true, broadArea: { openAlexCount: 180 } });
    expect(toGapListItem({ ...doc, globalEvidence: openAlex(20) }, new Map(), { minParentPapers: 5 }).evidenceStatus).toBe("confirmed");

    const row = (id: string, globalEvidence: ReturnType<typeof openAlex>): GapSortRow => ({ id, confidence: 0, evidenceConfidence: null, evidenceScopeSize: 20000, intersectionCount: 1, createdAt: new Date("2026-01-01T00:00:00Z"), source: "standalone", probe: base.probe, parentCounts: { a: 400, b: 300 }, globalEvidence, supportingCount: 0 });
    expect(sortGapRows([row("vetoed", openAlex(180)), row("agreed", openAlex(20))], "recommended", 5).map((item) => item.id)).toEqual(["agreed", "vetoed"]);
  });
});

describe("gapNextStep", () => {
  const input = { evidenceStatus: "weak" as const, counterCount: 0, globalWellCovered: false, lowSample: false, globalEvidence: null, minParentPapers: 5, closureDecided: false };
  const openAlex = { source: "openalex" as const, intersectionCount: 271, parentCounts: { a: 2841, b: 1527607 }, scopeSize: 36_000_000, fetchedAt: "2026-10-21T00:00:00.000Z" };

  it("says a gap with papers that may answer it is probably already studied, before any count", () => {
    expect(gapNextStep({ ...input, evidenceStatus: "confirmed", counterCount: 2 })).toEqual({ kind: "likely_studied", counterCount: 2, globalWellCovered: false });
    // OpenAlex alone only shows the broad area is busy; it does not say the gap is answered.
    expect(gapNextStep({ ...input, globalWellCovered: true, probe: { topicA: "a", topicB: "b" }, globalEvidence: { source: "openalex", intersectionCount: 1138, parentCounts: { a: 9, b: 9 }, fetchedAt: "" } })).toMatchObject({ kind: "busy_area", broadArea: { topicA: "a", topicB: "b", openAlexCount: 1138 } });
  });

  it("says the corpus is too thin when a probe topic is rare locally but common in OpenAlex", () => {
    expect(gapNextStep({ ...input, lowSample: true, globalEvidence: openAlex })?.kind).toBe("thin_corpus");
    // Rare everywhere: a thin corpus is not the explanation.
    expect(gapNextStep({ ...input, lowSample: true, globalEvidence: { ...openAlex, parentCounts: { a: 2, b: 40 } } })?.kind).toBe("refine");
  });

  it("sends a confirmed, uncontested gap to the closure check and everything else to refinement", () => {
    expect(gapNextStep({ ...input, evidenceStatus: "confirmed" })?.kind).toBe("run_closure");
    expect(gapNextStep(input)?.kind).toBe("refine");
  });

  it("follows the self-check: narrowed gaps go to closure, kept ones no longer count the papers, dropped ones need nothing", () => {
    const refinement = (action: "keep" | "narrow" | "drop") => ({ action, reason: "r", counterCount: 3, promptVersion: "v" });
    expect(gapNextStep({ ...input, counterCount: 3, refinement: refinement("narrow") })?.kind).toBe("refined");
    expect(gapNextStep({ ...input, counterCount: 3, refinement: refinement("keep") })?.kind).toBe("refine");
    expect(gapNextStep({ ...input, counterCount: 3, refinement: refinement("drop") })).toBeUndefined();
  });

  it("has no next step once a closure check decided", () => {
    expect(gapNextStep({ ...input, counterCount: 3, closureDecided: true })).toBeUndefined();
  });
});

describe("isGapLowSample", () => {
  it("flags gaps whose smaller probe topic is under the threshold", () => {
    expect(isGapLowSample({ parentCounts: { a: 1, b: 40 } }, 5)).toBe(true);
    expect(isGapLowSample({ parentCounts: { a: 5, b: 40 } }, 5)).toBe(false);
    expect(isGapLowSample({}, 5)).toBe(false);
  });
});

describe("sortGapRows", () => {
  const probe = { topicA: "federated learning", topicB: "medical imaging" };
  const row = (id: string, overrides: Partial<GapSortRow>): GapSortRow => ({
    id,
    confidence: 0.5,
    evidenceConfidence: null,
    evidenceScopeSize: 1000,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    source: "standalone",
    probe,
    parentCounts: { a: 40, b: 40 },
    supportingCount: 0,
    ...overrides,
  });
  const ids = (rows: GapSortRow[]) => rows.map((item) => item.id);

  // confirmed evidence, weak evidence with high AI confidence, AI-only report gap, newest weak gap
  const rows = [
    row("confirmed", { evidenceConfidence: 0.7, confidence: 0.4, supportingCount: 1 }),
    row("confident", { evidenceConfidence: 0.3, confidence: 0.95, supportingCount: 4 }),
    row("ai-only", { source: "report", probe: null, parentCounts: null, confidence: 0.9 }),
    row("newest", { evidenceConfidence: 0.2, confidence: 0.2, createdAt: new Date("2026-06-01T00:00:00Z") }),
  ];

  it("ranks by evidence score and puts unscored gaps last regardless of AI confidence", () => {
    expect(ids(sortGapRows(rows, "recommended", 5))).toEqual(["confirmed", "confident", "newest", "ai-only"]);
    const unscored = row("unscored", { evidenceConfidence: null, confidence: 0.9 });
    const scored = row("scored", { evidenceConfidence: 0.3, confidence: 0.1 });
    expect(ids(sortGapRows([unscored, scored], "recommended", 5))).toEqual(["scored", "unscored"]);
  });

  it("ranks a gap with counter-evidence (confirmed or possible) after gaps without", () => {
    const contested = row("contested", { evidenceConfidence: 0.7, counterCount: 1 });
    const clean = row("clean", { evidenceConfidence: 0.3, counterCount: 0 });
    expect(ids(sortGapRows([contested, clean], "recommended", 5))).toEqual(["clean", "contested"]);
    // The evidence sort groups by evidence status first; within one status the contested gap comes last.
    const contestedWeak = row("contested-weak", { evidenceConfidence: 0.3, counterCount: 2 });
    const cleanWeak = row("clean-weak", { evidenceConfidence: 0.2, counterCount: 0 });
    expect(ids(sortGapRows([contestedWeak, cleanWeak], "evidence", 5))).toEqual(["clean-weak", "contested-weak"]);
  });

  it("puts confirmed evidence first for the evidence sort", () => {
    expect(ids(sortGapRows(rows, "evidence", 5))).toEqual(["confirmed", "confident", "newest", "ai-only"]);
  });

  it("orders by the shown score for the confidence sort, breaking ties with the legacy AI confidence", () => {
    expect(ids(sortGapRows(rows, "confidence", 5))).toEqual(["confirmed", "confident", "newest", "ai-only"]);
    // New gaps store the LLM placeholder 0, so it cannot outrank an evidence score.
    const placeholder = row("placeholder", { evidenceConfidence: 0.3, confidence: 0 });
    const legacy = row("legacy", { evidenceConfidence: 0.3, confidence: 0.8 });
    const unscored = row("unscored", { evidenceConfidence: null, confidence: 0.9 });
    expect(ids(sortGapRows([unscored, placeholder, legacy], "confidence", 5))).toEqual(["legacy", "placeholder", "unscored"]);
  });

  it("orders by supporting papers, newest first, and AI-only last", () => {
    expect(ids(sortGapRows(rows, "papers", 5))).toEqual(["confident", "confirmed", "newest", "ai-only"]);
    expect(ids(sortGapRows(rows, "newest", 5))[0]).toBe("newest");
    expect(ids(sortGapRows(rows, "ai_only_last", 5))).toEqual(["confirmed", "confident", "newest", "ai-only"]);
  });

  it("ranks a gap without a recorded counting scope after confirmed ones", () => {
    const unscoped = row("unscoped", { evidenceConfidence: 0.95, evidenceScopeSize: null });
    expect(ids(sortGapRows([unscoped, rows[0]!], "evidence", 5))).toEqual(["confirmed", "unscoped"]);
  });

  it("treats a low-sample probe as weak evidence", () => {
    const lowSample = row("low-sample", { evidenceConfidence: 0.9, parentCounts: { a: 1, b: 40 } });
    expect(ids(sortGapRows([lowSample, rows[0]!], "evidence", 5))).toEqual(["confirmed", "low-sample"]);
  });
});

describe("counter-evidence and OpenAlex counts", () => {
  const base = {
    _id: "gap-9",
    topic: "AI education",
    normalizedTopic: "ai education",
    title: "Counter gap",
    description: "desc",
    rationale: "why",
    supportingPaperIds: ["paper-1"],
    confidence: 0.7,
    source: "standalone" as const,
    userId: "user-1",
    status: "active" as const,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
  };
  const papers = new Map([
    ["paper-1", { id: "paper-1", title: "Supports" }],
    ["paper-2", { id: "paper-2", title: "Contradicts", publicationYear: 2023 }],
  ]);

  it("keeps counter papers apart from supporting papers", () => {
    const item = toGapListItem({ ...base, counterPaperIds: ["paper-2"] }, papers);

    expect(item.counterPaperIds).toEqual(["paper-2"]);
    expect(item.counterPapers).toEqual([{ id: "paper-2", title: "Contradicts", publicationYear: 2023 }]);
    expect(item.supportingPapers.map((paper) => paper.id)).toEqual(["paper-1"]);
  });

  it("has no counter papers by default", () => {
    const item = toGapListItem(base, papers);

    expect(item.counterPaperIds).toEqual([]);
    expect(item.counterPapers).toEqual([]);
  });

  it("passes the OpenAlex counts and the richer parent trend through", () => {
    const globalEvidence = { source: "openalex" as const, intersectionCount: 4, parentCounts: { a: 900, b: 700 }, yearFrom: 2020, yearTo: 2024, fetchedAt: "2026-10-16T00:00:00.000Z" };
    const item = toGapListItem({ ...base, globalEvidence, parentTrend: { topic: "AI", growthRatePct: 31.2, cagrPct: 31.2, slope: 4 } }, papers);

    expect(item.globalEvidence).toEqual(globalEvidence);
    expect(item.parentTrend).toEqual({ topic: "AI", growthRatePct: 31.2, cagrPct: 31.2, slope: 4 });
  });

  it("reports missing OpenAlex counts as null and keeps the old trend shape", () => {
    const item = toGapListItem({ ...base, parentTrend: { topic: "AI", growthRatePct: 12 } }, papers);

    expect(item.globalEvidence).toBeNull();
    expect(item.parentTrend).toEqual({ topic: "AI", growthRatePct: 12 });
  });
});
