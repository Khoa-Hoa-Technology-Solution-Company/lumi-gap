import { describe, expect, it } from "vitest";
import { QUALITY_PROJECT_ASSESSMENT_VERSION } from "@trend/shared-types";
import { validateQualityAssessment } from "../quality.assessment.js";
import { buildProjectJudgeInput, validateProjectAssessment, type QualityProjectContext } from "../quality.project.js";
import { ABSTRACT, makeInput, makeJudgeOutput, makePlanRow, makeProjectOutput, makeProjectRow } from "./quality.fixture.js";

const context = (overrides: Partial<QualityProjectContext> = {}): QualityProjectContext => {
  const project = makeProjectRow(), plan = makePlanRow();
  return {
    project: { id: project.id, title: project.title, description: project.description, researchField: project.researchField },
    plan: { version: plan.version, problem: plan.problem, objectives: plan.objectives, questions: plan.questions.map((item) => item.text), scope: plan.scope, methodology: plan.methodology },
    inclusionCriteria: project.inclusionCriteria, exclusionCriteria: project.exclusionCriteria, ...overrides,
  };
};
const reference = () => ({ inputFingerprint: makeInput().inputFingerprint, assessment: validateQualityAssessment(makeJudgeOutput(), makeInput()) });
const build = (overrides: Partial<Parameters<typeof buildProjectJudgeInput>[0]> = {}) => buildProjectJudgeInput({ paper: { title: "Guided feedback for university writing", abstractText: ABSTRACT }, reference: reference(), context: context(), language: "en", ...overrides });

describe("project-mode assessments", () => {
  it("keeps verified links, reuse, tensions and the project's own criteria", () => {
    const result = validateProjectAssessment(makeProjectOutput(), build());
    expect(result).toMatchObject({ version: QUALITY_PROJECT_ASSESSMENT_VERSION, project: { id: makeProjectRow().id }, verdict: "core", screening: { suggestion: "include", criteria: ["Empirical studies of university students"] } });
    expect(result.questionLinks).toHaveLength(1);
    expect(result.reusable[0]?.evidence?.quote).toContain("120 students");
    expect(result.tensions).toHaveLength(1);
    expect(result.sources.map((item) => item.id)).toEqual(["title", "target", "plan"]);
    expect(result.sources[1]).not.toHaveProperty("text");
  });
  it("drops paraphrased plan items and links whose quotes are not in the paper, without failing", () => {
    const raw = makeProjectOutput();
    raw.questionLinks.push({ planItem: "Does guided feedback improve scores?", contribution: "A paraphrased plan question that must be dropped.", evidence: [{ sourceId: "target", quote: "The guided group improved its rubric score by 12%." }] });
    raw.questionLinks.push({ planItem: "Compare guided and unguided feedback", contribution: "Valid plan item, but the quote is invented.", evidence: [{ sourceId: "target", quote: "Unguided feedback had no measurable effect at all." }] });
    raw.questionLinks.push({ planItem: "  Compare guided   and unguided feedback ", contribution: "Valid plan item with whitespace differences only.", evidence: [{ sourceId: "target", quote: "We compare two feedback methods\nwith 120 students." }] });
    raw.questionLinks.push({ planItem: "Compare guided and unguided feedback", contribution: "Quotes from the plan are not paper evidence.", evidence: [{ sourceId: "plan", quote: "Title: Feedback in first-year writing" }] });
    const result = validateProjectAssessment(raw, build());
    expect(result.questionLinks.map((item) => item.planItem)).toEqual(["Does guided feedback improve rubric scores?", "Compare guided and unguided feedback"]);
  });
  it("drops tensions without valid quotes and nulls unverifiable reuse evidence", () => {
    const raw = makeProjectOutput();
    raw.tensions[0]!.evidence = [{ sourceId: "target", quote: "The sample was drawn from secondary schools." }];
    raw.reusable[0]!.evidence = { sourceId: "target", quote: "A validated writing rubric was used." };
    const result = validateProjectAssessment(raw, build());
    expect(result.tensions).toEqual([]);
    expect(result.reusable[0]?.evidence).toBeNull();
  });
  it("withholds an include/exclude suggestion that does not quote the project's criteria", () => {
    const raw = makeProjectOutput();
    raw.screening.criteria = ["Peer-reviewed empirical work"];
    const result = validateProjectAssessment(raw, build());
    expect(result.screening).toMatchObject({ suggestion: "undecided", criteria: [] });
  });
  it("explains the missing plan and criteria instead of inventing links", () => {
    const input = build({ context: context({ plan: null, inclusionCriteria: [], exclusionCriteria: [] }) });
    const result = validateProjectAssessment(makeProjectOutput(), input);
    expect(result.questionLinks).toEqual([]);
    expect(result.screening.suggestion).toBe("include");
    expect(result.limitations.join(" ")).toMatch(/no problem, objectives or questions/);
    expect(result.limitations.join(" ")).toMatch(/no inclusion or exclusion criteria/);
  });
  it("rejects a malformed answer as a structural failure", () => {
    const raw = makeProjectOutput();
    raw.verdict = "maybe";
    expect(() => validateProjectAssessment(raw, build())).toThrow();
    expect(() => validateProjectAssessment({ ...makeProjectOutput(), actions: [] }, build())).toThrow();
  });
  it("fingerprints paper, reference, plan, criteria and language", () => {
    const base = build().inputFingerprint;
    expect(base).toMatch(/^[a-f0-9]{64}$/);
    expect(build().inputFingerprint).toBe(base);
    expect(build({ paper: { title: "Guided feedback for university writing", abstractText: `${ABSTRACT} More.` } }).inputFingerprint).not.toBe(base);
    expect(build({ reference: null }).inputFingerprint).not.toBe(base);
    expect(build({ reference: { ...reference(), inputFingerprint: "other" } }).inputFingerprint).not.toBe(base);
    expect(build({ context: context({ plan: { ...context().plan!, version: 4 } }) }).inputFingerprint).not.toBe(base);
    expect(build({ context: context({ exclusionCriteria: ["Non-English studies"] }) }).inputFingerprint).not.toBe(base);
    expect(build({ language: "vi" }).inputFingerprint).not.toBe(base);
  });
  it("gives the model the plan items and the reference reading card", () => {
    const input = build();
    expect(input.planItems).toEqual(["How feedback type affects first-year writing quality", "Compare guided and unguided feedback", "Does guided feedback improve rubric scores?"]);
    expect(input.prompt).toContain("Does guided feedback improve rubric scores?");
    expect(input.prompt).toContain("Comparison of two feedback methods");
  });
});

describe("lenient project output", () => {
  it("wraps single objects and trims long lists before verbatim checks", () => {
    const raw = makeProjectOutput() as unknown as Record<string, any>;
    raw.questionLinks = raw.questionLinks[0];
    raw.tensions[0].evidence = raw.tensions[0].evidence[0];
    raw.reusable[0].evidence = [raw.reusable[0].evidence];
    raw.screening.criteria = "Empirical studies of university students";
    raw.actions = Array.from({ length: 6 }, () => raw.actions[0]);
    const result = validateProjectAssessment(raw, build());
    expect(result.questionLinks).toHaveLength(1);
    expect(result.tensions).toHaveLength(1);
    expect(result.reusable[0]?.evidence?.quote).toContain("120 students");
    expect(result.screening.criteria).toEqual(["Empirical studies of university students"]);
    expect(result.actions).toHaveLength(3);
  });
});
