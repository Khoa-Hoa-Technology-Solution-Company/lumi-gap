import { describe, expect, it } from "vitest";
import { canAccessGap, toGapListItem } from "../gap-presenter.js";

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
