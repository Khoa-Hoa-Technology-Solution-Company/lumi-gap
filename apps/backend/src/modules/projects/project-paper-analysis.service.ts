import type { PaperAiAnalysis, ProjectPaperAnalysis, ProjectScreeningStatus } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { knowledgeService } from "../knowledge/knowledge.service.js";
import { withWorkspace, workspaceId } from "./workspace-access.js";

async function source(projectId: string, actorId: string, paperId: string, write = false) {
  return withWorkspace(projectId, actorId, { write }, async context => {
    const paper = await context.tx.paper.findUnique({ where: workspaceId(paperId) });
    if (!paper || paper.dataStatus !== "active") throw AppError.notFound("Project source not found");
    const link = await context.tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId: context.project.id, paperId: paper.id } } });
    if (!link) throw AppError.notFound("Project source not found");
    return { paper, link, actorId: context.actorId };
  });
}

export const projectPaperAnalysisService = {
  async get(projectId: string, actorId: string, paperId: string): Promise<ProjectPaperAnalysis> {
    const { paper, link } = await source(projectId, actorId, paperId);
    const knowledge = await knowledgeService.get(publicDatabaseId(paper));
    return { paperId: paper.id, title: paper.title, screeningStatus: link.screeningStatus as ProjectScreeningStatus,
      analysis: paper.aiAnalysis as unknown as PaperAiAnalysis | null, knowledge };
  },
  async request(projectId: string, actorId: string, paperId: string) {
    const current = await source(projectId, actorId, paperId, true);
    // Private project attachments are never passed to the shared paper index.
    return knowledgeService.requestIndex(publicDatabaseId(current.paper), true, current.actorId);
  },
};
