import { createHash } from "node:crypto";
import {
  contributionCategories,
  creditRoles,
  inferContributionCategoryFromRoles,
  type ContributionCategoryKey,
  type CreditRole,
  type GlobalPersonalContributionProjectSummary,
  type GlobalPersonalContributionsView,
  type IntegrityCaseKind,
  type IntegrityCaseStatus,
  type IntegrityTargetKind,
  type ManuscriptAttributionStatus,
  type PersonalAcademicReviewItem,
  type PersonalAdvisorContributionItem,
  type PersonalAllocationHistoryItem,
  type PersonalContributionHistoryExport,
  type PersonalContributionHistoryItem,
  type PersonalContributionRecord,
  type PersonalIntegrityCaseSummary,
  type PersonalManuscriptAttributionItem,
  type PersonalPublicationOutcomeItem,
  type PersonalReconciliationState,
  type PersonalSystemActivityItem,
  type ProjectAdvisorContributionSummary,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import { assertActiveProjectAccount, lockProjectAccounts } from "./project-transaction.js";
import { workspaceId, workspacePeople } from "./workspace-access.js";
import { meaningfulActivity, suggestedCreditRoles } from "./research-contribution.rules.js";

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

function mapWorkReconciliationState(
  status: string,
  needsMyAck: boolean,
  isSelfCreatedOnly: boolean,
): PersonalReconciliationState {
  if (status === "DISPUTED") return "DISPUTED";
  if (status === "NEEDS_CHANGES") return "CLARIFICATION_REQUESTED";
  if (status === "ACCEPTED" || status === "CONFIRMED") return "ACKNOWLEDGED";
  // Only mark PENDING_RESPONSE when the authenticated viewer actually has an outstanding action.
  // Items submitted by the viewer or awaiting other teammates stay SELF_DECLARED / RECORDED so
  // row-level badges never contradict "Mục cần bạn phản hồi" / "Cần tôi phản hồi" counters.
  if (needsMyAck) return "PENDING_RESPONSE";
  if (status === "SELF_RECORDED" || status === "DRAFT" || isSelfCreatedOnly) return "SELF_DECLARED";
  return "RECORDED";
}

function advisorFeedbackTitle(kind: string): string {
  switch (kind.toUpperCase()) {
    case "COMMENT":
      return "Nhận xét hướng dẫn nghiên cứu";
    case "SUGGESTION":
      return "Đề xuất chỉnh sửa hướng dẫn";
    case "REVIEW":
      return "Đánh giá tài liệu chia sẻ";
    case "MESSAGE":
    default:
      return "Góp ý hướng dẫn nghiên cứu";
  }
}

function assessmentSummaryVi(assessment: string | null | undefined): string | null {
  switch (assessment) {
    case "READY":
    case "ACCEPT":
    case "APPROVE":
      return "Sẵn sàng chuyển bước tiếp theo (đánh giá nội bộ)";
    case "MINOR_REVISION":
      return "Đề nghị chỉnh sửa nhỏ";
    case "MAJOR_REVISION":
      return "Đề nghị chỉnh sửa lớn";
    case "NOT_READY":
    case "REJECT":
      return "Chưa đạt yêu cầu nội bộ";
    case "COMMENT_ONLY":
      return "Góp ý định hướng";
    default:
      return null;
  }
}

function activityTitleForType(type: string): string {
  const map: Record<string, string> = {
    TASK_COMPLETED: "Hoàn thành nhiệm vụ nghiên cứu",
    PAPER_SCREENED: "Sàng lọc tài liệu nghiên cứu",
    EVIDENCE_EXTRACTED: "Trích xuất minh chứng nghiên cứu",
    GAP_CREATED: "Đề xuất khoảng trống nghiên cứu",
    GAP_UPDATED: "Cập nhật phân tích khoảng trống",
    PLAN_UPDATED: "Cập nhật thiết kế nghiên cứu",
    DECISION_RECORDED: "Ghi nhận quyết định nghiên cứu",
    MANUSCRIPT_SNAPSHOT_CREATED: "Lưu phiên bản bản thảo",
    MANUSCRIPT_SAVED: "Chỉnh sửa bản thảo nghiên cứu",
    SUBMISSION_CREATED: "Chuẩn bị bản nộp nghiên cứu",
  };
  return map[type] ?? type.replaceAll("_", " ");
}

function categoryFromActivityType(type: string): ContributionCategoryKey {
  if (type.includes("GAP") || type.includes("PLAN") || type.includes("DECISION")) return "CONCEPTUALIZATION_METHODOLOGY";
  if (type.includes("MANUSCRIPT") || type.includes("SUBMISSION") || type.includes("MENTOR") || type.includes("REVIEW")) return "WRITING_REVISION";
  if (type.includes("PAPER") || type.includes("EVIDENCE")) return "LITERATURE_DATA";
  return "EXECUTION_VALIDATION";
}

function safeEvidenceRefs(raw: unknown): Array<{ kind: string; id: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ kind: string; id: string }> = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "kind" in item && "id" in item) {
      const kind = String((item as { kind: unknown }).kind);
      const id = String((item as { id: unknown }).id);
      if (kind && id) out.push({ kind, id });
    }
  }
  return out;
}

const VALID_MEANINGFUL_TYPES = [
  ...new Set(
    Object.values(meaningfulActivity)
      .flat()
      .filter(type => !["MENTOR_REVIEW_SUBMITTED", "MENTOR_FEEDBACK_RECORDED", "TASK_CREATED"].includes(type)),
  ),
];

const ATTRIBUTION_LIMITATIONS: string[] = [
  "Các công việc thực hiện ngoài LumiGap hoặc trên tài liệu cục bộ chỉ xuất hiện khi được khai báo kèm minh chứng.",
  "Số lượt hoạt động hoặc số từ viết không được dùng để chấm điểm hay tự động quyết định quyền tác giả.",
];

export type GlobalPersonalContributionsQuery = {
  projectId?: string;
  role?: string;
  source?: "SYSTEM_RECORDED" | "SELF_DECLARED" | "TEAM_DECLARED" | "MENTOR_RECORDED" | "IMPORTED";
  status?: PersonalReconciliationState;
  view?: "mine" | "pending" | "saved";
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

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
    // Soft-deleted projects retain read-only historical contribution access for people with valid links.
    if (!projectRow || !actorRow) throw AppError.notFound("Contribution history not found");

    const accountRestricted = !actorRow.isActive || actorRow.accountStatus !== "ACTIVE";

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });
      const projectDeleted = Boolean(project.deletedAt);

      const [
        membership,
        periods,
        allProjectProposals,
        projectRevisions,
        mentorAccesses,
        mentorRelationships,
        projectSubmissions,
        projectDrafts,
        projectAttributionChecks,
        myCases,
        myActivities,
      ] = await Promise.all([
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
        tx.submission.findMany({
          where: { projectId: project.id },
          select: { id: true, title: true, status: true, currentRevisionNumber: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
        }),
        tx.draftWorkspace.findMany({
          where: { projectId: project.id },
          select: { id: true, name: true },
        }),
        tx.manuscriptAttributionCheck.findMany({
          where: { projectId: project.id },
          orderBy: [{ createdAt: "desc" }, { version: "desc" }],
          take: 40,
        }),
        tx.researchIntegrityCase.findMany({
          where: {
            projectId: project.id,
            OR: [{ reporterId: actorRow.id }, { respondentUserId: actorRow.id }],
          },
          orderBy: { updatedAt: "desc" },
        }),
        tx.projectActivity.findMany({
          where: {
            projectId: project.id,
            actorId: actorRow.id,
            type: { in: VALID_MEANINGFUL_TYPES },
          },
          orderBy: { createdAt: "desc" },
          take: 80,
        }),
      ]);

      const submissionIds = projectSubmissions.map(s => s.id);
      const myHumanReviews = submissionIds.length
        ? await tx.humanReview.findMany({
            where: {
              submissionId: { in: submissionIds },
              reviewerId: actorRow.id,
              status: "SUBMITTED",
            },
            orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
          })
        : [];
      const [reviewAssignmentRows, reviewRevisionRows] = myHumanReviews.length
        ? await Promise.all([
            tx.reviewerAssignment.findMany({
              where: { id: { in: [...new Set(myHumanReviews.map(r => r.assignmentId))] } },
              select: { id: true, reviewRequestId: true, status: true },
            }),
            tx.submissionRevision.findMany({
              where: { id: { in: [...new Set(myHumanReviews.map(r => r.revisionId))] } },
              select: { id: true, revisionNumber: true },
            }),
          ])
        : [[], []];
      const reviewAssignmentMap = new Map(reviewAssignmentRows.map(a => [a.id, a]));
      const reviewRevisionMap = new Map(reviewRevisionRows.map(v => [v.id, v]));

      const checkIds = projectAttributionChecks.map(c => c.id);
      const [myAttrDecisions, snapshotRows] = checkIds.length
        ? await Promise.all([
            tx.manuscriptAttributionDecision.findMany({
              where: { checkId: { in: checkIds }, userId: actorRow.id },
              orderBy: { createdAt: "desc" },
            }),
            tx.manuscriptSnapshot.findMany({
              where: { id: { in: [...new Set(projectAttributionChecks.map(c => c.snapshotId))] } },
              select: { id: true, label: true },
            }),
          ])
        : [[], []];

      const proposalIds = allProjectProposals.map(p => p.id);
      const historicalParticipantRecords = proposalIds.length
        ? await tx.projectContributionHistory.findMany({
            where: { proposalId: { in: proposalIds } },
            select: { proposalId: true, snapshot: true },
            orderBy: { createdAt: "desc" },
          })
        : [];
      const historicalRoles = new Map<string, CreditRole[]>();
      for (const record of historicalParticipantRecords) {
        const snapshot = record.snapshot as { participants?: { userId: string; roles?: CreditRole[] }[] };
        const participant = snapshot.participants?.find(person => person.userId === actorRow.id);
        if (participant && !historicalRoles.has(record.proposalId)) {
          historicalRoles.set(record.proposalId, participant.roles ?? []);
        }
      }
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
              orderBy: { createdAt: "desc" },
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
      const isActiveMember = !projectDeleted && !accountRestricted && (isOwner || membership?.status === "ACTIVE");
      const isActiveMentor =
        !projectDeleted &&
        !accountRestricted &&
        mentorRelationships.some(r => r.status === "ACTIVE");

      const hasHistoricalLink =
        isOwner ||
        Boolean(membership) ||
        periods.length > 0 ||
        myParticipantRows.length > 0 ||
        historicalRoles.size > 0 ||
        allProjectProposals.some(p => p.contributorId === actorRow.id || p.proposedById === actorRow.id) ||
        myShares.length > 0 ||
        mentorAccesses.length > 0 ||
        mentorRelationships.length > 0 ||
        myHumanReviews.length > 0 ||
        myCases.length > 0;

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

      const privacyRedacted = !isActiveMember || projectDeleted || accountRestricted;
      const canViewWorkspace = isActiveMember || isActiveMentor;
      const canDeclareInProject =
        (isActiveMember || isActiveMentor) && project.status !== "ARCHIVED" && !projectDeleted;
      const canFileReviewRequest = !accountRestricted;

      const reviewerUserIds = [...new Set(allReviewRows.map(r => r.userId))];
      const reviewerMap = reviewerUserIds.length ? await workspacePeople(tx, reviewerUserIds) : new Map();

      const myParticipantByProposal = new Map(myParticipantRows.map(p => [p.proposalId, p]));
      const myProposals = allProjectProposals.filter(
        p =>
          myParticipantByProposal.has(p.id) ||
          historicalRoles.has(p.id) ||
          (p.source === "LEGACY" && p.contributorId === actorRow.id) ||
          (p.proposedById === actorRow.id && p.source === "LEGACY"),
      );

      // Track artifact keys already linked in declared work contributions for clean deduplication
      const coveredArtifactKeys = new Set<string>();
      for (const row of myProposals) {
        for (const ref of safeEvidenceRefs(row.evidenceRefs)) {
          coveredArtifactKeys.add(`${ref.kind}:${ref.id}`);
        }
      }

      const workContributions: PersonalContributionHistoryItem[] = myProposals.map(row => {
        const myPart = myParticipantByProposal.get(row.id);
        const participants = allParticipantRows.filter(p => p.proposalId === row.id);
        const reviews = allReviewRows.filter(r => r.proposalId === row.id && r.version === row.version);
        const myRoles = (myPart?.roles.length ? myPart.roles : historicalRoles.get(row.id) ?? row.roles) as CreditRole[];
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
          acknowledgementOrSummary:
            isActiveMember || isActiveMentor
              ? f.body.slice(0, 240)
              : `Recorded ${f.kind.toLowerCase()} guidance (${f.status.toLowerCase()})`,
          resultingRevisionRef: f.resultingRevisionRef ?? null,
          createdAt: f.createdAt.toISOString(),
        })),
      ];

      const submissionMap = new Map(projectSubmissions.map(s => [s.id, s]));
      const academicReviews: PersonalAcademicReviewItem[] = myHumanReviews.map(rev => ({
        id: rev.id,
        assignmentId: rev.assignmentId,
        submissionId: rev.submissionId,
        submissionTitle: submissionMap.get(rev.submissionId)?.title ?? "Bản thảo nghiên cứu",
        roundNumber: rev.roundNumber,
        status: rev.status,
        overallAssessment: rev.overallAssessment ?? null,
        submittedAt: (rev.submittedAt ?? rev.createdAt).toISOString(),
      }));

      const draftMap = new Map(projectDrafts.map(d => [d.id, d.name]));
      const snapshotMap = new Map(snapshotRows.map(s => [s.id, s.label]));
      const decisionByCheck = new Map<string, (typeof myAttrDecisions)[number]>();
      for (const d of myAttrDecisions) {
        if (!decisionByCheck.has(d.checkId)) decisionByCheck.set(d.checkId, d);
      }

      // Latest attribution check per manuscript involving actorRow
      const seenManuscriptCheck = new Set<string>();
      const manuscriptAttributions: PersonalManuscriptAttributionItem[] = [];
      for (const chk of projectAttributionChecks) {
        if (seenManuscriptCheck.has(chk.workspaceId)) continue;
        const authors = Array.isArray(chk.proposedAuthors)
          ? (chk.proposedAuthors as Array<{ userId?: string; creditRoles?: CreditRole[] }>)
          : [];
        const acks = Array.isArray(chk.acknowledgements)
          ? (chk.acknowledgements as Array<{ userId?: string | null; creditRoles?: CreditRole[] }>)
          : [];
        const omitted = Array.isArray(chk.omittedContributors)
          ? (chk.omittedContributors as Array<{ userId?: string; justification?: string }>)
          : [];

        const authorEntry = authors.find(a => a.userId === actorRow.id);
        const ackEntry = acks.find(a => a.userId === actorRow.id);
        const omitEntry = omitted.find(o => o.userId === actorRow.id);
        const decision = decisionByCheck.get(chk.id);
        if (!authorEntry && !ackEntry && !omitEntry && !decision) continue;

        seenManuscriptCheck.add(chk.workspaceId);
        const myClassification: PersonalManuscriptAttributionItem["myClassification"] = authorEntry
          ? "AUTHOR"
          : ackEntry
            ? "ACKNOWLEDGED"
            : omitEntry
              ? "OMITTED"
              : "UNREVIEWED";
        const myDecision: PersonalManuscriptAttributionItem["myDecision"] =
          decision?.decision === "CONFIRM"
            ? "CONFIRM"
            : decision?.decision === "CLARIFY"
              ? "CLARIFY"
              : decision?.decision === "DISPUTE"
                ? "DISPUTE"
                : "PENDING";

        manuscriptAttributions.push({
          checkId: chk.id,
          manuscriptId: chk.workspaceId,
          manuscriptTitle: draftMap.get(chk.workspaceId) ?? "Bản thảo nghiên cứu",
          snapshotId: chk.snapshotId,
          snapshotLabel: snapshotMap.get(chk.snapshotId) ?? `v${chk.version}`,
          version: chk.version,
          attributionStatus: chk.status as ManuscriptAttributionStatus,
          myClassification,
          myRoles: (authorEntry?.creditRoles ?? ackEntry?.creditRoles ?? []).filter(r =>
            (creditRoles as readonly string[]).includes(r),
          ),
          myDecision,
          omissionJustification: omitEntry?.justification ?? null,
          needsMyConfirmation:
            !projectDeleted &&
            !accountRestricted &&
            chk.status === "PENDING_CONFIRMATION" &&
            (myClassification === "AUTHOR" || myClassification === "ACKNOWLEDGED" || myClassification === "OMITTED") &&
            myDecision === "PENDING",
          updatedAt: chk.createdAt.toISOString(),
        });
      }

      const integrityCases: PersonalIntegrityCaseSummary[] = myCases.map(c => ({
        id: c.id,
        projectId: project.id,
        projectTitle: project.title,
        kind: c.kind as IntegrityCaseKind,
        status: c.status as IntegrityCaseStatus,
        title: c.title,
        myRole: c.reporterId === actorRow.id ? "REPORTER" : "RESPONDENT",
        targetKind: c.targetKind as IntegrityTargetKind,
        targetId: c.targetId,
        resolutionSummary: c.resolutionSummary,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }));

      const publicationOutcomes: PersonalPublicationOutcomeItem[] = projectSubmissions.map(s => ({
        submissionId: s.id,
        title: privacyRedacted ? `Bản thảo nghiên cứu (#${s.currentRevisionNumber})` : s.title,
        status: s.status,
        revisionCount: s.currentRevisionNumber,
        updatedAt: s.updatedAt.toISOString(),
      }));

      // Deduplicate system activities: group by (entityKind, entityId) AND skip artifacts already linked in workContributions
      const activityBuckets = new Map<string, { item: (typeof myActivities)[number]; count: number }>();
      for (const act of myActivities) {
        const entityKind = act.entityKind ?? "ACTIVITY";
        const entityId = act.entityId ?? act.id;
        const normalizedKind =
          entityKind === "EXTRACTION"
            ? "EVIDENCE"
            : entityKind === "DECISION"
              ? "RESEARCH_DECISION"
              : entityKind;
        const artifactKey = `${normalizedKind}:${entityId}`;
        if (coveredArtifactKeys.has(artifactKey)) continue;
        const existing = activityBuckets.get(artifactKey);
        if (existing) {
          existing.count += 1;
        } else {
          activityBuckets.set(artifactKey, { item: act, count: 1 });
        }
      }

      const systemActivities: PersonalSystemActivityItem[] = [...activityBuckets.values()]
        .slice(0, 30)
        .map(({ item, count }) => ({
          id: item.id,
          type: item.type,
          category: categoryFromActivityType(item.type),
          title: activityTitleForType(item.type),
          sourceKind: item.entityKind ?? "PROJECT_ACTIVITY",
          sourceId: item.entityId ?? item.id,
          occurredAt: item.createdAt.toISOString(),
          evidenceCount: count,
        }));

      const latestPubStatus = publicationOutcomes[0]?.status ?? null;
      const unifiedRecords: PersonalContributionRecord[] = [];

      // 1. Work contributions
      for (const row of myProposals) {
        const myPart = myParticipantByProposal.get(row.id);
        const reviews = allReviewRows.filter(r => r.proposalId === row.id && r.version === row.version);
        const myRoles = (myPart?.roles.length ? myPart.roles : historicalRoles.get(row.id) ?? row.roles) as CreditRole[];
        const myHasResponded = reviews.some(
          r => r.userId === actorRow.id && ["ACKNOWLEDGE", "ACCEPT"].includes(r.decision),
        );
        const proposedByOther = row.proposedById !== actorRow.id;
        const needsMyAction =
          !projectDeleted &&
          !accountRestricted &&
          project.status !== "ARCHIVED" &&
          proposedByOther &&
          Boolean(myPart) &&
          !myHasResponded &&
          ["SUBMITTED", "ACCEPTED", "SELF_RECORDED"].includes(row.status);
        const refs = safeEvidenceRefs(row.evidenceRefs);
        const evidenceSources = refs.map(ref => ({
          kind: ref.kind,
          id: ref.id,
          label: `${ref.kind.replaceAll("_", " ")}`,
          accessible: isActiveMember,
        }));

        unifiedRecords.push({
          id: `work:${row.id}`,
          sourceRecordId: row.id,
          projectId: project.id,
          projectTitle: project.title,
          projectStatus: projectDeleted ? "DELETED" : project.status,
          projectDeleted,
          membershipStatus,
          recordKind: "WORK_CONTRIBUTION",
          title: row.title || row.description.slice(0, 120),
          summary: privacyRedacted ? row.description.slice(0, 180) : row.description,
          category: resolveCategory(row.category, myRoles),
          workDate: row.workDate.toISOString(),
          roles: myRoles,
          sourceKind:
            row.source === "LEGACY"
              ? "IMPORTED"
              : row.proposedById === actorRow.id
                ? "SELF_DECLARED"
                : "TEAM_DECLARED",
          reconciliationState: mapWorkReconciliationState(
            row.status,
            needsMyAction,
            row.proposedById === actorRow.id && reviews.length === 0,
          ),
          version: row.version,
          evidenceCount: Math.max(evidenceSources.length + (row.evidence?.trim() ? 1 : 0), 0),
          evidenceSources,
          evidenceAccessRestricted: privacyRedacted && evidenceSources.length > 0,
          acknowledgements: reviews.map(r => ({
            userId: r.userId,
            name: reviewerMap.get(r.userId)?.name ?? "Thành viên",
            decision: r.decision,
            note: privacyRedacted && r.userId !== actorRow.id ? undefined : r.note || undefined,
            createdAt: r.createdAt.toISOString(),
          })),
          manuscriptContext: latestPubStatus
            ? { title: project.title, publicationStatus: latestPubStatus }
            : undefined,
          waitingOnOthers:
            !needsMyAction &&
            !projectDeleted &&
            ["SUBMITTED", "PENDING_CONFIRMATION"].includes(row.status),
          needsMyAction,
          actionKind: needsMyAction ? "ACKNOWLEDGE_CONTRIBUTION" : undefined,
          canViewWorkspace,
          canRequestEdit: !accountRestricted && !projectDeleted && project.status !== "ARCHIVED",
          canOpenReviewRequest: canFileReviewRequest,
          privacyRedacted,
        });
      }

      const agreementById = new Map(mentorAgreementRows.map(a => [a.id, a]));
      // 2. Advisor contributions (Agreements & Feedback)
      for (const adv of advisorContributions) {
        const isAgreement = adv.recordType === "AGREEMENT";
        const rawAgreement = isAgreement ? agreementById.get(adv.id) : undefined;
        const agreementNeedsMyAction = Boolean(
          isAgreement &&
            rawAgreement &&
            rawAgreement.status === "PROPOSED" &&
            rawAgreement.proposedById !== actorRow.id &&
            !projectDeleted &&
            !accountRestricted &&
            project.status !== "ARCHIVED",
        );
        const waitingOnOthers = Boolean(
          !agreementNeedsMyAction &&
            !projectDeleted &&
            (adv.status === "PROPOSED" || adv.status === "PENDING"),
        );
        const state: PersonalReconciliationState =
          adv.status === "ACCEPTED" || adv.status === "RESOLVED"
            ? "ACKNOWLEDGED"
            : adv.status === "REJECTED"
              ? "DISPUTED"
              : agreementNeedsMyAction
                ? "PENDING_RESPONSE"
                : projectDeleted
                  ? "HISTORICAL"
                  : "RECORDED";
        unifiedRecords.push({
          id: `advisor:${adv.recordType.toLowerCase()}:${adv.id}`,
          sourceRecordId: adv.id,
          projectId: project.id,
          projectTitle: project.title,
          projectStatus: projectDeleted ? "DELETED" : project.status,
          projectDeleted,
          membershipStatus,
          recordKind: isAgreement ? "ADVISOR_AGREEMENT" : "ADVISOR_FEEDBACK",
          title: isAgreement
            ? "Thỏa thuận ghi nhận vai trò hướng dẫn"
            : advisorFeedbackTitle(adv.kind),
          summary: adv.acknowledgementOrSummary,
          category: "WRITING_REVISION",
          workDate: adv.createdAt,
          roles: adv.creditRoles,
          suggestedRoles: !isAgreement && adv.creditRoles.length === 0 ? ["SUPERVISION"] : undefined,
          sourceKind: "MENTOR_RECORDED",
          reconciliationState: state,
          version: 1,
          evidenceCount: adv.resultingRevisionRef ? 2 : 1,
          evidenceSources: [
            {
              kind: isAgreement ? "MENTOR_AGREEMENT" : "MENTOR_FEEDBACK",
              id: adv.id,
              label: isAgreement ? "Thỏa thuận ghi nhận hướng dẫn" : advisorFeedbackTitle(adv.kind),
              accessible: canViewWorkspace,
              ...(canViewWorkspace
                ? { href: `/mentor-workspace?view=project&projectId=${encodeURIComponent(project.id)}&tab=chat&channel=mentors` }
                : {}),
            },
          ],
          evidenceAccessRestricted: !canViewWorkspace,
          acknowledgements: [],
          waitingOnOthers,
          needsMyAction: agreementNeedsMyAction,
          canViewWorkspace,
          canRequestEdit: false,
          canOpenReviewRequest: canFileReviewRequest,
          privacyRedacted,
        });
      }

      // 3. Academic Reviews (submitted peer/mentor manuscript reviews)
      const humanReviewById = new Map(myHumanReviews.map(r => [r.id, r]));
      for (const rev of academicReviews) {
        if (coveredArtifactKeys.has(`HUMAN_REVIEW:${rev.id}`)) continue;
        const rawReview = humanReviewById.get(rev.id);
        const assignment = rawReview ? reviewAssignmentMap.get(rawReview.assignmentId) : undefined;
        const revision = rawReview ? reviewRevisionMap.get(rawReview.revisionId) : undefined;
        const revisionNumber = revision?.revisionNumber ?? null;
        const canOpenReview = !projectDeleted && !accountRestricted;
        const exactReviewHref = canOpenReview
          ? assignment?.reviewRequestId
            ? `/mentor-workspace?view=review-request&requestId=${encodeURIComponent(assignment.reviewRequestId)}&round=${rev.roundNumber}`
            : `/mentor-workspace?view=review&assignmentId=${encodeURIComponent(rev.assignmentId)}`
          : undefined;
        const commentExcerpt =
          canOpenReview && rawReview?.overallComment?.trim()
            ? rawReview.overallComment.trim().slice(0, 260)
            : null;
        const assessmentText = assessmentSummaryVi(rev.overallAssessment);
        const summaryParts = [
          privacyRedacted ? `Bản thảo nghiên cứu${revisionNumber ? ` (Phiên bản v${revisionNumber})` : ""}` : `${rev.submissionTitle}${revisionNumber ? ` · Phiên bản v${revisionNumber}` : ""}`,
          assessmentText ? `Kết luận đánh giá: ${assessmentText}` : null,
          commentExcerpt ? `Tóm tắt nhận xét: ${commentExcerpt}` : null,
        ].filter(Boolean);
        unifiedRecords.push({
          id: `review:${rev.id}`,
          sourceRecordId: rev.id,
          projectId: project.id,
          projectTitle: project.title,
          projectStatus: projectDeleted ? "DELETED" : project.status,
          projectDeleted,
          membershipStatus,
          recordKind: "ACADEMIC_REVIEW",
          title: `Phản biện bản thảo · Vòng ${rev.roundNumber}`,
          summary: summaryParts.join("\n"),
          category: "WRITING_REVISION",
          workDate: rev.submittedAt ?? new Date().toISOString(),
          roles: [],
          suggestedRoles: ["WRITING_REVIEW_EDITING"],
          sourceKind: "SYSTEM_RECORDED",
          reconciliationState: projectDeleted ? "HISTORICAL" : "RECORDED",
          version: rev.roundNumber,
          evidenceCount: revisionNumber ? 2 : 1,
          evidenceSources: [
            {
              kind: "HUMAN_REVIEW",
              id: rev.id,
              label: `Bản ghi phản biện học thuật · Vòng ${rev.roundNumber}`,
              versionLabel: revisionNumber ? `Bản thảo v${revisionNumber} · Vòng ${rev.roundNumber}` : `Vòng ${rev.roundNumber}`,
              accessible: canOpenReview,
              ...(exactReviewHref ? { href: exactReviewHref } : {}),
            },
            ...(revisionNumber && rawReview
              ? [
                  {
                    kind: "SUBMISSION_REVISION",
                    id: rawReview.revisionId,
                    label: privacyRedacted ? `Phiên bản bản thảo v${revisionNumber}` : `${rev.submissionTitle} (v${revisionNumber})`,
                    versionLabel: `v${revisionNumber}`,
                    accessible: canOpenReview,
                    ...(exactReviewHref ? { href: exactReviewHref } : {}),
                  },
                ]
              : []),
          ],
          evidenceAccessRestricted: !canOpenReview,
          acknowledgements: [],
          manuscriptContext: {
            title: privacyRedacted ? "Bản thảo nghiên cứu" : rev.submissionTitle,
            publicationStatus: submissionMap.get(rev.submissionId)?.status,
          },
          reviewContext: {
            assignmentId: rev.assignmentId,
            reviewRequestId: assignment?.reviewRequestId ?? null,
            submissionId: rev.submissionId,
            revisionId: rawReview?.revisionId ?? null,
            revisionNumber,
            roundNumber: rev.roundNumber,
            overallAssessment: rev.overallAssessment ?? null,
            reviewStatus: rev.status,
            commentExcerpt,
            submittedAt: rev.submittedAt ?? new Date().toISOString(),
          },
          waitingOnOthers: false,
          needsMyAction: false,
          canViewWorkspace,
          canRequestEdit: false,
          canOpenReviewRequest: canFileReviewRequest,
          privacyRedacted,
        });
      }

      // 4. Manuscript Attribution records
      for (const attr of manuscriptAttributions) {
        const recState: PersonalReconciliationState =
          attr.myDecision === "DISPUTE" || attr.attributionStatus === "DISPUTED"
            ? "DISPUTED"
            : attr.myDecision === "CLARIFY"
              ? "CLARIFICATION_REQUESTED"
              : attr.myDecision === "CONFIRM" || attr.attributionStatus === "VERIFIED"
                ? "ACKNOWLEDGED"
                : attr.needsMyConfirmation
                  ? "PENDING_RESPONSE"
                  : "RECORDED";
        unifiedRecords.push({
          id: `attribution:${attr.checkId}`,
          sourceRecordId: attr.checkId,
          projectId: project.id,
          projectTitle: project.title,
          projectStatus: projectDeleted ? "DELETED" : project.status,
          projectDeleted,
          membershipStatus,
          recordKind: "MANUSCRIPT_ATTRIBUTION",
          title: `Rà soát ghi nhận bản thảo: ${privacyRedacted ? "Bản thảo dự án" : attr.manuscriptTitle}`,
          summary:
            attr.omissionJustification ??
            `Phiên bản ${attr.snapshotLabel} (v${attr.version})`,
          category: "WRITING_REVISION",
          workDate: attr.updatedAt,
          roles: attr.myRoles,
          sourceKind: "TEAM_DECLARED",
          reconciliationState: recState,
          version: attr.version,
          evidenceCount: 1,
          evidenceSources: [
            {
              kind: "MANUSCRIPT_SNAPSHOT",
              id: attr.snapshotId,
              label: attr.snapshotLabel,
              accessible: canViewWorkspace,
            },
          ],
          evidenceAccessRestricted: !canViewWorkspace,
          acknowledgements: [],
          manuscriptContext: {
            manuscriptId: attr.manuscriptId,
            snapshotId: attr.snapshotId,
            title: privacyRedacted ? "Bản thảo dự án" : attr.manuscriptTitle,
            classification: attr.myClassification,
            attributionStatus: attr.attributionStatus,
            publicationStatus: latestPubStatus ?? undefined,
          },
          needsMyAction: attr.needsMyConfirmation,
          actionKind: attr.needsMyConfirmation ? "CONFIRM_ATTRIBUTION" : undefined,
          canViewWorkspace,
          canRequestEdit: false,
          canOpenReviewRequest: canFileReviewRequest,
          privacyRedacted,
        });
      }

      // 5. Deduplicated System Activities
      for (const act of systemActivities) {
        unifiedRecords.push({
          id: `activity:${act.id}`,
          sourceRecordId: act.sourceId,
          projectId: project.id,
          projectTitle: project.title,
          projectStatus: projectDeleted ? "DELETED" : project.status,
          projectDeleted,
          membershipStatus,
          recordKind: "SYSTEM_ACTIVITY",
          title: act.title,
          summary: `Ghi nhận tự động từ ${act.sourceKind.toLowerCase()} (${act.evidenceCount} dấu vết liên quan)`,
          category: act.category,
          workDate: act.occurredAt,
          roles: [],
          suggestedRoles: suggestedCreditRoles(act.type),
          sourceKind: "SYSTEM_RECORDED",
          reconciliationState: projectDeleted ? "HISTORICAL" : "RECORDED",
          version: 1,
          evidenceCount: act.evidenceCount,
          evidenceSources: [
            {
              kind: act.sourceKind,
              id: act.sourceId,
              label: act.title,
              accessible: canViewWorkspace,
            },
          ],
          evidenceAccessRestricted: !canViewWorkspace,
          acknowledgements: [],
          needsMyAction: false,
          canViewWorkspace,
          canRequestEdit: false,
          canOpenReviewRequest: canFileReviewRequest,
          privacyRedacted,
        });
      }

      unifiedRecords.sort((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime());

      const generatedAt = new Date().toISOString();
      const unsignedPayload = {
        schemaVersion: "LUMIGAP_CONTRIBUTION_EVIDENCE_V1" as const,
        projectId: project.id,
        projectTitle: project.title,
        projectStatus: projectDeleted ? "DELETED" : project.status,
        projectDeleted,
        accountRestricted,
        canViewWorkspace,
        canDeclareInProject,
        canFileReviewRequest,
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
        academicReviews,
        manuscriptAttributions,
        integrityCases,
        publicationOutcomes,
        systemActivities,
        unifiedRecords,
        attributionLimitations: ATTRIBUTION_LIMITATIONS,
        privacyRedacted,
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
        advisorContributionCount: exported.advisorContributions.length,
        allocationCount: exported.allocations.length,
      },
    });
    return exported;
  },

  async getGlobalPersonalContributions(
    actorInput: string,
    query: GlobalPersonalContributionsQuery = {},
  ): Promise<GlobalPersonalContributionsView> {
    const db = getPrisma();
    const actorRow = await db.user.findUnique({ where: workspaceId(actorInput) });
    if (!actorRow) throw AppError.unauthorized("User not found");

    const accountRestricted = !actorRow.isActive || actorRow.accountStatus !== "ACTIVE";

    // Discover every project where actor has a legitimate direct or historical contribution link
    const [
      owned,
      memberships,
      periods,
      participantLinks,
      legacyProposals,
      mentorRels,
      mentorAccesses,
      reviews,
      cases,
    ] = await Promise.all([
      db.project.findMany({ where: { ownerId: actorRow.id }, select: { id: true } }),
      db.projectMember.findMany({ where: { userId: actorRow.id }, select: { projectId: true } }),
      db.projectMembershipPeriod.findMany({ where: { userId: actorRow.id }, select: { projectId: true } }),
      db.contributionParticipant.findMany({
        where: { userId: actorRow.id },
        select: { proposalId: true },
      }),
      db.projectContributionProposal.findMany({
        where: { OR: [{ contributorId: actorRow.id }, { proposedById: actorRow.id }] },
        select: { projectId: true },
      }),
      db.mentorRelationship.findMany({ where: { mentorUserId: actorRow.id }, select: { projectId: true } }),
      db.mentorAccess.findMany({ where: { mentorUserId: actorRow.id }, select: { projectId: true } }),
      db.humanReview.findMany({
        where: { reviewerId: actorRow.id, status: "SUBMITTED" },
        select: { submissionId: true },
      }),
      db.researchIntegrityCase.findMany({
        where: { OR: [{ reporterId: actorRow.id }, { respondentUserId: actorRow.id }] },
        select: { projectId: true },
      }),
    ]);

    const participantProposalIds = [...new Set(participantLinks.map(r => r.proposalId))];
    const reviewSubmissionIds = [...new Set(reviews.map(r => r.submissionId))];
    const [participantProposals, reviewSubmissions] = await Promise.all([
      participantProposalIds.length
        ? db.projectContributionProposal.findMany({
            where: { id: { in: participantProposalIds } },
            select: { projectId: true },
          })
        : [],
      reviewSubmissionIds.length
        ? db.submission.findMany({
            where: { id: { in: reviewSubmissionIds } },
            select: { projectId: true },
          })
        : [],
    ]);

    const projectIdSet = new Set<string>([
      ...owned.map(r => r.id),
      ...memberships.map(r => r.projectId),
      ...periods.map(r => r.projectId),
      ...participantProposals.map(r => r.projectId),
      ...legacyProposals.map(r => r.projectId),
      ...mentorRels.map(r => r.projectId),
      ...mentorAccesses.map(r => r.projectId),
      ...reviewSubmissions.map(r => r.projectId),
      ...cases.map(r => r.projectId),
    ]);

    const candidateIds = [...projectIdSet];
    const histories: PersonalContributionHistoryExport[] = [];
    for (const pid of candidateIds) {
      try {
        histories.push(await this.getMyContributionHistory(pid, actorRow.id));
      } catch {
        // Ignore projects where link vanished concurrently
      }
    }

    const projects: GlobalPersonalContributionProjectSummary[] = histories.map(h => {
      const records = h.unifiedRecords ?? [];
      return {
        projectId: h.projectId,
        title: h.projectTitle,
        membershipStatus: h.membershipStatus,
        projectStatus: h.projectStatus ?? "ACTIVE",
        projectDeleted: Boolean(h.projectDeleted),
        canViewWorkspace: Boolean(h.canViewWorkspace),
        canDeclareContribution: Boolean(h.canDeclareInProject),
        recordCount: records.length,
        pendingCount: records.filter(r => r.needsMyAction).length,
        publicationStatus: h.publicationOutcomes?.[0]?.status ?? null,
      };
    });

    const allItems = histories
      .flatMap(h => h.unifiedRecords ?? [])
      .sort((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime());

    const allCases = histories
      .flatMap(h => h.integrityCases ?? [])
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const summary = {
      recordedWorkCount: allItems.length,
      acknowledgedCount: allItems.filter(i => i.reconciliationState === "ACKNOWLEDGED").length,
      needsMyResponseCount:
        allItems.filter(i => i.needsMyAction).length +
        allCases.filter(c => !["RESOLVED", "CLOSED"].includes(c.status) && c.myRole === "RESPONDENT").length,
      projectCount: projects.length,
    };

    const view = query.view ?? "mine";
    const qLower = query.q?.trim().toLowerCase() ?? "";
    const fromTime = query.from ? new Date(query.from).getTime() : null;
    const toTime = query.to ? new Date(query.to).getTime() : null;

    const filtered = allItems.filter(item => {
      if (query.projectId && item.projectId !== query.projectId) return false;
      if (view === "pending" && !item.needsMyAction) return false;
      if (
        view === "saved" &&
        !(
          item.reconciliationState === "ACKNOWLEDGED" ||
          item.reconciliationState === "HISTORICAL" ||
          item.projectDeleted ||
          ["LEFT", "REMOVED", "HISTORICAL"].includes(item.membershipStatus)
        )
      ) {
        return false;
      }
      if (query.role && !item.roles.includes(query.role as CreditRole) && !item.suggestedRoles?.includes(query.role as CreditRole)) {
        return false;
      }
      if (query.source && item.sourceKind !== query.source) return false;
      if (query.status && item.reconciliationState !== query.status) return false;
      if (fromTime && !Number.isNaN(fromTime) && new Date(item.workDate).getTime() < fromTime) return false;
      if (toTime && !Number.isNaN(toTime) && new Date(item.workDate).getTime() > toTime) return false;
      if (qLower) {
        const hay = `${item.title} ${item.summary} ${item.projectTitle} ${item.roles.join(" ")}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });

    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number(query.page) || 1));
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    const generatedAt = new Date().toISOString();
    return {
      userId: actorRow.id,
      userName: actorRow.fullName || "Researcher",
      accountRestricted,
      summary,
      projects: projects.sort((a, b) => b.recordCount - a.recordCount || a.title.localeCompare(b.title)),
      items,
      cases: allCases,
      attributionLimitations: ATTRIBUTION_LIMITATIONS,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
      },
      generatedAt,
    };
  },

  async exportGlobalPersonalContributions(
    actorInput: string,
    query: GlobalPersonalContributionsQuery = {},
  ): Promise<GlobalPersonalContributionsView> {
    const view = await this.getGlobalPersonalContributions(actorInput, {
      ...query,
      page: 1,
      pageSize: 50,
    });
    const integrityDigestSha256 = createHash("sha256").update(JSON.stringify(view)).digest("hex");
    return {
      ...view,
      integrityDigestSha256,
    };
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
    if (!projectRow || Boolean(projectRow.deletedAt) || !actorRow) throw AppError.notFound("Project not found");

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
