import { describe, expect, it } from "vitest";
import { canAccessGap, isGapLowSample, sortGapRows, toGapListItem, type GapSortRow } from "../gap-presenter.js";

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

  it("ranks by evidence score, falling back to AI confidence", () => {
    expect(ids(sortGapRows(rows, "recommended", 5))).toEqual(["ai-only", "confirmed", "confident", "newest"]);
  });

  it("puts confirmed evidence first for the evidence sort", () => {
    expect(ids(sortGapRows(rows, "evidence", 5))).toEqual(["confirmed", "confident", "newest", "ai-only"]);
  });

  it("orders by the AI's own confidence for the confidence sort", () => {
    expect(ids(sortGapRows(rows, "confidence", 5))).toEqual(["confident", "ai-only", "confirmed", "newest"]);
  });

  it("orders by supporting papers, newest first, and AI-only last", () => {
    expect(ids(sortGapRows(rows, "papers", 5))).toEqual(["confident", "confirmed", "ai-only", "newest"]);
    expect(ids(sortGapRows(rows, "newest", 5))[0]).toBe("newest");
    expect(ids(sortGapRows(rows, "ai_only_last", 5))).toEqual(["confirmed", "confident", "newest", "ai-only"]);
  });

  it("treats a low-sample probe as weak evidence", () => {
    const lowSample = row("low-sample", { evidenceConfidence: 0.9, parentCounts: { a: 1, b: 40 } });
    expect(ids(sortGapRows([lowSample, rows[0]!], "evidence", 5))).toEqual(["confirmed", "low-sample"]);
  });
});
