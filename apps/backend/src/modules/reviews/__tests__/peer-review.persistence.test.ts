import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { reviewRequestService } from "../review-request.service.js";
import { reviewService } from "../review.service.js";
import { submissionService } from "../../submissions/submission.service.js";
import { reviewTemplateService } from "../review-template.service.js";
import { assertPeerReviewer } from "../peer-review-access.js";
import { participantScopeForUser } from "../../identity/participant-scope.service.js";
import type { AcademicReviewInput } from "@trend/shared-types";
import { mkdtemp, readFile, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPdfStorageService, pdfStorageService } from "../../../infrastructure/pdf-storage.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));

describe.sequential("peer-review versions and authorization (PostgreSQL)", () => {
  const marker = crypto.randomUUID();
  let author = "", lecturer = "", researcher = "", student = "", outsider = "", template = "", version = "", lowLevel = "", highLevel = "", otherLevel = "", institutionId = "";
  const projectIds: string[] = [], submissionIds: string[] = [], userIds: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    for (const [name, academicRole] of [["Author", "STUDENT"], ["Lecturer", "LECTURER"], ["Researcher", "RESEARCHER"], ["Student", "STUDENT"], ["Outsider", "RESEARCHER"]]) {
      const user = await prisma.user.create({ data: { email: `${name.toLowerCase()}-${marker}@example.test`, fullName: name, accountStatus: "ACTIVE" } });
      userIds.push(user.id);
      await prisma.academicProfile.create({ data: { userId: user.id, academicRole, roleVerificationStatus: "VERIFIED", reviewAvailability: { enabled: true, maximumActiveReviews: 10 } } });
    }
    [author, lecturer, researcher, student, outsider] = userIds;
    await prisma.user.updateMany({ where: { id: { in: [researcher, outsider] } }, data: { admissionBasis: "INVITATION", emailVerifiedAt: new Date() } });
    const institution = await prisma.institution.create({ data: { name: "Test Host", slug: `test-host-${marker}`, hostInstitution: true } }); institutionId = institution.id;
    await prisma.affiliation.create({ data: { userId: lecturer, institutionId, institutionName: institution.name, isCurrent: true, verificationStatus: "VERIFIED" } });
    expect(await participantScopeForUser(lecturer)).toBe("INTERNAL");
    expect(await participantScopeForUser(researcher)).toBe("EXTERNAL");
    const created = await reviewTemplateService.create({ name: `Review test ${marker}`, source: "PERSONAL", reviewMode: "RUBRIC_ASSESSMENT", guidelines: [], publish: true, criteria: [
      { key: "method", title: "Method", weight: 2, required: true, levels: [{ label: "Low", score: 2 }, { label: "High", score: 4 }] },
      { key: "evidence", title: "Evidence", weight: 1, required: true, levels: [{ label: "Low", score: 1 }, { label: "High", score: 3 }] },
    ] }, author, "USER");
    template = created.id; version = created.activeVersion!.id;
    lowLevel = created.activeVersion!.criteria[0].levels[0].id;
    highLevel = created.activeVersion!.criteria[0].levels[1].id;
    otherLevel = created.activeVersion!.criteria[1].levels[1].id;
  });

  async function article(openForReview = false) {
    const prisma = getPrisma();
    const project = await prisma.project.create({ data: { ownerId: author, title: `Review project ${marker}`, visibility: "PRIVATE" } }); projectIds.push(project.id);
    const submission = await prisma.submission.create({ data: { projectId: project.id, createdById: author, title: `Research ${marker}`, submissionType: "RESEARCH_PAPER", status: "ready_for_review", openForReview } }); submissionIds.push(submission.id);
    await prisma.submissionAuthor.create({ data: { submissionId: submission.id, userId: author, position: 0 } });
    const revision = await prisma.submissionRevision.create({ data: { submissionId: submission.id, revisionNumber: 1, uploadedById: author, contentSnapshot: "# Original methods", contentType: "MARKDOWN", sizeBytes: 18 } });
    await prisma.submission.update({ where: { id: submission.id }, data: { currentRevisionId: revision.id } });
    return { submission, revision };
  }
  const input = (assessment: AcademicReviewInput["overallAssessment"] = "STRONG", level = highLevel): AcademicReviewInput => ({ overallAssessment: assessment, responses: [{ criterionKey: "method", performanceLevelId: level, comment: "Method evidence" }, { criterionKey: "evidence", performanceLevelId: otherLevel, comment: "Cited evidence" }], requiredRevisions: assessment === "MAJOR_REVISION" ? [{ priority: "MAJOR", description: "Explain the sampling method" }] : [] });
  async function invite(submissionId: string, reviewerId = researcher) { return reviewRequestService.create({ submissionId, reviewerId, templateVersionId: version }, author); }

  it("blocks Students despite stale review capabilities on every reviewer entry", async () => {
    const prisma = getPrisma();
    await prisma.userCapability.create({ data: { userId: student, capability: "STRUCTURED_REVIEW", source: "TEST", status: "ACTIVE" } });
    await expect(assertPeerReviewer(student)).rejects.toMatchObject({ statusCode: 403 });
    const { submission, revision } = await article();
    await expect(invite(submission.id, student)).rejects.toMatchObject({ statusCode: 403 });
    await expect(submissionService.assignReviewer(submission.id, { reviewerId: student }, author)).rejects.toMatchObject({ statusCode: 403 });
    const assignment = await prisma.reviewerAssignment.create({ data: { submissionId: submission.id, artifactRevisionId: revision.id, reviewerId: student, assignedById: author, anonymousCode: `STUDENT-${marker}`, status: "accepted" } });
    await expect(reviewService.getReview(assignment.id, student)).rejects.toMatchObject({ statusCode: 403 });
    await expect(reviewService.saveReview(assignment.id, student, input(), true)).rejects.toMatchObject({ statusCode: 403 });
    await expect(reviewService.acceptOpportunity(submission.id, student)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("keeps drafts private and pins scores to the reviewed version through resubmission", async () => {
    const { submission, revision } = await article(); const request = await invite(submission.id);
    await reviewRequestService.accept(request.id, researcher);
    await reviewService.saveReview(request.assignment.id, researcher, input("MAJOR_REVISION", lowLevel), false);
    expect((await reviewRequestService.detail(request.id, author)).reviews).toHaveLength(0);
    expect((await reviewRequestService.listCenter(author)).sent.find((item) => item.id === request.id)?.latestReview).toBeUndefined();
    expect((await submissionService.history(submission.id, author, "user")).versions[0].reviews).toHaveLength(0);
    await expect(reviewService.saveReview(request.assignment.id, researcher, { ...input(), overallAssessment: "MINOR_REVISION", requiredRevisions: [] }, true)).rejects.toMatchObject({ statusCode: 400 });
    await expect(reviewService.saveReview(request.assignment.id, researcher, { ...input(), responses: [{ criterionKey: "method", performanceLevelId: otherLevel }, input().responses[1]] }, true)).rejects.toMatchObject({ statusCode: 400 });
    const submitted = await reviewService.saveReview(request.assignment.id, researcher, input("MAJOR_REVISION", lowLevel), true);
    expect(submitted.review.revisionId).toBe(revision.id); expect(submitted.review.weightedScore).toBeCloseTo(7 / 3);
    await expect(reviewService.saveReview(request.assignment.id, researcher, input(), false)).rejects.toMatchObject({ statusCode: 409 });
    const revised = await submissionService.createVersion(submission.id, { content: "# Revised methods", summary: "Sampling explained", expectedRevisionNumber: 1 }, author, "user");
    const history = await submissionService.history(submission.id, author, "user");
    expect(history.versions[0].reviews).toHaveLength(0); expect(history.versions[1].reviews[0].weightedScore).toBeCloseTo(7 / 3);
    await expect(reviewRequestService.resubmit(request.id, author, { revisionId: revision.id, responses: [] })).rejects.toMatchObject({ statusCode: 400 });
    const resubmits = await Promise.allSettled([1, 2].map(() => reviewRequestService.resubmit(request.id, author, { revisionId: revised.id, responses: [{ revisionItemId: submitted.requiredRevisions[0].id, responseText: "Sampling described in section 2" }] })));
    expect(resubmits.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const workspace = await reviewService.getReview(request.assignment.id, researcher);
    expect(workspace.review).toBeUndefined(); expect(workspace.roundNumber).toBe(2); expect(workspace.artifactRevision?.id).toBe(revised.id);
    await expect(reviewService.saveReview(request.assignment.id, researcher, { ...input(), expectedRevisionId: revision.id, expectedRoundNumber: 1 }, false)).rejects.toMatchObject({ statusCode: 409 });
    await reviewService.saveReview(request.assignment.id, researcher, input(), false);
    await expect(reviewService.saveReview(request.assignment.id, researcher, input(), true)).rejects.toMatchObject({ statusCode: 409 });
    await reviewRequestService.resolveRevisionItem(request.id, submitted.requiredRevisions[0].id, "ACCEPTED", researcher);
    await reviewService.saveReview(request.assignment.id, researcher, input(), true);
    const final = await submissionService.history(submission.id, author, "user");
    expect(final.versions[0].reviews[0].weightedScore).toBeCloseTo(11 / 3); expect(final.versions[1].reviews[0].weightedScore).toBeCloseTo(7 / 3);
    expect(final.contributions).toHaveLength(1); expect(final.contributions[0].rounds).toHaveLength(2);
    expect(await getPrisma().researchContribution.count({ where: { submissionId: submission.id, contributorId: researcher } })).toBe(1);
    expect((await getPrisma().researchContribution.findFirstOrThrow({ where: { submissionId: submission.id } })).visibility).toBe("PRIVATE");
    expect((await reviewService.listContributions(researcher, outsider)).some((item) => item.submissionId?.id === submission.id)).toBe(false);
    const restored = await submissionService.createVersion(submission.id, { sourceRevisionId: revision.id, summary: "Restore original", expectedRevisionNumber: 2 }, author, "user");
    expect(restored.revisionNumber).toBe(3); expect(restored.contentSnapshot).toBe("# Original methods");
    expect((await submissionService.history(submission.id, author, "user")).versions[0].reviews).toHaveLength(0);
    await expect(submissionService.createVersion(submission.id, { content: "Stale version", summary: "Stale save", expectedRevisionNumber: 2 }, author, "user")).rejects.toMatchObject({ statusCode: 409 });
    await expect(submissionService.history(submission.id, outsider, "user")).rejects.toMatchObject({ statusCode: 403 });
    await getPrisma().academicProfile.update({ where: { userId: researcher }, data: { academicRole: "STUDENT" } });
    await expect(reviewService.saveReview(request.assignment.id, researcher, input(), true)).rejects.toMatchObject({ statusCode: 403 });
    expect((await reviewRequestService.detail(request.id, researcher)).reviews).toHaveLength(2);
    expect((await submissionService.history(submission.id, author, "user")).contributions[0].rounds).toHaveLength(2);
    await getPrisma().academicProfile.update({ where: { userId: researcher }, data: { academicRole: "RESEARCHER" } });
    const nextRequest = await invite(submission.id); await reviewRequestService.accept(nextRequest.id, researcher);
    await reviewService.saveReview(nextRequest.assignment.id, researcher, input(), true);
    expect(await getPrisma().researchContribution.count({ where: { submissionId: submission.id, contributorId: researcher } })).toBe(1);
    expect((await submissionService.history(submission.id, author, "user")).contributions[0].rounds).toHaveLength(3);
  });

  it("uses aggregate status and serializes accept/submit races", async () => {
    const { submission } = await article(); const one = await invite(submission.id, lecturer), two = await invite(submission.id, researcher);
    const accepts = await Promise.allSettled([reviewRequestService.accept(one.id, lecturer), reviewRequestService.accept(one.id, lecturer)]);
    expect(accepts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    await reviewRequestService.accept(two.id, researcher);
    const submits = await Promise.allSettled([reviewService.saveReview(one.assignment.id, lecturer, input(), true), reviewService.saveReview(one.assignment.id, lecturer, input(), true)]);
    expect(submits.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect((await getPrisma().submission.findUniqueOrThrow({ where: { id: submission.id } })).status).toBe("under_review");
    await reviewService.saveReview(two.assignment.id, researcher, input("MAJOR_REVISION"), true);
    expect((await getPrisma().submission.findUniqueOrThrow({ where: { id: submission.id } })).status).toBe("revision_requested");
  });

  it("hides private opportunities until author opt-in and unifies open acceptance", async () => {
    const { submission, revision } = await article();
    expect((await reviewService.listOpportunities(outsider, {})).opportunities.some((item) => item.id === submission.id)).toBe(false);
    await expect(reviewService.acceptOpportunity(submission.id, outsider)).rejects.toMatchObject({ statusCode: 409 });
    await submissionService.setOpenForReview(submission.id, true, author, "user");
    expect((await reviewService.listOpportunities(outsider, {})).opportunities.some((item) => item.id === submission.id)).toBe(true);
    const assignment = await reviewService.acceptOpportunity(submission.id, outsider);
    expect(assignment.artifactRevisionId).toBe(revision.id); expect(assignment.reviewRequestId).toBeTruthy();
    const center = await reviewRequestService.listCenter(outsider);
    expect(center.incoming.find((item) => item.id === assignment.reviewRequestId)?.status).toBe("ACCEPTED");
    const newer = await submissionService.createVersion(submission.id, { content: "Private unpublished changes", summary: "New version", expectedRevisionNumber: 1 }, author, "user");
    expect((await reviewService.getReview(assignment.id, outsider)).artifactRevision?.id).toBe(revision.id);
    expect((await submissionService.listRevisions(submission.id, outsider, "user")).some((item) => item.id === newer.id)).toBe(false);
    await expect(submissionService.resolveDownload(submission.id, newer.id, outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
    // An accepted review cannot be cancelled before it is overdue; once overdue the author may cancel.
    await expect(reviewRequestService.cancel(assignment.reviewRequestId!, author)).rejects.toMatchObject({ statusCode: 409 });
    await getPrisma().reviewRequest.update({ where: { id: assignment.reviewRequestId! }, data: { dueAt: new Date(Date.now() - 60_000) } });
    await reviewRequestService.cancel(assignment.reviewRequestId!, author);
    await expect(reviewService.getReview(assignment.id, outsider)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("verifies external invitations and rejects students or a token claimed twice", async () => {
    const { submission } = await article(); const prisma = getPrisma();
    const invitedUser = await prisma.user.findUniqueOrThrow({ where: { id: outsider } });
    const invitation = await reviewRequestService.createExternalInvitation({ submissionId: submission.id, templateVersionId: version, reviewerEmail: invitedUser.email }, author);
    const results = await Promise.allSettled([reviewRequestService.acceptExternalInvitation(invitation.token, outsider), reviewRequestService.acceptExternalInvitation(invitation.token, outsider)]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const request = await prisma.reviewRequest.findFirstOrThrow({ where: { submissionId: submission.id } }); expect(request.origin).toBe("EXTERNAL_INVITATION");
    await prisma.user.update({ where: { id: student }, data: { emailVerifiedAt: new Date() } });
    const studentUser = await prisma.user.findUniqueOrThrow({ where: { id: student } });
    const forbidden = await reviewRequestService.createExternalInvitation({ submissionId: submission.id, templateVersionId: version, reviewerEmail: studentUser.email }, author);
    await expect(reviewRequestService.acceptExternalInvitation(forbidden.token, student)).rejects.toMatchObject({ statusCode: 403 });
    await expect(reviewRequestService.cancel(request.id, author)).rejects.toMatchObject({ statusCode: 409 });
    await prisma.reviewRequest.update({ where: { id: request.id }, data: { dueAt: new Date(Date.now() - 60_000) } });
    await reviewRequestService.cancel(request.id, author);
  });

  it("enforces declared conflicts and serializes workloads across separate articles", async () => {
    const prisma = getPrisma(); const one = await article(), two = await article();
    await prisma.submissionDeclaredConflict.create({ data: { submissionId: one.submission.id, userId: outsider } });
    await expect(invite(one.submission.id, outsider)).rejects.toMatchObject({ statusCode: 409 });
    await prisma.submissionDeclaredConflict.deleteMany({ where: { submissionId: one.submission.id } });
    await prisma.academicProfile.update({ where: { userId: outsider }, data: { reviewAvailability: { enabled: true, maximumActiveReviews: 1 } } });
    const attempts = await Promise.allSettled([invite(one.submission.id, outsider), invite(two.submission.id, outsider)]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.reviewerAssignment.count({ where: { reviewerId: outsider, status: { in: ["assigned", "accepted"] } } })).toBe(1);
  });

  it("downloads assigned older PDFs and restores their content without moving the reviewer pin", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "lumigap-peer-review-"));
    const local = createPdfStorageService({ provider: "local", uploadsDir: directory });
    const methods = ["savePdf", "deletePdf", "getSignedDownloadUrl", "resolveLocalPath"] as const;
    const spies = methods.map((method) => vi.spyOn(pdfStorageService, method).mockImplementation(local[method] as never));
    const uris = new Set<string>();
    try {
      const { submission } = await article();
      const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
      const v2 = await submissionService.addRevision(submission.id, "PDF manuscript", { buffer: pdf, size: pdf.length, originalname: "manuscript.pdf" }, author, "user");
      uris.add((await getPrisma().submissionRevision.findUniqueOrThrow({ where: { id: v2.revision.id } })).storageUri!);
      const request = await invite(submission.id, lecturer); await reviewRequestService.accept(request.id, lecturer);
      const nextPdf = Buffer.concat([pdf, Buffer.from("% revised content\n")]);
      const v3 = await submissionService.addRevision(submission.id, "Further changes", { buffer: nextPdf, size: nextPdf.length, originalname: "revised.pdf" }, author, "user");
      uris.add((await getPrisma().submissionRevision.findUniqueOrThrow({ where: { id: v3.revision.id } })).storageUri!);
      const download = await submissionService.resolveDownload(submission.id, v2.revision.id, lecturer, "user");
      expect(download.kind).toBe("local"); if (download.kind === "local") expect(await readFile(download.path)).toEqual(pdf);
      await expect(submissionService.resolveDownload(submission.id, v3.revision.id, lecturer, "user")).rejects.toMatchObject({ statusCode: 404 });
      const restored = await submissionService.createVersion(submission.id, { sourceRevisionId: v2.revision.id, summary: "Restore PDF version 2", expectedRevisionNumber: 3 }, author, "user");
      expect(restored.revisionNumber).toBe(4); expect(restored.contentType).toBe("PDF");
      const restoredDownload = await submissionService.resolveDownload(submission.id, restored.id, author, "user");
      if (restoredDownload.kind === "local") expect(await readFile(restoredDownload.path)).toEqual(pdf);
      expect((await reviewService.getReview(request.assignment.id, lecturer)).artifactRevision?.id).toBe(v2.revision.id);
    } finally {
      for (const uri of uris) await local.deletePdf(uri);
      spies.forEach((spy) => spy.mockRestore());
      await rmdir(directory);
    }
  });

  afterAll(async () => {
    const prisma = getPrisma();
    const revisions = await prisma.submissionRevision.findMany({ where: { submissionId: { in: submissionIds } }, select: { id: true } });
    await prisma.reviewRevisionResponse.deleteMany({ where: { submissionRevisionId: { in: revisions.map((item) => item.id) } } });
    await prisma.researchContribution.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await prisma.humanReview.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await prisma.reviewerAssignment.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await prisma.reviewRequest.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await prisma.externalReviewInvitation.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await prisma.submission.updateMany({ where: { id: { in: submissionIds } }, data: { currentRevisionId: null } });
    await prisma.submissionRevision.updateMany({ where: { submissionId: { in: submissionIds } }, data: { sourceRevisionId: null } });
    await prisma.submission.deleteMany({ where: { id: { in: submissionIds } } });
    await prisma.reviewTemplate.deleteMany({ where: { id: template || "00000000-0000-4000-8000-000000000000" } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (institutionId) await prisma.institution.delete({ where: { id: institutionId } });
    await disconnectPostgres();
  });
});
