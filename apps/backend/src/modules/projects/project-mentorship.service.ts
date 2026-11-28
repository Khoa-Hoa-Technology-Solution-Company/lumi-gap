import { readResearchClassification, resolveResearchClassification } from "../taxonomy/research-classification.service.js";
import { mentorshipTopicSuggestions } from "./mentorship-topic-suggestions.service.js";
import { lecturerMatchEvidence } from "./lecturer-match-evidence.js";
import { mentorshipApplicationsService } from "./mentorship-applications.service.js";
import { assertApplicationInvitation, applicationEvent, syncApplicationRequest, closeAcceptedApplication } from "./mentorship-application-context.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { isDeepStrictEqual } from "node:util";
import { hasMeaningfulResearchText, normalizeAcademicExpertise, type MentorRecruitmentProfile, type NeedScopeConfirmation, type ResearchSupportType } from "@trend/shared-types";
import {
  analyzeResearchNeedsDeterministic,
  buildAuthorizedNeedsContext,
  researchNeedsAnalysisService,
  type analyzeResearchNeedsInputSchema,
  type saveResearchNeedsInputSchema,
} from "./research-needs-analysis.service.js";
import {
  batchLoadLecturerPublications,
  evaluateCandidateRecommendation,
  generateValidatedMentorExplanation,
  tryEmbedQueryText,
} from "./mentor-recommendation.engine.js";
import { createHash, randomUUID } from "node:crypto";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import type { Prisma, MentorshipRequest, MentorRelationship, Project, User, AcademicProfile } from "../../generated/prisma/client.js";
import {
  assertAcademicRelationshipManager, assertVerifiedLecturer, assertAcceptingNewMentorships,
  canManageAcademicRelationships, isVerifiedLecturer
} from "./academic-relationship-access.js";
import { dispatchMentorshipNotifications, mentorshipNotification, type MentorshipEvent } from "./mentorship-notifications.js";
import { mentorshipDiscoveryService } from "./mentorship-discovery.service.js";
import { mentorshipResearchContext, type ContextQuery } from "./mentorship-context.service.js";
import { mentorPositions, assertMentorPosition, mentorshipPolicy } from "./mentorship-positions.js";
import { invitationFiles, attachmentFields, invitationAttachmentDto } from "./mentorship-content.service.js";
import type { AcademicSupportSearch as AcademicSearch, InvitationDossierInput, MentorRole, MentorSuggestionScope, MentorSuggestionStatus, MentorshipRequestStatus } from "@trend/shared-types";
import { initializeMentorAccess, mentorAccessEvent, mentorPolicyDto, validateMentorPermissions } from "./mentor-access.service.js";
import type { MentorPolicyInput } from "@trend/shared-types";
import { ensureMentorPlan, prepareMentorCandidate } from "./mentor-plan.service.js";
import { buildDossierDefaults, buildInvitationDossier, buildMentorInvitationContext, projectRequestDossiers, officialInvitationDossierSchema } from "./mentorship-dossier.js";
import {
  buildResearchTeamDossier,
  clarificationMessageSchema,
  counterProposalSchema,
  formalMentorshipProposalSchema,
  getMyMemberConsent,
  loadMemberConsentSummary,
  memberMentorshipConsentSchema,
  mentorRecruitmentProfileInputSchema,
  normalizeProspectiveAccessForSave,
  parseMentorshipProfile,
  parseTermsSnapshot,
} from "./mentorship-two-way.js";
export type { AcademicSupportSearch as AcademicSearch } from "@trend/shared-types";

type Db = Prisma.TransactionClient;
const emptyActions = { accept: false, decline: false, cancel: false, end: false, openProject: false };
const policy = () => mentorshipPolicy;
type RequestInput = { applicationId?: string; expectedApplicationVersion?: number; mentorUserId?: string; message: string; idempotencyKey?: string; mentorRole?: MentorRole; attachmentIds?: string[]; access?: MentorPolicyInput; expectedPreviewToken?: string; candidateId?: string; expectedPlanVersion?: number; dossier?: InvitationDossierInput };
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
  if (!row || Boolean(row.deletedAt)) throw AppError.notFound("Project not found");
  return row;
}
export function mentorshipPreview(row: Project, teamMemberCount?: number) {
  return {
    ...(readResearchClassification(row.mentorshipClassification) ? { researchClassification: readResearchClassification(row.mentorshipClassification) } : {}), id: publicDatabaseId(row), title: row.title, summary: row.mentorshipSummary ?? "", researchField: row.mentorshipResearchAreas[0],
    ...(teamMemberCount !== undefined ? { teamMemberCount } : {}),
    ...(row.mentorshipSupportTypes.length ? { supportTypes: row.mentorshipSupportTypes as import("@trend/shared-types").ResearchSupportType[] } : {}), researchAreas: row.mentorshipResearchAreas, mentoringNeeds: row.mentorshipNeeds, methodologies: row.mentorshipMethodologies,
    stage: row.status, expertise: row.mentorshipExpertise, discovery: row.mentorshipDiscovery
  };
}
function previewToken(row: Project) {
  // Hash only the approved brief. Unrelated private project edits do not invalidate consent.
  return createHash("sha256").update(JSON.stringify([row.title, row.mentorshipSummary ?? "", row.status,
  row.mentorshipResearchAreas, row.mentorshipExpertise, row.mentorshipNeeds, row.mentorshipMethodologies, row.mentorshipClassification, row.mentorshipSupportTypes])).digest("hex");
}
/** Share only aggregate team size; never expose the membership list before consent. */
export async function mentorshipTeamCounts(projects: Pick<Project, "id" | "ownerId">[], db: Db = getPrisma()) {
  if (!projects.length) return new Map<string, number>();
  const rows = await db.projectMember.groupBy({
    by: ["projectId"],
    where: { status: "ACTIVE", OR: projects.map(p => ({ projectId: p.id, userId: { not: p.ownerId } })) },
    _count: { _all: true }
  });
  const counts = new Map(projects.map(p => [p.id, 1]));
  for (const row of rows) counts.set(row.projectId, row._count._all + 1);
  return counts;
}
function mentorshipPerson(u: Pick<User, "id" | "legacyMongoId" | "fullName" | "avatarUrl" | "institution" | "isActive" | "emailVerifiedAt" | "accountStatus"> | undefined,
  ap: Pick<AcademicProfile, "academicRole" | "roleVerificationStatus" | "positionStatus" | "profileVisibility" | "positionTitle"> | null | undefined, id: string, viewerId?: string) {
  const visible = id === viewerId || ap?.profileVisibility !== "PRIVATE";
  return {
    _id: u ? publicDatabaseId(u) : id, fullName: u?.fullName, avatarUrl: u?.avatarUrl ?? undefined,
    academicRole: visible ? ap?.academicRole ?? undefined : undefined, institutionName: visible ? u?.institution ?? undefined : undefined,
    positionTitle: visible ? ap?.positionTitle ?? undefined : undefined, verifiedLecturer: isVerifiedLecturer(u ?? null, ap ?? null)
  };
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
    const expired = await tx.mentorshipRequest.update({ where: { id: row.id }, data: { status: "EXPIRED", respondedAt: new Date(), closeReason: "REQUEST_EXPIRED" } });
    await syncApplicationRequest(tx, expired, p.ownerId);
    await record(tx, p, null, "MENTORSHIP_EXPIRED", row.id);
    await mentorshipNotification(tx, {
      event: "MENTORSHIP_EXPIRED", recordId: row.id, projectId: p.id, projectTitle: p.title,
      actorId: row.requestedBy, recipients: [p.ownerId, row.mentorUserId]
    });
  }
}
async function present(requests: MentorshipRequest[], relationships: MentorRelationship[], actorId: string, db: Db = getPrisma()) {
  const ids = [...new Set([...requests.flatMap(r => [r.mentorUserId, r.requestedBy]), ...relationships.map(r => r.mentorUserId), actorId])];
  const requestIds = requests.map(r => r.id);
  const [users, profiles, projects, linked, messageCounts] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, institution: true, isActive: true, emailVerifiedAt: true, accountStatus: true } }),
    db.academicProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, academicRole: true, roleVerificationStatus: true, positionStatus: true, profileVisibility: true, positionTitle: true, supportAvailability: true, allowCollaborationRequests: true } }),
    db.project.findMany({ where: { id: { in: [...new Set([...requests, ...relationships].map(r => r.projectId))] } } }),
    db.mentorRelationship.findMany({ where: { sourceRequestId: { in: requestIds } }, select: { id: true, sourceRequestId: true, status: true } }),
    requestIds.length
      ? db.mentorshipRequestMessage.groupBy({ by: ["requestId"], where: { requestId: { in: requestIds } }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const userMap = new Map(users.map(u => [u.id, u])), profileMap = new Map(profiles.map(p => [p.userId, p])), projectMap = new Map(projects.map(p => [p.id, p]));
  const messageCountMap = new Map(messageCounts.map(row => [row.requestId, row._count._all]));
  const teamCounts = await mentorshipTeamCounts(projects, db);
  const positions = new Map(await Promise.all(projects.map(async p => [p.id, await mentorPositions(p.id, db)] as const)));
  const accessRows = await db.mentorAccess.findMany({ where: { requestId: { in: [...requestIds, ...relationships.map(r => r.sourceRequestId)] } } });
  const accessRowByRequestId = new Map(accessRows.map(row => [row.requestId, row]));
  const accessPolicies = new Map(await Promise.all(accessRows.map(async row => [row.requestId, await mentorPolicyDto(db, row)] as const)));
  const accessIds = accessRows.map(row => row.id);
  const shareRows = accessIds.length
    ? await db.mentorResourceShare.findMany({ where: { accessId: { in: accessIds }, revokedAt: null }, select: { accessId: true, title: true } })
    : [];
  const shareTitlesByAccessId = new Map<string, string[]>();
  for (const s of shareRows) {
    const bucket = shareTitlesByAccessId.get(s.accessId) ?? [];
    if (s.title?.trim()) bucket.push(s.title.trim());
    shareTitlesByAccessId.set(s.accessId, bucket);
  }
  const projectPreviewMap = new Map(projects.map(p => [p.id, mentorshipPreview(p, teamCounts.get(p.id))] as const));
  const dossiers = await projectRequestDossiers(db, requests, actorId, accessPolicies, shareTitlesByAccessId, projectPreviewMap);
  const fileLinks = await db.mentorshipRequestAttachment.findMany({ where: { requestId: { in: requests.filter(r => r.requestedBy === actorId || r.mentorUserId === actorId || projectMap.get(r.projectId)?.ownerId === actorId).map(r => r.id) } } });
  const files = await db.mentorshipAttachment.findMany({ where: { id: { in: fileLinks.map(link => link.attachmentId) } }, select: attachmentFields });
  const person = (id: string) => mentorshipPerson(userMap.get(id), profileMap.get(id), id, actorId);
  return {
    requests: requests.map(r => {
      const p = projectMap.get(r.projectId)!, manager = p.ownerId === actorId, mentor = r.mentorUserId === actorId;
      const pending = r.status === "PENDING" && (!r.expiresAt || r.expiresAt > new Date());
      const sender = r.direction === "PROJECT_TO_LECTURER" ? manager : mentor, receiver = r.direction === "PROJECT_TO_LECTURER" ? mentor : manager;
      const mentorProfileRow = profileMap.get(r.mentorUserId);
      const eligible = isVerifiedLecturer(userMap.get(r.mentorUserId) ?? null, mentorProfileRow ?? null);
      const lecturerAccepting = (mentorProfileRow?.supportAvailability as { enabled?: boolean } | null)?.enabled === true && mentorProfileRow?.allowCollaborationRequests !== false;
      const role = r.mentorRole as MentorRole, position = positions.get(p.id)![role];
      const snapshot = r.invitationSnapshot as { project?: ReturnType<typeof mentorshipPreview>; sender?: ReturnType<typeof mentorshipPerson>; previewToken?: string; infoRequest?: { message: string; requestedAt: string; requestedByName?: string } } | null;
      const accessPolicy = accessPolicies.get(r.id);
      const accessRow = accessRowByRequestId.get(r.id);
      const terms = parseTermsSnapshot(r.termsSnapshot);
      const projectOpen = !["ARCHIVED", "COMPLETED"].includes(p.status);
      const ownerMatches = r.direction === "PROJECT_TO_LECTURER"
        ? r.requestedBy === p.ownerId
        : (!accessRow || accessRow.configuredById === p.ownerId);
      const accessValid = !accessPolicy?.revokedAt && (!accessPolicy?.expiresAt || new Date(accessPolicy.expiresAt) > new Date());
      const roleAvailable = positions.get(p.id)!.UNASSIGNED.status !== "ASSIGNED" && (role === "UNASSIGNED" || position.pendingRequests <= 1) && !["ASSIGNED", "LOCKED"].includes(position.status);
      const lecturerStillAvailableForProposal = r.direction !== "LECTURER_TO_PROJECT" || !terms || lecturerAccepting;

      let acceptBlockedReason: string | undefined;
      if (pending && receiver) {
        if (!projectOpen) acceptBlockedReason = "PROJECT_CLOSED";
        else if (!eligible) acceptBlockedReason = "LECTURER_UNVERIFIED";
        else if (!lecturerStillAvailableForProposal) acceptBlockedReason = "LECTURER_NOT_ACCEPTING";
        else if (!ownerMatches) acceptBlockedReason = "OWNER_CHANGED";
        else if (!accessValid) acceptBlockedReason = "ACCESS_REVOKED_OR_EXPIRED";
        else if (!roleAvailable) acceptBlockedReason = "ROLE_OR_CAPACITY_UNAVAILABLE";
      }

      const canAccept = pending && receiver && !acceptBlockedReason;
      const canCounterPropose = pending && receiver && eligible && projectOpen && (r.direction !== "LECTURER_TO_PROJECT" || lecturerAccepting);
      const canClarify = pending && (manager || mentor);

      return {
        kind: "REQUEST" as const, id: r.id, projectId: publicDatabaseId(p), project: snapshot?.project ?? mentorshipPreview(p, teamCounts.get(p.id)), mentorUser: person(r.mentorUserId), requestedBy: snapshot?.sender ?? person(r.requestedBy),
        viewer: sender ? "SENDER" as const : receiver ? "RECIPIENT" as const : "TEAM" as const,
        mentorRole: role, legacyPreview: !snapshot, reviewRequired: pending && role !== "UNASSIGNED" && position.pendingRequests > 1, previewToken: snapshot?.previewToken ?? previewToken(p),
        proposalVersion: r.proposalVersion,
        ...(r.previousRequestId ? { previousRequestId: r.previousRequestId } : {}),
        ...(terms ? { terms } : {}),
        ...(manager || mentor ? { clarificationCount: messageCountMap.get(r.id) ?? 0 } : {}),
        ...(acceptBlockedReason ? { acceptBlockedReason } : {}),
        accessPolicy, attachments: fileLinks.filter(l => l.requestId === r.id).flatMap(l => files.filter(f => f.id === l.attachmentId).map(invitationAttachmentDto)),
        dossier: dossiers.get(r.id),
        infoRequest: manager || mentor || r.requestedBy === actorId ? snapshot?.infoRequest : undefined,
        direction: r.direction as "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT", status: r.status as MentorshipRequestStatus, message: r.message ?? undefined,
        responseNote: manager || mentor || r.requestedBy === actorId ? r.responseNote ?? undefined : undefined,
        closeReason: r.closeReason ?? undefined,
        relationshipId: linked.find(rel => rel.sourceRequestId === r.id)?.id,
        expiresAt: r.expiresAt?.toISOString(), respondedAt: r.respondedAt?.toISOString(), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
        actions: {
          ...emptyActions, cancel: pending && sender, decline: pending && receiver,
          openProject: linked.some(rel => rel.sourceRequestId === r.id && rel.status === "ACTIVE") && (manager || mentor && eligible && Boolean(accessPolicy?.effective)),
          ...(pending && receiver ? { requestInfo: true } : {}),
          ...(canCounterPropose ? { counterPropose: true } : {}),
          ...(canClarify ? { clarify: true } : {}),
          accept: canAccept,
        },
      };
    }),
    relationships: relationships.map(r => {
      const p = projectMap.get(r.projectId)!, principal = p.ownerId === actorId || r.mentorUserId === actorId;
      const active = r.status === "ACTIVE", mentorEligible = isVerifiedLecturer(userMap.get(r.mentorUserId) ?? null, profileMap.get(r.mentorUserId) ?? null);
      return {
        kind: "RELATIONSHIP" as const, id: r.id, mentorRole: r.mentorRole as MentorRole, accessPolicy: accessPolicies.get(r.sourceRequestId), sourceRequestId: r.sourceRequestId, projectId: publicDatabaseId(p), project: mentorshipPreview(p, teamCounts.get(p.id)), mentorUser: person(r.mentorUserId), status: r.status,
        startedAt: r.startedAt.toISOString(), endedAt: r.endedAt?.toISOString(), endedById: r.endedById ?? undefined,
        endReason: principal ? r.endReason ?? undefined : undefined,
        createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), actions: { ...emptyActions, end: active && principal, openProject: active && (p.ownerId === actorId || mentorEligible && Boolean(accessPolicies.get(r.sourceRequestId)?.effective)) }
      };
    }),
  };
}
async function collection(a: Awaited<ReturnType<typeof actor>>, query: AcademicSearch, p?: Project) {
  const db = getPrisma();
  const owned = p ? [] : await db.project.findMany({ where: { ownerId: a.id, deletedAt: null }, select: { id: true } });
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
  // Support paginates invitation history, but current supervisors must stay visible.
  const pinnedActive = p && meta.page > 1 && (!query.view || query.view === "all")
    ? await db.mentorRelationship.findMany({ where: { ...where, status: "ACTIVE" }, orderBy: { startedAt: "asc" } }) : [];
  const visibleRelationships = [...new Map([...pinnedActive, ...relationships].map(row => [row.id, row])).values()];
  return { ...await present(requests, visibleRelationships, a.id), counts: { pending, incoming, active }, policy: policy(), positions: p ? await mentorPositions(p.id) : undefined, requestMeta: meta, relationshipMeta };
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
  async requestDetail(projectInput: string, requestId: string, actorInput: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const db = getPrisma();
    const row = await db.mentorshipRequest.findFirst({ where: { id: requestId, projectId: p.id } });
    if (!row) throw AppError.notFound("Mentorship request not found");
    if (row.mentorUserId !== a.id) await assertTeam(p, a.id);
    const presented = (await present([row], [], a.id, db)).requests[0]!;
    const isPrincipal = p.ownerId === a.id || row.mentorUserId === a.id;
    if (!isPrincipal) return presented;

    // Walk version chain backwards (capped at 20 hops) for revision history and full clarification thread
    const chain: MentorshipRequest[] = [row];
    let cursor = row.previousRequestId;
    while (cursor && chain.length < 20) {
      const prev = await db.mentorshipRequest.findFirst({ where: { id: cursor, projectId: p.id } });
      if (!prev || chain.some(item => item.id === prev.id)) break;
      chain.push(prev);
      cursor = prev.previousRequestId;
    }
    const chainIds = chain.map(item => item.id);
    const [messages, accessForChain, peopleRows, linkedRelationship] = await Promise.all([
      db.mentorshipRequestMessage.findMany({
        where: { requestId: { in: chainIds }, projectId: p.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
      }),
      db.mentorAccess.findMany({
        where: { requestId: { in: chainIds } },
        select: { requestId: true, preset: true, permissions: true },
      }),
      db.user.findMany({
        where: { id: { in: [...new Set([p.ownerId, row.mentorUserId, ...chain.map(c => c.requestedBy)])] } },
        select: { id: true, fullName: true },
      }),
      row.status === "ACCEPTED"
        ? db.mentorRelationship.findFirst({
          where: { projectId: p.id, sourceRequestId: row.id },
          orderBy: { startedAt: "desc" },
        })
        : Promise.resolve(null),
    ]);
    const currentRelationship = linkedRelationship
      ? {
        id: linkedRelationship.id,
        status: linkedRelationship.status as MentorRelationship["status"],
        mentorRole: linkedRelationship.mentorRole as MentorRole,
        startedAt: linkedRelationship.startedAt.toISOString(),
        ...(linkedRelationship.endedAt ? { endedAt: linkedRelationship.endedAt.toISOString() } : {}),
        ...(linkedRelationship.endReason ? { endReason: linkedRelationship.endReason } : {}),
        accessEffective: Boolean(presented.accessPolicy?.effective && linkedRelationship.status === "ACTIVE"),
        accessExpiresAt: presented.accessPolicy?.expiresAt ?? null,
        accessRevokedAt: presented.accessPolicy?.revokedAt ?? null,
      }
      : undefined;
    const nameMap = new Map(peopleRows.map(u => [u.id, u.fullName]));
    const accessMap = new Map(accessForChain.map(acc => [acc.requestId, acc]));
    const clarificationMessages = messages.map(msg => ({
      id: msg.id,
      requestId: msg.requestId,
      authorId: msg.authorId,
      authorName: nameMap.get(msg.authorId) ?? "Participant",
      authorRole: (msg.authorId === row.mentorUserId ? "LECTURER" : "OWNER") as "OWNER" | "LECTURER",
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    }));
    const revisionHistory = [...chain].reverse().map(entry => {
      const entryTerms = parseTermsSnapshot(entry.termsSnapshot);
      const entryAccess = accessMap.get(entry.id);
      return {
        id: entry.id,
        proposalVersion: entry.proposalVersion,
        direction: entry.direction as "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT",
        mentorRole: entry.mentorRole as MentorRole,
        status: entry.status as MentorshipRequestStatus,
        requestedByName: nameMap.get(entry.requestedBy),
        ...(entryTerms?.changeSummary ? { changeSummary: entryTerms.changeSummary } : {}),
        ...(entryTerms?.supportAreas?.length ? { supportAreas: entryTerms.supportAreas } : {}),
        ...(entryTerms?.availability ? { availability: entryTerms.availability } : {}),
        ...(entryAccess ? { accessPreset: entryAccess.preset as import("@trend/shared-types").MentorPreset, accessPermissionCount: entryAccess.permissions.length } : {}),
        createdAt: entry.createdAt.toISOString(),
      };
    });
    return {
      ...presented,
      ...(currentRelationship ? { currentRelationship } : {}),
      clarificationCount: clarificationMessages.length,
      clarificationMessages,
      revisionHistory,
    };
  },
  async mine(actorInput: string, query: AcademicSearch = {}) { const a = await actor(actorInput); await this.expireRequests(); return collection(a, query); },
  async preferences(
    actorInput: string,
    input?: {
      acceptingMentorships?: boolean;
      emailEnabled?: boolean;
      locale?: "en" | "vi";
      maxActiveProjects?: number | null;
      externalGroupCount?: number | null;
      supportTypes?: ResearchSupportType[];
      preferredTopics?: string[];
      preferredRoles?: ("PRIMARY" | "SECONDARY")[];
      expectedFrequency?: string;
      expectedDuration?: string;
      communicationMode?: string;
      note?: string;
    },
  ) {
    const a = await actor(actorInput), db = getPrisma();
    const profile = input ? await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${a.id}::uuid FOR UPDATE`;
      await actor(a.id, tx);
      if (input.acceptingMentorships) await assertVerifiedLecturer(tx, a.id);
      const live = await tx.academicProfile.findUnique({ where: { userId: a.id } });
      if (!live) throw AppError.notFound("Academic profile not found");
      const availability = (live.supportAvailability && typeof live.supportAvailability === "object" && !Array.isArray(live.supportAvailability)
        ? live.supportAvailability
        : {}) as Record<string, unknown>;
      const nextAvailability: Record<string, unknown> = { ...availability };
      let availabilityChanged = false;
      if (input.acceptingMentorships !== undefined) { nextAvailability.enabled = input.acceptingMentorships; availabilityChanged = true; }
      if (input.maxActiveProjects !== undefined) { nextAvailability.maxActiveProjects = input.maxActiveProjects; availabilityChanged = true; }
      if (input.externalGroupCount !== undefined) { nextAvailability.externalGroupCount = input.externalGroupCount; availabilityChanged = true; }
      if (input.supportTypes !== undefined) { nextAvailability.types = [...new Set(input.supportTypes)]; availabilityChanged = true; }
      if (input.preferredTopics !== undefined) { nextAvailability.preferredTopics = [...new Set(input.preferredTopics.map(t => t.trim()).filter(Boolean))].slice(0, 12); availabilityChanged = true; }
      if (input.preferredRoles !== undefined) { nextAvailability.preferredRoles = [...new Set(input.preferredRoles)]; availabilityChanged = true; }
      if (input.expectedFrequency !== undefined) { nextAvailability.expectedFrequency = input.expectedFrequency.trim() || undefined; availabilityChanged = true; }
      if (input.expectedDuration !== undefined) { nextAvailability.expectedDuration = input.expectedDuration.trim() || undefined; availabilityChanged = true; }
      if (input.communicationMode !== undefined) { nextAvailability.communicationMode = input.communicationMode.trim() || undefined; availabilityChanged = true; }
      if (input.note !== undefined) { nextAvailability.note = input.note.trim() || undefined; availabilityChanged = true; }
      if (availabilityChanged) {
        nextAvailability.updatedAt = new Date().toISOString();
      }
      // Note: lowering maxActiveProjects never removes existing active mentored projects.
      return tx.academicProfile.update({
        where: { userId: a.id }, data: {
          ...(availabilityChanged ? { supportAvailability: nextAvailability as Prisma.InputJsonObject } : {}),
          ...(input.emailEnabled !== undefined ? { mentorshipEmailEnabled: input.emailEnabled } : {}),
          ...(input.locale ? { notificationLocale: input.locale } : {}),
        },
      });
    }) : await db.academicProfile.findUnique({ where: { userId: a.id } });
    const canEnable = isVerifiedLecturer(a, profile);
    const support = (profile?.supportAvailability && typeof profile.supportAvailability === "object" && !Array.isArray(profile.supportAvailability)
      ? profile.supportAvailability
      : {}) as {
        enabled?: boolean; maxActiveProjects?: number | null; externalGroupCount?: number | null; updatedAt?: string;
        types?: ResearchSupportType[]; preferredTopics?: string[]; preferredRoles?: ("PRIMARY" | "SECONDARY")[];
        expectedFrequency?: string; expectedDuration?: string; communicationMode?: string; note?: string;
      };
    const privacy = (profile?.privacySettings && typeof profile.privacySettings === "object" && !Array.isArray(profile.privacySettings)
      ? profile.privacySettings
      : {}) as Record<string, unknown>;
    const normalizedExpertise = normalizeAcademicExpertise({
      expertiseAreas: profile?.expertiseAreas ?? [],
      researchSpecializations: profile?.researchSpecializations ?? [],
      skills: profile?.skills ?? [],
      researchMethods: Array.isArray(privacy.researchMethods) ? privacy.researchMethods.filter((v): v is string => typeof v === "string") : [],
    });
    const activeRelationships = await db.mentorRelationship.findMany({
      where: { mentorUserId: a.id, status: "ACTIVE" },
      select: { projectId: true },
    });
    const activeRelProjectIds = [...new Set(activeRelationships.map(r => r.projectId))];
    const liveActiveProjects = activeRelProjectIds.length
      ? await db.project.findMany({
        where: { id: { in: activeRelProjectIds }, deletedAt: null },
        select: { id: true },
      })
      : [];
    const activeProjectCount = liveActiveProjects.length;
    const maxActiveProjects = typeof support.maxActiveProjects === "number" && Number.isInteger(support.maxActiveProjects) && support.maxActiveProjects > 0
      ? support.maxActiveProjects
      : null;
    const externalGroupCount = typeof support.externalGroupCount === "number" && Number.isInteger(support.externalGroupCount) && support.externalGroupCount >= 0
      ? support.externalGroupCount
      : null;
    const remainingSlots = maxActiveProjects !== null ? Math.max(0, maxActiveProjects - activeProjectCount) : null;
    const capacityReached = maxActiveProjects !== null && activeProjectCount >= maxActiveProjects;
    const acceptingMentorships = canEnable && support.enabled === true;
    const effectiveAcceptingMentorships = acceptingMentorships && !capacityReached;
    return {
      acceptingMentorships,
      effectiveAcceptingMentorships,
      capacityReached,
      canEnable, emailEnabled: profile?.mentorshipEmailEnabled ?? true, locale: profile?.notificationLocale ?? "en",
      maxActiveProjects,
      externalGroupCount,
      activeProjectCount,
      remainingSlots,
      capacityUpdatedAt: typeof support.updatedAt === "string" ? support.updatedAt : undefined,
      supportTypes: Array.isArray(support.types) ? support.types : [],
      preferredTopics: Array.isArray(support.preferredTopics) ? support.preferredTopics : [],
      preferredRoles: Array.isArray(support.preferredRoles) ? support.preferredRoles : [],
      ...(typeof support.expectedFrequency === "string" && support.expectedFrequency ? { expectedFrequency: support.expectedFrequency } : {}),
      ...(typeof support.expectedDuration === "string" && support.expectedDuration ? { expectedDuration: support.expectedDuration } : {}),
      ...(typeof support.communicationMode === "string" && support.communicationMode ? { communicationMode: support.communicationMode } : {}),
      ...(typeof support.note === "string" && support.note ? { note: support.note } : {}),
      researchMethods: normalizedExpertise.researchMethods,
      emailDelivery: {
        status: env.EMAIL_DELIVERY_MODE !== "smtp" ? "NOT_CONFIGURED" as const
          : /\.(?:test|invalid|localhost)$/i.test(a.email.split("@")[1] ?? "") ? "TEST_ADDRESS" as const : "READY" as const,
        recipient: a.email,
      },
    };
  },
  async availableMentors(actorInput: string, query: AcademicSearch = {}) {
    const owner = await actor(actorInput);
    return mentorshipDiscoveryService.mentors(null, owner, query);
  },
  async mentors(projectInput: string, actorInput: string, query: AcademicSearch = {}) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await assertTeam(p, a.id); assertOpenProject(p);
    const owner = await getPrisma().user.findUniqueOrThrow({ where: { id: p.ownerId } });
    return mentorshipDiscoveryService.mentors(p, owner, query);
  },
  async mentorEvidence(projectInput: string, actorInput: string, mentorInput: string, locale: "vi" | "en" = "vi") {
    const [p, a, mentor] = await Promise.all([project(projectInput), actor(actorInput), actor(mentorInput)]);
    await assertTeam(p, a.id); assertOpenProject(p);
    const db = getPrisma();
    const profile = await assertAcceptingNewMentorships(db, mentor.id);
    if (!["PUBLIC", "MEMBERS_ONLY"].includes(profile.profileVisibility) || !profile.showInResearcherSearch) throw AppError.notFound("Mentor profile is not available for discovery");

    const baseTopics = [...new Set([...(readResearchClassification(p.researchClassification)?.nodes.map(node => node.name) ?? []), p.researchField ?? "", ...p.researchAreas, ...p.mentorshipResearchAreas, ...p.mentorshipExpertise].filter(Boolean))];
    const [legacyEvidence, plan, pubMap, activeRels, pendingReq, projectActiveRel, completedCount] = await Promise.all([
      lecturerMatchEvidence(mentor.id, a.id, { topics: baseTopics, methodologies: p.mentorshipMethodologies, needs: p.mentorshipNeeds }, { areas: [], methodologies: [], capabilities: [] }, true),
      db.researchPlan.findUnique({ where: { projectId: p.id }, select: { approach: true, problem: true, objectives: true, questions: true, scope: true, methodology: true, searchStrategy: true } }),
      batchLoadLecturerPublications([mentor.id], { includeEmbeddings: true, maxPapersPerLecturer: 12 }),
      db.mentorRelationship.findMany({ where: { mentorUserId: mentor.id, status: "ACTIVE" }, select: { projectId: true } }),
      db.mentorshipRequest.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { direction: true } }),
      db.mentorRelationship.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: "ACTIVE" }, select: { id: true } }),
      db.mentorRelationship.count({ where: { mentorUserId: mentor.id, status: "ENDED" } }),
    ]);

    const otherActiveProjectIds = [...new Set(activeRels.map(r => r.projectId))];
    const liveActiveProjectCount = otherActiveProjectIds.length
      ? await db.project.count({ where: { id: { in: otherActiveProjectIds }, deletedAt: null } })
      : 0;

    const privacy = (profile.privacySettings && typeof profile.privacySettings === "object" && !Array.isArray(profile.privacySettings)
      ? profile.privacySettings
      : {}) as Record<string, unknown>;
    const expertiseVisible = !privacy.expertise || ["PUBLIC", "REGISTERED_USERS"].includes(String(privacy.expertise));
    const interestsVisible = !privacy.researchInterests || ["PUBLIC", "REGISTERED_USERS"].includes(String(privacy.researchInterests));
    const supportObj = (profile.supportAvailability && typeof profile.supportAvailability === "object" && !Array.isArray(profile.supportAvailability)
      ? profile.supportAvailability
      : {}) as Record<string, unknown>;
    const supportTypes = Array.isArray(supportObj.types) ? supportObj.types.filter((s): s is ResearchSupportType => typeof s === "string") : [];
    const preferredTopics = Array.isArray(supportObj.preferredTopics) ? supportObj.preferredTopics.filter((s): s is string => typeof s === "string") : [];
    const preferredTopicIds = Array.isArray(supportObj.preferredTopicIds) ? supportObj.preferredTopicIds.filter((s): s is string => typeof s === "string") : [];
    const maxActiveProjects = typeof supportObj.maxActiveProjects === "number" && Number.isInteger(supportObj.maxActiveProjects) && supportObj.maxActiveProjects > 0
      ? supportObj.maxActiveProjects
      : null;
    const researchMethods = expertiseVisible && Array.isArray(privacy.researchMethods)
      ? privacy.researchMethods.filter((s): s is string => typeof s === "string")
      : [];

    const ctx = buildAuthorizedNeedsContext(p, plan, locale);
    const savedNeeds = ctx.profile.researchSupportNeeds ?? [];
    const effectiveNeeds = savedNeeds.length > 0 ? savedNeeds : analyzeResearchNeedsDeterministic(ctx, { locale });
    const candidatePubs = pubMap.get(mentor.id) ?? [];
    const projectQueryEmbedding = candidatePubs.some(pub => Boolean(pub.embedding?.length))
      ? await tryEmbedQueryText(ctx.combinedText.slice(0, 1200))
      : null;

    const scored = evaluateCandidateRecommendation(
      {
        projectId: p.id,
        publicProjectId: publicDatabaseId(p),
        stage: ctx.stage,
        classification: readResearchClassification(p.researchClassification),
        wantedTerms: baseTopics,
        wantedMethods: p.mentorshipMethodologies,
        wantedSupportTypes: (p.mentorshipSupportTypes ?? []) as ResearchSupportType[],
        needs: effectiveNeeds,
        hasSufficientContext: ctx.contextSummary.completeness !== "SPARSE",
        locale,
      },
      {
        lecturerId: mentor.id,
        publicId: publicDatabaseId(mentor),
        fullName: mentor.fullName,
        institutionName: mentor.institution ?? undefined,
        positionTitle: profile.positionTitle ?? undefined,
        verifiedLecturer: true,
        profileVisible: legacyEvidence.profileVisible,
        acceptingNew: supportObj.enabled === true,
        allowCollaborationRequests: profile.allowCollaborationRequests,
        activeProjectCount: liveActiveProjectCount,
        maxActiveProjects,
        completedMentorshipCount: completedCount,
        ...(projectActiveRel ? { mentorshipStatus: "ACTIVE" as const } : pendingReq ? { mentorshipStatus: "PENDING" as const, pendingRequestDirection: pendingReq.direction as "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT" } : {}),
        classification: expertiseVisible ? readResearchClassification(profile.researchClassification) : undefined,
        expertiseAreas: expertiseVisible ? profile.expertiseAreas : [],
        researchSpecializations: expertiseVisible ? profile.researchSpecializations : [],
        skills: expertiseVisible ? profile.skills : [],
        researchMethods,
        researchKeywords: expertiseVisible ? profile.researchKeywords : [],
        researchInterests: interestsVisible ? mentor.researchInterests : [],
        supportTypes,
        preferredTopics,
        preferredTopicIds,
        publications: candidatePubs,
      },
      { projectQueryEmbedding },
    );

    const enrichedPublications = scored.publicationEvidence.length > 0
      ? scored.publicationEvidence.map(pub => ({
          paperId: pub.paperId,
          title: pub.title,
          year: pub.year,
          authors: pub.authors,
          venue: pub.venue,
          doi: pub.doi,
          source: pub.source,
          href: pub.href,
          matchedTerms: pub.matchedTerms,
          relatedNeedIds: pub.relatedNeedIds,
          evidenceScope: pub.evidenceScope,
          evidenceExcerpt: pub.evidenceExcerpt,
          explanation: pub.explanation,
          attribution: pub.attributionStatus,
        }))
      : legacyEvidence.publications;

    return {
      ...legacyEvidence,
      method: "HYBRID_EVIDENCE_V2" as const,
      publications: enrichedPublications,
      recommendation: scored.recommendation,
      evidenceItems: scored.evidenceItems,
      publicationEvidence: scored.publicationEvidence,
      missingReasons: scored.recommendation.uncertainties,
      canGenerateAiExplanation: p.aiDataPolicy !== "DISABLED",
      ...(p.aiDataPolicy === "DISABLED"
        ? { aiExplanationDisabledReason: locale === "vi" ? "Chính sách AI của dự án đang tắt xử lý AI." : "Project AI policy disables AI processing." }
        : {}),
    };
  },
  async getResearchNeeds(projectInput: string, actorInput: string, locale: "vi" | "en" = "vi") {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await assertTeam(p, a.id);
    return researchNeedsAnalysisService.getCurrentNeeds(p.id, a.id, locale);
  },
  async analyzeResearchNeeds(projectInput: string, actorInput: string, input: import("zod").infer<typeof analyzeResearchNeedsInputSchema>) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await assertTeam(p, a.id);
    assertOpenProject(p);
    return researchNeedsAnalysisService.analyze(p, a.id, input);
  },
  async saveResearchNeeds(projectInput: string, actorInput: string, input: import("zod").infer<typeof saveResearchNeedsInputSchema>) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    return researchNeedsAnalysisService.saveConfirmedNeeds(p.id, a.id, input);
  },
  async explainMentorRecommendation(projectInput: string, actorInput: string, mentorInput: string, locale: "vi" | "en" = "vi") {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const evidence = await this.mentorEvidence(p.id, a.id, mentorInput, locale);
    if (!evidence.recommendation) {
      throw AppError.notFound("Mentor recommendation context unavailable");
    }
    return generateValidatedMentorExplanation(
      {
        lecturerId: evidence.recommendation.lecturerId,
        internalScore: 0,
        dimensionScores: { topicTaxonomy: 0, publicationEvidence: 0, declaredSupport: 0, methodology: 0, researchStage: 0, semantic: null },
        recommendation: evidence.recommendation,
        evidenceItems: evidence.evidenceItems ?? [],
        publicationEvidence: evidence.publicationEvidence ?? [],
      },
      { actorId: a.id, aiPolicyAllowed: p.aiDataPolicy !== "DISABLED", locale },
    );
  },
  async suggestions(projectInput: string, actorInput: string, query: AcademicSearch & { scope?: MentorSuggestionScope } = {}) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await assertTeam(p, a.id);
    const db = getPrisma();
    const scope: MentorSuggestionScope = query.scope ?? "pending";
    const where: Prisma.MentorSuggestionWhereInput = {
      projectId: p.id,
      ...(scope === "pending"
        ? { status: "PENDING" }
        : scope === "mine"
          ? { suggestedBy: a.id }
          : scope === "history"
            ? { status: { not: "PENDING" } }
            : {}),
    };
    const [total, pendingCount, totalCount, mineCount, minePendingCount] = await Promise.all([
      db.mentorSuggestion.count({ where }),
      db.mentorSuggestion.count({ where: { projectId: p.id, status: "PENDING" } }),
      db.mentorSuggestion.count({ where: { projectId: p.id } }),
      db.mentorSuggestion.count({ where: { projectId: p.id, suggestedBy: a.id } }),
      db.mentorSuggestion.count({ where: { projectId: p.id, suggestedBy: a.id, status: "PENDING" } }),
    ]);
    const meta = pageMeta(total, query);
    const rows = await db.mentorSuggestion.findMany({
      where,
      orderBy: scope === "all"
        ? [{ status: "desc" }, { createdAt: "desc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "asc" }],
      take: meta.pageSize,
      skip: (meta.page - 1) * meta.pageSize,
    });
    if (!rows.length) {
      return { items: [], meta, counts: { pending: pendingCount, total: totalCount, mine: mineCount, minePending: minePendingCount } };
    }
    const userIds = [...new Set(rows.flatMap(r => [r.mentorUserId, r.suggestedBy, ...(r.resolvedBy ? [r.resolvedBy] : [])]))];
    const mentorIds = [...new Set(rows.map(r => r.mentorUserId))];
    const requestIds = [...new Set(rows.map(r => r.requestId).filter((id): id is string => Boolean(id)))];
    const [users, profiles, activePlan, pendingRequests, activeRelationships, linkedRequests, dismissActivities] = await Promise.all([
      db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, institution: true, isActive: true, emailVerifiedAt: true, accountStatus: true } }),
      db.academicProfile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, academicRole: true, roleVerificationStatus: true, positionStatus: true, profileVisibility: true, positionTitle: true, expertiseAreas: true, privacySettings: true, supportAvailability: true } }),
      db.mentorInvitationPlan.findFirst({ where: { projectId: p.id, status: "ACTIVE" } }),
      db.mentorshipRequest.findMany({ where: { projectId: p.id, mentorUserId: { in: mentorIds }, status: "PENDING" }, select: { id: true, mentorUserId: true } }),
      db.mentorRelationship.findMany({ where: { projectId: p.id, mentorUserId: { in: mentorIds }, status: "ACTIVE" }, select: { sourceRequestId: true, mentorUserId: true } }),
      requestIds.length ? db.mentorshipRequest.findMany({ where: { id: { in: requestIds } }, select: { id: true, status: true } }) : Promise.resolve([]),
      db.projectActivity.findMany({ where: { projectId: p.id, type: "MENTORSHIP_SUGGESTION_DISMISSED", entityId: { in: rows.filter(r => r.status === "DISMISSED").map(r => r.id) } }, orderBy: { createdAt: "desc" } }),
    ]);
    const activePlanCandidates = activePlan
      ? await db.mentorCandidate.findMany({ where: { planId: activePlan.id, status: { not: "REMOVED" } } })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));
    const profileMap = new Map(profiles.map(ap => [ap.userId, ap]));
    const planCandidates = new Map(activePlanCandidates.map(c => [c.mentorUserId, c]));
    const pendingReqSet = new Set(pendingRequests.map(r => r.mentorUserId));
    const activeRelSet = new Set(activeRelationships.map(r => r.mentorUserId));
    const linkedReqMap = new Map(linkedRequests.map(r => [r.id, r.status as MentorshipRequestStatus]));
    const dismissReasonMap = new Map<string, string>();
    for (const act of dismissActivities) {
      if (act.entityId && !dismissReasonMap.has(act.entityId)) {
        const metaObj = act.metadata as { reason?: unknown } | null;
        if (typeof metaObj?.reason === "string" && metaObj.reason.trim()) dismissReasonMap.set(act.entityId, metaObj.reason.trim());
      }
    }
    const person = (id: string) => mentorshipPerson(userMap.get(id), profileMap.get(id), id, a.id);
    return {
      items: rows.map(r => {
        const mentorProfile = profileMap.get(r.mentorUserId);
        const mentorUserRow = userMap.get(r.mentorUserId);
        const privacy = (mentorProfile?.privacySettings as Record<string, unknown> | null) ?? null;
        const expertiseVisible = !privacy || ["PUBLIC", "REGISTERED_USERS", undefined].includes(privacy.expertise as string | undefined);
        const planCandidate = planCandidates.get(r.mentorUserId);
        const verifiedAvailable = isVerifiedLecturer(mentorUserRow ?? null, mentorProfile ?? null) && (mentorProfile?.supportAvailability as { enabled?: boolean } | null)?.enabled === true;
        return {
          id: r.id,
          projectId: publicDatabaseId(p),
          mentorUser: person(r.mentorUserId),
          suggestedBy: person(r.suggestedBy),
          message: r.message,
          status: r.status as MentorSuggestionStatus,
          createdAt: r.createdAt.toISOString(),
          ...(expertiseVisible && mentorProfile?.expertiseAreas?.length ? { expertiseAreas: mentorProfile.expertiseAreas } : {}),
          acceptingMentorships: verifiedAvailable,
          ...(r.resolvedAt ? { resolvedAt: r.resolvedAt.toISOString() } : {}),
          ...(r.resolvedBy ? { resolvedBy: person(r.resolvedBy) } : {}),
          ...(r.requestId || pendingReqSet.has(r.mentorUserId) || activeRelSet.has(r.mentorUserId) ? { requestId: pendingRequests.find(item => item.mentorUserId === r.mentorUserId)?.id ?? activeRelationships.find(item => item.mentorUserId === r.mentorUserId)?.sourceRequestId ?? r.requestId ?? undefined, requestStatus: pendingReqSet.has(r.mentorUserId) ? "PENDING" as const : activeRelSet.has(r.mentorUserId) ? "ACCEPTED" as const : linkedReqMap.get(r.requestId!) } : {}),
          ...(planCandidate ? { inRecruitmentPlan: true, plannedRole: planCandidate.mentorRole as MentorRole } : { inRecruitmentPlan: false }),
          hasPendingRequest: pendingReqSet.has(r.mentorUserId),
          hasActiveRelationship: activeRelSet.has(r.mentorUserId),
          ...(dismissReasonMap.has(r.id) ? { dismissReason: dismissReasonMap.get(r.id) } : {}),
        };
      }),
      meta,
      counts: { pending: pendingCount, total: totalCount, mine: mineCount, minePending: minePendingCount },
    };
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
      await mentorshipNotification(tx, {
        event: "MENTORSHIP_SUGGESTED",
        recordId: row.id,
        projectId: p.id,
        projectTitle: live.title,
        actorId: a.id,
        recipients: [live.ownerId],
        customMessage: {
          vi: `${a.fullName} đã đề xuất ${mentor.fullName} làm cố vấn cho dự án ${live.title}.`,
          en: `${a.fullName} suggested ${mentor.fullName} as a mentor for ${live.title}.`,
        },
      });
      return { id: row.id };
    });
    await dispatchMentorshipNotifications(); return result;
  },
  async dismissSuggestion(projectInput: string, suggestionId: string, actorInput: string, reason?: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const trimmedReason = reason?.trim();
    const result = await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id]); const live = await assertAcademicRelationshipManager(p.id, a.id, tx); assertOpenProject(live);
      const row = await tx.mentorSuggestion.findFirst({ where: { id: suggestionId, projectId: p.id } });
      if (!row) throw AppError.notFound("Mentor suggestion not found");
      if (row.status === "DISMISSED") return { id: row.id, notify: false };
      if (row.status !== "PENDING") throw AppError.conflict("This suggestion has already been handled");
      const mentorUser = await tx.user.findUnique({ where: { id: row.mentorUserId }, select: { fullName: true } });
      await tx.mentorSuggestion.update({ where: { id: row.id }, data: { status: "DISMISSED", resolvedBy: a.id, resolvedAt: new Date() } });
      await record(tx, live, a.id, "MENTORSHIP_SUGGESTION_DISMISSED", row.id, trimmedReason ? { reason: trimmedReason } : {});
      if (row.suggestedBy !== a.id) {
        const mentorName = mentorUser?.fullName ?? "giảng viên";
        await mentorshipNotification(tx, {
          event: "MENTORSHIP_SUGGESTION_DISMISSED",
          recordId: row.id,
          projectId: p.id,
          projectTitle: live.title,
          actorId: a.id,
          recipients: [row.suggestedBy],
          customMessage: {
            vi: `Chủ dự án đã bỏ qua đề xuất mời ${mentorName} cho dự án ${live.title}.${trimmedReason ? ` Ghi chú: ${trimmedReason}` : ""}`,
            en: `The project owner dismissed your mentor suggestion for ${mentorName} in ${live.title}.${trimmedReason ? ` Note: ${trimmedReason}` : ""}`,
          },
        });
      }
      return { id: row.id, notify: row.suggestedBy !== a.id };
    });
    if (result.notify) await dispatchMentorshipNotifications();
    return { id: result.id };
  },
  async discovery(actorInput: string, query: AcademicSearch = {}) {
    const a = await actor(actorInput), profile = await assertAcceptingNewMentorships(getPrisma(), a.id);
    return mentorshipDiscoveryService.opportunities(a, profile, query);
  },
  async opportunityDossier(projectInput: string, actorInput: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const db = getPrisma();
    await assertVerifiedLecturer(db, a.id);
    const [existingReq, existingRel, activeMember] = await Promise.all([
      db.mentorshipRequest.findFirst({ where: { projectId: p.id, mentorUserId: a.id, status: "PENDING" }, select: { id: true } }),
      db.mentorRelationship.findFirst({ where: { projectId: p.id, mentorUserId: a.id, status: "ACTIVE" }, select: { id: true } }),
      db.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: a.id } }, select: { status: true } }),
    ]);
    if (p.ownerId === a.id || activeMember?.status === "ACTIVE") {
      throw AppError.forbidden("Project members cannot view lecturer discovery dossiers as external mentors");
    }
    const hasRelationshipContext = Boolean(existingReq || existingRel);
    if (!hasRelationshipContext) {
      await assertAcceptingNewMentorships(db, a.id);
      if (p.mentorshipDiscovery !== "SEEKING_MENTOR" || ["ARCHIVED", "COMPLETED"].includes(p.status)) {
        throw AppError.notFound("Research team dossier is not open for mentor discovery");
      }
      await actor(p.ownerId, db);
    }
    return buildResearchTeamDossier(db, p, previewToken(p), { viewerUserId: a.id });
  },
  async previewTeamDossier(projectInput: string, actorInput: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const db = getPrisma();
    await assertAcademicRelationshipManager(p.id, a.id, db);
    return buildResearchTeamDossier(db, p, previewToken(p), { isOwnerPreview: true });
  },
  async myProfileConsent(projectInput: string, actorInput: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    return getMyMemberConsent(getPrisma(), p, a.id);
  },
  async updateMyProfileConsent(projectInput: string, actorInput: string, rawInput: unknown) {
    const input = memberMentorshipConsentSchema.parse(rawInput);
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    return getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id]);
      const live = await project(p.id, tx);
      await assertTeam(live, a.id, tx);
      assertOpenProject(live);
      const now = new Date();
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: live.id, userId: a.id } },
        create: {
          projectId: live.id,
          userId: a.id,
          role: live.ownerId === a.id ? "OWNER" : "MEMBER",
          status: "ACTIVE",
          mentorshipProfileShared: input.shared,
          mentorshipRoleNote: input.roleNote?.trim() || null,
          mentorshipConsentUpdatedAt: now,
        },
        update: {
          mentorshipProfileShared: input.shared,
          ...(input.roleNote !== undefined ? { mentorshipRoleNote: input.roleNote.trim() || null } : {}),
          mentorshipConsentUpdatedAt: now,
        },
      });
      await record(tx, live, a.id, "MENTOR_DISCOVERY_UPDATED", live.id, { memberConsentChanged: true, shared: input.shared });
      return getMyMemberConsent(tx, live, a.id);
    });
  },
  async topicSuggestions(projectInput: string, actorInput: string, input: { authorized: true; expectedVersion: number } | { jobId: string }) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await assertAcademicRelationshipManager(p.id, a.id);
    if ("jobId" in input) return mentorshipTopicSuggestions.status(p.id, a.id, input.jobId);
    if (input.authorized !== true) throw AppError.forbidden("Authorize sharing the approved research brief first");
    if (input.expectedVersion !== p.version) throw AppError.conflict("Save and review the latest approved introduction first");
    const result = await mentorshipTopicSuggestions.start(p.id, a.id);
    await record(getPrisma(), p, a.id, "MENTOR_CLASSIFICATION_REQUESTED", p.id, { provider: "OPENALEX", approvedVersion: p.version });
    return result;
  },
  async settings(
    projectInput: string,
    actorInput: string,
    input?: {
      supportTypes?: ResearchSupportType[];
      researchClassification?: import("@trend/shared-types").ResearchClassificationInput;
      discovery: "CLOSED" | "SEEKING_MENTOR";
      summary: string;
      expertise: string[];
      researchAreas?: string[];
      mentoringNeeds?: string;
      methodologies?: string[];
      mentorshipProfile?: MentorRecruitmentProfile;
      expectedVersion?: number;
    },
  ) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    await assertAcademicRelationshipManager(p.id, a.id);
    const db = getPrisma();
    const ap = await db.academicProfile.findUnique({ where: { userId: a.id } });
    const invitationSender = mentorshipPerson(a, ap, a.id);
    if (!input) {
      const parsedProfile = parseMentorshipProfile(p.mentorshipProfile);
      const [plan, teamCounts, invitationContext, dossierDefaults, memberConsentSummary, sharedFilesRaw] = await Promise.all([
        db.researchPlan.findUnique({ where: { projectId: p.id }, select: { objectives: true, searchStrategy: true } }),
        mentorshipTeamCounts([p], db),
        buildMentorInvitationContext(db, p, a.id),
        buildDossierDefaults(db, p, a.id),
        loadMemberConsentSummary(db, p),
        parsedProfile.sharedAttachmentIds?.length
          ? db.mentorshipAttachment.findMany({ where: { id: { in: parsedProfile.sharedAttachmentIds }, projectId: p.id, uploadedById: p.ownerId }, select: attachmentFields })
          : Promise.resolve([]),
      ]);
      return {
        ...mentorshipPreview(p, teamCounts.get(p.id)),
        researchClassification: readResearchClassification(p.researchClassification),
        previewToken: previewToken(p),
        version: p.version,
        invitationSender,
        invitationContext,
        dossierDefaults,
        mentorshipProfile: parsedProfile,
        sharedAttachments: sharedFilesRaw.map(invitationAttachmentDto),
        memberConsentSummary,
        invitationDefaults: { researchField: p.researchField || p.researchAreas[0] || undefined, summary: (p.mentorshipSummary || p.publicSummary || p.description || "").slice(0, 2000), goal: (plan?.objectives?.[0] || p.description || "").slice(0, 500), keywords: [...new Set([...(p.researchKeywords.length ? p.researchKeywords : (plan?.searchStrategy?.split(/[,;\n]/) ?? [])), ...p.researchAreas, ...p.mentorshipResearchAreas, ...p.mentorshipExpertise].map(term => term.trim()).filter(term => term.length > 0 && term.length <= 50))].slice(0, 12) },
      };
    }
    return db.$transaction(async tx => {
      await locks(tx, p.id, [a.id]); const live = await assertAcademicRelationshipManager(p.id, a.id, tx); assertOpenProject(live);
      if (input.expectedVersion !== undefined && input.expectedVersion !== live.version) throw AppError.conflict("Project settings changed. Refresh before saving again");
      if (input.discovery === "SEEKING_MENTOR" && input.summary.trim().length < 10) throw AppError.badRequest("Add a safe summary before opening discovery");
      const classification = input.researchClassification ? await resolveResearchClassification(input.researchClassification, tx) : undefined;
      let nextMentorshipProfile: Prisma.InputJsonValue | undefined;
      if (input.mentorshipProfile !== undefined) {
        const parsedInput = mentorRecruitmentProfileInputSchema.parse(input.mentorshipProfile);
        const existingProfile = parseMentorshipProfile(live.mentorshipProfile);
        if (parsedInput.sharedAttachmentIds?.length) {
          await invitationFiles(tx, live.id, a.id, parsedInput.sharedAttachmentIds);
        }
        const prospectiveAccess = parsedInput.prospectiveAccess === undefined
          ? existingProfile.prospectiveAccess ?? null
          : parsedInput.prospectiveAccess === null
            ? null
            : normalizeProspectiveAccessForSave(parsedInput.prospectiveAccess, a.id);
        const mergedProfile: MentorRecruitmentProfile = {
          ...existingProfile,
          ...parsedInput,
          ...(prospectiveAccess ? { prospectiveAccess } : { prospectiveAccess: null }),
        };
        if (!prospectiveAccess) delete mergedProfile.prospectiveAccess;
        nextMentorshipProfile = JSON.parse(JSON.stringify(mergedProfile)) as Prisma.InputJsonValue;
      }
      const updated = await tx.project.update({
        where: { id: p.id },
        data: {
          ...(classification ? { researchClassification: classification as never, mentorshipClassification: classification as never } : {}),
          ...(nextMentorshipProfile !== undefined ? { mentorshipProfile: nextMentorshipProfile } : {}),
          mentorshipSupportTypes: input.supportTypes,
          mentorshipMethodologies: input.methodologies,
          mentorshipDiscovery: input.discovery,
          mentorshipSummary: input.summary,
          mentorshipExpertise: input.expertise,
          mentorshipResearchAreas: input.researchAreas,
          mentorshipNeeds: input.mentoringNeeds,
          version: { increment: 1 },
        },
      });
      await record(tx, live, a.id, "MENTOR_DISCOVERY_UPDATED", p.id, { discovery: input.discovery });
      const parsedUpdatedProfile = parseMentorshipProfile(updated.mentorshipProfile);
      const sharedFilesRaw = parsedUpdatedProfile.sharedAttachmentIds?.length
        ? await tx.mentorshipAttachment.findMany({ where: { id: { in: parsedUpdatedProfile.sharedAttachmentIds }, projectId: updated.id, uploadedById: updated.ownerId }, select: attachmentFields })
        : [];
      return {
        ...mentorshipPreview(updated, (await mentorshipTeamCounts([updated], tx)).get(updated.id)),
        previewToken: previewToken(updated),
        version: updated.version,
        invitationSender,
        invitationContext: await buildMentorInvitationContext(tx, updated, a.id),
        dossierDefaults: await buildDossierDefaults(tx, updated, a.id),
        mentorshipProfile: parsedUpdatedProfile,
        sharedAttachments: sharedFilesRaw.map(invitationAttachmentDto),
        memberConsentSummary: await loadMemberConsentSummary(tx, updated),
      };
    });
  },
  async previewDossier(projectInput: string, actorInput: string, input: { mentorUserId: string; message?: string; mentorRole?: MentorRole; access?: MentorPolicyInput; dossier?: InvitationDossierInput }) {
    const [p, a, mentor] = await Promise.all([project(projectInput), actor(actorInput), actor(input.mentorUserId)]);
    await assertAcademicRelationshipManager(p.id, a.id);
    assertOpenProject(p);
    return buildInvitationDossier(getPrisma(), {
      project: p,
      representativeUserId: a.id,
      mentorUserId: mentor.id,
      viewerId: mentor.id,
      message: input.message ?? "",
      mentorRole: input.mentorRole ?? "UNASSIGNED",
      access: input.access,
      dossier: input.dossier,
    });
  },
  async request(p: string, a: string, input: RequestInput & { mentorUserId: string }) { return this.create(p, a, input, "PROJECT_TO_LECTURER"); },
  async offer(p: string, a: string, input: RequestInput) { return mentorshipApplicationsService.legacyOffer(p, a, { ...input, mentorRole: input.mentorRole === "UNASSIGNED" ? undefined : input.mentorRole }); },
  /** Flow A — Lecturer submits a formal version-bound proposal against Owner's approved prospective access policy. */
  async propose(projectInput: string, actorInput: string, rawInput: unknown) {
    if (rawInput && typeof rawInput === "object" && "access" in (rawInput as Record<string, unknown>)) {
      throw AppError.forbidden("Lecturers cannot grant or self-configure project access permissions");
    }
    const input = formalMentorshipProposalSchema.parse(rawInput);
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const row = await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id, p.ownerId]);
      const live = await project(p.id, tx);
      await actor(a.id, tx);
      await actor(live.ownerId, tx);

      const previous = await tx.mentorshipRequest.findUnique({
        where: { requestedBy_idempotencyKey: { requestedBy: a.id, idempotencyKey: input.idempotencyKey } },
      });
      if (previous) {
        const prevTerms = parseTermsSnapshot(previous.termsSnapshot);
        if (
          previous.projectId !== p.id ||
          previous.mentorUserId !== a.id ||
          previous.direction !== "LECTURER_TO_PROJECT" ||
          previous.mentorRole !== input.mentorRole ||
          previous.message !== input.message.trim() ||
          prevTerms?.prospectivePolicyHash !== input.expectedPolicyHash ||
          !isDeepStrictEqual(prevTerms?.supportAreas ?? [], input.supportAreas)
        ) {
          throw AppError.conflict("Idempotency key was already used for a different proposal");
        }
        return previous;
      }

      assertOpenProject(live);
      if (live.mentorshipDiscovery !== "SEEKING_MENTOR" || (live.mentorshipSummary?.trim().length ?? 0) < 10) {
        throw AppError.conflict("This project is not currently open to mentorship proposals");
      }
      const profile = await assertAcceptingNewMentorships(tx, a.id);
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: a.id } } });
      if (live.ownerId === a.id || member?.status === "ACTIVE") {
        throw AppError.forbidden("Project members cannot propose themselves as academic mentor");
      }

      // Check lecturer's own active capacity limit before sending a formal proposal
      const rawCap = (profile.supportAvailability as { maxActiveProjects?: unknown } | null)?.maxActiveProjects;
      if (typeof rawCap === "number" && Number.isInteger(rawCap) && rawCap > 0) {
        const activeMentorRels = await tx.mentorRelationship.findMany({ where: { mentorUserId: a.id, status: "ACTIVE" }, select: { projectId: true } });
        const otherProjectIds = [...new Set(activeMentorRels.map(r => r.projectId).filter(pid => pid !== p.id))];
        const distinctOther = otherProjectIds.length ? await tx.project.count({ where: { id: { in: otherProjectIds }, deletedAt: null } }) : 0;
        if (distinctOther >= rawCap) {
          throw AppError.conflict("Mentorship capacity limit reached. Adjust your mentoring capacity settings before sending a new proposal.");
        }
      }

      // Bind explicit lecturer consent to the exact discovery version and owner-approved prospective access policy
      if (input.expectedDiscoveryVersion !== live.version) {
        throw AppError.conflict("The research team dossier changed. Refresh and review the latest terms before proposing.");
      }
      const parsedProfile = parseMentorshipProfile(live.mentorshipProfile);
      const prospectiveAccess = parsedProfile.prospectiveAccess;
      if (!prospectiveAccess) {
        throw AppError.conflict("The project owner has not configured a prospective access policy for direct mentorship proposals yet.");
      }
      if (prospectiveAccess.expiresAt && new Date(prospectiveAccess.expiresAt) <= new Date()) {
        throw AppError.conflict("The project's prospective access policy has expired. Wait for the owner to update it.");
      }
      if (prospectiveAccess.policyHash !== input.expectedPolicyHash) {
        throw AppError.conflict("The prospective access policy changed. Review the updated permissions before confirming.");
      }
      if (parsedProfile.recruitingRoles?.length && input.mentorRole !== "UNASSIGNED" && !parsedProfile.recruitingRoles.includes(input.mentorRole)) {
        throw AppError.conflict("This mentor role is not open for recruitment in this project");
      }

      await expireInProject(tx, live);
      const now = new Date();
      await assertMentorPosition(tx, p.id, input.mentorRole, true);
      if (input.mentorRole !== "UNASSIGNED") {
        const plan = await tx.mentorInvitationPlan.findFirst({ where: { projectId: p.id, status: "ACTIVE" } });
        if (plan?.closedRoles.includes(input.mentorRole)) {
          throw AppError.conflict("This mentor role is closed for recruitment");
        }
      }

      // Cross-direction duplicate & active relationship guard
      const existingPending = await tx.mentorshipRequest.findFirst({
        where: { projectId: p.id, mentorUserId: a.id, status: "PENDING" },
        select: { id: true, direction: true },
      });
      if (existingPending) {
        throw AppError.conflict(
          existingPending.direction === "PROJECT_TO_LECTURER"
            ? "This research team has already invited you. Open the existing invitation to respond."
            : "You already have a pending mentorship proposal for this project.",
        );
      }
      if (await tx.mentorRelationship.findFirst({ where: { projectId: p.id, mentorUserId: a.id, status: "ACTIVE" } })) {
        throw AppError.conflict("An active mentorship relationship already exists with this project");
      }
      if (await tx.mentorshipRequest.findFirst({
        where: { projectId: p.id, mentorUserId: a.id, status: { in: ["DECLINED", "CANCELLED", "CANCELED_BY_PROJECT"] }, respondedAt: { gt: new Date(now.getTime() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000) } },
      })) {
        throw AppError.conflict("Wait before sending another mentorship proposal to this project");
      }
      if (await tx.mentorshipRequest.count({ where: { requestedBy: a.id, createdAt: { gt: new Date(now.getTime() - 3600000) } } }) >= env.ACADEMIC_RELATIONSHIP_REQUEST_LIMIT) {
        throw AppError.conflict("Mentorship request limit reached; try later");
      }

      const teamCounts = await mentorshipTeamCounts([live], tx);
      const snapshot = JSON.parse(JSON.stringify({
        project: mentorshipPreview(live, teamCounts.get(live.id)),
        sender: mentorshipPerson(a, profile, a.id),
        previewToken: previewToken(live),
      })) as Prisma.InputJsonValue;

      const termsSnapshot = JSON.parse(JSON.stringify({
        proposalKind: "FORMAL_PROPOSAL",
        supportAreas: input.supportAreas,
        ...(input.availability ? { availability: input.availability } : {}),
        prospectivePolicyHash: prospectiveAccess.policyHash,
        prospectivePolicyVersion: live.version,
        consentConfirmedAt: now.toISOString(),
        consentActorId: a.id,
      })) as Prisma.InputJsonValue;

      const created = await tx.mentorshipRequest.create({
        data: {
          projectId: p.id,
          mentorUserId: a.id,
          requestedBy: a.id,
          direction: "LECTURER_TO_PROJECT",
          mentorRole: input.mentorRole,
          message: input.message.trim(),
          idempotencyKey: input.idempotencyKey,
          proposalVersion: 1,
          invitationSnapshot: snapshot,
          termsSnapshot,
          expiresAt: null,
        },
      });

      // Initialize pending MentorAccess strictly from Owner's approved prospective policy (NEVER lecturer input).
      await initializeMentorAccess(tx, created, live.ownerId, {
        preset: prospectiveAccess.preset,
        permissions: prospectiveAccess.permissions,
        expiresAt: prospectiveAccess.expiresAt,
      });

      await record(tx, live, a.id, "MENTORSHIP_OFFER_RECEIVED", created.id, {
        proposalVersion: 1,
        mentorRole: input.mentorRole,
        prospectivePolicyHash: prospectiveAccess.policyHash ?? null,
      });
      await mentorshipNotification(tx, {
        event: "MENTORSHIP_OFFER_RECEIVED",
        recordId: created.id,
        projectId: p.id,
        projectTitle: live.title,
        actorId: a.id,
        recipients: [live.ownerId],
      });
      return created;
    }, { maxWait: 10_000, timeout: 15_000 });
    await dispatchMentorshipNotifications();
    return (await present([row], [], a.id)).requests[0]!;
  },
  /** Versioned Counter-Proposal: supersedes the old request and creates v+1 directed to the other party for fresh consent. */
  async counterPropose(projectInput: string, requestId: string, actorInput: string, rawInput: unknown) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const row = await getPrisma().mentorshipRequest.findFirst({ where: { id: requestId, projectId: p.id } });
    if (!row) throw AppError.notFound("Mentorship request not found");
    const input = counterProposalSchema.parse(rawInput);

    const created = await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id, row.mentorUserId, row.requestedBy, p.ownerId]);
      await actor(a.id, tx);
      const liveProject = await project(p.id, tx);
      const live = await tx.mentorshipRequest.findUniqueOrThrow({ where: { id: row.id } });

      // Idempotent retry check
      const previousRetry = await tx.mentorshipRequest.findUnique({
        where: { requestedBy_idempotencyKey: { requestedBy: a.id, idempotencyKey: input.idempotencyKey } },
      });
      if (previousRetry) {
        if (previousRetry.previousRequestId !== live.id || previousRetry.projectId !== p.id) {
          throw AppError.conflict("Idempotency key was already used for a different counter-proposal");
        }
        return previousRetry;
      }

      const manager = liveProject.ownerId === a.id, mentor = live.mentorUserId === a.id;
      const receiver = live.direction === "PROJECT_TO_LECTURER" ? mentor : manager;
      if (!receiver) throw AppError.forbidden("Only the current recipient can propose term changes");
      if (mentor && input.access) {
        throw AppError.forbidden("Lecturers cannot directly modify or grant project access permissions");
      }

      const now = new Date();
      if (live.status !== "PENDING" || (live.expiresAt && live.expiresAt <= now)) {
        throw AppError.conflict("This request is no longer pending and cannot be revised");
      }
      if (live.proposalVersion !== input.expectedProposalVersion) {
        throw AppError.conflict("This proposal version has been superseded. Reload the latest version before continuing.");
      }

      assertOpenProject(liveProject);
      await assertVerifiedLecturer(tx, live.mentorUserId);
      if (live.direction === "LECTURER_TO_PROJECT" || mentor) {
        await assertAcceptingNewMentorships(tx, live.mentorUserId);
      }

      const prevAccess = await tx.mentorAccess.findUnique({ where: { requestId: live.id } });
      let nextPolicy: MentorPolicyInput;
      if (manager && input.access) {
        validateMentorPermissions(input.access.permissions);
        if (input.access.expiresAt && new Date(input.access.expiresAt) <= now) {
          throw AppError.badRequest("Hạn truy cập đề xuất phải nằm trong tương lai");
        }
        nextPolicy = { preset: input.access.preset, permissions: input.access.permissions, expiresAt: input.access.expiresAt };
      } else if (prevAccess && !prevAccess.revokedAt) {
        nextPolicy = {
          preset: prevAccess.preset as import("@trend/shared-types").MentorPreset,
          permissions: prevAccess.permissions as import("@trend/shared-types").MentorPermission[],
          expiresAt: prevAccess.expiresAt ? prevAccess.expiresAt.toISOString() : null,
        };
      } else {
        throw AppError.conflict("An owner-approved access policy is required before proposing changes");
      }

      // 1. Supersede the old version and revoke its draft access so it can never be accepted
      await tx.mentorshipRequest.update({
        where: { id: live.id },
        data: { status: "SUPERSEDED", respondedAt: now, closeReason: "TERMS_COUNTER_PROPOSED" },
      });
      if (prevAccess && !prevAccess.revokedAt) {
        await tx.mentorAccess.update({ where: { id: prevAccess.id }, data: { revokedAt: now, version: { increment: 1 } } });
        await mentorAccessEvent(tx, prevAccess, a.id, "ACCESS_SUPERSEDED", { supersededByActorId: a.id, previousProposalVersion: live.proposalVersion });
      }

      // 2. Validate new role after superseding old pending reservation
      await assertMentorPosition(tx, p.id, input.mentorRole, true);

      const nextDirection = live.direction === "LECTURER_TO_PROJECT" ? "PROJECT_TO_LECTURER" : "LECTURER_TO_PROJECT";
      const nextVersion = live.proposalVersion + 1;
      const actorProfile = await tx.academicProfile.findUnique({ where: { userId: a.id } });
      const teamCounts = await mentorshipTeamCounts([liveProject], tx);
      const snapshot = JSON.parse(JSON.stringify({
        project: mentorshipPreview(liveProject, teamCounts.get(liveProject.id)),
        sender: mentorshipPerson(a, actorProfile, a.id),
        previewToken: previewToken(liveProject),
      })) as Prisma.InputJsonValue;

      const termsSnapshot = JSON.parse(JSON.stringify({
        proposalKind: "COUNTER_PROPOSAL",
        supportAreas: input.supportAreas,
        ...(input.availability ? { availability: input.availability } : {}),
        changeSummary: input.changeSummary.trim(),
        ...(input.requestedAccessNote?.trim() ? { requestedAccessNote: input.requestedAccessNote.trim() } : {}),
        consentConfirmedAt: now.toISOString(),
        consentActorId: a.id,
      })) as Prisma.InputJsonValue;

      const nextRow = await tx.mentorshipRequest.create({
        data: {
          projectId: p.id,
          mentorUserId: live.mentorUserId,
          requestedBy: a.id,
          direction: nextDirection,
          mentorRole: input.mentorRole,
          message: input.message.trim(),
          idempotencyKey: input.idempotencyKey,
          proposalVersion: nextVersion,
          previousRequestId: live.id,
          invitationSnapshot: snapshot,
          termsSnapshot,
          expiresAt: null,
        },
      });

      await initializeMentorAccess(tx, nextRow, liveProject.ownerId, nextPolicy);
      await record(tx, liveProject, a.id, "MENTORSHIP_TERMS_CHANGED", nextRow.id, {
        previousRequestId: live.id,
        proposalVersion: nextVersion,
        mentorRole: input.mentorRole,
        changeSummary: input.changeSummary.trim(),
      });
      await mentorshipNotification(tx, {
        event: "MENTORSHIP_TERMS_CHANGED",
        recordId: nextRow.id,
        projectId: p.id,
        projectTitle: liveProject.title,
        actorId: a.id,
        recipients: [manager ? live.mentorUserId : liveProject.ownerId],
      });
      return nextRow;
    }, { maxWait: 10_000, timeout: 15_000 });
    await dispatchMentorshipNotifications();
    return this.requestDetail(p.id, created.id, a.id);
  },
  async listMessages(projectInput: string, requestId: string, actorInput: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const db = getPrisma();
    const row = await db.mentorshipRequest.findFirst({ where: { id: requestId, projectId: p.id } });
    if (!row) throw AppError.notFound("Mentorship request not found");
    if (p.ownerId !== a.id && row.mentorUserId !== a.id) {
      throw AppError.forbidden("Private clarification messages are only accessible to the project owner and candidate mentor");
    }
    const chainIds = [row.id];
    let cursor = row.previousRequestId;
    while (cursor && chainIds.length < 20) {
      const prev = await db.mentorshipRequest.findFirst({ where: { id: cursor, projectId: p.id }, select: { id: true, previousRequestId: true } });
      if (!prev || chainIds.includes(prev.id)) break;
      chainIds.push(prev.id);
      cursor = prev.previousRequestId;
    }
    const rows = await db.mentorshipRequestMessage.findMany({
      where: { requestId: { in: chainIds }, projectId: p.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    const users = await db.user.findMany({ where: { id: { in: [p.ownerId, row.mentorUserId] } }, select: { id: true, fullName: true } });
    const names = new Map(users.map(u => [u.id, u.fullName]));
    return rows.map(msg => ({
      id: msg.id,
      requestId: msg.requestId,
      authorId: msg.authorId,
      authorName: names.get(msg.authorId) ?? "Participant",
      authorRole: (msg.authorId === row.mentorUserId ? "LECTURER" : "OWNER") as "OWNER" | "LECTURER",
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    }));
  },
  async sendMessage(projectInput: string, requestId: string, actorInput: string, rawInput: unknown) {
    const input = clarificationMessageSchema.parse(rawInput);
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const row = await getPrisma().mentorshipRequest.findFirst({ where: { id: requestId, projectId: p.id } });
    if (!row) throw AppError.notFound("Mentorship request not found");
    const created = await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id, row.mentorUserId, p.ownerId]);
      const actorUser = await actor(a.id, tx);
      const liveProject = await project(p.id, tx);
      const live = await tx.mentorshipRequest.findUniqueOrThrow({ where: { id: row.id } });
      const isOwner = liveProject.ownerId === a.id, isMentor = live.mentorUserId === a.id;
      if (!isOwner && !isMentor) {
        throw AppError.forbidden("Private clarification messages are only accessible to the project owner and candidate mentor");
      }
      const now = new Date();
      if (live.status !== "PENDING" || (live.expiresAt && live.expiresAt <= now)) {
        throw AppError.conflict("Clarification messages can only be sent while this request is pending");
      }
      const existing = await tx.mentorshipRequestMessage.findUnique({
        where: { requestId_authorId_clientKey: { requestId: live.id, authorId: a.id, clientKey: input.clientKey } },
      });
      if (existing) {
        if (existing.body !== input.body) throw AppError.conflict("Idempotency key was already used for a different message");
        return { msg: existing, authorName: actorUser.fullName, authorRole: (isMentor ? "LECTURER" : "OWNER") as "OWNER" | "LECTURER" };
      }
      if (await tx.mentorshipRequestMessage.count({ where: { requestId: live.id } }) >= 100) {
        throw AppError.conflict("Clarification message limit reached for this request");
      }
      const msg = await tx.mentorshipRequestMessage.create({
        data: { requestId: live.id, projectId: p.id, authorId: a.id, body: input.body, clientKey: input.clientKey },
      });
      await record(tx, liveProject, a.id, "MENTORSHIP_INFO_REQUESTED", live.id, { messageId: msg.id });
      await mentorshipNotification(tx, {
        event: "MENTORSHIP_INFO_REQUESTED",
        recordId: live.id,
        projectId: p.id,
        projectTitle: liveProject.title,
        actorId: a.id,
        recipients: [isMentor ? liveProject.ownerId : live.mentorUserId],
        eventSuffix: msg.id,
      });
      return { msg, authorName: actorUser.fullName, authorRole: (isMentor ? "LECTURER" : "OWNER") as "OWNER" | "LECTURER" };
    }, { maxWait: 10_000, timeout: 15_000 });
    await dispatchMentorshipNotifications();
    return {
      id: created.msg.id,
      requestId: created.msg.requestId,
      authorId: created.msg.authorId,
      authorName: created.authorName,
      authorRole: created.authorRole,
      body: created.msg.body,
      createdAt: created.msg.createdAt.toISOString(),
    };
  },
  async create(projectInput: string, actorInput: string, input: RequestInput, direction: string) {
    if (direction !== "PROJECT_TO_LECTURER") throw AppError.conflict("Lecturers express interest through the applicant pool");
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const mentor = direction === "PROJECT_TO_LECTURER" ? await actor(input.mentorUserId!) : a;
    const mentorRole = input.mentorRole ?? "UNASSIGNED", attachmentIds = input.attachmentIds ?? [];
    if (!["UNASSIGNED", "PRIMARY", "SECONDARY"].includes(mentorRole)) throw AppError.badRequest("Invalid mentor role");
    const row = await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id, mentor.id, p.ownerId]); const live = await project(p.id, tx); await actor(a.id, tx);
      if (input.idempotencyKey) {
        const previous = await tx.mentorshipRequest.findUnique({ where: { requestedBy_idempotencyKey: { requestedBy: a.id, idempotencyKey: input.idempotencyKey } } });
        if (previous) {
          const linked = await tx.mentorshipRequestAttachment.findMany({ where: { requestId: previous.id } });
          if (previous.projectId !== p.id || previous.mentorUserId !== mentor.id || previous.direction !== direction || previous.applicationId !== (input.applicationId ?? null) || (input.candidateId && previous.candidateId !== input.candidateId) || previous.mentorRole !== mentorRole || previous.message !== input.message.trim() || JSON.stringify(linked.map(l => l.attachmentId).sort()) !== JSON.stringify([...attachmentIds].sort())) throw AppError.conflict("Idempotency key was already used for a different request");
          const oldAccess = await tx.mentorAccess.findUnique({ where: { requestId: previous.id } });
          const proposal = oldAccess ? await tx.mentorAccessEvent.findFirst({ where: { accessId: oldAccess.id, type: "ACCESS_PROPOSED" }, orderBy: { createdAt: "asc" } }) : null;
          if (!isDeepStrictEqual((proposal?.details as { initialInput?: unknown } | undefined)?.initialInput ?? null, input.access ?? null)) throw AppError.conflict("Quyền trong lời mời đã khác yêu cầu gốc");
          if (direction === "PROJECT_TO_LECTURER") await assertAcademicRelationshipManager(p.id, a.id, tx);
          const prevDossierConfig = (previous.invitationSnapshot as { dossierConfig?: unknown } | null)?.dossierConfig ?? {};
          if (!isDeepStrictEqual(prevDossierConfig, input.dossier ?? {})) throw AppError.conflict("Hồ sơ lời mời đã khác yêu cầu gốc");
          return previous;
        }
      }
      if (direction === "PROJECT_TO_LECTURER") await assertAcademicRelationshipManager(p.id, a.id, tx);
      else {
        if (input.access || input.dossier) throw AppError.forbidden("Chỉ chủ dự án được cấu hình quyền mời cố vấn");
        // Recheck the discovery eligibility when an offer is sent from a stale preview or directly by ID.
        await actor(live.ownerId, tx);
        if (live.mentorshipDiscovery !== "SEEKING_MENTOR") throw AppError.forbidden("This project is not seeking mentorship offers");
      }
      assertOpenProject(live); await assertAcceptingNewMentorships(tx, mentor.id);
      const briefContext = input.dossier?.presentation === "BRIEF" ? await buildMentorInvitationContext(tx, live, a.id) : undefined;
      if (briefContext && !input.expectedPreviewToken || input.expectedPreviewToken && input.expectedPreviewToken !== (briefContext?.token ?? previewToken(live))) throw AppError.conflict("The shared project introduction changed. Review it before sending again.");
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: mentor.id } } });
      if (live.ownerId === mentor.id || member?.status === "ACTIVE") throw AppError.conflict("Project members cannot also become the project's academic mentor");
      if ((!input.message?.trim() && !attachmentIds.length) || input.message.trim().length > 1000) throw AppError.badRequest("Add a message or an attachment to your invitation");
      await expireInProject(tx, live); const now = new Date();
      await assertMentorPosition(tx, p.id, mentorRole, true);
      if (direction === "PROJECT_TO_LECTURER" && input.dossier?.researchSummary !== undefined) {
        const parsed = officialInvitationDossierSchema.safeParse(input.dossier);
        if (!parsed.success || !hasMeaningfulResearchText(input.message)) throw AppError.badRequest("Review the research summary, invitation reason, support needs and sharing consent");
      }
      if (direction === "PROJECT_TO_LECTURER" && input.dossier?.researchSummary === undefined && ((live.mentorshipSummary?.trim().length ?? 0) < 30 || (live.mentorshipSummary?.trim().split(/\s+/).length ?? 0) < 5)) throw AppError.badRequest("Bổ sung tóm tắt nghiên cứu được phép chia sẻ (ít nhất 30 ký tự, 5 từ) trước khi gửi");
      const application = input.applicationId ? await assertApplicationInvitation(tx, input.applicationId, p.id, mentor.id, input.expectedApplicationVersion) : null;
      const candidate = direction === "PROJECT_TO_LECTURER" && input.candidateId ? await prepareMentorCandidate(tx, p.id, live.ownerId, mentor.id, mentorRole, input.candidateId, input.expectedPlanVersion) : null;
      if (direction === "PROJECT_TO_LECTURER" && !input.candidateId && mentorRole !== "UNASSIGNED") {
        const plan = await tx.mentorInvitationPlan.findFirst({ where: { projectId: p.id, status: "ACTIVE" } });
        if (plan?.closedRoles.includes(mentorRole)) throw AppError.conflict("Vai trò đã dừng tuyển. Chủ dự án cần mở đợt mới");
      }
      await invitationFiles(tx, p.id, a.id, attachmentIds);
      const existingPairPending = await tx.mentorshipRequest.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: "PENDING" }, select: { id: true, direction: true } });
      if (existingPairPending) {
        throw AppError.conflict(
          existingPairPending.direction === "LECTURER_TO_PROJECT"
            ? "Giảng viên này đã gửi đề nghị hướng dẫn nhóm của bạn. Xem đề nghị hiện tại để tiếp tục."
            : "A pending request or active mentorship already exists",
        );
      }
      if (await tx.mentorRelationship.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: "ACTIVE" } })) throw AppError.conflict("A pending request or active mentorship already exists");
      if (await tx.mentorshipRequest.findFirst({ where: { projectId: p.id, mentorUserId: mentor.id, status: { in: ["DECLINED", "CANCELLED", "CANCELED_BY_PROJECT"] }, respondedAt: { gt: new Date(now.getTime() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000) } } })) throw AppError.conflict("Wait before sending another mentorship request to this pair");
      if (await tx.mentorshipRequest.count({ where: { requestedBy: a.id, createdAt: { gt: new Date(now.getTime() - 3600000) } } }) >= env.ACADEMIC_RELATIONSHIP_REQUEST_LIMIT) throw AppError.conflict("Mentorship request limit reached; try later");
      const senderProfile = await tx.academicProfile.findUnique({ where: { userId: a.id } });
      const expiresAtDate = null;
      const builtDossier = direction === "PROJECT_TO_LECTURER"
        ? await buildInvitationDossier(tx, {
          project: live,
          representativeUserId: a.id,
          mentorUserId: mentor.id,
          viewerId: mentor.id,
          message: input.message.trim(),
          mentorRole,
          access: input.access,
          dossier: input.dossier,
          expiresAt: undefined,
        })
        : undefined;
      const snapshot = JSON.parse(JSON.stringify({
        project: briefContext && builtDossier ? { id: publicDatabaseId(live), title: briefContext.title, summary: builtDossier.project.abstract, researchField: briefContext.researchField, researchAreas: briefContext.researchAreas, teamMemberCount: briefContext.memberCount, expertise: [], mentoringNeeds: "", stage: live.status } : { ...mentorshipPreview(live, (await mentorshipTeamCounts([live], tx)).get(live.id)), ...(input.dossier?.researchSummary !== undefined ? { summary: input.dossier.researchSummary.trim(), researchField: builtDossier?.project.researchField, researchAreas: builtDossier?.project.researchAreas ?? [] } : {}) },
        sender: briefContext ? { _id: publicDatabaseId(a), fullName: briefContext.senderDisplayName } : mentorshipPerson(a, senderProfile, a.id),
        previewToken: briefContext?.token ?? previewToken(live),
        ...(builtDossier ? { dossierConfig: input.dossier ?? {}, dossier: builtDossier } : {}),
      })) as Prisma.InputJsonValue;
      const request = await tx.mentorshipRequest.create({ data: { projectId: p.id, mentorUserId: mentor.id, requestedBy: a.id, direction, mentorRole, message: input.message.trim(), idempotencyKey: input.idempotencyKey, candidateId: candidate?.id, applicationId: application?.id, invitationSnapshot: snapshot, expiresAt: expiresAtDate } });
      if (application) {
        const invited = await tx.mentorshipApplication.update({ where: { id: application.id }, data: { status: "INVITED", version: { increment: 1 } } });
        await applicationEvent(tx, invited, a.id, "INVITED", { requestId: request.id });
      }
      if (candidate) {
        await tx.mentorCandidate.update({ where: { id: candidate.id }, data: { status: "INVITED" } });
        await tx.mentorInvitationPlan.update({ where: { id: candidate.planId }, data: { version: { increment: 1 } } });
      }
      await initializeMentorAccess(tx, request, live.ownerId, input.access);
      if (attachmentIds.length) await tx.mentorshipRequestAttachment.createMany({ data: attachmentIds.map(attachmentId => ({ requestId: request.id, attachmentId })) });
      if (direction === "PROJECT_TO_LECTURER") {
        const pendingSuggestions = await tx.mentorSuggestion.findMany({ where: { projectId: p.id, mentorUserId: mentor.id, status: "PENDING" }, select: { id: true, suggestedBy: true } });
        if (pendingSuggestions.length) {
          await tx.mentorSuggestion.updateMany({ where: { projectId: p.id, mentorUserId: mentor.id, status: "PENDING" }, data: { status: "INVITED", requestId: request.id, resolvedBy: a.id, resolvedAt: now } });
          for (const s of pendingSuggestions) {
            if (s.suggestedBy !== a.id) {
              await mentorshipNotification(tx, {
                event: "MENTORSHIP_SUGGESTION_INVITED",
                recordId: s.id,
                projectId: p.id,
                projectTitle: live.title,
                actorId: a.id,
                recipients: [s.suggestedBy],
                customMessage: {
                  vi: `Chủ dự án đã gửi lời mời chính thức đến ${mentor.fullName} cho dự án ${live.title}.`,
                  en: `The project owner sent an official mentorship invitation to ${mentor.fullName} for ${live.title}.`,
                },
              });
            }
          }
        }
      }
      const event = direction === "PROJECT_TO_LECTURER" ? "MENTORSHIP_REQUEST_RECEIVED" : "MENTORSHIP_OFFER_RECEIVED";
      await record(tx, live, a.id, event, request.id);
      await mentorshipNotification(tx, { event, recordId: request.id, projectId: p.id, projectTitle: live.title, actorId: a.id, recipients: [direction === "PROJECT_TO_LECTURER" ? mentor.id : live.ownerId] }); return request;
    }, { maxWait: 10_000, timeout: 15_000 });
    await dispatchMentorshipNotifications(); return (await present([row], [], a.id)).requests[0];
  },
  async respond(projectInput: string, requestId: string, actorInput: string, action: "ACCEPTED" | "DECLINED" | "CANCELLED", note?: string, expectedAccessVersion?: number, expectedPreviewToken?: string, expectedProposalVersion?: number, needConfirmations?: NeedScopeConfirmation[]) {
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
      if (live.status === "SUPERSEDED") throw AppError.conflict("This proposal version has been superseded by a newer revision. Review the latest version instead.");
      if (live.status !== "PENDING" || live.expiresAt && live.expiresAt <= new Date()) throw AppError.conflict("This request has changed or expired");
      if (action === "ACCEPTED") {
        if (expectedProposalVersion !== undefined && live.proposalVersion !== expectedProposalVersion) {
          throw AppError.conflict("The proposal terms version changed. Refresh and review the latest version before accepting.");
        }
        if (expectedPreviewToken && expectedPreviewToken !== ((live.invitationSnapshot as { previewToken?: string } | null)?.previewToken ?? previewToken(liveProject))) throw AppError.conflict("The shared project introduction changed. Review it before accepting.");
        const access = await tx.mentorAccess.findUnique({ where: { requestId: live.id } });
        if (access?.revokedAt || access?.expiresAt && access.expiresAt <= new Date()) throw AppError.conflict("Quyền truy cập đề xuất đã hết hạn hoặc bị thu hồi");
        if (access && (expectedAccessVersion !== undefined ? expectedAccessVersion !== access.version : access.version > 1)) throw AppError.conflict("Quyền đề xuất đã thay đổi. Xem lại lời mời trước khi chấp nhận");
        assertOpenProject(liveProject); await assertVerifiedLecturer(tx, live.mentorUserId);
        const terms = parseTermsSnapshot(live.termsSnapshot);
        if (live.direction === "PROJECT_TO_LECTURER") {
          await actor(live.requestedBy, tx);
          if (live.requestedBy !== liveProject.ownerId) throw AppError.conflict("The requester no longer manages this project");
        } else {
          // Formal lecturer-origin proposal: verify lecturer is still accepting new mentorships and policy was approved by current owner
          if (terms) await assertAcceptingNewMentorships(tx, live.mentorUserId);
          if (access && access.configuredById !== liveProject.ownerId) {
            throw AppError.conflict("Project ownership changed after this proposal's access policy was configured. Propose updated terms to re-confirm.");
          }
        }
        const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: live.mentorUserId } } });
        if (liveProject.ownerId === live.mentorUserId || member?.status === "ACTIVE") throw AppError.conflict("Project members cannot also become the project's academic mentor");
        await assertMentorPosition(tx, p.id, live.mentorRole as MentorRole);
        // Concurrency-safe mentor capacity check (serialized via FOR NO KEY UPDATE on mentor user row):
        // Enforced only when the mentor explicitly configured a positive maxActiveProjects limit.
        const mentorProfile = await tx.academicProfile.findUnique({ where: { userId: live.mentorUserId }, select: { supportAvailability: true } });
        const rawCap = (mentorProfile?.supportAvailability as { maxActiveProjects?: unknown } | null)?.maxActiveProjects;
        if (typeof rawCap === "number" && Number.isInteger(rawCap) && rawCap > 0) {
          const activeMentorRels = await tx.mentorRelationship.findMany({
            where: { mentorUserId: live.mentorUserId, status: "ACTIVE" },
            select: { projectId: true },
          });
          const otherProjectIds = [...new Set(activeMentorRels.map(r => r.projectId).filter(pid => pid !== p.id))];
          const distinctOtherProjects = otherProjectIds.length
            ? await tx.project.count({ where: { id: { in: otherProjectIds }, deletedAt: null } })
            : 0;
          if (distinctOtherProjects >= rawCap) {
            throw AppError.conflict("Mentorship capacity limit reached. Adjust your mentoring capacity settings or complete an existing mentorship before accepting another project.");
          }
        }
      }
      const now = new Date();
      let updatedTermsSnapshot: Prisma.InputJsonValue | undefined;
      if (action === "ACCEPTED" && needConfirmations?.length) {
        const existingTerms = parseTermsSnapshot(live.termsSnapshot);
        const mergedTerms = {
          proposalKind: existingTerms?.proposalKind ?? "INVITATION",
          supportAreas: existingTerms?.supportAreas ?? [],
          ...(existingTerms?.availability ? { availability: existingTerms.availability } : {}),
          ...(existingTerms?.prospectivePolicyHash ? { prospectivePolicyHash: existingTerms.prospectivePolicyHash } : {}),
          ...(existingTerms?.prospectivePolicyVersion !== undefined ? { prospectivePolicyVersion: existingTerms.prospectivePolicyVersion } : {}),
          consentConfirmedAt: existingTerms?.consentConfirmedAt ?? now.toISOString(),
          consentActorId: existingTerms?.consentActorId ?? a.id,
          needConfirmations,
        };
        updatedTermsSnapshot = JSON.parse(JSON.stringify(mergedTerms)) as Prisma.InputJsonValue;
      }
      const responded = await tx.mentorshipRequest.update({
        where: { id: live.id },
        data: {
          status,
          responseNote: note?.trim(),
          respondedAt: now,
          ...(updatedTermsSnapshot ? { termsSnapshot: updatedTermsSnapshot } : {}),
        },
      });
      await syncApplicationRequest(tx, responded, a.id);
      if (action === "ACCEPTED") {
        // Expired competitors keep their own outcome even between worker sweeps.
        await expireInProject(tx, liveProject);
        await tx.mentorSuggestion.updateMany({ where: { projectId: p.id, mentorUserId: live.mentorUserId, status: "PENDING" }, data: { status: "DISMISSED", resolvedBy: a.id, resolvedAt: now } });
        const relationship = await tx.mentorRelationship.create({ data: { projectId: p.id, mentorUserId: live.mentorUserId, mentorRole: live.mentorRole, sourceRequestId: live.id, startedAt: now } });
        const access = await tx.mentorAccess.findUnique({ where: { requestId: live.id } }) ?? await initializeMentorAccess(tx, live, liveProject.ownerId);
        await tx.mentorAccess.update({ where: { id: access.id }, data: { relationshipId: relationship.id, version: { increment: 1 } } });
        await mentorAccessEvent(tx, access, a.id, "ACCESS_ACCEPTED", { relationshipId: relationship.id, acceptedPolicyVersion: access.version, preset: access.preset, permissions: access.permissions, expiresAt: access.expiresAt });
        await record(tx, liveProject, a.id, "MENTOR_JOINED_PROJECT", relationship.id);

      }
      const event: MentorshipEvent = action === "CANCELLED" ? "MENTORSHIP_CANCELLED" : live.direction === "PROJECT_TO_LECTURER" ? (action === "ACCEPTED" ? "MENTORSHIP_REQUEST_ACCEPTED" : "MENTORSHIP_REQUEST_DECLINED") : (action === "ACCEPTED" ? "MENTORSHIP_OFFER_ACCEPTED" : "MENTORSHIP_OFFER_DECLINED");
      await record(tx, liveProject, a.id, event, live.id);
      const acceptedTeam = action === "ACCEPTED" ? (await tx.projectMember.findMany({ where: { projectId: p.id, status: "ACTIVE" }, select: { userId: true } })).map(member => member.userId) : [];
      await mentorshipNotification(tx, { event, recordId: live.id, projectId: p.id, projectTitle: liveProject.title, actorId: a.id, recipients: [...(mentor ? [liveProject.ownerId, live.requestedBy] : [live.mentorUserId]), ...acceptedTeam] });
      return tx.mentorshipRequest.findUniqueOrThrow({ where: { id: live.id } });
    }, { maxWait: 10_000, timeout: 15_000 });
    await dispatchMentorshipNotifications(); return (await present([updated], [], a.id)).requests[0];
  },
  async accept(p: string, r: string, a: string, note?: string, expectedAccessVersion?: number, expectedPreviewToken?: string, expectedProposalVersion?: number, needConfirmations?: NeedScopeConfirmation[]) { return this.respond(p, r, a, "ACCEPTED", note, expectedAccessVersion, expectedPreviewToken, expectedProposalVersion, needConfirmations); },
  async decline(p: string, r: string, a: string, note?: string) { return this.respond(p, r, a, "DECLINED", note); },
  async cancel(p: string, r: string, a: string, note?: string) { return this.respond(p, r, a, "CANCELLED", note); },
  async requestInfo(projectInput: string, requestId: string, actorInput: string, note: string) {
    const [p, a] = await Promise.all([project(projectInput), actor(actorInput)]);
    const trimmed = note.trim();
    if (trimmed.length < 5 || trimmed.length > 1000) throw AppError.badRequest("Please describe what information should be clarified (5–1000 characters)");
    const row = await getPrisma().mentorshipRequest.findFirst({ where: { id: requestId, projectId: p.id } });
    if (!row) throw AppError.notFound("Mentorship request not found");
    const msgId = randomUUID();
    await getPrisma().$transaction(async tx => {
      await locks(tx, p.id, [a.id, row.mentorUserId, row.requestedBy, p.ownerId]);
      await actor(a.id, tx);
      const liveProject = await project(p.id, tx);
      const live = await tx.mentorshipRequest.findUniqueOrThrow({ where: { id: row.id } });
      const manager = liveProject.ownerId === a.id, mentor = live.mentorUserId === a.id;
      const receiver = live.direction === "PROJECT_TO_LECTURER" ? mentor : manager;
      if (!receiver) throw AppError.forbidden("Only the recipient can request clarification");
      const now = new Date();
      if (live.status !== "PENDING" || (live.expiresAt && live.expiresAt <= now)) {
        throw AppError.conflict("This request has changed or expired");
      }
      // Persist in mentorship_request_messages so immutable invitation_snapshot trigger stays intact.
      await tx.mentorshipRequestMessage.create({
        data: { requestId: live.id, projectId: p.id, authorId: a.id, body: trimmed, clientKey: msgId },
      });
      await record(tx, liveProject, a.id, "MENTORSHIP_INFO_REQUESTED", live.id, { note: trimmed });
      await mentorshipNotification(tx, {
        event: "MENTORSHIP_INFO_REQUESTED",
        recordId: live.id,
        projectId: p.id,
        projectTitle: liveProject.title,
        actorId: a.id,
        recipients: mentor ? [liveProject.ownerId, live.requestedBy] : [live.mentorUserId],
        eventSuffix: msgId,
      });
    }, { maxWait: 10_000, timeout: 15_000 });
    await dispatchMentorshipNotifications();
    return this.requestDetail(p.id, row.id, a.id);
  },
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
      const source = await tx.mentorshipRequest.findUniqueOrThrow({ where: { id: live.sourceRequestId } });
      await closeAcceptedApplication(tx, source, a.id, live.id);
      const access = await tx.mentorAccess.findUnique({ where: { relationshipId: live.id } });
      if (access) { await tx.mentorAccess.update({ where: { id: access.id }, data: { revokedAt: new Date(), version: { increment: 1 } } }); await mentorAccessEvent(tx, access, a.id, "ACCESS_REVOKED", { reason: reason ?? "Kết thúc cố vấn" }); }
      // A departure requires fresh owner authorization; it never contacts an old backup.
      if (live.mentorRole !== "UNASSIGNED") {
        const plan = await ensureMentorPlan(tx, p.id, liveProject.ownerId);
        await tx.mentorInvitationPlan.update({ where: { id: plan.id }, data: { closedRoles: [...new Set([...plan.closedRoles, live.mentorRole])], version: { increment: 1 } } });
      }
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
      return {
        project: mentorshipPreview(live), canManage: canManageAcademicRelationships(a.id, live), accessRole: team ? "TEAM" : "MENTOR",
        canProvideFeedback: !["ARCHIVED", "COMPLETED"].includes(live.status),
        guidance: guidance.map(i => {
          const author = authors.find(u => u.id === i.actorId), meta = i.metadata as { note?: string; attribution?: string };
          return {
            id: i.id, author: author ? { _id: publicDatabaseId(author), fullName: author.fullName, avatarUrl: author.avatarUrl ?? undefined } : undefined,
            attribution: meta.attribution ?? "TEAM", note: meta.note ?? "", createdAt: i.createdAt.toISOString()
          };
        }),
        context: await mentorshipResearchContext(tx, live, query),
      };
    });
  },
};
