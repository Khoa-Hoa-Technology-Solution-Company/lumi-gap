import { isDeepStrictEqual } from "node:util";
import {
  contributionCategories,
  creditRoles,
  type ContributionOverview,
  inferContributionCategoryFromRoles,
  type ContributionArtifactLink,
  type ContributionCategoryKey,
  type ContributionInput,
  type CreditRole,
  type ResolvedContributionArtifactRef,
  type WorkContribution,
  type WorkspacePerson,
} from "@trend/shared-types";
import type { z } from "zod";
import type { ContributionParticipant, ContributionReview, ProjectContributionProposal } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { assertActiveProjectAccount, lockProjectAccounts } from "./project-transaction.js";
import { withWorkspace, workspaceId, expectWorkspaceVersion, assertWorkspaceLink, jsonSnapshot, workspacePeople, workspacePerson, type WorkspaceContext } from "./workspace-access.js";
import { contributionsNotify } from "./contributions-notification.js";
import { canAccessProjectAsMentor } from "./academic-relationship-access.js";
import { contributionEvidenceManifest, contributionEvidenceChanged } from "./contribution-evidence.js";
import type { contributionsPageSchema, contributionReviewSchema } from "./dto/project-contributions.schema.js";

function deduplicateEvidenceRefs(refs: ContributionArtifactLink[]): ContributionArtifactLink[] {
  const seen = new Set<string>();
  const out: ContributionArtifactLink[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

export async function resolveContributionArtifactRefs(
  context: WorkspaceContext,
  refs: ContributionArtifactLink[],
): Promise<ResolvedContributionArtifactRef[]> {
  const results: ResolvedContributionArtifactRef[] = [];
  for (const link of refs) {
    let available = false;
    try {
      if (link.kind === "TASK") {
        available = Boolean(
          await context.tx.projectTask.findFirst({
            where: { id: link.id, projectId: context.project.id, deletedAt: null },
            select: { id: true },
          }),
        );
      } else {
        await assertWorkspaceLink(context, link);
        available = true;
      }
    } catch {
      available = false;
    }
    results.push({
      kind: link.kind,
      id: link.id,
      available,
      label: available ? null : "Artifact unavailable or removed from project",
    });
  }
  return results;
}

function resolveRowCategory(row: ProjectContributionProposal): ContributionCategoryKey {
  if (row.source === "LEGACY" && Array.isArray(row.roles) && row.roles.length > 0) {
    return inferContributionCategoryFromRoles(row.roles as CreditRole[]);
  }
  const raw = (row as { category?: string | null }).category;
  if (raw && (contributionCategories as readonly string[]).includes(raw)) {
    return raw as ContributionCategoryKey;
  }
  return inferContributionCategoryFromRoles((row.roles ?? []) as CreditRole[]);
}

async function record(context: WorkspaceContext, id: string) {
  const row = await context.tx.projectContributionProposal.findFirst({ where: { id, projectId: context.project.id } });
  if (!row) throw AppError.notFound("Contribution not found");
  return row;
}
export async function withWorkRecord<T>(projectId: string, actorId: string, id: string, write: boolean, run: (context: WorkspaceContext) => Promise<T>) {
  const db = getPrisma(); const [project, actor] = await Promise.all([db.project.findUnique({ where: workspaceId(projectId) }), db.user.findUnique({ where: workspaceId(actorId) })]);
  if (!project || !actor) throw AppError.notFound("Contribution not found");
  return db.$transaction(async tx => {
    await lockProjectAccounts(tx, [actor.id], project.id); await assertActiveProjectAccount(tx, actor.id);
    const live = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: live.id, userId: actor.id } } });
    const role = live.ownerId === actor.id ? "OWNER" : member?.status === "ACTIVE" ? "MEMBER" : null;
    const row = await tx.projectContributionProposal.findFirst({ where: { id, projectId: live.id } });
    if (!row) throw AppError.notFound("Contribution not found");
    if (!role && !await tx.contributionParticipant.findUnique({ where: { proposalId_userId: { proposalId: id, userId: actor.id } } })) {
      const history = await tx.projectContributionHistory.findMany({ where: { proposalId: id }, select: { snapshot: true } });
      if (!history.some(h => (h.snapshot as { participants?: { userId: string }[] }).participants?.some(p => p.userId === actor.id))) throw AppError.notFound("Contribution not found");
    }
    if (write && live.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    return run({ tx, project: live, actorId: actor.id, role });
  }, { maxWait: 10000, timeout: 20000 });
}
type WorkListData = { participants: ContributionParticipant[]; reviews: ContributionReview[]; people: Map<string, WorkspacePerson> };
async function present(context: WorkspaceContext, row: ProjectContributionProposal, detail = true, listData?: WorkListData): Promise<WorkContribution> {
  const [participants, reviews, history] = listData ? [listData.participants.filter(p => p.proposalId === row.id), listData.reviews.filter(r => r.proposalId === row.id && r.version === row.version), []] : await Promise.all([
    context.tx.contributionParticipant.findMany({ where: { proposalId: row.id } }),
    context.tx.contributionReview.findMany({ where: { proposalId: row.id, ...(!detail ? { version: row.version } : {}) }, orderBy: { createdAt: "asc" } }),
    detail ? context.tx.projectContributionHistory.findMany({ where: { proposalId: row.id }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);
  const people = listData?.people ?? await workspacePeople(context.tx, [row.proposedById, ...participants.map(p => p.userId), ...reviews.map(r => r.userId)]);
  const reviewActions: WorkContribution["reviewActions"] = [];
  const priorChallenge = reviews.some(review => review.userId === context.actorId && review.version < row.version && ["DISPUTE", "NEEDS_CHANGES"].includes(review.decision));
  if (context.project.status !== "ARCHIVED" && row.source !== "LEGACY" && row.proposedById !== context.actorId && ["SUBMITTED", "ACCEPTED", "SELF_RECORDED"].includes(row.status)) {
    if (participants.some(p => p.userId === context.actorId) || priorChallenge) reviewActions.push("ACKNOWLEDGE");
    else if (context.role) reviewActions.push("ACCEPT");
    reviewActions.push("NEEDS_CHANGES", "DISPUTE");
  }
  const visibleEvidenceRefs = context.role ? (row.evidenceRefs as unknown as ContributionInput["evidenceRefs"]) : [];
  const evidenceRefDetails = context.role && Array.isArray(visibleEvidenceRefs)
    ? await resolveContributionArtifactRefs(context, visibleEvidenceRefs)
    : [];
  return { id: row.id, projectId: row.projectId, title: row.title, description: row.description, category: resolveRowCategory(row), source: row.source as ContributionInput["source"], workDate: row.workDate.toISOString(), version: row.version, status: row.status, createdBy: workspacePerson(people, row.proposedById), participants: participants.map(p => ({ ...p, name: workspacePerson(people, p.userId).name, roles: p.roles as CreditRole[] })), evidence: row.evidence ?? "", evidenceRefs: visibleEvidenceRefs, evidenceRefDetails, reviews: reviews.map(r => ({ ...r, name: workspacePerson(people, r.userId).name, createdAt: r.createdAt.toISOString() })), history: history.map(h => ({ ...h, snapshot: context.role ? h.snapshot : { title: (h.snapshot as { title?: string }).title, description: (h.snapshot as { description?: string }).description, participants: (h.snapshot as { participants?: unknown }).participants, status: (h.snapshot as { status?: string }).status }, createdAt: h.createdAt.toISOString() })), viewerId: context.actorId, reviewActions, canManage: (Boolean(context.role) || await canAccessProjectAsMentor(context.project.id, context.actorId, context.tx)) && row.proposedById === context.actorId && row.source !== "LEGACY" && row.status !== "SUBMITTED" && context.project.status !== "ARCHIVED", readOnly: context.project.status === "ARCHIVED", createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
async function history(context: WorkspaceContext, row: ProjectContributionProposal, action: string, note?: string, input?: unknown) {
  const participants = await context.tx.contributionParticipant.findMany({ where: { proposalId: row.id } });
  const evidenceManifest = action === "SUBMITTED" ? await contributionEvidenceManifest(context.tx, context.project.id, row.evidenceRefs as unknown as ContributionArtifactLink[]) : undefined;
  await context.tx.projectContributionHistory.create({ data: { proposalId: row.id, actorId: context.actorId, action, version: row.version, note, snapshot: jsonSnapshot({ ...row, participants, ...(evidenceManifest ? { evidenceManifest } : {}), ...(input ? { creationInput: input } : {}) }), createdAt: new Date() } });
}
async function validateWork(context: WorkspaceContext, input: ContributionInput) {
  if (!input.participants.some(p => p.userId === context.actorId) && context.role !== "OWNER") throw AppError.forbidden("Only the owner may propose work for another contributor");
  if (!context.role && input.participants.some(p => p.userId !== context.actorId)) throw AppError.forbidden("Mentors can record only their own work");
  for (const person of input.participants) {
    const membership = await context.tx.projectMembershipPeriod.findFirst({ where: { projectId: context.project.id, userId: person.userId } });
    if (!membership && person.userId !== context.project.ownerId && !await canAccessProjectAsMentor(context.project.id, person.userId, context.tx)) throw AppError.badRequest("Participants must have documented membership or effective mentor access");
  }
  const uniqueRefs = deduplicateEvidenceRefs(input.evidenceRefs);
  for (const link of uniqueRefs) {
    if (!context.role) {
      const feedback = link.kind === "MENTOR_FEEDBACK" && (await context.tx.projectDiscussion.findFirst({ where: { id: link.id, projectId: context.project.id, authorId: context.actorId, mentorRelationshipId: { not: null } } }) || await context.tx.mentorFeedback.findFirst({ where: { id: link.id, projectId: context.project.id, authorId: context.actorId } }));
      if (!feedback) throw AppError.forbidden("Mentors may reference only their own feedback here; project evidence remains private");
      continue;
    }
    if (link.kind === "TASK") { if (!await context.tx.projectTask.findFirst({ where: { id: link.id, projectId: context.project.id, deletedAt: null } })) throw AppError.badRequest("Related task must belong to this project"); }
    else await assertWorkspaceLink(context, link);
  }
  if (new Date(input.workDate) > new Date()) throw AppError.badRequest("Work date cannot be in the future");
}
const fields = (input: ContributionInput) => {
  const allRoles = [...new Set(input.participants.flatMap(p => p.roles))];
  const category = input.category ?? inferContributionCategoryFromRoles(allRoles);
  return {
    title: input.title,
    description: input.description,
    category,
    source: input.source,
    workDate: new Date(input.workDate),
    roles: allRoles,
    evidence: input.evidence,
    evidenceRefs: jsonSnapshot(deduplicateEvidenceRefs(input.evidenceRefs)),
  };
};
export const workContributionsService = {
  async overview(projectId: string, actorId: string): Promise<ContributionOverview> {
    return withWorkspace(projectId, actorId, { mentor: true, mentorScope: "SHARED_RESOURCES" }, async context => {
      const own = context.role ? undefined : await context.tx.contributionParticipant.findMany({ where: { userId: context.actorId }, select: { proposalId: true } });
      const rows = await context.tx.projectContributionProposal.findMany({ where: { projectId: context.project.id, status: { not: "DRAFT" }, ...(own ? { id: { in: own.map(p => p.proposalId) } } : {}) }, select: { id: true, status: true, contributorId: true, roles: true, evidenceRefs: true } });
      const participants = await context.tx.contributionParticipant.findMany({ where: { proposalId: { in: rows.map(r => r.id) } } });
      const people = await workspacePeople(context.tx, [...participants.map(p => p.userId), ...rows.map(r => r.contributorId)]);
      const result = new Map<string, ContributionOverview["people"][number]>(), artifacts = new Set<string>();
      for (const row of rows) {
        const parts = participants.filter(p => p.proposalId === row.id);
        for (const part of parts.length ? parts : [{ userId: row.contributorId, roles: row.roles }]) {
          const item = result.get(part.userId) ?? { userId: part.userId, name: workspacePerson(people, part.userId).name, declaredRoles: [], independentlyAcknowledgedRoles: [] };
          item.declaredRoles = creditRoles.filter(role => item.declaredRoles.includes(role) || part.roles.includes(role));
          if (["ACCEPTED", "CONFIRMED"].includes(row.status)) item.independentlyAcknowledgedRoles = creditRoles.filter(role => item.independentlyAcknowledgedRoles.includes(role) || part.roles.includes(role));
          result.set(part.userId, item);
        }
        if (context.role && Array.isArray(row.evidenceRefs)) for (const ref of row.evidenceRefs as unknown as ContributionArtifactLink[]) artifacts.add(`${ref.kind}:${ref.id}`);
      }
      return { people: [...result.values()].sort((a,b) => a.name.localeCompare(b.name)), distinctArtifactCount: artifacts.size };
    });
  },
  async people(projectId: string, actorId: string) {
    return withWorkspace(projectId, actorId, { mentor: true, mentorScope: "SHARED_RESOURCES" }, async context => {
      const members = context.role ? await context.tx.projectMember.findMany({ where: { projectId: context.project.id, status: "ACTIVE" }, select: { userId: true } }) : [];
      const mentors = context.role ? await context.tx.mentorRelationship.findMany({ where: { projectId: context.project.id, status: "ACTIVE" }, select: { mentorUserId: true } }) : [];
      const feedback = !context.role ? await context.tx.mentorFeedback.findMany({ where: { projectId: context.project.id, authorId: context.actorId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, body: true } }) : [];
      return { items: [...(await workspacePeople(context.tx, [context.actorId, ...members.map(m => m.userId), ...mentors.map(m => m.mentorUserId)])).values()], feedbackReferences: feedback.map(item => ({ kind: "MENTOR_FEEDBACK" as const, id: item.id, label: item.body.slice(0, 120) })) };
    });
  },
  async list(projectId: string, actorId: string, query: z.infer<typeof contributionsPageSchema>) {
    return withWorkspace(projectId, actorId, { mentor: true, mentorScope: "SHARED_RESOURCES" }, async context => {
      const own = query.filter === "MINE" || !context.role ? (await context.tx.$queryRaw<{ proposalId: string }[]>`SELECT p.proposal_id AS "proposalId" FROM contribution_participants p JOIN project_contribution_proposals c ON c.id=p.proposal_id WHERE p.user_id=${context.actorId}::uuid AND c.project_id=${context.project.id}::uuid`).map(p => p.proposalId) : undefined;
      const pending = query.filter === "PENDING" ? (await context.tx.$queryRaw<{ id: string }[]>`
        SELECT c.id FROM project_contribution_proposals c
        WHERE c.project_id=${context.project.id}::uuid AND c.status='SUBMITTED'
          AND c.source<>'LEGACY' AND c.proposed_by_id<>${context.actorId}::uuid
          AND NOT EXISTS (SELECT 1 FROM contribution_reviews r
            WHERE r.proposal_id=c.id AND r.version=c.version AND r.user_id=${context.actorId}::uuid)
          AND (EXISTS (SELECT 1 FROM contribution_participants p
                WHERE p.proposal_id=c.id AND p.user_id=${context.actorId}::uuid)
            OR NOT EXISTS (SELECT 1 FROM contribution_reviews r
                WHERE r.proposal_id=c.id AND r.version=c.version AND r.decision='ACCEPT'))
      `).map(row => row.id).filter(id => !own || own.includes(id)) : undefined;
      const where = { projectId: context.project.id, ...((pending ?? own) ? { id: { in: context.project.status === "ARCHIVED" && pending ? [] : (pending ?? own)! } } : {}), ...(query.filter === "PENDING" ? { status: "SUBMITTED" } : query.filter === "DISPUTED" ? { status: "DISPUTED" } : {}), ...(query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" as const } }, { description: { contains: query.q, mode: "insensitive" as const } }] } : {}) };
      const [rows, total] = await Promise.all([context.tx.projectContributionProposal.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), context.tx.projectContributionProposal.count({ where })]);
      const [participants, reviews] = await Promise.all([
        context.tx.contributionParticipant.findMany({ where: { proposalId: { in: rows.map(row => row.id) } } }),
        rows.length ? context.tx.contributionReview.findMany({ where: { OR: rows.map(row => ({ proposalId: row.id, version: row.version })) }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
      ]);
      const people = await workspacePeople(context.tx, [...rows.map(r => r.proposedById), ...participants.map(p => p.userId), ...reviews.map(r => r.userId)]);
      return { items: await Promise.all(rows.map(row => present(context, row, false, { participants, reviews, people }))), total, hasNext: query.page * query.pageSize < total, page: query.page, pageSize: query.pageSize, currentActorId: context.actorId };
    });
  },
  async detail(projectId: string, actorId: string, id: string) { return withWorkRecord(projectId, actorId, id, false, async context => {
    return present(context, await record(context, id));
  }); },
  async save(projectId: string, actorId: string, input: ContributionInput & { clientKey?: string; expectedVersion?: number; correctionReason?: string }, id?: string) {
    return withWorkspace(projectId, actorId, { write: true, mentor: true, mentorScope: "SHARED_RESOURCES" }, async context => {
      const previous = id ? await record(context, id) : await context.tx.projectContributionProposal.findUnique({ where: { projectId_proposedById_clientKey: { projectId: context.project.id, proposedById: context.actorId, clientKey: input.clientKey! } } });
      if (previous && !id) {
        const original = await context.tx.projectContributionHistory.findFirst({ where: { proposalId: previous.id, action: "CREATED" } });
        if (!isDeepStrictEqual((original?.snapshot as { creationInput?: unknown })?.creationInput, jsonSnapshot(input))) throw AppError.conflict("Request key was used with different content");
        return present(context, previous);
      }
      if (previous) {
        if (previous.proposedById !== context.actorId) throw AppError.forbidden("Only the record creator can submit a correction");
        if (previous.source === "LEGACY") throw AppError.conflict("Legacy academic claims are read-only here");
        expectWorkspaceVersion(previous.version, input.expectedVersion!);
        if (previous.status === "SUBMITTED") throw AppError.conflict("Resolve the submitted record before creating a correction");
      }
      await validateWork(context, input);
      const previousParticipants = previous ? await context.tx.contributionParticipant.findMany({ where: { proposalId: previous.id }, select: { userId: true } }) : [];
      const row = previous ? await context.tx.projectContributionProposal.update({ where: { id: previous.id }, data: { ...fields(input), status: "DRAFT", version: { increment: 1 }, confirmedById: null, confirmedAt: null } }) : await context.tx.projectContributionProposal.create({ data: { ...fields(input), projectId: context.project.id, proposedById: context.actorId, contributorId: context.actorId, status: "DRAFT", visibility: "PRIVATE", confirmationRequiredFrom: "CONTRIBUTOR", clientKey: input.clientKey } });
      if (previous) await context.tx.contributionParticipant.deleteMany({ where: { proposalId: row.id } });
      await context.tx.contributionParticipant.createMany({ data: input.participants.map(p => ({ proposalId: row.id, userId: p.userId, roles: p.roles })) });
      await history(context, row, previous ? "CORRECTED" : "CREATED", input.correctionReason, previous ? undefined : input);
      await contributionsNotify(context, [...input.participants.map(p => p.userId), ...previousParticipants.map(p => p.userId)], previous ? "CORRECTED" : "ATTRIBUTED", row.id, row.version);
      return present(context, row);
    });
  },
  async submit(projectId: string, actorId: string, id: string, expectedVersion: number) {
    return withWorkspace(projectId, actorId, { write: true, mentor: true, mentorScope: "SHARED_RESOURCES" }, async context => {
      const row = await record(context, id); expectWorkspaceVersion(row.version, expectedVersion);
      if (row.proposedById !== context.actorId || row.source === "LEGACY") throw AppError.forbidden("Only the record creator can submit");
      if (["SUBMITTED", "SELF_RECORDED"].includes(row.status)) return present(context, row);
      if (await context.tx.projectContributionHistory.findFirst({ where: { proposalId: id, version: row.version, action: "SUBMITTED" } })) return present(context, row);
      if (row.status !== "DRAFT") throw AppError.conflict("Create a corrected draft first");
      const roster = await context.tx.projectMember.findMany({ where: { projectId: context.project.id, status: "ACTIVE" } });
      const participants = await context.tx.contributionParticipant.findMany({ where: { proposalId: id } });
      const single = roster.length === 1 && participants.length === 1 && participants[0]!.userId === context.actorId && context.actorId === context.project.ownerId;
      const next = await context.tx.projectContributionProposal.update({ where: { id }, data: { status: single ? "SELF_RECORDED" : "SUBMITTED" } });
      await history(context, next, "SUBMITTED");
      await contributionsNotify(context, [...roster.map(p => p.userId), ...participants.map(p => p.userId)], "SUBMITTED", id, row.version);
      return present(context, next);
    });
  },
  async review(projectId: string, actorId: string, id: string, input: z.infer<typeof contributionReviewSchema>) {
    return withWorkRecord(projectId, actorId, id, true, async context => {
      const row = await record(context, id); expectWorkspaceVersion(row.version, input.expectedVersion);
      const existing = await context.tx.contributionReview.findUnique({ where: { proposalId_version_userId_decision: { proposalId: id, version: row.version, userId: context.actorId, decision: input.decision } } });
      if (existing) {
        if (existing.decision !== input.decision || existing.note !== input.note) throw AppError.conflict("This revision already has your response; use a correction revision");
        return present(context, row);
      }
      if (row.source === "LEGACY" || !["SUBMITTED", "ACCEPTED", "SELF_RECORDED"].includes(row.status)) throw AppError.conflict("This record is not open for acknowledgement");
      const participants = await context.tx.contributionParticipant.findMany({ where: { proposalId: id } });
      const named = participants.some(p => p.userId === context.actorId);
      if (["ACKNOWLEDGE", "ACCEPT"].includes(input.decision) && await contributionEvidenceChanged(context.tx, context.project.id, id, row.version, row.evidenceRefs as unknown as ContributionArtifactLink[])) throw AppError.conflict("Linked evidence changed after submission. Request a corrected record and review its new version.");
      const correctingChallenge = Boolean(await context.tx.contributionReview.findFirst({ where: { proposalId: id, userId: context.actorId, version: { lt: row.version }, decision: { in: ["DISPUTE", "NEEDS_CHANGES"] } } }));
      if (input.decision === "ACCEPT" && (!context.role || named || row.proposedById === context.actorId)) throw AppError.forbidden("Independent reviewers must be current peers outside the named contributors");
      if (input.decision === "ACKNOWLEDGE" && !named && !correctingChallenge) throw AppError.forbidden("Only named participants or affected correction reviewers can acknowledge");
      if (context.actorId === row.proposedById) throw AppError.forbidden("Record creators cannot review their own work");
      await context.tx.contributionReview.create({ data: { proposalId: id, version: row.version, userId: context.actorId, decision: input.decision, note: input.note } });
      const reviews = await context.tx.contributionReview.findMany({ where: { proposalId: id, version: row.version } });
      const acknowledged = participants.every(p => p.userId === row.proposedById || reviews.some(r => r.userId === p.userId && r.decision === "ACKNOWLEDGE"));
      const team = await context.tx.projectMember.findMany({ where: { projectId: context.project.id, status: "ACTIVE" }, select: { userId: true } });
      const selfRecorded = acknowledged && team.every(p => p.userId === row.proposedById || participants.some(named => named.userId === p.userId));
      const status = input.decision === "DISPUTE" ? "DISPUTED" : input.decision === "NEEDS_CHANGES" ? "NEEDS_CHANGES" : acknowledged && reviews.some(r => r.decision === "ACCEPT") ? "ACCEPTED" : selfRecorded ? "SELF_RECORDED" : row.status;
      const next = await context.tx.projectContributionProposal.update({ where: { id }, data: { status } });
      await history(context, next, input.decision, input.note);
      await contributionsNotify(context, [row.proposedById, ...participants.map(p => p.userId)], input.decision, id, row.version);
      return present(context, next);
    });
  },
};
