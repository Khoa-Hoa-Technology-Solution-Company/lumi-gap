import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  project: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  projectMember: { findFirst: vi.fn() },
  mentorRelationship: { findFirst: vi.fn(), findMany: vi.fn() },
  submission: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  submissionRevision: { findUniqueOrThrow: vi.fn(), findFirstOrThrow: vi.fn() },
  reviewerAssignment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  humanReview: { create: vi.fn() },
  reviewResponse: { create: vi.fn() },
  projectTask: { updateMany: vi.fn(), create: vi.fn() },
  notification: { create: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => db }));
vi.mock("../../../infrastructure/pdf-storage.service.js", () => ({ pdfStorageService: {} }));
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: {} }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: vi.fn() } }));
vi.mock("../projects/project-transaction.js", () => ({ lockProjectAccounts: vi.fn() }));

import { submissionService } from "../submission.service.js";

const mentorId = "30000000-0000-4000-8000-000000000001";
const studentId = "10000000-0000-4000-8000-000000000001";
const projectId = "20000000-0000-4000-8000-000000000001";
const submissionId = "40000000-0000-4000-8000-000000000001";
const revisionId = "50000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findFirst.mockImplementation(async (args?: any) => {
    const id = args?.where?.id ?? mentorId;
    return { id, isActive: true, role: "lecturer" };
  });
  db.project.findFirst.mockResolvedValue({
    id: projectId,
    ownerId: studentId,
    status: "ACTIVE",
  });
  db.projectMember.findFirst.mockResolvedValue({
    id: "mem-1",
    projectId,
    userId: studentId,
    status: "ACTIVE",
  });
  db.submission.findFirst.mockResolvedValue({
    id: submissionId,
    projectId,
    createdById: studentId,
    title: "Research Manuscript",
    status: "WAITING_FEEDBACK",
    currentRevisionNumber: 1,
    currentRevisionId: revisionId,
  });
  db.reviewerAssignment.findFirst.mockResolvedValue({
    id: "assignment-1",
    submissionId,
    reviewerId: mentorId,
    status: "assigned",
  });
  db.mentorRelationship.findFirst.mockResolvedValue({
    id: "rel-1",
    projectId,
    mentorUserId: mentorId,
    status: "ACTIVE",
    mentorRole: "PRIMARY",
  });
  db.$transaction.mockImplementation(async (callback: any) => {
    return callback({
      ...db,
      project: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: projectId, status: "ACTIVE" }) },
      submission: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: submissionId,
          projectId,
          createdById: studentId,
          title: "Research Manuscript",
          status: "WAITING_FEEDBACK",
          currentRevisionNumber: 1,
          currentRevisionId: revisionId,
        }),
        update: vi.fn().mockResolvedValue({
          id: submissionId,
          projectId,
          createdById: studentId,
          title: "Research Manuscript",
          status: "FEEDBACK_RECEIVED",
          currentRevisionNumber: 1,
        }),
      },
      submissionRevision: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: revisionId, revisionNumber: 1 }),
      },
      reviewerAssignment: {
        findFirst: vi.fn().mockResolvedValue({ id: "assignment-1", submissionId, reviewerId: mentorId }),
        update: vi.fn().mockResolvedValue({ id: "assignment-1" }),
      },
      humanReview: {
        create: vi.fn().mockResolvedValue({ id: "review-1", overallComment: "Good work" }),
      },
      reviewResponse: {
        create: vi.fn().mockResolvedValue({ id: "resp-1" }),
      },
      projectTask: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: "task-1" }),
      },
      notification: {
        create: vi.fn().mockResolvedValue({ id: "notif-1" }),
      },
      $queryRaw: vi.fn(),
    });
  });
});

it("submits mentor feedback and completes mentor task", async () => {
  const result = await submissionService.submitFeedback(
    submissionId,
    {
      result: "FEEDBACK_GIVEN",
      overallComment: "Great progress, keep going.",
      paragraphComments: [{ criterionKey: "para-1", comment: "Clear explanation", evidence: "Paragraph 1" }],
    },
    mentorId,
    "lecturer"
  );

  expect(result.success).toBe(true);
  expect(db.$transaction).toHaveBeenCalledOnce();
});

it("lists active mentors for a project", async () => {
  db.mentorRelationship.findMany.mockResolvedValue([
    { projectId, mentorUserId: mentorId, status: "ACTIVE", mentorRole: "PRIMARY" },
  ]);
  db.user.findMany.mockResolvedValue([
    { id: mentorId, fullName: "Dr. Mentor", email: "mentor@test.com", institution: "FPTU", avatarUrl: null },
  ]);

  const mentors = await submissionService.listActiveMentors(projectId, studentId);
  expect(mentors).toHaveLength(1);
  expect(mentors[0].fullName).toBe("Dr. Mentor");
  expect(mentors[0].mentorRole).toBe("PRIMARY");
});
