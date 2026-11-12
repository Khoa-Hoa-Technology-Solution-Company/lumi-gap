import { createHash, randomUUID } from "node:crypto";
import type { MentorshipApplicationView, MentorshipApplicationDetail, MentorshipApplicationStatus } from "@trend/shared-types";
import type { MentorshipApplication, Project } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { assertAcceptingNewMentorships, isVerifiedLecturer } from "./academic-relationship-access.js";
import { dispatchMentorshipNotifications } from "./mentorship-notifications.js";
import { applicationActor, applicationProject, applicationLocks, applicationOpen, applicationEvent, applicationNotify, applicationPreview, syncApplicationRequest, type ApplicationDb } from "./mentorship-application-context.js";
import { lecturerMatchEvidence } from "./lecturer-match-evidence.js";
import { mentorshipApplicationSchema, applicationActionSchema, applicationNoteSchema, applicationPageSchema } from "./dto/mentorship-application.schema.js";

const editable = ["APPLIED", "SHORTLISTED"];
async function scoped(db: ApplicationDb, projectId: string, id: string, actorId: string) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const row = await db.mentorshipApplication.findFirst({ where: { id, projectId } });
  if (!row || (p.ownerId !== actorId && row.lecturerId !== actorId)) throw AppError.notFound("Application not found");
  return { p, row };
}
async function reconcileRequest(db: ApplicationDb, row: MentorshipApplication, ownerId: string) {
  const request = await db.mentorshipRequest.findFirst({ where: { applicationId: row.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  // Do not fabricate a persisted expiration; the existing request sweeper owns that transition.
  if (request && request.status !== "PENDING") await syncApplicationRequest(db, request, ownerId);
  return request;
}
async function present(db: ApplicationDb, row: MentorshipApplication, p: Project, actorId: string): Promise<MentorshipApplicationView> {
  const request = await reconcileRequest(db, row, p.ownerId);
  const current = await db.mentorshipApplication.findUniqueOrThrow({ where: { id: row.id } });
  const [lecturer, profile] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: row.lecturerId } }), db.academicProfile.findUnique({ where: { userId: row.lecturerId } })]);
  const verifiedLecturer = isVerifiedLecturer(lecturer, profile), open = !["ARCHIVED", "COMPLETED"].includes(p.status), canManage = actorId === p.ownerId && open;
  const expiredInvitation = request?.status === "PENDING" && Boolean(request.expiresAt && request.expiresAt <= new Date());
  return { id: row.id, projectId: publicDatabaseId(p), project: applicationPreview(p), lecturer: { id: publicDatabaseId(lecturer), name: lecturer.fullName, avatarUrl: lecturer.avatarUrl ?? undefined, verifiedLecturer },
    mentorRole: current.mentorRole as "PRIMARY" | "SECONDARY", message: current.message, areas: current.areas, methodologies: current.methodologies, capabilities: current.capabilities, availability: current.availability,
    status: current.status as MentorshipApplicationStatus, version: current.version, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString(),
    canManage, canWithdraw: open && row.lecturerId === actorId && editable.includes(current.status), canInvite: open && canManage && verifiedLecturer && editable.includes(current.status), canClarify: open && editable.includes(current.status),
    ...(request ? { invitation: { id: request.id, status: expiredInvitation ? "EXPIRED" : request.status, expiresAt: request.expiresAt?.toISOString() ?? null } } : {}) };
}
export const mentorshipApplicationsService = {
  async apply(projectInput: string, actorInput: string, raw: unknown) {
    const input = mentorshipApplicationSchema.parse(raw), db = getPrisma();
    const [p, actor] = await Promise.all([applicationProject(projectInput), applicationActor(actorInput)]);
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const result = await db.$transaction(async tx => {
      await applicationLocks(tx, p.id, [actor.id, p.ownerId]);
      await applicationActor(actor.id, tx); const live = await applicationProject(p.id, tx);
      await applicationActor(live.ownerId, tx); applicationOpen(live);
      await assertAcceptingNewMentorships(tx, actor.id);
      const previous = await tx.mentorshipApplicationEvent.findUnique({ where: { actorId_clientKey: { actorId: actor.id, clientKey: input.idempotencyKey } } });
      if (previous) {
        const application = await tx.mentorshipApplication.findUniqueOrThrow({ where: { id: previous.applicationId } });
        if (application.projectId !== p.id || previous.commandHash !== hash) throw AppError.conflict("Idempotency key was already used for a different application");
        return { id: application.id };
      }
      if (live.mentorshipDiscovery !== "SEEKING_MENTOR" || (live.mentorshipSummary?.trim().length ?? 0) < 10) throw AppError.conflict("This project is not accepting applications");
      if (live.ownerId === actor.id || await tx.projectMember.count({ where: { projectId: p.id, userId: actor.id, status: "ACTIVE" } })) throw AppError.forbidden("Project members cannot apply as mentors");
      const [activeRoles, plan] = await Promise.all([tx.mentorRelationship.findMany({ where: { projectId: p.id, status: "ACTIVE" }, select: { mentorRole: true } }), tx.mentorInvitationPlan.findFirst({ where: { projectId: p.id, status: "ACTIVE" } })]);
      if (activeRoles.some(relationship => relationship.mentorRole === input.mentorRole) || plan?.closedRoles.includes(input.mentorRole)) throw AppError.conflict("This mentoring role is not recruiting applicants");
      if (await tx.mentorRelationship.count({ where: { projectId: p.id, mentorUserId: actor.id, status: "ACTIVE" } })) throw AppError.conflict("An active mentorship already exists");
      if (await tx.mentorshipRequest.count({ where: { projectId: p.id, mentorUserId: actor.id, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })) throw AppError.conflict("Respond to the existing formal invitation first");
      const existing = await tx.mentorshipApplication.findUnique({ where: { projectId_lecturerId: { projectId: p.id, lecturerId: actor.id } } });
      if (existing && ["APPLIED", "SHORTLISTED", "INVITED", "ACCEPTED"].includes(existing.status)) throw AppError.conflict("An application already exists. Open it to follow up.");
      if (existing?.status === "DECLINED" && existing.updatedAt.getTime() > Date.now() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000) throw AppError.conflict("Wait before reapplying to this project");
      if (await tx.mentorshipApplicationEvent.count({ where: { actorId: actor.id, type: "APPLIED", createdAt: { gt: new Date(Date.now() - 3600000) } } }) >= env.ACADEMIC_RELATIONSHIP_REQUEST_LIMIT) throw AppError.conflict("Application limit reached; try later");
      const { idempotencyKey, ...fields } = input;
      const data = { ...fields, submissionKey: idempotencyKey, submissionHash: hash, status: "APPLIED" };
      const row = existing ? await tx.mentorshipApplication.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } }) : await tx.mentorshipApplication.create({ data: { ...data, projectId: p.id, lecturerId: actor.id } });
      await applicationEvent(tx, row, actor.id, "APPLIED", { input: JSON.parse(JSON.stringify(input)) }, { key: input.idempotencyKey, hash });
      await applicationNotify(tx, row, live.ownerId, true); return { id: row.id };
    }, { maxWait: 10_000, timeout: 15_000 });
    await dispatchMentorshipNotifications(); return result;
  },
  // Older clients are migrated into the pool, never into an implicit consent request.
  async legacyOffer(p: string, a: string, input: { message: string; mentorRole?: "PRIMARY" | "SECONDARY"; idempotencyKey?: string; attachmentIds?: string[]; access?: unknown }) {
    if (input.access) throw AppError.forbidden("Only the project owner can propose mentor access");
    if (input.attachmentIds?.length) throw AppError.badRequest("Apply through the applicant form; attachments are not shared before selection");
    return this.apply(p, a, { message: input.message, mentorRole: input.mentorRole ?? "PRIMARY", availability: "Not specified in the legacy application", areas: [], methodologies: [], capabilities: [], idempotencyKey: input.idempotencyKey ?? randomUUID() });
  },
  async list(projectInput: string, actorInput: string, query: unknown = {}) {
    const page = applicationPageSchema.parse(query), [p, actor] = await Promise.all([applicationProject(projectInput), applicationActor(actorInput)]);
    return getPrisma().$transaction(async tx => {
      await applicationLocks(tx, p.id, [actor.id]); const live = await applicationProject(p.id, tx); await applicationActor(actor.id, tx);
      if (live.ownerId !== actor.id) throw AppError.forbidden("Only the project owner can review the applicant pool");
      const total = await tx.mentorshipApplication.count({ where: { projectId: p.id } });
      const rows = await tx.mentorshipApplication.findMany({ where: { projectId: p.id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: page.pageSize, skip: (page.page - 1) * page.pageSize });
      return { items: await Promise.all(rows.map(row => present(tx, row, live, actor.id))), meta: { ...page, total, totalPages: Math.ceil(total / page.pageSize) } };
    }, { timeout: 15_000 });
  },
  async mine(actorInput: string, query: unknown = {}) {
    const actor = await applicationActor(actorInput), page = applicationPageSchema.parse(query), db = getPrisma();
    const where = { lecturerId: actor.id }, total = await db.mentorshipApplication.count({ where });
    const rows = await db.mentorshipApplication.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] });
    return { items: await Promise.all(rows.map(async row => this.detail(row.projectId, row.id, actor.id, false))), meta: { ...page, total, totalPages: Math.ceil(total / page.pageSize) } };
  },
  async detail(projectInput: string, id: string, actorInput: string, evidence = true): Promise<MentorshipApplicationDetail> {
    const [p, actor] = await Promise.all([applicationProject(projectInput), applicationActor(actorInput)]);
    const result = await getPrisma().$transaction(async tx => {
      await applicationLocks(tx, p.id, [actor.id]); await applicationActor(actor.id, tx); const { p: live, row } = await scoped(tx, p.id, id, actor.id);
      const view = await present(tx, row, live, actor.id);
      const [notes, events] = await Promise.all([tx.mentorshipApplicationNote.findMany({ where: { applicationId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 }), tx.mentorshipApplicationEvent.findMany({ where: { applicationId: id }, select: { id: true, type: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 })]);
      const people = await tx.user.findMany({ where: { id: { in: notes.map(note => note.authorId) } }, select: { id: true, fullName: true } });
      return { view, row, p: live, notes: notes.map(note => ({ id: note.id, authorId: note.authorId, authorName: people.find(person => person.id === note.authorId)?.fullName ?? "Participant", body: note.body, createdAt: note.createdAt.toISOString() })), events: events.map(event => ({ ...event, createdAt: event.createdAt.toISOString() })) };
    }, { timeout: 15_000 });
    return { ...result.view, notes: result.notes, events: result.events, ...(evidence ? { evidence: await lecturerMatchEvidence(result.row.lecturerId, actor.id, { topics: [...result.p.mentorshipResearchAreas, ...result.p.mentorshipExpertise], methodologies: result.p.mentorshipMethodologies, needs: result.p.mentorshipNeeds }, result.row, result.view.lecturer.verifiedLecturer) } : {}) };
  },
  async action(projectInput: string, id: string, actorInput: string, raw: unknown) {
    const input = applicationActionSchema.parse(raw), [p, actor] = await Promise.all([applicationProject(projectInput), applicationActor(actorInput)]);
    await getPrisma().$transaction(async tx => {
      await applicationLocks(tx, p.id, [actor.id]); await applicationActor(actor.id, tx); const { p: live, row } = await scoped(tx, p.id, id, actor.id); applicationOpen(live);
      if (row.version !== input.expectedVersion || !editable.includes(row.status)) throw AppError.conflict("Application changed. Refresh before continuing.");
      if (input.action === "WITHDRAW" ? row.lecturerId !== actor.id : live.ownerId !== actor.id) throw AppError.forbidden("Only the appropriate application party can perform this action");
      const status = input.action === "WITHDRAW" ? "WITHDRAWN" : input.action === "SHORTLIST" ? "SHORTLISTED" : "DECLINED";
      const updated = await tx.mentorshipApplication.update({ where: { id }, data: { status, version: { increment: 1 } } });
      await applicationEvent(tx, updated, actor.id, status); await applicationNotify(tx, updated, actor.id === live.ownerId ? row.lecturerId : live.ownerId, actor.id !== live.ownerId);
    });
    await dispatchMentorshipNotifications(); return this.detail(p.id, id, actor.id);
  },
  async note(projectInput: string, id: string, actorInput: string, raw: unknown) {
    const input = applicationNoteSchema.parse(raw), [p, actor] = await Promise.all([applicationProject(projectInput), applicationActor(actorInput)]);
    await getPrisma().$transaction(async tx => {
      await applicationLocks(tx, p.id, [actor.id]); await applicationActor(actor.id, tx); const { p: live, row } = await scoped(tx, p.id, id, actor.id); applicationOpen(live);
      const previous = await tx.mentorshipApplicationNote.findUnique({ where: { applicationId_authorId_clientKey: { applicationId: id, authorId: actor.id, clientKey: input.clientKey } } });
      if (previous) { if (previous.body !== input.body) throw AppError.conflict("Idempotency key was already used for a different question"); return; }
      if (!editable.includes(row.status)) throw AppError.conflict("Use the formal invitation or active mentorship to continue");
      if (await tx.mentorshipApplicationNote.count({ where: { applicationId: id } }) >= 100) throw AppError.conflict("Clarification limit reached");
      await tx.mentorshipApplicationNote.create({ data: { applicationId: id, authorId: actor.id, ...input } });
      const updated = await tx.mentorshipApplication.update({ where: { id }, data: { version: { increment: 1 } } });
      await applicationEvent(tx, updated, actor.id, "CLARIFICATION"); await applicationNotify(tx, updated, actor.id === live.ownerId ? row.lecturerId : live.ownerId, actor.id !== live.ownerId);
    });
    await dispatchMentorshipNotifications(); return this.detail(p.id, id, actor.id);
  },
};
