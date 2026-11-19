import crypto from "node:crypto";
import type { MentorManuscriptContext, MentorManuscriptSendInput, MentorManuscriptSendResult, UserRole, ManuscriptManifest } from "@trend/shared-types";
import type { Prisma, Project, User, Submission } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { pdfStorageService } from "../../infrastructure/pdf-storage.service.js";
import { logger } from "../../infrastructure/logger.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { lockProjectAccounts, assertActiveProjectAccount } from "../projects/project-transaction.js";
import { acceptedMentorReviewPolicy } from "../reviews/mentor-review-access.js";
import { createAssignedMentorReview } from "../reviews/mentor-review-request.js";
import { dispatchReviewNotifications } from "../reviews/review-notifications.js";
import { reviewRequestService } from "../reviews/review-request.service.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import { mentorManuscriptSendSchema } from "./dto/mentor-manuscript.schema.js";
import { validateMentorPdf } from "./mentor-pdf-validation.js";

type Db = Prisma.TransactionClient;
type Pdf = { buffer: Buffer; size: number; originalname: string };
export interface MentorSubmissionAccess {
  user: (id: string) => Promise<User>;
  project: (id: string, actor: string, role: UserRole, db?: Db) => Promise<Project>;
  manage: (submission: Submission, actor: string, role: UserRole, db?: Db) => Promise<boolean>;
}
const hash = (value: string | Uint8Array) => crypto.createHash("sha256").update(value).digest("hex");
const whereId = (id: string) => { const parsed = parseDatabaseId(id); if (!parsed) throw AppError.badRequest("Invalid submission ID"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; };

async function thread(db: Db, projectId: string, manuscriptId?: string, submissionId?: string) {
  if (submissionId) return db.submission.findFirst({ where: { ...whereId(submissionId), projectId } });
  if (!manuscriptId) return null;
  const canonical = await db.submission.findUnique({ where: { sourceManuscriptId: manuscriptId } });
  if (canonical) return canonical.projectId === projectId ? canonical : null;
  // Retain the previous internal-review thread when it predates the source column.
  const old = await db.$queryRaw<Array<{ id: string }>>`SELECT DISTINCT s.id,s.created_at FROM submissions s
    JOIN submission_revisions r ON r.submission_id=s.id JOIN manuscript_snapshots m ON m.id=r.manuscript_snapshot_id
    WHERE s.project_id=${projectId}::uuid AND m.workspace_id=${manuscriptId}::uuid
      AND EXISTS(SELECT 1 FROM review_requests q WHERE q.submission_id=s.id AND q.origin='MENTOR_GUIDANCE')
    ORDER BY s.created_at ASC LIMIT 1`;
  return old[0] ? db.submission.findUnique({ where: { id: old[0].id } }) : null;
}

async function contextFor(db: Db, submission: Submission | null): Promise<MentorManuscriptContext> {
  if (!submission) return { submission: null, requests: [] };
  const requests = await db.reviewRequest.findMany({ where: { submissionId: submission.id, origin: "MENTOR_GUIDANCE" }, orderBy: { createdAt: "desc" } });
  const assignments = await db.reviewerAssignment.findMany({ where: { reviewRequestId: { in: requests.map(item => item.id) } } });
  const reviews = await db.humanReview.findMany({ where: { assignmentId: { in: assignments.map(item => item.id) }, status: "SUBMITTED" }, select: { id: true, assignmentId: true } });
  const items = await db.reviewRevisionItem.findMany({ where: { reviewId: { in: reviews.map(item => item.id) }, status: { in: ["OPEN", "REOPENED"] } } });
  return { submission: { id: submission.id, title: submission.title, currentRevisionNumber: submission.currentRevisionNumber, sourceManuscriptId: submission.sourceManuscriptId }, requests: requests.flatMap(request => {
    const assignment = assignments.find(item => item.reviewRequestId === request.id); if (!assignment) return [];
    const ids = new Set(reviews.filter(item => item.assignmentId === assignment.id).map(item => item.id));
    return [{ id: request.id, mentorId: assignment.reviewerId, status: request.status === "REQUESTED" && request.expiresAt && request.expiresAt <= new Date() ? "EXPIRED" : request.status, revisionId: request.artifactRevisionId,
      items: items.filter(item => ids.has(item.reviewId)).map(item => ({ id: item.id, description: item.description, priority: item.priority })) }];
  }) };
}

export const mentorManuscriptService = {
  async context(input: { projectId: string; manuscriptId?: string; submissionId?: string }, actorInput: string, role: UserRole, access: MentorSubmissionAccess) {
    const actor = await access.user(actorInput), project = await access.project(input.projectId, actor.id, role);
    const db = getPrisma();
    if (input.manuscriptId && !await db.draftWorkspace.findFirst({ where: { id: input.manuscriptId, projectId: project.id, writingMode: "LATEX", deletedAt: null } })) throw AppError.notFound("Manuscript not found");
    const submission = await thread(db, project.id, input.manuscriptId, input.submissionId);
    if (input.submissionId && !submission) throw AppError.notFound("Submission not found");
    return contextFor(db, submission);
  },

  async send(raw: MentorManuscriptSendInput, file: Pdf | undefined, actorInput: string, role: UserRole, access: MentorSubmissionAccess): Promise<MentorManuscriptSendResult> {
    const input = mentorManuscriptSendSchema.parse(raw);
    const actor = await access.user(actorInput), project = await access.project(input.projectId, actor.id, role), mentor = await access.user(input.mentorId);
    if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    await getPrisma().$transaction(tx => acceptedMentorReviewPolicy(tx, project.id, mentor.id));
    const db = getPrisma();
    let manuscriptId: string | undefined, title = input.title, sourceText: string | undefined, snapshotDigest: string | undefined;
    let pdf: Pdf;
    if (input.source === "SNAPSHOT") {
      if (file) throw AppError.badRequest("Choose one manuscript source only");
      const snapshot = await db.manuscriptSnapshot.findFirst({ where: { id: input.manuscriptSnapshotId, projectId: project.id } });
      if (!snapshot) throw AppError.notFound("Manuscript snapshot not found");
      const manuscript = await db.draftWorkspace.findFirst({ where: { id: snapshot.workspaceId, projectId: project.id, writingMode: "LATEX", archivedAt: null, deletedAt: null } });
      if (!manuscript) throw AppError.notFound("Manuscript not found");
      const compilation = await db.manuscriptCompilation.findFirst({ where: { id: input.compilationId, snapshotId: snapshot.id, status: "SUCCESS" } });
      if (!compilation?.pdfData || !compilation.checksum || hash(compilation.pdfData) !== compilation.checksum) throw AppError.conflict("Compile and preview the PDF for this exact snapshot before sending.");
      const manifest = snapshot.manifest as unknown as ManuscriptManifest;
      title = manifest.title; manuscriptId = manuscript.id; snapshotDigest = snapshot.checksum;
      sourceText = manifest.files.filter(item => typeof item.text === "string").map(item => `% File: ${item.path}\n${item.text}`).join("\n\n");
      pdf = { buffer: Buffer.from(compilation.pdfData), size: compilation.pdfData.length, originalname: `${title.slice(0, 240)}.pdf` };
    } else {
      if (!file) throw AppError.badRequest("Attach a PDF manuscript");
      await validateMentorPdf(file.buffer);
      if (file.size !== file.buffer.length) throw AppError.badRequest("Invalid PDF size");
      pdf = { ...file, originalname: file.originalname.replaceAll("\\", "/").split("/").pop()!.slice(0, 255) };
      title ??= pdf.originalname.replace(/\.pdf$/i, "").trim().length >= 2 ? pdf.originalname.replace(/\.pdf$/i, "").slice(0, 300) : pdf.originalname;
      if (title.trim().length < 2) throw AppError.badRequest("Enter a manuscript title");
    }
    const checksum = hash(pdf.buffer), fingerprint = hash(JSON.stringify({ input, checksum }));
    const receiptKey = `mentor-send:${actor.id}:${input.clientKey}`;
    const stored = await pdfStorageService.savePdf(pdf.buffer, pdf.originalname);
    let retained = false;
    try {
      const staged = await db.$transaction(async tx => {
        await lockProjectAccounts(tx, [actor.id, mentor.id], project.id);
        await assertActiveProjectAccount(tx, actor.id);
        await assertActiveProjectAccount(tx, mentor.id);
        const liveProject = await access.project(project.id, actor.id, role, tx);
        if (liveProject.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
        if (manuscriptId && !await tx.draftWorkspace.findFirst({ where: { id: manuscriptId, projectId: project.id, archivedAt: null, deletedAt: null, writingMode: "LATEX" } })) throw AppError.notFound("Manuscript not found");
        await acceptedMentorReviewPolicy(tx, project.id, mentor.id);
        const previous = await tx.projectActivity.findUnique({ where: { projectId_idempotencyKey: { projectId: project.id, idempotencyKey: receiptKey } } });
        if (previous) {
          const saved = previous.metadata as unknown as { fingerprint: string; result: MentorManuscriptSendResult; resume?: string };
          if (saved.fingerprint !== fingerprint) throw AppError.conflict("This send request was already used for different content");
          return { result: { ...saved.result, reused: true }, resume: saved.resume, notification: null, retained: false };
        }
        let submission = await thread(tx, project.id, manuscriptId, input.submissionId);
        if (!submission && input.source === "PDF" && !input.submissionId) {
          const duplicate = await tx.$queryRaw<Array<{ id: string }>>`SELECT s.id FROM submissions s
            JOIN submission_revisions r ON r.submission_id=s.id
            JOIN review_requests q ON q.artifact_revision_id=r.id AND q.submission_id=s.id AND q.origin='MENTOR_GUIDANCE'
            JOIN reviewer_assignments a ON a.review_request_id=q.id AND a.reviewer_id=${mentor.id}::uuid
            WHERE s.project_id=${project.id}::uuid AND r.manuscript_snapshot_id IS NULL AND r.checksum_sha256=${checksum}
              AND q.status IN ('REQUESTED','ACCEPTED','IN_REVIEW','RESUBMITTED','REVISION_REQUESTED','COMPLETED')
            ORDER BY q.created_at DESC LIMIT 1`;
          if (duplicate[0]) submission = await tx.submission.findUnique({ where: { id: duplicate[0].id } });
        }
        if (input.submissionId && !submission) throw AppError.notFound("Submission not found in this project");
        if (submission && !await access.manage(submission, actor.id, role, tx)) throw AppError.forbidden("Only a manuscript author or project owner can send its next version");
        if (submission && ["accepted", "rejected", "withdrawn"].includes(submission.status)) throw AppError.conflict("This submission no longer accepts versions");
        if (submission?.sourceReportId || submission?.sourceManuscriptId && manuscriptId && submission.sourceManuscriptId !== manuscriptId) throw AppError.badRequest("Select a version of the original manuscript");
        const canonical = manuscriptId ? await tx.submission.findUnique({ where: { sourceManuscriptId: manuscriptId } }) : null;
        if (canonical && submission && canonical.id !== submission.id) throw AppError.conflict("This manuscript already has a different review history");
        const context = await contextFor(tx, submission);
        const request = context.requests.find(item => item.mentorId === mentor.id);
        const current = submission?.currentRevisionId ? await tx.submissionRevision.findUnique({ where: { id: submission.currentRevisionId } }) : null;
        const currentSnapshot = current?.manuscriptSnapshotId ? await tx.manuscriptSnapshot.findUnique({ where: { id: current.manuscriptSnapshotId }, select: { checksum: true } }) : null;
        const same = current && (input.manuscriptSnapshotId ? current.manuscriptSnapshotId === input.manuscriptSnapshotId || currentSnapshot?.checksum === snapshotDigest : current.checksumSha256 === checksum);
        let revision = same ? current : null;
        let resume: string | undefined;
        if (request && ["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(request.status) && !same) throw AppError.conflict("This mentor is still reviewing the previous version. Open that request before sending another version.");
        if (request?.status === "REVISION_REQUESTED") {
          const responses = new Map((input.responses ?? []).map(item => [item.revisionItemId, item.responseText.trim()]));
          if (same && current?.id === request.revisionId) throw AppError.badRequest("The revised manuscript must differ from the reviewed version");
          if (request.items.some(item => !responses.get(item.id)) || [...responses.keys()].some(id => !request.items.some(item => item.id === id))) throw AppError.badRequest("Respond to each requested change before sending the next version");
          resume = request.id;
        }
        if (!revision) {
          if (submission && input.expectedRevisionNumber !== submission.currentRevisionNumber) throw AppError.conflict("The manuscript history changed. Reload it before sending.");
          if (!submission) {
            submission = await tx.submission.create({ data: { projectId: project.id, sourceManuscriptId: manuscriptId, createdById: actor.id, title: title!.slice(0, 300), submissionType: manuscriptId ? (await tx.draftWorkspace.findUniqueOrThrow({ where: { id: manuscriptId } })).documentType : "RESEARCH_PAPER", currentRevisionNumber: 1 } });
            await tx.submissionAuthor.create({ data: { submissionId: submission.id, userId: actor.id, position: 0 } });
          }
          const number = current ? submission.currentRevisionNumber + 1 : 1;
          revision = await tx.submissionRevision.create({ data: { submissionId: submission.id, revisionNumber: number, sourceRevisionId: current?.id, uploadedById: actor.id, storageUri: stored.uri, checksumSha256: checksum, sizeBytes: pdf.size, originalFileName: pdf.originalname, manuscriptSnapshotId: input.manuscriptSnapshotId, contentType: input.source === "SNAPSHOT" ? "LATEX" : "PDF", contentSnapshot: sourceText, responseToReview: input.message } });
          submission = await tx.submission.update({ where: { id: submission.id }, data: { sourceManuscriptId: manuscriptId ?? submission.sourceManuscriptId, currentRevisionId: revision.id, currentRevisionNumber: number } });
        }
        if (!submission) throw AppError.conflict("Manuscript history is unavailable");
        let requestId = request?.id, assignmentId: string | undefined;
        let notification: Awaited<ReturnType<typeof createAssignedMentorReview>>["notification"] | null = null;
        if (request && same && ["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED", "COMPLETED"].includes(request.status)) {
          assignmentId = (await tx.reviewerAssignment.findFirstOrThrow({ where: { reviewRequestId: request.id, reviewerId: mentor.id } })).id;
        } else if (resume) assignmentId = (await tx.reviewerAssignment.findFirstOrThrow({ where: { reviewRequestId: resume, reviewerId: mentor.id } })).id;
        else { const created = await createAssignedMentorReview(tx, { submissionId: submission.id, revisionId: revision.id, reviewerId: mentor.id, senderId: actor.id, message: input.message }); requestId = created.request.id; assignmentId = created.assignment.id; notification = created.notification; }
        const result: MentorManuscriptSendResult = { submissionId: submission.id, revisionId: revision.id, revisionNumber: revision.revisionNumber, requestId: requestId!, assignmentId: assignmentId!, reused: Boolean(same && request && !notification && !resume) };
        await tx.projectActivity.create({ data: { projectId: project.id, actorId: actor.id, type: "MENTOR_MANUSCRIPT_PREPARED", entityKind: "SUBMISSION", entityId: submission.id, sourceModule: "submissions", artifactVersion: revision.revisionNumber, idempotencyKey: receiptKey, metadata: JSON.parse(JSON.stringify({ fingerprint, result, resume })) } });
        await researchLedgerService.record({ tx, projectId: project.id, actorId: actor.id, eventType: "MENTOR_MANUSCRIPT_PREPARED", resourceKind: "SUBMISSION_REVISION", resourceId: revision.id, checksumSha256: checksum, visibility: "PROJECT_TEAM", retentionClass: "RESEARCH_EVIDENCE", metadata: { source: input.source, snapshotId: input.manuscriptSnapshotId, compilationId: input.compilationId } });
        return { result, resume, notification, retained: !same };
      });
      retained = staged.retained;
      if (staged.resume) {
        const request = await db.reviewRequest.findUniqueOrThrow({ where: { id: staged.resume } });
        if (!(request.artifactRevisionId === staged.result.revisionId && ["RESUBMITTED", "IN_REVIEW", "COMPLETED"].includes(request.status))) await reviewRequestService.resubmit(staged.resume, actor.id, { revisionId: staged.result.revisionId, responses: input.responses ?? [] });
      }
      if (staged.notification) await dispatchReviewNotifications([staged.notification]);
      return staged.result;
    } finally {
      if (!retained) {
        // A lost commit acknowledgement must never delete an already-linked PDF.
        // During a DB outage, retain the private file rather than guessing rollback.
        try { if (!await db.submissionRevision.findFirst({ where: { storageUri: stored.uri }, select: { id: true } })) await pdfStorageService.deletePdf(stored.uri); }
        catch { logger.warn("Deferred unused mentor PDF cleanup; no retained revision was deleted"); }
      }
    }
  },
};
