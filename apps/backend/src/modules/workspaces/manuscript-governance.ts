import type {
  ManuscriptDeleteBlockReason,
  ManuscriptGovernanceSummary,
  ManuscriptOwnershipScope,
} from "@trend/shared-types";
import { workspacePeople, workspacePerson, type WorkspaceContext, type WorkspaceDb } from "../projects/workspace-access.js";

export interface DraftGovernanceInput {
  id: string;
  createdById: string;
  archivedAt: Date | null;
  deletedAt: Date | null;
}

export interface ManuscriptSignals {
  contributorIds: Set<string>;
  snapshotCount: number;
  submissionIds: Set<string>;
  reviewThreadCount: number;
  reviewRequestCount: number;
  attributionCheckCount: number;
  commentCount: number;
  remoteBinding: { provider: "GITHUB"; repository: string; branch: string } | null;
}

export interface EvaluatedGovernance {
  canDelete: boolean;
  governance: ManuscriptGovernanceSummary;
}

/** Evaluates collaborative ownership and lifecycle permissions for a manuscript from preloaded signals. */
export function buildManuscriptGovernance(
  row: DraftGovernanceInput,
  projectStatus: string,
  actorId: string,
  role: WorkspaceContext["role"],
  signals: ManuscriptSignals,
  people: Map<string, { id: string; name: string }>,
): EvaluatedGovernance {
  const projectActive = projectStatus !== "ARCHIVED";
  const isDeleted = Boolean(row.deletedAt);
  const isArchived = Boolean(row.archivedAt);
  const orderedIds = [row.createdById, ...[...signals.contributorIds].filter(id => id !== row.createdById)];
  const contributors = orderedIds.map(id => workspacePerson(people, id));
  const contributorCount = contributors.length;

  const hasReviewsOrSubmissions =
    signals.submissionIds.size > 0 ||
    signals.reviewThreadCount > 0 ||
    signals.reviewRequestCount > 0 ||
    signals.attributionCheckCount > 0;
  const isCollaborative = contributorCount > 1;
  const ownershipScope: ManuscriptOwnershipScope =
    isCollaborative || hasReviewsOrSubmissions ? "COLLABORATIVE" : "PERSONAL_DRAFT";
  const isCreatorOrOwner = role === "OWNER" || row.createdById === actorId;
  const canGovernAsset = ownershipScope === "PERSONAL_DRAFT" ? isCreatorOrOwner : role === "OWNER";

  let deleteBlockedReason: ManuscriptDeleteBlockReason | null = null;
  if (!projectActive) {
    deleteBlockedReason = "PROJECT_ARCHIVED";
  } else if (isDeleted) {
    deleteBlockedReason = "ALREADY_DELETED";
  } else if (hasReviewsOrSubmissions) {
    deleteBlockedReason = "HAS_SUBMISSIONS_OR_REVIEWS";
  } else if (isCollaborative) {
    deleteBlockedReason = "COLLABORATIVE_MANUSCRIPT";
  } else if (!isCreatorOrOwner) {
    deleteBlockedReason = "NOT_CREATOR_OR_OWNER";
  }

  const canDelete = deleteBlockedReason === null;
  const canArchive = projectActive && !isDeleted && !isArchived && canGovernAsset;
  const canUnarchive = projectActive && !isDeleted && isArchived && canGovernAsset;
  const canRestore =
    projectActive &&
    isDeleted &&
    (ownershipScope === "PERSONAL_DRAFT" ? isCreatorOrOwner : role === "OWNER");

  const approvalStatus: ManuscriptGovernanceSummary["approvalStatus"] = hasReviewsOrSubmissions
    ? "PROTECTED_RECORD"
    : isCollaborative
      ? "REQUIRES_COAUTHOR_APPROVAL"
      : "NOT_APPLICABLE";

  return {
    canDelete,
    governance: {
      ownershipScope,
      createdBy: workspacePerson(people, row.createdById),
      contributors,
      contributorCount,
      snapshotCount: signals.snapshotCount,
      submissionCount: signals.submissionIds.size,
      reviewThreadCount: signals.reviewThreadCount,
      commentCount: signals.commentCount,
      hasReviewsOrSubmissions,
      remoteBinding: signals.remoteBinding,
      canArchive,
      canUnarchive,
      canRestore,
      deleteBlockedReason,
      requiresCoAuthorApprovalForDelete:
        projectActive && !isDeleted && isCollaborative && !hasReviewsOrSubmissions,
      approvalStatus,
    },
  };
}

function emptySignals(creatorId: string): ManuscriptSignals {
  return {
    contributorIds: new Set([creatorId]),
    snapshotCount: 0,
    submissionIds: new Set(),
    reviewThreadCount: 0,
    reviewRequestCount: 0,
    attributionCheckCount: 0,
    commentCount: 0,
    remoteBinding: null,
  };
}

/** Loads batch collaboration, submission, review, and GitHub binding signals for manuscripts. */
export async function loadManuscriptGovernanceMap(
  tx: WorkspaceDb,
  project: { id: string; status: string },
  actorId: string,
  role: WorkspaceContext["role"],
  rows: DraftGovernanceInput[],
): Promise<Map<string, EvaluatedGovernance>> {
  const result = new Map<string, EvaluatedGovernance>();
  if (!rows.length) return result;

  const workspaceIds = rows.map(r => r.id);
  const signalsByWorkspace = new Map<string, ManuscriptSignals>(
    rows.map(r => [r.id, emptySignals(r.createdById)]),
  );

  const [files, snapshots, suggestions, attributionChecks, remoteBindings] = await Promise.all([
    tx.manuscriptFile.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { id: true, workspaceId: true, createdById: true },
    }),
    tx.manuscriptSnapshot.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { id: true, workspaceId: true, createdById: true },
    }),
    tx.manuscriptSuggestion.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { workspaceId: true, authorId: true },
    }),
    tx.manuscriptAttributionCheck.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { id: true, workspaceId: true, createdById: true },
    }),
    tx.manuscriptRemoteBinding.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { workspaceId: true, repository: true, branch: true },
    }),
  ]);

  const workspaceByFileId = new Map<string, string>();
  for (const file of files) {
    workspaceByFileId.set(file.id, file.workspaceId);
    signalsByWorkspace.get(file.workspaceId)?.contributorIds.add(file.createdById);
  }

  const workspaceBySnapshotId = new Map<string, string>();
  for (const snapshot of snapshots) {
    workspaceBySnapshotId.set(snapshot.id, snapshot.workspaceId);
    const sig = signalsByWorkspace.get(snapshot.workspaceId);
    if (sig) {
      sig.snapshotCount += 1;
      sig.contributorIds.add(snapshot.createdById);
    }
  }

  for (const suggestion of suggestions) {
    signalsByWorkspace.get(suggestion.workspaceId)?.contributorIds.add(suggestion.authorId);
  }

  const workspaceByCheckId = new Map<string, string>();
  for (const check of attributionChecks) {
    workspaceByCheckId.set(check.id, check.workspaceId);
    const sig = signalsByWorkspace.get(check.workspaceId);
    if (sig) {
      sig.attributionCheckCount += 1;
      sig.contributorIds.add(check.createdById);
    }
  }

  for (const binding of remoteBindings) {
    const sig = signalsByWorkspace.get(binding.workspaceId);
    if (sig) {
      sig.remoteBinding = {
        provider: "GITHUB",
        repository: binding.repository,
        branch: binding.branch,
      };
    }
  }

  const allFileIds = files.map(f => f.id);
  const allSnapshotIds = snapshots.map(s => s.id);
  const allCheckIds = attributionChecks.map(c => c.id);

  const [updates, discussions, revisions, decisions] = await Promise.all([
    allFileIds.length
      ? tx.manuscriptUpdate.findMany({
          where: { fileId: { in: allFileIds } },
          distinct: ["fileId", "actorId"],
          select: { fileId: true, actorId: true },
        })
      : Promise.resolve([]),
    tx.projectDiscussion.findMany({
      where: {
        projectId: project.id,
        OR: [
          { targetKind: "MANUSCRIPT", targetId: { in: workspaceIds } },
          ...(allSnapshotIds.length
            ? [{ targetKind: "MANUSCRIPT_SNAPSHOT", targetId: { in: allSnapshotIds } }]
            : []),
        ],
      },
      select: {
        id: true,
        targetKind: true,
        targetId: true,
        authorId: true,
        mentorRelationshipId: true,
      },
    }),
    allSnapshotIds.length
      ? tx.submissionRevision.findMany({
          where: { manuscriptSnapshotId: { in: allSnapshotIds } },
          select: {
            id: true,
            manuscriptSnapshotId: true,
            submissionId: true,
            uploadedById: true,
          },
        })
      : Promise.resolve([]),
    allCheckIds.length
      ? tx.manuscriptAttributionDecision.findMany({
          where: { checkId: { in: allCheckIds } },
          select: { checkId: true, userId: true },
        })
      : Promise.resolve([]),
  ]);

  for (const update of updates) {
    const wsId = workspaceByFileId.get(update.fileId);
    if (wsId) signalsByWorkspace.get(wsId)?.contributorIds.add(update.actorId);
  }

  const workspaceByDiscussionId = new Map<string, string>();
  for (const discussion of discussions) {
    const wsId =
      discussion.targetKind === "MANUSCRIPT"
        ? discussion.targetId
        : discussion.targetId
          ? workspaceBySnapshotId.get(discussion.targetId)
          : undefined;
    if (!wsId) continue;
    workspaceByDiscussionId.set(discussion.id, wsId);
    const sig = signalsByWorkspace.get(wsId);
    if (!sig) continue;
    sig.commentCount += 1;
    if (discussion.mentorRelationshipId) sig.reviewThreadCount += 1;
    else sig.contributorIds.add(discussion.authorId);
  }

  const workspacesBySubmissionId = new Map<string, Set<string>>();
  const workspaceByRevisionId = new Map<string, string>();
  for (const rev of revisions) {
    if (!rev.manuscriptSnapshotId) continue;
    const wsId = workspaceBySnapshotId.get(rev.manuscriptSnapshotId);
    if (!wsId) continue;
    workspaceByRevisionId.set(rev.id, wsId);
    if (!workspacesBySubmissionId.has(rev.submissionId)) {
      workspacesBySubmissionId.set(rev.submissionId, new Set());
    }
    workspacesBySubmissionId.get(rev.submissionId)!.add(wsId);
    const sig = signalsByWorkspace.get(wsId);
    if (sig) {
      sig.submissionIds.add(rev.submissionId);
      sig.contributorIds.add(rev.uploadedById);
    }
  }

  for (const decision of decisions) {
    const wsId = workspaceByCheckId.get(decision.checkId);
    if (wsId) signalsByWorkspace.get(wsId)?.contributorIds.add(decision.userId);
  }

  const discussionIds = [...workspaceByDiscussionId.keys()];
  const submissionIds = [...workspacesBySubmissionId.keys()];
  const revisionIds = [...workspaceByRevisionId.keys()];

  const [messages, submissionAuthors, reviewRequests] = await Promise.all([
    discussionIds.length
      ? tx.projectTeamMessage.findMany({
          where: { projectId: project.id, threadId: { in: discussionIds }, isDeleted: false },
          distinct: ["threadId", "senderId"],
          select: { threadId: true, senderId: true },
        })
      : Promise.resolve([]),
    submissionIds.length
      ? tx.submissionAuthor.findMany({
          where: { submissionId: { in: submissionIds } },
          select: { submissionId: true, userId: true },
        })
      : Promise.resolve([]),
    submissionIds.length || revisionIds.length
      ? tx.reviewRequest.findMany({
          where: {
            projectId: project.id,
            OR: [
              ...(submissionIds.length ? [{ submissionId: { in: submissionIds } }] : []),
              ...(revisionIds.length ? [{ artifactRevisionId: { in: revisionIds } }] : []),
            ],
          },
          select: { id: true, submissionId: true, artifactRevisionId: true },
        })
      : Promise.resolve([]),
  ]);

  const mentorCommentThreadIds = new Set(
    discussions.filter(d => d.mentorRelationshipId !== null).map(d => d.id),
  );
  for (const message of messages) {
    if (!message.threadId) continue;
    const wsId = workspaceByDiscussionId.get(message.threadId);
    if (!wsId) continue;
    const sig = signalsByWorkspace.get(wsId);
    if (!sig) continue;
    sig.commentCount += 1;
    // Exclude mentor-only replies from co-author identity count unless a team member posted on non-mentor thread.
    if (!mentorCommentThreadIds.has(message.threadId)) {
      sig.contributorIds.add(message.senderId);
    }
  }

  for (const author of submissionAuthors) {
    for (const wsId of workspacesBySubmissionId.get(author.submissionId) ?? []) {
      signalsByWorkspace.get(wsId)?.contributorIds.add(author.userId);
    }
  }

  for (const request of reviewRequests) {
    const revWs = workspaceByRevisionId.get(request.artifactRevisionId);
    const matched = new Set<string>(revWs ? [revWs] : []);
    for (const wsId of workspacesBySubmissionId.get(request.submissionId) ?? []) {
      matched.add(wsId);
    }
    for (const wsId of matched) {
      const sig = signalsByWorkspace.get(wsId);
      if (sig) sig.reviewRequestCount += 1;
    }
  }

  const allUserIds = [...signalsByWorkspace.values()].flatMap(sig => [...sig.contributorIds]);
  const people = await workspacePeople(tx, allUserIds);

  for (const row of rows) {
    const sig = signalsByWorkspace.get(row.id) ?? emptySignals(row.createdById);
    result.set(row.id, buildManuscriptGovernance(row, project.status, actorId, role, sig, people));
  }
  return result;
}
