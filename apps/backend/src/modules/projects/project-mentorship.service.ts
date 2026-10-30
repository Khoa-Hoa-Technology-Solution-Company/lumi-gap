import { AppError } from "../../common/exceptions/app-error.js";
import { isDeepStrictEqual } from "node:util";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import type { Prisma, MentorshipRequest, MentorRelationship, Project, User, AcademicProfile } from "../../generated/prisma/client.js";
import { assertAcademicRelationshipManager, assertVerifiedLecturer, assertAcceptingNewMentorships,
  canManageAcademicRelationships, isVerifiedLecturer } from "./academic-relationship-access.js";
import { dispatchMentorshipNotifications, mentorshipNotification, type MentorshipEvent } from "./mentorship-notifications.js";
import { mentorshipDiscoveryService } from "./mentorship-discovery.service.js";
import { mentorshipResearchContext, type ContextQuery } from "./mentorship-context.service.js";
import { mentorPositions, assertMentorPosition, mentorshipPolicy } from "./mentorship-positions.js";
import { invitationFiles, attachmentFields } from "./mentorship-content.service.js";
import type { AcademicSupportSearch as AcademicSearch, MentorRole } from "@trend/shared-types";
import { initializeMentorAccess, mentorAccessEvent, mentorPolicyDto } from "./mentor-access.service.js";
import type { MentorPolicyInput } from "@trend/shared-types";
export type { AcademicSupportSearch as AcademicSearch } from "@trend/shared-types";

type Db = Prisma.TransactionClient;
const emptyActions = { accept: false, decline: false, cancel: false, end: false, openProject: false };
const policy = () => mentorshipPolicy;
type RequestInput = { mentorUserId?: string; message: string; idempotencyKey?: string; mentorRole?: MentorRole; attachmentIds?: string[]; access?: MentorPolicyInput };
export function pageMeta(total: number, input: AcademicSearch = {}) {
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(30, Math.max(1, input.pageSize ?? 10));
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
function whereId(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}
async function actor(input: string, db: Db = getPrisma()) {
  const user = await db.user.findUnique({ where: whereId(input) });
  if (!user?.isActive || user.accountStatus !== "ACTIVE" || !user.emailVerifiedAt) throw AppError.forbidden("An active verified email account is required");
  return user;
}
async function project(input: string, db: Db = getPrisma()) {
  const row = await db.project.findUnique({ where: whereId(input) });
  if (!row) throw AppError.notFound("Project not found");
  return row;
}
export function mentorshipPreview(row: Project) {
  return { id: publicDatabaseId(row), title: row.title, summary: row.mentorshipSummary ?? "", researchField: row.mentorshipResearchAreas[0],
    researchAreas: row.mentorshipResearchAreas, mentoringNeeds: row.mentorshipNeeds,
    stage: row.status, expertise: row.mentorshipExpertise, discovery: row.mentorshipDiscovery };
}
function mentorshipPerson(u: Pick<User, "id" | "legacyMongoId" | "fullName" | "avatarUrl" | "institution" | "isActive" | "emailVerifiedAt" | "accountStatus"> | undefined,
  ap: Pick<AcademicProfile, "academicRole" | "roleVerificationStatus" | "positionStatus" | "profileVisibility" | "positionTitle"> | null | undefined, id: string, viewerId?: string) {
  const visible = id === viewerId || ap?.profileVisibility !== "PRIVATE";
  return { _id: u ? publicDatabaseId(u) : id, fullName: u?.fullName, avatarUrl: u?.avatarUrl ?? undefined,
    academicRole: visible ? ap?.academicRole ?? undefined : undefined, institutionName: visible ? u?.institution ?? undefined : undefined,
    positionTitle: visible ? ap?.positionTitle ?? undefined : undefined, verifiedLecturer: isVerifiedLecturer(u ?? null, ap ?? null) };
}
async function locks(tx: Db, projectId: string, userIds: string[]) {
  for (const id of [...new Set(userIds)].sort()) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
}
async function assertTeam(p: Project, userId: string, db: Db = getPrisma()) {
  const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId } } });
  if (p.ownerId !== userId && member?.status !== "ACTIVE") throw AppError.forbidden("Only the active project team can find or suggest mentors");
}
function assertOpenProject(p: Project) {
  if (["ARCHIVED", "COMPLETED"].includes(p.status)) throw AppError.conflict("This project no longer accepts new mentorships");
}
async function record(tx: Db, p: Project, actorId: string | null, type: string, recordId: string, metadata: Prisma.InputJsonObject = {}) {
  const activity = await tx.projectActivity.create({ data: { projectId: p.id, actorId, type, entityKind: "mentorship", entityId: recordId, metadata } });
  const relationshipEvent = ["MENTORSHIP_ENDED", "MENTOR_JOINED_PROJECT"].includes(type), activityEvent = ["MENTOR_GUIDANCE", "MENTOR_DISCOVERY_UPDATED"].includes(type);
  // Guidance content belongs to the scoped project activity, not the global admin audit feed.
  const details = type === "MENTOR_GUIDANCE" ? { projectId: p.id, attribution: metadata.attribution ?? "TEAM" } : { projectId: p.id, ...metadata };
  await tx.auditLog.create({ data: { userId: actorId, actionName: type, targetTableName: activityEvent ? "project_activities" : relationshipEvent ? "mentor_relationships" : type.startsWith("MENTORSHIP_SUGGEST") ? "mentor_suggestions" : "mentorship_requests", targetRecordId: activityEvent ? activity.id : recordId, details } });
}
async function expireInProject(tx: Db, p: Project) {
  const rows = await tx.mentorshipRequest.findMany({ where: { projectId: p.id, status: "PENDING", expiresAt: { lte: new Date() } } });
  for (const row of rows) {
    await tx.mentorshipRequest.update({ where: { id: row.id }, data: { status: "EXPIRED", respondedAt: new Date(), closeReason: "REQUEST_EXPIRED" } });
    await record(tx, p, null, "MENTORSHIP_EXPIRED", row.id);
    await mentorshipNotification(tx, { event: "MENTORSHIP_EXPIRED", recordId: row.id, projectId: p.id, projectTitle: p.title,
      actorId: row.requestedBy, recipients: [p.ownerId, row.mentorUserId] });
  }
}
async function present(requests: MentorshipRequest[], relationships: MentorRelationship[], actorId: string, db: Db = getPrisma()) {
  const ids = [...new Set([...requests.flatMap(r => [r.mentorUserId, r.requestedBy]), ...relationships.map(r => r.mentorUserId), actorId])];
  const [users, profiles, projects, linked] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, institution: true, isActive: true, emailVerifiedAt: true, accountStatus: true } }),
    db.academicProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, academicRole: true, roleVerificationStatus: true, positionStatus: true, profileVisibility: true, positionTitle: true } }),
    db.project.findMany({ where: { id: { in: [...new Set([...requests, ...relationships].map(r => r.projectId))] } } }),
    db.mentorRelationship.findMany({ where: { sourceRequestId: { in: requests.map(r => r.id) } }, select: { id: true, sourceRequestId: true } }),
  ]);
  const userMap = new Map(users.map(u => [u.id, u])), profileMap = new Map(profiles.map(p => [p.userId, p])), projectMap = new Map(projects.map(p => [p.id, p]));
  const positions = new Map(await Promise.all(projects.map(async p => [p.id, await mentorPositions(p.id, db)] as const)));
  const accessRows = await db.mentorAccess.findMany({ where: { requestId: { in: [...requests.map(r => r.id), ...relationships.map(r => r.sourceRequestId)] } } });
  const accessPolicies = new Map(await Promise.all(accessRows.map(async row => [row.requestId, await mentorPolicyDto(db, row)] as const)));
  const fileLinks = await db.mentorshipRequestAttachment.findMany({ where: { requestId: { in: requests.filter(r => r.requestedBy === actorId || r.mentorUserId === actorId || projectMap.get(r.projectId)?.ownerId === actorId).map(r => r.id) } } });
  const files = await db.mentorshipAttachment.findMany({ where: { id: { in: fileLinks.map(link => link.attachmentId) } }, select: attachmentFields });
  const person = (id: string) => mentorshipPerson(userMap.get(id), profileMap.get(id), id, actorId);
  return {
    requests: requests.map(r => {
      const p = projectMap.get(r.projectId)!, manager = p.ownerId === actorId, mentor = r.mentorUserId === actorId;
      const pending = r.status === "PENDING" && (!r.expiresAt || r.expiresAt > new Date());
      const sender = r.direction === "PROJECT_TO_LECTURER" ? manager : mentor, receiver = r.direction === "PROJECT_TO_LECTURER" ? mentor : manager;
      const eligible = isVerifiedLecturer(userMap.get(r.mentorUserId) ?? null, profileMap.get(r.mentorUserId) ?? null);
      const role = r.mentorRole as MentorRole, position = positions.get(p.id)![role];
      return { kind: "REQUEST" as const, id: r.id, projectId: publicDatabaseId(p), project: mentorshipPreview(p), mentorUser: person(r.mentorUserId), requestedBy: person(r.requestedBy),
        mentorRole: role, accessPolicy: accessPolicies.get(r.id), attachments: fileLinks.filter(l => l.requestId === r.id).flatMap(l => files.filter(f => f.id === l.attachmentId)),
        direction: r.direction, status: r.status, message: r.message ?? undefined,
        responseNote: manager || mentor || r.requestedBy === actorId ? r.responseNote ?? undefined : undefined,
        closeReason: r.closeReason ?? undefined,
        relationshipId: linked.find(rel => rel.sourceRequestId === r.id)?.id,
        expiresAt: r.expiresAt?.toISOString(), respondedAt: r.respondedAt?.toISOString(), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
        actions: { ...emptyActions, cancel: pending && sender, decline: pending && receiver,
          accept: pending && receiver && eligible && !accessPolicies.get(r.id)?.revokedAt && (!accessPolicies.get(r.id)?.expiresAt || new Date(accessPolicies.get(r.id)!.expiresAt!) > new Date()) && !["ASSIGNED", "LOCKED"].includes(position.status) && !["ARCHIVED", "COMPLETED"].includes(p.status) && (r.direction !== "PROJECT_TO_LECTURER" || r.requestedBy === p.ownerId) },
      };
    }),
    relationships: relationships.map(r => {
      const p = projectMap.get(r.projectId)!, principal = p.ownerId === actorId || r.mentorUserId === actorId;
      const active = r.status === "ACTIVE", mentorEligible = isVerifiedLecturer(userMap.get(r.mentorUserId) ?? null, profileMap.get(r.mentorUserId) ?? null);
      return { kind: "RELATIONSHIP" as const, id: r.id, mentorRole: r.mentorRole as MentorRole, accessPolicy: accessPolicies.get(r.sourceRequestId), sourceRequestId: r.sourceRequestId, projectId: publicDatabaseId(p), project: mentorshipPreview(p), mentorUser: person(r.mentorUserId), status: r.status,
        startedAt: r.startedAt.toISOString(), endedAt: r.endedAt?.toISOString(), endedById: r.endedById ?? undefined,
        endReason: principal ? r.endReason ?? undefined : undefined,
        createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), actions: { ...emptyActions, end: active && principal, openProject: active && (p.ownerId === actorId || mentorEligible && Boolean(accessPolicies.get(r.sourceRequestId)?.effective)) } };
    }),
  };
}
async function collection(a: Awaited<ReturnType<typeof actor>>, query: AcademicSearch, p?: Project) {
  const db = getPrisma();
  const owned = p ? [] : await db.project.findMany({ where: { ownerId: a.id }, select: { id: true } });
  const member = p ? await db.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: a.id } } }) : null;
  const team = p && (p.ownerId === a.id || member?.status === "ACTIVE");
  const where = p ? { projectId: p.id, ...(team ? {} : { mentorUserId: a.id }) } : { OR: [{ mentorUserId: a.id }, { projectId: { in: owned.map(p => p.id) } }] };
  const incomingWhere = { status: "PENDING", OR: [{ direction: "PROJECT_TO_LECTURER", mentorUserId: a.id }, { direction: "LECTURER_TO_PROJECT", projectId: { in: p?.ownerId === a.id ? [p.id] : owned.map(p => p.id) } }] };
  const outgoingWhere = { status: "PENDING", OR: [{ direction: "LECTURER_TO_PROJECT", mentorUserId: a.id }, { direction: "PROJECT_TO_LECTURER", requestedBy: a.id }] };
  const requestWhere: Prisma.MentorshipRequestWhereInput = { AND: [where, ...(query.view === "incoming" ? [incomingWhere] : query.view === "outgoing" ? [outgoingWhere] : query.view === "active" ? [{ id: { in: [] } }] : query.view === "history" ? [{ status: { not: "PENDING" } }] : [])] };
  const relationshipWhere: Prisma.MentorRelationshipWhereInput = { ...where, ...(query.view === "active" ? { status: "ACTIVE" } : query.view === "history" ? { status: "ENDED" } : query.view === "incoming" || query.view === "outgoing" ? { id: { in: [] } } : {}) };
  // Access must not depend on which tab/page the caller selected.
  if (p && !team && !await db.mentorshipRequest.count({ where }) && !await db.mentorRelationship.count({ where })) throw AppError.forbidden();
  const [totalRequests, totalRelationships, pending, incoming, active] = await Promise.all([
    db.mentorshipRequest.count({ where: requestWhere }), db.mentorRelationship.count({ where: relationshipWhere }), db.mentorshipRequest.count({ where: { ...where, status: "PENDING" } }),
    db.mentorshipRequest.count({ where: { AND: [where, { status: "PENDING" }, { OR: [{ direction: "PROJECT_TO_LECTURER", mentorUserId: a.id }, { direction: "LECTURER_TO_PROJECT", projectId: { in: p?.ownerId === a.id ? [p.id] : owned.map(p => p.id) } }] }] } }),
    db.mentorRelationship.count({ where: { ...where, status: "ACTIVE" } }),
  ]);
  const meta = pageMeta(totalRequests, query), relationshipMeta = pageMeta(totalRelationships, query);
  const [requests, relationships] = await Promise.all([
    // PENDING sorts before all terminal statuses allowed by the database constraint.
    db.mentorshipRequest.findMany({ where: requestWhere, orderBy: [{ status: "desc" }, { createdAt: "desc" }, { id: "asc" }], take: meta.pageSize, skip: (meta.page - 1) * meta.pageSize }),
    db.mentorRelationship.findMany({ where: relationshipWhere, orderBy: [{ status: "asc" }, { startedAt: "desc" }, { id: "asc" }], take: meta.pageSize, skip: (meta.page - 1) * meta.pageSize }),
  ]);
  return { ...await present(requests, relationships, a.id), counts: { pending, incoming, active }, policy: policy(), positions: p ? await mentorPositions(p.id) : undefined, requestMeta: meta, relationshipMeta };
}

export const projectMentorshipService = {
  async expireRequests() {
    const due = await getPrisma().mentorshipRequest.findMany({ where: { status: "PENDING", expiresAt: { lte: new Date() } }, select: { projectId: true }, distinct: ["projectId"], take: 50 });
    for (const row of due) await getPrisma().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${row.projectId}::uuid FOR UPDATE`;
      const p = await tx.project.findUnique({ where: { id: row.projectId } });
      if (p) await expireInProject(tx, p);
    });
    await dispatchMentorshipNotifications();
  },
  async list(projectInput: string, actorInput: string, query: AcademicSearch = {}) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await this.expireRequests(); return collection(a, query, p);
  },
  async mine(actorInput: string, query: AcademicSearch = {}) { const a = await actor(actorInput); await this.expireRequests(); return collection(a, query); },
  async preferences(actorInput: string, input?: { acceptingMentorships?: boolean; emailEnabled?: boolean; locale?: "en" | "vi" }) {
    const a = await actor(actorInput), db = getPrisma();
    const profile = input ? await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${a.id}::uuid FOR UPDATE`;
      await actor(a.id, tx);
      if (input.acceptingMentorships) await assertVerifiedLecturer(tx, a.id);
      const live = await tx.academicProfile.findUnique({ where: { userId: a.id } });
      if (!live) throw AppError.notFound("Academic profile not found");
      const availability = live.supportAvailability as Prisma.InputJsonObject;
      return tx.academicProfile.update({ where: { userId: a.id }, data: {
        ...(input.acceptingMentorships !== undefined ? { supportAvailability: { ...availability, enabled: input.acceptingMentorships, updatedAt: new Date().toISOString() } } : {}),
        ...(input.emailEnabled !== undefined ? { mentorshipEmailEnabled: input.emailEnabled } : {}), ...(input.locale ? { notificationLocale: input.locale } : {}),
      } });
    }) : await db.academicProfile.findUnique({ where: { userId: a.id } });
    const canEnable = isVerifiedLecturer(a, profile);
    return { acceptingMentorships: canEnable && (profile?.supportAvailability as { enabled?: boolean })?.enabled === true,
      canEnable, emailEnabled: profile?.mentorshipEmailEnabled ?? true, locale: profile?.notificationLocale ?? "en" };
  },
  async mentors(projectInput: string, actorInput: string, query: AcademicSearch = {}) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await assertTeam(p, a.id); assertOpenProject(p);
    const owner = await getPrisma().user.findUniqueOrThrow({ where: { id: p.ownerId } });
    return mentorshipDiscoveryService.mentors(p, owner, query);
  },
  async suggestions(projectInput: string, actorInput: string, query: AcademicSearch = {}) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await assertTeam(p, a.id);
    const db = getPrisma(), where = { projectId: p.id, status: "PENDING" }, total = await db.mentorSuggestion.count({ where }), meta = pageMeta(total, query);
    const rows = await db.mentorSuggestion.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: meta.pageSize, skip: (meta.page - 1) * meta.pageSize });
    const users = await db.user.findMany({ where: { id: { in: rows.flatMap(r => [r.mentorUserId, r.suggestedBy]) } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true } });
    const person = (id: string) => { const u = users.find(u => u.id === id)!; return { _id: publicDatabaseId(u), fullName: u.fullName, avatarUrl: u.avatarUrl ?? undefined }; };
    return { items: rows.map(r => ({ id: r.id, projectId: publicDatabaseId(p), mentorUser: person(r.mentorUserId), suggestedBy: person(r.suggestedBy), message: r.message, status: r.status, createdAt: r.createdAt.toISOString() })), meta };
  },
  async suggest(projectInput: string, actorInput: string, input: { mentorUserId: string; message: string }) {
    const [p, a, mentor] = await Promise.all([project(projectInput), actor(actorInput), actor(input.mentorUserId)]);
    const result = await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id, mentor.id, p.ownerId]); const live = await project(p.id, tx); await actor(a.id, tx); await assertTeam(live, a.id, tx); assertOpenProject(live);
      if (live.ownerId === a.id) throw AppError.badRequest("The owner can invite a mentor directly");
      await assertAcceptingNewMentorships(tx, mentor.id);
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: mentor.id } } });
      if (mentor.id === live.ownerId || member?.status === "ACTIVE") throw AppError.conflict("Project members cannot also become the project's academic mentor");
      if (await tx.mentorSuggestion.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: "PENDING" } }) || await tx.mentorshipRequest.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: "PENDING" } }) || await tx.mentorRelationship.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: "ACTIVE" } })) throw AppError.conflict("A suggestion, pending request or active mentorship already exists");
      if (!input.message.trim() || input.message.trim().length > 1000) throw AppError.badRequest("Explain the suggestion in 1–1000 characters");
      if (await tx.mentorSuggestion.count({ where: { projectId: p.id, status: "PENDING" } }) >= 30) throw AppError.conflict("Review existing mentor suggestions first");
      const row = await tx.mentorSuggestion.create({ data: { projectId: p.id, mentorUserId: mentor.id, suggestedBy: a.id, message: input.message.trim() } });
      await record(tx, live, a.id, "MENTORSHIP_SUGGESTED", row.id);
      await mentorshipNotification(tx, { event: "MENTORSHIP_SUGGESTED", recordId: row.id, projectId: p.id, projectTitle: live.title, actorId: a.id, recipients: [live.ownerId] });
      return { id: row.id };
    });
    await dispatchMentorshipNotifications(); return result;
  },
  async dismissSuggestion(projectInput: string, suggestionId: string, actorInput: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    return getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id]); const live = await assertAcademicRelationshipManager(p.id, a.id, tx); assertOpenProject(live);
      const row = await tx.mentorSuggestion.findFirst({ where: { id: suggestionId, projectId: p.id } });
      if (!row) throw AppError.notFound("Mentor suggestion not found");
      if (row.status === "DISMISSED") return { id: row.id };
      if (row.status !== "PENDING") throw AppError.conflict("This suggestion has already been handled");
      await tx.mentorSuggestion.update({ where: { id: row.id }, data: { status: "DISMISSED", resolvedBy: a.id, resolvedAt: new Date() } });
      await record(tx, live, a.id, "MENTORSHIP_SUGGESTION_DISMISSED", row.id); return { id: row.id };
    });
  },
  async discovery(actorInput: string, query: AcademicSearch = {}) {
    const a = await actor(actorInput), profile = await assertAcceptingNewMentorships(getPrisma(), a.id);
    return mentorshipDiscoveryService.opportunities(a, profile, query);
  },
  async settings(projectInput: string, actorInput: string, input?: { discovery: "CLOSED" | "SEEKING_MENTOR"; summary: string; expertise: string[]; researchAreas?: string[]; mentoringNeeds?: string; expectedVersion?: number }) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await assertAcademicRelationshipManager(p.id, a.id);
    const ap = await getPrisma().academicProfile.findUnique({ where: { userId: a.id } });
    const invitationSender = mentorshipPerson(a, ap, a.id);
    if (!input) return { ...mentorshipPreview(p), version: p.version, invitationSender };
    return getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id]); const live = await assertAcademicRelationshipManager(p.id, a.id, tx); assertOpenProject(live);
      if (input.expectedVersion !== undefined && input.expectedVersion !== live.version) throw AppError.conflict("Project settings changed. Refresh before saving again");
      if (input.discovery === "SEEKING_MENTOR" && input.summary.trim().length < 10) throw AppError.badRequest("Add a safe summary before opening discovery");
      const updated = await tx.project.update({ where: { id: p.id }, data: { mentorshipDiscovery: input.discovery, mentorshipSummary: input.summary, mentorshipExpertise: input.expertise, mentorshipResearchAreas: input.researchAreas, mentorshipNeeds: input.mentoringNeeds, version: { increment: 1 } } });
      await record(tx, live, a.id, "MENTOR_DISCOVERY_UPDATED", p.id, { discovery: input.discovery }); return { ...mentorshipPreview(updated), version: updated.version, invitationSender };
    });
  },
  async request(p: string, a: string, input: RequestInput & { mentorUserId: string }) { return this.create(p, a, input, "PROJECT_TO_LECTURER"); },
  async offer(p: string, a: string, input: RequestInput) { return this.create(p, a, input, "LECTURER_TO_PROJECT"); },
  async create(projectInput: string, actorInput: string, input: RequestInput, direction: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const mentor = direction === "PROJECT_TO_LECTURER" ? await actor(input.mentorUserId!) : a;
    const mentorRole = input.mentorRole ?? "PRIMARY", attachmentIds = input.attachmentIds ?? [];
    if (!["PRIMARY", "SECONDARY"].includes(mentorRole)) throw AppError.badRequest("Invalid mentor role");
    const row = await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id, mentor.id, p.ownerId]); const live = await project(p.id, tx); await actor(a.id, tx);
      if (input.idempotencyKey) {
        const previous = await tx.mentorshipRequest.findUnique({ where: { requestedBy_idempotencyKey: { requestedBy: a.id, idempotencyKey: input.idempotencyKey } } });
        if (previous) {
          const linked = await tx.mentorshipRequestAttachment.findMany({ where: { requestId: previous.id } });
          if (previous.projectId !== p.id || previous.mentorUserId !== mentor.id || previous.direction !== direction || previous.mentorRole !== mentorRole || previous.message !== input.message.trim() || JSON.stringify(linked.map(l => l.attachmentId).sort()) !== JSON.stringify([...attachmentIds].sort())) throw AppError.conflict("Idempotency key was already used for a different request");
          const oldAccess = await tx.mentorAccess.findUnique({ where: { requestId: previous.id } });
          const proposal = oldAccess ? await tx.mentorAccessEvent.findFirst({ where: { accessId: oldAccess.id, type: "ACCESS_PROPOSED" }, orderBy: { createdAt: "asc" } }) : null;
          if (!isDeepStrictEqual((proposal?.details as { initialInput?: unknown } | undefined)?.initialInput ?? null, input.access ?? null)) throw AppError.conflict("Quyền trong lời mời đã khác yêu cầu gốc");
          return previous;
        }
      }
      if (direction === "PROJECT_TO_LECTURER") await assertAcademicRelationshipManager(p.id, a.id, tx);
      else {
        if (input.access) throw AppError.forbidden("Chỉ chủ dự án được cấu hình quyền mời cố vấn");
        // Recheck the discovery eligibility when an offer is sent from a stale preview or directly by ID.
        await actor(live.ownerId, tx);
        if (live.mentorshipDiscovery !== "SEEKING_MENTOR") throw AppError.forbidden("This project is not seeking mentorship offers");
      }
      assertOpenProject(live); await assertAcceptingNewMentorships(tx, mentor.id);
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: mentor.id } } });
      if (live.ownerId === mentor.id || member?.status === "ACTIVE") throw AppError.conflict("Project members cannot also become the project's academic mentor");
      if ((!input.message?.trim() && !attachmentIds.length) || input.message.trim().length > 1000) throw AppError.badRequest("Add a message or an attachment to your invitation");
      await expireInProject(tx, live); const now = new Date();
      await assertMentorPosition(tx, p.id, mentorRole, true);
      await invitationFiles(tx, p.id, a.id, attachmentIds);
      if (await tx.mentorshipRequest.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: "PENDING" } }) || await tx.mentorRelationship.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: "ACTIVE" } })) throw AppError.conflict("A pending request or active mentorship already exists");
      if (await tx.mentorshipRequest.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: { in: ["DECLINED", "CANCELLED", "CANCELED_BY_PROJECT"] }, respondedAt: { gt: new Date(now.getTime() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000) } } })) throw AppError.conflict("Wait before sending another mentorship request to this pair");
      if (await tx.mentorshipRequest.count({ where: { requestedBy: a.id, createdAt: { gt: new Date(now.getTime() - 3600000) } } }) >= env.ACADEMIC_RELATIONSHIP_REQUEST_LIMIT) throw AppError.conflict("Mentorship request limit reached; try later");
      const request = await tx.mentorshipRequest.create({ data: { projectId: p.id, mentorUserId: mentor.id, requestedBy: a.id, direction, mentorRole, message: input.message.trim(), idempotencyKey: input.idempotencyKey, expiresAt: new Date(now.getTime() + mentorshipPolicy.expiryDays * 86400000) } });
      await initializeMentorAccess(tx, request, live.ownerId, input.access);
      if (attachmentIds.length) await tx.mentorshipRequestAttachment.createMany({ data: attachmentIds.map(attachmentId => ({ requestId: request.id, attachmentId })) });
      if (direction === "PROJECT_TO_LECTURER") await tx.mentorSuggestion.updateMany({ where: { projectId: p.id, mentorUserId: mentor.id, status: "PENDING" }, data: { status: "INVITED", requestId: request.id, resolvedBy: a.id, resolvedAt: now } });
      const event = direction === "PROJECT_TO_LECTURER" ? "MENTORSHIP_REQUEST_RECEIVED" : "MENTORSHIP_OFFER_RECEIVED";
      await record(tx, live, a.id, event, request.id);
      await mentorshipNotification(tx, { event, recordId: request.id, projectId: p.id, projectTitle: live.title, actorId: a.id, recipients: [direction === "PROJECT_TO_LECTURER" ? mentor.id : live.ownerId] }); return request;
    });
    await dispatchMentorshipNotifications(); return (await present([row], [], a.id)).requests[0];
  },
  async respond(projectInput: string, requestId: string, actorInput: string, action: "ACCEPTED" | "DECLINED" | "CANCELLED", note?: string, expectedAccessVersion?: number) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const row = await getPrisma().mentorshipRequest.findFirst({ where: { id: requestId, projectId: p.id } });
    if (!row) throw AppError.notFound("Mentorship request not found");
    const updated = await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id, row.mentorUserId, row.requestedBy, p.ownerId]); await actor(a.id, tx);
      const liveProject = await project(p.id, tx), live = await tx.mentorshipRequest.findUniqueOrThrow({ where: { id: row.id } });
      const manager = liveProject.ownerId === a.id, mentor = live.mentorUserId === a.id;
      const sender = live.direction === "PROJECT_TO_LECTURER" ? manager : mentor, receiver = live.direction === "PROJECT_TO_LECTURER" ? mentor : manager;
      if (!(action === "CANCELLED" ? sender : receiver)) throw AppError.forbidden("Only the appropriate relationship party can respond");
      const status = action === "CANCELLED" && manager ? "CANCELED_BY_PROJECT" : action;
      if (live.status === status) return live;
      if (live.status !== "PENDING" || live.expiresAt && live.expiresAt <= new Date()) throw AppError.conflict("This request has changed or expired");
      if (action === "ACCEPTED") {
        const access = await tx.mentorAccess.findUnique({ where: { requestId: live.id } });
        if (access?.revokedAt || access?.expiresAt && access.expiresAt <= new Date()) throw AppError.conflict("Quyền truy cập đề xuất đã hết hạn hoặc bị thu hồi");
        if (access && (expectedAccessVersion !== undefined ? expectedAccessVersion !== access.version : access.version > 1)) throw AppError.conflict("Quyền đề xuất đã thay đổi. Xem lại lời mời trước khi chấp nhận");
        assertOpenProject(liveProject); await assertVerifiedLecturer(tx, live.mentorUserId);
        if (live.direction === "PROJECT_TO_LECTURER") { await actor(live.requestedBy, tx); if (live.requestedBy !== liveProject.ownerId) throw AppError.conflict("The requester no longer manages this project"); }
        const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: live.mentorUserId } } });
        if (liveProject.ownerId === live.mentorUserId || member?.status === "ACTIVE") throw AppError.conflict("Project members cannot also become the project's academic mentor");
        await assertMentorPosition(tx, p.id, live.mentorRole as MentorRole);
      }
      const now = new Date();
      await tx.mentorshipRequest.update({ where: { id: live.id }, data: { status, responseNote: note?.trim(), respondedAt: now } });
      if (action === "ACCEPTED") {
        // Expired competitors keep their own outcome even between worker sweeps.
        await expireInProject(tx, liveProject);
        await tx.mentorSuggestion.updateMany({ where: { projectId: p.id, mentorUserId: live.mentorUserId, status: "PENDING" }, data: { status: "DISMISSED", resolvedBy: a.id, resolvedAt: now } });
        const relationship = await tx.mentorRelationship.create({ data: { projectId: p.id, mentorUserId: live.mentorUserId, mentorRole: live.mentorRole, sourceRequestId: live.id, startedAt: now } });
        const access = await tx.mentorAccess.findUnique({ where: { requestId: live.id } }) ?? await initializeMentorAccess(tx, live, liveProject.ownerId);
        await tx.mentorAccess.update({ where: { id: access.id }, data: { relationshipId: relationship.id, version: { increment: 1 } } });
        await mentorAccessEvent(tx, access, a.id, "ACCESS_ACCEPTED", { relationshipId: relationship.id, acceptedPolicyVersion: access.version, preset: access.preset, permissions: access.permissions, expiresAt: access.expiresAt });
        await record(tx, liveProject, a.id, "MENTOR_JOINED_PROJECT", relationship.id);
        {
          const competing = await tx.mentorshipRequest.findMany({ where: { projectId: p.id, mentorRole: live.mentorRole, status: "PENDING" } });
          for (const other of competing) {
            await tx.mentorshipRequest.update({ where: { id: other.id }, data: { status: "CLOSED_CAPACITY_REACHED", closeReason: "MENTOR_POSITION_FILLED", respondedAt: now } });
            await record(tx, liveProject, a.id, "MENTORSHIP_POSITION_FILLED", other.id, { mentorRole: live.mentorRole });
            await mentorshipNotification(tx, { event: "MENTORSHIP_POSITION_FILLED", recordId: other.id, projectId: p.id, projectTitle: liveProject.title, actorId: a.id, recipients: [other.mentorUserId, liveProject.ownerId] });
          }
        }
      }
      const event: MentorshipEvent = action === "CANCELLED" ? "MENTORSHIP_CANCELLED" : live.direction === "PROJECT_TO_LECTURER" ? (action === "ACCEPTED" ? "MENTORSHIP_REQUEST_ACCEPTED" : "MENTORSHIP_REQUEST_DECLINED") : (action === "ACCEPTED" ? "MENTORSHIP_OFFER_ACCEPTED" : "MENTORSHIP_OFFER_DECLINED");
      await record(tx, liveProject, a.id, event, live.id);
      await mentorshipNotification(tx, { event, recordId: live.id, projectId: p.id, projectTitle: liveProject.title, actorId: a.id, recipients: mentor ? [liveProject.ownerId, live.requestedBy] : [live.mentorUserId] });
      return tx.mentorshipRequest.findUniqueOrThrow({ where: { id: live.id } });
    });
    await dispatchMentorshipNotifications(); return (await present([updated], [], a.id)).requests[0];
  },
  async accept(p: string, r: string, a: string, note?: string, expectedAccessVersion?: number) { return this.respond(p, r, a, "ACCEPTED", note, expectedAccessVersion); },
  async decline(p: string, r: string, a: string, note?: string) { return this.respond(p, r, a, "DECLINED", note); },
  async cancel(p: string, r: string, a: string, note?: string) { return this.respond(p, r, a, "CANCELLED", note); },
  async end(projectInput: string, relationshipId: string, actorInput: string, reason?: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const row = await getPrisma().mentorRelationship.findFirst({ where: { id: relationshipId, projectId: p.id } });
    if (!row) throw AppError.notFound("Mentor relationship not found");
    const updated = await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id, row.mentorUserId, p.ownerId]); await actor(a.id, tx);
      const liveProject = await project(p.id, tx), live = await tx.mentorRelationship.findUniqueOrThrow({ where: { id: row.id } });
      if (a.id !== live.mentorUserId && a.id !== liveProject.ownerId) throw AppError.forbidden();
      if (live.status === "ENDED") return live;
      const result = await tx.mentorRelationship.update({ where: { id: live.id }, data: { status: "ENDED", endedAt: new Date(), endedById: a.id, endReason: reason?.trim() } });
      const access = await tx.mentorAccess.findUnique({ where: { relationshipId: live.id } });
      if (access) { await tx.mentorAccess.update({ where: { id: access.id }, data: { revokedAt: new Date(), version: { increment: 1 } } }); await mentorAccessEvent(tx, access, a.id, "ACCESS_REVOKED", { reason: reason ?? "Kết thúc cố vấn" }); }
      // Secondary assignments are never promoted. Pending secondary invitations
      // retain their history/expiry and cannot be accepted until a primary returns.
      await record(tx, liveProject, a.id, "MENTORSHIP_ENDED", live.id);
      await mentorshipNotification(tx, { event: "MENTORSHIP_ENDED", recordId: live.id, projectId: p.id, projectTitle: liveProject.title, actorId: a.id, recipients: [liveProject.ownerId, live.mentorUserId] }); return result;
    });
    await dispatchMentorshipNotifications(); return (await present([], [updated], a.id)).relationships[0];
  },
  async workspace(projectInput: string, actorInput: string, note?: string, query: ContextQuery = {}) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    return getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id]); await actor(a.id, tx);
      const live = await project(p.id, tx), member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: a.id } } });
      const team = live.ownerId === a.id || member?.status === "ACTIVE";
      if (!team) throw AppError.forbidden("Mở không gian cố vấn giới hạn để xem tài nguyên được chia sẻ");
      if (note) {
        if (["ARCHIVED", "COMPLETED"].includes(live.status)) throw AppError.conflict("This project is read-only");
        if (note.trim().length > 2000) throw AppError.badRequest("Guidance is limited to 2000 characters");
        await record(tx, live, a.id, "MENTOR_GUIDANCE", p.id, { note: note.trim(), attribution: team ? "TEAM" : "MENTOR" });
      }
      const guidance = await tx.projectActivity.findMany({ where: { projectId: p.id, type: "MENTOR_GUIDANCE" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50 });
      const authors = await tx.user.findMany({ where: { id: { in: guidance.flatMap(i => i.actorId ? [i.actorId] : []) } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true } });
      return { project: mentorshipPreview(live), canManage: canManageAcademicRelationships(a.id, live), accessRole: team ? "TEAM" : "MENTOR",
        canProvideFeedback: !["ARCHIVED", "COMPLETED"].includes(live.status),
        guidance: guidance.map(i => { const author = authors.find(u => u.id === i.actorId), meta = i.metadata as { note?: string; attribution?: string };
          return { id: i.id, author: author ? { _id: publicDatabaseId(author), fullName: author.fullName, avatarUrl: author.avatarUrl ?? undefined } : undefined,
            attribution: meta.attribution ?? "TEAM", note: meta.note ?? "", createdAt: i.createdAt.toISOString() }; }),
        context: await mentorshipResearchContext(tx, live, query),
      };
    });
  },
};
