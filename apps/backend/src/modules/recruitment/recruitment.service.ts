import type { UserRole } from "@trend/shared-types";
import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { ProjectModel } from "../projects/models/project.model.js";
import { RecruitmentApplicationModel, RecruitmentOpeningModel } from "./recruitment.model.js";

async function assertProjectOwner(projectId: string, actorId: string, actorRole?: UserRole) {
  const project = await ProjectModel.findById(projectId).select("ownerId members").lean();
  if (!project) throw AppError.notFound("Project not found");
  const ownsProject = project.ownerId.toString() === actorId || project.members.some(
    (member) => member.targetId.toString() === actorId && member.role === "owner",
  );
  if (!ownsProject && actorRole !== "admin" && actorRole !== "moderator") {
    throw AppError.forbidden("Project owner access is required");
  }
  return project;
}

export const recruitmentService = {
  async createOpening(
    input: {
      projectId: string;
      title: string;
      description: string;
      requirements?: string[];
      capacity?: number;
      closesAt?: Date;
    },
    actorId: string,
    actorRole: UserRole,
  ) {
    await assertProjectOwner(input.projectId, actorId, actorRole);
    const opening = await RecruitmentOpeningModel.create({ ...input, createdBy: actorId });
    await auditService.log("recruitment.opening.created", {
      userId: actorId,
      targetTableName: "recruitment_openings",
      targetRecordId: opening.id,
      details: { projectId: input.projectId },
    });
    return opening;
  },

  async listOpenings(page: number, pageSize: number, projectId?: string) {
    const now = new Date();
    const filter = {
      ...(projectId ? { projectId } : {}),
      status: "open",
      $or: [{ closesAt: { $exists: false } }, { closesAt: { $gt: now } }],
    };
    const [data, total] = await Promise.all([
      RecruitmentOpeningModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate("projectId", "title description")
        .lean(),
      RecruitmentOpeningModel.countDocuments(filter),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async updateOpening(
    openingId: string,
    input: { title?: string; description?: string; requirements?: string[]; capacity?: number; status?: "open" | "closed" | "archived"; closesAt?: Date | null },
    actorId: string,
    actorRole: UserRole,
  ) {
    const opening = await RecruitmentOpeningModel.findById(openingId);
    if (!opening) throw AppError.notFound("Recruitment opening not found");
    await assertProjectOwner(opening.projectId.toString(), actorId, actorRole);
    opening.set(input);
    await opening.save();
    return opening;
  },

  async apply(openingId: string, input: { coverLetter: string; skills?: string[] }, applicantId: string) {
    const opening = await RecruitmentOpeningModel.findById(openingId).lean();
    if (!opening) throw AppError.notFound("Recruitment opening not found");
    if (opening.status !== "open" || (opening.closesAt && opening.closesAt <= new Date())) {
      throw AppError.conflict("This recruitment opening is closed");
    }
    try {
      return await RecruitmentApplicationModel.create({
        ...input,
        openingId,
        projectId: opening.projectId,
        applicantId,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw AppError.conflict("You have already applied to this opening");
      throw error;
    }
  },

  async listApplications(openingId: string, actorId: string, actorRole: UserRole) {
    const opening = await RecruitmentOpeningModel.findById(openingId).lean();
    if (!opening) throw AppError.notFound("Recruitment opening not found");
    await assertProjectOwner(opening.projectId.toString(), actorId, actorRole);
    return RecruitmentApplicationModel.find({ openingId })
      .sort({ createdAt: -1 })
      .populate("applicantId", "fullName email avatarUrl institution researchInterests")
      .lean();
  },

  async decideApplication(
    openingId: string,
    applicationId: string,
    status: "shortlisted" | "accepted" | "rejected",
    actorId: string,
    actorRole: UserRole,
  ) {
    const opening = await RecruitmentOpeningModel.findById(openingId).lean();
    if (!opening) throw AppError.notFound("Recruitment opening not found");
    await assertProjectOwner(opening.projectId.toString(), actorId, actorRole);
    const application = await RecruitmentApplicationModel.findOne({ _id: applicationId, openingId });
    if (!application) throw AppError.notFound("Recruitment application not found");
    if (["accepted", "rejected", "withdrawn"].includes(application.status) && application.status !== status) {
      throw AppError.conflict("This application already has a final decision");
    }
    if (application.status === status) return application;

    if (status === "accepted") {
      const reserved = await RecruitmentOpeningModel.findOneAndUpdate(
        {
          _id: opening._id,
          status: "open",
          $expr: { $lt: [{ $ifNull: ["$acceptedCount", 0] }, "$capacity"] },
        },
        { $inc: { acceptedCount: 1 } },
        { new: true },
      );
      if (!reserved) throw AppError.conflict("This opening has reached capacity or is closed");
      let memberAdded = false;
      try {
        const memberResult = await ProjectModel.updateOne(
          { _id: opening.projectId, "members.targetId": { $ne: application.applicantId } },
          { $push: { members: { targetKind: "User", targetId: application.applicantId, role: "member" } } },
        );
        memberAdded = memberResult.modifiedCount > 0;
        application.status = status;
        application.decidedBy = new mongoose.Types.ObjectId(actorId);
        application.decidedAt = new Date();
        await application.save();
      } catch (error) {
        await RecruitmentOpeningModel.updateOne({ _id: opening._id, acceptedCount: { $gt: 0 } }, { $inc: { acceptedCount: -1 } });
        if (memberAdded) {
          await ProjectModel.updateOne(
            { _id: opening.projectId },
            { $pull: { members: { targetId: application.applicantId } } },
          );
        }
        throw error;
      }
    } else {
      application.status = status;
      application.decidedBy = new mongoose.Types.ObjectId(actorId);
      application.decidedAt = new Date();
      await application.save();
    }
    await auditService.log("recruitment.application.decided", {
      userId: actorId,
      targetTableName: "recruitment_applications",
      targetRecordId: application.id,
      details: { status, projectId: opening.projectId.toString() },
    });
    return application;
  },

  async withdraw(openingId: string, applicationId: string, applicantId: string) {
    const application = await RecruitmentApplicationModel.findOne({
      _id: applicationId,
      openingId,
      applicantId,
    });
    if (!application) throw AppError.notFound("Recruitment application not found");
    if (application.status === "accepted") throw AppError.conflict("An accepted application cannot be withdrawn");
    application.status = "withdrawn";
    await application.save();
    return application;
  },
};
