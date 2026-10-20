import { describe, expect, it } from "vitest";
import { getQualityRubric } from "@trend/shared-types";
import { QualityStructureError, qualityScores, validateQualityAssessment } from "../quality.assessment.js";
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
  it.each(["invented-source", "invented-quote", "truncated-quote", "title-only"])("withdraws the score for %s evidence instead of publishing it or failing everything", (reason) => {
    const raw = makeJudgeOutput();
    const input = makeInput();
    if (reason === "invented-source") raw.criteria[0]!.evidence[0]!.sourceId = "unknown";
    if (reason === "invented-quote") raw.criteria[0]!.evidence[0]!.quote = "The randomized trial proves the method works everywhere.";
    if (reason === "truncated-quote") input.sources[1]!.text = "Only the beginning was supplied.";
    if (reason === "title-only") raw.criteria[0]!.evidence = [{ sourceId: "title", quote: "Guided feedback for university writing" }];
    const result = validateQualityAssessment(raw, input);
    expect(result.criteria[0]).toMatchObject({ score: null, status: "insufficient_evidence" });
    expect(result.criteria[0]?.missingEvidence[0]).toContain("withdrawn");
    expect(result.criteria[0]?.evidence.every((item) => item.sourceId !== "unknown" && !item.quote.includes("randomized"))).toBe(true);
    expect(qualityScores(result).overall).toBeNull();
    if (reason !== "truncated-quote") expect(result.criteria[1]).toMatchObject({ score: 3, status: "assessed" });
  });
  it("drops one bad quote but keeps the score when another verified quote remains", () => {
    const raw = makeJudgeOutput();
    raw.criteria[0]!.evidence.push({ sourceId: "target", quote: "An invented sentence that is not in the abstract." });
    const result = validateQualityAssessment(raw, makeInput());
    expect(result.criteria[0]).toMatchObject({ score: 4, status: "assessed" });
    expect(result.criteria[0]?.evidence).toEqual([{ sourceId: "target", quote: "We compare two feedback methods with 120 students." }]);
  });
  it("allows line wrapping differences without accepting changed wording", () => {
    const raw = makeJudgeOutput();
    raw.criteria[0]!.evidence[0]!.quote = "We compare two feedback methods\nwith 120 students.";
    expect(() => validateQualityAssessment(raw, makeInput())).not.toThrow();
  });
  it.each(["report", "gap"] as const)("requires actual comparison evidence for %s groundedness", (kind) => {
    const raw = makeJudgeOutput();
    const downgraded = validateQualityAssessment(raw, makeInput(kind));
    expect(downgraded.criteria[1]).toMatchObject({ score: null, status: "insufficient_evidence" });
    expect(downgraded.criteria[1]?.missingEvidence[0]).toContain("supporting abstract");
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
    expect(() => validateQualityAssessment(raw, makeInput())).toThrow(QualityStructureError);
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
  it("does not repeat the forced missing-support note when the model already said the same", () => {
    const input = buildQualityJudgeInput({ kind: "gap", title: "Feedback gap", content: ABSTRACT, evidence: [] });
    const raw = makeJudgeOutput();
    raw.criteria[1]!.missingEvidence = ["No supporting abstracts were provided to compare the claimed gap against.", "No supporting paper abstracts were supplied for comparison; obtain and read the supporting literature.", "The allocation procedure is not reported."];
    const notes = validateQualityAssessment(raw, input).criteria[1]!.missingEvidence;
    expect(notes.filter((note) => /abstracts/i.test(note))).toHaveLength(1);
    expect(notes).toContain("The allocation procedure is not reported.");
  });
  it("keeps verified facts, marks unverifiable values as unverified and drops unverified list items", () => {
    const raw = makeJudgeOutput();
    raw.facts.measures = { status: "reported", value: "Writing rubric", evidence: { sourceId: "target", quote: "Writing quality was measured with a validated rubric." } };
    raw.facts.setting = { status: "reported", value: "One university", evidence: null };
    raw.facts.keyResults.push({ status: "reported", value: "Invented effect", evidence: { sourceId: "target", quote: "Students doubled their grades in every course." } });
    raw.facts.authorStatedLimitations.push({ status: "not_reported", value: null, evidence: null });
    const { facts } = validateQualityAssessment(raw, makeInput());
    expect(facts?.studyDesign).toMatchObject({ status: "reported", evidence: { quote: "We compare two feedback methods with 120 students." } });
    expect(facts?.measures).toEqual({ status: "unverified", value: "Writing rubric", evidence: null });
    expect(facts?.setting).toEqual({ status: "unverified", value: "One university", evidence: null });
    expect(facts?.keyResults).toHaveLength(1);
    expect(facts?.authorStatedLimitations).toHaveLength(1);
  });
  it("normalizes not_reported facts and caps fact lists at four", () => {
    const raw = makeJudgeOutput();
    raw.facts.measures = { status: "not_reported", value: "something guessed", evidence: { sourceId: "target", quote: "We compare two feedback methods with 120 students." } };
    raw.facts.keyResults = Array.from({ length: 6 }, () => ({ status: "reported", value: "Improvement", evidence: { sourceId: "target", quote: "The guided group improved its rubric score by 12%." } }));
    const { facts } = validateQualityAssessment(raw, makeInput());
    expect(facts?.measures).toEqual({ status: "not_reported", value: null, evidence: null });
    expect(facts?.keyResults).toHaveLength(4);
  });
  it("returns reading guidance with unique purposes and an optional caution", () => {
    const raw = makeJudgeOutput();
    raw.guidance.purposes = [raw.guidance.purposes[0]!, { ...raw.guidance.purposes[0]! }, { purpose: "results" as "method", explanation: "It reports a concrete 12% rubric gain to compare against." }];
    raw.guidance.caution = "  " as string | null;
    const { guidance } = validateQualityAssessment(raw, makeInput());
    expect(guidance?.purposes.map((item) => item.purpose)).toEqual(["method", "results"]);
    expect(guidance?.caution).toBeNull();
  });
  it("treats a paper answer without the reading card as a structural failure", () => {
    const raw: Record<string, unknown> = makeJudgeOutput();
    delete raw.facts;
    expect(() => validateQualityAssessment(raw, makeInput())).toThrow();
  });
  it.each(["report", "gap"] as const)("keeps the %s assessment shape without facts or guidance", (kind) => {
    const raw = makeJudgeOutput();
    raw.criteria[1]!.evidence.push({ sourceId: "evidence-1", quote: "We compare two feedback methods with 120 students." });
    raw.criteria[2]!.evidence.push({ sourceId: "evidence-1", quote: "We compare two feedback methods with 120 students." });
    const result = validateQualityAssessment(raw, makeInput(kind));
    expect(result).not.toHaveProperty("facts");
    expect(result).not.toHaveProperty("guidance");
  });
  it("asks for the reading card only in the paper prompt", () => {
    expect(makeInput().system).toContain("FACTS");
    expect(makeInput("report").system).not.toContain("FACTS");
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

describe("lenient normalization of model output", () => {
  it("repairs small shape slips instead of failing the evaluation", () => {
    const raw = makeJudgeOutput() as unknown as Record<string, any>;
    raw.facts.authorStatedLimitations = raw.facts.authorStatedLimitations[0];
    raw.criteria[0].evidence = Array.from({ length: 5 }, () => ({ sourceId: "target", quote: "We compare two feedback methods with 120 students." }));
    delete raw.criteria[1].improvement;
    raw.facts.studyDesign = "Two-group comparison";
    raw.limitations = "The abstract alone cannot establish whether the comparison controls for prior writing ability.";
    raw.criteria[2].missingEvidence = "The allocation procedure is not reported.";
    const result = validateQualityAssessment(raw, makeInput());
    expect(result.facts?.authorStatedLimitations).toHaveLength(1);
    expect(result.criteria[0]?.evidence).toHaveLength(4);
    expect(result.criteria[1]?.improvement).toBe("");
    expect(result.facts?.studyDesign).toEqual({ status: "unverified", value: "Two-group comparison", evidence: null });
    expect(result.criteria[2]?.missingEvidence).toEqual(["The allocation procedure is not reported."]);
  });
  it("wraps a single action object and accepts one action (depth is a prompt instruction only)", () => {
    const raw = makeJudgeOutput() as unknown as Record<string, any>;
    raw.actions = raw.actions[0];
    raw.researchQuestions = raw.researchQuestions.slice(0, 1);
    const result = validateQualityAssessment(raw, makeInput());
    expect(result.actions).toHaveLength(1);
    expect(result.researchQuestions).toHaveLength(1);
  });
  it("infers a criterionId the model omitted on later items (gemini-3.5-flash-lite output shape)", () => {
    const raw = makeJudgeOutput() as unknown as Record<string, any>;
    // Exactly what the real model returned: criterionId missing on the 2nd action and 2nd question.
    delete raw.actions[1].criterionId;
    delete raw.researchQuestions[1].criterionId;
    const result = validateQualityAssessment(raw, makeInput());
    expect(result.actions).toHaveLength(2);
    expect(result.researchQuestions).toHaveLength(2);
    // Scores are relevance 4, groundedness 3, completeness 3: the lowest-scored criterion is groundedness.
    expect(result.actions.find((item) => item.action.startsWith("Note the single"))?.criterionId).toBe("groundedness");
    expect(result.researchQuestions[1]?.criterionId).toBe("groundedness");
  });
  it("prefers a criterion the model could not assess, and fixes invalid labels and priorities", () => {
    const raw = makeJudgeOutput() as unknown as Record<string, any>;
    raw.criteria[2].score = null;
    raw.actions[1].criterionId = "clarity";
    raw.actions[1].priority = "HIGH";
    const result = validateQualityAssessment(raw, makeInput());
    expect(result.actions.find((item) => item.action.startsWith("Note the single"))).toMatchObject({ criterionId: "completeness", priority: "high" });
  });
  it("drops an action or question that has lost its text, keeping the others", () => {
    const raw = makeJudgeOutput() as unknown as Record<string, any>;
    delete raw.actions[1].expectedOutcome;
    raw.researchQuestions[1].question = "";
    const result = validateQualityAssessment(raw, makeInput());
    expect(result.actions).toHaveLength(1);
    expect(result.researchQuestions).toHaveLength(1);
    raw.actions = [{ criterionId: "relevance" }];
    expect(() => validateQualityAssessment(raw, makeInput())).toThrow();
  });
  it("still rejects output that has no usable shape", () => {
    expect(() => validateQualityAssessment("not json", makeInput())).toThrow();
    expect(() => validateQualityAssessment({ summary: "Something useful here." }, makeInput())).toThrow();
  });
  it("asks for result coverage, translated labels and review-aware grounding in the paper prompt", () => {
    const system = makeInput().system;
    expect(system).toContain("EVERY distinct result");
    expect(system).toContain("Bài tổng quan");
    expect(system).toMatch(/survey/i);
    expect(system).toContain("2–4 prioritized");
    expect(system).toContain("2–3 useful follow-up research questions");
  });
});
