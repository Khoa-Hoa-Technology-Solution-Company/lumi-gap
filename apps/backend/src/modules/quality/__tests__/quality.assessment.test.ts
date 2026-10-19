import { describe, expect, it } from "vitest";
import { getQualityRubric } from "@trend/shared-types";
import { qualityScores, validateQualityAssessment } from "../quality.assessment.js";
import { buildQualityJudgeInput, QUALITY_MAX_EVIDENCE } from "../quality.prompt.js";
import { ABSTRACT, makeInput, makeJudgeOutput } from "./quality.fixture.js";

describe("evidence-grounded quality assessments", () => {
  it("keeps exact evidence and computes a decimal mean from all three criteria", () => {
    const result = validateQualityAssessment(makeJudgeOutput(), makeInput());
    expect(qualityScores(result)).toEqual({ relevance: 4, groundedness: 3, completeness: 3, overall: 3.3 });
    expect(result.criteria[0]?.evidence[0]?.quote).toContain("120 students");
    expect(result.sources[1]).not.toHaveProperty("text");
    expect(result.rubric.criteria[0]?.anchors).toHaveLength(5);
  });
  it.each(["invented-source", "invented-quote", "truncated-quote", "title-only"])("rejects %s evidence instead of publishing unsupported scores", (reason) => {
    const raw = makeJudgeOutput();
    const input = makeInput();
    if (reason === "invented-source") raw.criteria[0]!.evidence[0]!.sourceId = "unknown";
    if (reason === "invented-quote") raw.criteria[0]!.evidence[0]!.quote = "The randomized trial proves the method works everywhere.";
    if (reason === "truncated-quote") input.sources[1]!.text = "Only the beginning was supplied.";
    if (reason === "title-only") raw.criteria[0]!.evidence = [{ sourceId: "title", quote: "Guided feedback for university writing" }];
    expect(() => validateQualityAssessment(raw, input)).toThrow();
  });
  it("allows line wrapping differences without accepting changed wording", () => {
    const raw = makeJudgeOutput();
    raw.criteria[0]!.evidence[0]!.quote = "We compare two feedback methods\nwith 120 students.";
    expect(() => validateQualityAssessment(raw, makeInput())).not.toThrow();
  });
  it.each(["report", "gap"] as const)("requires actual comparison evidence for %s groundedness", (kind) => {
    const raw = makeJudgeOutput();
    expect(() => validateQualityAssessment(raw, makeInput(kind))).toThrow("comparison evidence");
    raw.criteria[1]!.evidence.push({ sourceId: "evidence-1", quote: "We compare two feedback methods with 120 students." });
    if (kind === "report") raw.criteria[2]!.evidence.push({ sourceId: "evidence-1", quote: "We compare two feedback methods with 120 students." });
    expect(validateQualityAssessment(raw, makeInput(kind)).criteria[1]?.score).toBe(3);
  });
  it.each(["report", "gap"] as const)("withholds %s groundedness and overall when comparison abstracts are absent", (kind) => {
    const input = buildQualityJudgeInput({ kind, title: "Feedback comparison", content: ABSTRACT, evidence: [{ title: "Title without abstract" }] });
    const result = validateQualityAssessment(makeJudgeOutput(), input);
    expect(result.criteria[1]).toMatchObject({ score: null, status: "insufficient_evidence" });
    expect(result.criteria[1]?.missingEvidence.join(" ")).toContain("No supporting paper abstracts");
    expect(result.criteria[2]?.score).toBe(kind === "report" ? null : 3);
    expect(qualityScores(result).overall).toBeNull();
  });
  it("demands an explanation of missing information for a null score", () => {
    const raw = makeJudgeOutput(); raw.criteria[0]!.score = null; raw.criteria[0]!.missingEvidence = [];
    expect(() => validateQualityAssessment(raw, makeInput())).toThrow("what is missing");
  });
  it.each([0, 6, 2.5, "4"])("rejects invalid score %s", (score) => {
    const raw = makeJudgeOutput(); (raw.criteria[0] as { score: unknown }).score = score;
    expect(() => validateQualityAssessment(raw, makeInput())).toThrow();
  });
  it("rejects duplicate criterion IDs and missing practical actions", () => {
    const raw = makeJudgeOutput(); raw.criteria[1]!.id = "relevance";
    expect(() => validateQualityAssessment(raw, makeInput())).toThrow("Duplicate");
    const noActions = makeJudgeOutput(); noActions.actions = [];
    expect(() => validateQualityAssessment(noActions, makeInput())).toThrow();
  });
  it("records incomplete reading coverage and caps the corpus supplied to the model", () => {
    const input = buildQualityJudgeInput({ kind: "report", title: "Report", content: ABSTRACT.repeat(200), evidence: Array.from({ length: 30 }, (_, index) => ({ id: String(index), title: "Trial", abstractText: ABSTRACT.repeat(20) })) });
    expect(input.sources.filter((item) => item.kind === "evidence_abstract")).toHaveLength(QUALITY_MAX_EVIDENCE);
    const raw = makeJudgeOutput(); raw.criteria[1]!.evidence.push({ sourceId: "evidence-1", quote: "We compare two feedback methods with 120 students." }); raw.criteria[2]!.evidence.push({ sourceId: "evidence-1", quote: "We compare two feedback methods with 120 students." });
    const result = validateQualityAssessment(raw, input);
    expect(result.limitations.join(" ")).toContain("12/30");
    expect(result.limitations.join(" ")).toContain("truncated");
  });
  it("changes fingerprints for content or language changes", () => {
    const base = { kind: "paper" as const, title: "Trial", content: ABSTRACT };
    const input = buildQualityJudgeInput(base);
    expect(input.inputFingerprint).not.toBe(buildQualityJudgeInput({ ...base, content: `${ABSTRACT} Revised.` }).inputFingerprint);
    expect(input.inputFingerprint).not.toBe(buildQualityJudgeInput({ ...base, language: "vi" }).inputFingerprint);
  });
  it("publishes target-specific, translated anchors before generation", () => {
    expect(getQualityRubric("paper", "vi").criteria[0]?.title).toBe("Độ rõ của vấn đề nghiên cứu");
    expect(getQualityRubric("gap").criteria[2]?.title).toBe("Actionability and feasibility");
    expect(getQualityRubric("report").criteria[2]?.title).toBe("Coverage and synthesis");
  });
});
