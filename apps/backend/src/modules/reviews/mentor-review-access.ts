import { Prisma, type ReviewerAssignment } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { effectiveMentorAccess } from "../projects/mentor-access.service.js";

/** List endpoints must enforce the same live mentor grant as the detail reader.
 * Batch the scope check so a queue does not issue one policy query per review. */
export async function visibleMentorReviewAssignments(tx: Prisma.TransactionClient, assignments: ReviewerAssignment[]) {
  if (!assignments.length) return assignments;
  const submissions = await tx.submission.findMany({ where: { id: { in: [...new Set(assignments.map(a => a.submissionId))] } }, select: { id: true, projectId: true } });
  const activeProjects = new Set((await tx.project.findMany({ where: { id: { in: [...new Set(submissions.map(s => s.projectId))] }, deletedAt: null }, select: { id: true } })).map(p => p.id));
  const activeSubmissions = new Set(submissions.filter(s => activeProjects.has(s.projectId)).map(s => s.id));
  const liveAssignments = assignments.filter(a => activeSubmissions.has(a.submissionId));
  if (!liveAssignments.length) return [];
  const requests = await tx.reviewRequest.findMany({ where: { id: { in: liveAssignments.flatMap(a => a.reviewRequestId ? [a.reviewRequestId] : []) } }, select: { id: true, origin: true } });
  const mentorRequests = new Set(requests.filter(r => r.origin === "MENTOR_GUIDANCE").map(r => r.id));
  const scoped = liveAssignments.filter(a => a.mentorAccessId || a.anonymousCode.startsWith("mentor-") || a.reviewRequestId && mentorRequests.has(a.reviewRequestId));
  if (!scoped.length) return liveAssignments;
  const allowed = await tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT assignment.id
    FROM reviewer_assignments assignment
    JOIN submissions submission ON submission.id=assignment.submission_id
    JOIN projects project ON project.id=submission.project_id AND project.deleted_at IS NULL
    JOIN users reviewer ON reviewer.id=assignment.reviewer_id AND reviewer.is_active AND reviewer.account_status='ACTIVE' AND reviewer.email_verified_at IS NOT NULL
    JOIN academic_profiles profile ON profile.user_id=reviewer.id AND profile.academic_role='LECTURER' AND profile.role_verification_status='VERIFIED' AND profile.position_status='VERIFIED'
    JOIN mentor_access access ON access.project_id=project.id AND access.mentor_user_id=reviewer.id AND access.revoked_at IS NULL AND (access.expires_at IS NULL OR access.expires_at>NOW())
    JOIN mentor_relationships relationship ON relationship.id=access.relationship_id AND relationship.project_id=project.id AND relationship.mentor_user_id=reviewer.id AND relationship.status='ACTIVE'
    JOIN mentorship_requests invitation ON invitation.id=access.request_id AND invitation.id=relationship.source_request_id AND invitation.status='ACCEPTED' AND invitation.project_id=project.id AND invitation.mentor_user_id=reviewer.id
    LEFT JOIN review_requests request ON request.id=assignment.review_request_id
    WHERE assignment.id IN (${Prisma.join(scoped.map(a => Prisma.sql`${a.id}::uuid`))}) AND assignment.status IN ('assigned','accepted','completed')
      AND (assignment.review_request_id IS NULL OR (request.origin='MENTOR_GUIDANCE' AND request.submission_id=submission.id AND request.project_id=project.id AND request.artifact_revision_id=assignment.artifact_revision_id
        AND request.status IN ('REQUESTED','ACCEPTED','IN_REVIEW','RESUBMITTED','REVISION_REQUESTED','COMPLETED') AND (request.status<>'REQUESTED' OR request.expires_at IS NULL OR request.expires_at>NOW())))
      AND (assignment.mentor_access_id=access.id OR (assignment.mentor_access_id IS NULL AND 'SUBMISSIONS_VIEW'=ANY(access.permissions)
        AND EXISTS (SELECT 1 FROM mentor_resource_shares share WHERE share.access_id=access.id AND share.project_id=project.id AND share.kind='SUBMISSION' AND share.resource_id=submission.id AND share.revoked_at IS NULL)))`;
  const scopedIds = new Set(scoped.map(a => a.id)), allowedIds = new Set(allowed.map(a => a.id));
  return liveAssignments.filter(a => !scopedIds.has(a.id) || allowedIds.has(a.id));
}

/** Existing mentor consent, never project membership or broad manuscript access. */
export async function acceptedMentorReviewPolicy(tx: Prisma.TransactionClient, projectId: string, mentorId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { deletedAt: true } });
  if (!project || project.deletedAt) throw AppError.notFound("Project not found");
  const policies = await tx.mentorAccess.findMany({ where: { projectId, mentorUserId: mentorId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  for (let policy of policies) {
    await tx.$queryRaw`SELECT id FROM mentor_access WHERE id=${policy.id}::uuid FOR SHARE`;
    const livePolicy = await tx.mentorAccess.findUnique({ where: { id: policy.id } });
    if (!livePolicy) continue;
    policy = livePolicy;
    if (!await effectiveMentorAccess(tx, policy)) continue;
    const invitation = await tx.mentorshipRequest.findUnique({ where: { id: policy.requestId } });
    const relationship = policy.relationshipId ? await tx.mentorRelationship.findUnique({ where: { id: policy.relationshipId } }) : null;
    if (invitation?.status === "ACCEPTED" && invitation.projectId === projectId && invitation.mentorUserId === mentorId && relationship?.sourceRequestId === invitation.id) return policy;
  }
  throw AppError.forbidden("An accepted, active and verified project mentor is required before requesting manuscript review");
}

/** A review invitation never grants a mentor general project access. */
export async function assertMentorReviewAccess(tx: Prisma.TransactionClient, projectId: string, mentorId: string, submissionId: string, assignmentId?: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { deletedAt: true } });
  if (!project || project.deletedAt) throw AppError.notFound("Project not found");
  // The assignment is the existing ReviewAccess equivalent. Its policy binding is
  // granted only by an authorized sender in the same transaction as the request.
  const assignments = await tx.reviewerAssignment.findMany({ where: { ...(assignmentId ? { id: assignmentId } : {}), submissionId, reviewerId: mentorId, mentorAccessId: { not: null }, status: { in: ["assigned", "accepted", "completed"] } } });
  for (const assignment of assignments) {
    await tx.$queryRaw`SELECT id FROM mentor_access WHERE id=${assignment.mentorAccessId!}::uuid FOR SHARE`;
    const [request, policy] = await Promise.all([
      assignment.reviewRequestId ? tx.reviewRequest.findUnique({ where: { id: assignment.reviewRequestId } }) : null,
      tx.mentorAccess.findUnique({ where: { id: assignment.mentorAccessId! } }),
    ]);
    if (!request || request.origin !== "MENTOR_GUIDANCE" || request.projectId !== projectId || request.submissionId !== submissionId || request.artifactRevisionId !== assignment.artifactRevisionId
      || !["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED", "COMPLETED"].includes(request.status)
      || request.status === "REQUESTED" && request.expiresAt && request.expiresAt <= new Date()) continue;
    if (policy?.projectId === projectId && policy.mentorUserId === mentorId && await effectiveMentorAccess(tx, policy)) {
      const [invitation, relationship] = await Promise.all([
        tx.mentorshipRequest.findUnique({ where: { id: policy.requestId } }),
        policy.relationshipId ? tx.mentorRelationship.findUnique({ where: { id: policy.relationshipId } }) : null,
      ]);
      if (invitation?.status === "ACCEPTED" && invitation.mentorUserId === mentorId && invitation.projectId === projectId && relationship?.sourceRequestId === invitation.id) return;
    }
  }
  if (assignmentId && await tx.reviewerAssignment.count({ where: { id: assignmentId, mentorAccessId: { not: null } } })) throw AppError.forbidden("This manuscript review access has ended");
  // Legacy requests keep their original explicit-share authorization.
  const policies = await tx.mentorAccess.findMany({ where: { projectId, mentorUserId: mentorId, revokedAt: null, permissions: { has: "SUBMISSIONS_VIEW" } } });
  for (let policy of policies) {
    await tx.$queryRaw`SELECT id FROM mentor_access WHERE id=${policy.id}::uuid FOR SHARE`;
    const livePolicy = await tx.mentorAccess.findUnique({ where: { id: policy.id } });
    if (!livePolicy || !livePolicy.permissions.includes("SUBMISSIONS_VIEW")) continue;
    policy = livePolicy;
    if (!await effectiveMentorAccess(tx, policy)) continue;
    const share = await tx.mentorResourceShare.findFirst({ where: { accessId: policy.id, projectId, kind: "SUBMISSION", resourceId: submissionId, revokedAt: null } });
    if (share) {
      await tx.$queryRaw`SELECT id FROM mentor_resource_shares WHERE id=${share.id}::uuid FOR SHARE`;
      if (await tx.mentorResourceShare.count({ where: { id: share.id, revokedAt: null } })) return;
    }
  }
  throw AppError.forbidden("An active assigned mentor and effective sharing permission for this manuscript are required");
}

/** Used by every version/file/history read; historical attribution alone is not access. */
export async function readableReviewAssignments(tx: Prisma.TransactionClient, submissionId: string, reviewerId: string) {
  const submission = await tx.submission.findUnique({ where: { id: submissionId } });
  if (!submission) return [];
  const project = await tx.project.findUnique({ where: { id: submission.projectId }, select: { deletedAt: true } });
  if (!project || project.deletedAt) return [];
  const rows = await tx.reviewerAssignment.findMany({ where: { submissionId, reviewerId, OR: [{ status: { in: ["accepted", "completed"] } }, { status: "assigned", reviewRequestId: null, anonymousCode: { startsWith: "mentor-" } }] } });
  const requests = await tx.reviewRequest.findMany({ where: { id: { in: rows.flatMap(row => row.reviewRequestId ? [row.reviewRequestId] : []) } } });
  const visible: typeof rows = [];
  for (const row of rows) {
    const request = requests.find(item => item.id === row.reviewRequestId);
    if (row.reviewRequestId && (!request || !["ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED", "COMPLETED"].includes(request.status) || request.submissionId !== submissionId || request.projectId !== submission.projectId || request.artifactRevisionId !== row.artifactRevisionId)) continue;
    if (row.mentorAccessId || request?.origin === "MENTOR_GUIDANCE" || row.anonymousCode.startsWith("mentor-")) {
      try { await assertMentorReviewAccess(tx, submission.projectId, reviewerId, submissionId, row.id); }
      catch (error) { if (error instanceof AppError && [403, 404].includes(error.statusCode)) continue; throw error; }
    }
    visible.push(row);
  }
  return visible;
}
