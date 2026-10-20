import type { PaperReadingContext, QualityEvaluation, QualityProjectEvaluation } from "@trend/shared-types";
import { makeQualityEvaluation } from "./quality-evaluation.fixture";

/** A current (quality-v3) paper result: the legacy fixture plus the reading card and guidance. */
export function makeReadingEvaluation(): QualityEvaluation {
  const evaluation = makeQualityEvaluation();
  evaluation.details!.facts = {
    studyDesign: { status: "reported", value: "Randomised comparison of two feedback methods", evidence: { sourceId: "target", quote: "We compare two feedback methods with 120 students." } },
    sampleOrData: { status: "reported", value: "120 university students", evidence: { sourceId: "target", quote: "120 students" } },
    setting: { status: "not_reported", value: null, evidence: null },
    measures: { status: "not_reported", value: null, evidence: null },
    keyResults: [{ status: "reported", value: "12% improvement in writing scores", evidence: { sourceId: "target", quote: "a 12% improvement" } }],
    authorStatedLimitations: [],
  };
  evaluation.details!.guidance = {
    purposes: [{ purpose: "method", explanation: "Shows how guided feedback was compared in a classroom." }, { purpose: "counterpoint", explanation: "Reports a modest effect from one semester." }],
    audience: "newcomer", audienceReason: "Plain design and a single outcome.", caution: "Group allocation is not described, so the 12% gain may not be causal.",
  };
  return evaluation;
}

export function makeProjectEvaluation(overrides: Partial<QualityProjectEvaluation["assessment"]> = {}): QualityProjectEvaluation {
  return {
    targetKind: "paper", targetId: "paper-a", projectId: "project-1", model: "qa-model", evaluatedAt: "2026-10-19T04:00:00.000Z", freshness: "current",
    assessment: {
      version: "quality-project-v1", project: { id: "project-1", title: "Feedback in writing classes" }, verdict: "core",
      verdictReason: "It tests the same feedback intervention the plan proposes.",
      questionLinks: [{ planItem: "Does guided feedback improve essay quality?", contribution: "Reports a 12% gain after one semester.", evidence: [{ sourceId: "target", quote: "a 12% improvement" }] }],
      reusable: [{ kind: "method", description: "Two-arm comparison with a shared rubric.", evidence: { sourceId: "target", quote: "We compare two feedback methods" } }],
      tensions: [{ description: "Only one university, while the plan targets several.", evidence: [{ sourceId: "target", quote: "120 students" }] }],
      screening: { suggestion: "include", reason: "Meets the inclusion rule on intervention studies.", criteria: ["Studies an intervention on university writing"] },
      actions: [{ criterionId: "relevance", priority: "high", action: "Extract the rubric used for essay scoring.", why: "The plan needs a comparable measure.", expectedOutcome: "A rubric table." }],
      limitations: ["Abstract only."], sources: [{ id: "target", kind: "abstract", title: "Guided feedback", charactersRead: 211, truncated: false }],
      ...overrides,
    },
  };
}

export function makeReadingContext(): PaperReadingContext {
  return {
    paperId: "paper-a", requestedTopic: "writing feedback",
    trend: {
      topic: "Writing feedback", source: "requested", totalPapers: 1240, growthRatePct: 14.2, cagr3yPct: 9.5, momentum: 0.31, paperYear: 2022, partialYear: null,
      yearlyBreakdown: [2019, 2020, 2021, 2022, 2023, 2024].map((year, index) => ({ year, count: 80 + index * 25 })),
    },
    related: [
      { id: "paper-b", title: "Automated feedback at scale", publicationYear: 2024, citationCount: 12, similarity: 0.8, sharedTopics: ["Writing feedback"], reason: "same_topic_newer" },
      { id: "paper-c", title: "A classic study of peer review", publicationYear: 2010, citationCount: 950, similarity: 0.7, sharedTopics: [], reason: "same_topic_most_cited" },
    ],
    computedAt: "2026-10-19T04:00:00.000Z",
  };
}
