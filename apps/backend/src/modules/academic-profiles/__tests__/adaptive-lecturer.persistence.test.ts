import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { academicProfileService as profiles } from "../academic-profile.service.js";
import { institutionalEmailVerificationService as emails } from "../institutional-email-verification.service.js";
import { academicEmailDelivery } from "../academic-email.service.js";
import { officialInstitutionUrl } from "../../identity/institution-domain.service.js";
import { authService } from "../../auth/auth.service.js";
import { passwordService } from "../../auth/password.service.js";
import { VerificationRequestSchema, VerificationDecisionSchema } from "../dto/academic-profile.schema.js";
import { cleanupVerificationEvidence } from "../verification-evidence-retention.service.js";
import { verificationEvidenceStorage } from "../verification-evidence-storage.service.js";
import { createApp } from "../../../app.js";
import type { AcademicVerificationRequest } from "@trend/shared-types";
import sharp from "sharp";
import { lecturerEvidenceUrl } from "../../identity/institution-domain.service.js";
import { stageLecturerEvidence } from "../verification-evidence-upload.service.js";
import { authMailService } from "../../auth/auth-mail.service.js";
import { notificationService } from "../../notifications/notification.service.js";
import { spawn } from "node:child_process";

const enabled = process.env.LECTURER_VERIFICATION_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated _test database");
describe.skipIf(!enabled).sequential("adaptive Lecturer verification with PostgreSQL", () => {
  const db = getPrisma(), marker = randomUUID().replaceAll("-", ""), domain = `university-${marker}.edu`;
  const ids: string[] = [], keys: Array<{ key: string; owner: string }> = [];
  let institutionId: string, communityId: string, admin: string, admin2: string, moderator: string, passwordHash: string, server: Server, base: string;
  const password = "LecturerVerification123!";
  const delivery = vi.spyOn(academicEmailDelivery, "sendVerificationCode").mockResolvedValue();
  const pdf = (name = "appointment") => { const buffer = Buffer.from(`%PDF-1.4\n${name}\n%%EOF`); return { buffer, size: buffer.length, mimetype: "application/pdf", originalname: `${name}.pdf` }; };
  async function account(emailType: "ACCOUNT" | "PERSONAL" = "PERSONAL", role = "USER") {
    const email = `test-${randomUUID()}@${emailType === "ACCOUNT" ? domain : "gmail.com"}`;
    const user = await db.user.create({ data: { email, passwordHash, fullName: "Lecturer Test Person", systemRole: role, role: "user", academicProfileType: "lecturer", institution: "Fixture University", emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), researchInterests: ["Software engineering"] } }); ids.push(user.id);
    await db.academicProfile.create({ data: { userId: user.id, academicRole: "LECTURER", primaryPosition: "LECTURER", positionTitle: "Lecturer", positionCategory: "LECTURER", roleVerificationStatus: "SELF_DECLARED", positionStatus: "NOT_SUBMITTED", profileVisibility: "PUBLIC" } });
    await db.affiliation.create({ data: { userId: user.id, institutionId, institutionName: "Fixture University", isPrimary: true, isCurrent: true, positionTitle: "Lecturer", positionCategory: "LECTURER" } });
    return user;
  }
  const standard = () => VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "INSTITUTIONAL_PROFILE", primarySourceType: "OFFICIAL_FACULTY_PROFILE", reference: `https://staff.${domain}/people/person` });
  const manual = () => VerificationRequestSchema.parse({ ...standard(), path: "MANUAL", additionalSourceType: "APPOINTMENT_DOCUMENT", additionalNote: "PRIVATE EMPLOYMENT NOTE" });
  async function pending(id: string): Promise<AcademicVerificationRequest> { const profile = await profiles.getMine(id); return profile.verificationRequests.find(r => r.type === "POSITION" && r.status === "PENDING")!; }
  const approval = (request: AcademicVerificationRequest) => ({ decision: "approve" as const, note: "PRIVATE ADMIN NOTE: independent institution confirmation", identityBindingMethod: "INSTITUTION_CONTACT" as const, identityBindingReference: "PRIVATE independent institution contact channel", checklist: { identityMatches: true, institutionMatches: true, currentPositionConfirmed: true, institutionControlled: true, noConflicts: true, identityBound: true, independentEvidence: true }, evidenceChecks: request.sources!.map(s => ({ id: s.id, status: "VALID" as const, note: "PRIVATE SOURCE NOTE" })) });
  beforeAll(async () => {
    passwordHash = await passwordService.hash(password);
    institutionId = (await db.institution.create({ data: { name: "Fixture University", slug: `lecturer-${marker}`, status: "ACTIVE", isActive: true } })).id;
    await db.institutionDomain.create({ data: { institutionId, domain, type: "BOTH", allowSubdomains: true, trusted: true, status: "ACTIVE", verifiedAt: new Date() } });
    admin = (await account("PERSONAL", "ADMIN")).id; admin2 = (await account("PERSONAL", "ADMIN")).id; moderator = (await account()).id;
    communityId = (await db.community.create({ data: { name: "Verification test community", slug: `lecturer-${marker}`, ownerId: admin, isForumCategory: true } })).id;
    await db.communityMembership.create({ data: { communityId, userId: moderator, role: "moderator", status: "active" } });
    server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.on("listening", resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    for (const source of await db.verificationEvidenceSource.findMany({ where: { request: { userId: { in: ids } } } })) if (source.storageKey) keys.push({ key: source.storageKey, owner: (await db.verificationEvidence.findUniqueOrThrow({ where: { id: source.requestId } })).userId });
    for (const upload of await db.verificationEvidenceUpload.findMany({ where: { userId: { in: ids } } })) keys.push({ key: upload.storageKey, owner: upload.userId });
    for (const { key, owner } of keys) await verificationEvidenceStorage.remove(key, owner);
    await db.auditLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { targetRecordId: { in: ids } }] } });
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.verificationEvidenceDeletion.deleteMany({ where: { userId: { in: ids } } });
    await db.institutionDomain.deleteMany({ where: { institutionId } }); await db.institution.delete({ where: { id: institutionId } });
  });
  it("stages a private document and acknowledges durable submission through the existing HTTP endpoint", async () => {
    const user = await account("ACCOUNT"), token = (await authService.login({ email: user.email, password })).tokens.accessToken;
    const uploadForm = new FormData(); uploadForm.append("institutionId", institutionId); uploadForm.append("evidence", new Blob([pdf().buffer], { type: "application/pdf" }), "staff-profile.pdf");
    const uploaded = await fetch(`${base}/academic-profiles/me/verification-evidence`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: uploadForm });
    expect(uploaded.status).toBe(201); const staged = (await uploaded.json()).data;
    expect(staged).toMatchObject({ status: "UPLOADED" }); expect(staged.storageKey).toBeUndefined();
    const submissionKey = randomUUID(), input = { type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", submissionKey, sources: [{ type: "INSTITUTION_ISSUED_PROFILE", sourceKind: "DOCUMENT", uploadId: staged.uploadId }] };
    const response = await fetch(`${base}/academic-profiles/me/verification-request`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
    expect(response.status).toBe(201); const receipt = (await response.json()).data;
    expect(receipt).toMatchObject({ accepted: true, status: "PENDING", submissionKey });
    expect(await db.verificationEvidence.findUnique({ where: { id: receipt.requestId } })).not.toBeNull();
    const result = await profiles.getVerificationStatus(user.id, submissionKey); expect(result.submission).toEqual(receipt);
    expect((await profiles.getVerificationStatus((await account()).id, submissionKey)).submission).toBeNull();
    expect(JSON.stringify(await profiles.getPublic(user.id))).not.toContain(staged.uploadId);
    const request = await pending(user.id); expect(request.sources!.find(source => source.slot === 1)).toMatchObject({ type: "INSTITUTION_ISSUED_PROFILE", status: "UNCHECKED", documentAvailable: true });
    await profiles.decideVerification(request.id, approval(request), admin);
  });
  it("returns the same request for concurrent idempotent retries and writes one durable notification per event", async () => {
    const user = await account("ACCOUNT"), upload = await stageLecturerEvidence(user.id, institutionId, pdf());
    const input = VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), sources: [{ type: "APPOINTMENT_DOCUMENT", sourceKind: "DOCUMENT", uploadId: upload.uploadId }] });
    const mail = vi.spyOn(authMailService, "sendLecturerVerification"); const dispatch = vi.spyOn(notificationService, "dispatch");
    try {
      const results = await Promise.all([profiles.requestVerification(user.id, input), profiles.requestVerification(user.id, input)]);
      expect(results[0]).toEqual(results[1]); expect(await db.verificationEvidence.count({ where: { userId: user.id } })).toBe(1);
      expect(mail).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
      const request = await pending(user.id);
      expect(await db.notification.count({ where: { userId: user.id, eventKey: { startsWith: `LECTURER_VERIFICATION_SUBMITTED:${request.id}` } } })).toBe(1);
      expect(await db.notification.findFirst({ where: { userId: user.id, type: "LECTURER_VERIFICATION_SUBMITTED" } })).toMatchObject({ emailStatus: "PENDING", dispatchedAt: null });
      await expect(profiles.requestVerification(user.id, { ...input, additionalNote: "Changed evidence" })).rejects.toMatchObject({ statusCode: 409 });
      await expect(profiles.requestVerification(user.id, { ...input, submissionKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    } finally { mail.mockRestore(); dispatch.mockRestore(); }
  });
  it("rolls back request and evidence consumption if durable outbox persistence fails", async () => {
    const user = await account("ACCOUNT"), uploaded = await stageLecturerEvidence(user.id, institutionId, pdf());
    const input = VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), sources: [{ type: "STAFF_ID", sourceKind: "DOCUMENT", uploadId: uploaded.uploadId }] });
    const failure = vi.spyOn(notificationService, "create").mockRejectedValueOnce(new Error("Database unavailable"));
    try { await expect(profiles.requestVerification(user.id, input)).rejects.toThrow("Database unavailable"); } finally { failure.mockRestore(); }
    expect(await db.verificationEvidence.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.verificationEvidenceUpload.findUnique({ where: { id: uploaded.uploadId } })).toMatchObject({ consumedAt: null });
    expect((await profiles.getVerificationStatus(user.id, input.submissionKey)).submission).toBeNull();
    await profiles.requestVerification(user.id, input);
  });
  it("rejects stolen, expired and stale-claim staged uploads", async () => {
    const owner = await account("ACCOUNT"), other = await account("ACCOUNT"), uploaded = await stageLecturerEvidence(owner.id, institutionId, pdf());
    const input = VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), sources: [{ type: "STAFF_ID", sourceKind: "DOCUMENT", uploadId: uploaded.uploadId }] });
    await expect(profiles.requestVerification(other.id, input)).rejects.toMatchObject({ statusCode: 400 });
    await db.verificationEvidenceUpload.update({ where: { id: uploaded.uploadId }, data: { expiresAt: new Date(0) } });
    await expect(profiles.requestVerification(owner.id, input)).rejects.toMatchObject({ statusCode: 409 });
    await db.verificationEvidenceUpload.update({ where: { id: uploaded.uploadId }, data: { expiresAt: new Date(Date.now() + 60000) } });
    await db.academicProfile.update({ where: { userId: owner.id }, data: { positionTitle: "Senior Lecturer" } });
    await expect(profiles.requestVerification(owner.id, input)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("accepts six bounded evidence entries without the legacy two-slot constraint", async () => {
    const user = await account("ACCOUNT");
    await profiles.requestVerification(user.id, VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), sources: Array.from({ length: 6 }, (_, index) => ({ type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: `https://staff.${domain}/source/${index}` })) }));
    expect((await pending(user.id)).sources).toHaveLength(7);
  });
  it("rejects expired and exhausted OTPs without granting institutional identity", async () => {
    const user = await account(), work = `work-${randomUUID()}@${domain}`;
    await emails.requestChallenge(user.id, work); const code = delivery.mock.calls.at(-1)![0].code;
    await db.academicEmailVerificationChallenge.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    await expect(emails.verifyChallenge(user.id, code, work)).rejects.toMatchObject({ statusCode: 400 });
    await db.academicEmailVerificationChallenge.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() + 60000), attempts: 0 } });
    const wrong = code === "000000" ? "111111" : "000000";
    await Promise.allSettled(Array.from({ length: 8 }, () => emails.verifyChallenge(user.id, wrong, work)));
    const challenge = await db.academicEmailVerificationChallenge.findFirstOrThrow({ where: { userId: user.id } });
    expect(challenge.attempts).toBe(challenge.maxAttempts);
    await expect(emails.verifyChallenge(user.id, code, work)).rejects.toMatchObject({ statusCode: 400 });
    expect((await emails.status(user.id)).verified).toBe(false);
  });
  it("requires independently established identity binding for new manual requests and keeps provenance private", async () => {
    const user = await account(), input = VerificationRequestSchema.parse({ type: "POSITION", path: "MANUAL", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), sources: [{ type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: `https://staff.${domain}/people/new-person` }] });
    await profiles.requestVerification(user.id, input); const request = await pending(user.id);
    const decision = { ...approval(request), identityBindingMethod: undefined, identityBindingReference: undefined, note: "Confirmed current employment and account binding independently." };
    await expect(profiles.decideVerification(request.id, decision, admin)).rejects.toMatchObject({ statusCode: 400 });
    const privateChannel = "PRIVATE trusted HR directory reference and callback confirmation";
    await profiles.decideVerification(request.id, { ...decision, identityBindingMethod: "INSTITUTION_CONTACT", identityBindingReference: privateChannel }, admin);
    expect((await profiles.getVerificationDetails(request.id)).request.metadata?.identityBindingReference).toBe(privateChannel);
    expect(JSON.stringify(await profiles.getMine(user.id))).not.toContain(privateChannel);
    expect(await db.notification.count({ where: { userId: user.id, type: "LECTURER_VERIFICATION_APPROVED" } })).toBe(1);
    expect(await db.mentorRelationship.count({ where: { mentorUserId: user.id } })).toBe(0);
  });
  it("rejects a correct OTP that expires before its atomic consumption", async () => {
    const user = await account(), work = `work-${randomUUID()}@${domain}`;
    await emails.requestChallenge(user.id, work); const code = delivery.mock.calls.at(-1)![0].code;
    await db.academicEmailVerificationChallenge.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() + 1000) } });
    const find = db.academicEmailVerificationChallenge.findUnique.bind(db.academicEmailVerificationChallenge);
    vi.useFakeTimers({ toFake: ["Date"] });
    const lookup = vi.spyOn(db.academicEmailVerificationChallenge, "findUnique").mockImplementationOnce(async args => {
      const result = await find(args);
      vi.setSystemTime(Date.now() + 2000);
      return result;
    });
    try {
      await expect(emails.verifyChallenge(user.id, code, work)).rejects.toMatchObject({ statusCode: 400 });
      expect(await db.userEmail.findUnique({ where: { normalizedEmail: work } })).toBeNull();
    } finally { lookup.mockRestore(); db.academicEmailVerificationChallenge.findUnique = find; vi.useRealTimers(); }
  });
  it("supersedes an old OTP even when the next address cannot be linked", async () => {
    const user = await account(), existing = await account("ACCOUNT"), work = `work-${randomUUID()}@${domain}`;
    await emails.requestChallenge(user.id, work); const code = delivery.mock.calls.at(-1)![0].code;
    await db.academicEmailVerificationChallenge.updateMany({ where: { userId: user.id }, data: { sentAt: new Date(0) } });
    const sends = delivery.mock.calls.length;
    await emails.requestChallenge(user.id, existing.email);
    expect(delivery.mock.calls.length).toBe(sends);
    await expect(emails.verifyChallenge(user.id, code, work)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("replays an accepted submission after the academic role changes without restoring verification", async () => {
    const user = await account("ACCOUNT"), input = VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), sources: [{ type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: `https://staff.${domain}/role-replay` }] });
    const receipt = await profiles.requestVerification(user.id, input);
    await profiles.updateMine(user.id, { academicRole: "RESEARCHER", primaryPosition: "RESEARCHER", positionCategory: "RESEARCHER", positionTitle: "Researcher" });
    const replay = await profiles.requestVerification(user.id, input);
    expect(replay).toMatchObject({ requestId: (receipt as { requestId: string }).requestId, submissionKey: input.submissionKey, accepted: true, status: "INVALIDATED" });
    expect(await db.verificationEvidence.count({ where: { userId: user.id } })).toBe(1);
    expect((await profiles.getMine(user.id)).academicRoleVerificationStatus).not.toBe("VERIFIED");
  });
  it("enforces resend cooldown, supersedes old codes and consumes concurrent valid OTPs once", async () => {
    const user = await account(), work = `work-${randomUUID()}@${domain}`;
    await emails.requestChallenge(user.id, work); const oldCode = delivery.mock.calls.at(-1)![0].code;
    await expect(emails.requestChallenge(user.id, work)).rejects.toMatchObject({ statusCode: 429 });
    await db.academicEmailVerificationChallenge.updateMany({ where: { userId: user.id }, data: { sentAt: new Date(0) } });
    await emails.requestChallenge(user.id, work); const newCode = delivery.mock.calls.at(-1)![0].code;
    if (oldCode !== newCode) await expect(emails.verifyChallenge(user.id, oldCode, work)).rejects.toMatchObject({ statusCode: 400 });
    await expect(emails.verifyChallenge(user.id, newCode, `wrong@${domain}`)).rejects.toMatchObject({ statusCode: 400 });
    const results = await Promise.allSettled([emails.verifyChallenge(user.id, newCode, work), emails.verifyChallenge(user.id, newCode, work)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.userEmail.count({ where: { normalizedEmail: work } })).toBe(1);
  });
  it("reuses a verified institutional login with no OTP or duplicate email record", async () => {
    const user = await account("ACCOUNT"), count = await db.userEmail.count({ where: { userId: user.id } }), sends = delivery.mock.calls.length;
    const status = await emails.status(user.id);
    expect(status).toMatchObject({ verified: true, source: "ACCOUNT", email: user.email, institutionId, approvedEmailDomains: [{ domain, allowSubdomains: false }] });
    expect(await emails.requestChallenge(user.id)).toMatchObject({ alreadyVerified: true });
    expect(delivery.mock.calls.length).toBe(sends);
    await profiles.requestVerification(user.id, standard());
    expect(await db.userEmail.count({ where: { userId: user.id } })).toBe(count);
    const request = await pending(user.id); expect(request.sources).toHaveLength(2);
    expect(request.verificationMethod).toBe("INSTITUTIONAL_EMAIL_AND_PROFILE");
    await profiles.decideVerification(request.id, approval(request), admin);
    expect((await profiles.getMine(user.id)).verification.method).toBe("INSTITUTIONAL_EMAIL_AND_PROFILE");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).systemRole).toBe("USER");
  });
  it("links verified work email to the SAME User while preserving login and Profile", async () => {
    const user = await account(), work = `work-${randomUUID()}@${domain}`, profile = await db.academicProfile.findUniqueOrThrow({ where: { userId: user.id } });
    const count = await db.user.count(); await emails.requestChallenge(user.id, work);
    const code = delivery.mock.calls.at(-1)![0].code;
    await expect(emails.verifyChallenge(user.id, "invalid")).rejects.toMatchObject({ statusCode: 400 });
    const result = await emails.verifyChallenge(user.id, code); expect(result).toMatchObject({ verified: true, source: "LINKED", email: work });
    await expect(emails.verifyChallenge(user.id, code)).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.user.count()).toBe(count); expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(user.email);
    expect((await db.academicProfile.findUniqueOrThrow({ where: { userId: user.id } })).id).toBe(profile.id);
    expect(await db.userEmail.findUnique({ where: { normalizedEmail: work } })).toMatchObject({ userId: user.id, isPrimary: false });
    await profiles.requestVerification(user.id, standard()); expect((await pending(user.id)).metadata?.identitySource).toBe("LINKED");
  });
  it("accepts a single position document with a verified email without requiring a URL or extra PDF", async () => {
    const user = await account("ACCOUNT");
    const input = VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", sources: [{ type: "APPOINTMENT_DOCUMENT", sourceKind: "DOCUMENT", documentIndex: 0 }] });
    await profiles.requestVerification(user.id, input, undefined, undefined, [pdf()]);
    const request = await pending(user.id);
    expect(request.sources).toHaveLength(2);
    expect(request.sources![1]).toMatchObject({ type: "APPOINTMENT_DOCUMENT", sourceKind: "DOCUMENT", mimeType: "application/pdf", status: "UNCHECKED", documentAvailable: true });
    expect(request.sources![1]!.reference).toBeUndefined();
    await profiles.decideVerification(request.id, approval(request), admin);
    expect((await profiles.getMine(user.id)).verificationStatuses.position).toBe("VERIFIED");
  });
  it("persists custom descriptions and image evidence through the existing API with private Admin preview", async () => {
    const user = await account(), token = (await authService.login({ email: user.email, password })).tokens.accessToken;
    const buffer = await sharp({ create: { width: 20, height: 12, channels: 3, background: "white" } }).png().toBuffer();
    const form = new FormData();
    for (const [key, value] of Object.entries({ type: "POSITION", path: "MANUAL", institutionId, evidenceType: "DOCUMENT" })) form.append(key, value);
    form.append("sources", JSON.stringify([
      { type: "OTHER_INSTITUTION_SOURCE", sourceKind: "URL", customEvidenceName: "Department teaching confirmation", reference: `https://${domain}/teaching`, additionalExplanation: "Issued by this department for the current position" },
      { type: "STAFF_ID", sourceKind: "DOCUMENT", documentIndex: 0 },
    ]));
    form.append("evidenceFiles", new Blob([buffer], { type: "image/png" }), "staff.png");
    expect((await fetch(`${base}/academic-profiles/me/verification-request`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form })).status).toBe(202);
    const request = await pending(user.id), custom = request.sources![0]!, image = request.sources![1]!;
    expect(custom).toMatchObject({ type: "OTHER_INSTITUTION_SOURCE", customEvidenceName: "Department teaching confirmation", sourceKind: "URL", status: "UNCHECKED" });
    expect((await profiles.getVerificationDetails(request.id)).request.sources![0]!.additionalExplanation).toContain("Issued by this department");
    expect(image).toMatchObject({ sourceKind: "DOCUMENT", mimeType: "image/png", documentAvailable: true, status: "UNCHECKED" });
    const url = `${base}/admin/academic-verifications/${request.id}/evidence?sourceId=${image.id}`;
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(403);
    const adminUser = await db.user.findUniqueOrThrow({ where: { id: admin } }), adminToken = (await authService.login({ email: adminUser.email, password })).tokens.accessToken;
    const download = await fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(download.status).toBe(200); expect(download.headers.get("content-type")).toContain("image/png");
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    expect(await sharp(Buffer.from(await download.arrayBuffer())).metadata()).toMatchObject({ format: "png", width: 20 });
    expect(JSON.stringify(await profiles.getPublic(user.id))).not.toContain("Department teaching confirmation");
    expect(JSON.stringify(await profiles.getMine(user.id))).not.toContain("verification-evidence/");
    const invalid = approval(request); invalid.evidenceChecks[0]!.status = "INCONCLUSIVE" as "VALID";
    await expect(profiles.decideVerification(request.id, invalid, admin)).rejects.toMatchObject({ statusCode: 400 });
    await profiles.decideVerification(request.id, approval(request), admin);
  });
  it("requires explicit identity binding and a review rationale for single-source manual approval", async () => {
    const user = await account();
    const input = VerificationRequestSchema.parse({ type: "POSITION", path: "MANUAL", institutionId, evidenceType: "DOCUMENT", sources: [{ type: "OTHER_INSTITUTION_SOURCE", sourceKind: "URL", customEvidenceName: "Official teaching record", reference: `https://${domain}/current-teaching` }] });
    await profiles.requestVerification(user.id, input);
    const request = await pending(user.id), decision = approval(request);
    expect((await profiles.getMine(user.id)).verificationStatuses.position).toBe("PENDING");
    decision.checklist.identityBound = false;
    await expect(profiles.decideVerification(request.id, decision, admin)).rejects.toMatchObject({ statusCode: 400 });
    decision.checklist.identityBound = true;
    decision.note = "Too short";
    await expect(profiles.decideVerification(request.id, decision, admin)).rejects.toMatchObject({ statusCode: 400 });
    decision.note = "Institution confirmed the applicant's identity and current appointment through its HR channel.";
    await profiles.decideVerification(request.id, decision, admin);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).systemRole).toBe("USER");
  });
  it("holds unregistered websites for explicit Admin validation without allowing unsafe or spoofed URLs", async () => {
    const user = await account();
    await db.institutionDomain.update({ where: { domain }, data: { type: "EMAIL" } });
    try {
      for (const url of ["http://unregistered.edu/person", "https://127.0.0.1/person", "https://10.0.0.1/person", "https://localhost/person", "https://host.internal/person", `https://${domain}.attacker.com/person`]) await expect(lecturerEvidenceUrl(url, institutionId)).rejects.toMatchObject({ statusCode: 400 });
      const input = VerificationRequestSchema.parse({ type: "POSITION", path: "MANUAL", institutionId, evidenceType: "DOCUMENT", sources: [{ type: "OTHER_INSTITUTION_SOURCE", sourceKind: "URL", customEvidenceName: "Institution teaching record", reference: `https://unregistered-${marker}.edu/person` }] });
      await profiles.requestVerification(user.id, input);
      const request = await pending(user.id);
      expect(request.sources![0]).toMatchObject({ status: "UNCHECKED", urlTrustStatus: "PENDING_ADMIN_VALIDATION" });
      const decision = { ...approval(request), note: "The institution independently confirmed its website domain and the applicant's identity." };
      await expect(profiles.decideVerification(request.id, decision, admin)).rejects.toMatchObject({ statusCode: 400 });
      await profiles.decideVerification(request.id, { ...decision, evidenceChecks: decision.evidenceChecks.map(check => ({ ...check, institutionDomainConfirmed: true })) }, admin);
      expect((await profiles.getVerificationDetails(request.id)).request.sources![0]!.urlTrustStatus).toBe("ADMIN_VALIDATED");
    } finally { await db.institutionDomain.update({ where: { domain }, data: { type: "BOTH" } }); }
  });
  it("rejects missing documents, duplicate file mappings and unused uploads", async () => {
    const user = await account("ACCOUNT"), source = { type: "APPOINTMENT_DOCUMENT", sourceKind: "DOCUMENT", documentIndex: 0 };
    const input = VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", sources: [source] });
    await expect(profiles.requestVerification(user.id, input)).rejects.toMatchObject({ statusCode: 400 });
    await expect(profiles.requestVerification(user.id, { ...input, sources: [input.sources![0]!, input.sources![0]!] }, undefined, undefined, [pdf()])).rejects.toMatchObject({ statusCode: 400 });
    await expect(profiles.requestVerification(user.id, input, undefined, undefined, [pdf(), pdf("extra")])).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.verificationEvidence.count({ where: { userId: user.id } })).toBe(0);
  });
  it("rejects unrelated or another account's institutional email", async () => {
    const user = await account(), existing = await account("ACCOUNT");
    await expect(emails.requestChallenge(user.id, `other@unrelated.edu`)).rejects.toMatchObject({ statusCode: 400, code: "INSTITUTIONAL_EMAIL_DOMAIN_UNAPPROVED" });
    const sends = delivery.mock.calls.length;
    expect(await emails.requestChallenge(user.id, existing.email)).toMatchObject({ email: expect.any(String), expiresAt: expect.any(String) });
    expect(delivery.mock.calls.length).toBe(sends);
    expect((await emails.status(user.id)).verified).toBe(false);
  });
  it("rejects malformed and other-institution emails with actionable codes before sending mail", async () => {
    const user = await account(), sends = delivery.mock.calls.length;
    const other = await db.institution.create({ data: { name: "Other University", slug: `other-${marker}`, status: "ACTIVE", isActive: true } });
    try {
      await db.institutionDomain.create({ data: { institutionId: other.id, domain: `other-${marker}.edu`, type: "EMAIL", trusted: true, status: "ACTIVE" } });
      await expect(emails.requestChallenge(user.id, "not-an-email")).rejects.toMatchObject({ statusCode: 400, code: "INVALID_INSTITUTIONAL_EMAIL" });
      await expect(emails.requestChallenge(user.id, `person@other-${marker}.edu`)).rejects.toMatchObject({ statusCode: 400, code: "INSTITUTIONAL_EMAIL_INSTITUTION_MISMATCH" });
      await expect(emails.requestChallenge(user.id, `person@staff.${domain}`)).rejects.toMatchObject({ code: "INSTITUTIONAL_EMAIL_DOMAIN_UNAPPROVED" });
      await db.institutionDomain.update({ where: { domain }, data: { type: "WEBSITE" } });
      expect(await emails.status(user.id)).toMatchObject({ officialDomains: [domain], approvedEmailDomains: [] });
      await expect(emails.requestChallenge(user.id, `person@${domain}`)).rejects.toMatchObject({ code: "INSTITUTIONAL_EMAIL_VERIFICATION_UNAVAILABLE" });
      expect(delivery.mock.calls.length).toBe(sends);
      expect(await db.academicEmailVerificationChallenge.count({ where: { userId: user.id } })).toBe(0);
    } finally {
      await db.institutionDomain.update({ where: { domain }, data: { type: "BOTH" } });
      await db.institutionDomain.deleteMany({ where: { institutionId: other.id } });
      await db.institution.delete({ where: { id: other.id } });
    }
  });
  it("validates approved subdomains and rejects lookalikes, local URLs and arbitrary websites", async () => {
    expect(await officialInstitutionUrl(`https://faculty.${domain}/person`, institutionId)).toContain(`faculty.${domain}`);
    for (const url of [`https://${domain}.attacker.com/person`, "https://linkedin.com/person", "http://localhost/person", "https://127.0.0.1/person", `https://${domain}@attacker.com/person`, `https://${domain}/person#fragment`]) await expect(officialInstitutionUrl(url, institutionId)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("prevents impersonation from a personal email plus one real staff URL", async () => {
    const user = await account();
    await expect(profiles.requestVerification(user.id, standard())).rejects.toMatchObject({ statusCode: 400 });
    await expect(profiles.requestVerification(user.id, manual())).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.verificationEvidence.count({ where: { userId: user.id } })).toBe(0);
  });
  it("accepts manual evidence but only approves after all sources and identity binding are checked", async () => {
    const user = await account(); await profiles.requestVerification(user.id, manual(), undefined, pdf()); const request = await pending(user.id);
    expect((await profiles.getMine(user.id)).academicRoleVerificationStatus).toBe("PENDING");
    await expect(profiles.decideVerification(request.id, { decision: "approve" }, admin)).rejects.toMatchObject({ statusCode: 400 });
    const input = approval(request); input.checklist.identityBound = false;
    await expect(profiles.decideVerification(request.id, input, admin)).rejects.toMatchObject({ statusCode: 400 });
    input.checklist.identityBound = true; input.evidenceChecks[0]!.status = "INCONCLUSIVE" as "VALID";
    await expect(profiles.decideVerification(request.id, input, admin)).rejects.toMatchObject({ statusCode: 400 });
    await profiles.decideVerification(request.id, approval(request), admin);
    expect((await profiles.getMine(user.id)).verification.method).toBe("MANUAL_INSTITUTIONAL_EVIDENCE");
  });
  it("supports two institution documents when no public faculty page exists", async () => {
    const user = await account();
    const input = VerificationRequestSchema.parse({ ...manual(), evidenceType: "DOCUMENT", primarySourceType: "EMPLOYMENT_DOCUMENT", reference: undefined });
    await expect(profiles.requestVerification(user.id, input, pdf(), pdf())).rejects.toMatchObject({ statusCode: 400 });
    await profiles.requestVerification(user.id, input, pdf("employment"), pdf("appointment")); const request = await pending(user.id);
    expect(request.sources?.every(s => s.documentAvailable)).toBe(true);
    await profiles.decideVerification(request.id, approval(request), admin); expect((await profiles.getMine(user.id)).verificationStatuses.position).toBe("VERIFIED");
  });
  it("blocks forged state, self-approval and Moderator approval", async () => {
    const user = await account(); expect(VerificationRequestSchema.safeParse({ ...manual(), status: "VERIFIED", verificationMethod: "TRUSTED_INSTITUTION_SOURCE" }).success).toBe(false);
    await profiles.requestVerification(user.id, manual(), undefined, pdf()); const request = await pending(user.id);
    await expect(profiles.decideVerification(request.id, approval(request), user.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(profiles.decideVerification(request.id, approval(request), moderator)).rejects.toMatchObject({ statusCode: 403 });
    await expect(profiles.decideVerification(request.id, approval(request), (await account()).id)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("keeps evidence and Admin notes private, and scopes document access to its request", async () => {
    const user = await account(); await profiles.requestVerification(user.id, manual(), undefined, pdf()); const request = await pending(user.id), source = request.sources!.find(s => s.documentAvailable)!;
    await expect(profiles.verificationEvidenceFileLocation(request.id, moderator, source.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(profiles.verificationEvidenceFileLocation(request.id, admin, randomUUID())).rejects.toMatchObject({ statusCode: 404 });
    expect(await profiles.verificationEvidenceFileLocation(request.id, admin, source.id)).toHaveProperty("kind");
    await profiles.decideVerification(request.id, approval(request), admin);
    const privateProfile = JSON.stringify(await profiles.getMine(user.id)), publicProfile = JSON.stringify(await profiles.getPublic(user.id));
    expect(privateProfile).not.toContain("PRIVATE ADMIN NOTE"); expect(privateProfile).not.toContain("PRIVATE SOURCE NOTE");
    for (const text of ["verificationRequests", "PRIVATE EMPLOYMENT NOTE", "PRIVATE SOURCE NOTE", "storageKey"]) expect(publicProfile).not.toContain(text);
    const detail = await profiles.getVerificationDetails(request.id); expect(detail.request.metadata?.adminNote).toBe("PRIVATE ADMIN NOTE: independent institution confirmation");
  });
  it("allows only the applicant to open their evidence through the owner route", async () => {
    const owner = await account(), other = await account();
    await profiles.requestVerification(owner.id, manual(), undefined, pdf()); const request = await pending(owner.id), source = request.sources!.find(item => item.documentAvailable)!;
    const url = `${base}/academic-profiles/me/verification-requests/${request.id}/evidence?sourceId=${source.id}`;
    expect((await fetch(url)).status).toBe(401);
    const token = (await authService.login({ email: owner.email, password })).tokens.accessToken;
    const otherToken = (await authService.login({ email: other.email, password })).tokens.accessToken;
    expect((await fetch(url, { headers: { Authorization: `Bearer ${otherToken}` } })).status).toBe(404);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await fetch(url.replace(source.id, randomUUID()), { headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
  });
  it("presents legacy document metadata without leaking storage keys, including after retention", async () => {
    const owner = await account(), other = await account();
    const file = pdf("legacy-private");
    const key = await verificationEvidenceStorage.save(owner.id, file.buffer);
    keys.push({ key, owner: owner.id });
    const request = await db.verificationEvidence.create({ data: { userId: owner.id, verificationType: "POSITION", sourceType: "DOCUMENT", evidenceStorageKey: key, evidenceFileName: file.originalname, evidenceMimeType: "application/pdf", status: "REJECTED", reviewedAt: new Date(), rejectionReason: "Position is not established", metadata: { academicRole: "LECTURER", institutionName: "Fixture University", positionTitle: "Lecturer" } } });
    const tracking = (await profiles.getVerificationStatus(owner.id, undefined, request.id)).lecturer;
    expect(tracking.selectedRequest!.evidence).toMatchObject([{ id: request.id, displayName: file.originalname, sourceKind: "DOCUMENT", isAvailable: true }]);
    expect(JSON.stringify(tracking)).not.toContain(key);
    expect(await profiles.ownVerificationEvidenceFileLocation(request.id, owner.id)).toHaveProperty("kind");
    await expect(profiles.ownVerificationEvidenceFileLocation(request.id, other.id)).rejects.toMatchObject({ statusCode: 404 });
    await db.verificationEvidence.update({ where: { id: request.id }, data: { evidenceStorageKey: null, evidenceFileName: null } });
    expect((await profiles.getVerificationStatus(owner.id, undefined, request.id)).lecturer.selectedRequest!.evidence).toMatchObject([{ sourceKind: "DOCUMENT", isAvailable: false }]);
  });
  it("tracks all states and multiple supplement versions from persisted data", async () => {
    const user = await account("ACCOUNT");
    expect((await profiles.getVerificationStatus(user.id)).lecturer).toMatchObject({ status: "NOT_SUBMITTED", allowedActions: ["START"], timeline: [], selectedRequest: null });
    const staged = await stageLecturerEvidence(user.id, institutionId, pdf("initial evidence"));
    const firstInput = VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), sources: [{ type: "STAFF_ID", sourceKind: "DOCUMENT", uploadId: staged.uploadId }] });
    await profiles.requestVerification(user.id, firstInput); const first = await pending(user.id);
    expect((await profiles.getVerificationStatus(user.id)).lecturer).toMatchObject({ status: "PENDING", allowedActions: [] });
    await expect(profiles.decideVerification(first.id, { decision: "more_info", reason: "?" }, admin)).rejects.toMatchObject({ statusCode: 400 });
    expect((await profiles.getVerificationStatus(user.id)).lecturer.status).toBe("PENDING");
    await profiles.decideVerification(first.id, { decision: "more_info", reason: "Add a current employment record", note: "PRIVATE INTERNAL ASSESSMENT" }, admin);
    const feedbackNotice = await db.notification.findFirstOrThrow({ where: { userId: user.id, type: "LECTURER_VERIFICATION_MORE_INFO_REQUIRED" } });
    expect(feedbackNotice.emailPayload).toMatchObject({ requestId: first.id, applicantMessage: "Add a current employment record" });
    expect(JSON.stringify(feedbackNotice.emailPayload)).not.toContain("PRIVATE INTERNAL");
    let tracking = (await profiles.getVerificationStatus(user.id)).lecturer;
    expect(tracking).toMatchObject({ status: "NEEDS_MORE_INFORMATION", allowedActions: ["SUPPLEMENT"], selectedRequest: { applicantMessage: "Add a current employment record" } });
    expect(JSON.stringify(tracking)).not.toMatch(/storageKey|PRIVATE INTERNAL|reviewChecklist|reviewerNote/);
    const retained = first.sources!.find(item => item.slot === 1)!;
    const supplement = VerificationRequestSchema.parse({ ...firstInput, submissionKey: randomUUID(), supplementsRequestId: first.id, expectedReviewedAt: tracking.selectedRequest!.reviewedAt, sources: [{ type: "STAFF_ID", sourceKind: "DOCUMENT", retainedSourceId: retained.id }, { type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: `https://${domain}/supplement` }] });
    await expect(profiles.requestVerification(user.id, { ...supplement, expectedReviewedAt: new Date(0).toISOString() })).rejects.toMatchObject({ statusCode: 409 });
    const [a, b] = await Promise.all([profiles.requestVerification(user.id, supplement), profiles.requestVerification(user.id, supplement)]);
    expect(a).toEqual(b);
    const second = await pending(user.id), secondRow = await db.verificationEvidence.findUniqueOrThrow({ where: { id: second.id }, include: { sources: true } });
    expect(secondRow).toMatchObject({ previousRequestId: first.id, revision: 2 });
    expect(await db.notification.count({ where: { userId: user.id, type: "LECTURER_VERIFICATION_SUPPLEMENTED" } })).toBe(1);
    expect((await notificationService.list(user.id, "user")).find(item => item.type === "LECTURER_VERIFICATION_SUPPLEMENTED")).toMatchObject({ verificationRequestId: second.id });
    expect(secondRow.sources.find(item => item.slot === 1)).toMatchObject({ previousSourceId: retained.id, status: "UNCHECKED" });
    expect((await db.verificationEvidence.findUniqueOrThrow({ where: { id: first.id } })).rejectionReason).toBe("Add a current employment record");
    await profiles.decideVerification(second.id, { decision: "more_info", reason: "Clarify the appointment period" }, admin);
    tracking = (await profiles.getVerificationStatus(user.id)).lecturer;
    const thirdInput = VerificationRequestSchema.parse({ ...supplement, submissionKey: randomUUID(), supplementsRequestId: second.id, expectedReviewedAt: tracking.selectedRequest!.reviewedAt, sources: [{ type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: `https://${domain}/replacement` }] });
    await profiles.requestVerification(user.id, thirdInput); const third = await pending(user.id);
    tracking = (await profiles.getVerificationStatus(user.id)).lecturer;
    expect(tracking.timeline.map(event => event.eventType)).toEqual(["SUBMITTED", "MORE_INFO", "SUPPLEMENTED", "MORE_INFO", "SUPPLEMENTED"]);
    expect(tracking.history).toHaveLength(3);
    await profiles.decideVerification(third.id, approval(third), admin);
    tracking = (await profiles.getVerificationStatus(user.id)).lecturer;
    expect(tracking).toMatchObject({ status: "VERIFIED", allowedActions: ["MENTORING_SETTINGS", "WORKSPACE"] });
    expect(await db.mentorRelationship.count({ where: { mentorUserId: user.id } })).toBe(0);
    await expect(profiles.requestVerification(user.id, { ...thirdInput, submissionKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("preserves rejected decisions and approved history after later claim changes", async () => {
    const user = await account("ACCOUNT"); await profiles.requestVerification(user.id, standard()); const first = await pending(user.id);
    await profiles.decideVerification(first.id, { decision: "reject", reason: "Position evidence is outdated" }, admin);
    expect((await profiles.getVerificationStatus(user.id)).lecturer).toMatchObject({ status: "REJECTED", allowedActions: ["NEW_REQUEST"] });
    const before = await db.verificationEvidence.findUniqueOrThrow({ where: { id: first.id } });
    await profiles.requestVerification(user.id, standard()); const second = await pending(user.id);
    expect((await db.verificationEvidence.findUniqueOrThrow({ where: { id: second.id } })).previousRequestId).toBe(first.id);
    expect(await db.verificationEvidence.findUniqueOrThrow({ where: { id: first.id } })).toEqual(before);
    await profiles.decideVerification(second.id, approval(second), admin);
    const approved = await db.verificationEvidence.findUniqueOrThrow({ where: { id: second.id } });
    await profiles.updateMine(user.id, { academicRole: "RESEARCHER", primaryPosition: "RESEARCHER", positionCategory: "RESEARCHER", positionTitle: "Researcher" });
    const after = await db.verificationEvidence.findUniqueOrThrow({ where: { id: second.id } });
    expect(after).toMatchObject({ status: "VERIFIED", reviewedAt: approved.reviewedAt, reviewedById: approved.reviewedById }); expect(after.invalidatedAt).not.toBeNull();
    expect((await profiles.getVerificationStatus(user.id)).lecturer).toMatchObject({ status: "NOT_SUBMITTED", allowedActions: [] });
    expect((await profiles.getVerificationStatus(user.id, undefined, second.id)).lecturer.selectedRequest!.status).toBe("VERIFIED");
    await expect(profiles.getVerificationStatus((await account()).id, undefined, second.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("rejects stolen retained sources and protects documents retained by a newer pending version", async () => {
    const user = await account(), other = await account();
    await profiles.requestVerification(user.id, manual(), undefined, pdf()); const first = await pending(user.id);
    await profiles.decideVerification(first.id, { decision: "more_info", reason: "Update current employment" }, admin);
    await profiles.requestVerification(other.id, manual(), undefined, pdf("other private")); const otherRequest = await pending(other.id);
    const source = first.sources!.find(item => item.documentAvailable)!;
    const tracking = (await profiles.getVerificationStatus(user.id)).lecturer;
    const input = VerificationRequestSchema.parse({ type: "POSITION", path: "MANUAL", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), supplementsRequestId: first.id, expectedReviewedAt: tracking.selectedRequest!.reviewedAt, sources: [{ type: source.type, sourceKind: "DOCUMENT", retainedSourceId: otherRequest.sources!.find(item => item.documentAvailable)!.id }] });
    await expect(profiles.requestVerification(user.id, input)).rejects.toMatchObject({ statusCode: 400 });
    input.sources![0]!.retainedSourceId = source.id; await profiles.requestVerification(user.id, input); const second = await pending(user.id);
    await db.verificationEvidence.update({ where: { id: first.id }, data: { reviewedAt: new Date("2000-01-01") } });
    await cleanupVerificationEvidence();
    expect((await db.verificationEvidenceSource.findFirstOrThrow({ where: { requestId: second.id, slot: 1 } })).storageKey).not.toBeNull();
    expect(await profiles.ownVerificationEvidenceFileLocation(second.id, user.id, second.sources![0]!.id)).toHaveProperty("kind");
  });
  it("preserves more-info history on resubmission and rejects stale final decisions", async () => {
    const user = await account(); await profiles.requestVerification(user.id, manual(), undefined, pdf()); const first = await pending(user.id);
    const moreInfo = VerificationDecisionSchema.parse({ decision: "more_info", reason: "Please provide a current appointment record", note: "PRIVATE MORE INFO NOTE" });
    await profiles.decideVerification(first.id, moreInfo, admin);
    expect((await profiles.getVerificationDetails(first.id)).request.metadata?.adminNote).toBe("PRIVATE MORE INFO NOTE");
    expect(JSON.stringify(await profiles.getMine(user.id))).not.toContain("PRIVATE MORE INFO NOTE");
    await profiles.requestVerification(user.id, manual(), undefined, pdf("new appointment")); const second = await pending(user.id);
    expect(second.id).not.toBe(first.id); expect((await profiles.getMine(user.id)).verificationRequests).toHaveLength(2);
    expect(await db.auditLog.findFirst({ where: { userId: user.id, actionName: "LECTURER_VERIFICATION_RESUBMITTED" } })).not.toBeNull();
    await profiles.decideVerification(second.id, { decision: "reject", reason: "Cannot establish current position" }, admin);
    await expect(profiles.decideVerification(second.id, approval(second), admin)).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).accountStatus).toBe("ACTIVE");
  });
  it("serializes duplicate submissions and simultaneous Admin decisions", async () => {
    const user = await account("ACCOUNT"); const submissions = await Promise.allSettled([profiles.requestVerification(user.id, standard()), profiles.requestVerification(user.id, standard())]);
    expect(submissions.filter(r => r.status === "fulfilled")).toHaveLength(1); const request = await pending(user.id);
    const decisions = await Promise.allSettled([profiles.decideVerification(request.id, approval(request), admin), profiles.decideVerification(request.id, { decision: "reject", reason: "Conflict" }, admin2)]);
    expect(decisions.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("revalidates claim changes and revoked institutional identity at approval", async () => {
    const user = await account("ACCOUNT"); await profiles.requestVerification(user.id, standard()); const request = await pending(user.id);
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } });
    await expect(profiles.decideVerification(request.id, approval(request), admin)).rejects.toMatchObject({ statusCode: 409 });
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), fullName: "Changed claim" } });
    await expect(profiles.decideVerification(request.id, approval(request), admin)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("uploads two private files through the existing API and rejects public/normal-user downloads", async () => {
    const user = await account(), token = (await authService.login({ email: user.email, password })).tokens.accessToken;
    const form = new FormData();
    for (const [key, value] of Object.entries({ ...manual(), reference: undefined, primarySourceType: "EMPLOYMENT_DOCUMENT", evidenceType: "DOCUMENT" })) if (value) form.append(key, value);
    form.append("evidence", new Blob([pdf("employment").buffer], { type: "application/pdf" }), "employment.pdf");
    form.append("additionalEvidence", new Blob([pdf("appointment").buffer], { type: "application/pdf" }), "appointment.pdf");
    const response = await fetch(`${base}/academic-profiles/me/verification-request`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }); expect(response.status).toBe(202);
    const request = await pending(user.id), source = request.sources![0]!;
    const url = `${base}/admin/academic-verifications/${request.id}/evidence?sourceId=${source.id}`;
    expect((await fetch(url)).status).toBe(401); expect((await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(403);
    const adminUser = await db.user.findUniqueOrThrow({ where: { id: admin } }), adminToken = (await authService.login({ email: adminUser.email, password })).tokens.accessToken;
    const download = await fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } }); expect(download.status).toBe(200); expect(download.headers.get("cache-control")).toBe("private, no-store");
  });
  it("removes both private raw documents after final-review retention, retaining provenance", async () => {
    const user = await account(), input = VerificationRequestSchema.parse({ ...manual(), reference: undefined, primarySourceType: "EMPLOYMENT_DOCUMENT", evidenceType: "DOCUMENT" });
    await profiles.requestVerification(user.id, input, pdf("employment"), pdf("appointment")); const request = await pending(user.id);
    await profiles.decideVerification(request.id, approval(request), admin);
    await db.verificationEvidence.update({ where: { id: request.id }, data: { reviewedAt: new Date("2000-01-01") } });
    await cleanupVerificationEvidence(); const after = await db.verificationEvidence.findUniqueOrThrow({ where: { id: request.id }, include: { sources: true } });
    expect(after.sources.every(s => !s.storageKey && !s.fileName && !s.reviewerNote)).toBe(true);
    expect(after.verificationMethod).toBe("MANUAL_INSTITUTIONAL_EVIDENCE"); expect(JSON.stringify(after.metadata)).not.toContain("PRIVATE EMPLOYMENT NOTE");
    expect((await db.academicProfile.findUniqueOrThrow({ where: { userId: user.id } })).verificationNote).toBeNull();
  });
  it("expires private decision notes for URL-only evidence and keeps newer notes intact", async () => {
    const user = await account("ACCOUNT");
    await profiles.requestVerification(user.id, standard()); const request = await pending(user.id);
    await profiles.decideVerification(request.id, { ...approval(request), identityBindingMethod: undefined, identityBindingReference: undefined, evidenceChecks: request.sources!.map(source => ({ id: source.id, status: "VALID" as const })), note: "PRIVATE URL-ONLY REVIEW NOTE" }, admin);
    await db.verificationEvidence.update({ where: { id: request.id }, data: { reviewedAt: new Date("2000-01-01") } });
    await cleanupVerificationEvidence();
    expect((await db.verificationEvidence.findUniqueOrThrow({ where: { id: request.id } })).metadata).not.toHaveProperty("adminNote");
    expect((await db.academicProfile.findUniqueOrThrow({ where: { userId: user.id } })).verificationNote).toBeNull();
    await db.verificationEvidence.update({ where: { id: request.id }, data: { metadata: { adminNote: "OLD PRIVATE NOTE" } } });
    await db.verificationEvidence.create({ data: { userId: user.id, verificationType: "POSITION", sourceType: "INSTITUTIONAL_PROFILE", status: "VERIFIED", reviewedAt: new Date(), metadata: { adminNote: "NEW PRIVATE NOTE" } } });
    await db.academicProfile.update({ where: { userId: user.id }, data: { verificationNote: "NEW PRIVATE NOTE" } });
    await cleanupVerificationEvidence();
    expect((await db.academicProfile.findUniqueOrThrow({ where: { userId: user.id } })).verificationNote).toBe("NEW PRIVATE NOTE");
  });
  it("queues every source document when the applicant is disabled or deleted", async () => {
    for (const action of ["disable", "delete"] as const) {
      const user = await account(); await profiles.requestVerification(user.id, manual(), undefined, pdf()); const request = await pending(user.id);
      const source = await db.verificationEvidenceSource.findFirstOrThrow({ where: { requestId: request.id, storageKey: { not: null } } });
      keys.push({ key: source.storageKey!, owner: user.id });
      if (action === "disable") {
        await db.user.update({ where: { id: user.id }, data: { accountStatus: "DISABLED" } });
        expect(await db.verificationEvidenceSource.findUnique({ where: { id: source.id } })).toMatchObject({ storageKey: null, fileName: null });
        expect(await db.verificationEvidence.findUnique({ where: { id: request.id } })).toMatchObject({ status: "INVALIDATED" });
      } else await db.user.delete({ where: { id: user.id } });
      expect(await db.verificationEvidenceDeletion.findUnique({ where: { storageKey: source.storageKey! } })).not.toBeNull();
    }
  });
  it("preserves legacy requests but requires updated evidence before a new Lecturer approval", async () => {
    const user = await account();
    const profile = await db.academicProfile.findUniqueOrThrow({ where: { userId: user.id } });
    const request = await db.verificationEvidence.create({ data: { userId: user.id, academicProfileId: profile.id, verificationType: "POSITION", sourceType: "INSTITUTIONAL_PROFILE", sourceReference: `https://${domain}/person`, status: "PENDING", metadata: { academicRole: "LECTURER", primaryPosition: "LECTURER", positionCategory: "LECTURER", targetValue: "Lecturer", positionTitle: "Lecturer", institutionId, institutionName: "Fixture University" } } });
    await expect(profiles.decideVerification(request.id, { decision: "approve" }, admin)).rejects.toMatchObject({ statusCode: 400 });
    await profiles.decideVerification(request.id, { decision: "more_info", reason: "Please submit the adaptive evidence for your Lecturer claim" }, admin);
    expect(await db.verificationEvidence.findUnique({ where: { id: request.id } })).toMatchObject({ sourceReference: `https://${domain}/person`, status: "NEEDS_MORE_INFORMATION" });
    const tracking = (await profiles.getVerificationStatus(user.id, undefined, request.id)).lecturer;
    expect(tracking.allowedActions).toEqual(["SUPPLEMENT"]);
    await profiles.requestVerification(user.id, VerificationRequestSchema.parse({ type: "POSITION", path: "MANUAL", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), supplementsRequestId: request.id, expectedReviewedAt: tracking.selectedRequest!.reviewedAt, sources: [{ type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: `https://${domain}/person` }] }));
    expect(await db.verificationEvidence.findFirstOrThrow({ where: { userId: user.id, status: "PENDING" } })).toMatchObject({ previousRequestId: request.id, revision: 2 });
  });
  it("recovers committed verification outbox rows in the real notification worker without sending email", async () => {
    const user = await account("ACCOUNT");
    await profiles.requestVerification(user.id, VerificationRequestSchema.parse({ type: "POSITION", path: "STANDARD", institutionId, evidenceType: "DOCUMENT", submissionKey: randomUUID(), sources: [{ type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: `https://staff.${domain}/worker-test` }] }));
    const notification = await db.notification.findFirstOrThrow({ where: { userId: user.id, type: "LECTURER_VERIFICATION_SUBMITTED" } });
    expect(notification.dispatchedAt).toBeNull();
    const worker = spawn(process.execPath, ["--import", "tsx", "src/workers/notification.worker.ts"], { windowsHide: true, stdio: "ignore", env: { ...process.env, EMAIL_DELIVERY_MODE: "disabled", LOG_LEVEL: "error" } });
    let spawnError: Error | undefined; worker.on("error", error => { spawnError = error; });
    try {
      const deadline = Date.now() + 10000; let row = notification;
      while (Date.now() < deadline && (!row.dispatchedAt || !row.pushSentAt || row.emailStatus !== "SKIPPED")) {
        if (spawnError) throw spawnError;
        await new Promise(resolve => setTimeout(resolve, 150));
        row = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
      }
      expect(row.emailStatus).toBe("SKIPPED"); expect(row.dispatchedAt).not.toBeNull(); expect(row.pushSentAt).not.toBeNull();
      expect((await pending(user.id)).status).toBe("PENDING");
    } finally { worker.kill(); await new Promise<void>(resolve => { if (worker.exitCode !== null) resolve(); else worker.once("exit", () => resolve()); }); }
  });
});
