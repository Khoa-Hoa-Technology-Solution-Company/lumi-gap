import { createHash } from "node:crypto";
import {
  contributionCategories,
  inferContributionCategoryFromRoles,
  type ContributionCategoryKey,
  type CreditRole,
  type PersonalAdvisorContributionItem,
  type PersonalAllocationHistoryItem,
  type PersonalContributionHistoryExport,
  type PersonalContributionHistoryItem,
  type ProjectAdvisorContributionSummary,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import { assertActiveProjectAccount, lockProjectAccounts } from "./project-transaction.js";
import { workspaceId } from "./workspace-access.js";

function formatBasisPoints(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  return `${whole}.${String(frac).padStart(2, "0")}%`;
}

function resolveCategory(category: string | null | undefined, roles: string[]): ContributionCategoryKey {
  if (category && (contributionCategories as readonly string[]).includes(category)) {
    return category as ContributionCategoryKey;
  }
  return inferContributionCategoryFromRoles(roles as CreditRole[]);
}

export const contributionProtectionService = {
  async getMyContributionHistory(
    projectInput: string,
    actorInput: string,
  ): Promise<PersonalContributionHistoryExport> {
    const db = getPrisma();
    const [projectRow, actorRow] = await Promise.all([
      db.project.findUnique({ where: workspaceId(projectInput) }),
      db.user.findUnique({ where: workspaceId(actorInput) }),
    ]);
    if (!projectRow || !actorRow) throw AppError.notFound("Contribution history not found");

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      await assertActiveProjectAccount(tx, actorRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });

      const [membership, periods, allProjectProposals, projectRevisions, mentorAccesses, mentorRelationships] =
        await Promise.all([
          tx.projectMember.findUnique({
            where: { projectId_userId: { projectId: project.id, userId: actorRow.id } },
          }),
          tx.projectMembershipPeriod.findMany({
            where: { projectId: project.id, userId: actorRow.id },
            orderBy: { joinedAt: "asc" },
          }),
          tx.projectContributionProposal.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: "desc" },
          }),
          tx.allocationRevision.findMany({
            where: { projectId: project.id, status: { not: "DRAFT" } },
            orderBy: [{ createdAt: "desc" }, { revision: "desc" }],
          }),
          tx.mentorAccess.findMany({
            where: { projectId: project.id, mentorUserId: actorRow.id },
            orderBy: { createdAt: "desc" },
          }),
          tx.mentorRelationship.findMany({
            where: { projectId: project.id, mentorUserId: actorRow.id },
            orderBy: { startedAt: "desc" },
          }),
        ]);

      const proposalIds = allProjectProposals.map(p => p.id);
      const [myParticipantRows, allParticipantRows, allReviewRows] = proposalIds.length
        ? await Promise.all([
            tx.contributionParticipant.findMany({
              where: { proposalId: { in: proposalIds }, userId: actorRow.id },
            }),
            tx.contributionParticipant.findMany({
              where: { proposalId: { in: proposalIds } },
            }),
            tx.contributionReview.findMany({
              where: { proposalId: { in: proposalIds } },
            }),
          ])
        : [[], [], []];

      const revisionIds = projectRevisions.map(r => r.id);
      const [myShares, myApprovals, allocationPeriods] = revisionIds.length
        ? await Promise.all([
            tx.allocationShare.findMany({
              where: { revisionId: { in: revisionIds }, userId: actorRow.id },
            }),
            tx.allocationApproval.findMany({
              where: { revisionId: { in: revisionIds }, userId: actorRow.id },
            }),
            tx.allocationPeriod.findMany({
              where: { id: { in: [...new Set(projectRevisions.map(r => r.periodId))] } },
            }),
          ])
        : [[], [], []];

      const isOwner = project.ownerId === actorRow.id;
      const isActiveMember = isOwner || membership?.status === "ACTIVE";
      const hasHistoricalLink =
        isActiveMember ||
        Boolean(membership) ||
        periods.length > 0 ||
        myParticipantRows.length > 0 ||
        allProjectProposals.some(p => p.contributorId === actorRow.id || p.proposedById === actorRow.id) ||
        myShares.length > 0 ||
        mentorAccesses.length > 0 ||
        mentorRelationships.length > 0;

      if (!hasHistoricalLink) {
        throw AppError.notFound("Contribution history not found");
      }

      const membershipStatus: PersonalContributionHistoryExport["membershipStatus"] = isOwner
        ? "OWNER"
        : membership?.status === "ACTIVE"
          ? "ACTIVE"
          : membership?.status === "REMOVED"
            ? "REMOVED"
            : membership?.status === "LEFT"
              ? "LEFT"
              : mentorAccesses.length > 0 || mentorRelationships.length > 0
                ? "ADVISOR"
                : "HISTORICAL";

      const myParticipantByProposal = new Map(myParticipantRows.map(p => [p.proposalId, p]));
      const myProposals = allProjectProposals.filter(
        p =>
          myParticipantByProposal.has(p.id) ||
          p.contributorId === actorRow.id ||
          (p.proposedById === actorRow.id && p.source === "LEGACY"),
      );

      const workContributions: PersonalContributionHistoryItem[] = myProposals.map(row => {
        const myPart = myParticipantByProposal.get(row.id);
        const participants = allParticipantRows.filter(p => p.proposalId === row.id);
        const reviews = allReviewRows.filter(r => r.proposalId === row.id && r.version === row.version);
        const myRoles = (myPart?.roles.length ? myPart.roles : row.roles) as CreditRole[];
        return {
          id: row.id,
          title: row.title || row.description.slice(0, 120),
          category: resolveCategory(row.category, myRoles),
          source: (row.source === "MANUAL" || row.source === "WORKSPACE" ? row.source : "LEGACY") as
            | "MANUAL"
            | "WORKSPACE"
            | "LEGACY",
          workDate: row.workDate.toISOString(),
          status: row.status,
          version: row.version,
          myRoles,
          participantCount: Math.max(participants.length, 1),
          acceptedReviewCount: reviews.filter(r => ["ACCEPT", "ACKNOWLEDGE"].includes(r.decision)).length,
          disputedReviewCount: reviews.filter(r => r.decision === "DISPUTE").length,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });

      const periodMap = new Map(allocationPeriods.map(p => [p.id, p]));
      const shareMap = new Map(myShares.map(s => [s.revisionId, s]));
      const approvalMap = new Map(myApprovals.map(a => [a.revisionId, a]));
      const allocations: PersonalAllocationHistoryItem[] = projectRevisions
        .filter(r => shareMap.has(r.id))
        .map(r => {
          const share = shareMap.get(r.id)!;
          const period = periodMap.get(r.periodId);
          const approval = approvalMap.get(r.id);
          return {
            revisionId: r.id,
            periodId: r.periodId,
            periodTitle: period?.title ?? "Allocation period",
            scope: period?.scope ?? "",
            revision: r.revision,
            status: r.status,
            myBasisPoints: share.basisPoints,
            myPercentage: formatBasisPoints(share.basisPoints),
            myDecision:
              approval?.decision === "APPROVE"
                ? "APPROVE"
                : approval?.decision === "DISPUTE"
                  ? "DISPUTE"
                  : "PENDING",
            submittedAt: r.submittedAt?.toISOString() ?? null,
            finalizedAt: r.finalizedAt?.toISOString() ?? null,
          };
        });

      const accessIds = mentorAccesses.map(a => a.id);
      const [mentorFeedbackRows, mentorAgreementRows] = accessIds.length
        ? await Promise.all([
            tx.mentorFeedback.findMany({
              where: { accessId: { in: accessIds }, authorId: actorRow.id },
              orderBy: { createdAt: "desc" },
            }),
            tx.mentorAgreement.findMany({
              where: { accessId: { in: accessIds } },
              orderBy: { createdAt: "desc" },
            }),
          ])
        : [[], []];

      const advisorContributions: PersonalAdvisorContributionItem[] = [
        ...mentorAgreementRows.map(a => ({
          id: a.id,
          recordType: "AGREEMENT" as const,
          kind: "CREDIT_AGREEMENT",
          creditRoles: a.creditRoles as CreditRole[],
          status: a.status,
          acknowledgementOrSummary: a.acknowledgement,
          resultingRevisionRef: null,
          createdAt: a.createdAt.toISOString(),
        })),
        ...mentorFeedbackRows.map(f => ({
          id: f.id,
          recordType: "FEEDBACK" as const,
          kind: f.kind,
          creditRoles: f.creditRoles as CreditRole[],
          status: f.status,
          acknowledgementOrSummary: isActiveMember
            ? f.body.slice(0, 240)
            : `Recorded ${f.kind.toLowerCase()} guidance (${f.status.toLowerCase()})`,
          resultingRevisionRef: f.resultingRevisionRef ?? null,
          createdAt: f.createdAt.toISOString(),
        })),
      ];

      const generatedAt = new Date().toISOString();
      const unsignedPayload = {
        schemaVersion: "LUMIGAP_CONTRIBUTION_EVIDENCE_V1" as const,
        projectId: project.id,
        projectTitle: project.title,
        userId: actorRow.id,
        userName: actorRow.fullName || "Researcher",
        membershipStatus,
        membershipIntervals: periods.map(p => ({
          joinedAt: p.joinedAt.toISOString(),
          leftAt: p.leftAt?.toISOString() ?? null,
        })),
        workContributions,
        allocations,
        advisorContributions,
        privacyRedacted: !isActiveMember,
        generatedAt,
      };
      const integrityDigestSha256 = createHash("sha256")
        .update(JSON.stringify(unsignedPayload))
        .digest("hex");

      return {
        ...unsignedPayload,
        integrityDigestSha256,
      };
    });
  },

  async exportMyContributionHistory(
    projectInput: string,
    actorInput: string,
  ): Promise<PersonalContributionHistoryExport> {
    const exported = await this.getMyContributionHistory(projectInput, actorInput);
    await researchLedgerService.record({
      projectId: exported.projectId,
      actorId: exported.userId,
      eventType: "CONTRIBUTION_EVIDENCE_EXPORTED",
      resourceKind: "CONTRIBUTION_HISTORY",
      resourceId: exported.userId,
      checksumSha256: exported.integrityDigestSha256,
      visibility: "CONTRIBUTOR_SCOPED",
      retentionClass: "RESEARCH_EVIDENCE",
      metadata: {
        membershipStatus: exported.membershipStatus,
        privacyRedacted: exported.privacyRedacted,
        workContributionCount: exported.workContributions.length,
        allocationCount: exported.allocations.length,
      },
    });
    return exported;
  },

  async listAdvisorContributions(
    projectInput: string,
    actorInput: string,
  ): Promise<ProjectAdvisorContributionSummary[]> {
    const db = getPrisma();
    const [projectRow, actorRow] = await Promise.all([
      db.project.findUnique({ where: workspaceId(projectInput) }),
      db.user.findUnique({ where: workspaceId(actorInput) }),
    ]);
    if (!projectRow || !actorRow) throw AppError.notFound("Project not found");

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      await assertActiveProjectAccount(tx, actorRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });
      const membership = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: actorRow.id } },
      });
      const isTeamMember = project.ownerId === actorRow.id || membership?.status === "ACTIVE";
      const mentorAccessRows = await tx.mentorAccess.findMany({
        where: {
          projectId: project.id,
          ...(isTeamMember ? {} : { mentorUserId: actorRow.id }),
        },
        orderBy: { createdAt: "desc" },
      });
      if (!isTeamMember && mentorAccessRows.length === 0) {
        throw AppError.notFound("Project not found");
      }

      const mentorIds = [...new Set(mentorAccessRows.map(r => r.mentorUserId))];
      if (!mentorIds.length) return [];

      const accessIds = mentorAccessRows.map(r => r.id);
      const [users, relationships, agreements, feedbackRows, shares] = await Promise.all([
        tx.user.findMany({
          where: { id: { in: mentorIds } },
          select: { id: true, fullName: true },
        }),
        tx.mentorRelationship.findMany({
          where: { projectId: project.id, mentorUserId: { in: mentorIds } },
        }),
        tx.mentorAgreement.findMany({
          where: { accessId: { in: accessIds } },
          orderBy: { createdAt: "desc" },
        }),
        tx.mentorFeedback.findMany({
          where: { accessId: { in: accessIds } },
          orderBy: { createdAt: "desc" },
        }),
        tx.mentorResourceShare.findMany({
          where: { accessId: { in: accessIds } },
          select: { id: true, title: true },
        }),
      ]);

      const userMap = new Map(users.map(u => [u.id, u.fullName || "Advisor"]));
      const shareTitleMap = new Map(shares.map(s => [s.id, s.title]));

      return mentorIds.map(mentorId => {
        const mentorAccessIds = new Set(
          mentorAccessRows.filter(a => a.mentorUserId === mentorId).map(a => a.id),
        );
        const rels = relationships.filter(r => r.mentorUserId === mentorId);
        const relationshipStatus: ProjectAdvisorContributionSummary["relationshipStatus"] = rels.some(
          r => r.status === "ACTIVE",
        )
          ? "ACTIVE"
          : rels.length > 0
            ? "ENDED"
            : "INVITED";

        return {
          mentorId,
          mentorName: userMap.get(mentorId) ?? "Advisor",
          relationshipStatus,
          agreements: agreements
            .filter(a => mentorAccessIds.has(a.accessId))
            .map(a => ({
              id: a.id,
              creditRoles: a.creditRoles as CreditRole[],
              acknowledgement: a.acknowledgement,
              status: a.status as "PROPOSED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN",
              createdAt: a.createdAt.toISOString(),
            })),
          feedbackItems: feedbackRows
            .filter(f => mentorAccessIds.has(f.accessId) && f.authorId === mentorId)
            .map(f => ({
              id: f.id,
              kind: f.kind as "MESSAGE" | "COMMENT" | "SUGGESTION" | "REVIEW",
              creditRoles: f.creditRoles as CreditRole[],
              status: f.status as "PENDING" | "ACCEPTED" | "REJECTED" | "RESOLVED",
              shareTitle: f.shareId ? (shareTitleMap.get(f.shareId) ?? null) : null,
              resultingRevisionRef: f.resultingRevisionRef ?? null,
              createdAt: f.createdAt.toISOString(),
            })),
        };
      });
    });
  },
};

