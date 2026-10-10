import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import fs from "node:fs/promises";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { authService } from "../../auth/auth.service.js";
import { authMailService } from "../../auth/auth-mail.service.js";
import { academicProfileService } from "../academic-profile.service.js";
import { studentAffiliationService } from "../student-affiliation.service.js";
import { affiliationService } from "../../verification/affiliation.service.js";
import { verificationEvidenceStorage } from "../verification-evidence-storage.service.js";
import { cleanupVerificationEvidence } from "../verification-evidence-retention.service.js";
import { assertResearchWorkflowAccess } from "../../authorization/research-access.service.js";
import { projectService } from "../../projects/project.service.js";
import { VerificationRequestSchema, VerificationDecisionSchema } from "../dto/academic-profile.schema.js";
import { createApp } from "../../../app.js";

const enabled = process.env.STUDENT_AFFILIATION_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Affiliation integration tests require an isolated _test database");

describe.skipIf(!enabled).sequential("student affiliation with real PostgreSQL and private evidence", () => {
  const db = getPrisma();
  const marker = randomUUID();
  const email = `student-${marker}@gmail.com`;
  const password = "StudentTestPassword123";
  const bytes = Buffer.from("%PDF-1.4\nstudent affiliation test\n%%EOF");
  const file = { buffer: bytes, size: bytes.length, mimetype: "application/pdf", originalname: "student-card.pdf" };
  let id: string, institutionId: string, adminId: string, admin2Id: string, requestId: string, studentToken: string, adminToken: string;
  let server: Server;
  let base: string;
  const ids: string[] = [];
  const mail = vi.spyOn(authMailService, "sendEmailVerification").mockResolvedValue(true);
  vi.spyOn(authMailService, "sendAffiliationStatus").mockResolvedValue(true);
  const input = () => ({ type: "AFFILIATION" as const, evidenceType: "DOCUMENT" as const, institutionId, studentId: "SE123456", proofType: "STUDENT_CARD" as const, additionalNote: "Current enrollment" });
  async function verify(userEmail: string) {
    const sent = mail.mock.calls.findLast((call) => call[0] === userEmail);
    expect(sent).toBeDefined();
    await authService.verifyEmail(sent![1]);
  }
  async function http(path: string, token?: string, init: RequestInit = {}) {
    return fetch(`${base}/api/v1${path}`, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  }
  beforeAll(async () => {
    institutionId = (await db.institution.findUniqueOrThrow({ where: { slug: "fpt-university" } })).id;
    for (const prefix of ["admin", "admin2"]) {
      const created = await authService.register({ email: `${prefix}-${marker}@gmail.com`, password, fullName: prefix });
      ids.push(created.user.id);
      await db.user.update({ where: { id: created.user.id }, data: { systemRole: "ADMIN", role: "admin" } });
    }
    [adminId, admin2Id] = ids;
    adminToken = (await authService.login({ email: `admin-${marker}@gmail.com`, password })).tokens.accessToken;
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.on("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 30_000);
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await cleanupVerificationEvidence();
    vi.restoreAllMocks();
  });

  it("registers personal email, sends ownership verification and grants basic access only", async () => {
    const created = await authService.register({ email, password, fullName: "Personal Email Student" });
    id = created.user.id; ids.push(id); studentToken = created.tokens.accessToken;
    expect(created.user.admissionBasis).toBe("PERSONAL_EMAIL");
    expect(created.user.emailVerifiedAt).toBeUndefined();
    expect(mail).toHaveBeenCalledWith(email, expect.any(String));
    expect(created.user.capabilities).toEqual([]);
    expect(created.user.participantScope).toBe("PENDING");
    await expect(authService.updateAcademicProfile(id, { academicRole: "STUDENT", programName: "Software Engineering", institutionName: "FPT University", researchAreas: ["Software Engineering"] })).rejects.toMatchObject({ statusCode: 403 });
  }, 15_000);

  it("requires verified email before submitting and never verifies affiliation from personal email", async () => {
    await expect(studentAffiliationService.submit(id, input(), file)).rejects.toMatchObject({ statusCode: 403 });
    await verify(email);
    await authService.updateAcademicProfile(id, { academicRole: "STUDENT", programName: "Software Engineering", institutionName: "FPT University", researchAreas: ["Software Engineering"] });
    const login = await authService.login({ email, password }); studentToken = login.tokens.accessToken;
    expect(login.user.emailVerifiedAt).toBeDefined();
    expect(login.user.participantScope).toBe("PENDING");
    expect((await academicProfileService.getMine(id)).verificationStatuses.affiliation).not.toBe("VERIFIED");
  }, 15_000);

  it("requires institution, Student ID, proof type and file; rejects spoofed/oversized files", async () => {
    for (const field of ["institutionId", "proofType"] as const) expect(VerificationRequestSchema.safeParse({ ...input(), [field]: undefined }).success).toBe(false);
    await expect(studentAffiliationService.submit(id, input())).rejects.toMatchObject({ statusCode: 400 });
    await expect(studentAffiliationService.submit(id, input(), { ...file, buffer: Buffer.from("fake"), size: 4 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(studentAffiliationService.submit(id, input(), { ...file, size: 11 * 1024 * 1024 })).rejects.toMatchObject({ statusCode: 400 });
    expect(VerificationRequestSchema.safeParse({ ...input(), verificationStatus: "VERIFIED" }).success).toBe(false);
  });

  it("submits through the authenticated upload API and prevents duplicate active requests", async () => {
    const form = new FormData();
    Object.entries(input()).forEach(([key, value]) => form.append(key, value));
    form.append("evidence", new Blob([bytes], { type: "application/pdf" }), "student-card.pdf");
    const response = await http("/academic-profiles/me/verification-request", studentToken, { method: "POST", body: form });
    expect(response.status).toBe(202);
    requestId = (await db.verificationEvidence.findFirstOrThrow({ where: { userId: id, status: "PENDING" } })).id;
    await expect(studentAffiliationService.submit(id, input(), file)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.verificationEvidence.count({ where: { userId: id, status: "PENDING" } })).toBe(1);
  });

  it("protects evidence with admin authentication and excludes all request data from public profile", async () => {
    expect((await http(`/admin/academic-verifications/${requestId}/evidence`)).status).toBe(401);
    expect((await http(`/admin/academic-verifications/${requestId}/evidence`, studentToken)).status).toBe(403);
    await expect(academicProfileService.verificationEvidenceFileLocation(requestId, id)).rejects.toMatchObject({ statusCode: 403 });
    const download = await http(`/admin/academic-verifications/${requestId}/evidence`, adminToken);
    expect(download.status).toBe(200);
    expect(download.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
    const published = JSON.stringify(await academicProfileService.getPublic(id));
    expect(published).not.toContain("evidenceStorageKey");
    expect(published).not.toContain("verificationRequests");
    expect(published).not.toContain("SE123456");
    expect(published).not.toContain("student-card");
    const duplicateFiles = new FormData();
    Object.entries(input()).forEach(([key, value]) => duplicateFiles.append(key, value));
    duplicateFiles.append("evidence", new Blob([bytes], { type: "application/pdf" }), "one.pdf");
    duplicateFiles.append("evidence", new Blob([bytes], { type: "application/pdf" }), "two.pdf");
    expect((await http("/academic-profiles/me/verification-request", studentToken, { method: "POST", body: duplicateFiles })).status).toBe(400);
  });

  it("allows email-verified core research while FPT evidence is pending", async () => {
    await assertResearchWorkflowAccess(id);
    for (const path of ["/projects", "/reports", "/gaps"]) expect((await http(path, studentToken)).status).toBe(200);
    expect((await http("/academic-profiles/me", studentToken)).status).toBe(200);
    expect((await http("/forum/posts", studentToken)).status).toBe(200);
  });

  it("rejects nonadmin/self review and requires a reason for rejection or more information", async () => {
    await expect(academicProfileService.decideVerification(requestId, { decision: "approve" }, id)).rejects.toMatchObject({ statusCode: 409 });
    const other = await db.user.create({ data: { email: `other-${marker}@gmail.com`, fullName: "Other" } }); ids.push(other.id);
    await expect(academicProfileService.decideVerification(requestId, { decision: "approve" }, other.id)).rejects.toMatchObject({ statusCode: 403 });
    expect(VerificationDecisionSchema.safeParse({ decision: "reject" }).success).toBe(false);
    expect(VerificationDecisionSchema.safeParse({ decision: "more_info", reason: " " }).success).toBe(false);
    expect((await http("/admin/academic-verifications", adminToken)).status).toBe(200);
  });

  it("requests more information then preserves the reviewed request when resubmitting", async () => {
    await academicProfileService.decideVerification(requestId, { decision: "more_info", reason: "Student ID is unreadable" }, adminId);
    expect((await academicProfileService.getMine(id)).verificationStatuses.affiliation).toBe("NEEDS_MORE_INFORMATION");
    const previous = requestId;
    await studentAffiliationService.submit(id, { ...input(), studentId: "SE654321" }, file);
    requestId = (await db.verificationEvidence.findFirstOrThrow({ where: { userId: id, status: "PENDING" } })).id;
    expect(requestId).not.toBe(previous);
    expect(await db.verificationEvidence.findUnique({ where: { id: previous } })).toMatchObject({ status: "NEEDS_MORE_INFORMATION", rejectionReason: "Student ID is unreadable" });
    expect(await db.verificationEvidence.count({ where: { userId: id, verificationType: "AFFILIATION", status: { in: ["PENDING", "NEEDS_MORE_INFORMATION"] }, supersededAt: null } })).toBe(1);
    expect(await db.auditLog.count({ where: { actionName: "AFFILIATION_REQUEST_RESUBMITTED", userId: id } })).toBe(1);
  });

  it("rejection preserves login and allows another submission", async () => {
    await academicProfileService.decideVerification(requestId, { decision: "reject", reason: "Please provide current enrollment evidence" }, adminId);
    expect((await authService.login({ email, password })).user.accountStatus).toBe("ACTIVE");
    const submissions = await Promise.allSettled([studentAffiliationService.submit(id, input(), file), studentAffiliationService.submit(id, input(), file)]);
    expect(submissions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(submissions.filter((result) => result.status === "rejected")).toHaveLength(1);
    requestId = (await db.verificationEvidence.findFirstOrThrow({ where: { userId: id, status: "PENDING" } })).id;
  }, 15_000);

  it("atomically accepts only one of two conflicting admin decisions and grants no academic privilege", async () => {
    const results = await Promise.allSettled([
      academicProfileService.decideVerification(requestId, { decision: "approve" }, adminId),
      academicProfileService.decideVerification(requestId, { decision: "reject", reason: "Conflicting decision" }, admin2Id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const request = await db.verificationEvidence.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status !== "VERIFIED") {
      await studentAffiliationService.submit(id, input(), file);
      requestId = (await db.verificationEvidence.findFirstOrThrow({ where: { userId: id, status: "PENDING" } })).id;
      await academicProfileService.decideVerification(requestId, { decision: "approve" }, adminId);
    }
    const login = await authService.login({ email, password });
    expect(login.user.participantScope).toBe("INTERNAL");
    expect(login.user.primaryPosition).toBe("STUDENT");
    expect(login.user.systemRole).toBe("USER");
    expect(login.user.capabilities).toEqual(expect.arrayContaining(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"]));
    expect(login.user.capabilities).not.toContain("STRUCTURED_REVIEW");
    expect(login.user.capabilities).not.toContain("MENTOR_PROJECT");
    expect(await db.affiliation.findFirst({ where: { userId: id, isPrimary: true } })).toMatchObject({ verificationStatus: "VERIFIED", verificationMethod: "MANUAL_DOCUMENT_REVIEW" });
    await assertResearchWorkflowAccess(id);
  }, 15_000);

  it("still enforces object membership for verified students", async () => {
    const project = await projectService.createProject({ title: "Private test project", visibility: "PRIVATE" }, id);
    await expect(projectService.getProjectById(project._id, admin2Id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await projectService.getProjectById(project._id, id)).title).toBe("Private test project");
    await db.project.deleteMany({ where: { ownerId: id } });
  });

  it("retention deletes raw evidence without corrupting affiliation or review history", async () => {
    const location = await academicProfileService.verificationEvidenceFileLocation(requestId, adminId);
    expect(location.kind).toBe("local");
    await db.verificationEvidence.update({ where: { id: requestId }, data: { reviewedAt: new Date("2020-01-01") } });
    await cleanupVerificationEvidence();
    if (location.kind === "local") await expect(fs.access(location.path)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(academicProfileService.verificationEvidenceFileLocation(requestId, adminId)).rejects.toMatchObject({ statusCode: 404 });
    expect(await db.verificationEvidence.findUnique({ where: { id: requestId } })).toMatchObject({ status: "VERIFIED", evidenceStorageKey: null });
    expect((await academicProfileService.getMine(id)).verificationStatuses.affiliation).toBe("VERIFIED");
    const retained = await db.verificationEvidence.findUniqueOrThrow({ where: { id: requestId } });
    expect(retained.metadata).not.toHaveProperty("studentId");
    expect(retained.metadata).not.toHaveProperty("additionalNote");
    expect(await db.affiliation.findFirst({ where: { userId: id, isPrimary: true } })).toMatchObject({ studentCode: null, verificationStatus: "VERIFIED" });
  });

  it("institutional email only verifies affiliation after ownership verification", async () => {
    const institutionalEmail = `institutional-${marker}@fpt.edu.vn`;
    const created = await authService.register({ email: institutionalEmail, password, fullName: "Institutional Student" }); ids.push(created.user.id);
    expect(created.user.participantScope).toBe("PENDING");
    await expect(affiliationService.verifyFromEmail(created.user.id, institutionalEmail)).rejects.toMatchObject({ statusCode: 400 });
    await verify(institutionalEmail);
    expect(await db.affiliation.findFirst({ where: { userId: created.user.id, isPrimary: true } })).toMatchObject({ verificationStatus: "VERIFIED", verificationMethod: "INSTITUTIONAL_EMAIL" });
  }, 15_000);

  it("account disabling clears evidence and invalidates an outstanding request", async () => {
    const created = await authService.register({ email: `disabled-${marker}@gmail.com`, password, fullName: "Disabled Student" }); ids.push(created.user.id);
    await verify(created.user.email);
    await authService.updateAcademicProfile(created.user.id, { academicRole: "STUDENT", primaryPosition: "STUDENT", institutionName: "FPT University", programName: "Software Engineering", researchAreas: ["Software Engineering"] });
    await studentAffiliationService.submit(created.user.id, input(), file);
    const evidence = await db.verificationEvidence.findFirstOrThrow({ where: { userId: created.user.id } });
    await db.user.update({ where: { id: created.user.id }, data: { isActive: false, accountStatus: "DISABLED" } });
    expect(await db.verificationEvidence.findUnique({ where: { id: evidence.id } })).toMatchObject({ status: "INVALIDATED", evidenceStorageKey: null });
    expect(await db.verificationEvidenceDeletion.findUnique({ where: { storageKey: evidence.evidenceStorageKey! } })).not.toBeNull();
    await cleanupVerificationEvidence();
    await expect(academicProfileService.decideVerification(evidence.id, { decision: "approve" }, adminId)).rejects.toMatchObject({ statusCode: 409 });
  }, 15_000);

  it("an administrator cannot review their own student request", async () => {
    await verify(`admin-${marker}@gmail.com`);
    await authService.updateAcademicProfile(adminId, { academicRole: "STUDENT", primaryPosition: "STUDENT", institutionName: "FPT University", programName: "Software Engineering", researchAreas: ["Software Engineering"] });
    await studentAffiliationService.submit(adminId, input(), file);
    const ownRequest = await db.verificationEvidence.findFirstOrThrow({ where: { userId: adminId, status: "PENDING" } });
    await expect(academicProfileService.decideVerification(ownRequest.id, { decision: "approve" }, adminId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("account deletion preserves a durable file cleanup task across the DB cascade", async () => {
    const created = await authService.register({ email: `delete-${marker}@gmail.com`, password, fullName: "Delete Student" }); ids.push(created.user.id);
    await verify(created.user.email);
    await authService.updateAcademicProfile(created.user.id, { academicRole: "STUDENT", primaryPosition: "STUDENT", institutionName: "FPT University", programName: "Software Engineering", researchAreas: ["Software Engineering"] });
    await studentAffiliationService.submit(created.user.id, input(), file);
    const evidence = await db.verificationEvidence.findFirstOrThrow({ where: { userId: created.user.id } });
    const location = await academicProfileService.verificationEvidenceFileLocation(evidence.id, adminId);
    await db.user.delete({ where: { id: created.user.id } });
    expect(await db.verificationEvidenceDeletion.findUnique({ where: { storageKey: evidence.evidenceStorageKey! } })).toBeDefined();
    await cleanupVerificationEvidence();
    if (location.kind === "local") await expect(fs.access(location.path)).rejects.toMatchObject({ code: "ENOENT" });
  }, 15_000);

  it("reclaims a file left between upload and request persistence after an interrupted upload flow", async () => {
    const key = await verificationEvidenceStorage.save(id, bytes);
    const location = await verificationEvidenceStorage.adminLocation(key, id);
    expect(await db.verificationEvidenceDeletion.findUnique({ where: { storageKey: key } })).not.toBeNull();
    await cleanupVerificationEvidence(new Date(Date.now() + 2 * 60 * 60 * 1000));
    if (location.kind === "local") await expect(fs.access(location.path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await db.verificationEvidenceDeletion.findUnique({ where: { storageKey: key } })).toBeNull();
  });
});
