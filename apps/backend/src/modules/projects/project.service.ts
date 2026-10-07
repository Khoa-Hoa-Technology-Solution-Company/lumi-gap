import type {
  AddProjectMemberRequest,
  CreateProjectRequest,
  InviteProjectMemberRequest,
  ProjectInvitationPreview,
  ProjectRole,
  UpdateProjectPaperRequest,
  UpdateProjectRequest,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { notificationService } from "../notifications/notification.service.js";
import { createOpaqueToken, hashOpaqueToken } from "../auth/token.service.js";
import { participantScopeForUser } from "../identity/participant-scope.service.js";
import { projectActivityService } from "./project-activity.service.js";
import type { ProjectAiFeature } from "./project-scope.js";
import { assertProjectActionAllowed, invitationBelongsToUser } from "./project-workspace.rules.js";
import { sendProjectInvitationEmail } from "./project-invitation.mail.js";

const ACTIVE = "ACTIVE";
const INVITATION_DAYS = 7;

function runProjectInvitationDelivery(input: {
  invitedUserId?: string;
  email: string;
  projectId: string;
  publicProjectId: string;
  projectTitle: string;
  inviterName: string;
  token: string;
  message?: string;
}) {
  void (async () => {
    const tasks: Array<Promise<unknown>> = [
      sendProjectInvitationEmail({
        email: input.email,
        projectTitle: input.projectTitle,
        inviterName: input.inviterName,
        token: input.token,
        message: input.message,
      }),
    ];
    if (input.invitedUserId) {
      tasks.push(notificationService.create({
        userId: input.invitedUserId,
        title: "Project invitation",
        message: `${input.inviterName} invited you to ${input.projectTitle}.`,
        type: "project_invitation",
        targetKind: "project",
        targetId: input.publicProjectId,
      }));
    }
    const results = await Promise.allSettled(tasks);
    for (const result of results) {
      if (result.status === "rejected") {
        logger.warn({ error: result.reason, projectId: input.projectId }, "project invitation background delivery failed");
      }
    }
  })();
}

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

async function resolvePaper(value: string) {
  const row = await getPrisma().paper.findUnique({ where: whereId(value) });
  if (!row || row.dataStatus !== "active") throw AppError.notFound("Paper not found");
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
  const membership = await getPrisma().projectMember.findUnique({
    where: { projectId_userId: { projectId: row.id, userId: actor.id } },
  });
  const isOwner = row.ownerId === actor.id;
  const isMember = isOwner || membership?.status.toUpperCase() === ACTIVE;
  return { row, actor, membership, isOwner, isMember, role: isOwner ? "OWNER" as const : isMember ? "MEMBER" as const : undefined };
}

function assertMember(rights: Awaited<ReturnType<typeof access>>) {
  assertProjectActionAllowed(rights.role, rights.row.status, "CONTRIBUTE");
}

function assertOwner(rights: Awaited<ReturnType<typeof access>>) {
  if (!rights.isOwner) throw AppError.forbidden("Only the project owner can perform this action");
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

async function verifiedEmailsForUser(userId: string): Promise<string[]> {
  const [rows, user] = await Promise.all([
    getPrisma().userEmail.findMany({ where: { userId, verifiedAt: { not: null } }, select: { normalizedEmail: true } }),
    getPrisma().user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } }),
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
    await prisma.projectInvitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "EXPIRED", respondedAt: now } });
  }
  const alreadyMember = viewer
    ? Boolean(await prisma.projectMember.findFirst({ where: { projectId: project.id, userId: viewer.id, status: ACTIVE } }))
    : false;
  const viewerEmails = viewer ? await verifiedEmailsForUser(viewer.id) : [];
  const invitedEmail = invitation.email.toLowerCase();
  return {
    id: invitation.id,
    projectId: publicDatabaseId(project),
    projectTitle: project.title,
    projectDescription: project.description ?? undefined,
    invitedEmail: invitation.email,
    currentUserEmail: viewer?.email,
    inviterName: inviter?.fullName || inviter?.email || "A LumiGap member",
    role: "MEMBER",
    message: invitation.message ?? undefined,
    status: effectiveStatus as ProjectInvitationPreview["status"],
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    authenticated: Boolean(viewer),
    emailMatches: viewerEmails.includes(invitedEmail),
    alreadyMember,
  };
}

async function hydrate(row: Awaited<ReturnType<typeof resolveProject>>, viewerId?: string, publicSummary = false) {
  const prisma = getPrisma();
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
    ? await prisma.projectInvitation.findMany({ where: { projectId: row.id, status: "PENDING" }, orderBy: { createdAt: "desc" } })
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
    const participantScope = await participantScopeForUser(owner.id);
    if (owner.admissionBasis === "INVITATION" && participantScope === "EXTERNAL") {
      throw AppError.forbidden("Invited external collaborators can join invited projects but cannot create projects until a current FPT affiliation is verified");
    }
    const row = await getPrisma().$transaction(async (tx) => {
      const created = await tx.project.create({ data: {
        title: data.title,
        description: data.description,
        researchField: data.researchField,
        status: data.status ?? "PLANNING",
        visibility: data.visibility ?? "PRIVATE",
        ownerId: owner.id,
      } });
      await tx.projectMember.create({ data: { projectId: created.id, userId: owner.id, role: "OWNER", status: ACTIVE } });
      await tx.projectActivity.create({ data: { projectId: created.id, actorId: owner.id, type: "PROJECT_CREATED", metadata: {} } });
      return created;
    });
    return hydrate(row, owner.id);
  }

  async getProjectsByUser(userIdInput: string) {
    const actor = await resolveUser(userIdInput);
    const memberships = await getPrisma().projectMember.findMany({ where: { userId: actor.id, status: ACTIVE }, select: { projectId: true } });
    const rows = await getPrisma().project.findMany({
      where: { OR: [{ ownerId: actor.id }, { id: { in: memberships.map((membership) => membership.projectId) } }] },
      orderBy: { updatedAt: "desc" },
    });
    return Promise.all(rows.map((project) => hydrate(project, actor.id)));
  }

  async getProjectById(projectId: string, userIdInput: string) {
    const rights = await access(projectId, userIdInput);
    if (rights.isMember) return hydrate(rights.row, rights.actor.id);
    if (rights.row.visibility === "PUBLIC_SUMMARY") return hydrate(rights.row, rights.actor.id, true);
    throw AppError.notFound("Project not found");
  }

  async getPublicProjectById(projectId: string) {
    const row = await resolveProject(projectId);
    if (row.visibility !== "PUBLIC_SUMMARY") throw AppError.notFound("Project not found");
    return hydrate(row, undefined, true);
  }

  async getProjectPaperIdsForUser(projectId: string, userId: string, feature?: ProjectAiFeature) {
    const rights = await access(projectId, userId);
    assertMember(rights);
    const links = await getPrisma().projectPaper.findMany({ where: { projectId: rights.row.id, ...(feature === "report" || feature === "gap analysis" ? { screeningStatus: "INCLUDED" } : feature === "project chat" ? { screeningStatus: { not: "EXCLUDED" } } : {}) }, orderBy: { createdAt: "asc" } });
    if (feature && !links.length) throw AppError.badRequest(feature === "project chat" ? "Add a non-excluded paper before using project chat" : `Include at least one screened paper before using ${feature}`);
    const papers = await getPrisma().paper.findMany({ where: { id: { in: links.map((link) => link.paperId) } }, select: { id: true, legacyMongoId: true } });
    const byId = new Map(papers.map((paper) => [paper.id, publicDatabaseId(paper)]));
    return links.map((link) => byId.get(link.paperId) ?? link.paperId);
  }

  async updateProject(projectId: string, data: UpdateProjectRequest, userId: string) {
    const rights = await access(projectId, userId);
    assertOwner(rights);
    if (rights.row.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    if (data.status === "ARCHIVED") throw AppError.badRequest("Use the archive action to archive a project");
    const updated = await getPrisma().$transaction(async (tx) => {
      const next = await tx.project.update({ where: { id: rights.row.id }, data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.researchField !== undefined ? { researchField: data.researchField } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
        ...(data.inclusionCriteria !== undefined ? { inclusionCriteria: data.inclusionCriteria } : {}),
        ...(data.exclusionCriteria !== undefined ? { exclusionCriteria: data.exclusionCriteria } : {}),
      } });
      await tx.projectActivity.create({ data: { projectId: next.id, actorId: rights.actor.id, type: "PROJECT_UPDATED", metadata: { fields: Object.keys(data) } } });
      return next;
    });
    return hydrate(updated, rights.actor.id);
  }

  async archiveProject(projectId: string, userId: string) {
    const rights = await access(projectId, userId);
    assertOwner(rights);
    assertMutable(rights);
    const updated = await getPrisma().$transaction(async (tx) => {
      const archivedAt = new Date();
      const next = await tx.project.update({ where: { id: rights.row.id }, data: { status: "ARCHIVED", archivedAt } });
      await tx.projectInvitation.updateMany({
        where: { projectId: rights.row.id, status: "PENDING" },
        data: { status: "CANCELLED", respondedAt: archivedAt },
      });
      await tx.projectActivity.create({ data: { projectId: next.id, actorId: rights.actor.id, type: "PROJECT_ARCHIVED", metadata: {} } });
      return next;
    });
    return hydrate(updated, rights.actor.id);
  }

  async deleteProject(projectId: string, userId: string) {
    const rights = await access(projectId, userId);
    assertOwner(rights);
    await getPrisma().project.delete({ where: { id: rights.row.id } });
  }

  async addPaperToProject(projectId: string, paperId: string, userId: string) {
    const [rights, paper] = await Promise.all([access(projectId, userId), resolvePaper(paperId)]);
    assertMutable(rights);
    try {
      await getPrisma().$transaction(async (tx) => {
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
    const [rights, paper] = await Promise.all([access(projectId, userId), resolvePaper(paperId)]);
    assertMutable(rights);
    const link = await getPrisma().projectPaper.findUnique({ where: { projectId_paperId: { projectId: rights.row.id, paperId: paper.id } } });
    if (!link) throw AppError.notFound("Project paper not found");
    const nextStatus = data.screeningStatus ?? link.screeningStatus;
    const nextExclusionReason = data.exclusionReason === undefined ? link.exclusionReason : data.exclusionReason;
    if (nextStatus === "EXCLUDED" && !nextExclusionReason?.trim()) throw AppError.badRequest("An exclusion reason is required");
    if (data.exclusionReason !== undefined && nextStatus !== "EXCLUDED") throw AppError.badRequest("Exclusion reasons are only valid for excluded papers");
    if (data.exclusionNote !== undefined && nextStatus !== "EXCLUDED") throw AppError.badRequest("Exclusion notes are only valid for excluded papers");
    return getPrisma().$transaction(async (tx) => {
      const next = await tx.projectPaper.update({ where: { id: link.id }, data: {
        ...(data.screeningStatus !== undefined ? { screeningStatus: data.screeningStatus } : {}),
        ...(data.screeningStatus !== undefined ? { screenedById: rights.actor.id, screenedAt: new Date() } : {}),
        ...(data.readingStatus !== undefined ? { readingStatus: data.readingStatus } : {}),
        ...(data.inclusionReason !== undefined ? { inclusionReason: data.inclusionReason } : {}),
        ...(data.exclusionReason !== undefined ? { exclusionReason: data.exclusionReason } : {}),
        ...(data.exclusionNote !== undefined ? { exclusionNote: data.exclusionNote } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.screeningStatus === "INCLUDED" || data.screeningStatus === "UNDECIDED" ? { exclusionReason: null, exclusionNote: null } : {}),
        ...(data.screeningStatus === "INCLUDED" || data.screeningStatus === "UNDECIDED" ? { inclusionReason: null } : {}),
        ...(data.screeningStatus === "EXCLUDED" ? { inclusionReason: null } : {}),
      } });
      if (data.screeningStatus && data.screeningStatus !== link.screeningStatus) await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "PAPER_SCREENED", entityKind: "PAPER", entityId: publicDatabaseId(paper), metadata: { title: paper.title, from: link.screeningStatus, to: data.screeningStatus } } });
      if (data.readingStatus && data.readingStatus !== link.readingStatus) await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "PAPER_READING_STATUS_CHANGED", entityKind: "PAPER", entityId: publicDatabaseId(paper), metadata: { title: paper.title, from: link.readingStatus, to: data.readingStatus } } });
      return next;
    });
  }

  async removePaperFromProject(projectId: string, paperId: string, userId: string) {
    const [rights, paper] = await Promise.all([access(projectId, userId), resolvePaper(paperId)]);
    assertMutable(rights);
    const removed = await getPrisma().$transaction(async (tx) => {
      const result = await tx.projectPaper.deleteMany({ where: { projectId: rights.row.id, paperId: paper.id } });
      if (result.count) await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "PAPER_REMOVED", entityKind: "PAPER", entityId: publicDatabaseId(paper), metadata: { title: paper.title } } });
      return result;
    });
    if (!removed.count) throw AppError.notFound("Project paper not found");
    return hydrate(rights.row, rights.actor.id);
  }

  async inviteMember(projectId: string, input: InviteProjectMemberRequest, userId: string) {
    const rights = await access(projectId, userId);
    assertOwner(rights);
    assertMutable(rights);
    const linkedEmail = input.email
      ? await getPrisma().userEmail.findUnique({ where: { normalizedEmail: input.email.trim().toLowerCase() } })
      : null;
    const invitedUser = input.userId
      ? await resolveUser(input.userId)
      : linkedEmail?.verifiedAt ? await getPrisma().user.findUnique({ where: { id: linkedEmail.userId } }) : null;
    const email = (input.email ?? invitedUser?.email)?.trim().toLowerCase();
    if (!email) throw AppError.badRequest("A LumiGap user or email address is required");
    if (invitedUser?.id === rights.actor.id || email === rights.actor.email.toLowerCase()) throw AppError.badRequest("You are already the project owner");
    if (invitedUser && await getPrisma().projectMember.findFirst({ where: { projectId: rights.row.id, userId: invitedUser.id, status: ACTIVE } })) throw AppError.conflict("This user is already a project member");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
    const rawToken = createOpaqueToken();
    let invitation;
    try {
      invitation = await getPrisma().$transaction(async (tx) => {
        await tx.projectInvitation.updateMany({ where: { projectId: rights.row.id, status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } });
        const pending = await tx.projectInvitation.findFirst({ where: { projectId: rights.row.id, email, status: "PENDING" } });
        const created = pending
          ? await tx.projectInvitation.update({
              where: { id: pending.id },
              data: { invitedUserId: invitedUser?.id, message: input.message, tokenHash: hashOpaqueToken(rawToken), invitedById: rights.actor.id, expiresAt, respondedAt: null },
            })
          : await tx.projectInvitation.create({ data: { projectId: rights.row.id, invitedUserId: invitedUser?.id, email, message: input.message, tokenHash: hashOpaqueToken(rawToken), invitedById: rights.actor.id, status: "PENDING", expiresAt } });
        await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "MEMBER_INVITED", entityKind: "INVITATION", entityId: created.id, metadata: { email } } });
        return created;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("A pending invitation already exists for this person");
      throw error;
    }
    runProjectInvitationDelivery({
      invitedUserId: invitedUser?.id,
      email,
      projectId: rights.row.id,
      publicProjectId: publicDatabaseId(rights.row),
      projectTitle: rights.row.title,
      inviterName: rights.actor.fullName || rights.actor.email,
      token: rawToken,
      message: input.message,
    });
    return { id: invitation.id, status: invitation.status, expiresAt: invitation.expiresAt.toISOString() };
  }

  async listMyInvitations(userIdInput: string) {
    const actor = await resolveUser(userIdInput);
    const verifiedEmails = await verifiedEmailsForUser(actor.id);
    const now = new Date();
    await getPrisma().projectInvitation.updateMany({ where: { status: "PENDING", expiresAt: { lte: now }, email: { in: verifiedEmails } }, data: { status: "EXPIRED", respondedAt: now } });
    const invitations = await getPrisma().projectInvitation.findMany({ where: { status: "PENDING", email: { in: verifiedEmails } }, orderBy: { createdAt: "desc" } });
    const projects = await getPrisma().project.findMany({ where: { id: { in: invitations.map((invite) => invite.projectId) } }, select: { id: true, legacyMongoId: true, title: true, description: true } });
    const inviters = await getPrisma().user.findMany({
      where: { id: { in: invitations.map((invite) => invite.invitedById) } },
      select: { id: true, fullName: true, email: true },
    });
    const byId = new Map(projects.map((project) => [project.id, project]));
    const inviterById = new Map(inviters.map((user) => [user.id, user]));
    return invitations.flatMap((invite) => {
      const project = byId.get(invite.projectId);
      const inviter = inviterById.get(invite.invitedById);
      return project ? [{
        id: invite.id,
        projectId: publicDatabaseId(project),
        projectTitle: project.title,
        projectDescription: project.description ?? undefined,
        inviterName: inviter?.fullName || inviter?.email || undefined,
        role: "MEMBER" as const,
        status: invite.status as "PENDING",
        message: invite.message ?? undefined,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      }] : [];
    });
  }

  async getInvitationByToken(token: string, viewerId?: string) {
    const invitation = await invitationByToken(token);
    return invitationPreview(invitation, viewerId);
  }

  async respondToInvitationByToken(token: string, userId: string, decision: "ACCEPTED" | "DECLINED") {
    const prisma = getPrisma();
    const [invite, actor] = await Promise.all([invitationByToken(token), resolveUser(userId)]);
    const verifiedEmails = await verifiedEmailsForUser(actor.id);
    if (!verifiedEmails.includes(invite.email.toLowerCase())) {
      throw AppError.forbidden("This invitation was sent to another email address");
    }
    if (invite.status !== "PENDING") throw AppError.conflict("This invitation is no longer pending");
    const now = new Date();
    if (invite.expiresAt <= now) {
      await prisma.projectInvitation.updateMany({ where: { id: invite.id, status: "PENDING" }, data: { status: "EXPIRED", respondedAt: now } });
      throw AppError.conflict("This invitation has expired");
    }
    const project = await prisma.project.findUnique({ where: { id: invite.projectId }, select: { status: true } });
    if (!project) throw AppError.notFound("Project not found");
    if (project.status === "ARCHIVED" && decision === "ACCEPTED") throw AppError.conflict("Archived projects cannot accept new members");
    const alreadyMember = Boolean(await prisma.projectMember.findFirst({ where: { projectId: invite.projectId, userId: actor.id, status: ACTIVE } }));
    await prisma.$transaction(async (tx) => {
      const changed = await tx.projectInvitation.updateMany({
        where: { id: invite.id, status: "PENDING", expiresAt: { gt: now } },
        data: { status: decision, respondedAt: now, invitedUserId: actor.id },
      });
      if (changed.count !== 1) throw AppError.conflict("This invitation was already handled");
      if (decision === "ACCEPTED" && !alreadyMember) {
        await tx.projectMember.create({ data: { projectId: invite.projectId, userId: actor.id, role: "MEMBER", status: ACTIVE } });
        await tx.projectActivity.create({ data: { projectId: invite.projectId, actorId: actor.id, type: "MEMBER_JOINED", entityKind: "USER", entityId: publicDatabaseId(actor), metadata: { viaInvitation: true } } });
      }
    });
    return { status: decision, alreadyMember };
  }

  async respondToInvitation(projectId: string, invitationId: string, userId: string, decision: "ACCEPTED" | "DECLINED") {
    const [row, actor] = await Promise.all([resolveProject(projectId), resolveUser(userId)]);
    if (row.status === "ARCHIVED" && decision === "ACCEPTED") throw AppError.conflict("Archived projects cannot accept new members");
    const invite = await getPrisma().projectInvitation.findUnique({ where: { id: invitationId } });
    if (!invite || invite.projectId !== row.id) throw AppError.notFound("Invitation not found");
    const verifiedEmails = await verifiedEmailsForUser(actor.id);
    if (!invitationBelongsToUser(invite, { id: actor.id, verifiedEmails })) throw AppError.forbidden("This invitation belongs to another account");
    if (invite.status !== "PENDING") throw AppError.conflict("This invitation is no longer pending");
    if (invite.expiresAt <= new Date()) {
      await getPrisma().projectInvitation.updateMany({ where: { id: invite.id, status: "PENDING" }, data: { status: "EXPIRED", respondedAt: new Date() } });
      throw AppError.conflict("This invitation has expired");
    }
    await getPrisma().$transaction(async (tx) => {
      const changed = await tx.projectInvitation.updateMany({ where: { id: invite.id, status: "PENDING", expiresAt: { gt: new Date() } }, data: { status: decision, respondedAt: new Date(), invitedUserId: actor.id } });
      if (changed.count !== 1) throw AppError.conflict("This invitation was already handled");
      if (decision === "ACCEPTED") {
        await tx.projectMember.upsert({ where: { projectId_userId: { projectId: row.id, userId: actor.id } }, create: { projectId: row.id, userId: actor.id, role: "MEMBER", status: ACTIVE }, update: { role: "MEMBER", status: ACTIVE, joinedAt: new Date() } });
        await tx.projectActivity.create({ data: { projectId: row.id, actorId: actor.id, type: "MEMBER_JOINED", entityKind: "USER", entityId: publicDatabaseId(actor), metadata: {} } });
      }
    });
    return { status: decision };
  }

  async cancelInvitation(projectId: string, invitationId: string, userId: string) {
    const rights = await access(projectId, userId);
    assertOwner(rights);
    const changed = await getPrisma().projectInvitation.updateMany({ where: { id: invitationId, projectId: rights.row.id, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: new Date() } });
    if (!changed.count) throw AppError.notFound("Pending invitation not found");
  }

  async addMemberToProject(projectId: string, memberData: AddProjectMemberRequest, userId: string) {
    const rights = await access(projectId, userId);
    assertOwner(rights);
    assertMutable(rights);
    if (memberData.targetKind !== "User" || memberData.role !== "MEMBER") throw AppError.badRequest("Only MEMBER project roles can be assigned directly");
    const member = await resolveUser(memberData.targetId);
    await getPrisma().projectMember.upsert({ where: { projectId_userId: { projectId: rights.row.id, userId: member.id } }, create: { projectId: rights.row.id, userId: member.id, role: "MEMBER", status: ACTIVE }, update: { role: "MEMBER", status: ACTIVE, joinedAt: new Date() } });
    return hydrate(rights.row, rights.actor.id);
  }

  async removeMemberFromProject(projectId: string, targetId: string, userId: string) {
    const [rights, target] = await Promise.all([access(projectId, userId), resolveUser(targetId)]);
    assertOwner(rights);
    assertMutable(rights);
    if (rights.row.ownerId === target.id) throw AppError.badRequest("Transfer ownership before removing the owner");
    const changed = await getPrisma().$transaction(async (tx) => {
      const result = await tx.projectMember.updateMany({ where: { projectId: rights.row.id, userId: target.id, status: ACTIVE }, data: { status: "REMOVED" } });
      if (result.count) await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "MEMBER_REMOVED", entityKind: "USER", entityId: publicDatabaseId(target), metadata: { memberName: target.fullName } } });
      return result;
    });
    if (!changed.count) throw AppError.notFound("Active project member not found");
    return hydrate(rights.row, rights.actor.id);
  }

  async leaveProject(projectId: string, userId: string) {
    const rights = await access(projectId, userId);
    assertMember(rights);
    if (rights.isOwner) throw AppError.conflict("Transfer ownership before leaving this project");
    const changed = await getPrisma().$transaction(async (tx) => {
      const result = await tx.projectMember.updateMany({ where: { projectId: rights.row.id, userId: rights.actor.id, status: ACTIVE }, data: { status: "LEFT" } });
      if (result.count) await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "MEMBER_LEFT", entityKind: "USER", entityId: publicDatabaseId(rights.actor), metadata: {} } });
      return result;
    });
    if (!changed.count) throw AppError.conflict("You are no longer an active project member");
  }

  async transferOwnership(projectId: string, targetUserId: string, userId: string) {
    const [rights, target] = await Promise.all([access(projectId, userId), resolveUser(targetUserId)]);
    assertOwner(rights);
    assertMutable(rights);
    if (target.id === rights.actor.id) throw AppError.badRequest("This user already owns the project");
    const targetMembership = await getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId: rights.row.id, userId: target.id } } });
    if (targetMembership?.status !== ACTIVE) throw AppError.badRequest("Ownership can only be transferred to an active member");
    const updated = await getPrisma().$transaction(async (tx) => {
      const next = await tx.project.update({ where: { id: rights.row.id }, data: { ownerId: target.id } });
      await tx.projectMember.update({ where: { projectId_userId: { projectId: rights.row.id, userId: rights.actor.id } }, data: { role: "MEMBER", status: ACTIVE } });
      await tx.projectMember.update({ where: { projectId_userId: { projectId: rights.row.id, userId: target.id } }, data: { role: "OWNER", status: ACTIVE } });
      await tx.projectActivity.create({ data: { projectId: rights.row.id, actorId: rights.actor.id, type: "OWNERSHIP_TRANSFERRED", entityKind: "USER", entityId: publicDatabaseId(target), metadata: { newOwnerName: target.fullName } } });
      return next;
    });
    return hydrate(updated, rights.actor.id);
  }

  async listActivity(projectId: string, userId: string, limit: number) {
    const rights = await access(projectId, userId);
    assertMember(rights);
    return projectActivityService.list(rights.row.id, limit);
  }
}

export const projectService = new ProjectService();
