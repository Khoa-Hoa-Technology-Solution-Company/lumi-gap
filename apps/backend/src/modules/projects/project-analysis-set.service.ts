import { randomUUID } from "node:crypto";
import type { ProjectAnalysisSet } from "@trend/shared-types";
import type { z } from "zod";
import { AppError } from "../../common/exceptions/app-error.js";
import { sourceFingerprint } from "../knowledge/knowledge.text.js";
import { jsonSnapshot, withWorkspace, type WorkspaceContext } from "./workspace-access.js";
import { screeningCommand, screeningHash, screeningSettings, roundSettings } from "./screening-context.js";
import { analysisSetSchema } from "./dto/screening.schema.js";

export async function readAnalysisSet(c: WorkspaceContext, id: string): Promise<ProjectAnalysisSet> {
  const revision = await c.tx.projectWorkspaceRevision.findFirst({ where: { projectId: c.project.id, entityKind: "ANALYSIS_SET", entityId: id, version: 1 } });
  if (!revision) throw AppError.notFound("Không tìm thấy bộ bài phân tích trong dự án");
  return revision.snapshot as unknown as ProjectAnalysisSet;
}

/** Check current membership/source scope, but never rewrite the historical snapshot. */
export async function validateAnalysisSet(c: WorkspaceContext, id: string, paperIds: string[]) {
  const set = await readAnalysisSet(c, id);
  if (JSON.stringify([...paperIds].sort()) !== JSON.stringify(set.sources.map(s => s.id).sort())) throw AppError.conflict("Danh sách bài phải khớp chính xác với bộ phân tích đã lưu");
  const links = await c.tx.projectPaper.findMany({ where: { projectId: c.project.id, paperId: { in: paperIds } } });
  const papers = await c.tx.paper.findMany({ where: { id: { in: paperIds }, dataStatus: "active" } });
  for (const source of set.sources) {
    const link = links.find(l => l.paperId === source.id), paper = papers.find(p => p.id === source.id);
    if (!link || !paper || link.id !== source.projectPaperId || link.updatedAt.toISOString() !== source.updatedAt || sourceFingerprint(paper) !== source.fingerprint) throw AppError.conflict("Nguồn của bộ bài đã thay đổi. Tạo bộ phân tích mới từ thư viện hiện tại");
    if (set.mode === "OFFICIAL") {
      const round = await c.tx.screeningRound.findFirst({ where: { projectId: c.project.id, paperId: source.id, active: true, status: "INCLUDED" } });
      const final = round ? await c.tx.screeningFinalDecision.findFirst({ where: { roundId: round.id }, orderBy: { roundVersion: "desc" } }) : null;
      if (link.screeningStatus !== "INCLUDED" || !round || !final || final.id !== source.finalDecisionId || round.version !== source.roundVersion) throw AppError.conflict("Quyết định chọn bài đã thay đổi. Xác nhận bộ chính thức mới");
    }
  }
  return set;
}

export const projectAnalysisSetService = {
  async create(project: string, actor: string, raw: z.infer<typeof analysisSetSchema>) {
    const input = analysisSetSchema.parse(raw);
    return screeningCommand(project, actor, "ANALYSIS_SET_CREATED", input, { owner: input.mode === "OFFICIAL" }, async c => {
      const sources: ProjectAnalysisSet["sources"] = [];
      const links = await c.tx.projectPaper.findMany({ where: { projectId: c.project.id, paperId: { in: input.paperIds } } });
      const papers = await c.tx.paper.findMany({ where: { id: { in: input.paperIds }, dataStatus: "active" } });
      if (links.length !== input.paperIds.length || papers.length !== input.paperIds.length) throw AppError.conflict("Chỉ dùng bài đang hoạt động trong dự án này");
      for (const paperId of [...input.paperIds].sort()) {
        const link = links.find(l => l.paperId === paperId)!, paper = papers.find(p => p.id === paperId)!;
        const round = await c.tx.screeningRound.findFirst({ where: { projectId: c.project.id, paperId, active: true } });
        const final = round && round.status === "INCLUDED" ? await c.tx.screeningFinalDecision.findFirst({ where: { roundId: round.id }, orderBy: { roundVersion: "desc" } }) : null;
        if (input.mode === "OFFICIAL" && (link.screeningStatus !== "INCLUDED" || !final || final.decision !== "INCLUDED")) throw AppError.conflict("Bộ chính thức chỉ dùng bài đã hoàn thành các giai đoạn và có quyết định chọn hiện hành");
        const evidence = await c.tx.projectEvidenceItem.findMany({ where: { projectId: c.project.id, paperId }, select: { id: true, version: true } });
        const revisions = evidence.length ? await c.tx.projectWorkspaceRevision.findMany({ where: { projectId: c.project.id, entityKind: "EXTRACTION", OR: evidence.map(e => ({ entityId: e.id, version: e.version })) }, select: { id: true, entityId: true, version: true, snapshot: true } }) : [];
        sources.push({ id: paperId, projectPaperId: link.id, updatedAt: link.updatedAt.toISOString(), fingerprint: sourceFingerprint(paper), title: paper.title, abstractText: paper.abstractText, doi: paper.doi, publicationYear: paper.publicationYear, roundId: round?.id ?? null, roundVersion: round?.version ?? null, finalDecisionId: final?.id ?? null, selectionRule: round ? roundSettings(round.settings) : null, reviewIds: final?.reviewIds ?? [], finalDecision: final ? { id: final.id, decision: final.decision, reason: final.reason, resolverId: final.resolverId, createdAt: final.createdAt.toISOString() } : null, evidenceRevisions: revisions });
      }
      const id = randomUUID(), data = { id, projectId: c.project.id, mode: input.mode, topic: input.topic, createdAt: new Date().toISOString(), createdById: c.actorId, confirmedById: input.mode === "OFFICIAL" ? c.actorId : null, settings: await screeningSettings(c), sources };
      const snapshot: ProjectAnalysisSet = { ...data, hash: screeningHash(data) };
      if (JSON.stringify(snapshot).length > 1000000) throw AppError.badRequest("Bộ minh chứng quá lớn. Chọn ít bài hơn để lưu snapshot");
      await c.tx.projectWorkspaceRevision.create({ data: { projectId: c.project.id, actorId: c.actorId, entityKind: "ANALYSIS_SET", entityId: id, version: 1, snapshot: jsonSnapshot(snapshot) } });
      return { result: { id }, details: { id, mode: input.mode, hash: snapshot.hash, paperIds: input.paperIds } };
    });
  },
  get: (project: string, actor: string, id: string) => withWorkspace(project, actor, {}, c => readAnalysisSet(c, id)),
  list: (project: string, actor: string, page = 1) => withWorkspace(project, actor, {}, async c => {
    const where = { projectId: c.project.id, entityKind: "ANALYSIS_SET" };
    const [rows, total] = await Promise.all([c.tx.projectWorkspaceRevision.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }), c.tx.projectWorkspaceRevision.count({ where })]);
    return { items: rows.map(r => r.snapshot as unknown as ProjectAnalysisSet), total, page, pageSize: 20, hasNext: page * 20 < total };
  }),
};
