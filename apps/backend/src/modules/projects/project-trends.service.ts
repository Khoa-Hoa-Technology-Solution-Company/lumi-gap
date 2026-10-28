import type { ProjectTrendSnapshot, TrendClassification, TrendDataSource, TrendVerdict } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import type { CreateProjectTrendSnapshotBody } from "../trends/dto/trends.schema.js";
import { trendService } from "../trends/trend.service.js";
import { jsonSnapshot, withWorkspace, workspaceId } from "./workspace-access.js";

type SnapshotRow = { id: string; projectId: string; createdById: string; topic: string; openalexTopicId: string | null; yearFrom: number; yearTo: number; verdict: string; dataSource: string; totalPapers: number; statistics: unknown; note: string | null; createdAt: Date };

function toDto(row: SnapshotRow): ProjectTrendSnapshot {
  const stats = (row.statistics ?? {}) as { classification?: TrendClassification; baseline?: ProjectTrendSnapshot["baseline"] };
  return {
    id: row.id,
    projectId: row.projectId,
    createdById: row.createdById,
    topic: row.topic,
    openalexTopicId: row.openalexTopicId ?? undefined,
    yearFrom: row.yearFrom,
    yearTo: row.yearTo,
    verdict: row.verdict as TrendVerdict,
    dataSource: row.dataSource as TrendDataSource,
    totalPapers: row.totalPapers,
    classification: stats.classification as TrendClassification,
    baseline: stats.baseline,
    note: row.note ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export const projectTrendsService = {
  async list(projectId: string, actorId: string): Promise<ProjectTrendSnapshot[]> {
    return withWorkspace(projectId, actorId, { mentor: true }, async ({ tx, project }) => {
      const rows = await tx.projectTrendSnapshot.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 50 });
      return rows.map(toDto);
    });
  },

  /**
   * Freezes the topic's current trend verdict into the project as evidence. The figures are computed here, not
   * taken from the client, and outside the workspace transaction because OpenAlex calls can be slow.
   */
  async create(projectId: string, actorId: string, input: CreateProjectTrendSnapshotBody): Promise<ProjectTrendSnapshot> {
    // Fail fast on access before spending OpenAlex budget.
    await withWorkspace(projectId, actorId, { write: true }, async () => undefined);
    const yearTo = input.yearTo ?? new Date().getFullYear();
    const yearFrom = input.yearFrom ?? yearTo - 10;
    let detail: Awaited<ReturnType<typeof trendService.topic>>;
    try {
      detail = await trendService.topic(input.topic, { topicId: input.openalexTopicId, yearFrom, yearTo });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) throw AppError.badRequest(`No trend data for "${input.topic}" in ${yearFrom}-${yearTo}`);
      throw err;
    }
    const statistics = detail.statistics;
    if (!statistics) throw AppError.badRequest(`No trend data for "${input.topic}" in ${yearFrom}-${yearTo}`);
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const row = await context.tx.projectTrendSnapshot.create({
        data: {
          projectId: context.project.id,
          createdById: context.actorId,
          topic: input.topic.trim(),
          openalexTopicId: input.openalexTopicId ?? detail.taxonomy?.openalexTopicId ?? null,
          yearFrom,
          yearTo,
          verdict: statistics.classification.verdict,
          dataSource: detail.dataSource,
          totalPapers: statistics.totalPapers,
          statistics: jsonSnapshot({ classification: statistics.classification, baseline: statistics.baseline }),
          note: input.note?.trim() || null,
        },
      });
      return toDto(row);
    });
  },

  async remove(projectId: string, actorId: string, snapshotId: string): Promise<void> {
    await withWorkspace(projectId, actorId, { write: true }, async ({ tx, project, actorId: actor, role }) => {
      const row = await tx.projectTrendSnapshot.findFirst({ where: { ...workspaceId(snapshotId), projectId: project.id } });
      if (!row) throw AppError.notFound("Trend snapshot not found");
      if (row.createdById !== actor && role !== "OWNER") throw AppError.forbidden("Only its author or the project owner can remove this trend snapshot");
      await tx.projectTrendSnapshot.delete({ where: { id: row.id } });
    });
  },
};
