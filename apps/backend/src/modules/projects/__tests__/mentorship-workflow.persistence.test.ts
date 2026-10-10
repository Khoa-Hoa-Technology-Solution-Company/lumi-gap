import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import * as database from "../../../infrastructure/database/prisma.js";
import { projectMentorshipService as service } from "../project-mentorship.service.js";
import { canAccessProjectAsMentor } from "../academic-relationship-access.js";
import { academicProfileService } from "../../academic-profiles/academic-profile.service.js";
import { projectService } from "../project.service.js";
import { reviewService } from "../../reviews/review.service.js";
import { env } from "../../../config/env.js";
import { notificationQueue } from "../../../infrastructure/queue.js";
import { authMailService } from "../../auth/auth-mail.service.js";
import { buildMentorshipMail, deliverMentorshipEmail } from "../mentorship-mail.service.js";
import { requestMentorshipSchema } from "../project-mentorship.controller.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../auth/auth-mail.service.js", async importOriginal => ({ ...await importOriginal<typeof import("../../auth/auth-mail.service.js")>(), authMailService: { sendMentorship: vi.fn().mockResolvedValue(true) } }));

describe.skipIf(process.env.MENTORSHIP_INTEGRATION !== "1").sequential("complete mentorship consent, access and delivery (PostgreSQL)", () => {
  const db = getPrisma();
  let owner: string, mentor: string, second: string, member: string, unverified: string, project: string, prefix: string;
  async function user(role: string, verified = false) {
    const u = await db.user.create({ data: { fullName: `${prefix}-${crypto.randomUUID().slice(0, 6)}`, email: `${crypto.randomUUID()}@mentor-test.invalid`, institution: prefix, emailVerifiedAt: new Date(), researchInterests: ["LLM Evaluation"] } });
    await db.academicProfile.create({ data: { userId: u.id, academicRole: role, primaryPosition: role === "LECTURER" ? "LECTURER" : "STUDENT", positionTitle: role === "LECTURER" ? "Senior Lecturer" : "Student", roleVerificationStatus: verified ? "VERIFIED" : "SELF_DECLARED", positionStatus: verified ? "VERIFIED" : "NOT_SUBMITTED", expertiseAreas: ["Software Engineering"] } });
    return u.id;
  }
  const invite = (lecturer = mentor, key?: string) => service.request(project, owner, { mentorUserId: lecturer, message: "Please guide our evaluation methodology", idempotencyKey: key });
  const seeking = () => service.settings(project, owner, { discovery: "SEEKING_MENTOR", summary: "We seek guidance on study design", expertise: ["Software Engineering", "LLM Evaluation"] });
  beforeEach(async () => {
    vi.mocked(notificationQueue.add).mockReset().mockResolvedValue({} as never);
    vi.mocked(authMailService.sendMentorship).mockReset().mockResolvedValue(true);
    env.EMAIL_DELIVERY_MODE = "disabled";
    prefix = `mentorship-${crypto.randomUUID().slice(0, 8)}`;
    owner = await user("STUDENT"); mentor = await user("LECTURER", true); second = await user("LECTURER", true); member = await user("RESEARCHER"); unverified = await user("LECTURER");
    project = (await db.project.create({ data: { ownerId: owner, title: prefix, description: "PRIVATE-RESEARCH-NOTES", researchField: "Software Engineering", visibility: "PRIVATE" } })).id;
    await db.projectMember.create({ data: { projectId: project, userId: member } });
    await service.preferences(mentor, { acceptingMentorships: true }); await service.preferences(second, { acceptingMentorships: true });
  });
  afterAll(disconnectPostgres);

  it("defaults availability OFF and allows only live verified Lecturers to enable mentoring", async () => {
    const fresh = await user("LECTURER", true);
    expect((await service.preferences(fresh)).acceptingMentorships).toBe(false);
    for (const id of [owner, member, unverified]) await expect(service.preferences(id, { acceptingMentorships: true })).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.preferences(fresh, { acceptingMentorships: true })).canEnable).toBe(true);
    await expect(academicProfileService.updateMine(unverified, { supportAvailability: { enabled: true, types: [], preferredTopics: [] } })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("turning OFF blocks invites, offers and default discovery but preserves pending consent", async () => {
    await seeking(); const request = await invite();
    await service.preferences(mentor, { acceptingMentorships: false });
    await expect(service.offer(project, mentor, { message: "I can help" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.discovery(mentor)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.mentors(project, owner, { q: prefix })).items.some(m => m._id === mentor)).toBe(false);
    const otherProject = (await db.project.create({ data: { ownerId: owner, title: "Another project" } })).id;
    await expect(service.request(otherProject, owner, { mentorUserId: mentor, message: "Please help" })).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.list(project, mentor)).requests[0].status).toBe("PENDING");
    await service.accept(project, request.id, mentor);
    expect(await canAccessProjectAsMentor(project, mentor)).toBe(true);
    expect((await service.workspace(project, mentor)).accessRole).toBe("MENTOR");
  });
  it("changing a general support profile to Lecturer requires a fresh explicit mentoring opt-in", async () => {
    await academicProfileService.updateMine(owner, { supportAvailability: { enabled: true, types: [], preferredTopics: [] } });
    await academicProfileService.updateMine(owner, { academicRole: "LECTURER" });
    const profile = await db.academicProfile.findUniqueOrThrow({ where: { userId: owner } });
    expect(profile.supportAvailability).toMatchObject({ enabled: false });
    await db.academicProfile.update({ where: { userId: owner }, data: { roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED" } });
    expect((await service.preferences(owner)).acceptingMentorships).toBe(false);
    expect((await service.preferences(owner, { acceptingMentorships: true })).acceptingMentorships).toBe(true);
  });
  it("turning OFF leaves active relationships intact and public profile search still available", async () => {
    const request = await invite(); await service.accept(project, request.id, mentor);
    await service.preferences(mentor, { acceptingMentorships: false });
    expect((await service.list(project, mentor)).relationships[0].status).toBe("ACTIVE");
    expect((await academicProfileService.getPublic(mentor, owner)).userId).toBe(mentor);
    expect(await canAccessProjectAsMentor(project, mentor)).toBe(true);
  });
  it("search composes filters, explains overlap, paginates stably and redacts private fields", async () => {
    const q = { q: prefix, institution: prefix, area: "Software Engineering", interest: "LLM Evaluation", position: "Senior", pageSize: 1 };
    const first = await service.mentors(project, owner, q), next = await service.mentors(project, owner, { ...q, page: 2 });
    expect(first.meta.total).toBe(2); expect(next.items[0]._id).not.toBe(first.items[0]._id);
    expect((await service.mentors(project, owner, q)).items[0]._id).toBe(first.items[0]._id);
    expect(first.items[0].matchedTerms).toEqual(["Software Engineering"]);
    await db.academicProfile.update({ where: { userId: mentor }, data: { privacySettings: { expertise: "PRIVATE", researchInterests: "PRIVATE" }, institutionalEmail: "secret@institution.invalid", verificationNote: "ADMIN-PRIVATE", profileVisibility: "MEMBERS_ONLY" } });
    expect((await service.mentors(project, owner, q)).meta.total).toBe(1);
    const all = await service.mentors(project, owner, { q: prefix }); const item = all.items.find(m => m._id === mentor)!;
    expect(item.expertiseAreas).toEqual([]); expect(item.researchInterests).toEqual([]); expect(item.matchedTerms).toEqual([]);
    expect(JSON.stringify(all)).not.toMatch(/ADMIN-PRIVATE|secret@|staffId|verificationEvidence/);
    await db.academicProfile.update({ where: { userId: mentor }, data: { profileVisibility: "PRIVATE" } });
    expect((await service.mentors(project, owner, { q: prefix })).items.some(m => m._id === mentor)).toBe(false);
  });
  it("official mentor eligibility remains independent of system ADMIN role", async () => {
    await db.user.update({ where: { id: mentor }, data: { systemRole: "ADMIN", role: "admin" } });
    expect((await service.mentors(project, owner, { q: prefix })).items.some(m => m._id === mentor)).toBe(true);
    await invite();
  });
  it("only owner can search, invite, accept offers or manage discovery; private pending previews grant no access", async () => {
    await expect(service.mentors(project, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.request(project, member, { mentorUserId: mentor, message: "Invite" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.settings(project, member, { discovery: "CLOSED", summary: "", expertise: [] })).rejects.toMatchObject({ statusCode: 403 });
    const request = await invite(); expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(0);
    expect(request.project?.summary).toBe(""); expect(JSON.stringify(request)).not.toContain("PRIVATE-RESEARCH-NOTES");
    await expect(service.workspace(project, mentor)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.list(project, member)).requests[0].actions).toEqual({ accept: false, decline: false, cancel: false, end: false, openProject: false });
    await expect(service.cancel(project, request.id, member)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("retry creates one request, notification and delivery event; mismatched reuse conflicts", async () => {
    const key = crypto.randomUUID(); const results = await Promise.all([invite(mentor, key), invite(mentor, key)]);
    expect(results[0].id).toBe(results[1].id);
    expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(1);
    expect(await db.notification.count({ where: { targetUuid: project } })).toBe(1);
    await expect(service.request(project, owner, { mentorUserId: mentor, message: "Different message", idempotencyKey: key })).rejects.toMatchObject({ statusCode: 409 });
    await expect(invite()).rejects.toMatchObject({ statusCode: 409 });
  });
  it("acceptance creates exactly one separate ACTIVE relationship and never a ProjectMember", async () => {
    const request = await invite(); await Promise.all([service.accept(project, request.id, mentor), service.accept(project, request.id, mentor)]);
    const relationship = await db.mentorRelationship.findFirstOrThrow({ where: { sourceRequestId: request.id } });
    expect(relationship.status).toBe("ACTIVE"); expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(1);
    expect(await db.projectMember.count({ where: { projectId: project, userId: mentor } })).toBe(0);
    expect(await db.notification.count({ where: { targetUuid: project, type: "MENTORSHIP_REQUEST_ACCEPTED" } })).toBe(1);
  });
  it("simultaneous team invitation and lecturer offer create only one pending consent record", async () => {
    await seeking();
    const outcomes = await Promise.allSettled([invite(), service.offer(project, mentor, { message: "I can guide this research" })]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 409 });
    expect(await db.mentorshipRequest.count({ where: { projectId: project, mentorUserId: mentor, status: "PENDING" } })).toBe(1);
    expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(0);
    expect(await db.projectMember.count({ where: { projectId: project, userId: mentor } })).toBe(0);
    expect(await db.notification.count({ where: { targetUuid: project } })).toBe(1);
  });
  it("two simultaneous acceptances cannot exceed capacity; competing pending requests close atomically", async () => {
    const [a, b] = await Promise.all([invite(), invite(second)]);
    const outcomes = await Promise.allSettled([service.accept(project, a.id, mentor), service.accept(project, b.id, second)]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.mentorRelationship.count({ where: { projectId: project, status: "ACTIVE" } })).toBe(1);
    const closed = await db.mentorshipRequest.findFirstOrThrow({ where: { projectId: project, status: "CANCELLED" } });
    expect(closed.closeReason).toBe("MENTOR_POSITION_FILLED");
    await expect(invite(await user("LECTURER", true))).rejects.toMatchObject({ statusCode: 409 });
  });
  it("enforces bounded pending invitations and required message schemas", async () => {
    for (let i = 0; i < env.MAX_PENDING_MENTOR_REQUESTS_PER_PROJECT; i++) {
      const id = i === 0 ? mentor : await user("LECTURER", true); await service.preferences(id, { acceptingMentorships: true }); await invite(id);
    }
    await expect(invite(second)).rejects.toMatchObject({ statusCode: 409 });
    expect(requestMentorshipSchema.safeParse({ mentorUserId: mentor, message: " " }).success).toBe(false);
    expect(requestMentorshipSchema.safeParse({ mentorUserId: mentor, message: "Help", status: "ACCEPTED" }).success).toBe(false);
  });
  it("accept/cancel and offer accept/withdraw races yield a single consistent outcome", async () => {
    const request = await invite(); const outcomes = await Promise.allSettled([service.accept(project, request.id, mentor), service.cancel(project, request.id, owner)]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const live = await db.mentorshipRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(await db.mentorRelationship.count({ where: { sourceRequestId: request.id } })).toBe(live.status === "ACCEPTED" ? 1 : 0);
    const other = (await db.project.create({ data: { ownerId: owner, title: "Offered project", mentorshipDiscovery: "SEEKING_MENTOR", mentorshipSummary: "Safe study design preview" } })).id;
    const offer = await service.offer(other, second, { message: "Offer guidance" });
    const response = await Promise.allSettled([service.accept(other, offer.id, owner), service.cancel(other, offer.id, second)]);
    expect(response.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("decline preserves availability, implements cooldown and notifies only principals", async () => {
    const request = await invite(); await service.decline(project, request.id, mentor);
    expect((await service.preferences(mentor)).acceptingMentorships).toBe(true);
    await expect(invite()).rejects.toMatchObject({ statusCode: 409 });
    const recipients = await db.notification.findMany({ where: { targetUuid: project, type: "MENTORSHIP_REQUEST_DECLINED" } });
    expect(recipients.map(n => n.userId)).toEqual([owner]);
  });
  it.each(["PROJECT_TO_LECTURER", "LECTURER_TO_PROJECT"])("%s response notes are visible only to the consent parties", async direction => {
    await seeking();
    const request = direction === "PROJECT_TO_LECTURER" ? await invite() : await service.offer(project, mentor, { message: "I can guide your methodology" });
    const privateReason = "PRIVATE-DECLINE-REASON";
    await service.decline(project, request.id, direction === "PROJECT_TO_LECTURER" ? mentor : owner, privateReason);
    for (const principal of [owner, mentor]) expect((await service.list(project, principal)).requests[0].responseNote).toBe(privateReason);
    const team = await service.list(project, member);
    expect(team.requests[0].status).toBe("DECLINED");
    expect(team.requests[0].responseNote).toBeUndefined();
    expect(JSON.stringify(team)).not.toContain(privateReason);
    expect(JSON.stringify(await projectService.listActivity(project, member, 50))).not.toContain(privateReason);
    expect(JSON.stringify(await db.notification.findMany({ where: { targetUuid: project } }))).not.toContain(privateReason);
  });
  it("keeps actionable pending requests ahead of newer history in project and personal pagination", async () => {
    const pending = await invite(), handled = await invite(second);
    await service.decline(project, handled.id, second);
    for (const collection of [await service.list(project, owner, { pageSize: 1 }), await service.mine(owner, { pageSize: 1 })]) {
      expect(collection.requests.map(r => r.id)).toEqual([pending.id]);
      expect(collection.counts.pending).toBe(1);
      expect(collection.requestMeta.totalPages).toBe(2);
    }
    expect((await service.list(project, owner, { pageSize: 1, page: 2 })).requests[0].id).toBe(handled.id);
  });
  it("expires requests with the existing worker maintenance operation", async () => {
    const request = await invite(); await db.mentorshipRequest.update({ where: { id: request.id }, data: { expiresAt: new Date(0) } });
    await service.expireRequests(); await service.expireRequests();
    expect((await db.mentorshipRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("EXPIRED");
    expect(await db.notification.count({ where: { targetUuid: project, type: "MENTORSHIP_EXPIRED" } })).toBe(1);
    await expect(service.accept(project, request.id, mentor)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("prevents acceptance after requester loses ownership, verification loss or project closure", async () => {
    const request = await invite(); await db.project.update({ where: { id: project }, data: { ownerId: member } });
    await expect(service.accept(project, request.id, mentor)).rejects.toMatchObject({ statusCode: 409 });
    await db.project.update({ where: { id: project }, data: { ownerId: owner } });
    await db.academicProfile.update({ where: { userId: mentor }, data: { positionStatus: "INVALIDATED" } });
    await expect(service.accept(project, request.id, mentor)).rejects.toMatchObject({ statusCode: 403 });
    await db.academicProfile.update({ where: { userId: mentor }, data: { positionStatus: "VERIFIED" } });
    for (const status of ["ARCHIVED", "COMPLETED"]) { await db.project.update({ where: { id: project }, data: { status } }); await expect(service.accept(project, request.id, mentor)).rejects.toMatchObject({ statusCode: 409 }); }
  });
  it("only explicitly seeking projects are discoverable; private preview stays safe and paginated", async () => {
    await seeking(); const secondProject = (await db.project.create({ data: { title: `${prefix}-second`, ownerId: owner, visibility: "PUBLIC_SUMMARY" } })).id;
    const found = await service.discovery(mentor, { q: prefix, pageSize: 1 });
    expect(found.meta.total).toBe(1); expect(found.items[0].id).toBe(project);
    expect(JSON.stringify(found)).not.toContain("PRIVATE-RESEARCH-NOTES");
    await service.settings(secondProject, owner, { discovery: "SEEKING_MENTOR", summary: "Safe second project preview", expertise: [] });
    expect((await service.discovery(mentor, { q: prefix, page: 2, pageSize: 1 })).items).toHaveLength(1);
    const offer = await service.offer(project, mentor, { message: "I can guide the study" });
    expect(offer.status).toBe("PENDING"); await expect(service.accept(project, offer.id, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.workspace(project, mentor)).rejects.toMatchObject({ statusCode: 403 });
    await service.preferences(mentor, { acceptingMentorships: false }); await service.accept(project, offer.id, owner);
    expect((await db.project.findUniqueOrThrow({ where: { id: project } })).visibility).toBe("PRIVATE");
  });
  it("rejects forged receiver, unrelated project, self/member mentorship and unrelated termination", async () => {
    const request = await invite();
    await expect(service.accept(project, request.id, second)).rejects.toMatchObject({ statusCode: 403 });
    const unrelated = (await db.project.create({ data: { ownerId: member, title: "Unrelated" } })).id;
    await expect(service.accept(unrelated, request.id, member)).rejects.toMatchObject({ statusCode: 404 });
    await db.projectMember.create({ data: { projectId: project, userId: second } });
    await expect(invite(second)).rejects.toMatchObject({ statusCode: 409 });
    const accepted = await service.accept(project, request.id, mentor);
    await expect(service.end(project, accepted.relationshipId!, member)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("mentor reads useful scoped context and attributable guidance while all writes remain denied", async () => {
    const request = await invite(); await service.accept(project, request.id, mentor);
    const paper = await db.paper.create({ data: { title: "Study method", publicationYear: 2026, primaryProvider: "user", paperStatus: "downloaded", dataStatus: "active", abstractText: "Our study abstract" } });
    await db.projectPaper.create({ data: { projectId: project, paperId: paper.id, notes: "Team evidence note" } });
    const context = await service.workspace(project, mentor, "Use a control group");
    expect(context.context.items[0].body).toContain("Team evidence note"); expect(context.guidance[0].attribution).toBe("MENTOR"); expect(context.guidance[0].author?._id).toBe(mentor);
    expect(context.guidance[0].note).toBe("Use a control group");
    const audit = await db.auditLog.findFirstOrThrow({ where: { actionName: "MENTOR_GUIDANCE", targetRecordId: context.guidance[0].id } });
    expect(audit.details).toEqual({ projectId: project, attribution: "MENTOR" });
    await expect(projectService.updateProject(project, { visibility: "PUBLIC_SUMMARY" }, mentor)).rejects.toMatchObject({ statusCode: 403 });
    await expect(projectService.deleteProject(project, mentor)).rejects.toMatchObject({ statusCode: 403 });
    await expect(projectService.removeMemberFromProject(project, member, mentor)).rejects.toMatchObject({ statusCode: 403 });
    await expect(projectService.updateProjectPaper(project, paper.id, { screeningStatus: "INCLUDED" }, mentor)).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.reviewerAssignment.count({ where: { reviewerId: mentor } })).toBe(0);
    await expect(reviewService.saveReview(project, mentor, {} as never, true)).rejects.toMatchObject({ statusCode: 404 });
    const unrelated = (await db.project.create({ data: { ownerId: member, title: "Unrelated" } })).id;
    await expect(service.workspace(unrelated, mentor)).rejects.toMatchObject({ statusCode: 403 });
  });
  it.each(["owner", "mentor"])("%s can end mentorship, immediately revoking access and preserving history", async party => {
    const request = await invite(), accepted = await service.accept(project, request.id, mentor);
    await service.workspace(project, mentor, "Preserve this guidance");
    const id = accepted.relationshipId!; await service.end(project, id, party === "owner" ? owner : mentor, "Project completed");
    await service.end(project, id, party === "owner" ? owner : mentor);
    expect(await canAccessProjectAsMentor(project, mentor)).toBe(false); await expect(service.workspace(project, mentor)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.workspace(project, owner)).guidance[0].note).toBe("Preserve this guidance");
    expect(await db.auditLog.count({ where: { actionName: "MENTORSHIP_ENDED", targetRecordId: id } })).toBe(1);
    expect(await db.notification.count({ where: { type: "MENTORSHIP_ENDED", targetUuid: project } })).toBe(1);
  });
  it("keeps termination reasons private while ordinary team members retain relationship history", async () => {
    const request = await invite(), accepted = await service.accept(project, request.id, mentor);
    await service.end(project, accepted.relationshipId!, owner, "PRIVATE-TERMINATION-REASON");
    for (const principal of [owner, mentor]) expect((await service.list(project, principal)).relationships[0].endReason).toBe("PRIVATE-TERMINATION-REASON");
    const team = await service.list(project, member);
    expect(team.relationships[0].status).toBe("ENDED");
    expect(team.relationships[0].endReason).toBeUndefined();
    expect(JSON.stringify(team)).not.toContain("PRIVATE-TERMINATION-REASON");
  });
  it("serializes termination against mentor feedback and rejects any subsequent guidance", async () => {
    const request = await invite(), accepted = await service.accept(project, request.id, mentor);
    const [ended, feedback] = await Promise.allSettled([
      service.end(project, accepted.relationshipId!, owner),
      service.workspace(project, mentor, "Guidance racing with termination"),
    ]);
    expect(ended.status).toBe("fulfilled");
    if (feedback.status === "rejected") expect(feedback.reason).toMatchObject({ statusCode: 403 });
    const history = await service.workspace(project, owner);
    expect(history.guidance).toHaveLength(feedback.status === "fulfilled" ? 1 : 0);
    if (feedback.status === "fulfilled") expect(history.guidance[0]).toMatchObject({ attribution: "MENTOR", note: "Guidance racing with termination" });
    expect(await canAccessProjectAsMentor(project, mentor)).toBe(false);
    await expect(service.workspace(project, mentor, "Too late")).rejects.toMatchObject({ statusCode: 403 });
  });
  it("revocation suspends current privileges without destroying history or preventing explicit termination", async () => {
    const request = await invite(), accepted = await service.accept(project, request.id, mentor);
    await db.academicProfile.update({ where: { userId: mentor }, data: { roleVerificationStatus: "REJECTED" } });
    expect(await canAccessProjectAsMentor(project, mentor)).toBe(false); await expect(service.workspace(project, mentor, "Not allowed")).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.list(project, mentor)).relationships[0].status).toBe("ACTIVE"); await service.end(project, accepted.relationshipId!, mentor);
  });
  it("archiving preserves relationship history and read context but prevents feedback", async () => {
    const request = await invite(); await service.accept(project, request.id, mentor); await projectService.archiveProject(project, owner);
    expect((await service.workspace(project, mentor)).canProvideFeedback).toBe(false);
    await expect(service.workspace(project, mentor, "New guidance")).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.list(project, owner)).counts.active).toBe(1);
  });
  it("queue failure cannot roll back consent or duplicate notifications on retry", async () => {
    vi.mocked(notificationQueue.add).mockRejectedValue(new Error("Redis unavailable"));
    const request = await invite(mentor, crypto.randomUUID()); const accepted = await service.accept(project, request.id, mentor);
    expect(accepted.status).toBe("ACCEPTED"); expect((await db.notification.findFirstOrThrow({ where: { targetUuid: project } })).dispatchedAt).toBeNull();
    vi.mocked(notificationQueue.add).mockResolvedValue({} as never); await service.accept(project, request.id, mentor);
    expect(await db.notification.count({ where: { targetUuid: project } })).toBe(2);
    expect(await db.notification.count({ where: { targetUuid: project, dispatchedAt: null } })).toBe(0);
  });
  it("an outbox scan failure does not report committed consent as failed and is recoverable on retry", async () => {
    // Prisma delegates are proxies. Intercept the client export without modifying the real delegate.
    const notifications = db.notification;
    const findMany = vi.fn((args: Parameters<typeof notifications.findMany>[0]) => notifications.findMany(args))
      .mockRejectedValueOnce(new Error("Outbox read temporarily unavailable"));
    const delegate = new Proxy(notifications, { get: (target, name) => name === "findMany" ? findMany : Reflect.get(target, name) });
    const client = new Proxy(db, { get: (target, name) => {
      if (name === "notification") return delegate;
      const value = Reflect.get(target, name);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const access = vi.spyOn(database, "getPrisma").mockReturnValue(client);
    const key = crypto.randomUUID();
    try {
      const request = await invite(mentor, key);
      expect(request.status).toBe("PENDING");
      expect(await db.notification.count({ where: { targetUuid: project, dispatchedAt: null } })).toBe(1);
      expect((await invite(mentor, key)).id).toBe(request.id);
      expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(1);
      expect(await db.notification.count({ where: { targetUuid: project } })).toBe(1);
      expect(await db.notification.count({ where: { targetUuid: project, dispatchedAt: null } })).toBe(0);
    } finally { access.mockRestore(); }
  });
  it("emails are claimed once, respect preference and contain only safe metadata", async () => {
    const request = await invite(); const notification = await db.notification.findFirstOrThrow({ where: { targetUuid: project, userId: mentor } });
    expect(JSON.stringify(notification.emailPayload)).not.toContain("PRIVATE-RESEARCH-NOTES");
    env.EMAIL_DELIVERY_MODE = "smtp"; await Promise.all([deliverMentorshipEmail(notification.id), deliverMentorshipEmail(notification.id)]);
    expect(authMailService.sendMentorship).toHaveBeenCalledTimes(1); expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).emailStatus).toBe("SENT");
    await service.preferences(owner, { emailEnabled: false }); await service.accept(project, request.id, mentor);
    const decision = await db.notification.findFirstOrThrow({ where: { targetUuid: project, userId: owner } }); await deliverMentorshipEmail(decision.id);
    expect(authMailService.sendMentorship).toHaveBeenCalledTimes(1); expect((await db.notification.findUniqueOrThrow({ where: { id: decision.id } })).emailStatus).toBe("SKIPPED");
  });
  it("SMTP failure preserves relationship state and prevents repeats after uncertain delivery", async () => {
    const request = await invite(); const notification = await db.notification.findFirstOrThrow({ where: { targetUuid: project } }); env.EMAIL_DELIVERY_MODE = "smtp";
    vi.mocked(authMailService.sendMentorship).mockRejectedValueOnce(Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" }));
    await expect(deliverMentorshipEmail(notification.id)).rejects.toThrow(); expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).emailStatus).toBe("PENDING");
    vi.mocked(authMailService.sendMentorship).mockRejectedValueOnce(Object.assign(new Error("Unknown delivery"), { code: "ETIMEDOUT" }));
    await deliverMentorshipEmail(notification.id); await deliverMentorshipEmail(notification.id);
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).emailStatus).toBe("UNCERTAIN"); expect(authMailService.sendMentorship).toHaveBeenCalledTimes(2);
    expect((await db.mentorshipRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("PENDING");
  });
  it("availability/discovery preference changes emit no email, and templates escape unsafe names", async () => {
    await service.preferences(mentor, { acceptingMentorships: false, locale: "vi" }); await seeking();
    expect(await db.notification.count({ where: { targetUuid: project } })).toBe(0);
    const mail = buildMentorshipMail({ event: "MENTORSHIP_OFFER_RECEIVED", projectId: project, projectTitle: '<img src=x onerror="alert(1)">', actorName: "<script>" }, "A&B", "vi", "https://lumigap.example");
    expect(mail.html).not.toContain("<script>"); expect(mail.html).not.toContain("<img src=x"); expect(mail.html).toContain("A&amp;B"); expect(mail.html).toContain('lang="vi"');
    expect(mail.text).toContain("/academic-support?projectId="); expect(mail.text).not.toMatch(/token=/);
  });
  it("explicit project deletion follows existing cascade policy without dangling consent", async () => {
    const request = await invite(); await service.accept(project, request.id, mentor); await projectService.deleteProject(project, owner);
    expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(0); expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(0);
  });
});
