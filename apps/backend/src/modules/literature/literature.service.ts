import type { AddCorpusPaperRequest, CreateLiteratureCorpusRequest, EvidenceMapBucket } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { ProjectModel } from "../projects/models/project.model.js";
import { canAccessProject } from "../projects/project-scope.js";
import { CorpusPaperModel, LiteratureCorpusModel } from "./literature.model.js";

async function accessibleCorpus(corpusId: string, userId: string) {
  const corpus = await LiteratureCorpusModel.findById(corpusId).lean();
  if (!corpus) throw AppError.notFound("Literature corpus not found");
  if (String(corpus.ownerId) === userId) return corpus;
  if (!corpus.projectId) throw AppError.forbidden("Access denied to this literature corpus");
  const project = await ProjectModel.findById(corpus.projectId).select("ownerId members").lean();
  if (!project || !canAccessProject(project, userId)) throw AppError.forbidden("Access denied to this literature corpus");
  return corpus;
}

function bucket(values: Array<string | number | undefined>): EvidenceMapBucket[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

type EvidenceMapRow = {
  evidence?: { methodology?: string; context?: string; outcome?: string; researchType?: string };
  paperId?: { publicationYear?: number };
};

export const literatureService = {
  async list(userId: string) {
    const projectIds = await ProjectModel.find({ $or: [{ ownerId: userId }, { "members.targetId": userId }] }).distinct("_id");
    const corpora = await LiteratureCorpusModel.find({ $or: [{ ownerId: userId }, { projectId: { $in: projectIds } }] }).sort({ updatedAt: -1 }).lean();
    const counts = await CorpusPaperModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { corpusId: { $in: corpora.map((corpus) => corpus._id) } } },
      { $group: { _id: "$corpusId", count: { $sum: 1 } } },
    ]);
    const countByCorpus = new Map(counts.map((item) => [String(item._id), item.count]));
    return corpora.map((corpus) => ({ ...corpus, paperCount: countByCorpus.get(String(corpus._id)) ?? 0 }));
  },

  async create(userId: string, input: CreateLiteratureCorpusRequest) {
    if (input.projectId) {
      const project = await ProjectModel.findById(input.projectId).select("ownerId members").lean();
      if (!project) throw AppError.notFound("Project not found");
      if (!canAccessProject(project, userId)) throw AppError.forbidden("Project membership is required");
    }
    const corpus = await LiteratureCorpusModel.create({ ownerId: userId, ...input });
    await auditService.log("literature.corpus.created", { userId, targetTableName: "literature_corpora", targetRecordId: corpus.id, details: { projectId: input.projectId, topic: input.topic } });
    return corpus;
  },

  async detail(corpusId: string, userId: string) {
    const corpus = await accessibleCorpus(corpusId, userId);
    const papers = await CorpusPaperModel.find({ corpusId })
      .populate("paperId", "title publicationYear journalName doi externalIds")
      .sort({ createdAt: -1 })
      .lean();
    return { corpus, papers };
  },

  async addPaper(corpusId: string, userId: string, input: AddCorpusPaperRequest) {
    await accessibleCorpus(corpusId, userId);
    if (!await PaperModel.exists({ _id: input.paperId, dataStatus: "active" })) throw AppError.notFound("Paper not found in the LumiGap corpus");
    try {
      const record = await CorpusPaperModel.create({ corpusId, addedBy: userId, ...input });
      await LiteratureCorpusModel.updateOne({ _id: corpusId }, { $set: { status: "ACTIVE" } });
      await auditService.log("literature.paper.added", { userId, targetTableName: "corpus_papers", targetRecordId: record.id, details: { corpusId, paperId: input.paperId, included: input.included } });
      return record;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw AppError.conflict("This paper is already in the literature corpus");
      throw error;
    }
  },

  async removePaper(corpusId: string, paperId: string, userId: string) {
    await accessibleCorpus(corpusId, userId);
    const result = await CorpusPaperModel.deleteOne({ corpusId, paperId });
    if (result.deletedCount === 0) throw AppError.notFound("Corpus paper not found");
    await auditService.log("literature.paper.removed", { userId, targetTableName: "corpus_papers", targetRecordId: paperId, details: { corpusId } });
  },

  async evidenceMap(corpusId: string, userId: string) {
    await accessibleCorpus(corpusId, userId);
    const rows = await CorpusPaperModel.find({ corpusId, included: true })
      .select("evidence paperId")
      .populate("paperId", "publicationYear")
      .lean() as unknown as EvidenceMapRow[];
    return {
      corpusId,
      includedPaperCount: rows.length,
      dimensions: {
        methodology: bucket(rows.map((row) => row.evidence?.methodology)),
        context: bucket(rows.map((row) => row.evidence?.context)),
        outcome: bucket(rows.map((row) => row.evidence?.outcome)),
        researchType: bucket(rows.map((row) => row.evidence?.researchType)),
        year: bucket(rows.map((row) => row.paperId?.publicationYear)),
      },
    };
  },
};
