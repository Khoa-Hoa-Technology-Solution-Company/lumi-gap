import { invalidateSourceAssessments } from "./gap-revision.js";
import type { ProjectResearchLibrary, ScreeningPhase } from "@trend/shared-types";
import type { z } from "zod";
import type { assignScreeningSchema, voteScreeningSchema, resolveScreeningSchema } from "./dto/project-research.schema.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, expectWorkspaceVersion, workspaceEvent, workspaceRevision, assertWorkspaceAssignee, jsonSnapshot, type WorkspaceContext, type WorkspaceDb } from "./workspace-access.js";
import { researchPaper } from "./project-evidence.service.js";

function expectSourceVersion(actual: Date, expected: string) { if (actual.toISOString() !== expected) throw AppError.conflict("This source changed. Reload before saving"); }
const changedAt = (before: Date) => new Date(Math.max(Date.now(), before.getTime() + 1));
/** Revoking membership must not revive an old vote when that person rejoins. */
export async function revokeProjectScreeningAssignments(tx: WorkspaceDb, projectId: string, reviewerId: string, actorId: string) {
  const assigned = await tx.projectScreeningDecision.findMany({ where: { projectId, reviewerId, assigned: true } });
  for (const row of assigned) {
    const revoked = await tx.projectScreeningDecision.update({ where: { id: row.id }, data: { assigned: false, version: { increment: 1 } } });
    await tx.projectWorkspaceRevision.create({ data: { projectId, entityKind: "SCREENING_VOTE", entityId: revoked.id, version: revoked.version, actorId, snapshot: jsonSnapshot(revoked) } });
  }
  for (const paperId of new Set(assigned.map(row => row.paperId))) {
    const source = await tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId, paperId } } });
    await invalidateSourceAssessments(tx, projectId, actorId, { paperId });
    await tx.projectPaper.update({ where: { id: source.id }, data: { screeningStatus: "UNDECIDED", screenedById: null, screenedAt: null, inclusionReason: null, exclusionReason: null, exclusionNote: null, updatedAt: changedAt(source.updatedAt) } });
  }
}
async function activeDecisions(context: WorkspaceContext, paperId: string, phase?: ScreeningPhase) {
  const rows = await context.tx.projectScreeningDecision.findMany({ where: { projectId: context.project.id, paperId, assigned: true, ...(phase ? { phase } : {}) }, orderBy: { createdAt: "asc" } });
  const memberships = await context.tx.projectMember.findMany({ where: { projectId: context.project.id, status: "ACTIVE" }, select: { userId: true } });
  const active = new Set([context.project.ownerId, ...memberships.map(row => row.userId)]);
  const accounts = await context.tx.user.findMany({ where: { id: { in: [...active] }, isActive: true, accountStatus: "ACTIVE" }, select: { id: true } });
  const available = new Set(accounts.map(user => user.id));
  return rows.filter(row => available.has(row.reviewerId));
}
export const projectScreeningService = {
  async library(projectId: string, actorId: string, query: { page: number; pageSize: number; q: string; state?: string }): Promise<ProjectResearchLibrary> {
    return withWorkspace(projectId, actorId, {}, async context => {
      const { tx, project } = context;
      const matching = query.q ? await tx.paper.findMany({ where: { OR: [{ title: { contains: query.q, mode: "insensitive" } }, { doi: { contains: query.q, mode: "insensitive" } }] }, select: { id: true } }) : null;
      const where = { projectId: project.id, ...(query.state ? { screeningStatus: query.state } : {}), ...(matching ? { OR: [{ paperId: { in: matching.map(row => row.id) } }, { tags: { has: query.q } }, { collectionName: { contains: query.q, mode: "insensitive" as const } }] } : {}) };
      const [links, total, members] = await Promise.all([tx.projectPaper.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), tx.projectPaper.count({ where }), tx.projectMember.findMany({ where: { projectId: project.id, status: "ACTIVE" }, select: { userId: true } })]);
      const people = await tx.user.findMany({ where: { id: { in: [...new Set([project.ownerId, ...members.map(row => row.userId)])] }, isActive: true, accountStatus: "ACTIVE" }, select: { id: true, fullName: true } });
      const [papers, files, votes, authors] = await Promise.all([
        tx.paper.findMany({ where: { id: { in: links.map(row => row.paperId) } }, select: { id: true, title: true, doi: true, publicationYear: true, journalName: true, abstractText: true, paperLink: true } }),
        tx.projectPaperFile.findMany({ where: { projectId: project.id, paperId: { in: links.map(row => row.paperId) } }, select: { id: true, paperId: true, sha256: true, byteSize: true, createdAt: true } }),
        tx.projectScreeningDecision.findMany({ where: { projectId: project.id, paperId: { in: links.map(row => row.paperId) }, assigned: true, reviewerId: { in: people.map(person => person.id) } } }),
        tx.paperAuthor.findMany({ where: { paperId: { in: links.map(row => row.paperId) } }, orderBy: { position: "asc" }, select: { paperId: true, displayName: true } }),
      ]);
      const items = links.map(link => {
        const ownVotes = votes.filter(vote => vote.paperId === link.paperId);
        const visiblePhases = new Set(["TITLE_ABSTRACT", "FULL_TEXT"].filter(phase => { const phaseVotes = ownVotes.filter(vote => vote.phase === phase); return phaseVotes.length >= 2 && phaseVotes.every(vote => vote.decision !== "UNDECIDED"); }));
        const shown = ownVotes.filter(vote => !project.screeningBlinded || vote.reviewerId === context.actorId || visiblePhases.has(vote.phase));
        const conflict = [...visiblePhases].some(phase => new Set(ownVotes.filter(vote => vote.phase === phase).map(vote => vote.decision)).size > 1);
        const paper = papers.find(source => source.id === link.paperId)!;
        return { ...link, ...paper, authors: authors.filter(author => author.paperId === paper.id).map(author => author.displayName).filter(Boolean), publicationYear: paper.publicationYear || null, id: link.id, paperId: paper.id, assignedPhases: [...new Set(ownVotes.map(vote => vote.phase))], votes: shown, hiddenVotes: shown.length !== ownVotes.length, conflict, files: files.filter(file => file.paperId === link.paperId) };
      });
      return { items, total, page: query.page, pageSize: query.pageSize, hasNext: query.page * query.pageSize < total, mode: project.screeningMode, blinded: project.screeningBlinded, projectVersion: project.version, canManage: context.role === "OWNER", people: people.map(person => ({ id: person.id, name: person.fullName || "Researcher" })) } as unknown as ProjectResearchLibrary;
    });
  },
  async policy(projectId: string, actorId: string, input: { mode: string; blinded: boolean; expectedVersion: number }) {
    return withWorkspace(projectId, actorId, { write: true, owner: true }, async context => {
      expectWorkspaceVersion(context.project.version, input.expectedVersion);
      if (context.project.screeningMode !== input.mode && await context.tx.projectScreeningDecision.count({ where: { projectId: context.project.id } })) throw AppError.conflict("This project has independent screening records. Keep its screening method to preserve the review protocol");
      const next = await context.tx.project.update({ where: { id: context.project.id }, data: { screeningMode: input.mode, screeningBlinded: input.blinded, version: { increment: 1 } } });
      await workspaceEvent(context, "SCREENING_POLICY_CHANGED", "PROJECT", context.project.id, { mode: input.mode, blinded: input.blinded }); return { version: next.version };
    });
  },
  async assign(projectId: string, actorId: string, paperId: string, input: z.infer<typeof assignScreeningSchema>) {
    return withWorkspace(projectId, actorId, { write: true, owner: true, accounts: input.reviewerIds }, async context => {
      if (context.project.screeningMode !== "INDEPENDENT") throw AppError.badRequest("Enable independent screening first");
      const link = await researchPaper(context, paperId); expectSourceVersion(link.updatedAt, input.expectedUpdatedAt);
      await Promise.all(input.reviewerIds.map(id => assertWorkspaceAssignee(context, id)));
      const existing = await context.tx.projectScreeningDecision.findMany({ where: { projectId: context.project.id, paperId, phase: input.phase } });
      for (const row of existing.filter(row => row.assigned && !input.reviewerIds.includes(row.reviewerId))) {
        const revoked = await context.tx.projectScreeningDecision.update({ where: { id: row.id }, data: { assigned: false, version: { increment: 1 } } });
        await workspaceRevision(context, "SCREENING_VOTE", revoked);
      }
      for (const reviewerId of input.reviewerIds) {
        const old = existing.find(row => row.reviewerId === reviewerId);
        if (old?.assigned) continue;
        const row = old
          ? await context.tx.projectScreeningDecision.update({ where: { id: old.id }, data: { assigned: true, decision: "UNDECIDED", reason: "", version: { increment: 1 } } })
          : await context.tx.projectScreeningDecision.create({ data: { projectId: context.project.id, paperId, reviewerId, phase: input.phase } });
        await workspaceRevision(context, "SCREENING_VOTE", row);
      }
      await invalidateSourceAssessments(context.tx, context.project.id, context.actorId, { paperId });
      await context.tx.projectPaper.update({ where: { id: link.id }, data: { screeningStatus: "UNDECIDED", screenedById: null, screenedAt: null, inclusionReason: null, exclusionReason: null, exclusionNote: null, updatedAt: changedAt(link.updatedAt) } });
      await workspaceEvent(context, "SCREENING_ASSIGNED", "PAPER", paperId); return { paperId };
    });
  },
  async vote(projectId: string, actorId: string, paperId: string, input: z.infer<typeof voteScreeningSchema>) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      if (context.project.screeningMode !== "INDEPENDENT") throw AppError.badRequest("Use the project's exploratory screening controls");
      const link = await researchPaper(context, paperId);
      const row = await context.tx.projectScreeningDecision.findUnique({ where: { projectId_paperId_reviewerId_phase: { projectId: context.project.id, paperId, reviewerId: context.actorId, phase: input.phase } } });
      if (!row?.assigned) throw AppError.forbidden("You are not assigned to this screening phase"); expectWorkspaceVersion(row.version, input.expectedVersion);
      const next = await context.tx.projectScreeningDecision.update({ where: { id: row.id }, data: { decision: input.decision, reason: input.reason, version: { increment: 1 } } });
      await workspaceRevision(context, "SCREENING_VOTE", next);
      await invalidateSourceAssessments(context.tx, context.project.id, context.actorId, { paperId });
      await context.tx.projectPaper.update({ where: { id: link.id }, data: { screeningStatus: "UNDECIDED", screenedById: null, screenedAt: null, inclusionReason: null, exclusionReason: null, exclusionNote: null, updatedAt: changedAt(link.updatedAt) } });
      // Vote contents are deliberately absent from shared activity while blinded.
      await workspaceEvent(context, "SCREENING_VOTE_RECORDED", "PAPER", paperId); return next;
    });
  },
  async resolve(projectId: string, actorId: string, paperId: string, input: z.infer<typeof resolveScreeningSchema>) {
    return withWorkspace(projectId, actorId, { write: true, owner: true }, async context => {
      if (context.project.screeningMode !== "INDEPENDENT") throw AppError.badRequest("Independent screening is not enabled");
      const link = await researchPaper(context, paperId); expectSourceVersion(link.updatedAt, input.expectedUpdatedAt);
      const votes = await activeDecisions(context, paperId, input.phase);
      if (votes.length < 2 || votes.some(vote => vote.decision === "UNDECIDED")) throw AppError.conflict("Wait for at least two assigned reviewers to complete this phase");
      const next = await invalidateSourceAssessments(context.tx, context.project.id, context.actorId, { paperId });
      await context.tx.projectPaper.update({ where: { id: link.id }, data: { screeningStatus: input.decision, inclusionReason: input.decision === "INCLUDED" ? input.reason : null, exclusionReason: input.decision === "EXCLUDED" ? "OTHER" : null, exclusionNote: input.decision === "EXCLUDED" ? input.reason : null, screenedById: context.actorId, screenedAt: new Date(), updatedAt: changedAt(link.updatedAt) } });
      await workspaceEvent(context, "SCREENING_RESOLVED", "PAPER", paperId, { phase: input.phase, decision: input.decision, reason: input.reason, votes: votes.map(vote => ({ id: vote.id, version: vote.version })) }); return next;
    });
  },
  async history(projectId: string, actorId: string, paperId: string) {
    return withWorkspace(projectId, actorId, {}, async context => {
      await researchPaper(context, paperId); const rows = await activeDecisions(context, paperId);
      const visible = rows.filter(row => !context.project.screeningBlinded || row.reviewerId === context.actorId || (rows.filter(other => other.phase === row.phase).length >= 2 && rows.filter(other => other.phase === row.phase).every(other => other.decision !== "UNDECIDED")));
      const revisions = await context.tx.projectWorkspaceRevision.findMany({ where: { projectId: context.project.id, entityKind: "SCREENING_VOTE", entityId: { in: visible.map(row => row.id) } }, orderBy: { createdAt: "desc" }, take: 100 });
      const events = await context.tx.projectActivity.findMany({ where: { projectId: context.project.id, type: "PAPER_SCREENED", OR: [{ entityId: paperId }, { metadata: { path: ["paperId"], equals: paperId } }] }, orderBy: { createdAt: "desc" }, take: 100 });
      return [...revisions, ...events.map(event => ({ id: event.id, version: 0, createdAt: event.createdAt, snapshot: event.metadata }))];
    });
  },
};
