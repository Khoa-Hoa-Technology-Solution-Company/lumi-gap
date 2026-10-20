import { describe, expect, it } from "vitest";
import { groundedDiscoveryCandidates } from "../project-gap-candidates.js";
import { PROJECT_DISCOVERY_GAPS_SYSTEM, buildGapsPrompt } from "../gaps.prompt.js";

const papers = [{ passages: [{ id: "a-1", pageNumber: null, text: "The study was limited to a single institution. Further replication is needed." }] }, { passages: [{ id: "b-1", pageNumber: null, text: "A longitudinal follow-up is necessary to assess retention." }] }];
const candidate = {
  title: "Replicate learning outcomes across institutions", description: "The selected sample does not establish transfer to other institutions.",
  rationale: "A single institution limits transfer [1].", scope: "Selected educational setting",
  suggestedResearchQuestion: "Do learning outcomes replicate across institutions?", observedLimitation: "The source describes one institution.",
  missingEvidence: "A multi-institution replication is needed.", assumptions: "Check other literature before treating this as a gap.",
  supportingEvidence: [1], sourceAnchors: [{ paperNumber: 1, chunkId: "a-1", quote: "limited to a single institution" }], confidence: 0.99,
};
describe("grounded project directions", () => {
  it("keeps a source-linked question as an unvalidated candidate", () => {
    const [result] = groundedDiscoveryCandidates({ gaps: [candidate] }, papers);
    expect(result?.suggestedResearchQuestion).toBe(candidate.suggestedResearchQuestion);
    expect(result?.confidence).toBe(0);
  });
  it("rejects fabricated quotes, swapped sources and unsupported paper references", () => {
    for (const sourceAnchors of [[{ paperNumber: 1, chunkId: "a-1", quote: "This work has no clinical application." }], [{ paperNumber: 1, chunkId: "b-1", quote: "A longitudinal follow-up is necessary" }], [{ paperNumber: 3, chunkId: "a-1", quote: "limited to a single institution" }]]) {
      expect(groundedDiscoveryCandidates({ gaps: [{ ...candidate, sourceAnchors }] }, papers)).toEqual([]);
    }
  });
  it("does not claim multi-paper support without source anchors and citations for every paper", () => {
    expect(groundedDiscoveryCandidates({ gaps: [{ ...candidate, supportingEvidence: [1, 2] }] }, papers)).toEqual([]);
    expect(groundedDiscoveryCandidates({ gaps: [{ ...candidate, rationale: "Unsupported explanation with no citation" }] }, papers)).toEqual([]);
  });
  it("allows an empty outcome and drops unstructured or duplicate candidates", () => {
    expect(groundedDiscoveryCandidates({ gaps: [] }, papers)).toEqual([]);
    expect(groundedDiscoveryCandidates({ gaps: [null, { ...candidate, suggestedResearchQuestion: "" }, candidate, candidate] }, papers)).toHaveLength(1);
    expect(() => groundedDiscoveryCandidates({ gaps: [{ title: "Malformed provider output" }] }, papers)).toThrow("no structured research directions");
  });
  it("uses project context as context and tells the model not to force connections", () => {
    expect(buildGapsPrompt("Project", [], undefined, true, { summary: "Learning outcomes" })).toContain("untrusted context, not source evidence");
    expect(PROJECT_DISCOVERY_GAPS_SYSTEM).toContain("never fill a quota");
    expect(PROJECT_DISCOVERY_GAPS_SYSTEM).toContain("Do not invent an interdisciplinary connection");
  });
});
