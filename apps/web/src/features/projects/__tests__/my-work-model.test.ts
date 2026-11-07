import { describe, expect, it } from "vitest";
import type { ScreeningWorkspaceSummary } from "@trend/shared-types";
import { evaluationGroupLabel, matchesEvaluationHistory, myWorkTasks, personalEvaluations, screeningTaskGroup, screeningWorkLink } from "../my-work-model";
const base: ScreeningWorkspaceSummary = {
  myActiveClaims: [], pendingConsensus: [], pendingDiscussions: [], pendingAdjudications: [],
  myProposalsCount: 0, recentProposals: [], eligibleQueueCount: 0, nextEligiblePaperId: null,
  discoveryGoal: { enabled: false, target: 2, period: "WEEK", paused: false, currentCount: 0, remaining: 2 },
  capacityAdvice: { queueStatus: "NORMAL", message: "" },
};
describe("my work actions", () => {
  it("deduplicates discussion and confirmation for one paper", () => {
    const common = { paperId: "p", roundId: "r", title: "Study" };
    expect(myWorkTasks({ ...base, pendingConsensus: [{ ...common, agreementId: "a", decision: "INCLUDE", reason: "Reason", proposedByName: "Peer" }], pendingDiscussions: [{ ...common, status: "NEEDS_RESOLUTION" }] }, false)).toMatchObject([{ kind: "CONSENSUS", paperId: "p" }]);
  });
  it("removes passive adjudication tracking from actionable work", () => {
    const dispute = { paperId: "p", roundId: "r", title: "Study", phase: "TITLE_ABSTRACT" as const, status: "ADJUDICATING" as const, caseStatus: "COLLECTING", myDecision: "INCLUDE" as const, needsMyStatement: false };
    expect(myWorkTasks({ ...base, myTrackedDisputes: [dispute], pendingDiscussions: [{ ...dispute }] }, false)).toEqual([]);
  });
  it("keeps independent adjudication and unfinished claims as actionable work", () => {
    expect(myWorkTasks({ ...base, pendingAdjudications: [{ paperId: "p", roundId: "r", title: "Adjudicate", status: "ADJUDICATING" }], myActiveClaims: [{ paperId: "other", roundId: "other-r", assignmentId: "a", title: "Review", phase: "TITLE_ABSTRACT", publicationYear: null, dueAt: null, expiresInSeconds: null, canExtend: false, canRelease: true }] }, false).map(t => t.kind)).toEqual(["ADJUDICATION", "REVIEW"]);
  });
  it("does not assign work in read-only projects", () => {
    expect(myWorkTasks({ ...base, pendingAdjudications: [{ paperId: "p", roundId: "r", title: "Study", status: "ADJUDICATING" }] }, true)).toEqual([]);
    expect(myWorkTasks({ ...base, readOnly: true, pendingAdjudications: [{ paperId: "p", roundId: "r", title: "Study", status: "ADJUDICATING" }] }, false)).toEqual([]);
  });
  it("keeps both a pending statement and the submitted personal ballot, with independent counts", () => {
    const evaluation = { paperId: "p", roundId: "r", title: "Study", phase: "TITLE_ABSTRACT" as const, publicationYear: null, journalName: null, myDecision: "INCLUDE" as const, submittedAt: "2026-11-01", groupStatus: "ADJUDICATING" as const, finalDecision: null, isAdjudicated: false, resolverName: null, decidedAt: null };
    const data = { ...base, myEvaluations: [evaluation], myTrackedDisputes: [{ ...evaluation, status: "ADJUDICATING" as const, caseStatus: "COLLECTING", needsMyStatement: true }] };
    expect(myWorkTasks(data, false)).toMatchObject([{ kind: "STATEMENT", roundId: "r" }]);
    expect(personalEvaluations(data)).toEqual([evaluation]);
    expect(matchesEvaluationHistory(evaluation, "PENDING")).toBe(true);
    expect(matchesEvaluationHistory(evaluation, "DECIDED")).toBe(false);
    expect(evaluationGroupLabel({ ...evaluation, groupStatus: "INCLUDED", acceptedForAnalysis: false })).toBe("Qua vòng");
    expect(evaluationGroupLabel({ ...evaluation, groupStatus: "INCLUDED", acceptedForAnalysis: true })).toBe("Chấp nhận bài");
    expect(evaluationGroupLabel({ ...evaluation, caseStatus: "WAITING_ASSIGNMENT" })).toBe("Chờ phân công");
  });
  it("omits expired claims and statements even before the next poll", () => {
    const deadline = "2000-01-01T00:00:00Z";
    expect(myWorkTasks({ ...base, myActiveClaims: [{ paperId: "p", roundId: "r", assignmentId: "a", title: "Expired", phase: "TITLE_ABSTRACT", publicationYear: null, dueAt: deadline, expiresInSeconds: 0, canExtend: false, canRelease: false }], myTrackedDisputes: [{ paperId: "p2", roundId: "r2", title: "Expired statement", phase: "TITLE_ABSTRACT", status: "ADJUDICATING", caseStatus: "COLLECTING", needsMyStatement: true, myDecision: "INCLUDE", deadline }] }, false)).toEqual([]);
  });
  it("separates coordination tasks and generates refreshable links for every action", () => {
    const [task] = myWorkTasks({ ...base, pendingAdjudications: [{ paperId: "p", roundId: "r", title: "Assign", status: "ADJUDICATING", caseStatus: "WAITING_ASSIGNMENT" }] }, false);
    expect(task?.kind).toBe("COORDINATION");
    expect(screeningTaskGroup(task!)).toBe("RESOLUTION");
    for (const section of ["review", "discussion", "history", "statement", "decision", "coordination"] as const) {
      const url = new URL(screeningWorkLink("project", task!, section), "http://localhost");
      const dossier = ["statement", "decision", "coordination"].includes(section);
      expect(url.searchParams.get(dossier ? "screeningRound" : "round")).toBe("r");
      expect(url.searchParams.get(dossier ? "screeningPaper" : "paper")).toBe("p");
      expect(url.searchParams.get(dossier ? "screeningSection" : "section")).toBe(section);
    }
  });
});
