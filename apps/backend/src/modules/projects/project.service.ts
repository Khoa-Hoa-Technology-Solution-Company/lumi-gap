import { invalidateSourceAssessments } from "./gap-revision.js";
import { revokeProjectScreeningAssignments } from "./project-screening.service.js";
import type {
  AddProjectMemberRequest,
  CreateProjectRequest,
  InviteProjectMemberRequest,
  ProjectInvitationPreview,
  ProjectRole,
  UpdateProjectPaperRequest,
  UpdateProjectRequest,
} from "@trend/shared-types";
import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { createOpaqueToken, hashOpaqueToken } from "../auth/token.service.js";
import { assertResearchWorkflowAccess } from "../authorization/research-access.service.js";
import { projectActivityService } from "./project-activity.service.js";
import type { ProjectAiFeature } from "./project-scope.js";
import { assertProjectActionAllowed, canReadProjectSummary, invitationBelongsToUser } from "./project-workspace.rules.js";
import { queueProjectInvitation } from "./project-invitation-delivery.js";
import { lockProjectAccounts, authorizeProjectTransaction, assertActiveProjectAccount } from "./project-transaction.js";
import { recordPlanSnapshot } from "./plan-history.js";

const ACTIVE = "ACTIVE";
const INVITATION_DAYS = 7;
const RESEND_COOLDOWN_MS = 60_000;

function whereId(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid database identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

async function resolveUser(value: string) {
  const row = await getPrisma().user.findUnique({ where: whereId(value) });
  if (!row) throw AppError.notFound("User not found");
  return row;
}

async function resolvePaper(value: string, allowProjectDraft = false) {
  const row = await getPrisma().paper.findUnique({ where: whereId(value) });
  if (!row || (row.dataStatus !== "active" && !(allowProjectDraft && row.dataStatus === "draft"))) throw AppError.notFound("Paper not found");
  return row;
}

async function resolveProject(value: string) {
  const row = await getPrisma().project.findUnique({ where: whereId(value) });
  if (!row) throw AppError.notFound("Project not found");
  return row;
}

function normalizeRole(role: string): ProjectRole {
  return role.toUpperCase() === "OWNER" ? "OWNER" : "MEMBER";
}

async function access(projectId: string, actorIdInput: string) {
  const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(actorIdInput)]);
  await assertResearchWorkflowAccess(actor.id);
  const membership = await getPrisma().projectMember.findUnique({
    where: { projectId_userId: { projectId: row.id, userId: actor.id } },
  });
  const isOwner = row.ownerId === actor.id;
  const isMember = isOwner || membership?.status.toUpperCase() === ACTIVE;
  return { row, actor, membership, isOwner, isMember, role: isOwner ? "OWNER" as const : isMember ? "MEMBER" as const : undefined };
}

function assertMember(rights: Awaited<ReturnType<typeof access>>) {
  if (!rights.isMember) throw AppError.forbidden("Active project membership is required");
}

function assertMutable(rights: Awaited<ReturnType<typeof access>>) {
  assertProjectActionAllowed(rights.role, rights.row.status, "CONTRIBUTE");
}

function userSummary(user: { id: string; legacyMongoId: string | null; fullName: string | null; email?: string | null; avatarUrl: string | null }, includeEmail = false) {
  return {
    _id: publicDatabaseId(user),
    fullName: user.fullName ?? undefined,
    ...(includeEmail && user.email ? { email: user.email } : {}),
    avatarUrl: user.avatarUrl ?? undefined,
  };
}

async function invitationByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw AppError.notFound("Invitation not found");
  const invitation = await getPrisma().projectInvitation.findFirst({ where: { tokenHash: hashOpaqueToken(token) } });
  if (!invitation) throw AppError.notFound("Invitation not found");
  return invitation;
}

async function verifiedEmailsForUser(userId: string, db: Prisma.TransactionClient = getPrisma()): Promise<string[]> {
  const [rows, user] = await Promise.all([
    db.userEmail.findMany({ where: { userId, verifiedAt: { not: null } }, select: { normalizedEmail: true } }),
    db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } }),
  ]);
  const emails = new Set(rows.map((row) => row.normalizedEmail));
  // Accounts created before user_emails existed only carry the verified primary email on users.
  if (user?.emailVerifiedAt && user.email) emails.add(user.email.trim().toLowerCase());
  return [...emails];
}

async function invitationPreview(invitation: Awaited<ReturnType<typeof invitationByToken>>, viewerId?: string): Promise<ProjectInvitationPreview> {
  const prisma = getPrisma();
  const [project, inviter, viewer] = await Promise.all([
    prisma.project.findUnique({ where: { id: invitation.projectId } }),
    prisma.user.findUnique({ where: { id: invitation.invitedById }, select: { fullName: true, email: true } }),
    viewerId ? resolveUser(viewerId) : Promise.resolve(null),
  ]);
  if (!project) throw AppError.notFound("Project not found");
  const now = new Date();
  const effectiveStatus = invitation.status === "PENDING" && invitation.expiresAt <= now ? "EXPIRED" : invitation.status;
  if (effectiveStatus === "EXPIRED" && invitation.status === "PENDING") {
    await prisma.projectInvitation.updateMany({ where: { id: invitation.id, status: "PENDING", tokenHash: invitation.tokenHash, expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } });
  }
  const alreadyMember = viewer
    ? Boolean(await prisma.projectMember.findFirst({ where: { projectId: project.id, userId: viewer.id, status: ACTIVE } }))
    : false;
  const viewerEmails = viewer ? await verifiedEmailsForUser(viewer.id) : [];
  const matches = viewer ? invitationBelongsToUser(invitation, { id: viewer.id, verifiedEmails: viewerEmails }) : false;
  // A bearer link proves possession, not intended identity. No private description or email fallback.
  return {
    id: invitation.id,
    projectId: matches ? publicDatabaseId(project) : "",
    projectTitle: matches ? project.title : "",
    invitedEmail: matches ? invitation.email : "",
    currentUserEmail: viewer?.email,
    inviterName: matches ? inviter?.fullName || "A LumiGap member" : "",
    role: "MEMBER",
    message: matches ? invitation.message ?? undefined : undefined,
    status: effectiveStatus as ProjectInvitationPreview["status"],
    expiresAt: invitation.expiresAt.toISOString(), createdAt: invitation.createdAt.toISOString(),
    authenticated: Boolean(viewer), emailMatches: matches, alreadyMember: matches && alreadyMember,
  };
}

async function hydrate(row: Awaited<ReturnType<typeof resolveProject>>, viewerId?: string, publicSummary = false) {
  const prisma = getPrisma();
  if (publicSummary) return {
    _id: publicDatabaseId(row), title: row.title, description: row.publicSummary ?? undefined,
    publicSummary: row.publicSummary ?? undefined, researchField: row.researchAreas[0], researchAreas: row.researchAreas,
    status: row.status, visibility: row.visibility, isPublicSummary: true,
    ownerId: "", owner: undefined, accessRole: undefined, screeningCriteria: undefined,
    // Empty compatibility collections never reveal private counts or identities.
    members: [], papers: [], pendingInvitations: [], recentActivity: [], memberCount: 0, paperCount: 0,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), archivedAt: undefined,
  };
  const plan = await prisma.researchPlan.findUnique({ where: { projectId: row.id } });
  const [memberLinks, paperLinks, owner, recentActivity] = await Promise.all([
    prisma.projectMember.findMany({ where: { projectId: row.id, status: ACTIVE }, orderBy: { joinedAt: "asc" } }),
    publicSummary ? Promise.resolve([]) : prisma.projectPaper.findMany({ where: { projectId: row.id }, orderBy: { createdAt: "asc" } }),
    prisma.user.findUnique({ where: { id: row.ownerId }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true } }),
    publicSummary ? Promise.resolve([]) : projectActivityService.list(row.id, 8),
  ]);
  const accessRole: ProjectRole | undefined = viewerId === row.ownerId
    ? "OWNER"
    : memberLinks.some((member) => member.userId === viewerId) ? "MEMBER" : undefined;
  const memberUserIds = memberLinks.map((member) => member.userId);
  const paperIds = paperLinks.map((link) => link.paperId);
  const addedByIds = paperLinks.flatMap((link) => link.addedById ? [link.addedById] : []);
  const screenedByIds = paperLinks.flatMap((link) => link.screenedById ? [link.screenedById] : []);
  const [users, papers, authors, projectGaps] = await Promise.all([
    memberUserIds.length || addedByIds.length || screenedByIds.length
      ? prisma.user.findMany({ where: { id: { in: [...new Set([...memberUserIds, ...addedByIds, ...screenedByIds])] } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true } })
      : [],
    paperIds.length
      ? prisma.paper.findMany({ where: { id: { in: paperIds } }, select: { id: true, legacyMongoId: true, title: true, publicationYear: true, abstractText: true, doi: true, journalName: true, aiAnalysis: true } })
      : [],
    paperIds.length
      ? prisma.paperAuthor.findMany({ where: { paperId: { in: paperIds } }, orderBy: { position: "asc" } })
      : [],
    paperIds.length
      ? prisma.researchGap.findMany({ where: { projectId: row.id }, select: { id: true } })
      : [],
  ]);
  const gapIds = projectGaps.map((gap) => gap.id);
  const evidence = gapIds.length && paperIds.length
    ? await prisma.gapEvidenceRecord.findMany({ where: { gapId: { in: gapIds }, paperId: { in: paperIds } }, select: { paperId: true } })
    : [];
  const evidenceCount = new Map<string, number>();
  for (const item of evidence) evidenceCount.set(item.paperId, (evidenceCount.get(item.paperId) ?? 0) + 1);
  const userById = new Map(users.map((user) => [user.id, user]));
  const paperById = new Map(papers.map((paper) => [paper.id, paper]));
  const authorsByPaper = new Map<string, Array<{ displayName: string }>>();
  for (const author of authors) {
    const list = authorsByPaper.get(author.paperId) ?? [];
    list.push({ displayName: author.displayName });
    authorsByPaper.set(author.paperId, list);
  }
  const pendingInvitations = accessRole === "OWNER"
    ? await prisma.projectInvitation.findMany({ where: { projectId: row.id, status: "PENDING", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 20 })
    : [];
  const invitedUsers = pendingInvitations.some((invite) => invite.invitedUserId)
    ? await prisma.user.findMany({ where: { id: { in: pendingInvitations.flatMap((invite) => invite.invitedUserId ? [invite.invitedUserId] : []) } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true } })
    : [];
  const invitedById = new Map(invitedUsers.map((user) => [user.id, user]));

  return {
    _id: publicDatabaseId(row),
    title: row.title,
    description: row.description ?? undefined,
    researchField: row.researchField ?? undefined,
    researchAreas: row.researchAreas, researchApproach: (plan?.approach ?? "UNDECIDED") as import("@trend/shared-types").ResearchApproach,
    publicSummary: row.publicSummary ?? undefined, mentorshipDiscovery: row.mentorshipDiscovery,
    version: row.version,
    screeningMode: publicSummary ? undefined : row.screeningMode as "EXPLORATORY" | "INDEPENDENT",
    screeningBlinded: publicSummary ? undefined : row.screeningBlinded,
    screeningCriteria: publicSummary ? undefined : { inclusion: row.inclusionCriteria, exclusion: row.exclusionCriteria },
    status: row.status,
    visibility: row.visibility,
    ownerId: owner ? publicDatabaseId(owner) : row.ownerId,
    owner: owner ? userSummary(owner, accessRole === "OWNER") : undefined,
    accessRole,
    isPublicSummary: publicSummary,
    memberCount: memberLinks.length,
    paperCount: publicSummary ? await prisma.projectPaper.count({ where: { projectId: row.id } }) : paperLinks.length,
    members: publicSummary ? [] : memberLinks.map((member) => {
      const memberUser = userById.get(member.userId);
      return {
        targetKind: "User" as const,
        targetId: memberUser ? userSummary(memberUser, accessRole === "OWNER" || member.userId === viewerId) : member.userId,
        role: normalizeRole(member.role),
        status: ACTIVE,
        joinedAt: member.joinedAt.toISOString(),
      };
    }),
    papers: paperLinks.flatMap((link) => {
      const paper = paperById.get(link.paperId);
      if (!paper) return [];
      const addedBy = link.addedById ? userById.get(link.addedById) : undefined;
      const { aiAnalysis, ...paperSummary } = paper;
      return [{
        id: link.id,
        targetKind: "Paper" as const,
        targetId: { ...paperSummary, _id: publicDatabaseId(paper), hasAiAnalysis: Boolean(aiAnalysis), authors: authorsByPaper.get(paper.id) ?? [] },
        screeningStatus: link.screeningStatus,
        readingStatus: link.readingStatus,
        inclusionReason: link.inclusionReason ?? undefined,
        exclusionReason: link.exclusionReason ?? undefined,
        exclusionNote: link.exclusionNote ?? undefined,
        screenedBy: link.screenedById && userById.get(link.screenedById) ? userSummary(userById.get(link.screenedById)!) : undefined,
        screenedAt: link.screenedAt?.toISOString(),
        notes: link.notes ?? undefined,
        evidenceCount: evidenceCount.get(link.paperId) ?? 0,
        addedBy: addedBy ? userSummary(addedBy) : undefined,
        addedAt: link.createdAt.toISOString(),
        updatedAt: link.updatedAt.toISOString(),
      }];
    }),
    pendingInvitations: pendingInvitations.map((invite) => ({
      id: invite.id,
      projectId: publicDatabaseId(row),
      invitedUser: invite.invitedUserId && invitedById.get(invite.invitedUserId) ? userSummary(invitedById.get(invite.invitedUserId)!, true) : undefined,
      lastSentAt: invite.lastSentAt.toISOString(), resendAvailableAt: new Date(invite.lastSentAt.getTime() + RESEND_COOLDOWN_MS).toISOString(),
      email: invite.email,
      message: invite.message ?? undefined,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    })),
    recentActivity,
    archivedAt: row.archivedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class ProjectService {
  async createProject(data: CreateProjectRequest, ownerIdInput: string) {
    const owner = await resolveUser(ownerIdInput);
    const normalized = {
      title: data.title.trim(), description: data.description?.trim() || null,
      researchAreas: data.researchAreas ?? (data.researchField?.trim() ? [data.researchField.trim()] : []),
      approach: data.researchApproach ?? "UNDECIDED", status: data.status ?? "PLANNING",
      visibility: data.visibility === "PUBLIC_SUMMARY" || data.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    };
    const requestHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    const row = await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [owner.id]);
      await assertActiveProjectAccount(tx, owner.id, true);
      if (data.idempotencyKey) {
        const existing = await tx.project.findUnique({ where: { createdById_creationKey: { createdById: owner.id, creationKey: data.idempotencyKey } } });
        if (existing) {
          if (existing.creationRequestHash !== requestHash) throw AppError.conflict("This creation key was already used with different project details");
          await authorizeProjectTransaction(tx, existing.id, owner.id);
          return existing;
        }
      }
      const created = await tx.project.create({ data: {
        title: normalized.title, description: normalized.description,
        researchAreas: normalized.researchAreas, researchField: normalized.researchAreas[0],
        status: normalized.status, visibility: normalized.visibility, mentorshipDiscovery: "CLOSED", researchStage: "DISCOVERY",
        ownerId: owner.id, createdById: owner.id, creationKey: data.idempotencyKey, creationRequestHash: requestHash,
      } });
      await tx.researchPlan.create({ data: { projectId: created.id, approach: normalized.approach, problem: normalized.description ?? "", updatedById: owner.id } });
      await recordPlanSnapshot(tx, created.id, owner.id, null);
      await tx.projectMember.create({ data: { projectId: created.id, userId: owner.id, role: "OWNER", status: ACTIVE } });
      await tx.projectActivity.create({ data: { projectId: created.id, actorId: owner.id, type: "PROJECT_CREATED", metadata: {} } });
      return created;
    });
    return hydrate(row, owner.id);
  }

  async getProjectsByUser(userIdInput: string) {
    return (await this.getProjectsPageByUser(userIdInput, { pageSize: 100 })).items;
  }

  async getProjectsPageByUser(userIdInput: string, input: { page?: number; pageSize?: number } = {}) {
    const actor = await resolveUser(userIdInput);
    await assertResearchWorkflowAccess(actor.id);
    const db = getPrisma();
    const memberships = await db.projectMember.findMany({ where: { userId: actor.id, status: ACTIVE }, select: { projectId: true } });
    const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 100));
    const where = { OR: [{ ownerId: actor.id }, { id: { in: memberships.map(m => m.projectId) } }] };
    const [rows, total] = await Promise.all([
      db.project.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.project.count({ where }),
    ]);
    const ids = rows.map(p => p.id);
    const [members, papers, owners, plans] = await Promise.all([
      db.projectMember.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: ACTIVE }, _count: true }),
      db.projectPaper.groupBy({ by: ["projectId"], where: { projectId: { in: ids } }, _count: true }),
      db.user.findMany({ where: { id: { in: [...new Set(rows.map(p => p.ownerId))] } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true } }),
      db.researchPlan.findMany({ where: { projectId: { in: ids } } }),
    ]);
    const memberCounts = new Map(members.map(m => [m.projectId, m._count]));
    const paperCounts = new Map(papers.map(m => [m.projectId, m._count]));
    const ownerMap = new Map(owners.map(u => [u.id, u]));
    const approaches = new Map(plans.map(plan => [plan.projectId, plan.approach]));
    const items = rows.map(row => ({
      _id: publicDatabaseId(row), title: row.title, description: row.description ?? undefined,
      researchField: row.researchField ?? undefined, researchAreas: row.researchAreas,
      researchApproach: approaches.get(row.id) ?? "UNDECIDED", visibility: row.visibility,
      status: row.status, ownerId: ownerMap.has(row.ownerId) ? publicDatabaseId(ownerMap.get(row.ownerId)!) : row.ownerId,
      owner: ownerMap.has(row.ownerId) ? userSummary(ownerMap.get(row.ownerId)!) : undefined,
      accessRole: row.ownerId === actor.id ? "OWNER" : "MEMBER", members: [], papers: [],
      memberCount: memberCounts.get(row.id) ?? 0, paperCount: paperCounts.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), archivedAt: row.archivedAt?.toISOString(),
    }));
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), hasNext: page * pageSize < total } };
  }

  async getProjectById(projectId: string, userIdInput: string) {
    const rights = await access(projectId, userIdInput);
    if (rights.isMember) return hydrate(rights.row, rights.actor.id);
    if (canReadProjectSummary(rights.row.visibility, rights.isMember)) return hydrate(rights.row, rights.actor.id, true);
    throw AppError.notFound("Project not found");
  }

  async getPublicProjectById(projectId: string) {
    const row = await resolveProject(projectId);
    if (!canReadProjectSummary(row.visibility, false)) throw AppError.notFound("Project not found");
    return hydrate(row, undefined, true);
  }

  async getProjectPaperIdsForUser(projectId: string, userId: string, feature?: ProjectAiFeature) {
    const rights = await access(projectId, userId);
    assertMember(rights);
    if (feature) assertMutable(rights);
    const links = await getPrisma().projectPaper.findMany({ where: { projectId: rights.row.id, ...(feature === "report" || feature === "gap analysis" ? { screeningStatus: "INCLUDED" } : feature === "project chat" ? { screeningStatus: { not: "EXCLUDED" } } : {}) }, orderBy: { createdAt: "asc" } });
    if (feature && !links.length) throw AppError.badRequest(feature === "project chat" ? "Add a non-excluded paper before using project chat" : `Include at least one screened paper before using ${feature}`);
    const papers = await getPrisma().paper.findMany({ where: { id: { in: links.map((link) => link.paperId) } }, select: { id: true, legacyMongoId: true } });
    const byId = new Map(papers.map((paper) => [paper.id, publicDatabaseId(paper)]));
    return links.map((link) => byId.get(link.paperId) ?? link.paperId);
  }

  async updateProject(projectId: string, data: UpdateProjectRequest, userId: string) {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    const updated = await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      const { project } = await authorizeProjectTransaction(tx, row.id, actor.id, "EDIT_SETTINGS");
      if (data.status === "ARCHIVED") throw AppError.badRequest("Use the archive action to archive a project");
      if (data.expectedVersion !== undefined && project.version !== data.expectedVersion) throw AppError.conflict("Project settings changed. Refresh before saving again");
      const publicVisibility = ["PUBLIC", "PUBLIC_SUMMARY"].includes(data.visibility ?? project.visibility);
      if (publicVisibility && (data.visibility !== undefined || data.publicSummary !== undefined) && !(data.publicSummary ?? project.publicSummary)?.trim()) {
        throw AppError.badRequest("Write a public description before publishing");
      }
      const areas = data.researchAreas ?? (data.researchField !== undefined ? data.researchField ? [data.researchField] : [] : undefined);
      const changesPlan = data.researchApproach !== undefined || data.inclusionCriteria !== undefined || data.exclusionCriteria !== undefined;
      if (changesPlan) await recordPlanSnapshot(tx, row.id, null, null);
      const next = await tx.project.update({ where: { id: row.id }, data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(areas !== undefined ? { researchAreas: areas, researchField: areas[0] ?? null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.visibility !== undefined ? { visibility: ["PUBLIC", "PUBLIC_SUMMARY"].includes(data.visibility) ? "PUBLIC" : "PRIVATE" } : {}),
        ...(data.publicSummary !== undefined ? { publicSummary: data.publicSummary || null } : {}),
        ...(data.inclusionCriteria !== undefined ? { inclusionCriteria: data.inclusionCriteria } : {}),
        ...(data.exclusionCriteria !== undefined ? { exclusionCriteria: data.exclusionCriteria } : {}),
        version: { increment: 1 },
      } });
      if (changesPlan) {
        await tx.researchPlan.update({ where: { projectId: row.id }, data: { ...(data.researchApproach !== undefined ? { approach: data.researchApproach } : {}), updatedById: actor.id, version: { increment: 1 } } });
        const revision = await recordPlanSnapshot(tx, row.id, actor.id, "Project settings updated");
        await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "PLAN_UPDATED", entityKind: "PLAN_REVISION", entityId: revision.id, metadata: { version: revision.version } } });
      }
      await tx.projectActivity.create({ data: { projectId: next.id, actorId: actor.id, type: "PROJECT_UPDATED", metadata: { fields: Object.keys(data).filter(key => key !== "expectedVersion") } } });
      return next;
    });
    return hydrate(updated, actor.id);
  }

  async archiveProject(projectId: string, userId: string) {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    const updated = await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      const { project } = await authorizeProjectTransaction(tx, row.id, actor.id, "ARCHIVE");
      const now = new Date();
      const next = await tx.project.update({ where: { id: row.id }, data: { status: "ARCHIVED", archivedAt: now, mentorshipDiscovery: "CLOSED", version: { increment: 1 } } });
      await tx.projectInvitation.updateMany({ where: { projectId: row.id, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: now } });
      await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "PROJECT_ARCHIVED", metadata: { previousStatus: project.status } } });
      return next;
    });
    return hydrate(updated, actor.id);
  }

  async restoreProject(projectId: string, userId: string) {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    const updated = await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      const { project } = await authorizeProjectTransaction(tx, row.id, actor.id, "RESTORE");
      if (project.status !== "ARCHIVED") throw AppError.conflict("This project is not archived");
      const event = await tx.projectActivity.findFirst({ where: { projectId: row.id, type: "PROJECT_ARCHIVED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const metadata = event?.metadata as { previousStatus?: string } | undefined;
      const previousStatus = metadata?.previousStatus;
      const status = previousStatus && ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"].includes(previousStatus) ? previousStatus : "PLANNING";
      const next = await tx.project.update({ where: { id: row.id }, data: { status, archivedAt: null, version: { increment: 1 } } });
      await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "PROJECT_RESTORED", metadata: {} } });
      return next;
    });
    return hydrate(updated, actor.id);
  }

  async deleteProject(projectId: string, userId: string) {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      await authorizeProjectTransaction(tx, row.id, actor.id, "DELETE");
      // One existence query short-circuits on history and avoids dozens of serial round trips under the lock.
      const [history] = await tx.$queryRaw<Array<{ has_history: boolean }>>`
        WITH target AS (SELECT ${row.id}::uuid AS project_id, ${actor.id}::uuid AS actor_id)
        SELECT EXISTS (
          SELECT 1 FROM project_papers h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM reports h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM research_gaps h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM submissions h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_members h, target WHERE h.project_id = target.project_id AND h.user_id <> target.actor_id
          UNION ALL SELECT 1 FROM project_activities h, target WHERE h.project_id = target.project_id AND h.type NOT IN ('PROJECT_CREATED','PROJECT_UPDATED','PROJECT_ARCHIVED','PROJECT_RESTORED')
          UNION ALL SELECT 1 FROM project_team_messages h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_chat_messages h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM draft_workspaces h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM manuscript_snapshots h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_evidence_items h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_screening_decisions h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_paper_files h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_workspace_revisions h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM review_requests h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM external_review_invitations h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM literature_corpora h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM research_contributions h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_contribution_proposals h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM allocation_periods h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM mentorship_requests h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM mentor_relationships h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM ai_runs h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM gap_analyses h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM review_templates h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM recruitment_openings h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM recruitment_applications h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_invitations h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM forum_post_projects h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM academic_featured_works h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_tasks h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_milestones h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_discussions h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_decisions h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM project_workspace_comments h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM plan_shares h, target WHERE h.project_id = target.project_id
          UNION ALL SELECT 1 FROM plan_revisions h, target WHERE h.project_id = target.project_id AND h.version > 1
        ) AS has_history
      `;
      if (history?.has_history) throw AppError.conflict("This project contains research or collaboration history. Archive it to preserve the records");
      await tx.auditLog.create({ data: { userId: actor.id, actionName: "PROJECT_DELETED", targetTableName: "projects", targetRecordId: row.id, details: { emptyProject: true } } });
      await tx.project.delete({ where: { id: row.id } });
    });
  }

  async addPaperToProject(projectId: string, paperId: string, userId: string) {
    const [rights, paper] = await Promise.all([access(projectId, userId), resolvePaper(paperId)]);
    assertMutable(rights);
    try {
      await getPrisma().$transaction(async (tx) => {
        await lockProjectAccounts(tx, [rights.actor.id], rights.row.id);
        await authorizeProjectTransaction(tx, rights.row.id, rights.actor.id, "CONTRIBUTE");
        await tx.projectPaper.create({ data: { projectId: rights.row.id, paperId: paper.id, addedById: rights.actor.id } });
        await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "PAPER_ADDED", entityKind: "PAPER", entityId: publicDatabaseId(paper), metadata: { title: paper.title } } });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("Paper already exists in this project");
      throw error;
    }
    return hydrate(rights.row, rights.actor.id);
  }

  async updateProjectPaper(projectId: string, paperId: string, data: UpdateProjectPaperRequest, userId: string) {
    const [rights, paper] = await Promise.all([access(projectId, userId), resolvePaper(paperId, true)]);
    assertMutable(rights);
    const link = await getPrisma().projectPaper.findUnique({ where: { projectId_paperId: { projectId: rights.row.id, paperId: paper.id } } });
    if (!link) throw AppError.notFound("Project paper not found");
    return getPrisma().$transaction(async (tx) => {
      await lockProjectAccounts(tx, [rights.actor.id], rights.row.id);
      await authorizeProjectTransaction(tx, rights.row.id, rights.actor.id, "CONTRIBUTE");
      const live = await tx.projectPaper.findUnique({ where: { id: link.id } });
      if (!live) throw AppError.notFound("Project paper not found");
      const policy = await tx.project.findUniqueOrThrow({ where: { id: rights.row.id }, select: { screeningMode: true } });
      if (policy.screeningMode === "INDEPENDENT" && [data.screeningStatus, data.inclusionReason, data.exclusionReason, data.exclusionNote].some(value => value !== undefined)) throw AppError.conflict("Use the assigned independent screening workflow and recorded team resolution");
      if (live.updatedAt.toISOString() !== (data.expectedUpdatedAt ?? link.updatedAt.toISOString())) throw AppError.conflict("This paper changed. Reload before saving your decision or notes");
      const nextStatus = data.screeningStatus ?? live.screeningStatus;
      const nextExclusionReason = data.exclusionReason === undefined ? live.exclusionReason : data.exclusionReason;
      if (nextStatus === "EXCLUDED" && !nextExclusionReason?.trim()) throw AppError.badRequest("An exclusion reason is required");
      if (data.inclusionReason !== undefined && nextStatus !== "INCLUDED") throw AppError.badRequest("Inclusion reasons are only valid for included papers");
      if (data.exclusionReason !== undefined && nextStatus !== "EXCLUDED") throw AppError.badRequest("Exclusion reasons are only valid for excluded papers");
      if (data.exclusionNote !== undefined && nextStatus !== "EXCLUDED") throw AppError.badRequest("Exclusion notes are only valid for excluded papers");
      if (data.screeningStatus !== undefined && data.screeningStatus !== live.screeningStatus) await invalidateSourceAssessments(tx, rights.row.id, rights.actor.id, { paperId: paper.id });
      const next = await tx.projectPaper.update({ where: { id: link.id }, data: {
        updatedAt: new Date(Math.max(Date.now(), live.updatedAt.getTime() + 1)),
        ...(data.screeningStatus !== undefined ? { screeningStatus: data.screeningStatus } : {}),
        ...(data.screeningStatus !== undefined ? { screenedById: rights.actor.id, screenedAt: new Date() } : {}),
        ...(data.readingStatus !== undefined ? { readingStatus: data.readingStatus } : {}),
        ...(data.inclusionReason !== undefined ? { inclusionReason: data.inclusionReason } : {}),
        ...(data.exclusionReason !== undefined ? { exclusionReason: data.exclusionReason } : {}),
        ...(data.exclusionNote !== undefined ? { exclusionNote: data.exclusionNote } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.screeningStatus === "INCLUDED" || data.screeningStatus === "UNDECIDED" || data.screeningStatus === "MAYBE" ? { exclusionReason: null, exclusionNote: null } : {}),
        ...(data.screeningStatus === "UNDECIDED" || data.screeningStatus === "MAYBE" ? { inclusionReason: null } : {}),
        ...(data.screeningStatus === "EXCLUDED" ? { inclusionReason: null } : {}),
      } });
      if (data.screeningStatus !== undefined || data.inclusionReason !== undefined || data.exclusionReason !== undefined || data.exclusionNote !== undefined) await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "PAPER_SCREENED", entityKind: "PAPER", entityId: publicDatabaseId(paper), metadata: { paperId: paper.id, title: paper.title, from: live.screeningStatus, to: next.screeningStatus, before: { status: live.screeningStatus, inclusionReason: live.inclusionReason, exclusionReason: live.exclusionReason, exclusionNote: live.exclusionNote, reviewerId: live.screenedById, screenedAt: live.screenedAt?.toISOString() ?? null }, after: { status: next.screeningStatus, inclusionReason: next.inclusionReason, exclusionReason: next.exclusionReason, exclusionNote: next.exclusionNote, reviewerId: next.screenedById, screenedAt: next.screenedAt?.toISOString() ?? null } } } });
      if (data.readingStatus && data.readingStatus !== link.readingStatus) await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "PAPER_READING_STATUS_CHANGED", entityKind: "PAPER", entityId: publicDatabaseId(paper), metadata: { title: paper.title, from: link.readingStatus, to: data.readingStatus } } });
      return next;
    });
  }

  async removePaperFromProject(projectId: string, paperId: string, userId: string) {
    const [rights, paper] = await Promise.all([access(projectId, userId), resolvePaper(paperId, true)]);
    assertMutable(rights);
    const removed = await getPrisma().$transaction(async (tx) => {
      await lockProjectAccounts(tx, [rights.actor.id], rights.row.id);
      await authorizeProjectTransaction(tx, rights.row.id, rights.actor.id, "CONTRIBUTE");
      const referenced = await tx.gapEvidenceRecord.findFirst({ where: { paperId: paper.id, gapId: { in: (await tx.researchGap.findMany({ where: { projectId: rights.row.id }, select: { id: true } })).map(gap => gap.id) } }, select: { id: true } });
      if (referenced) throw AppError.conflict("This paper supports recorded gap evidence. Keep the source in the project to preserve its provenance");
      if (await tx.projectEvidenceItem.count({ where: { projectId: rights.row.id, paperId: paper.id } }) || await tx.projectPaperFile.count({ where: { projectId: rights.row.id, paperId: paper.id } }) || await tx.projectScreeningDecision.count({ where: { projectId: rights.row.id, paperId: paper.id } })) throw AppError.conflict("This source has evidence, private files or screening history. Keep it in the project and use screening to exclude it");
      const result = await tx.projectPaper.deleteMany({ where: { projectId: rights.row.id, paperId: paper.id } });
      if (result.count) await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "PAPER_REMOVED", entityKind: "PAPER", entityId: publicDatabaseId(paper), metadata: { title: paper.title } } });
      return result;
    });
    if (!removed.count) throw AppError.notFound("Project paper not found");
    return hydrate(rights.row, rights.actor.id);
  }

  async inviteMember(projectId: string, input: InviteProjectMemberRequest, userId: string) {
    if (Boolean(input.userId) === Boolean(input.email)) throw AppError.badRequest("Select one user or enter one email address");
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    const emailInput = input.email?.trim().toLowerCase();
    const db = getPrisma();
    const linked = emailInput ? await db.userEmail.findUnique({ where: { normalizedEmail: emailInput } }) : null;
    const invited = input.userId ? await resolveUser(input.userId)
      : linked?.verifiedAt ? await db.user.findUnique({ where: { id: linked.userId } })
      : emailInput ? await db.user.findFirst({ where: { email: { equals: emailInput, mode: "insensitive" }, emailVerifiedAt: { not: null } } }) : null;
    const email = emailInput ?? invited?.email.toLowerCase();
    if (!email) throw AppError.badRequest("A valid invitation email is required");
    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id, ...(invited ? [invited.id] : [])], row.id);
      const { project } = await authorizeProjectTransaction(tx, row.id, actor.id, "MANAGE_MEMBERS");
      if (invited) {
        await assertActiveProjectAccount(tx, invited.id);
        const emails = await verifiedEmailsForUser(invited.id, tx);
        if (!emails.includes(email)) throw AppError.conflict("The selected account no longer owns this verified email");
      }
      if (invited?.id === project.ownerId) throw AppError.conflict("This account already owns the project");
      if (invited && await tx.projectMember.findFirst({ where: { projectId: row.id, userId: invited.id, status: ACTIVE } })) throw AppError.conflict("This user is already a project member");
      const now = new Date();
      await tx.projectInvitation.updateMany({ where: { projectId: row.id, status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } });
      const pending = await tx.projectInvitation.findFirst({ where: { projectId: row.id, status: "PENDING", OR: [{ email: { equals: email, mode: "insensitive" } }, ...(invited ? [{ invitedUserId: invited.id }] : [])] } });
      if (pending) throw AppError.conflict("A pending invitation already exists for this person. Use Resend instead");
      const token = createOpaqueToken();
      const invite = await tx.projectInvitation.create({ data: {
        projectId: row.id, invitedUserId: invited?.id, email, message: input.message,
        invitedById: actor.id, tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(now.getTime() + INVITATION_DAYS * 86400000), lastSentAt: now,
      } });
      await queueProjectInvitation(tx, invite, token);
      await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "MEMBER_INVITED", entityKind: "INVITATION", entityId: invite.id, metadata: { email } } });
      return { id: invite.id, status: invite.status, expiresAt: invite.expiresAt.toISOString() };
    });
  }

  async resendInvitation(projectId: string, invitationId: string, userId: string) {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    return getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      await authorizeProjectTransaction(tx, row.id, actor.id, "MANAGE_MEMBERS");
      const invite = await tx.projectInvitation.findUnique({ where: { id: invitationId } });
      if (!invite || invite.projectId !== row.id) throw AppError.notFound("Invitation not found");
      if (!["PENDING", "EXPIRED"].includes(invite.status)) throw AppError.conflict("This invitation cannot be resent");
      const now = new Date(), availableAt = new Date(invite.lastSentAt.getTime() + RESEND_COOLDOWN_MS);
      if (now < availableAt) throw AppError.tooMany("Wait before resending this invitation", { retryAt: availableAt.toISOString() });
      if (invite.invitedUserId && await tx.projectMember.findFirst({ where: { projectId: row.id, userId: invite.invitedUserId, status: ACTIVE } })) throw AppError.conflict("This person is already a member");
      const otherPending = await tx.projectInvitation.findFirst({ where: { projectId: row.id, id: { not: invite.id }, status: "PENDING", OR: [{ email: { equals: invite.email, mode: "insensitive" } }, ...(invite.invitedUserId ? [{ invitedUserId: invite.invitedUserId }] : [])] } });
      if (otherPending) throw AppError.conflict("A newer invitation already exists for this person");
      const token = createOpaqueToken();
      const updated = await tx.projectInvitation.update({ where: { id: invite.id }, data: { status: "PENDING", tokenHash: hashOpaqueToken(token), lastSentAt: now, expiresAt: new Date(now.getTime() + INVITATION_DAYS * 86400000), respondedAt: null, invitedById: actor.id } });
      await queueProjectInvitation(tx, updated, token);
      await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "INVITATION_RESENT", entityKind: "INVITATION", entityId: invite.id, metadata: {} } });
      return { id: updated.id, expiresAt: updated.expiresAt.toISOString(), resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS).toISOString() };
    });
  }

  async team(projectId: string, userId: string, input: { page?: number; invitationPage?: number; pageSize?: number } = {}) {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    const page = Math.max(1, input.page ?? 1), invitationPage = Math.max(1, input.invitationPage ?? 1), pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
    return getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      const rights = await authorizeProjectTransaction(tx, row.id, actor.id);
      const owner = rights.role === "OWNER", now = new Date();
      const memberWhere = { projectId: row.id, status: ACTIVE };
      const inviteWhere = { projectId: row.id, status: "PENDING", expiresAt: { gt: now } };
      const [members, memberCount, invites, invitationCount] = await Promise.all([
        tx.projectMember.findMany({ where: memberWhere, orderBy: [{ role: "desc" }, { joinedAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        tx.projectMember.count({ where: memberWhere }),
        owner ? tx.projectInvitation.findMany({ where: inviteWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (invitationPage - 1) * pageSize, take: pageSize }) : [],
        owner ? tx.projectInvitation.count({ where: inviteWhere }) : 0,
      ]);
      const users = await tx.user.findMany({ where: { id: { in: [...new Set([...members.map(m => m.userId), ...invites.flatMap(i => i.invitedUserId ? [i.invitedUserId] : [])])] } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true } });
      const people = new Map(users.map(u => [u.id, u]));
      return {
        members: members.map(m => ({ targetKind: "User" as const, targetId: people.has(m.userId) ? userSummary(people.get(m.userId)!, owner || m.userId === actor.id) : m.userId, role: m.userId === rights.project.ownerId ? "OWNER" as const : "MEMBER" as const, status: "ACTIVE" as const, joinedAt: m.joinedAt.toISOString() })),
        invitations: invites.map(i => ({ id: i.id, projectId: publicDatabaseId(row), email: i.email, invitedUser: i.invitedUserId && people.has(i.invitedUserId) ? userSummary(people.get(i.invitedUserId)!, true) : undefined, status: "PENDING" as const, message: i.message ?? undefined, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString(), lastSentAt: i.lastSentAt.toISOString(), resendAvailableAt: new Date(i.lastSentAt.getTime() + RESEND_COOLDOWN_MS).toISOString() })),
        memberMeta: { page, pageSize, total: memberCount, totalPages: Math.ceil(memberCount / pageSize) },
        invitationMeta: { page: invitationPage, pageSize, total: invitationCount, totalPages: Math.ceil(invitationCount / pageSize) },
      };
    });
  }

  async listMyInvitations(userIdInput: string) {
    return (await this.getMyInvitationPage(userIdInput)).items;
  }

  async getMyInvitationPage(userIdInput: string, input: { page?: number; pageSize?: number } = {}) {
    const actor = await resolveUser(userIdInput);
    await assertResearchWorkflowAccess(actor.id);
    const verifiedEmails = await verifiedEmailsForUser(actor.id), now = new Date();
    const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 100));
    const invitations = await getPrisma().projectInvitation.findMany({ where: { status: "PENDING", expiresAt: { gt: now }, email: { in: verifiedEmails }, OR: [{ invitedUserId: null }, { invitedUserId: actor.id }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize + 1 });
    const hasNext = invitations.length > pageSize;
    if (hasNext) invitations.pop();
    const [projects, inviters] = await Promise.all([
      getPrisma().project.findMany({ where: { id: { in: invitations.map(i => i.projectId) }, status: { not: "ARCHIVED" } }, select: { id: true, legacyMongoId: true, title: true } }),
      getPrisma().user.findMany({ where: { id: { in: invitations.map(i => i.invitedById) } }, select: { id: true, fullName: true } }),
    ]);
    const byId = new Map(projects.map(p => [p.id, p])), inviterMap = new Map(inviters.map(u => [u.id, u]));
    const items = invitations.flatMap(i => { const p = byId.get(i.projectId); return p ? [{ id: i.id, projectId: publicDatabaseId(p), projectTitle: p.title, inviterName: inviterMap.get(i.invitedById)?.fullName || undefined, role: "MEMBER" as const, status: "PENDING" as const, message: i.message ?? undefined, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() }] : []; });
    return { items, meta: { page, pageSize, hasNext } };
  }

  async getInvitationByToken(token: string, viewerId?: string) {
    return invitationPreview(await invitationByToken(token), viewerId);
  }

  async respondToInvitationByToken(token: string, userId: string, decision: "ACCEPTED" | "DECLINED") {
    const invite = await invitationByToken(token);
    return this.respondToInvitation(invite.projectId, invite.id, userId, decision, hashOpaqueToken(token));
  }

  async respondToInvitation(projectId: string, invitationId: string, userId: string, decision: "ACCEPTED" | "DECLINED", expectedTokenHash?: string) {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    const result = await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      await assertActiveProjectAccount(tx, actor.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: row.id } });
      const invite = await tx.projectInvitation.findUnique({ where: { id: invitationId } });
      if (!invite || invite.projectId !== row.id || expectedTokenHash && invite.tokenHash !== expectedTokenHash) throw AppError.notFound("Invitation not found");
      if (!invitationBelongsToUser(invite, { id: actor.id, verifiedEmails: await verifiedEmailsForUser(actor.id, tx) })) throw AppError.forbidden("This invitation belongs to another verified account");
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: row.id, userId: actor.id } } });
      const alreadyMember = member?.status === ACTIVE;
      if (invite.status === decision && (decision === "DECLINED" || alreadyMember)) return { status: decision, alreadyMember, projectId: publicDatabaseId(project) };
      if (invite.status !== "PENDING") throw AppError.conflict("This invitation is no longer pending");
      const now = new Date();
      if (invite.expiresAt <= now) {
        await tx.projectInvitation.update({ where: { id: invite.id }, data: { status: "EXPIRED", respondedAt: now } });
        return { expired: true as const };
      }
      if (project.status === "ARCHIVED" && decision === "ACCEPTED") throw AppError.conflict("Archived projects cannot accept new members");
      await tx.projectInvitation.update({ where: { id: invite.id }, data: { status: decision, respondedAt: now, invitedUserId: actor.id } });
      if (decision === "ACCEPTED" && !alreadyMember) await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: row.id, userId: actor.id } },
        create: { projectId: row.id, userId: actor.id, role: project.ownerId === actor.id ? "OWNER" : "MEMBER" },
        update: { status: ACTIVE, role: project.ownerId === actor.id ? "OWNER" : "MEMBER", joinedAt: now },
      });
      await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: decision === "ACCEPTED" ? "MEMBER_JOINED" : "INVITATION_DECLINED", entityKind: "INVITATION", entityId: invite.id, metadata: {} } });
      return { status: decision, alreadyMember, projectId: publicDatabaseId(project) };
    });
    if ("expired" in result) throw AppError.conflict("This invitation has expired");
    return result;
  }

  async cancelInvitation(projectId: string, invitationId: string, userId: string) {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      await authorizeProjectTransaction(tx, row.id, actor.id, "MANAGE_MEMBERS");
      const changed = await tx.projectInvitation.updateMany({ where: { id: invitationId, projectId: row.id, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: new Date() } });
      if (!changed.count) throw AppError.notFound("Pending invitation not found");
      await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "INVITATION_CANCELLED", entityKind: "INVITATION", entityId: invitationId, metadata: {} } });
    });
  }

  /** Compatibility route: consent is required before anyone becomes a member. */
  async addMemberToProject(projectId: string, memberData: Pick<AddProjectMemberRequest, "targetId">, userId: string) {
    const target = memberData.targetId.trim();
    return this.inviteMember(projectId, target.includes("@") ? { email: target } : { userId: target }, userId);
  }

  async removeMemberFromProject(projectId: string, targetId: string, userId: string) {
    const [row, actor, target] = await Promise.all([resolveProject(projectId), resolveUser(userId), resolveUser(targetId)]);
    const updated = await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id, target.id], row.id);
      const { project } = await authorizeProjectTransaction(tx, row.id, actor.id, "MANAGE_MEMBERS");
      if (project.ownerId === target.id) throw AppError.conflict("Transfer ownership before removing the owner");
      const changed = await tx.projectMember.updateMany({ where: { projectId: row.id, userId: target.id, status: ACTIVE }, data: { status: "REMOVED", role: "MEMBER" } });
      if (!changed.count) throw AppError.notFound("Active project member not found");
      await revokeProjectScreeningAssignments(tx, row.id, target.id, actor.id);
      await tx.projectInvitation.updateMany({ where: { projectId: row.id, invitedUserId: target.id, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: new Date() } });
      await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "MEMBER_REMOVED", entityKind: "USER", entityId: publicDatabaseId(target), metadata: {} } });
      return project;
    });
    return hydrate(updated, actor.id);
  }

  async leaveProject(projectId: string, userId: string) {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      await authorizeProjectTransaction(tx, row.id, actor.id, "LEAVE");
      await tx.projectMember.update({ where: { projectId_userId: { projectId: row.id, userId: actor.id } }, data: { status: "LEFT", role: "MEMBER" } });
      await revokeProjectScreeningAssignments(tx, row.id, actor.id, actor.id);
      await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "MEMBER_LEFT", entityKind: "USER", entityId: publicDatabaseId(actor), metadata: {} } });
    });
  }

  async transferOwnership(projectId: string, targetUserId: string, userId: string) {
    const [row, actor, target] = await Promise.all([resolveProject(projectId), resolveUser(userId), resolveUser(targetUserId)]);
    const updated = await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id, target.id], row.id);
      await authorizeProjectTransaction(tx, row.id, actor.id, "MANAGE_MEMBERS");
      await assertActiveProjectAccount(tx, target.id);
      if (actor.id === target.id) throw AppError.conflict("This account already owns the project");
      const targetMember = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: row.id, userId: target.id } } });
      if (targetMember?.status !== ACTIVE) throw AppError.conflict("Ownership can only be transferred to an active member");
      // Demote before promotion to respect the unique active-owner constraint.
      await tx.projectMember.update({ where: { projectId_userId: { projectId: row.id, userId: actor.id } }, data: { role: "MEMBER" } });
      await tx.projectMember.update({ where: { id: targetMember.id }, data: { role: "OWNER" } });
      const next = await tx.project.update({ where: { id: row.id }, data: { ownerId: target.id, version: { increment: 1 } } });
      await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "OWNERSHIP_TRANSFERRED", entityKind: "USER", entityId: publicDatabaseId(target), metadata: {} } });
      return next;
    });
    return hydrate(updated, actor.id);
  }

  async listActivity(projectId: string, userId: string, limit: number) {
    const rights = await access(projectId, userId);
    assertMember(rights);
    return projectActivityService.list(rights.row.id, limit);
  }
}

export const projectService = new ProjectService();
