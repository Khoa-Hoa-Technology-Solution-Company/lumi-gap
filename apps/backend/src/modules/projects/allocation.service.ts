import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import {
  contributionCategories,
  inferContributionCategoryFromRoles,
  type AllocationDraftInput,
  type AllocationPeriodInput,
  type AllocationPeriodView,
  type AllocationRevisionView,
  type AllocationRosterPerson,
  type AllocationShareInput,
  type ContributionCategoryKey,
  type ContributionMatrixCategoryInput,
  type ContributionMatrixView,
  type CreditRole,
} from "@trend/shared-types";
import type { AllocationPeriod, AllocationRevision } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, workspaceId, workspacePeople, workspacePerson, jsonSnapshot, expectWorkspaceVersion, type WorkspaceContext } from "./workspace-access.js";
import { assertActiveProjectAccount, lockProjectAccounts } from "./project-transaction.js";
import { contributionsNotify } from "./contributions-notification.js";
import { evaluationAllocationReference } from "./contribution-evaluation.service.js";
import { calculateContributionMatrix } from "./contribution-matrix.calculator.js";
import { Prisma } from "../../generated/prisma/client.js";

export function assertAllocationShares(shares: AllocationShareInput[], roster: { id: string }[], submission = true) {
  const ids = shares.map(s => s.userId);
  if (new Set(ids).size !== ids.length || ids.length !== roster.length || roster.some(p => !ids.includes(p.id))) throw AppError.badRequest("Every eligible participant must appear exactly once");
  if (shares.some(s => !Number.isInteger(s.basisPoints) || s.basisPoints < 0 || s.basisPoints > 10000)) throw AppError.badRequest("Use integer basis points between 0 and 10000");
  if (submission && shares.reduce((total, s) => total + s.basisPoints, 0) !== 10000) throw AppError.badRequest("Shares must total exactly 10000 basis points");
  if (submission && shares.some(s => s.basisPoints === 0 && s.rationale.trim().length < 10)) throw AppError.badRequest("Explain every zero-percent share; the participant must still consent");
}
export async function eligibleAllocationRoster(context: WorkspaceContext, period: AllocationPeriod): Promise<AllocationRosterPerson[]> {
  const intervals = await context.tx.projectMembershipPeriod.findMany({ where: { projectId: context.project.id, joinedAt: { lte: period.periodEnd }, OR: [{ leftAt: null }, { leftAt: { gte: period.periodStart } }] } });
  // A team member's documented work during this scope preserves their claim even after departure.
  const work = await context.tx.projectContributionProposal.findMany({ where: { projectId: context.project.id, workDate: { gte: period.periodStart, lte: period.periodEnd }, status: { not: "DRAFT" } }, select: { id: true } });
  const claims = await context.tx.contributionParticipant.findMany({ where: { proposalId: { in: work.map(c => c.id) } } });
  // A correction cannot erase previously submitted attribution from eligibility.
  const historicalClaims = await context.tx.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT participant->>'userId' AS "userId"
    FROM project_contribution_history h
    JOIN project_contribution_proposals c ON c.id=h.proposal_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(h.snapshot->'participants','[]'::jsonb)) participant
    WHERE c.project_id=${context.project.id}::uuid
      AND h.snapshot->>'status' IN ('SUBMITTED','ACCEPTED','SELF_RECORDED','DISPUTED','NEEDS_CHANGES','CONFIRMED')
      AND (h.snapshot->>'workDate')::timestamptz BETWEEN ${period.periodStart} AND ${period.periodEnd}`;
  const claimants = [...claims, ...historicalClaims];
  const team = await context.tx.projectMembershipPeriod.findMany({ where: { projectId: context.project.id, userId: { in: claimants.map(p => p.userId) } }, select: { userId: true } });
  const teamIds = new Set(team.map(p => p.userId));
  const reasons = new Map<string, Set<string>>();
  const add = (id: string, reason: string) => { const set = reasons.get(id) ?? new Set(); set.add(reason); reasons.set(id, set); };
  for (const p of intervals) add(p.userId, p.provenance === "LEGACY_RETAINED" ? "LEGACY_RETAINED_MEMBERSHIP" : "MEMBERSHIP_DURING_PERIOD");
  for (const p of claimants) if (teamIds.has(p.userId)) add(p.userId, "DOCUMENTED_TEAM_WORK");
  const people = await workspacePeople(context.tx, [...reasons.keys()]);
  const accounts = await context.tx.user.findMany({ where: { id: { in: [...reasons.keys()] } }, select: { id: true, isActive: true, accountStatus: true, emailVerifiedAt: true } });
  return [...reasons].sort(([a], [b]) => a.localeCompare(b)).map(([id, why]) => ({ ...workspacePerson(people, id), reasons: [...why].sort(), unavailable: !accounts.some(a => a.id === id && a.isActive && a.accountStatus === "ACTIVE" && a.emailVerifiedAt) }));
}
async function requirePeriod(context: WorkspaceContext, id: string) {
  const row = await context.tx.allocationPeriod.findFirst({ where: { id, projectId: context.project.id } });
  if (!row) throw AppError.notFound("Allocation period not found");
  return row;
}
async function periodView(context: WorkspaceContext, row: AllocationPeriod): Promise<AllocationPeriodView> {
  const roster = await eligibleAllocationRoster(context, row);
  return { id: row.id, title: row.title, description: row.description, scope: row.scope, periodStart: row.periodStart.toISOString(), periodEnd: row.periodEnd.toISOString(), policyVersion: row.policyVersion, roster, historyIncomplete: roster.some(p => p.reasons.includes("LEGACY_RETAINED_MEMBERSHIP")) };
}
async function requireRevision(context: WorkspaceContext, id: string) {
  const row = await context.tx.allocationRevision.findFirst({ where: { id, projectId: context.project.id } });
  if (!row) throw AppError.notFound("Allocation revision not found");
  return row;
}
const frozenRoster = (row: AllocationRevision) => row.roster as unknown as AllocationRosterPerson[];
/** Former participants get allocation summaries only; this never authorizes a workspace read. */
async function withAllocation<T>(projectId: string, actorId: string, periodId: string | null, write: boolean, run: (c: WorkspaceContext) => Promise<T>) {
  const db = getPrisma();
  const [project, actor] = await Promise.all([db.project.findUnique({ where: workspaceId(projectId) }), db.user.findUnique({ where: workspaceId(actorId) })]);
  if (!project || !actor) throw AppError.notFound("Allocation not found");
  return db.$transaction(async tx => {
    await lockProjectAccounts(tx, [actor.id], project.id); await assertActiveProjectAccount(tx, actor.id);
    const live = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: live.id, userId: actor.id } } });
    const role = live.ownerId === actor.id ? "OWNER" : member?.status === "ACTIVE" ? "MEMBER" : null;
    const context: WorkspaceContext = { tx, project: live, actorId: actor.id, role };
    if (!role) {
      if (!periodId) throw AppError.notFound("Allocation not found");
      const period = await requirePeriod(context, periodId);
      const eligible = await eligibleAllocationRoster(context, period);
      if (!eligible.some(p => p.id === actor.id)) {
        const submitted = await tx.allocationRevision.findMany({ where: { periodId, projectId: live.id, submittedAt: { not: null } }, select: { roster: true } });
        if (!submitted.some(r => (r.roster as unknown as AllocationRosterPerson[]).some(p => p.id === actor.id))) throw AppError.notFound("Allocation not found");
      }
    }
    if (write && live.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    return run(context);
  }, { maxWait: 10000, timeout: 20000 });
}
async function revisionViews(context: WorkspaceContext, rows: AllocationRevision[]): Promise<AllocationRevisionView[]> {
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const actorIds = [
    ...rows.map(row => row.createdById),
    ...rows.map(row => row.finalizedById).filter((id): id is string => Boolean(id)),
  ];
  const [periods, shares, approvals, challenges, people] = await Promise.all([
    context.tx.allocationPeriod.findMany({ where: { id: { in: [...new Set(rows.map(row => row.periodId))] }, projectId: context.project.id } }),
    context.tx.allocationShare.findMany({ where: { revisionId: { in: ids } }, orderBy: { userId: "asc" } }),
    context.tx.allocationApproval.findMany({ where: { revisionId: { in: ids } }, orderBy: { createdAt: "asc" } }),
    context.tx.projectActivity.findMany({ where: { projectId: context.project.id, entityId: { in: ids }, type: "ALLOCATION_ROSTER_CHALLENGED" }, orderBy: { createdAt: "asc" } }),
    workspacePeople(context.tx, actorIds),
  ]);
  // Submitted history is presented from frozen rosters. Recomputing live
  // eligibility for each historical revision was both expensive and misleading.
  return rows.map(row => {
    const period = periods.find(p => p.id === row.periodId)!;
    const revisionShares = shares.filter(s => s.revisionId === row.id);
    const revisionApprovals = approvals.filter(a => a.revisionId === row.id);
    const roster = frozenRoster(row);
    return {
      id: row.id,
      revision: row.revision,
      draftVersion: row.draftVersion,
      status: row.status as AllocationRevisionView["status"],
      period: { id: period.id, title: period.title, description: period.description, scope: period.scope, periodStart: period.periodStart.toISOString(), periodEnd: period.periodEnd.toISOString(), policyVersion: period.policyVersion, roster, historyIncomplete: roster.some(p => p.reasons.includes("LEGACY_RETAINED_MEMBERSHIP")) },
      rationale: row.rationale,
      roster,
      shares: revisionShares,
      matrix: (row.matrix as unknown as ContributionMatrixView | null) ?? null,
      approvals: revisionApprovals.map(a => ({ userId: a.userId, decision: a.decision as "APPROVE" | "DISPUTE", explanation: a.explanation, createdAt: a.createdAt.toISOString() })),
      rosterChallenges: challenges.filter(c => c.entityId === row.id).map(c => ({ userId: c.actorId!, explanation: (c.metadata as { explanation: string }).explanation, createdAt: c.createdAt.toISOString() })),
      evidenceSummary: row.evidenceSummary as unknown as AllocationRevisionView["evidenceSummary"],
      submittedAt: row.submittedAt?.toISOString() ?? null,
      finalizedAt: row.finalizedAt?.toISOString() ?? null,
      finalizedBy: row.finalizedById ? workspacePerson(people, row.finalizedById) : null,
      proposedBy: workspacePerson(people, row.createdById),
      selfAcknowledged: row.selfAcknowledged,
      evaluationReference: row.evaluationReference as unknown as AllocationRevisionView["evaluationReference"],
      canChallengeRoster: row.status === "AWAITING_APPROVAL" && context.project.status !== "ARCHIVED",
      canManage: context.role === "OWNER" && context.project.status !== "ARCHIVED",
      canRespond: row.status === "AWAITING_APPROVAL" && context.project.status !== "ARCHIVED" && roster.some(p => p.id === context.actorId) && !revisionApprovals.some(a => a.userId === context.actorId),
    };
  });
}
async function revisionView(context: WorkspaceContext, row: AllocationRevision) { return (await revisionViews(context, [row]))[0]!; }
async function audit(context: WorkspaceContext, row: AllocationRevision, type: string) {
  await context.tx.projectActivity.create({ data: { projectId: context.project.id, actorId: context.actorId, type, entityKind: "ALLOCATION", entityId: row.id, artifactVersion: row.revision, sourceModule: "ALLOCATION", idempotencyKey: `${row.id}:${type}:${context.actorId}`, metadata: { revision: row.revision, status: row.status } } });
}
async function evidenceSummary(context: WorkspaceContext, period: AllocationPeriod) {
  const rows = await context.tx.projectContributionProposal.findMany({ where: { projectId: context.project.id, workDate: { gte: period.periodStart, lte: period.periodEnd }, status: { in: ["ACCEPTED", "SELF_RECORDED", "SUBMITTED", "DISPUTED", "CONFIRMED"] } }, orderBy: { createdAt: "asc" }, take: 500 });
  const participants = await context.tx.contributionParticipant.findMany({ where: { proposalId: { in: rows.map(r => r.id) } } });
  // Deliberately omit private evidence URLs, artifact text and review explanations.
  return rows.map(r => {
    const rawCat = (r as { category?: string | null }).category;
    const category: ContributionCategoryKey =
      r.source !== "LEGACY" && rawCat && (contributionCategories as readonly string[]).includes(rawCat)
        ? (rawCat as ContributionCategoryKey)
        : inferContributionCategoryFromRoles((r.roles ?? []) as CreditRole[]);
    return {
      id: r.id,
      title: r.title,
      category,
      status: r.status,
      source: (r.source === "WORKSPACE" ? "WORKSPACE" : "MANUAL") as "MANUAL" | "WORKSPACE",
      workDate: r.workDate.toISOString(),
      participants: participants.filter(p => p.proposalId === r.id).map(p => p.userId),
    };
  });
}

async function resolveAllocationSharesAndMatrix(
  context: WorkspaceContext,
  roster: AllocationRosterPerson[],
  input: { shares?: AllocationShareInput[]; matrix?: { categories: ContributionMatrixCategoryInput[] } | null },
  requireComplete: boolean,
): Promise<{ shares: AllocationShareInput[]; matrix: ContributionMatrixView | null }> {
  if (input.matrix) {
    const projectProposals = await context.tx.projectContributionProposal.findMany({
      where: { projectId: context.project.id },
      select: { id: true },
    });
    const allowedEvidenceIds = new Set(projectProposals.map(p => p.id));
    const calculated = calculateContributionMatrix({
      rosterUserIds: roster.map(p => p.id),
      categories: input.matrix.categories,
      requireComplete,
      allowedEvidenceIds,
    });
    const customRationales = new Map(
      (input.shares ?? []).map(s => [s.userId, s.rationale.trim()]),
    );
    const mergedShares = calculated.shares.map(s => {
      const custom = customRationales.get(s.userId);
      return custom && custom.length >= 10 ? { ...s, rationale: custom } : s;
    });
    assertAllocationShares(mergedShares, roster, requireComplete);
    return { shares: mergedShares, matrix: calculated.matrix };
  }
  if (!input.shares || input.shares.length === 0) {
    throw AppError.badRequest("Provide allocation matrix or member shares");
  }
  assertAllocationShares(input.shares, roster, requireComplete);
  return { shares: input.shares, matrix: null };
}

export const allocationService = {
  async periods(projectId: string, actorId: string) { return withWorkspace(projectId, actorId, {}, async context => Promise.all((await context.tx.allocationPeriod.findMany({ where: { projectId: context.project.id }, orderBy: { createdAt: "desc" }, take: 100 })).map(row => periodView(context, row)))); },
  async createPeriod(projectId: string, actorId: string, input: AllocationPeriodInput) {
    return withWorkspace(projectId, actorId, { write: true, owner: true }, async context => {
      const previous = await context.tx.allocationPeriod.findUnique({ where: { projectId_clientKey: { projectId: context.project.id, clientKey: input.clientKey } } });
      if (previous) {
        if (previous.createdById !== context.actorId || previous.title !== input.title || previous.description !== input.description || previous.scope !== input.scope || previous.periodStart.toISOString() !== new Date(input.periodStart).toISOString() || previous.periodEnd.toISOString() !== new Date(input.periodEnd).toISOString()) throw AppError.conflict("Request key was used with different content");
        return periodView(context, previous);
      }
      if (new Date(input.periodEnd) > new Date() || new Date(input.periodEnd) < context.project.createdAt || new Date(input.periodEnd) < new Date(input.periodStart)) throw AppError.badRequest("Select a completed scope within the project lifetime");
      const row = await context.tx.allocationPeriod.create({ data: { ...input, periodStart: new Date(input.periodStart), periodEnd: new Date(input.periodEnd), projectId: context.project.id, createdById: context.actorId } });
      return periodView(context, row);
    });
  },
  async period(projectId: string, actorId: string, periodId: string) { return withAllocation(projectId, actorId, periodId, false, async context => periodView(context, await requirePeriod(context, periodId))); },
  async history(projectId: string, actorId: string, periodId: string) {
    return withAllocation(projectId, actorId, periodId, false, async context => {
      await requirePeriod(context, periodId);
      const rows = await context.tx.allocationRevision.findMany({ where: { periodId, projectId: context.project.id, ...(context.role ? {} : { submittedAt: { not: null } }) }, orderBy: { revision: "desc" }, take: 100 });
      return revisionViews(context, rows);
    });
  },
  async draft(projectId: string, actorId: string, periodId: string, input: AllocationDraftInput) {
    return withWorkspace(projectId, actorId, { write: true, owner: true }, async context => {
      const period = await requirePeriod(context, periodId);
      const previous = await context.tx.allocationRevision.findUnique({ where: { periodId_clientKey: { periodId, clientKey: input.clientKey } } });
      if (previous) {
        const saved = await context.tx.projectActivity.findFirst({ where: { projectId: context.project.id, entityId: previous.id, type: "ALLOCATION_DRAFT_CREATED" } });
        if (!isDeepStrictEqual((saved?.metadata as { input?: unknown })?.input, jsonSnapshot(input))) throw AppError.conflict("Request key was used with different content");
        return revisionView(context, previous);
      }
      const last = await context.tx.allocationRevision.findFirst({ where: { periodId }, orderBy: { revision: "desc" } });
      if (last && ["DRAFT", "AWAITING_APPROVAL"].includes(last.status)) throw AppError.conflict("Resolve the current proposal before creating a revision");
      const roster = await eligibleAllocationRoster(context, period);
      const resolved = await resolveAllocationSharesAndMatrix(context, roster, input, false);
      const reference = await evaluationAllocationReference(context, periodId, input.evaluationSnapshotId, resolved.shares);
      const row = await context.tx.allocationRevision.create({ data: { evaluationSnapshotId: input.evaluationSnapshotId, ...(reference ? { evaluationReference: jsonSnapshot(reference) } : {}), ...(resolved.matrix ? { matrix: jsonSnapshot(resolved.matrix) } : {}), periodId, projectId: context.project.id, revision: (last?.revision ?? 0) + 1, createdById: context.actorId, roster: jsonSnapshot(roster), rationale: input.rationale, clientKey: input.clientKey, evidenceSummary: jsonSnapshot(await evidenceSummary(context, period)), selfAcknowledged: roster.length === 1 } });
      await context.tx.allocationShare.createMany({ data: resolved.shares.map(s => ({ ...s, revisionId: row.id })) });
      await context.tx.projectActivity.create({ data: { projectId: context.project.id, actorId: context.actorId, type: "ALLOCATION_DRAFT_CREATED", entityKind: "ALLOCATION", entityId: row.id, metadata: jsonSnapshot({ input }) } });
      return revisionView(context, row);
    });
  },
  async edit(projectId: string, actorId: string, id: string, input: { shares?: AllocationShareInput[]; matrix?: { categories: ContributionMatrixCategoryInput[] } | null; rationale: string; expectedVersion: number; evaluationSnapshotId?: string | null }) {
    return withWorkspace(projectId, actorId, { write: true, owner: true }, async context => {
      const row = await requireRevision(context, id); expectWorkspaceVersion(row.draftVersion, input.expectedVersion);
      if (row.status !== "DRAFT") throw AppError.conflict("Submitted revisions are immutable; create a new revision");
      const roster = await eligibleAllocationRoster(context, await requirePeriod(context, row.periodId));
      const resolved = await resolveAllocationSharesAndMatrix(context, roster, input, false);
      const snapshotId = input.evaluationSnapshotId === undefined ? row.evaluationSnapshotId : input.evaluationSnapshotId;
      const reference = await evaluationAllocationReference(context, row.periodId, snapshotId, resolved.shares);
      await context.tx.allocationShare.deleteMany({ where: { revisionId: id } });
      await context.tx.allocationShare.createMany({ data: resolved.shares.map(s => ({ ...s, revisionId: id })) });
      const nextMatrix = input.matrix === undefined
        ? (row.matrix ? jsonSnapshot(row.matrix) : Prisma.DbNull)
        : (resolved.matrix ? jsonSnapshot(resolved.matrix) : Prisma.DbNull);
      const next = await context.tx.allocationRevision.update({ where: { id }, data: { evaluationSnapshotId: snapshotId, evaluationReference: reference ? jsonSnapshot(reference) : Prisma.DbNull, matrix: nextMatrix, rationale: input.rationale, roster: jsonSnapshot(roster), draftVersion: { increment: 1 }, selfAcknowledged: roster.length === 1 } });
      return revisionView(context, next);
    });
  },
  async submit(projectId: string, actorId: string, id: string, expectedVersion: number) {
    return withWorkspace(projectId, actorId, { write: true, owner: true }, async context => {
      const row = await requireRevision(context, id); expectWorkspaceVersion(row.draftVersion, expectedVersion);
      if (row.submittedAt) return revisionView(context, row);
      if (row.status !== "DRAFT") throw AppError.conflict("Only drafts can be submitted");
      const period = await requirePeriod(context, row.periodId), roster = await eligibleAllocationRoster(context, period);
      let shares = await context.tx.allocationShare.findMany({ where: { revisionId: id } });
      let validatedMatrix: ContributionMatrixView | null = null;
      if (row.matrix) {
        const storedMatrix = row.matrix as unknown as ContributionMatrixView;
        const resolved = await resolveAllocationSharesAndMatrix(
          context,
          roster,
          { shares, matrix: { categories: storedMatrix.categories } },
          true,
        );
        validatedMatrix = resolved.matrix;
        await context.tx.allocationShare.deleteMany({ where: { revisionId: id } });
        await context.tx.allocationShare.createMany({ data: resolved.shares.map(s => ({ ...s, revisionId: id })) });
        shares = await context.tx.allocationShare.findMany({ where: { revisionId: id } });
      }
      assertAllocationShares(shares, roster);
      await evaluationAllocationReference(context, row.periodId, row.evaluationSnapshotId, shares);
      if (row.rationale.trim().length < 20) throw AppError.badRequest("Explain the effort distribution and evaluation scope");
      const next = await context.tx.allocationRevision.update({ where: { id }, data: { status: "AWAITING_APPROVAL", submittedAt: new Date(), ...(validatedMatrix ? { matrix: jsonSnapshot(validatedMatrix) } : {}), roster: jsonSnapshot(roster), evidenceSummary: jsonSnapshot(await evidenceSummary(context, period)), selfAcknowledged: roster.length === 1 } });
      await audit(context, next, "ALLOCATION_SUBMITTED");
      await contributionsNotify(context, roster.map(p => p.id), "ALLOCATION_SUBMITTED", id, row.revision, true);
      return revisionView(context, next);
    });
  },
  async detail(projectId: string, actorId: string, id: string) {
    const row = await getPrisma().allocationRevision.findUnique({ where: { id }, select: { periodId: true } });
    if (!row) throw AppError.notFound("Allocation not found");
    return withAllocation(projectId, actorId, row.periodId, false, async context => {
      const revision = await requireRevision(context, id);
      if (!context.role && !revision.submittedAt) throw AppError.notFound("Allocation not found");
      return revisionView(context, revision);
    });
  },
  async decide(projectId: string, actorId: string, id: string, input: { decision: "APPROVE" | "DISPUTE"; explanation: string }) {
    const lookup = await getPrisma().allocationRevision.findUnique({ where: { id }, select: { periodId: true } });
    if (!lookup) throw AppError.notFound("Allocation not found");
    return withAllocation(projectId, actorId, lookup.periodId, true, async context => {
      const row = await requireRevision(context, id), roster = frozenRoster(row);
      if (!roster.some(p => p.id === context.actorId)) throw AppError.forbidden("Only frozen participants can respond");
      const old = await context.tx.allocationApproval.findUnique({ where: { revisionId_userId: { revisionId: id, userId: context.actorId } } });
      if (old) {
        if (old.decision !== input.decision || old.explanation !== input.explanation) throw AppError.conflict("Your decision is immutable; request an amendment");
        return revisionView(context, row);
      }
      if (row.status !== "AWAITING_APPROVAL") throw AppError.conflict("This revision is no longer awaiting approval");
      if (input.decision === "DISPUTE" && input.explanation.trim().length < 10) throw AppError.badRequest("Explain the objection");
      const eligible = await eligibleAllocationRoster(context, await requirePeriod(context, row.periodId));
      if (!isDeepStrictEqual(eligible.map(p => p.id), roster.map(p => p.id))) {
        const disputed = await context.tx.allocationRevision.update({ where: { id }, data: { status: "DISPUTED" } });
        await audit(context, disputed, "ALLOCATION_ROSTER_CHANGED");
        await contributionsNotify(context, [...eligible.map(p => p.id), ...roster.map(p => p.id), context.project.ownerId], "ROSTER_CHANGED", id, row.revision, true);
        return revisionView(context, disputed);
      }
      const shares = await context.tx.allocationShare.findMany({ where: { revisionId: id } }); assertAllocationShares(shares, roster);
      await context.tx.allocationApproval.create({ data: { revisionId: id, userId: context.actorId, ...input } });
      let next = row;
      if (input.decision === "DISPUTE") {
        next = await context.tx.allocationRevision.update({ where: { id }, data: { status: "DISPUTED" } });
        await audit(context, next, "ALLOCATION_DISPUTED");
      } else {
        const approvals = await context.tx.allocationApproval.findMany({ where: { revisionId: id } });
        if (roster.every(p => approvals.some(a => a.userId === p.id && a.decision === "APPROVE"))) {
          const former = await context.tx.allocationRevision.findFirst({ where: { periodId: row.periodId, status: "FINALIZED" } });
          if (former) { const superseded = await context.tx.allocationRevision.update({ where: { id: former.id }, data: { status: "SUPERSEDED" } }); await audit(context, superseded, "ALLOCATION_SUPERSEDED"); }
          next = await context.tx.allocationRevision.update({ where: { id }, data: { status: "FINALIZED", finalizedAt: new Date(), finalizedById: context.actorId } });
          await audit(context, next, "ALLOCATION_FINALIZED");
        } else await audit(context, row, "ALLOCATION_APPROVED");
      }
      await contributionsNotify(context, [...roster.map(p => p.id), context.project.ownerId], `ALLOCATION_${next.status}_${context.actorId}`, id, row.revision, true);
      return revisionView(context, next);
    });
  },
  async export(projectId: string, actorId: string, id: string) {
    const result = await allocationService.detail(projectId, actorId, id);
    if (!["FINALIZED", "SUPERSEDED"].includes(result.status)) throw AppError.conflict("Only finalized historical allocations can be exported");
    const exported = { ...result, exportedAt: new Date().toISOString(), meaning: "Team-agreed effort distribution for this scope only. Not a grade, legal entitlement, authorship eligibility, author order or scientific quality score." };
    const resolvedProjectId = (await getPrisma().allocationRevision.findUnique({ where: { id: result.id }, select: { projectId: true } }))?.projectId;
    if (resolvedProjectId) {
      await researchLedgerService.record({ projectId: resolvedProjectId, actorId, eventType: "ALLOCATION_EXPORTED", resourceKind: "ALLOCATION_REVISION", resourceId: result.id, currentVersionRef: String(result.revision), checksumSha256: createHash("sha256").update(JSON.stringify(result)).digest("hex"), visibility: "PROJECT_TEAM", retentionClass: "SECURITY_AUDIT", metadata: { periodId: result.period.id, status: result.status } });
    }
    return exported;
  },
  async challenge(projectId: string, actorId: string, periodId: string, input: { revisionId: string; explanation: string }) {
    return withAllocation(projectId, actorId, periodId, true, async context => {
      const row = await requireRevision(context, input.revisionId);
      if (row.periodId !== periodId) throw AppError.notFound("Allocation not found");
      const key = `roster-challenge:${row.id}:${context.actorId}`;
      const old = await context.tx.projectActivity.findUnique({ where: { projectId_idempotencyKey: { projectId: context.project.id, idempotencyKey: key } } });
      if (old) {
        if ((old.metadata as { explanation?: string }).explanation !== input.explanation) throw AppError.conflict("This roster challenge is already recorded");
        return revisionView(context, row);
      }
      if (row.status !== "AWAITING_APPROVAL") throw AppError.conflict("Challenge an awaiting proposal; finalized records require an amendment");
      const next = await context.tx.allocationRevision.update({ where: { id: row.id }, data: { status: "DISPUTED" } });
      await context.tx.projectActivity.create({ data: { projectId: context.project.id, actorId: context.actorId, type: "ALLOCATION_ROSTER_CHALLENGED", entityKind: "ALLOCATION", entityId: row.id, idempotencyKey: key, metadata: { explanation: input.explanation } } });
      await contributionsNotify(context, [...frozenRoster(row).map(p => p.id), context.project.ownerId], "ROSTER_CHALLENGED", row.id, row.revision, true);
      return revisionView(context, next);
    });
  },
};
