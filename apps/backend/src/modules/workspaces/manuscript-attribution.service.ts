import { createHash } from "node:crypto";
import { z } from "zod";
import {
  creditRoles,
  type CreditRole,
  type DetectedScopeContributor,
  type ManuscriptAttributionCheckView,
  type ManuscriptAttributionDecisionView,
  type ManuscriptAttributionStatus,
  type ProposedManuscriptAcknowledgement,
  type ProposedManuscriptAuthor,
  type ReviewedNonAuthorJustification,
  type SaveManuscriptAttributionInput,
} from "@trend/shared-types";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import { assertActiveProjectAccount, lockProjectAccounts } from "../projects/project-transaction.js";
import { jsonSnapshot, workspacePeople } from "../projects/workspace-access.js";

type Db = Prisma.TransactionClient;

const EXTERNAL_SUBMISSION_NOTICE =
  "LumiGap verifies attribution before internal platform submission and peer-review sealing. It cannot technically prevent external journal submission outside LumiGap, but preserves timestamped SHA-256 contribution and attribution evidence for institutional review.";

export const saveManuscriptAttributionSchema = z
  .object({
    proposedAuthors: z
      .array(
        z
          .object({
            userId: z.string().uuid(),
            order: z.number().int().positive().max(200),
            creditRoles: z
              .array(z.enum(creditRoles))
              .min(1, "Assign at least one CRediT contribution role per author")
              .max(creditRoles.length)
              .refine(r => new Set(r).size === r.length, "Duplicate CRediT role"),
            rationale: z.string().trim().max(1000).optional().default(""),
          })
          .strict(),
      )
      .min(1, "Propose at least one manuscript author")
      .max(200),
    acknowledgements: z
      .array(
        z
          .object({
            userId: z.string().uuid().nullable().optional(),
            name: z.string().trim().min(1).max(200),
            affiliation: z.string().trim().max(240).optional().default(""),
            contributionSummary: z.string().trim().min(3).max(1000),
            creditRoles: z
              .array(z.enum(creditRoles))
              .max(creditRoles.length)
              .optional()
              .default([]),
          })
          .strict(),
      )
      .max(200)
      .optional()
      .default([]),
    acknowledgementText: z.string().trim().max(5000).optional().default(""),
    omittedContributors: z
      .array(
        z
          .object({
            userId: z.string().uuid(),
            justification: z.string().trim().min(5, "Explain why this contributor is not listed as an author or acknowledged").max(1000),
          })
          .strict(),
      )
      .max(200)
      .optional()
      .default([]),
  })
  .strict();

export const manuscriptAttributionDecisionSchema = z
  .object({
    decision: z.enum(["CONFIRM", "CLARIFY", "DISPUTE"]),
    note: z.string().trim().max(2000).optional().default(""),
  })
  .strict()
  .refine(
    v => v.decision === "CONFIRM" || v.note.length >= 3,
    "Provide a note when requesting clarification or disputing attribution",
  );

function formatBasisPoints(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  return `${whole}.${String(frac).padStart(2, "0")}%`;
}

async function gatherScopeState(
  tx: Db,
  projectId: string,
  manuscriptId: string,
  snapshotId: string,
) {
  const [project, draft, snapshot] = await Promise.all([
    tx.project.findUnique({ where: { id: projectId } }),
    tx.draftWorkspace.findFirst({
      where: { id: manuscriptId, projectId, writingMode: "LATEX", deletedAt: null },
    }),
    tx.manuscriptSnapshot.findFirst({
      where: { id: snapshotId, workspaceId: manuscriptId, projectId },
    }),
  ]);
  if (!project || !draft || !snapshot) {
    throw AppError.notFound("Manuscript snapshot not found");
  }

  const [
    members,
    periods,
    files,
    updateActors,
    acceptedSuggestions,
    writingReport,
    successfulCompilations,
    proposals,
    revisions,
    mentorAccesses,
    mentorRelationships,
    openIntegrityCases,
    latestCheck,
  ] = await Promise.all([
    tx.projectMember.findMany({ where: { projectId } }),
    tx.projectMembershipPeriod.findMany({ where: { projectId } }),
    tx.manuscriptFile.findMany({
      where: { workspaceId: manuscriptId, deletedAt: null },
      select: { id: true, createdById: true },
    }),
    tx.manuscriptUpdate.findMany({
      where: { fileId: { in: (await tx.manuscriptFile.findMany({ where: { workspaceId: manuscriptId }, select: { id: true } })).map(f => f.id) } },
      distinct: ["actorId"],
      select: { actorId: true },
    }),
    tx.manuscriptSuggestion.findMany({
      where: { workspaceId: manuscriptId, status: "ACCEPTED" },
      select: { authorId: true },
    }),
    tx.manuscriptWritingReport.findUnique({ where: { snapshotId } }),
    tx.manuscriptCompilation.count({ where: { snapshotId, status: "SUCCESS" } }),
    tx.projectContributionProposal.findMany({
      where: { projectId, status: { not: "DRAFT" } },
    }),
    tx.allocationRevision.findMany({
      where: { projectId, status: { in: ["FINALIZED", "DISPUTED", "AWAITING_APPROVAL"] } },
      orderBy: [{ createdAt: "desc" }, { revision: "desc" }],
    }),
    tx.mentorAccess.findMany({ where: { projectId } }),
    tx.mentorRelationship.findMany({ where: { projectId } }),
    tx.researchIntegrityCase.findMany({
      where: {
        projectId,
        kind: { in: ["CONTRIBUTION_DISPUTE", "ATTRIBUTION_DISPUTE"] },
        status: { in: ["REPORTED", "CONTAINED", "UNDER_REVIEW", "ESCALATED"] },
      },
    }),
    tx.manuscriptAttributionCheck.findFirst({
      where: { snapshotId, projectId, workspaceId: manuscriptId, status: { not: "SUPERSEDED" } },
      orderBy: { version: "desc" },
    }),
  ]);

  const proposalIds = proposals.map(p => p.id);
  const participants = proposalIds.length
    ? await tx.contributionParticipant.findMany({ where: { proposalId: { in: proposalIds } } })
    : [];

  const referenceRevision =
    revisions.find(r => r.status === "FINALIZED") ??
    revisions.find(r => r.status === "AWAITING_APPROVAL") ??
    null;
  const allocationShares = referenceRevision
    ? await tx.allocationShare.findMany({ where: { revisionId: referenceRevision.id } })
    : [];

  const accessIds = mentorAccesses.map(a => a.id);
  const [mentorAgreements, mentorFeedbacks] = accessIds.length
    ? await Promise.all([
        tx.mentorAgreement.findMany({
          where: { accessId: { in: accessIds }, status: "ACCEPTED" },
        }),
        tx.mentorFeedback.findMany({
          where: {
            accessId: { in: accessIds },
            status: { in: ["ACCEPTED", "RESOLVED"] },
          },
        }),
      ])
    : [[], []];

  const decisions = latestCheck
    ? await tx.manuscriptAttributionDecision.findMany({
        where: { checkId: latestCheck.id },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const sourceMap = new Map<string, Set<string>>();
  const roleMap = new Map<string, Set<CreditRole>>();
  const retainedWordsMap = new Map<string, number>();
  const addSource = (userId: string, label: string) => {
    if (!sourceMap.has(userId)) sourceMap.set(userId, new Set());
    sourceMap.get(userId)!.add(label);
  };
  const addRoles = (userId: string, roles: string[]) => {
    if (!roleMap.has(userId)) roleMap.set(userId, new Set());
    for (const r of roles) {
      if ((creditRoles as readonly string[]).includes(r)) {
        roleMap.get(userId)!.add(r as CreditRole);
      }
    }
  };

  addSource(draft.createdById, "Manuscript workspace creator");
  addSource(snapshot.createdById, "Snapshot creator");
  for (const f of files) addSource(f.createdById, "Manuscript file contributor");
  for (const u of updateActors) addSource(u.actorId, "LaTeX source revision");
  for (const s of acceptedSuggestions) addSource(s.authorId, "Accepted manuscript suggestion");

  const reportContributors = (
    writingReport?.status === "COMPLETED" &&
    writingReport.result &&
    typeof writingReport.result === "object" &&
    Array.isArray((writingReport.result as { contributors?: unknown[] }).contributors)
      ? (writingReport.result as { contributors: Array<{ userId?: string; retainedWords?: number }> }).contributors
      : []
  );
  for (const entry of reportContributors) {
    if (entry.userId && typeof entry.retainedWords === "number" && entry.retainedWords > 0) {
      retainedWordsMap.set(entry.userId, entry.retainedWords);
      addSource(entry.userId, "Retained manuscript writing");
    }
  }

  for (const proposal of proposals) {
    if (!["REJECTED"].includes(proposal.status)) {
      const propParts = participants.filter(p => p.proposalId === proposal.id);
      if (propParts.length > 0) {
        for (const part of propParts) {
          addSource(part.userId, `Project contribution (${proposal.status.toLowerCase()})`);
          addRoles(part.userId, part.roles.length ? part.roles : proposal.roles);
        }
      } else {
        addSource(proposal.contributorId, `Project contribution (${proposal.status.toLowerCase()})`);
        addRoles(proposal.contributorId, proposal.roles);
      }
    }
  }

  const allocationShareMap = new Map(allocationShares.map(s => [s.userId, s.basisPoints]));
  for (const share of allocationShares) {
    if (share.basisPoints > 0) {
      addSource(share.userId, "Agreed contribution matrix share");
    }
  }

  const accessMentorMap = new Map(mentorAccesses.map(a => [a.id, a.mentorUserId]));
  for (const agreement of mentorAgreements) {
    const mentorId = accessMentorMap.get(agreement.accessId);
    if (mentorId) {
      addSource(mentorId, "Accepted advisor CRediT agreement");
      addRoles(mentorId, agreement.creditRoles);
    }
  }
  for (const fb of mentorFeedbacks) {
    const mentorId = accessMentorMap.get(fb.accessId);
    if (mentorId && fb.authorId === mentorId && (fb.creditRoles.length > 0 || ["SUGGESTION", "REVIEW"].includes(fb.kind))) {
      addSource(mentorId, `Accepted advisor ${fb.kind.toLowerCase()}`);
      addRoles(mentorId, fb.creditRoles);
    }
  }

  const memberMap = new Map(members.map(m => [m.userId, m]));
  const mentorUserSet = new Set([
    ...mentorAccesses.map(a => a.mentorUserId),
    ...mentorRelationships.map(r => r.mentorUserId),
  ]);
  const historicalUserSet = new Set([
    project.ownerId,
    ...members.map(m => m.userId),
    ...periods.map(p => p.userId),
    ...sourceMap.keys(),
    ...mentorUserSet,
  ]);

  const rawAuthors = (Array.isArray(latestCheck?.proposedAuthors)
    ? latestCheck!.proposedAuthors
    : []) as unknown as ProposedManuscriptAuthor[];
  const rawAcknowledgements = (Array.isArray(latestCheck?.acknowledgements)
    ? latestCheck!.acknowledgements
    : []) as unknown as ProposedManuscriptAcknowledgement[];
  const rawOmitted = (Array.isArray(latestCheck?.omittedContributors)
    ? latestCheck!.omittedContributors
    : []) as unknown as ReviewedNonAuthorJustification[];

  const allUserIds = [
    ...sourceMap.keys(),
    ...rawAuthors.map(a => a.userId),
    ...rawAcknowledgements.flatMap(a => (a.userId ? [a.userId] : [])),
    ...rawOmitted.map(o => o.userId),
    ...decisions.map(d => d.userId),
    ...proposals.filter(p => p.status === "DISPUTED").map(p => p.contributorId),
    ...openIntegrityCases.map(c => c.reporterId),
  ];
  const people = await workspacePeople(tx, allUserIds);

  // Latest decision per user on this check
  const latestDecisionByUser = new Map<string, typeof decisions[number]>();
  for (const d of decisions) {
    latestDecisionByUser.set(d.userId, d);
  }

  const authorSet = new Set(rawAuthors.map(a => a.userId));
  const ackSet = new Set(rawAcknowledgements.flatMap(a => (a.userId ? [a.userId] : [])));
  const omittedSet = new Set(rawOmitted.map(o => o.userId));

  const detectedContributors: DetectedScopeContributor[] = [...sourceMap.keys()].map(userId => {
    const member = memberMap.get(userId);
    const membershipStatus: DetectedScopeContributor["membershipStatus"] =
      project.ownerId === userId
        ? "OWNER"
        : member?.status === "ACTIVE"
          ? "ACTIVE"
          : mentorUserSet.has(userId) && !member
            ? "ADVISOR"
            : "FORMER";
    const attributionState: DetectedScopeContributor["attributionState"] = authorSet.has(userId)
      ? "AUTHOR"
      : ackSet.has(userId)
        ? "ACKNOWLEDGED"
        : omittedSet.has(userId)
          ? "JUSTIFIED_NON_AUTHOR"
          : "UNREVIEWED";
    const bps = allocationShareMap.get(userId);
    return {
      userId,
      name: people.get(userId)?.name ?? "Researcher",
      membershipStatus,
      sources: [...(sourceMap.get(userId) ?? [])],
      creditRoles: [...(roleMap.get(userId) ?? [])],
      retainedWords: retainedWordsMap.get(userId) ?? 0,
      allocationPercentage: bps !== undefined ? formatBasisPoints(bps) : null,
      attributionState,
    };
  });

  const proposedAuthors: ProposedManuscriptAuthor[] = [...rawAuthors]
    .sort((a, b) => a.order - b.order)
    .map(a => {
      const dec = latestDecisionByUser.get(a.userId);
      return {
        userId: a.userId,
        name: people.get(a.userId)?.name ?? "Researcher",
        order: a.order,
        creditRoles: a.creditRoles,
        rationale: a.rationale ?? "",
        confirmed: dec?.decision === "CONFIRM",
        decision: (dec?.decision as "CONFIRM" | "CLARIFY" | "DISPUTE" | undefined) ?? null,
        decisionNote: dec?.note ?? null,
      };
    });

  const acknowledgements: ProposedManuscriptAcknowledgement[] = rawAcknowledgements.map(a => ({
    userId: a.userId ?? null,
    name: a.userId ? (people.get(a.userId)?.name ?? a.name) : a.name,
    affiliation: a.affiliation ?? "",
    contributionSummary: a.contributionSummary,
    creditRoles: a.creditRoles ?? [],
  }));

  const omittedContributors: ReviewedNonAuthorJustification[] = rawOmitted.map(o => ({
    userId: o.userId,
    name: people.get(o.userId)?.name ?? "Researcher",
    justification: o.justification,
  }));

  const decisionViews: ManuscriptAttributionDecisionView[] = decisions.map(d => ({
    id: d.id,
    userId: d.userId,
    userName: people.get(d.userId)?.name ?? "Researcher",
    participantKind: d.participantKind as ManuscriptAttributionDecisionView["participantKind"],
    decision: d.decision as ManuscriptAttributionDecisionView["decision"],
    note: d.note,
    createdAt: d.createdAt.toISOString(),
  }));

  const unreviewedContributorIds = detectedContributors
    .filter(c => c.attributionState === "UNREVIEWED")
    .map(c => c.userId);

  const pendingAuthorIds = proposedAuthors
    .filter(a => a.decision !== "CONFIRM")
    .map(a => a.userId);

  const unresolvedDisputes: Array<{ source: string; userId?: string; summary: string }> = [];
  for (const [uid, dec] of latestDecisionByUser.entries()) {
    if (dec.decision === "DISPUTE" || dec.decision === "CLARIFY") {
      unresolvedDisputes.push({
        source: dec.decision === "DISPUTE" ? "ATTRIBUTION_DECISION" : "ATTRIBUTION_CLARIFICATION",
        userId: uid,
        summary: `${people.get(uid)?.name ?? "Contributor"} marked ${dec.decision.toLowerCase()}: ${dec.note || "Review requested"}`,
      });
    }
  }
  for (const disputedWork of proposals.filter(p => p.status === "DISPUTED")) {
    unresolvedDisputes.push({
      source: "WORK_CONTRIBUTION",
      userId: disputedWork.contributorId,
      summary: `Disputed contribution record: ${disputedWork.title || disputedWork.description.slice(0, 80)}`,
    });
  }
  for (const disputedAlloc of revisions.filter(r => r.status === "DISPUTED")) {
    unresolvedDisputes.push({
      source: "ALLOCATION_REVISION",
      summary: `Disputed contribution allocation revision #${disputedAlloc.revision}`,
    });
  }
  for (const openCase of openIntegrityCases) {
    unresolvedDisputes.push({
      source: openCase.kind,
      userId: openCase.reporterId,
      summary: `Open ${openCase.kind.toLowerCase().replace(/_/g, " ")}: ${openCase.title}`,
    });
  }

  const blockingReasons: string[] = [];
  if (!latestCheck || proposedAuthors.length === 0) {
    blockingReasons.push("Save an ordered author list and CRediT contribution roles before internal submission.");
  }
  if (unreviewedContributorIds.length > 0) {
    blockingReasons.push(
      `${unreviewedContributorIds.length} detected scope contributor(s) have not been reviewed as author, acknowledged contributor, or justified non-author.`,
    );
  }
  if (pendingAuthorIds.length > 0) {
    blockingReasons.push(
      `${pendingAuthorIds.length} proposed author(s) have not confirmed authorship and author order yet.`,
    );
  }
  if (unresolvedDisputes.length > 0) {
    blockingReasons.push(
      `${unresolvedDisputes.length} unresolved contribution or attribution dispute/clarification item(s) must be resolved before submission.`,
    );
  }

  const readyForInternalSubmission = Boolean(latestCheck) && blockingReasons.length === 0;
  const computedStatus: ManuscriptAttributionStatus = !latestCheck
    ? "UNINITIALIZED"
    : unresolvedDisputes.some(d => d.source === "ATTRIBUTION_DECISION" || d.source === "ATTRIBUTION_DISPUTE" || d.source === "CONTRIBUTION_DISPUTE")
      ? "DISPUTED"
      : readyForInternalSubmission
        ? "VERIFIED"
        : "PENDING_CONFIRMATION";

  return {
    project,
    draft,
    snapshot,
    memberMap,
    mentorUserSet,
    historicalUserSet,
    latestCheck,
    detectedContributors,
    proposedAuthors,
    acknowledgements,
    omittedContributors,
    decisionViews,
    unreviewedContributorIds,
    pendingAuthorIds,
    unresolvedDisputes,
    blockingReasons,
    readyForInternalSubmission,
    computedStatus,
    hasSucceededCompilation: successfulCompilations > 0,
  };
}

function buildView(
  state: Awaited<ReturnType<typeof gatherScopeState>>,
  actorId: string,
): ManuscriptAttributionCheckView {
  const activeMember =
    state.project.ownerId === actorId || state.memberMap.get(actorId)?.status === "ACTIVE";
  const writable =
    activeMember && state.project.status !== "ARCHIVED" && !state.draft.archivedAt;
  const isInvolved =
    state.proposedAuthors.some(a => a.userId === actorId) ||
    state.acknowledgements.some(a => a.userId === actorId) ||
    state.omittedContributors.some(o => o.userId === actorId) ||
    state.detectedContributors.some(c => c.userId === actorId);

  return {
    checkId: state.latestCheck?.id ?? null,
    projectId: state.project.id,
    manuscriptId: state.draft.id,
    snapshotId: state.snapshot.id,
    snapshotLabel: state.snapshot.label,
    sourceVersion: state.snapshot.sourceVersion,
    snapshotChecksum: state.snapshot.checksum,
    hasSucceededCompilation: state.hasSucceededCompilation,
    version: state.latestCheck?.version ?? 0,
    status: state.computedStatus,
    proposedAuthors: state.proposedAuthors,
    acknowledgements: state.acknowledgements,
    acknowledgementText: state.latestCheck?.acknowledgementText ?? "",
    omittedContributors: state.omittedContributors,
    detectedContributors: state.detectedContributors,
    decisions: state.decisionViews,
    unreviewedContributorIds: state.unreviewedContributorIds,
    pendingAuthorIds: state.pendingAuthorIds,
    unresolvedDisputes: state.unresolvedDisputes,
    readyForInternalSubmission: state.readyForInternalSubmission,
    blockingReasons: state.blockingReasons,
    snapshotDigestSha256: state.latestCheck?.snapshotDigestSha256 ?? null,
    verifiedAt: state.latestCheck?.verifiedAt?.toISOString() ?? null,
    createdAt: state.latestCheck?.createdAt?.toISOString() ?? null,
    viewerCanManage: writable,
    viewerCanDecide: Boolean(state.latestCheck) && isInvolved && state.project.status !== "ARCHIVED",
    externalSubmissionNotice: EXTERNAL_SUBMISSION_NOTICE,
  };
}

export async function assertVerifiedAttributionForPublish(
  tx: Db,
  projectId: string,
  manuscriptId: string,
  snapshotId: string,
  authorIds: string[],
): Promise<{ checkId: string; eligibleAuthorIds: Set<string> }> {
  const state = await gatherScopeState(tx, projectId, manuscriptId, snapshotId);
  if (!state.latestCheck || !state.readyForInternalSubmission) {
    throw AppError.conflict(
      state.blockingReasons[0] ??
        "Complete pre-submission attribution verification before sealing this manuscript snapshot.",
    );
  }
  const verifiedAuthorIds = state.proposedAuthors.map(a => a.userId);
  if (JSON.stringify(verifiedAuthorIds) !== JSON.stringify(authorIds)) {
    throw AppError.conflict(
      "Declared submission authors must match the verified attribution author list and order.",
    );
  }
  if (!state.latestCheck.verifiedAt || state.latestCheck.status !== "VERIFIED") {
    await tx.manuscriptAttributionCheck.update({
      where: { id: state.latestCheck.id },
      data: { status: "VERIFIED", verifiedAt: state.latestCheck.verifiedAt ?? new Date() },
    });
  }
  return {
    checkId: state.latestCheck.id,
    eligibleAuthorIds: state.historicalUserSet,
  };
}

export const manuscriptAttributionService = {
  async getAttributionCheck(
    projectId: string,
    actorId: string,
    manuscriptId: string,
    snapshotId: string,
  ): Promise<ManuscriptAttributionCheckView> {
    return getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actorId], projectId);
      await assertActiveProjectAccount(tx, actorId);
      const state = await gatherScopeState(tx, projectId, manuscriptId, snapshotId);
      const activeMember =
        state.project.ownerId === actorId || state.memberMap.get(actorId)?.status === "ACTIVE";
      const involved =
        state.detectedContributors.some(c => c.userId === actorId) ||
        state.proposedAuthors.some(a => a.userId === actorId) ||
        state.acknowledgements.some(a => a.userId === actorId) ||
        state.omittedContributors.some(o => o.userId === actorId);
      if (!activeMember && !involved) {
        throw AppError.notFound("Manuscript snapshot not found");
      }
      return buildView(state, actorId);
    });
  },

  async saveAttributionCheck(
    projectId: string,
    actorId: string,
    manuscriptId: string,
    snapshotId: string,
    rawInput: SaveManuscriptAttributionInput,
  ): Promise<ManuscriptAttributionCheckView> {
    const input = saveManuscriptAttributionSchema.parse(rawInput);
    return getPrisma().$transaction(async tx => {
      const referencedIds = [
        actorId,
        ...input.proposedAuthors.map(a => a.userId),
        ...input.acknowledgements.flatMap(a => (a.userId ? [a.userId] : [])),
        ...input.omittedContributors.map(o => o.userId),
      ];
      await lockProjectAccounts(tx, referencedIds, projectId);
      await assertActiveProjectAccount(tx, actorId);

      const state = await gatherScopeState(tx, projectId, manuscriptId, snapshotId);
      const activeMember =
        state.project.ownerId === actorId || state.memberMap.get(actorId)?.status === "ACTIVE";
      if (!activeMember) throw AppError.notFound("Manuscript snapshot not found");
      if (state.project.status === "ARCHIVED" || state.draft.archivedAt) {
        throw AppError.conflict("Archived manuscripts or projects are read-only");
      }

      const sortedAuthors = [...input.proposedAuthors].sort((a, b) => a.order - b.order);
      if (
        new Set(sortedAuthors.map(a => a.userId)).size !== sortedAuthors.length ||
        sortedAuthors.some((a, idx) => a.order !== idx + 1)
      ) {
        throw AppError.badRequest(
          "Proposed authors must have unique accounts and sequential author order starting at 1",
        );
      }

      for (const author of sortedAuthors) {
        if (!state.historicalUserSet.has(author.userId)) {
          throw AppError.badRequest(
            "Proposed authors must be current or historical project contributors or advisors",
          );
        }
        await assertActiveProjectAccount(tx, author.userId);
      }

      const bucketUsers = new Set<string>();
      for (const uid of [
        ...sortedAuthors.map(a => a.userId),
        ...input.acknowledgements.flatMap(a => (a.userId ? [a.userId] : [])),
        ...input.omittedContributors.map(o => o.userId),
      ]) {
        if (bucketUsers.has(uid)) {
          throw AppError.badRequest(
            "Each contributor may appear in only one category: Author, Acknowledged, or Justified Non-Author",
          );
        }
        bucketUsers.add(uid);
      }

      const maxRow = await tx.manuscriptAttributionCheck.findFirst({
        where: { snapshotId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (maxRow?.version ?? 0) + 1;

      await tx.manuscriptAttributionCheck.updateMany({
        where: { snapshotId, status: { not: "SUPERSEDED" } },
        data: { status: "SUPERSEDED" },
      });

      const digestSource = {
        projectId,
        manuscriptId,
        snapshotId,
        snapshotChecksum: state.snapshot.checksum,
        version: nextVersion,
        proposedAuthors: sortedAuthors,
        acknowledgements: input.acknowledgements,
        acknowledgementText: input.acknowledgementText,
        omittedContributors: input.omittedContributors,
      };
      const snapshotDigestSha256 = createHash("sha256")
        .update(JSON.stringify(digestSource))
        .digest("hex");

      const created = await tx.manuscriptAttributionCheck.create({
        data: {
          projectId,
          workspaceId: manuscriptId,
          snapshotId,
          version: nextVersion,
          status: "PENDING_CONFIRMATION",
          proposedAuthors: jsonSnapshot(sortedAuthors),
          acknowledgements: jsonSnapshot(input.acknowledgements),
          acknowledgementText: input.acknowledgementText,
          omittedContributors: jsonSnapshot(input.omittedContributors),
          snapshotDigestSha256,
          createdById: actorId,
        },
      });

      if (sortedAuthors.some(a => a.userId === actorId)) {
        await tx.manuscriptAttributionDecision.create({
          data: {
            checkId: created.id,
            projectId,
            userId: actorId,
            participantKind: "AUTHOR",
            decision: "CONFIRM",
            note: "Confirmed when proposing attribution",
          },
        });
      }

      const refreshed = await gatherScopeState(tx, projectId, manuscriptId, snapshotId);
      if (refreshed.computedStatus !== created.status) {
        await tx.manuscriptAttributionCheck.update({
          where: { id: created.id },
          data: {
            status: refreshed.computedStatus,
            ...(refreshed.computedStatus === "VERIFIED" ? { verifiedAt: new Date() } : {}),
          },
        });
      }

      await researchLedgerService.record({
        tx,
        projectId,
        actorId,
        eventType: "MANUSCRIPT_ATTRIBUTION_SAVED",
        resourceKind: "MANUSCRIPT_ATTRIBUTION",
        resourceId: created.id,
        artifactVersion: String(nextVersion),
        checksumSha256: snapshotDigestSha256,
        visibility: "PROJECT_TEAM",
        retentionClass: "ATTRIBUTION_RECORD",
        metadata: {
          manuscriptId,
          snapshotId,
          proposedAuthorCount: sortedAuthors.length,
          status: refreshed.computedStatus,
        },
      });

      const finalState = await gatherScopeState(tx, projectId, manuscriptId, snapshotId);
      return buildView(finalState, actorId);
    });
  },

  async decideAttributionCheck(
    projectId: string,
    actorId: string,
    manuscriptId: string,
    checkId: string,
    rawInput: z.infer<typeof manuscriptAttributionDecisionSchema>,
  ): Promise<ManuscriptAttributionCheckView> {
    const input = manuscriptAttributionDecisionSchema.parse(rawInput);
    return getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actorId], projectId);
      await assertActiveProjectAccount(tx, actorId);

      const check = await tx.manuscriptAttributionCheck.findFirst({
        where: { id: checkId, projectId, workspaceId: manuscriptId },
      });
      if (!check) throw AppError.notFound("Attribution check not found");
      if (check.status === "SUPERSEDED") {
        throw AppError.conflict("A newer attribution check version exists; reload before deciding");
      }

      const state = await gatherScopeState(tx, projectId, manuscriptId, check.snapshotId);
      if (state.project.status === "ARCHIVED") {
        throw AppError.conflict("Archived projects are read-only");
      }

      const isAuthor = state.proposedAuthors.some(a => a.userId === actorId);
      const isAcknowledged = state.acknowledgements.some(a => a.userId === actorId);
      const isAdvisor = state.mentorUserSet.has(actorId);
      const isDetectedOrOmitted =
        state.detectedContributors.some(c => c.userId === actorId) ||
        state.omittedContributors.some(o => o.userId === actorId);

      if (!isAuthor && !isAcknowledged && !isAdvisor && !isDetectedOrOmitted) {
        throw AppError.forbidden("Only listed authors, acknowledged contributors, or scope contributors can record a decision");
      }

      const participantKind = isAuthor
        ? "AUTHOR"
        : isAcknowledged
          ? "ACKNOWLEDGED"
          : isAdvisor
            ? "ADVISOR"
            : "CONTRIBUTOR";

      await tx.manuscriptAttributionDecision.create({
        data: {
          checkId: check.id,
          projectId,
          userId: actorId,
          participantKind,
          decision: input.decision,
          note: input.note ?? "",
        },
      });

      const refreshed = await gatherScopeState(tx, projectId, manuscriptId, check.snapshotId);
      await tx.manuscriptAttributionCheck.update({
        where: { id: check.id },
        data: {
          status: refreshed.computedStatus,
          verifiedAt: refreshed.computedStatus === "VERIFIED" ? new Date() : null,
        },
      });

      await researchLedgerService.record({
        tx,
        projectId,
        actorId,
        eventType: "MANUSCRIPT_ATTRIBUTION_DECIDED",
        resourceKind: "MANUSCRIPT_ATTRIBUTION",
        resourceId: check.id,
        artifactVersion: String(check.version),
        checksumSha256: check.snapshotDigestSha256,
        reason: input.note || null,
        visibility: "PROJECT_TEAM",
        retentionClass: "ATTRIBUTION_RECORD",
        metadata: {
          manuscriptId,
          snapshotId: check.snapshotId,
          decision: input.decision,
          participantKind,
          resultingStatus: refreshed.computedStatus,
        },
      });

      const finalState = await gatherScopeState(tx, projectId, manuscriptId, check.snapshotId);
      return buildView(finalState, actorId);
    });
  },
};

