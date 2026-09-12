import { describe, expect, it } from "vitest";
import { mergeReportEvidence, type ReportEvidencePaper } from "../report.evidence.js";

function paper(id: string, source: ReportEvidencePaper["source"], score: number): ReportEvidencePaper {
  return {
    id,
    title: `Paper ${id}`,
    abstractText: `Abstract ${id}`,
    publicationYear: 2024,
    journalName: "Test Journal",
    citationCount: 10,
    authorNames: ["A. Researcher"],
    score,
    source,
  };
}

describe("mergeReportEvidence", () => {
  it("pins selected papers first, keeps selected order, then fills with retrieved papers", () => {
    const selected = [paper("s2", "selected", 1), paper("s1", "selected", 1)];
    const retrieved = [paper("r1", "retrieved", 0.91), paper("r2", "retrieved", 0.84)];

    const merged = mergeReportEvidence({ selected, retrieved, maxPapers: 4 });

    expect(merged.map((p) => p.id)).toEqual(["s2", "s1", "r1", "r2"]);
  });

  it("dedupes retrieved papers already selected and enforces the evidence cap", () => {
    const selected = [paper("s1", "selected", 1)];
    const retrieved = [
      paper("s1", "retrieved", 0.98),
      paper("r1", "retrieved", 0.9),
      paper("r2", "retrieved", 0.8),
    ];

    const merged = mergeReportEvidence({ selected, retrieved, maxPapers: 2 });

    expect(merged).toHaveLength(2);
    expect(merged.map((p) => [p.id, p.source])).toEqual([
      ["s1", "selected"],
      ["r1", "retrieved"],
    ]);
  });
});
