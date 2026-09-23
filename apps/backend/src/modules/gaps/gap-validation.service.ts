import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { AcademicProfileModel } from "../academic-profiles/academic-profile.model.js";
import { UserModel } from "../auth/models/user.model.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { GapEvidenceRecordModel, GapValidationModel } from "./models/gap-validation.model.js";
import { ResearchGapModel } from "./models/research-gap.model.js";
import { LiteratureCorpusModel } from "../literature/literature.model.js";
import { ProjectModel } from "../projects/models/project.model.js";
import { canAccessProject } from "../projects/project-scope.js";

type GapCandidateInput = {
  topic: string;
  projectId?: string;
  corpusId?: string;
  title: string;
  gapType: string;
  scope?: string;
  establishedKnowledge: string;
  observedLimitation: string;
  missingEvidence: string;
  significanceExplanation: string;
  suggestedResearchQuestion?: string;
  gapConfidence: "LOW" | "MODERATE" | "HIGH";
  researchPriority: "LOW" | "MODERATE" | "HIGH";
};

async function ownedGap(gapId: string, userId: string) {
  const gap = await ResearchGapModel.findOne({ _id: gapId, userId });
  if (!gap) throw AppError.notFound("Research gap candidate not found");
  return gap;
}

async function assertExpert(userId: string) {
  const [user, profile] = await Promise.all([
    UserModel.findById(userId).select("role academicProfileType isActive").lean(),
    AcademicProfileModel.findOne({ userId }).select("expertiseAreas verificationStatus").lean(),
  ]);
  const academicType = user?.academicProfileType ?? (user?.role === "lecturer" || user?.role === "researcher" ? user.role : undefined);
  if (!user || user.isActive === false || (academicType !== "lecturer" && academicType !== "researcher")) {
    throw AppError.forbidden("Only lecturers and researchers can validate research gaps");
  }
  return profile;
}

export const gapValidationService = {
  async createCandidate(userId: string, input: GapCandidateInput) {
    if (input.projectId) {
      const project = await ProjectModel.findById(input.projectId).select("ownerId members").lean();
      if (!project) throw AppError.notFound("Project not found");
      if (!canAccessProject(project, userId)) throw AppError.forbidden("Project membership is required");
    }
    if (input.corpusId) {
      const corpus = await LiteratureCorpusModel.findById(input.corpusId).select("ownerId projectId topic").lean();
      if (!corpus) throw AppError.notFound("Literature corpus not found");
      if (String(corpus.ownerId) !== userId) {
        if (!corpus.projectId) throw AppError.forbidden("Access denied to this literature corpus");
        const corpusProject = await ProjectModel.findById(corpus.projectId).select("ownerId members").lean();
        if (!corpusProject || !canAccessProject(corpusProject, userId)) throw AppError.forbidden("Access denied to this literature corpus");
      }
      if (input.projectId && String(corpus.projectId ?? "") !== input.projectId) {
        throw AppError.badRequest("The literature corpus does not belong to the selected project");
      }
    }
    const numericConfidence = { LOW: 0.3, MODERATE: 0.6, HIGH: 0.85 }[input.gapConfidence];
    const gap = await ResearchGapModel.create({
      topic: input.topic,
      normalizedTopic: input.topic.trim().toLocaleLowerCase(),
      title: input.title,
      description: input.observedLimitation,
      rationale: input.significanceExplanation,
      userId,
      projectId: input.projectId,
      corpusId: input.corpusId,
      source: "standalone",
      origin: "HUMAN",
      gapType: input.gapType,
      scope: input.scope,
      establishedKnowledge: input.establishedKnowledge,
      observedLimitation: input.observedLimitation,
      missingEvidence: input.missingEvidence,
      significanceExplanation: input.significanceExplanation,
      suggestedResearchQuestion: input.suggestedResearchQuestion,
      validationStatus: "CANDIDATE",
      gapConfidence: input.gapConfidence,
      researchPriority: input.researchPriority,
      confidence: numericConfidence,
    });
    await auditService.log("research_gap.candidate.created", { userId, targetTableName: "research_gaps", targetRecordId: gap.id, details: { gapType: input.gapType, origin: "HUMAN" } });
    return gap;
  },

  async requestValidation(gapId: string, userId: string) {
    const gap = await ResearchGapModel.findOneAndUpdate(
      { _id: gapId, userId, validationStatus: { $in: ["DRAFT", "CANDIDATE", "REFINED"] } },
      { $set: { validationStatus: "UNDER_VALIDATION" } },
      { new: true },
    );
    if (!gap) throw AppError.conflict("This gap cannot be submitted for validation");
    await auditService.log("research_gap.validation.requested", { userId, targetTableName: "research_gaps", targetRecordId: gap.id });
    return gap;
  },

  async addEvidence(gapId: string, userId: string, input: { paperId: string; evidenceKind: "SUPPORTING" | "COUNTER"; evidenceType?: string; excerpt?: string; explanation: string }) {
    const gap = await ownedGap(gapId, userId);
    if (!await PaperModel.exists({ _id: input.paperId })) throw AppError.badRequest("Evidence paper does not exist in the LumiGap corpus");
    let evidence;
    try {
      evidence = await GapEvidenceRecordModel.create({ gapId, addedBy: userId, ...input });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw AppError.conflict("This paper is already linked with the same evidence kind");
      throw error;
    }
    if (input.evidenceKind === "SUPPORTING") {
      await ResearchGapModel.updateOne({ _id: gap._id }, { $addToSet: { supportingPaperIds: input.paperId, evidencePaperIds: input.paperId } });
    } else {
      await ResearchGapModel.updateOne({ _id: gap._id }, { $addToSet: { evidencePaperIds: input.paperId } });
    }
    await auditService.log("research_gap.evidence.added", { userId, targetTableName: "gap_evidence_records", targetRecordId: evidence.id, details: { gapId, evidenceKind: input.evidenceKind, paperId: input.paperId } });
    return evidence;
  },

  async getEvidence(gapId: string, userId: string) {
    const gap = await ResearchGapModel.findOne({ _id: gapId, $or: [{ userId }, { validationStatus: { $in: ["UNDER_VALIDATION", "REFINED", "VALIDATED"] } }] }).lean();
    if (!gap) throw AppError.notFound("Research gap candidate not found");
    return GapEvidenceRecordModel.find({ gapId })
      .populate("paperId", "title publicationYear journalName externalIds doi")
      .sort({ evidenceKind: 1, createdAt: 1 })
      .lean();
  },

  async addValidation(gapId: string, reviewerId: string, input: { action: "VALIDATE" | "CHALLENGE" | "REQUEST_EVIDENCE" | "SUGGEST_EVIDENCE" | "REFINE_SCOPE" | "REJECT"; comment: string; suggestedChanges?: string }) {
    await assertExpert(reviewerId);
    const gap = await ResearchGapModel.findById(gapId);
    if (!gap) throw AppError.notFound("Research gap candidate not found");
    if (gap.userId.toString() === reviewerId) throw AppError.conflict("Owners cannot expert-validate their own research gap");
    if (!["UNDER_VALIDATION", "REFINED"].includes(gap.validationStatus)) throw AppError.conflict("This gap is not open for expert validation");
    const validation = await GapValidationModel.create({ gapId, reviewerId, ...input });
    const status = input.action === "VALIDATE" ? "VALIDATED"
      : input.action === "REJECT" ? "REJECTED"
        : input.action === "REFINE_SCOPE" ? "REFINED" : "UNDER_VALIDATION";
    await ResearchGapModel.updateOne({ _id: gapId }, { $set: { validationStatus: status } });
    await auditService.log("research_gap.validation.recorded", { userId: reviewerId, targetTableName: "gap_validations", targetRecordId: validation.id, details: { gapId, action: input.action } });
    return validation;
  },

  async getValidations(gapId: string, userId: string) {
    const gap = await ResearchGapModel.findOne({ _id: gapId, $or: [{ userId }, { validationStatus: { $in: ["UNDER_VALIDATION", "REFINED", "VALIDATED", "REJECTED"] } }] }).lean();
    if (!gap) throw AppError.notFound("Research gap candidate not found");
    return GapValidationModel.find({ gapId })
      .populate("reviewerId", "fullName avatarUrl institution academicProfileType")
      .sort({ createdAt: 1 })
      .lean();
  },
};
