import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ user: { findFirst: vi.fn() }, project: { findFirst: vi.fn(), findMany: vi.fn() }, projectMember: { findFirst: vi.fn(), findMany: vi.fn() }, submission: { findMany: vi.fn(), findFirst: vi.fn() }, submissionAuthor: { findMany: vi.fn() } }));
const savePdf = vi.hoisted(() => vi.fn());
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => db }));
vi.mock("../../../infrastructure/pdf-storage.service.js", () => ({ pdfStorageService: { savePdf } }));
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: {} }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: {} }));
vi.mock("../../reviews/peer-review-access.js", () => ({ assertPeerReviewer: vi.fn(), lockReviewerAndSubmission: vi.fn(), refreshSubmissionReviewStatus: vi.fn() }));
vi.mock("../../reviews/review-request.service.js", () => ({ reviewRequestService: {} }));
vi.mock("../../papers/ai-reviewer.client.js", () => ({ aiReviewerClient: {} }));
import { submissionService } from "../submission.service.js";

const actor = "10000000-0000-4000-8000-000000000001";
const project = "20000000-0000-4000-8000-000000000001";
const legacy = "6ab33f1537802fe30d38753b";
beforeEach(() => {
  vi.clearAllMocks();
  db.user.findFirst.mockResolvedValue({ id: actor, isActive: true });
  db.project.findFirst.mockResolvedValue({ id: project, legacyMongoId: legacy, ownerId: actor, status: "ACTIVE" });
  db.projectMember.findFirst.mockResolvedValue(null);
  db.projectMember.findMany.mockResolvedValue([]);
  db.project.findMany.mockResolvedValue([{ id: project }]);
  db.submission.findMany.mockResolvedValue([]);
  db.submissionAuthor.findMany.mockResolvedValue([]);
});
it("resolves legacy project IDs before querying submissions and includes the entire project", async () => {
  await submissionService.listMine(actor, "student", legacy);
  expect(db.project.findFirst).toHaveBeenCalledWith({ where: { legacyMongoId: legacy } });
  expect(db.submission.findMany).toHaveBeenCalledWith({ where: { projectId: project }, orderBy: { updatedAt: "desc" }, take: 100 });
  expect(db.submissionAuthor.findMany).not.toHaveBeenCalled();
});
it("allows active project members to list their group's submissions", async () => {
  db.project.findFirst.mockResolvedValue({ id: project, ownerId: "other" });
  db.projectMember.findFirst.mockResolvedValue({ status: "ACTIVE" });
  await submissionService.listMine(actor, "student", project);
  expect(db.projectMember.findFirst).toHaveBeenCalledWith({ where: { projectId: project, userId: actor, status: "ACTIVE" } });
  expect(db.submission.findMany).toHaveBeenCalledOnce();
});
it("denies outsiders before reading submissions even for a public project", async () => {
  db.project.findFirst.mockResolvedValue({ id: project, ownerId: "other", visibility: "PUBLIC" });
  await expect(submissionService.listMine(actor, "student", project)).rejects.toThrow("Project membership is required");
  expect(db.submission.findMany).not.toHaveBeenCalled();
});
it("retains author filtering for the personal submissions endpoint", async () => {
  await submissionService.listMine(actor, "student");
  expect(db.project.findFirst).not.toHaveBeenCalled();
  expect(db.submission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: { in: [project] }, OR: [{ createdById: actor }, { id: { in: [] } }] } }));
});
it("rejects a detail belonging to another project before hydrating authors or revisions", async () => {
  db.submission.findFirst.mockResolvedValue({ id: actor, projectId: "another-project" });
  await expect(submissionService.get(actor, actor, "student", legacy)).rejects.toThrow("Submission not found in this project");
});
it("rejects creating submissions in archived projects before saving a file", async () => {
  db.project.findFirst.mockResolvedValue({ id: project, ownerId: actor, status: "ARCHIVED" });
  await expect(submissionService.create({ projectId: legacy, title: "Test paper" }, { buffer: Buffer.from("PDF"), originalname: "test.pdf", size: 3 }, actor, "student")).rejects.toThrow("Archived projects are read-only");
  expect(savePdf).not.toHaveBeenCalled();
});
