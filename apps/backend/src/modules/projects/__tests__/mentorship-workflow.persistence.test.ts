import { createProjectFixture } from "../../../test-utils/project-fixture.js";
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
import { mentorshipContentService as content } from "../mentorship-content.service.js";
import { mentorshipPolicy } from "../mentorship-positions.js";
import sharp from "sharp";
import { zipSync, strToU8 } from "fflate";
import { newCreatedAcademicData, removeCreatedAcademicData } from "./academic-test-data.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../auth/auth-mail.service.js", async importOriginal => ({ ...await importOriginal<typeof import("../../auth/auth-mail.service.js")>(), authMailService: { sendMentorship: vi.fn().mockResolvedValue(true) } }));

const enabled = process.env.MENTORSHIP_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated _test database");

describe.skipIf(!enabled).sequential("complete mentorship consent, access and delivery (PostgreSQL)", () => {
  const db = getPrisma();
  const created = newCreatedAcademicData();
  let owner: string, mentor: string, second: string, member: string, unverified: string, project: string, prefix: string;
  async function user(role: string, verified = false) {
    const u = await db.user.create({ data: { fullName: `${prefix}-${crypto.randomUUID().slice(0, 6)}`, email: `${crypto.randomUUID()}@mentor-test.invalid`, institution: prefix, emailVerifiedAt: new Date(), researchInterests: ["LLM Evaluation"] } });
    await db.academicProfile.create({ data: { userId: u.id, academicRole: role, primaryPosition: role === "LECTURER" ? "LECTURER" : "STUDENT", positionTitle: role === "LECTURER" ? "Senior Lecturer" : "Student", roleVerificationStatus: verified ? "VERIFIED" : "SELF_DECLARED", positionStatus: verified ? "VERIFIED" : "NOT_SUBMITTED", expertiseAreas: ["Software Engineering"] } });
    created.userIds.push(u.id);
    return u.id;
  }
  const invite = (lecturer = mentor, key?: string) => service.request(project, owner, { mentorUserId: lecturer, message: "Please guide our evaluation methodology", idempotencyKey: key });
  const seeking = () => service.settings(project, owner, { discovery: "SEEKING_MENTOR", summary: "We seek guidance on study design", expertise: ["Software Engineering", "LLM Evaluation"], researchAreas: ["Software Engineering"], mentoringNeeds: "Help with experimental design and evaluation" });
  beforeEach(async () => {
    vi.mocked(notificationQueue.add).mockReset().mockResolvedValue({} as never);
    vi.mocked(authMailService.sendMentorship).mockReset().mockResolvedValue(true);
    env.EMAIL_DELIVERY_MODE = "disabled";
    prefix = `mentorship-${crypto.randomUUID().slice(0, 8)}`;
    owner = await user("STUDENT"); mentor = await user("LECTURER", true); second = await user("LECTURER", true); member = await user("RESEARCHER"); unverified = await user("LECTURER");
    project = (await createProjectFixture({ data: { ownerId: owner, title: prefix, description: "PRIVATE-RESEARCH-NOTES", researchField: "Software Engineering", visibility: "PRIVATE" } })).id;
    await db.projectMember.create({ data: { projectId: project, userId: member } });
    await service.preferences(mentor, { acceptingMentorships: true }); await service.preferences(second, { acceptingMentorships: true });
  });
  afterAll(async () => {
    await removeCreatedAcademicData(created);
    await disconnectPostgres();
  });

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
    const otherProject = (await createProjectFixture({ data: { ownerId: owner, title: "Another project" } })).id;
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
  it("owner saves mentor needs with discovery closed and configured fields drive ranking instead of the original project field", async () => {
    await db.academicProfile.update({ where: { userId: mentor }, data: { expertiseAreas: ["Bioinformatics"] } });
    const initial = await service.settings(project, owner);
    const input = { discovery: "CLOSED" as const, summary: "We compare methods for analyzing biological research data.", researchAreas: ["Bioinformatics"], expertise: ["Study design"], mentoringNeeds: "Weekly feedback on evaluation methods", expectedVersion: initial.version };
    const saved = await service.settings(project, owner, input);
    expect(saved).toMatchObject({ discovery: "CLOSED", summary: input.summary, researchAreas: input.researchAreas, expertise: input.expertise, mentoringNeeds: input.mentoringNeeds, version: initial.version + 1 });
    const ranked = await service.mentors(project, owner, { q: prefix });
    expect(ranked.items[0]._id).toBe(mentor);
    expect(ranked.items[0].matchedTerms).toEqual(["Bioinformatics"]);
    expect((await db.project.findUniqueOrThrow({ where: { id: project } })).visibility).toBe("PRIVATE");
    expect((await service.discovery(second, { q: prefix })).items).toEqual([]);
    await expect(service.settings(project, member, input)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.settings(project, owner, input)).rejects.toMatchObject({ statusCode: 409 });
    await service.settings(project, owner, { ...input, researchAreas: ["Software Engineering"], expectedVersion: saved.version });
    const updated = await service.mentors(project, member, { q: prefix });
    expect(updated.items[0]._id).toBe(second);
    expect(updated.items[0].matchedTerms).toEqual(["Software Engineering"]);
  });
  it("invitation includes saved project details and previews exactly the sender fields visible to the lecturer", async () => {
    const saved = await service.settings(project, owner, { discovery: "CLOSED", summary: "A safe introduction to our research project", researchAreas: ["Software Engineering"], expertise: ["LLM Evaluation"], mentoringNeeds: "Help evaluate results and discuss study design" });
    expect(saved.invitationSender).toMatchObject({ _id: owner, academicRole: "STUDENT", institutionName: prefix });
    await db.academicProfile.update({ where: { userId: owner }, data: { profileVisibility: "PRIVATE", institutionalEmail: "secret-sender@institution.invalid", verificationNote: "PRIVATE-OWNER-NOTE" } });
    const preview = await service.settings(project, owner);
    expect(preview.invitationSender).toMatchObject({ _id: owner, institutionName: undefined, academicRole: undefined, positionTitle: undefined });
    await invite();
    const incoming = (await service.mine(mentor, { view: "incoming" })).requests.find(r => r.projectId === project)!;
    expect(incoming.requestedBy).toEqual(preview.invitationSender);
    expect(incoming.project).toMatchObject({ summary: saved.summary, researchAreas: saved.researchAreas, expertise: saved.expertise, mentoringNeeds: saved.mentoringNeeds });
    expect(JSON.stringify(incoming)).not.toMatch(/PRIVATE-RESEARCH-NOTES|secret-sender|PRIVATE-OWNER-NOTE|institutionalEmail/);
    expect(await canAccessProjectAsMentor(project, mentor)).toBe(false);
  });
  it("members can search but only owner can invite, accept offers or manage discovery; private pending previews grant no access", async () => {
    expect((await service.mentors(project, member, { q: prefix })).items).toHaveLength(2);
    await expect(service.request(project, member, { mentorUserId: mentor, message: "Invite" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.settings(project, member, { discovery: "CLOSED", summary: "", expertise: [] })).rejects.toMatchObject({ statusCode: 403 });
    const request = await invite(); expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(0);
    expect(request.project?.summary).toBe(""); expect(JSON.stringify(request)).not.toContain("PRIVATE-RESEARCH-NOTES");
    await expect(service.workspace(project, mentor)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.list(project, member)).requests[0].actions).toEqual({ accept: false, decline: false, cancel: false, end: false, openProject: false });
    await expect(service.cancel(project, request.id, member)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("member suggestions notify only the owner, grant no access, and convert through an owner invitation", async () => {
    const outcomes = await Promise.allSettled([service.suggest(project, member, { mentorUserId: mentor, message: "Suitable methods expertise" }), service.suggest(project, member, { mentorUserId: mentor, message: "Suitable methods expertise" })]);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(0);
    expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(0);
    const suggestions = await service.suggestions(project, owner);
    expect(suggestions.items[0].suggestedBy._id).toBe(member);
    const notifications = await db.notification.findMany({ where: { targetUuid: project } });
    expect(notifications.map(n => n.userId)).toEqual([owner]); expect(notifications[0].emailStatus).toBe("SKIPPED");
    await expect(service.suggestions(project, mentor)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.workspace(project, mentor)).rejects.toMatchObject({ statusCode: 403 });
    const request = await invite();
    expect(await db.mentorSuggestion.findFirst({ where: { projectId: project } })).toMatchObject({ status: "INVITED", requestId: request.id, resolvedBy: owner });
    expect((await service.suggestions(project, member)).items).toEqual([]);
    await service.accept(project, request.id, mentor);
    expect((await service.workspace(project, mentor, "Start with a controlled study")).guidance[0].attribution).toBe("MENTOR");
    expect(await db.projectMember.count({ where: { projectId: project, userId: mentor } })).toBe(0);
  });
  it("suggestions require active membership and an available verified lecturer; only owner dismisses", async () => {
    await expect(service.suggest(project, second, { mentorUserId: mentor, message: "Recommend" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.suggest(project, member, { mentorUserId: unverified, message: "Recommend" })).rejects.toMatchObject({ statusCode: 403 });
    await service.preferences(mentor, { acceptingMentorships: false });
    await expect(service.suggest(project, member, { mentorUserId: mentor, message: "Recommend" })).rejects.toMatchObject({ statusCode: 409 });
    const suggestion = await service.suggest(project, member, { mentorUserId: second, message: "Recommend methods lecturer" });
    await expect(service.dismissSuggestion(project, suggestion.id, member)).rejects.toMatchObject({ statusCode: 403 });
    await service.dismissSuggestion(project, suggestion.id, owner); await service.dismissSuggestion(project, suggestion.id, owner);
    expect((await service.suggestions(project, owner)).items).toEqual([]);
    await db.projectMember.update({ where: { projectId_userId: { projectId: project, userId: member } }, data: { status: "REMOVED" } });
    for (const action of [() => service.mentors(project, member), () => service.suggestions(project, member), () => service.suggest(project, member, { mentorUserId: second, message: "Recommend" })]) await expect(action()).rejects.toMatchObject({ statusCode: 403 });
  });
  it("discovery searches and returns only owner-approved preview fields, independently of project visibility", async () => {
    await db.project.update({ where: { id: project }, data: { researchField: "PRIVATE-FIELD", researchAreas: ["PRIVATE-AREA"], publicSummary: "UNAPPROVED-PUBLIC-SUMMARY" } });
    const settings = await seeking();
    expect(settings.mentoringNeeds).toContain("experimental design");
    const found = await service.discovery(mentor, { q: prefix, area: "Software Engineering" });
    expect(found.items[0]).toMatchObject({ researchAreas: ["Software Engineering"], summary: "We seek guidance on study design", mentoringNeeds: "Help with experimental design and evaluation" });
    expect(Object.keys(found.items[0]).sort()).toEqual(["availableRoles", "discovery", "expertise", "id", "mentoringNeeds", "researchAreas", "researchField", "stage", "summary", "title"].sort());
    expect(JSON.stringify(found)).not.toMatch(/PRIVATE-|UNAPPROVED|version|ownerId|visibility|papers|manuscripts|discussions/);
    expect((await service.discovery(mentor, { q: "PRIVATE-FIELD" })).items).toEqual([]);
    expect((await service.discovery(mentor, { area: "PRIVATE-AREA" })).items).toEqual([]);
    await service.settings(project, owner, { discovery: "CLOSED", summary: settings.summary, expertise: settings.expertise });
    expect((await service.discovery(mentor, { q: prefix })).items).toEqual([]);
    await expect(service.offer(project, mentor, { message: "Guide" })).rejects.toMatchObject({ statusCode: 403 });
    expect((await db.project.findUniqueOrThrow({ where: { id: project } })).visibility).toBe("PRIVATE");
  });
  it("lecturer discovery to owner acceptance grants scoped feedback, never membership, and termination revokes it", async () => {
    await seeking();
    const preview = (await service.discovery(mentor, { q: prefix })).items[0];
    expect(preview.id).toBe(project);
    const offer = await service.offer(preview.id, mentor, { message: "I can guide the experiments", idempotencyKey: crypto.randomUUID() });
    expect((await service.mine(owner, { view: "incoming" })).requests.map(r => r.id)).toContain(offer.id);
    expect((await service.mine(mentor, { view: "outgoing" })).requests.map(r => r.id)).toContain(offer.id);
    expect((await service.mine(mentor, { view: "incoming" })).requests).toEqual([]);
    await expect(invite()).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.workspace(project, mentor)).rejects.toMatchObject({ statusCode: 403 });
    const accepted = await service.accept(project, offer.id, owner);
    expect((await service.mine(mentor, { view: "active" })).relationships[0].id).toBe(accepted.relationshipId);
    expect((await service.workspace(project, mentor, "Compare multiple baselines")).context.description).toBe("PRIVATE-RESEARCH-NOTES");
    expect(await db.projectMember.count({ where: { projectId: project, userId: mentor } })).toBe(0);
    await expect(projectService.updateProject(project, { title: "Unauthorized edit" }, mentor)).rejects.toMatchObject({ statusCode: 403 });
    await service.end(project, accepted.relationshipId!, owner);
    await expect(service.workspace(project, mentor, "No longer allowed")).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.mine(mentor, { view: "history" })).relationships[0].status).toBe("ENDED");
    expect(await db.notification.count({ where: { targetUuid: project, type: "MENTORSHIP_OFFER_RECEIVED", userId: owner } })).toBe(1);
    expect(await db.notification.count({ where: { targetUuid: project, type: "MENTORSHIP_OFFER_ACCEPTED", userId: mentor } })).toBe(1);
  });
  it.each([
    { isActive: false },
    { accountStatus: "SUSPENDED" },
    { emailVerifiedAt: null },
  ])("rejects direct offers when the project owner's account is no longer eligible: %j", async changes => {
    await seeking();
    expect((await service.discovery(mentor, { q: prefix })).items.map(p => p.id)).toContain(project);
    await db.user.update({ where: { id: owner }, data: changes });
    expect((await service.discovery(mentor, { q: prefix })).items).toEqual([]);
    await expect(service.offer(project, mentor, { message: "Offer sent after discovery eligibility changed" })).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(0);
    expect(await db.notification.count({ where: { targetUuid: project } })).toBe(0);
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
    const closed = await db.mentorshipRequest.findFirstOrThrow({ where: { projectId: project, status: "CLOSED_CAPACITY_REACHED" } });
    expect(closed.closeReason).toBe("MENTOR_POSITION_FILLED");
    await expect(invite(await user("LECTURER", true))).rejects.toMatchObject({ statusCode: 409 });
  });
  it("enforces bounded pending invitations and required message schemas", async () => {
    for (let i = 0; i < mentorshipPolicy.maxPendingPerRole; i++) {
      const id = i === 0 ? mentor : await user("LECTURER", true); await service.preferences(id, { acceptingMentorships: true }); await invite(id);
    }
    await expect(invite(second)).rejects.toMatchObject({ statusCode: 409 });
    expect(requestMentorshipSchema.safeParse({ mentorUserId: mentor, message: " " }).success).toBe(false);
    expect(requestMentorshipSchema.safeParse({ mentorUserId: mentor, message: "Help", status: "ACCEPTED" }).success).toBe(false);
  });
  it("assigns primary before secondary, preserves separate roles and reopens only the ended position", async () => {
    expect((await service.list(project, owner)).positions?.SECONDARY.status).toBe("LOCKED");
    await expect(service.request(project, owner, { mentorUserId: second, mentorRole: "SECONDARY", message: "Complementary methods" })).rejects.toMatchObject({ statusCode: 409 });
    const first = await invite(); await service.accept(project, first.id, mentor);
    expect((await service.list(project, owner)).positions?.SECONDARY.status).toBe("VACANT");
    const secondary = await service.request(project, owner, { mentorUserId: second, mentorRole: "SECONDARY", message: "Complementary methods" });
    await service.accept(project, secondary.id, second);
    const list = await service.list(project, owner);
    expect(list.relationships.map(r => r.mentorRole).sort()).toEqual(["PRIMARY", "SECONDARY"]);
    expect(list.counts.active).toBe(2); expect(list.policy.maxActiveMentors).toBe(2);
    expect(await db.projectMember.count({ where: { projectId: project, userId: { in: [mentor, second] } } })).toBe(0);
    const primary = list.relationships.find(r => r.mentorRole === "PRIMARY")!;
    await expect(service.end(project, primary.id, member)).rejects.toMatchObject({ statusCode: 403 });
    await service.end(project, primary.id, owner, "Replacing mentor");
    expect((await service.list(project, owner)).positions?.PRIMARY.status).toBe("VACANT");
    expect((await db.mentorRelationship.findUniqueOrThrow({ where: { id: list.relationships.find(r => r.mentorRole === "SECONDARY")!.id } })).mentorRole).toBe("SECONDARY");
    expect(await canAccessProjectAsMentor(project, mentor)).toBe(false);
    expect(await canAccessProjectAsMentor(project, second)).toBe(true);
    const replacement = await user("LECTURER", true); await service.preferences(replacement, { acceptingMentorships: true });
    const request = await invite(replacement); await service.accept(project, request.id, replacement);
    expect((await service.list(project, owner)).positions?.PRIMARY.status).toBe("ASSIGNED");
    expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(3);
  });
  it("locks pending secondary invitations when the primary leaves without misreporting cancellation", async () => {
    const first = await invite(); await service.accept(project, first.id, mentor);
    const secondary = await service.request(project, owner, { mentorUserId: second, mentorRole: "SECONDARY", message: "Methods guidance" });
    const primary = (await service.list(project, owner)).relationships.find(r => r.mentorRole === "PRIMARY")!;
    await service.end(project, primary.id, mentor, "Unavailable");
    expect((await service.list(project, owner)).positions?.SECONDARY.status).toBe("LOCKED");
    await expect(service.accept(project, secondary.id, second)).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.mentorshipRequest.findUniqueOrThrow({ where: { id: secondary.id } })).status).toBe("PENDING");
  });
  it("serializes competing secondary acceptance and notifies losers without recording rejection", async () => {
    const first = await invite(); await service.accept(project, first.id, mentor);
    const third = await user("LECTURER", true); await service.preferences(third, { acceptingMentorships: true });
    const a = await service.request(project, owner, { mentorUserId: second, mentorRole: "SECONDARY", message: "Methods" });
    const b = await service.request(project, owner, { mentorUserId: third, mentorRole: "SECONDARY", message: "Methods" });
    const results = await Promise.allSettled([service.accept(project, a.id, second), service.accept(project, b.id, third)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.mentorRelationship.count({ where: { projectId: project, mentorRole: "SECONDARY", status: "ACTIVE" } })).toBe(1);
    expect(await db.mentorshipRequest.count({ where: { projectId: project, mentorRole: "SECONDARY", status: "CLOSED_CAPACITY_REACHED" } })).toBe(1);
    expect(await db.notification.count({ where: { targetUuid: project, type: "MENTORSHIP_POSITION_FILLED" } })).toBeGreaterThan(0);
    const closed = await db.mentorshipRequest.findFirstOrThrow({ where: { projectId: project, status: "CLOSED_CAPACITY_REACHED" } });
    await expect(service.accept(project, closed.id, closed.mentorUserId)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("database guards prevent bypassing role uniqueness and secondary prerequisites", async () => {
    const invalid = await db.mentorshipRequest.create({ data: { projectId: project, mentorUserId: second, requestedBy: owner, mentorRole: "SECONDARY", status: "ACCEPTED" } });
    await expect(db.mentorRelationship.create({ data: { projectId: project, mentorUserId: second, sourceRequestId: invalid.id, mentorRole: "SECONDARY" } })).rejects.toThrow();
    const first = await invite(); await service.accept(project, first.id, mentor);
    const duplicate = await db.mentorshipRequest.create({ data: { projectId: project, mentorUserId: second, requestedBy: owner, status: "ACCEPTED" } });
    await expect(db.mentorRelationship.create({ data: { projectId: project, mentorUserId: second, sourceRequestId: duplicate.id } })).rejects.toThrow();
    expect(await db.mentorRelationship.count({ where: { projectId: project, status: "ACTIVE" } })).toBe(1);
  });
  it("uses seven-day requests, preserves explicit owner cancellation and expiry history", async () => {
    const request = await invite();
    expect(new Date(request.expiresAt!).getTime() - new Date(request.createdAt).getTime()).toBeCloseTo(7 * 86400000, -3);
    const cancelled = await service.cancel(project, request.id, owner);
    expect(cancelled.status).toBe("CANCELED_BY_PROJECT");
    const other = await invite(second);
    await db.mentorshipRequest.update({ where: { id: other.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await service.expireRequests();
    expect((await db.mentorshipRequest.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("EXPIRED");
    expect((await service.list(project, owner)).positions?.PRIMARY.status).toBe("VACANT");
  });
  it("expires overdue competitors instead of reporting their positions as filled", async () => {
    const overdue = await invite(), valid = await invite(second);
    await db.mentorshipRequest.update({ where: { id: overdue.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await service.accept(project, valid.id, second);
    expect((await db.mentorshipRequest.findUniqueOrThrow({ where: { id: overdue.id } })).status).toBe("EXPIRED");
  });
  const pdfFile = () => ({ buffer: Buffer.from("%PDF-1.4\nInvitation only\n%%EOF"), mimetype: "application/pdf", originalname: "../../brief.pdf" });
  it("stores private reusable drafts and files without sharing them until an invitation is sent", async () => {
    const file = await content.upload(project, owner, "PROJECT_TO_LECTURER", pdfFile());
    expect(file.fileName).toBe("brief.pdf");
    expect(await content.upload(project, owner, "PROJECT_TO_LECTURER", pdfFile())).toEqual(file);
    const saved = await content.draft(project, owner, "PROJECT_TO_LECTURER", { message: "Reusable project invitation", mentorRole: "PRIMARY", attachmentIds: [file.id], expectedVersion: 0 });
    expect(saved.version).toBe(1);
    expect((await content.draft(project, owner, "PROJECT_TO_LECTURER")).attachments).toEqual([file]);
    await expect(content.draft(project, member, "PROJECT_TO_LECTURER")).rejects.toMatchObject({ statusCode: 403 });
    await expect(content.file(file.id, mentor)).rejects.toMatchObject({ statusCode: 404 });
    const request = await service.request(project, owner, { mentorUserId: mentor, message: saved.message, attachmentIds: [file.id] });
    expect(request.attachments).toEqual([file]);
    expect(Buffer.from((await content.file(file.id, mentor)).content)).toEqual(pdfFile().buffer);
    await expect(content.file(file.id, second)).rejects.toMatchObject({ statusCode: 404 });
    await expect(content.file(file.id, member)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.workspace(project, mentor)).rejects.toMatchObject({ statusCode: 403 });
    await content.draft(project, owner, "PROJECT_TO_LECTURER", { message: "New template", mentorRole: "PRIMARY", attachmentIds: [], expectedVersion: 1 });
    expect((await service.list(project, mentor)).requests[0]).toMatchObject({ message: "Reusable project invitation", attachments: [file] });
    expect(JSON.stringify(await service.list(project, mentor))).not.toMatch(/sha256|content|passwordHash/);
  });
  it("prevents draft lost updates and cross-project or stolen attachment references", async () => {
    const input = { message: "Draft", mentorRole: "PRIMARY" as const, attachmentIds: [], expectedVersion: 0 };
    const saves = await Promise.allSettled([content.draft(project, owner, "PROJECT_TO_LECTURER", input), content.draft(project, owner, "PROJECT_TO_LECTURER", input)]);
    expect(saves.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const other = (await createProjectFixture({ data: { ownerId: owner, title: "Another private project" } })).id;
    const file = await content.upload(other, owner, "PROJECT_TO_LECTURER", pdfFile());
    await expect(service.request(project, owner, { mentorUserId: mentor, message: "Private file", attachmentIds: [file.id] })).rejects.toMatchObject({ statusCode: 403 });
    await expect(content.upload(project, member, "PROJECT_TO_LECTURER", pdfFile())).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(0);
  });
  it("validates real image/document bytes and allows a file-only invitation with exact retry semantics", async () => {
    await expect(content.upload(project, owner, "PROJECT_TO_LECTURER", { ...pdfFile(), buffer: Buffer.from("not a PDF") })).rejects.toMatchObject({ statusCode: 400 });
    await expect(content.upload(project, owner, "PROJECT_TO_LECTURER", { ...pdfFile(), mimetype: "image/png" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(content.upload(project, owner, "PROJECT_TO_LECTURER", { ...pdfFile(), mimetype: "image/svg+xml" })).rejects.toMatchObject({ statusCode: 400 });
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#1e40af" } }).png().toBuffer();
    const image = await content.upload(project, owner, "PROJECT_TO_LECTURER", { buffer: png, mimetype: "image/png", originalname: "diagram.png" });
    const docx = await content.upload(project, owner, "PROJECT_TO_LECTURER", { buffer: Buffer.from(zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8("<document/>") })), mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", originalname: "proposal.docx" });
    expect(docx.mimeType).toContain("wordprocessingml");
    const key = crypto.randomUUID(), input = { mentorUserId: mentor, message: "", attachmentIds: [image.id], idempotencyKey: key };
    expect(requestMentorshipSchema.safeParse(input).success).toBe(true);
    const request = await service.request(project, owner, input);
    expect((await service.request(project, owner, input)).id).toBe(request.id);
    await expect(service.request(project, owner, { ...input, attachmentIds: [docx.id] })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("lecturer offers reuse a private draft and expose only explicitly attached files", async () => {
    await seeking();
    const file = await content.upload(project, mentor, "LECTURER_TO_PROJECT", pdfFile());
    await content.draft(project, mentor, "LECTURER_TO_PROJECT", { message: "My mentoring approach", mentorRole: "PRIMARY", attachmentIds: [file.id], expectedVersion: 0 });
    expect((await content.draft(project, second, "LECTURER_TO_PROJECT")).message).toBe("");
    await expect(content.file(file.id, owner)).rejects.toMatchObject({ statusCode: 404 });
    const offer = await service.offer(project, mentor, { message: "My mentoring approach", attachmentIds: [file.id] });
    expect((await service.list(project, owner)).requests[0].attachments).toEqual([file]);
    expect((await content.file(file.id, owner)).fileName).toBe("brief.pdf");
    await service.accept(project, offer.id, owner);
    expect(await canAccessProjectAsMentor(project, mentor)).toBe(true);
  });
  it("accept/cancel and offer accept/withdraw races yield a single consistent outcome", async () => {
    const request = await invite(); const outcomes = await Promise.allSettled([service.accept(project, request.id, mentor), service.cancel(project, request.id, owner)]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const live = await db.mentorshipRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(await db.mentorRelationship.count({ where: { sourceRequestId: request.id } })).toBe(live.status === "ACCEPTED" ? 1 : 0);
    const other = (await createProjectFixture({ data: { ownerId: owner, title: "Offered project", mentorshipDiscovery: "SEEKING_MENTOR", mentorshipSummary: "Safe study design preview" } })).id;
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
  it.each(["decline", "cancel"] as const)("mentor search excludes %s cooldowns and restores eligibility after the cooldown", async action => {
    const request = await invite();
    if (action === "decline") await service.decline(project, request.id, mentor);
    else await service.cancel(project, request.id, owner);
    expect((await service.mentors(project, owner, { q: prefix })).items.some(item => item._id === mentor)).toBe(false);
    expect((await service.mentors(project, member, { q: prefix })).items.some(item => item._id === mentor)).toBe(false);
    await db.mentorshipRequest.update({ where: { id: request.id }, data: { respondedAt: new Date(Date.now() - (env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS + 1) * 3600000) } });
    expect((await service.mentors(project, owner, { q: prefix })).items.some(item => item._id === mentor)).toBe(true);
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
    const request = await invite(); await projectService.transferOwnership(project, member, owner);
    await expect(service.accept(project, request.id, mentor)).rejects.toMatchObject({ statusCode: 409 });
    await projectService.transferOwnership(project, owner, member);
    await db.academicProfile.update({ where: { userId: mentor }, data: { positionStatus: "INVALIDATED" } });
    await expect(service.accept(project, request.id, mentor)).rejects.toMatchObject({ statusCode: 403 });
    await db.academicProfile.update({ where: { userId: mentor }, data: { positionStatus: "VERIFIED" } });
    for (const status of ["ARCHIVED", "COMPLETED"]) { await db.project.update({ where: { id: project }, data: { status } }); await expect(service.accept(project, request.id, mentor)).rejects.toMatchObject({ statusCode: 409 }); }
  });
  it("only explicitly seeking projects are discoverable; private preview stays safe and paginated", async () => {
    await seeking(); const secondProject = (await createProjectFixture({ data: { title: `${prefix}-second`, ownerId: owner, visibility: "PUBLIC_SUMMARY" } })).id;
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
    const unrelated = (await createProjectFixture({ data: { ownerId: member, title: "Unrelated" } })).id;
    await expect(service.accept(unrelated, request.id, member)).rejects.toMatchObject({ statusCode: 404 });
    await db.projectMember.create({ data: { projectId: project, userId: second } });
    await expect(invite(second)).rejects.toMatchObject({ statusCode: 409 });
    const accepted = await service.accept(project, request.id, mentor);
    await expect(service.end(project, accepted.relationshipId!, member)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("mentor reads useful scoped context and attributable guidance while all writes remain denied", async () => {
    const request = await invite(); await service.accept(project, request.id, mentor);
    const paper = await db.paper.create({ data: { title: "Study method", publicationYear: 2026, primaryProvider: "user", paperStatus: "downloaded", dataStatus: "active", abstractText: "Our study abstract" } });
    created.paperIds.push(paper.id);
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
    const unrelated = (await createProjectFixture({ data: { ownerId: member, title: "Unrelated" } })).id;
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
  it("preserves mentorship consent and relationship history by requiring archive instead of deletion", async () => {
    const request = await invite(); await service.accept(project, request.id, mentor);
    await expect(projectService.deleteProject(project, owner)).rejects.toMatchObject({ statusCode: 409 });
    await projectService.archiveProject(project, owner);
    expect(await db.mentorRelationship.count({ where: { projectId: project } })).toBe(1); expect(await db.mentorshipRequest.count({ where: { projectId: project } })).toBe(1);
  });
});
