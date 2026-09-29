import type { ProposeProjectContributionRequest, ResolveProjectContributionRequest } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { canResolveContribution, contributionConfirmationParty, isProjectMember, isProjectOwner } from "./project-contribution.rules.js";

function whereId(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

async function userId(value: string) {
  const user = await getPrisma().user.findUnique({ where: whereId(value), select: { id: true } });
  if (!user) throw AppError.notFound("User not found");
  return user.id;
}

async function projectOrThrow(projectId: string) {
  const project = await getPrisma().project.findUnique({ where: whereId(projectId) });
  if (!project) throw AppError.notFound("Project not found");
  const members = await getPrisma().projectMember.findMany({ where: { projectId: project.id, status: "ACTIVE" } });
  return { ...project, members: members.map((member) => ({ targetId: member.userId, role: member.role.toUpperCase() === "OWNER" ? "owner" as const : "member" as const })) };
}

async function proposalOrThrow(projectId: string, proposalId: string) {
  const proposal = await getPrisma().projectContributionProposal.findUnique({ where: whereId(proposalId) });
  if (!proposal || proposal.projectId !== projectId) throw AppError.notFound("Contribution proposal not found");
  return proposal;
}

async function presentProposal(proposal: Awaited<ReturnType<typeof proposalOrThrow>>) {
  const prisma = getPrisma();
  const actorIds = [proposal.contributorId, proposal.proposedById, proposal.confirmedById, proposal.rejectedById]
    .filter((id): id is string => Boolean(id));
  const [users, history] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true } }),
    prisma.projectContributionHistory.findMany({ where: { proposalId: proposal.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const byId = new Map(users.map((user) => [user.id, { ...user, id: publicDatabaseId(user) }]));
  return {
    ...proposal,
    id: publicDatabaseId(proposal),
    _id: publicDatabaseId(proposal),
    contributorId: byId.get(proposal.contributorId),
    proposedBy: byId.get(proposal.proposedById),
    confirmedBy: proposal.confirmedById ? byId.get(proposal.confirmedById) : undefined,
    rejectedBy: proposal.rejectedById ? byId.get(proposal.rejectedById) : undefined,
    history: history.map((item) => ({ ...item, actorId: byId.get(item.actorId) ?? item.actorId })),
  };
}

async function assertResolver(project: Awaited<ReturnType<typeof projectOrThrow>>, proposal: Awaited<ReturnType<typeof proposalOrThrow>>, actorId: string) {
  if (!isProjectMember(project, actorId)) throw AppError.forbidden("Project membership is required");
  const actorHasAcademicApproval = (await capabilityService.list(actorId)).includes("APPROVE_ACADEMIC_CONTRIBUTION");
  if (!canResolveContribution({
    requiredFrom: proposal.confirmationRequiredFrom as "OWNER" | "CONTRIBUTOR",
    actorId,
    proposerId: proposal.proposedById,
    contributorId: proposal.contributorId,
    actorIsOwner: isProjectOwner(project, actorId),
    actorHasAcademicApproval,
  })) throw AppError.forbidden("This contribution must be resolved by the required counterparty");
}

export const projectContributionService = {
  async list(projectIdInput: string, actorIdInput: string, actorRole?: string) {
    const [project, actorId] = await Promise.all([projectOrThrow(projectIdInput), userId(actorIdInput)]);
    if (!isProjectMember(project, actorId) && actorRole !== "admin") throw AppError.forbidden("Access denied to this project's contributions");
    const proposals = await getPrisma().projectContributionProposal.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
    return Promise.all(proposals.map((proposal) => presentProposal(proposal)));
  },

  async propose(projectIdInput: string, actorIdInput: string, input: ProposeProjectContributionRequest) {
    const [project, actorId, contributorId] = await Promise.all([projectOrThrow(projectIdInput), userId(actorIdInput), userId(input.contributorId)]);
    if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    if (!isProjectMember(project, contributorId)) throw AppError.badRequest("The contributor must be a current project member");
    if (actorId !== contributorId && !isProjectOwner(project, actorId)) throw AppError.forbidden("Only project owners can propose roles for another contributor");
    const confirmationRequiredFrom = contributionConfirmationParty(actorId, contributorId);
    if (confirmationRequiredFrom === "OWNER" && isProjectOwner(project, actorId)) {
      const hasAnotherOwner = project.members.some((member) => member.role === "owner" && String(member.targetId) !== actorId);
      if (!hasAnotherOwner) throw AppError.conflict("An owner cannot self-confirm a contribution; add another owner or ask another owner to propose it");
    }
    const proposal = await getPrisma().$transaction(async (tx) => {
      const active = await tx.projectContributionProposal.findFirst({ where: { projectId: project.id, contributorId, status: { in: ["PENDING_CONFIRMATION", "CONFIRMING"] } } });
      if (active) throw AppError.conflict("This contributor already has a pending contribution proposal");
      const created = await tx.projectContributionProposal.create({ data: {
        projectId: project.id, contributorId, roles: [...new Set(input.roles)], description: input.description,
        evidence: input.evidence, visibility: input.visibility ?? "PUBLIC", status: "PENDING_CONFIRMATION",
        confirmationRequiredFrom, proposedById: actorId,
      } });
      await tx.projectContributionHistory.create({ data: { proposalId: created.id, action: "PROPOSED", actorId, createdAt: new Date() } });
      return created;
    }, { isolationLevel: "Serializable" });
    await auditService.log("project.contribution.proposed", { userId: actorIdInput, targetTableName: "project_contribution_proposals", targetRecordId: proposal.id, details: { projectId: projectIdInput, contributorId: input.contributorId, roles: proposal.roles } });
    return presentProposal(proposal);
  },

  async confirm(projectIdInput: string, proposalIdInput: string, actorIdInput: string, input: ResolveProjectContributionRequest) {
    const [project, actorId] = await Promise.all([projectOrThrow(projectIdInput), userId(actorIdInput)]);
    if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    const proposal = await proposalOrThrow(project.id, proposalIdInput);
    await assertResolver(project, proposal, actorId);
    if (proposal.status !== "PENDING_CONFIRMATION") throw AppError.conflict("Only pending contribution proposals can be confirmed");
    const confirmedAt = new Date();
    const confirmed = await getPrisma().$transaction(async (tx) => {
      const locked = await tx.projectContributionProposal.updateMany({ where: { id: proposal.id, status: "PENDING_CONFIRMATION" }, data: { status: "CONFIRMING" } });
      if (!locked.count) throw AppError.conflict("This contribution proposal is already being resolved");
      for (const role of proposal.roles) {
        const existing = await tx.researchContribution.findFirst({ where: { sourceProjectContributionId: proposal.id, contributionType: role } });
        if (!existing) await tx.researchContribution.create({ data: {
          contributorId: proposal.contributorId, projectId: proposal.projectId, contributionType: role,
          description: proposal.description, evidence: proposal.evidence ?? `Confirmed within project ${projectIdInput}`,
          provenance: "PROJECT_CONFIRMATION", verificationStatus: "VERIFIED_BY_LUMIGAP",
          visibility: proposal.visibility, verifiedById: actorId, verifiedAt: confirmedAt,
          sourceProjectContributionId: proposal.id,
        } });
      }
      const row = await tx.projectContributionProposal.update({ where: { id: proposal.id }, data: { status: "CONFIRMED", confirmedById: actorId, confirmedAt } });
      await tx.projectContributionHistory.create({ data: { proposalId: proposal.id, action: "CONFIRMED", actorId, note: input.note, createdAt: confirmedAt } });
      return row;
    }, { isolationLevel: "Serializable" });
    await auditService.log("project.contribution.confirmed", { userId: actorIdInput, targetTableName: "project_contribution_proposals", targetRecordId: proposalIdInput, details: { projectId: projectIdInput, contributorId: proposal.contributorId, roles: proposal.roles } });
    return presentProposal(confirmed);
  },

  async reject(projectIdInput: string, proposalIdInput: string, actorIdInput: string, input: ResolveProjectContributionRequest) {
    const [project, actorId] = await Promise.all([projectOrThrow(projectIdInput), userId(actorIdInput)]);
    if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    const proposal = await proposalOrThrow(project.id, proposalIdInput);
    await assertResolver(project, proposal, actorId);
    const rejectedAt = new Date();
    const rejected = await getPrisma().$transaction(async (tx) => {
      const changed = await tx.projectContributionProposal.updateMany({
        where: { id: proposal.id, status: "PENDING_CONFIRMATION" },
        data: { status: "REJECTED", rejectedById: actorId, rejectedAt, rejectionReason: input.note },
      });
      if (!changed.count) throw AppError.conflict("Only pending contribution proposals can be rejected");
      await tx.projectContributionHistory.create({ data: { proposalId: proposal.id, action: "REJECTED", actorId, note: input.note, createdAt: rejectedAt } });
      return tx.projectContributionProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    }, { isolationLevel: "Serializable" });
    await auditService.log("project.contribution.rejected", { userId: actorIdInput, targetTableName: "project_contribution_proposals", targetRecordId: proposalIdInput, details: { projectId: projectIdInput, reason: input.note } });
    return presentProposal(rejected);
  },
};
