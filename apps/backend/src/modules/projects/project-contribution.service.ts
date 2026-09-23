import type {
  ProposeProjectContributionRequest,
  ResolveProjectContributionRequest,
} from "@trend/shared-types";
import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { ContributionModel } from "../reviews/review.model.js";
import { ProjectContributionProposalModel } from "./models/project-contribution.model.js";
import { ProjectModel } from "./models/project.model.js";
import {
  canResolveContribution,
  contributionConfirmationParty,
  isProjectMember,
  isProjectOwner,
} from "./project-contribution.rules.js";

const actorFields = "fullName email avatarUrl";

async function projectOrThrow(projectId: string) {
  const project = await ProjectModel.findById(projectId).select("ownerId members").lean();
  if (!project) throw AppError.notFound("Project not found");
  return project;
}

async function proposalOrThrow(projectId: string, proposalId: string) {
  const proposal = await ProjectContributionProposalModel.findOne({ _id: proposalId, projectId }).lean();
  if (!proposal) throw AppError.notFound("Contribution proposal not found");
  return proposal;
}

function assertResolver(
  project: Awaited<ReturnType<typeof projectOrThrow>>,
  proposal: Awaited<ReturnType<typeof proposalOrThrow>>,
  actorId: string,
) {
  if (!isProjectMember(project, actorId)) throw AppError.forbidden("Project membership is required");
  if (!canResolveContribution({
    requiredFrom: proposal.confirmationRequiredFrom,
    actorId,
    proposerId: String(proposal.proposedBy),
    contributorId: String(proposal.contributorId),
    actorIsOwner: isProjectOwner(project, actorId),
  })) {
    throw AppError.forbidden("This contribution must be resolved by the required counterparty");
  }
}

export const projectContributionService = {
  async list(projectId: string, actorId: string, actorRole?: string) {
    const project = await projectOrThrow(projectId);
    if (!isProjectMember(project, actorId) && actorRole !== "admin") {
      throw AppError.forbidden("Access denied to this project's contributions");
    }
    return ProjectContributionProposalModel.find({ projectId })
      .populate("contributorId", actorFields)
      .populate("proposedBy", actorFields)
      .populate("confirmedBy", actorFields)
      .populate("rejectedBy", actorFields)
      .populate("history.actorId", actorFields)
      .sort({ createdAt: -1 })
      .lean();
  },

  async propose(projectId: string, actorId: string, input: ProposeProjectContributionRequest) {
    const project = await projectOrThrow(projectId);
    if (!isProjectMember(project, input.contributorId)) {
      throw AppError.badRequest("The contributor must be a current project member");
    }
    if (actorId !== input.contributorId && !isProjectOwner(project, actorId)) {
      throw AppError.forbidden("Only project owners can propose roles for another contributor");
    }
    const confirmationRequiredFrom = contributionConfirmationParty(actorId, input.contributorId);
    if (confirmationRequiredFrom === "OWNER" && isProjectOwner(project, actorId)) {
      const hasAnotherOwner = project.members.some((member) => member.role === "owner" && String(member.targetId) !== actorId);
      if (!hasAnotherOwner) {
        throw AppError.conflict("An owner cannot self-confirm a contribution; add another owner or ask another owner to propose it");
      }
    }
    const proposal = await ProjectContributionProposalModel.create({
      projectId,
      contributorId: input.contributorId,
      roles: [...new Set(input.roles)],
      description: input.description,
      evidence: input.evidence,
      visibility: input.visibility ?? "PUBLIC",
      status: "PENDING_CONFIRMATION",
      confirmationRequiredFrom,
      proposedBy: actorId,
      history: [{ action: "PROPOSED", actorId, createdAt: new Date() }],
    });
    await auditService.log("project.contribution.proposed", {
      userId: actorId,
      targetTableName: "project_contribution_proposals",
      targetRecordId: proposal.id,
      details: { projectId, contributorId: input.contributorId, roles: proposal.roles },
    });
    return proposal.toObject();
  },

  async confirm(projectId: string, proposalId: string, actorId: string, input: ResolveProjectContributionRequest) {
    const [project, proposal] = await Promise.all([
      projectOrThrow(projectId),
      proposalOrThrow(projectId, proposalId),
    ]);
    assertResolver(project, proposal, actorId);
    if (proposal.status !== "PENDING_CONFIRMATION") {
      throw AppError.conflict("Only pending contribution proposals can be confirmed");
    }
    const locked = await ProjectContributionProposalModel.findOneAndUpdate(
      { _id: proposalId, projectId, status: "PENDING_CONFIRMATION" },
      { $set: { status: "CONFIRMING" } },
      { new: true },
    );
    if (!locked) throw AppError.conflict("This contribution proposal is already being resolved");
    const confirmedAt = new Date();
    try {
      await ContributionModel.bulkWrite(locked.roles.map((role) => ({
        updateOne: {
          filter: { sourceProjectContributionId: locked._id, contributionType: role },
          update: { $setOnInsert: {
            contributorId: locked.contributorId,
            projectId: locked.projectId,
            contributionType: role,
            description: locked.description,
            evidence: locked.evidence || `Confirmed within project ${projectId}`,
            provenance: "PROJECT_CONFIRMATION",
            verificationStatus: "VERIFIED_BY_LUMIGAP",
            visibility: locked.visibility,
            verifiedBy: new mongoose.Types.ObjectId(actorId),
            verifiedAt: confirmedAt,
            sourceProjectContributionId: locked._id,
          } },
          upsert: true,
        },
      })));
      const confirmed = await ProjectContributionProposalModel.findOneAndUpdate(
        { _id: locked._id, status: "CONFIRMING" },
        {
          $set: { status: "CONFIRMED", confirmedBy: actorId, confirmedAt },
          $push: { history: { action: "CONFIRMED", actorId, note: input.note, createdAt: confirmedAt } },
        },
        { new: true },
      ).populate("contributorId", actorFields).populate("proposedBy", actorFields).populate("confirmedBy", actorFields);
      await auditService.log("project.contribution.confirmed", {
        userId: actorId,
        targetTableName: "project_contribution_proposals",
        targetRecordId: proposalId,
        details: { projectId, contributorId: String(proposal.contributorId), roles: proposal.roles },
      });
      return confirmed;
    } catch (error) {
      await ProjectContributionProposalModel.updateOne(
        { _id: locked._id, status: "CONFIRMING" },
        { $set: { status: "PENDING_CONFIRMATION" } },
      );
      throw error;
    }
  },

  async reject(projectId: string, proposalId: string, actorId: string, input: ResolveProjectContributionRequest) {
    const [project, proposal] = await Promise.all([
      projectOrThrow(projectId),
      proposalOrThrow(projectId, proposalId),
    ]);
    assertResolver(project, proposal, actorId);
    const rejectedAt = new Date();
    const rejected = await ProjectContributionProposalModel.findOneAndUpdate(
      { _id: proposalId, projectId, status: "PENDING_CONFIRMATION" },
      {
        $set: { status: "REJECTED", rejectedBy: actorId, rejectedAt, rejectionReason: input.note },
        $push: { history: { action: "REJECTED", actorId, note: input.note, createdAt: rejectedAt } },
      },
      { new: true },
    ).populate("contributorId", actorFields).populate("proposedBy", actorFields).populate("rejectedBy", actorFields);
    if (!rejected) throw AppError.conflict("Only pending contribution proposals can be rejected");
    await auditService.log("project.contribution.rejected", {
      userId: actorId,
      targetTableName: "project_contribution_proposals",
      targetRecordId: proposalId,
      details: { projectId, reason: input.note },
    });
    return rejected;
  },
};
