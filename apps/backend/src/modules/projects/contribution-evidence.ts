import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ContributionArtifactLink } from "@trend/shared-types";
import type { WorkspaceDb } from "./workspace-access.js";
import { AppError } from "../../common/exceptions/app-error.js";

/** Internal fingerprint only. A matching digest checks provenance, not scientific quality. */
export async function contributionEvidenceManifest(tx: WorkspaceDb, projectId: string, refs: ContributionArtifactLink[]) {
  return Promise.all(refs.map(async ref => {
    let source: unknown;
    switch (ref.kind) {
      case "TASK": source = await tx.projectTask.findFirst({ where: { id: ref.id, projectId } }); break;
      case "MANUSCRIPT_SNAPSHOT": source = await tx.manuscriptSnapshot.findFirst({ where: { id: ref.id, projectId } }); break;
      case "MANUSCRIPT": source = await tx.draftWorkspace.findFirst({ where: { id: ref.id, projectId } }); break;
      case "REPORT": source = await tx.report.findFirst({ where: { id: ref.id, projectId } }); break;
      case "EVIDENCE": source = await tx.projectEvidenceItem.findFirst({ where: { id: ref.id, projectId } }); if (!source) { const record = await tx.gapEvidenceRecord.findUnique({ where: { id: ref.id } }); if (record && await tx.researchGap.findFirst({ where: { id: record.gapId, projectId } })) source = record; } break;
      case "MENTOR_FEEDBACK": source = await tx.projectDiscussion.findFirst({ where: { id: ref.id, projectId, mentorRelationshipId: { not: null } } }) ?? await tx.mentorFeedback.findFirst({ where: { id: ref.id, projectId } }); break;
      case "PLAN_REVISION": source = await tx.planRevision.findFirst({ where: { id: ref.id, projectId } }); break;
      case "PLAN": source = await tx.researchPlan.findFirst({ where: { id: ref.id, projectId } }); break;
      case "GAP": source = await tx.researchGap.findFirst({ where: { id: ref.id, projectId } }); break;
      case "PAPER": { const link = await tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId, paperId: ref.id } } }); source = link ? { link, paper: await tx.paper.findUnique({ where: { id: ref.id } }) } : null; break; }
      case "SCREENING": source = await tx.projectPaper.findFirst({ where: { id: ref.id, projectId } }); break;
      case "QUESTION": { const plan = await tx.researchPlan.findUnique({ where: { projectId } }); source = Array.isArray(plan?.questions) ? plan.questions.find(question => question && typeof question === "object" && !Array.isArray(question) && question.id === ref.id) : null; break; }
      case "REVIEW_REQUEST": source = await tx.reviewRequest.findFirst({ where: { id: ref.id, projectId } }); break;
      case "TREND": source = await tx.projectTrendSnapshot.findFirst({ where: { id: ref.id, projectId } }); break;
      default: throw AppError.badRequest("Unsupported contribution evidence reference");
    }
    return { kind: ref.kind, id: ref.id, digest: createHash("sha256").update(JSON.stringify(source ?? null)).digest("hex") };
  }));
}
export async function contributionEvidenceChanged(tx: WorkspaceDb, projectId: string, proposalId: string, version: number, refs: ContributionArtifactLink[]) {
  const submitted = await tx.projectContributionHistory.findFirst({ where: { proposalId, version, action: "SUBMITTED" }, select: { snapshot: true } });
  const expected = (submitted?.snapshot as { evidenceManifest?: unknown } | null)?.evidenceManifest;
  return expected !== undefined && !isDeepStrictEqual(expected, await contributionEvidenceManifest(tx, projectId, refs));
}
