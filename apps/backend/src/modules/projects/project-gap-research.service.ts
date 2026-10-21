import { randomUUID } from "node:crypto";
import type { GapResearchView, PlanQuestion } from "@trend/shared-types";
import type { z } from "zod";
import type { assessGapSchema, reviseGapSchema, linkGapEvidenceSchema, deriveQuestionSchema } from "./dto/project-research.schema.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, workspaceEvent, expectWorkspaceVersion, jsonSnapshot, workspaceId, type WorkspaceContext } from "./workspace-access.js";
import { evidenceItem, researchPaper, reviewEvidenceInContext, discoveryEvidenceIsCurrent } from "./project-evidence.service.js";

import { recordGapPacket } from "./gap-revision.js";
import { notificationService } from "../notifications/notification.service.js";

export async function projectGap(context: WorkspaceContext, id: string) {
  const row = await context.tx.researchGap.findFirst({ where: { ...workspaceId(id), projectId: context.project.id } });
  if (!row) throw AppError.notFound("Project gap candidate not found"); return row;
}
/** A packet contains exact extraction revision IDs, never a pointer to mutable evidence alone. */
export async function captureGapRevision(context: WorkspaceContext, gapId: string) {
  const gap = await projectGap(context, gapId); gapId = gap.id;
  return recordGapPacket(context.tx, gap.id, context.actorId);
}
async function eligibleEvidence(context: WorkspaceContext, gapId: string) {
  const links = await context.tx.gapEvidenceRecord.findMany({ where: { gapId } });
  const checked: typeof links = [];
  for (const link of links) {
    if (!link.evidenceItemId || !link.evidenceRevisionId) continue;
    const item = await evidenceItem(context, link.evidenceItemId), source = await researchPaper(context, item.paperId);
    const revision = await context.tx.projectWorkspaceRevision.findUnique({ where: { id: link.evidenceRevisionId } });
    if (item.reviewState === "ACCEPTED" && item.version === revision?.version && source.screeningStatus === "INCLUDED" && await discoveryEvidenceIsCurrent(context, item)) checked.push(link);
  }
  if (links.some(link => link.evidenceItemId && !checked.some(item => item.id === link.id))) throw AppError.conflict("A linked extraction changed. Review and relink all current evidence revisions");
  return checked;
}
export const projectGapResearchService = {
  async guidance(projectId: string, actorId: string, gapId: string, input: { note: string; expectedVersion: number; clientKey: string }) {
    return withWorkspace(projectId, actorId, { write: true, mentor: true }, async context => {
      const gap = await projectGap(context, gapId);
      const prior = await context.tx.projectActivity.findFirst({ where: { projectId: context.project.id, actorId: context.actorId, type: "MENTOR_GUIDANCE", metadata: { path: ["clientKey"], equals: input.clientKey } } });
      if (prior) {
        const meta = prior.metadata as { note: string; gapVersion: number };
        if (prior.entityId !== gap.id || meta.note !== input.note || meta.gapVersion !== input.expectedVersion) throw AppError.conflict("This feedback key was used for another comment");
        return { id: prior.id };
      }
      expectWorkspaceVersion(gap.version, input.expectedVersion);
      await captureGapRevision(context, gap.id);
      const note = await workspaceEvent(context, "MENTOR_GUIDANCE", "GAP", gap.id, { note: input.note, gapVersion: gap.version, attribution: context.role ? "TEAM" : "MENTOR", clientKey: input.clientKey });
      const recipients = context.role ? (await context.tx.mentorRelationship.findMany({ where: { projectId: context.project.id, status: "ACTIVE" }, select: { mentorUserId: true } })).map(row => row.mentorUserId) : [context.project.ownerId];
      for (const userId of new Set(recipients.filter(id => id !== context.actorId))) await notificationService.create({ userId, type: context.role ? "PROJECT_WORKSPACE_GAP_GUIDANCE" : "PROJECT_WORKSPACE_MENTOR_FEEDBACK", title: "Research feedback", message: "A gap candidate has a new feedback request or comment.", targetKind: "project", targetId: context.project.id, eventKey: `WORKSPACE:GAP_GUIDANCE:${note.id}:${userId}`, emailStatus: "SKIPPED" }, context.tx);
      return { id: note.id };
    });
  },
  async detail(projectId: string, actorId: string, gapId: string): Promise<GapResearchView> {
    return withWorkspace(projectId, actorId, { mentor: true }, async context => {
      const gap = await projectGap(context, gapId); gapId = gap.id;
      const [evidence, history, plan] = await Promise.all([
        context.tx.gapEvidenceRecord.findMany({ where: { gapId }, orderBy: { createdAt: "asc" } }),
        context.tx.projectWorkspaceRevision.findMany({ where: { projectId: context.project.id, entityKind: "GAP", entityId: gapId }, orderBy: { version: "desc" }, take: 100 }),
        context.tx.researchPlan.findUnique({ where: { projectId: context.project.id } }),
      ]);
      const items = await context.tx.projectEvidenceItem.findMany({ where: { projectId: context.project.id, id: { in: evidence.flatMap(row => row.evidenceItemId ? [row.evidenceItemId] : []) } } });
      const revisions = await context.tx.projectWorkspaceRevision.findMany({ where: { id: { in: evidence.flatMap(row => row.evidenceRevisionId ? [row.evidenceRevisionId] : []) }, projectId: context.project.id, entityKind: "EXTRACTION" } });
      const papers = await context.tx.paper.findMany({ where: { id: { in: evidence.map(row => row.paperId) } }, select: { id: true, title: true } });
      const sources = await context.tx.projectPaper.findMany({ where: { projectId: context.project.id, paperId: { in: evidence.map(row => row.paperId) } }, select: { paperId: true, screeningStatus: true } });
      const questions = (Array.isArray(plan?.questions) ? plan.questions as unknown as PlanQuestion[] : []).filter(question => question.sourceGapId === gapId);
      const discussions = context.role ? await context.tx.projectDiscussion.findMany({ where: { projectId: context.project.id, targetKind: "GAP", targetId: gap.id }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, body: true, status: true } }) : [];
      const feedback = await context.tx.projectActivity.findMany({ where: { projectId: context.project.id, type: "MENTOR_GUIDANCE", entityKind: "GAP", entityId: gap.id }, orderBy: { createdAt: "desc" }, take: 50 });
      const authors = await context.tx.user.findMany({ where: { id: { in: feedback.flatMap(row => row.actorId ? [row.actorId] : []) } }, select: { id: true, fullName: true } });
      const relatedLinks = await context.tx.researchGapPaper.findMany({ where: { gapId: gap.id } });
      const relatedSources = await context.tx.projectPaper.findMany({ where: { projectId: context.project.id, paperId: { in: relatedLinks.map(row => row.paperId) } }, select: { paperId: true } });
      const relatedLiterature = await context.tx.paper.findMany({ where: { id: { in: relatedSources.map(row => row.paperId) } }, select: { id: true, title: true, publicationYear: true } });
      const currentItems = new Set<string>();
      for (const item of items) if (await discoveryEvidenceIsCurrent(context, item)) currentItems.add(item.id);
      return { gap: jsonSnapshot(gap), relatedLiterature: relatedLiterature.map(row => ({ paperId: row.id, title: row.title, publicationYear: row.publicationYear || null, suggestedSupport: relatedLinks.some(link => link.paperId === row.id && link.kind === "supporting") })), canContribute: context.project.status !== "ARCHIVED", canRequestExpertReview: context.role === "OWNER" && context.project.status !== "ARCHIVED", discussions, guidance: feedback.map(row => ({ id: row.id, author: authors.find(user => user.id === row.actorId)?.fullName ?? "Researcher", createdAt: row.createdAt.toISOString(), ...(row.metadata as { note: string; gapVersion: number; attribution: string }) })), questions, history: jsonSnapshot(history), evidence: evidence.map(row => {
        const item = items.find(candidate => candidate.id === row.evidenceItemId), revision = revisions.find(candidate => candidate.id === row.evidenceRevisionId);
        const snapshot = revision?.snapshot as { reviewState?: string } | undefined;
        return { ...row, sourceTitle: papers.find(paper => paper.id === row.paperId)?.title ?? "", reviewed: snapshot?.reviewState === "ACCEPTED", evidenceVersion: item?.version, reviewState: item?.reviewState, discovery: Boolean((item?.sourceSnapshot as { analysisId?: string } | undefined)?.analysisId), claim: item?.claim, methodology: item?.methodology, limitations: item?.limitations, sourceChanged: Boolean(item && (item.version !== revision?.version || !currentItems.has(item.id) || sources.find(source => source.paperId === row.paperId)?.screeningStatus !== "INCLUDED")) };
      }) } as unknown as GapResearchView;
    });
  },
  async revise(projectId: string, actorId: string, gapId: string, input: z.infer<typeof reviseGapSchema>) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const gap = await projectGap(context, gapId); gapId = gap.id; expectWorkspaceVersion(gap.version, input.expectedVersion); await captureGapRevision(context, gapId);
      const { expectedVersion: _version, ...content } = input;
      const next = await context.tx.researchGap.update({ where: { id: gapId }, data: { ...content, observedLimitation: content.description, significanceExplanation: content.rationale, version: { increment: 1 }, assessmentStatus: "PROPOSED", assessmentRationale: "", validationStatus: "CANDIDATE" } });
      await captureGapRevision(context, gapId); await workspaceEvent(context, "GAP_REVISED", "GAP", gapId); return next;
    });
  },
  async link(projectId: string, actorId: string, gapId: string, input: z.infer<typeof linkGapEvidenceSchema>) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const gap = await projectGap(context, gapId); gapId = gap.id; const item = await evidenceItem(context, input.evidenceItemId);
      expectWorkspaceVersion(gap.version, input.expectedVersion); expectWorkspaceVersion(item.version, input.expectedEvidenceVersion);
      const source = await researchPaper(context, item.paperId);
      if (item.reviewState !== "ACCEPTED" || source.screeningStatus !== "INCLUDED") throw AppError.badRequest("Link a human-reviewed extraction from an included project paper");
      const revision = await context.tx.projectWorkspaceRevision.findFirst({ where: { projectId: context.project.id, entityKind: "EXTRACTION", entityId: item.id, version: item.version } });
      if (!revision) throw AppError.conflict("The accepted evidence revision is unavailable");
      await captureGapRevision(context, gapId);
      const evidenceType = `EXTRACTION:${item.id}`;
      const values = { evidenceItemId: item.id, evidenceRevisionId: revision.id, excerpt: item.quotation || item.claim, sourceLocation: item.locator || "Human interpretation, see source", projectPaperId: source.id, explanation: input.explanation, addedById: context.actorId };
      const link = await context.tx.gapEvidenceRecord.upsert({ where: { gapId_paperId_evidenceKind_evidenceType: { gapId, paperId: item.paperId, evidenceKind: input.kind, evidenceType } }, create: { ...values, gapId, paperId: item.paperId, evidenceKind: input.kind, evidenceType }, update: values });
      await context.tx.researchGapPaper.upsert({ where: { gapId_paperId_kind: { gapId, paperId: item.paperId, kind: input.kind === "SUPPORTING" ? "supporting" : "evidence" } }, create: { gapId, paperId: item.paperId, kind: input.kind === "SUPPORTING" ? "supporting" : "evidence", position: 0 }, update: {} });
      await context.tx.researchGap.update({ where: { id: gapId }, data: { version: { increment: 1 }, assessmentStatus: "PROPOSED", assessmentRationale: "", validationStatus: "CANDIDATE" } });
      await captureGapRevision(context, gapId); await workspaceEvent(context, "EVIDENCE_LINKED", "GAP", gapId, { kind: input.kind, revisionId: revision.id }); return link;
    });
  },
  async assess(projectId: string, actorId: string, gapId: string, input: z.infer<typeof assessGapSchema>) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const gap = await projectGap(context, gapId); gapId = gap.id; expectWorkspaceVersion(gap.version, input.expectedVersion);
      if (input.reviewedEvidence?.length) {
        if (new Set(input.reviewedEvidence.map(item => item.id)).size !== input.reviewedEvidence.length) throw AppError.badRequest("Select each evidence revision once");
        if (input.status !== "TEAM_SUPPORTED") throw AppError.badRequest("Evidence confirmation is only used when recording team support");
        const links = await context.tx.gapEvidenceRecord.findMany({ where: { gapId } });
        for (const selection of input.reviewedEvidence) {
          const link = links.find(link => link.evidenceItemId === selection.id);
          const item = await evidenceItem(context, selection.id);
          if (!link || item.origin !== "AI_SUGGESTED" || !(item.sourceSnapshot as { analysisId?: string }).analysisId) throw AppError.badRequest("Review only this candidate's discovery evidence");
          const reviewed = await reviewEvidenceInContext(context, item.id, { state: "ACCEPTED", expectedVersion: selection.version, rationale: input.rationale });
          const revision = await context.tx.projectWorkspaceRevision.findFirstOrThrow({ where: { projectId: context.project.id, entityKind: "EXTRACTION", entityId: reviewed.id, version: reviewed.version } });
          await context.tx.gapEvidenceRecord.update({ where: { id: link.id }, data: { evidenceRevisionId: revision.id } });
        }
      }
      if (input.status === "TEAM_SUPPORTED" && !(await eligibleEvidence(context, gapId)).some(row => row.evidenceKind === "SUPPORTING")) throw AppError.badRequest("Review and link supporting evidence before recording team support");
      await captureGapRevision(context, gapId);
      const next = await context.tx.researchGap.update({ where: { id: gapId }, data: { assessmentStatus: input.status, assessmentRationale: input.rationale, version: { increment: 1 }, validationStatus: "CANDIDATE" } });
      await captureGapRevision(context, gapId); await workspaceEvent(context, "GAP_ASSESSED", "GAP", gapId, { status: input.status, rationale: input.rationale }); return next;
    });
  },
  async derive(projectId: string, actorId: string, gapId: string, input: z.infer<typeof deriveQuestionSchema>) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const gap = await projectGap(context, gapId); gapId = gap.id; const plan = await context.tx.researchPlan.findUniqueOrThrow({ where: { projectId: context.project.id } });
      const prior = await context.tx.projectActivity.findFirst({ where: { projectId: context.project.id, type: "QUESTION_DERIVED", entityId: input.clientKey } });
      if (prior) { const payload = prior.metadata as { gapId: string; text: string; questionId: string }; if (payload.gapId !== gapId || payload.text !== input.text) throw AppError.conflict("This request key belongs to another question"); return { questionId: payload.questionId }; }
      expectWorkspaceVersion(gap.version, input.expectedVersion); expectWorkspaceVersion(plan.version, input.expectedPlanVersion);
      if (gap.assessmentStatus !== "TEAM_SUPPORTED") throw AppError.badRequest("Record team support before deriving a research question");
      const links = await eligibleEvidence(context, gapId);
      if (!links.some(row => row.evidenceKind === "SUPPORTING")) throw AppError.conflict("The supporting evidence changed. Review the candidate before deriving a question");
      const questions = (Array.isArray(plan.questions) ? plan.questions : []) as unknown as PlanQuestion[];
      if (questions.length >= 20) throw AppError.badRequest("This plan already contains 20 questions");
      await captureGapRevision(context, gapId);
      const question = { id: randomUUID(), text: input.text, sourceGapId: gapId, sourceGapVersion: gap.version, evidenceIds: links.map(row => row.id), sourceEvidenceRevisionIds: links.map(row => row.evidenceRevisionId!) };
      await context.tx.researchPlan.update({ where: { id: plan.id }, data: { questions: jsonSnapshot([...questions, question]), version: { increment: 1 }, updatedById: context.actorId } });
      await workspaceEvent(context, "QUESTION_DERIVED", "QUESTION", input.clientKey, { questionId: question.id, gapId, text: input.text }); return { questionId: question.id };
    });
  },
};
