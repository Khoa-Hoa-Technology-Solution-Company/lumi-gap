import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectMentorshipService as consent } from "../project-mentorship.service.js";
import { mentorPlanService as plan } from "../mentor-plan.service.js";
import { mentorAccessService as access } from "../mentor-access.service.js";
import { canAccessProjectAsMentor } from "../academic-relationship-access.js";
import { mentorPlanCommandSchema } from "../dto/mentor-plan.schema.js";
import { mentorshipContentService as files } from "../mentorship-content.service.js";
import { deliverMentorshipEmail } from "../mentorship-mail.service.js";
import { authMailService } from "../../auth/auth-mail.service.js";
import { env } from "../../../config/env.js";
import { readFileSync } from "node:fs";
import { Client } from "pg";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../auth/auth-mail.service.js", async original => ({ ...await original<typeof import("../../auth/auth-mail.service.js")>(), authMailService: { sendMentorship: vi.fn().mockResolvedValue(true) } }));
const enabled = process.env.MENTOR_PLAN_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated _test database");

describe.skipIf(!enabled).sequential("controlled mentor recruitment (PostgreSQL)", () => {
  const db = getPrisma();
  let project: string, owner: string, member: string, lecturers: string[];
  const summary = "Nghiên cứu so sánh các phương pháp đánh giá mô hình ngôn ngữ trong giáo dục.";
  async function user(lecturer = false) {
    const u = await db.user.create({ data: { fullName: lecturer ? "Giảng viên thử nghiệm" : "Thành viên thử nghiệm", email: `${crypto.randomUUID()}@mentor-plan.invalid`, emailVerifiedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: u.id, academicRole: lecturer ? "LECTURER" : "STUDENT", primaryPosition: lecturer ? "LECTURER" : "STUDENT", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: lecturer } } });
    return u.id;
  }
  async function change(input: Omit<Parameters<typeof plan.change>[2], "expectedVersion"> & Record<string, unknown>) {
    return plan.change(project, owner, { ...input, expectedVersion: (await plan.read(project, owner)).version } as Parameters<typeof plan.change>[2]);
  }
  async function add(index: number, role: "PRIMARY" | "SECONDARY" = "PRIMARY") {
    const result = await change({ action: "add", mentorUserId: lecturers[index], mentorRole: role });
    return result.candidates.find(c => c.mentorUserId === lecturers[index])!;
  }
  const send = (index = 0, role: "PRIMARY" | "SECONDARY" = "PRIMARY", extra = {}) => consent.request(project, owner, { mentorUserId: lecturers[index], mentorRole: role, message: "Mời hỗ trợ thiết kế và đánh giá nghiên cứu", ...extra });
  beforeEach(async () => {
    env.EMAIL_DELIVERY_MODE = "disabled";
    vi.mocked(authMailService.sendMentorship).mockClear();
    owner = await user(); member = await user(); lecturers = await Promise.all(Array.from({ length: 5 }, () => user(true)));
    project = (await createProjectFixture({ data: { ownerId: owner, title: "Kế hoạch mentor", description: "PRIVATE-RESEARCH-DATA", mentorshipSummary: summary, mentorshipDiscovery: "SEEKING_MENTOR" } })).id;
    await db.projectMember.create({ data: { projectId: project, userId: member } });
  });
  afterAll(disconnectPostgres);

  it("keeps zero-to-four distinct candidates private without invitations, files, notifications or access", async () => {
    expect((await plan.read(project, owner)).candidates).toEqual([]);
    await add(0); await add(1); await add(2, "SECONDARY"); const p = await add(3, "SECONDARY");
    expect(p).toMatchObject({ status: "PLANNED", canSend: false });
    expect((await plan.read(project, owner)).candidates).toHaveLength(4);
    await expect(add(4)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(0);
    expect(await db.notification.count({ where: { targetUuid: project } })).toBe(0);
    expect(await canAccessProjectAsMentor(project, lecturers[0])).toBe(false);
    await expect(plan.read(project, lecturers[0])).rejects.toMatchObject({ statusCode: 403 });
    await expect(plan.read(project, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(consent.workspace(project, lecturers[0])).rejects.toMatchObject({ statusCode: 403 });
  });
  it("rejects duplicate people, unauthorized changes, inactive accounts and stale plan versions", async () => {
    await add(0);
    await expect(add(0, "SECONDARY")).rejects.toMatchObject({ statusCode: 409 });
    await expect(plan.change(project, member, { action: "restart", expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(plan.change(project, owner, { action: "configure", parallelInvitations: true, expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 409 });
    await db.user.update({ where: { id: lecturers[1] }, data: { isActive: false } });
    await expect(add(1)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("reorders/removes only unsent candidates and enforces the same-role queue on every send path", async () => {
    const a = await add(0), b = await add(1);
    await expect(send(1)).rejects.toMatchObject({ statusCode: 409 });
    await change({ action: "move", candidateId: b.id, offset: -1 });
    expect((await plan.read(project, owner)).candidates[0].id).toBe(b.id);
    await change({ action: "remove", candidateId: a.id });
    const invitation = await send(1);
    await expect(change({ action: "remove", candidateId: b.id })).rejects.toMatchObject({ statusCode: 409 });
    await expect(change({ action: "move", candidateId: b.id, offset: 1 })).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.mentorshipRequest.findUniqueOrThrow({ where: { id: invitation.id } })).candidateId).toBe(b.id);
  });
  it("defaults to primary first and allows explicit parallel roles with secondary acceptance first", async () => {
    await add(0); await add(1, "SECONDARY");
    await expect(send(1, "SECONDARY")).rejects.toMatchObject({ statusCode: 409 });
    await change({ action: "configure", parallelInvitations: true });
    const a = await send(0), b = await send(1, "SECONDARY");
    expect(await db.mentorshipRequest.count({ where: { projectId: project, status: "PENDING" } })).toBe(2);
    await consent.accept(project, b.id, lecturers[1]);
    expect(await db.mentorRelationship.findFirst({ where: { projectId: project, mentorUserId: lecturers[1] } })).toMatchObject({ mentorRole: "SECONDARY", status: "ACTIVE" });
    await consent.accept(project, a.id, lecturers[0]);
    await expect(send(2)).rejects.toMatchObject({ statusCode: 409 });
    await expect(send(3, "SECONDARY")).rejects.toMatchObject({ statusCode: 409 });
  });
  it("accepts a valid secondary reservation even if parallel mode is subsequently disabled", async () => {
    await change({ action: "configure", parallelInvitations: true });
    const b = await send(1, "SECONDARY");
    await change({ action: "configure", parallelInvitations: false });
    await consent.accept(project, b.id, lecturers[1]);
    expect(await db.mentorRelationship.count({ where: { projectId: project, status: "ACTIVE", mentorRole: "SECONDARY" } })).toBe(1);
  });
  it("serializes simultaneous sends for a role and idempotently retries the winner", async () => {
    const key = crypto.randomUUID();
    const results = await Promise.allSettled([send(0, "PRIMARY", { idempotencyKey: key }), send(1)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const pending = await db.mentorshipRequest.findFirstOrThrow({ where: { projectId: project, status: "PENDING" } });
    if (pending.mentorUserId === lecturers[0]) expect((await send(0, "PRIMARY", { idempotencyKey: key })).id).toBe(pending.id);
    expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(1);
  });
  it("makes the same-role backup ready after decline, never auto-sends, and rechecks eligibility", async () => {
    await add(0); const backup = await add(1); await add(2, "SECONDARY");
    const a = await send(0); await consent.decline(project, a.id, lecturers[0]);
    const p = await plan.read(project, owner);
    expect(p.autoSend).toBe(false);
    expect(p.candidates.find(c => c.id === backup.id)).toMatchObject({ status: "READY", canSend: true });
    expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(1);
    await db.academicProfile.update({ where: { userId: lecturers[1] }, data: { supportAvailability: { enabled: false } } });
    await expect(send(1)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("expires once, rejects late acceptance, and releases only the correct backup queue", async () => {
    await add(0); const backup = await add(1); await add(2, "SECONDARY");
    const a = await send(0);
    await db.mentorshipRequest.update({ where: { id: a.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await Promise.all([consent.expireRequests(), consent.expireRequests()]);
    await expect(consent.accept(project, a.id, lecturers[0])).rejects.toMatchObject({ statusCode: 409 });
    expect((await plan.read(project, owner)).candidates.find(c => c.id === backup.id)?.canSend).toBe(true);
    expect(await db.notification.count({ where: { eventKey: `MENTORSHIP_EXPIRED:${a.id}:${owner}` } })).toBe(1);
    await send(1);
  });
  it("never accepts and expires the same invitation when the transitions race", async () => {
    const a = await send(0);
    await db.mentorshipRequest.update({ where: { id: a.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    await Promise.allSettled([consent.accept(project, a.id, lecturers[0]), consent.expireRequests()]);
    expect((await db.mentorshipRequest.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("EXPIRED");
    expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(0);
  });
  it("accepts exactly once concurrently, validates recipient, and stops further backups", async () => {
    await add(0); await add(1); const a = await send(0);
    await expect(consent.accept(project, a.id, lecturers[1])).rejects.toMatchObject({ statusCode: 403 });
    const results = await Promise.all([consent.accept(project, a.id, lecturers[0]), consent.accept(project, a.id, lecturers[0])]);
    expect(results[0].relationshipId).toBe(results[1].relationshipId);
    expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(1);
    await expect(send(1)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("denies revoked and cross-project invitations and stale approvals", async () => {
    const c = await add(0), version = (await plan.read(project, owner)).version;
    await add(1);
    await expect(send(0, "PRIMARY", { candidateId: c.id, expectedPlanVersion: version })).rejects.toMatchObject({ statusCode: 409 });
    const a = await send(0); await consent.cancel(project, a.id, owner);
    await expect(consent.accept(project, a.id, lecturers[0])).rejects.toMatchObject({ statusCode: 409 });
    const other = (await createProjectFixture({ data: { ownerId: owner, title: "Other project", mentorshipSummary: summary } })).id;
    await expect(consent.accept(other, a.id, lecturers[0])).rejects.toMatchObject({ statusCode: 404 });
    await expect(consent.request(other, owner, { mentorUserId: lecturers[0], candidateId: c.id, message: "Request", mentorRole: "PRIMARY" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(db.mentorshipRequest.create({ data: { projectId: other, mentorUserId: lecturers[0], requestedBy: owner, candidateId: c.id, mentorRole: "PRIMARY", message: "Bypass scope" } })).rejects.toThrow();
  });
  it("requires a safe abstract, snapshots sent content and does not invalidate consent on later edits", async () => {
    await db.project.update({ where: { id: project }, data: { mentorshipSummary: "" } });
    await expect(send()).rejects.toMatchObject({ statusCode: 400 });
    await db.project.update({ where: { id: project }, data: { mentorshipSummary: summary } });
    const a = await send();
    expect(a.legacyPreview).toBe(false);
    expect(a.project?.summary).toBe(summary);
    await db.project.update({ where: { id: project }, data: { mentorshipSummary: "Một tóm tắt được phép chia sẻ mới hoàn toàn khác với nội dung đã gửi." } });
    const detail = await consent.requestDetail(project, a.id, lecturers[0]);
    expect(detail.project?.summary).toBe(summary);
    expect(JSON.stringify(detail)).not.toContain("PRIVATE-RESEARCH-DATA");
    await consent.accept(project, a.id, lecturers[0], undefined, a.accessPolicy?.version, a.previewToken);
    await expect(db.mentorshipRequest.update({ where: { id: a.id }, data: { message: "Silently changed" } })).rejects.toThrow();
    await expect(db.mentorshipRequest.update({ where: { id: a.id }, data: { mentorRole: "SECONDARY" } })).rejects.toThrow();
  });
  it("gives new invitations 14 days without changing the deadline on retries", async () => {
    const key = crypto.randomUUID(), a = await send(0, "PRIMARY", { idempotencyKey: key });
    expect(new Date(a.expiresAt!).getTime() - new Date(a.createdAt).getTime()).toBeCloseTo(14 * 86400000, -3);
    const b = await send(0, "PRIMARY", { idempotencyKey: key }); expect(b.expiresAt).toBe(a.expiresAt);
  });
  it("stops planning for assigned or departed roles until the owner explicitly reopens recruitment", async () => {
    const a = await send(); const accepted = await consent.accept(project, a.id, lecturers[0]);
    await expect(add(1)).rejects.toMatchObject({ statusCode: 409 });
    await consent.end(project, accepted.relationshipId!, owner);
    await expect(add(1)).rejects.toMatchObject({ statusCode: 409 });
    await change({ action: "restart" }); await add(1);
    expect((await plan.read(project, owner)).candidates).toHaveLength(1);
  });
  it("revokes departed mentor access, keeps the other role, and requires a new campaign", async () => {
    await change({ action: "configure", parallelInvitations: true });
    await add(0); await add(1); await add(2, "SECONDARY");
    const a = await send(), b = await send(2, "SECONDARY");
    const accepted = await consent.accept(project, a.id, lecturers[0]); await consent.accept(project, b.id, lecturers[2]);
    await consent.end(project, accepted.relationshipId!, owner, "Kết thúc hướng dẫn");
    expect(await canAccessProjectAsMentor(project, lecturers[0])).toBe(false);
    expect(await canAccessProjectAsMentor(project, lecturers[2])).toBe(true);
    await expect(send(1)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(2);
    await change({ action: "restart" }); await add(1); await send(1);
    expect(await db.mentorInvitationPlan.count({ where: { projectId: project } })).toBe(2);
    expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(2);
  });
  it("protects attachments and staged drafts from unsent backup candidates", async () => {
    await add(0); await add(1);
    const file = await files.upload(project, owner, "PROJECT_TO_LECTURER", { buffer: Buffer.from("%PDF-1.4\n%%EOF"), mimetype: "application/pdf", originalname: "brief.pdf" });
    await expect(files.file(file.id, lecturers[0])).rejects.toMatchObject({ statusCode: 404 });
    await files.draft(project, owner, "PROJECT_TO_LECTURER", { message: "Personal private draft", mentorRole: "PRIMARY", attachmentIds: [file.id], expectedVersion: 0 });
    await expect(files.draft(project, lecturers[1], "PROJECT_TO_LECTURER")).rejects.toMatchObject({ statusCode: 403 });
    await send(0, "PRIMARY", { attachmentIds: [file.id] });
    expect((await files.file(file.id, lecturers[0])).id).toBe(file.id);
    await expect(files.file(file.id, lecturers[1])).rejects.toMatchObject({ statusCode: 404 });
    await expect(access.workspace(project, lecturers[0])).rejects.toMatchObject({ statusCode: 404 });
  });
  it("enforces database candidate limit, reserved role and unique accepted-role constraints", async () => {
    for (let i = 0; i < 4; i++) await add(i);
    const p = await plan.read(project, owner);
    await expect(db.mentorCandidate.create({ data: { planId: p.id!, mentorUserId: lecturers[4], mentorRole: "PRIMARY", priority: 5 } })).rejects.toThrow();
    const a = await send();
    await expect(db.mentorshipRequest.create({ data: { projectId: project, mentorUserId: lecturers[4], requestedBy: owner, message: "Bypass", mentorRole: "PRIMARY" } })).rejects.toThrow();
    await consent.accept(project, a.id, lecturers[0]);
    await expect(db.mentorRelationship.create({ data: { projectId: project, mentorUserId: lecturers[4], sourceRequestId: a.id, mentorRole: "PRIMARY" } })).rejects.toThrow();
  });
  it.each(["expired", "cancelled", "revoked"] as const)("denies previously shared invitation attachments after %s", async state => {
    const file = await files.upload(project, owner, "PROJECT_TO_LECTURER", { buffer: Buffer.from("%PDF-1.4\n%%EOF"), mimetype: "application/pdf", originalname: "brief.pdf" });
    const a = await send(0, "PRIMARY", { attachmentIds: [file.id] });
    expect((await files.file(file.id, lecturers[0])).id).toBe(file.id);
    if (state === "expired") await db.mentorshipRequest.update({ where: { id: a.id }, data: { expiresAt: new Date(0) } });
    if (state === "cancelled") await consent.cancel(project, a.id, owner);
    if (state === "revoked") {
      const accepted = await consent.accept(project, a.id, lecturers[0]);
      await consent.end(project, accepted.relationshipId!, owner);
    }
    await expect(files.file(file.id, lecturers[0])).rejects.toMatchObject({ statusCode: 404 });
    expect((await files.file(file.id, owner)).id).toBe(file.id);
  });
  it("suppresses delayed email delivery of an obsolete invitation", async () => {
    const a = await send(); await consent.cancel(project, a.id, owner);
    const notification = await db.notification.findUniqueOrThrow({ where: { eventKey: `MENTORSHIP_REQUEST_RECEIVED:${a.id}:${lecturers[0]}` } });
    env.EMAIL_DELIVERY_MODE = "smtp";
    await deliverMentorshipEmail(notification.id);
    expect(authMailService.sendMentorship).not.toHaveBeenCalled();
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).emailStatus).toBe("SKIPPED");
  });
  it("blocks restart while valid invitations are pending and rejects auto-send inputs", async () => {
    await send(); await expect(change({ action: "restart" })).rejects.toMatchObject({ statusCode: 409 });
    expect(mentorPlanCommandSchema.safeParse({ action: "configure", expectedVersion: 1, parallelInvitations: true, autoSend: true }).success).toBe(false);
    expect(mentorPlanCommandSchema.safeParse({ action: "move", expectedVersion: 1, candidateId: crypto.randomUUID(), offset: 2 }).success).toBe(false);
  });
  it("migrates legacy competing invitations and accepted roles without rewriting dates, status or content", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const schema = `mentor_migration_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      await client.query("BEGIN");
      // Test-generated identifier; no external input enters the DDL.
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}", public`);
      await client.query(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE projects(id uuid PRIMARY KEY);
        CREATE TABLE mentorship_requests(id uuid PRIMARY KEY, project_id uuid, mentor_user_id uuid, requested_by uuid, direction text, mentor_role text, message text, status text, expires_at timestamptz);
        CREATE TABLE mentor_relationships(id uuid PRIMARY KEY, project_id uuid, mentor_user_id uuid, source_request_id uuid, mentor_role text, status text);`);
      const pid = crypto.randomUUID(), uid = crypto.randomUUID();
      await client.query("INSERT INTO users VALUES ($1);", [uid]);
      await client.query("INSERT INTO projects VALUES ($1);", [pid]);
      for (const role of ["PRIMARY", "PRIMARY", "SECONDARY"]) {
        const rid = crypto.randomUUID();
        await client.query("INSERT INTO mentorship_requests VALUES ($1,$2,$3,$3,'PROJECT_TO_LECTURER',$4,$5,$6,'2026-11-07T00:00:00Z')", [rid, pid, uid, role, "Lời nhắn gốc không được đổi", role === "SECONDARY" ? "ACCEPTED" : "PENDING"]);
        if (role === "SECONDARY") await client.query("INSERT INTO mentor_relationships VALUES ($1,$2,$3,$4,'SECONDARY','ACTIVE')", [crypto.randomUUID(), pid, uid, rid]);
      }
      const before = await client.query("SELECT id,message,status,expires_at,mentor_role FROM mentorship_requests ORDER BY id");
      const relationships = await client.query("SELECT * FROM mentor_relationships ORDER BY id");
      const sql = readFileSync(new URL("../../../../prisma/migrations/20261031220000_mentor_recruitment_plan/migration.sql", import.meta.url), "utf8").replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, "");
      await client.query(sql);
      expect((await client.query("SELECT id,message,status,expires_at,mentor_role FROM mentorship_requests ORDER BY id")).rows).toEqual(before.rows);
      expect((await client.query("SELECT * FROM mentor_relationships ORDER BY id")).rows).toEqual(relationships.rows);
      expect((await client.query("SELECT reservation_enforced,invitation_snapshot FROM mentorship_requests")).rows.every(r => r.reservation_enforced === false && r.invitation_snapshot === null)).toBe(true);
      await client.query("SAVEPOINT competing");
      await expect(client.query("INSERT INTO mentorship_requests(id,project_id,mentor_user_id,requested_by,mentor_role,status) VALUES ($1,$2,$3,$3,'PRIMARY','PENDING')", [crypto.randomUUID(), pid, uid])).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT competing");
      expect((await client.query("SELECT count(*)::int AS n FROM mentorship_requests WHERE status='PENDING'")).rows[0].n).toBe(2);
    } finally { await client.query("ROLLBACK"); await client.end(); }
  });
});
