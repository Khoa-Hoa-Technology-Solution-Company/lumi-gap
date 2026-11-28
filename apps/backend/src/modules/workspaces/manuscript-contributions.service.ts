import {
  creditRoles,
  type CreditRole,
  type ManuscriptContributionsSummary,
  type ManuscriptContributorAcknowledgementState,
  type ManuscriptContributorOverviewItem,
  type ManuscriptFileContributionItem,
  type ManuscriptManifest,
  type ManuscriptWritingCalculation,
  type ManuscriptWritingReport,
  type WorkContribution,
  type WorkspacePerson,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, workspacePeople, workspacePerson, type WorkspaceContext } from "../projects/workspace-access.js";
import { presentWorkContribution } from "../projects/work-contributions.service.js";
import { readManuscriptAttribution } from "./manuscript-attribution.service.js";

export interface ManuscriptContributionsQuery {
  memberId?: string;
  fileId?: string;
}

const AI_RECEIPT_NOTICE =
  "AI assistance receipts record tool generation and accepted insertions separately from human contributors. AI is never a contributor or author; human authors remain responsible for all manuscript content.";

const GRANULARITY_NOTICE =
  "Recorded editing, suggestion, comment, and retained-writing evidence is tracked at the manuscript or file level. Section-level attribution is not fabricated when underlying records are file- or manuscript-scoped.";

function pickLatestIso(current: string | null, candidate: Date | string | null | undefined): string | null {
  if (!candidate) return current;
  const iso = candidate instanceof Date ? candidate.toISOString() : candidate;
  if (!current) return iso;
  return iso > current ? iso : current;
}

function emptyActivity() {
  return {
    fileEditsCount: 0,
    editedFilePaths: [] as string[],
    suggestionsProposed: 0,
    suggestionsAcceptedAsAuthor: 0,
    suggestionsResolvedAsReviewer: 0,
    commentsCount: 0,
    snapshotsCreated: 0,
    formalReviewsCount: 0,
    mentorFeedbackCount: 0,
    lastActivityAt: null as string | null,
  };
}

function computeAcknowledgementState(
  declarations: WorkContribution[],
  userId: string,
): ManuscriptContributorAcknowledgementState {
  const mine = declarations.filter(d => d.participants.some(p => p.userId === userId));
  if (!mine.length) return "NONE";
  if (mine.some(d => d.status === "DISPUTED")) return "DISPUTED";
  if (mine.some(d => d.status === "NEEDS_CHANGES")) return "NEEDS_CHANGES";
  if (mine.some(d => d.status === "SUBMITTED")) return "PENDING";
  if (mine.some(d => d.status === "ACCEPTED")) return "ACKNOWLEDGED";
  if (mine.some(d => d.status === "SELF_RECORDED")) return "SELF_RECORDED";
  return "DRAFT_ONLY";
}

function resolveFileIdFromContext(context: unknown): string | null {
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const fileId = (context as { fileId?: unknown }).fileId;
  return typeof fileId === "string" && fileId.length > 0 ? fileId : null;
}

async function buildSummary(
  c: WorkspaceContext,
  manuscriptId: string,
  query: ManuscriptContributionsQuery,
): Promise<ManuscriptContributionsSummary> {
  const draft = await c.tx.draftWorkspace.findFirst({
    where: { id: manuscriptId, projectId: c.project.id, writingMode: "LATEX", deletedAt: null },
  });
  if (!draft) throw AppError.notFound("Manuscript not found");

  const [
    files,
    snapshots,
    members,
    mentorRelationships,
    latestCompletedReport,
    latestAnyReport,
    suggestions,
    aiRunCount,
    aiAcceptances,
    externalAiCount,
    projectProposals,
  ] = await Promise.all([
    c.tx.manuscriptFile.findMany({
      where: { workspaceId: manuscriptId, deletedAt: null },
      orderBy: [{ path: "asc" }, { id: "asc" }],
      take: 200,
      select: { id: true, path: true, kind: true, createdById: true, createdAt: true },
    }),
    c.tx.manuscriptSnapshot.findMany({
      where: { workspaceId: manuscriptId, projectId: c.project.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: { id: true, label: true, sourceVersion: true, createdById: true, createdAt: true, manifest: true },
    }),
    c.tx.projectMember.findMany({
      where: { projectId: c.project.id },
      select: { userId: true, status: true },
    }),
    c.tx.mentorRelationship.findMany({
      where: { projectId: c.project.id },
      select: { id: true, mentorUserId: true, status: true },
    }),
    c.tx.manuscriptWritingReport.findFirst({
      where: { projectId: c.project.id, workspaceId: manuscriptId, status: "COMPLETED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    c.tx.manuscriptWritingReport.findFirst({
      where: { projectId: c.project.id, workspaceId: manuscriptId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    c.tx.manuscriptSuggestion.findMany({
      where: { workspaceId: manuscriptId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
      select: {
        id: true,
        fileId: true,
        authorId: true,
        resolvedById: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
    c.tx.aiRun.count({
      where: { workspaceId: manuscriptId, projectId: c.project.id, jobType: "manuscript_writing" },
    }),
    c.tx.manuscriptAiAcceptance.findMany({
      where: { workspaceId: manuscriptId, projectId: c.project.id },
      take: 1000,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, fileId: true, acceptedById: true, createdAt: true },
    }),
    c.tx.projectActivity.count({
      where: { projectId: c.project.id, type: "EXTERNAL_AI_DECLARED" },
    }),
    c.tx.projectContributionProposal.findMany({
      where: { projectId: c.project.id },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 300,
    }),
  ]);

  const fileIds = files.map(f => f.id);
  const snapshotIds = snapshots.map(s => s.id);
  const filePathById = new Map(files.map(f => [f.id, f.path]));

  const [updateGroups, discussions, revisions] = await Promise.all([
    fileIds.length
      ? c.tx.manuscriptUpdate.groupBy({
          by: ["fileId", "actorId"],
          where: { fileId: { in: fileIds } },
          _count: { id: true },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
    c.tx.projectDiscussion.findMany({
      where: {
        projectId: c.project.id,
        OR: [
          { targetKind: "MANUSCRIPT", targetId: manuscriptId },
          ...(snapshotIds.length ? [{ targetKind: "MANUSCRIPT_SNAPSHOT", targetId: { in: snapshotIds } }] : []),
        ],
      },
      take: 500,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        authorId: true,
        status: true,
        context: true,
        mentorRelationshipId: true,
        createdAt: true,
      },
    }),
    snapshotIds.length
      ? c.tx.submissionRevision.findMany({
          where: { manuscriptSnapshotId: { in: snapshotIds } },
          select: { id: true, submissionId: true, manuscriptSnapshotId: true },
        })
      : Promise.resolve([]),
  ]);

  const revisionIds = revisions.map(r => r.id);
  const formalReviews = revisionIds.length
    ? await c.tx.humanReview.findMany({
        where: { revisionId: { in: revisionIds }, status: "SUBMITTED" },
        select: { id: true, reviewerId: true, submittedAt: true, createdAt: true },
      })
    : [];

  // Scope work contributions strictly to this manuscript, its snapshots, published revisions, or submitted reviews.
  const scopeTargets = new Set<string>([
    `MANUSCRIPT:${manuscriptId}`,
    ...snapshotIds.map(id => `MANUSCRIPT_SNAPSHOT:${id}`),
    ...revisions.flatMap(r => [`SUBMISSION:${r.submissionId}`, `SUBMISSION_REVISION:${r.id}`]),
    ...formalReviews.map(r => `HUMAN_REVIEW:${r.id}`),
  ]);

  const scopedProposalRows = projectProposals.filter(row => {
    if (!Array.isArray(row.evidenceRefs)) return false;
    return row.evidenceRefs.some(ref => {
      if (!ref || typeof ref !== "object" || Array.isArray(ref)) return false;
      const kind = (ref as { kind?: unknown }).kind;
      const id = (ref as { id?: unknown }).id;
      return typeof kind === "string" && typeof id === "string" && scopeTargets.has(`${kind}:${id}`);
    });
  });

  const scopedProposalIds = scopedProposalRows.map(p => p.id);
  const [proposalParticipants, proposalReviews] = scopedProposalIds.length
    ? await Promise.all([
        c.tx.contributionParticipant.findMany({ where: { proposalId: { in: scopedProposalIds } } }),
        c.tx.contributionReview.findMany({
          where: { proposalId: { in: scopedProposalIds } },
          orderBy: { createdAt: "asc" },
        }),
      ])
    : [[], []];

  // Collect all user IDs referenced across manuscript records so every name resolves consistently.
  const userIds = new Set<string>([c.project.ownerId, c.actorId]);
  for (const m of members) userIds.add(m.userId);
  for (const rel of mentorRelationships) userIds.add(rel.mentorUserId);
  for (const s of snapshots) userIds.add(s.createdById);
  for (const u of updateGroups) userIds.add(u.actorId);
  for (const sg of suggestions) {
    userIds.add(sg.authorId);
    if (sg.resolvedById) userIds.add(sg.resolvedById);
  }
  for (const d of discussions) userIds.add(d.authorId);
  for (const r of formalReviews) userIds.add(r.reviewerId);
  for (const p of scopedProposalRows) userIds.add(p.proposedById);
  for (const p of proposalParticipants) userIds.add(p.userId);
  for (const r of proposalReviews) userIds.add(r.userId);

  const reportRow = latestCompletedReport ?? latestAnyReport;
  const reportResult = (latestCompletedReport?.result as unknown as ManuscriptWritingCalculation | null) ?? null;
  if (reportResult) {
    for (const m of reportResult.members) userIds.add(m.userId);
  }

  const peopleMap = await workspacePeople(c.tx, [...userIds]);

  const listData = {
    participants: proposalParticipants,
    reviews: proposalReviews,
    people: peopleMap,
  };

  const allDeclarations: WorkContribution[] = await Promise.all(
    scopedProposalRows.map(row => presentWorkContribution(c, row, false, listData)),
  );

  const existingWritingDraft = allDeclarations.find(
    d =>
      d.status === "DRAFT" &&
      d.createdBy.id === c.actorId &&
      typeof d.evidence === "string" &&
      d.evidence.startsWith("RETAINED_WRITING_V1"),
  );

  // Build latest writing report DTO if any exists.
  let latestWritingReport: ManuscriptWritingReport | null = null;
  if (reportRow) {
    const snap = snapshots.find(s => s.id === reportRow.snapshotId) ??
      (await c.tx.manuscriptSnapshot.findUnique({ where: { id: reportRow.snapshotId } }));
    if (snap) {
      latestWritingReport = {
        id: reportRow.id,
        manuscriptId: reportRow.workspaceId,
        snapshotId: reportRow.snapshotId,
        title: (snap.manifest as unknown as ManuscriptManifest).title ?? draft.name,
        snapshotLabel: snap.label,
        sourceVersion: snap.sourceVersion,
        status: reportRow.status as ManuscriptWritingReport["status"],
        createdAt: reportRow.createdAt.toISOString(),
        calculatedAt: reportRow.calculatedAt?.toISOString() ?? null,
        inputHash: reportRow.inputHash,
        result: (reportRow.result as unknown as ManuscriptWritingCalculation | null) ?? null,
        isStale: draft.version !== snap.sourceVersion,
      };
    }
  }

  // Attribution check summary for latest snapshot (read-only, no mutations).
  const latestSnap = snapshots[0] ?? null;
  let attributionCheck: ManuscriptContributionsSummary["attributionCheck"] = null;
  if (latestSnap) {
    try {
      const checkView = await readManuscriptAttribution(
        c.tx,
        c.project.id,
        manuscriptId,
        latestSnap.id,
        c.actorId,
      );
      const pendingDecisionsCount = checkView.proposedAuthors.filter(a => !a.confirmed).length;
      const disputedCount = checkView.decisions.filter(d => d.decision === "DISPUTE").length;
      attributionCheck = {
        snapshotId: latestSnap.id,
        checkId: checkView.checkId,
        status: checkView.status,
        readyForInternalSubmission: checkView.readyForInternalSubmission,
        viewerCanDecide: checkView.viewerCanDecide,
        pendingDecisionsCount,
        disputedCount,
      };
    } catch {
      attributionCheck = null;
    }
  }

  // Statement readiness summary computed strictly from manuscript-scoped declarations.
  const nonDraftDeclarations = allDeclarations.filter(d => d.status !== "DRAFT");
  const pendingStatementCount = nonDraftDeclarations.filter(d =>
    ["SUBMITTED", "NEEDS_CHANGES", "DISPUTED"].includes(d.status),
  ).length;
  const statementContributors = new Map<string, { name: string; roles: Set<CreditRole> }>();
  for (const decl of nonDraftDeclarations) {
    if (!["ACCEPTED", "SELF_RECORDED", "CONFIRMED"].includes(decl.status)) continue;
    for (const part of decl.participants) {
      if (!part.roles.length) continue;
      const entry = statementContributors.get(part.userId) ?? { name: part.name, roles: new Set<CreditRole>() };
      for (const role of part.roles) entry.roles.add(role);
      statementContributors.set(part.userId, entry);
    }
  }
  const statementLines = [...statementContributors.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => `${entry.name}: ${[...entry.roles].join(", ")}`);
  const statementReady = statementLines.length > 0 && pendingStatementCount === 0;
  const statement: ManuscriptContributionsSummary["statement"] = {
    scopeKey: `DRAFT:${manuscriptId}`,
    ready: statementReady,
    pendingCount: pendingStatementCount,
    contributorCount: statementContributors.size,
    statement: statementReady ? statementLines.join("; ") : null,
  };

  // Assemble per-contributor overview (alphabetical, NEVER sorted by word count or edit count).
  const activeMemberIds = new Set<string>([
    c.project.ownerId,
    ...members.filter(m => m.status === "ACTIVE").map(m => m.userId),
  ]);
  const mentorIds = new Set<string>(mentorRelationships.map(m => m.mentorUserId));

  // Track which users have real manuscript relevance (declared work, activity, retained writing, or active team).
  const contributorIds = new Set<string>();
  for (const id of activeMemberIds) contributorIds.add(id);
  for (const d of allDeclarations) {
    for (const p of d.participants) contributorIds.add(p.userId);
  }
  for (const u of updateGroups) contributorIds.add(u.actorId);
  for (const sg of suggestions) {
    contributorIds.add(sg.authorId);
    if (sg.resolvedById) contributorIds.add(sg.resolvedById);
  }
  for (const d of discussions) contributorIds.add(d.authorId);
  for (const s of snapshots) contributorIds.add(s.createdById);
  for (const r of formalReviews) contributorIds.add(r.reviewerId);
  if (reportResult) {
    for (const m of reportResult.members) contributorIds.add(m.userId);
  }

  const activityByUser = new Map<string, ReturnType<typeof emptyActivity>>();
  const getActivity = (userId: string) => {
    let entry = activityByUser.get(userId);
    if (!entry) {
      entry = emptyActivity();
      activityByUser.set(userId, entry);
    }
    return entry;
  };

  const editedPathsByUser = new Map<string, Set<string>>();
  for (const group of updateGroups) {
    const act = getActivity(group.actorId);
    act.fileEditsCount += group._count.id;
    act.lastActivityAt = pickLatestIso(act.lastActivityAt, group._max.createdAt);
    const path = filePathById.get(group.fileId);
    if (path) {
      let set = editedPathsByUser.get(group.actorId);
      if (!set) {
        set = new Set<string>();
        editedPathsByUser.set(group.actorId, set);
      }
      set.add(path);
    }
  }
  for (const [userId, paths] of editedPathsByUser) {
    getActivity(userId).editedFilePaths = [...paths].sort();
  }

  for (const sg of suggestions) {
    const proposer = getActivity(sg.authorId);
    proposer.suggestionsProposed += 1;
    if (sg.status === "ACCEPTED") proposer.suggestionsAcceptedAsAuthor += 1;
    proposer.lastActivityAt = pickLatestIso(proposer.lastActivityAt, sg.createdAt);
    if (sg.resolvedById && (sg.status === "ACCEPTED" || sg.status === "REJECTED")) {
      const resolver = getActivity(sg.resolvedById);
      resolver.suggestionsResolvedAsReviewer += 1;
      resolver.lastActivityAt = pickLatestIso(resolver.lastActivityAt, sg.resolvedAt ?? sg.createdAt);
    }
  }

  for (const disc of discussions) {
    const act = getActivity(disc.authorId);
    if (disc.mentorRelationshipId) {
      act.mentorFeedbackCount += 1;
    } else {
      act.commentsCount += 1;
    }
    act.lastActivityAt = pickLatestIso(act.lastActivityAt, disc.createdAt);
  }

  for (const snap of snapshots) {
    const act = getActivity(snap.createdById);
    act.snapshotsCreated += 1;
    act.lastActivityAt = pickLatestIso(act.lastActivityAt, snap.createdAt);
  }

  for (const rev of formalReviews) {
    const act = getActivity(rev.reviewerId);
    act.formalReviewsCount += 1;
    act.lastActivityAt = pickLatestIso(act.lastActivityAt, rev.submittedAt ?? rev.createdAt);
  }

  let contributors: ManuscriptContributorOverviewItem[] = [...contributorIds].map(userId => {
    const person = workspacePerson(peopleMap, userId);
    const isActiveMember = activeMemberIds.has(userId);
    const isMentorOnly = !isActiveMember && mentorIds.has(userId);
    const participantKind: "MEMBER" | "MENTOR" = isMentorOnly ? "MENTOR" : "MEMBER";
    const membershipStatus: "ACTIVE" | "FORMER" | "MENTOR" = isActiveMember
      ? "ACTIVE"
      : isMentorOnly
        ? "MENTOR"
        : "FORMER";

    const userDeclarations = allDeclarations.filter(d => d.participants.some(p => p.userId === userId));
    const declaredRoleSet = new Set<CreditRole>();
    const acknowledgedRoleSet = new Set<CreditRole>();
    for (const decl of userDeclarations) {
      const part = decl.participants.find(p => p.userId === userId);
      if (!part) continue;
      for (const role of part.roles) {
        declaredRoleSet.add(role);
        const participantAcked =
          decl.status === "ACCEPTED" ||
          decl.status === "SELF_RECORDED" ||
          decl.reviews.some(r => r.version === decl.version && r.userId === userId && r.decision === "ACKNOWLEDGE");
        if (participantAcked) acknowledgedRoleSet.add(role);
      }
    }

    const writingMember = reportResult?.members.find(m => m.userId === userId) ?? null;
    const retainedWriting =
      writingMember && reportResult && latestCompletedReport
        ? {
            retainedWordUnits: writingMember.retainedWordUnits,
            totalWords: reportResult.totalWords,
            coverageBasisPoints: reportResult.coverageBasisPoints,
            overallBasisPoints: writingMember.overallBasisPoints,
            snapshotVersion:
              snapshots.find(s => s.id === latestCompletedReport.snapshotId)?.sourceVersion ?? draft.version,
          }
        : null;

    return {
      userId,
      name: person.name,
      participantKind,
      membershipStatus,
      declaredRoles: creditRoles.filter(r => declaredRoleSet.has(r)),
      acknowledgedRoles: creditRoles.filter(r => acknowledgedRoleSet.has(r)),
      declarationCount: userDeclarations.length,
      pendingAcknowledgementCount: userDeclarations.filter(d => d.status === "SUBMITTED").length,
      disputedCount: userDeclarations.filter(d => d.status === "DISPUTED" || d.status === "NEEDS_CHANGES").length,
      acknowledgementState: computeAcknowledgementState(allDeclarations, userId),
      activity: activityByUser.get(userId) ?? emptyActivity(),
      retainedWriting,
    };
  });

  if (query.memberId) {
    contributors = contributors.filter(item => item.userId === query.memberId);
  }

  // Strictly alphabetical ordering — never rank contributors by word count or edit volume.
  contributors.sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));

  // Build file-level content summary (honestly labeled FILE_LEVEL, never fabricating section attribution).
  const reportFileStats = new Map(
    (reportResult?.files ?? []).map(f => [f.id, { totalWords: f.totalWords, unknownWordUnits: f.unknownWordUnits }]),
  );

  let fileItems: ManuscriptFileContributionItem[] = files
    .filter(f => f.kind !== "FOLDER")
    .map(file => {
      const fileUpdates = updateGroups.filter(u => u.fileId === file.id);
      const editors = fileUpdates
        .map(u => ({
          userId: u.actorId,
          name: workspacePerson(peopleMap, u.actorId).name,
          updateCount: u._count.id,
          lastEditedAt: u._max.createdAt?.toISOString() ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const fileSuggestions = suggestions.filter(s => s.fileId === file.id);
      const proposerIds = [...new Set(fileSuggestions.map(s => s.authorId))];
      const resolverIds = [
        ...new Set(fileSuggestions.flatMap(s => (s.resolvedById ? [s.resolvedById] : []))),
      ];

      const fileComments = discussions.filter(d => resolveFileIdFromContext(d.context) === file.id);
      const commentAuthorIds = [...new Set(fileComments.map(d => d.authorId))];

      const fileAiAccepted = aiAcceptances.filter(a => a.fileId === file.id).length;
      const stats = reportFileStats.get(file.id);

      const toSortedPeople = (ids: string[]): WorkspacePerson[] =>
        ids.map(id => workspacePerson(peopleMap, id)).sort((a, b) => a.name.localeCompare(b.name));

      return {
        fileId: file.id,
        path: file.path,
        kind: file.kind as "TEXT" | "ASSET" | "FOLDER",
        isMain: draft.mainFileId === file.id,
        totalWords: stats?.totalWords ?? null,
        unknownWordUnits: stats?.unknownWordUnits ?? null,
        editors,
        suggestions: {
          total: fileSuggestions.length,
          pending: fileSuggestions.filter(s => s.status === "PENDING").length,
          accepted: fileSuggestions.filter(s => s.status === "ACCEPTED").length,
          rejected: fileSuggestions.filter(s => s.status === "REJECTED").length,
          proposers: toSortedPeople(proposerIds),
          resolvers: toSortedPeople(resolverIds),
        },
        comments: {
          total: fileComments.length,
          open: fileComments.filter(d => d.status === "OPEN").length,
          resolved: fileComments.filter(d => d.status === "RESOLVED").length,
          authors: toSortedPeople(commentAuthorIds),
        },
        aiAcceptedEdits: fileAiAccepted,
        granularity: "FILE_LEVEL",
      };
    });

  if (query.fileId) {
    fileItems = fileItems.filter(item => item.fileId === query.fileId);
  }

  // AI receipts by file
  const aiByFileCounts = new Map<string, number>();
  for (const acc of aiAcceptances) {
    aiByFileCounts.set(acc.fileId, (aiByFileCounts.get(acc.fileId) ?? 0) + 1);
  }
  const acceptedByFiles = [...aiByFileCounts.entries()]
    .map(([fileId, count]) => ({
      fileId,
      path: filePathById.get(fileId) ?? "Archived or removed file",
      count,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const filteredDeclarations = query.memberId
    ? allDeclarations.filter(
        d => d.createdBy.id === query.memberId || d.participants.some(p => p.userId === query.memberId),
      )
    : allDeclarations;

  const viewerActionableDeclarations = filteredDeclarations.filter(d => {
    if (!d.reviewActions.length) return false;
    const alreadyConfirmed = d.reviews.some(
      r => r.version === d.version && r.userId === c.actorId && ["ACKNOWLEDGE", "ACCEPT"].includes(r.decision),
    );
    return !alreadyConfirmed || d.status === "DISPUTED" || d.status === "NEEDS_CHANGES";
  });

  const viewerOwnDeclarations = filteredDeclarations.filter(
    d => d.createdBy.id === c.actorId || d.participants.some(p => p.userId === c.actorId),
  );

  const disputedOrClarificationDeclarations = filteredDeclarations.filter(
    d => d.status === "DISPUTED" || d.status === "NEEDS_CHANGES",
  );

  const canWrite = Boolean(c.role) && !draft.archivedAt && !["ARCHIVED", "COMPLETED"].includes(c.project.status);

  return {
    projectId: c.project.id,
    manuscriptId,
    manuscriptTitle: draft.name,
    currentVersion: draft.version,
    viewerId: c.actorId,
    canWrite,
    latestSnapshot: latestSnap
      ? {
          id: latestSnap.id,
          label: latestSnap.label,
          sourceVersion: latestSnap.sourceVersion,
          createdAt: latestSnap.createdAt.toISOString(),
          isStale: draft.version !== latestSnap.sourceVersion,
        }
      : null,
    latestWritingReport,
    existingWritingDraftId: existingWritingDraft?.id ?? null,
    attributionCheck,
    statement,
    contributors,
    declarations: filteredDeclarations,
    viewerActionableDeclarations,
    viewerOwnDeclarations,
    disputedOrClarificationDeclarations,
    files: fileItems,
    aiReceipts: {
      totalRuns: aiRunCount,
      acceptedEditsCount: aiAcceptances.length,
      acceptedByFiles,
      externalDeclarationsCount: externalAiCount,
      notice: AI_RECEIPT_NOTICE,
    },
    granularityNotice: GRANULARITY_NOTICE,
  };
}

export const manuscriptContributionsService = {
  async summary(
    projectId: string,
    actorId: string,
    manuscriptId: string,
    query: ManuscriptContributionsQuery = {},
  ): Promise<ManuscriptContributionsSummary> {
    return withWorkspace(projectId, actorId, { timeoutMs: 25000 }, c => buildSummary(c, manuscriptId, query));
  },
};
