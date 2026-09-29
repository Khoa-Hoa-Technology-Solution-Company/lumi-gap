import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { notificationService } from "../notifications/notification.service.js";
import {
  canAcceptMentorRelationship,
  canEndMentorRelationship,
  canViewMentorRelationship,
  type MentorRelationshipStatus,
} from "./project-mentorship.rules.js";

type MentorRelationshipDto = {
  id: string;
  projectId: string;
  mentorUser: { _id: string; fullName?: string; email?: string; avatarUrl?: string };
  requestedBy: { _id: string; fullName?: string; email?: string; avatarUrl?: string };
  status: MentorRelationshipStatus;
  message?: string;
  responseNote?: string;
  acceptedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectAccess = {
  id: string;
  title: string;
  status: string;
  ownerId: string;
};

function whereId(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

async function resolveUser(input: string) {
  const user = await getPrisma().user.findUnique({
    where: whereId(input),
    select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true, isActive: true },
  });
  if (!user || !user.isActive) throw AppError.notFound("User not found");
  return user;
}

async function projectOrThrow(projectInput: string): Promise<ProjectAccess> {
  const project = await getPrisma().project.findUnique({
    where: whereId(projectInput),
    select: { id: true, title: true, status: true, ownerId: true },
  });
  if (!project) throw AppError.notFound("Project not found");
  return project;
}

async function isActiveProjectMember(projectId: string, userId: string) {
  if ((await getPrisma().project.findUnique({ where: { id: projectId }, select: { ownerId: true } }))?.ownerId === userId) return true;
  const member = await getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { status: true } });
  return member?.status === "ACTIVE";
}

async function assertRequesterProjectAccess(project: ProjectAccess, actorId: string) {
  if (!(await isActiveProjectMember(project.id, actorId))) {
    throw AppError.forbidden("Active project membership is required to request mentorship");
  }
  if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
}

async function relationshipOrThrow(projectId: string, relationshipInput: string) {
  const relationship = await getPrisma().mentorRelationship.findFirst({ where: whereId(relationshipInput) });
  if (!relationship || relationship.projectId !== projectId) throw AppError.notFound("Mentor relationship not found");
  return relationship;
}

async function present(row: Awaited<ReturnType<typeof relationshipOrThrow>>): Promise<MentorRelationshipDto> {
  const users = await getPrisma().user.findMany({
    where: { id: { in: [row.mentorUserId, row.requestedBy] } },
    select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((user) => [user.id, {
    _id: publicDatabaseId(user),
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl ?? undefined,
  }]));
  return {
    id: publicDatabaseId(row),
    projectId: row.projectId,
    mentorUser: userMap.get(row.mentorUserId) ?? { _id: row.mentorUserId },
    requestedBy: userMap.get(row.requestedBy) ?? { _id: row.requestedBy },
    status: row.status as MentorRelationshipDto["status"],
    message: row.message ?? undefined,
    responseNote: row.responseNote ?? undefined,
    acceptedAt: row.acceptedAt?.toISOString(),
    endedAt: row.endedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const projectMentorshipService = {
  async list(projectInput: string, actorInput: string) {
    const [project, actor] = await Promise.all([projectOrThrow(projectInput), resolveUser(actorInput)]);
    const rows = await getPrisma().mentorRelationship.findMany({
      where: { projectId: project.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    const actorHasProjectAccess = await isActiveProjectMember(project.id, actor.id);
    const actorCanView = actorHasProjectAccess
      || rows.some((row) => canViewMentorRelationship({
        actorId: actor.id,
        mentorUserId: row.mentorUserId,
        requestedBy: row.requestedBy,
        actorHasProjectAccess,
      }));
    if (!actorCanView) throw AppError.forbidden("Access denied to this project's mentorships");
    return Promise.all(rows.map((row) => present(row)));
  },

  async request(projectInput: string, actorInput: string, input: { mentorUserId: string; message?: string }) {
    const [project, actor, mentor] = await Promise.all([
      projectOrThrow(projectInput),
      resolveUser(actorInput),
      resolveUser(input.mentorUserId),
    ]);
    await assertRequesterProjectAccess(project, actor.id);
    if (mentor.id === actor.id) throw AppError.conflict("You cannot request yourself as mentor");
    const active = await getPrisma().mentorRelationship.findFirst({
      where: { projectId: project.id, mentorUserId: mentor.id, status: { in: ["PENDING", "ACCEPTED"] } },
    });
    if (active) throw AppError.conflict("This mentor already has an active relationship with the project");
    const relationship = await getPrisma().mentorRelationship.create({
      data: {
        projectId: project.id,
        mentorUserId: mentor.id,
        requestedBy: actor.id,
        message: input.message?.trim() || undefined,
      },
    });
    await Promise.all([
      auditService.log("project.mentorship.requested", {
        userId: actor.id,
        targetTableName: "mentor_relationships",
        targetRecordId: relationship.id,
        details: { projectId: project.id, mentorUserId: mentor.id },
      }),
      notificationService.create({
        userId: mentor.id,
        title: "New mentorship request",
        message: `${actor.fullName} requested your mentorship for “${project.title}”.`,
        type: "PROJECT_MENTORSHIP_REQUESTED",
        targetKind: "project",
        targetId: project.id,
      }),
    ]);
    return present(relationship);
  },

  async accept(projectInput: string, relationshipInput: string, actorInput: string, note?: string) {
    const [project, actor] = await Promise.all([projectOrThrow(projectInput), resolveUser(actorInput)]);
    if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    const relationship = await relationshipOrThrow(project.id, relationshipInput);
    if (relationship.mentorUserId !== actor.id) throw AppError.forbidden("Only the requested mentor can accept this relationship");
    if (relationship.status !== "PENDING") throw AppError.conflict("Only pending mentorship requests can be accepted");
    if (!canAcceptMentorRelationship({
      actorId: actor.id,
      mentorUserId: relationship.mentorUserId,
      status: relationship.status as MentorRelationshipStatus,
      hasMentorCapability: (await capabilityService.list(actor.id)).includes("MENTOR_PROJECT"),
    })) {
      throw AppError.forbidden("Verified internal Lecturer status is required to mentor projects");
    }
    const acceptedAt = new Date();
    const updated = await getPrisma().mentorRelationship.update({
      where: { id: relationship.id },
      data: { status: "ACCEPTED", acceptedAt, responseNote: note?.trim() || undefined },
    });
    await Promise.all([
      auditService.log("project.mentorship.accepted", {
        userId: actor.id,
        targetTableName: "mentor_relationships",
        targetRecordId: relationship.id,
        details: { projectId: project.id },
      }),
      notificationService.create({
        userId: relationship.requestedBy,
        title: "Mentorship request accepted",
        message: `${actor.fullName} accepted mentorship for “${project.title}”.`,
        type: "PROJECT_MENTORSHIP_ACCEPTED",
        targetKind: "project",
        targetId: project.id,
      }),
    ]);
    return present(updated);
  },

  async decline(projectInput: string, relationshipInput: string, actorInput: string, note?: string) {
    const [project, actor] = await Promise.all([projectOrThrow(projectInput), resolveUser(actorInput)]);
    const relationship = await relationshipOrThrow(project.id, relationshipInput);
    if (relationship.mentorUserId !== actor.id) throw AppError.forbidden("Only the requested mentor can decline this relationship");
    if (relationship.status !== "PENDING") throw AppError.conflict("Only pending mentorship requests can be declined");
    const updated = await getPrisma().mentorRelationship.update({
      where: { id: relationship.id },
      data: { status: "DECLINED", responseNote: note?.trim() || undefined },
    });
    await auditService.log("project.mentorship.declined", {
      userId: actor.id,
      targetTableName: "mentor_relationships",
      targetRecordId: relationship.id,
      details: { projectId: project.id },
    });
    return present(updated);
  },

  async end(projectInput: string, relationshipInput: string, actorInput: string, note?: string) {
    const [project, actor] = await Promise.all([projectOrThrow(projectInput), resolveUser(actorInput)]);
    const relationship = await relationshipOrThrow(project.id, relationshipInput);
    if (!canEndMentorRelationship({
      actorId: actor.id,
      mentorUserId: relationship.mentorUserId,
      requestedBy: relationship.requestedBy,
      projectOwnerId: project.ownerId,
      status: relationship.status as MentorRelationshipStatus,
    })) {
      if (relationship.status !== "ACCEPTED") throw AppError.conflict("Only accepted mentorships can be ended");
      throw AppError.forbidden("Only the mentor, requester, or project owner can end mentorship");
    }
    const endedAt = new Date();
    const updated = await getPrisma().mentorRelationship.update({
      where: { id: relationship.id },
      data: { status: "ENDED", endedAt, responseNote: note?.trim() || relationship.responseNote },
    });
    await auditService.log("project.mentorship.ended", {
      userId: actor.id,
      targetTableName: "mentor_relationships",
      targetRecordId: relationship.id,
      details: { projectId: project.id },
    });
    return present(updated);
  },
};
