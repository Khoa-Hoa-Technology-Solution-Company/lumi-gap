import type { SearchSummary, TopQuery, VolumeByDay } from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";

export type SearchLogDoc = Awaited<ReturnType<ReturnType<typeof getPrisma>["searchLog"]["findFirst"]>>;
export type { SearchSummary, TopQuery, VolumeByDay };
export interface LogSearchParams { userId?: string; query: string; mode: "semantic" | "semantic+rerank"; resultCount: number; durationMs: number; filters: Record<string, unknown> }
async function userId(value?: string) { if (!value) return undefined; const parsed = parseDatabaseId(value); if (!parsed) return undefined; return (await getPrisma().user.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }, select: { id: true } }))?.id; }

export const analyticsService = {
  logSearch(params: LogSearchParams): void { void userId(params.userId).then((resolved) => getPrisma().searchLog.create({ data: { userId: resolved, query: params.query, mode: params.mode, resultCount: params.resultCount, durationMs: params.durationMs, filters: params.filters as never } })).catch((err) => logger.warn({ err }, "search log write failed (non-fatal)")); },
  async getTopQueries(days: number): Promise<TopQuery[]> { const since = new Date(Date.now() - days * 86_400_000); const rows = await getPrisma().searchLog.groupBy({ by: ["query"], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { query: "desc" } }, take: 10 }); return rows.map((row) => ({ query: row.query, count: row._count._all })); },
  async getVolumeByDay(days: number): Promise<VolumeByDay[]> { const since = new Date(Date.now() - days * 86_400_000); const rows = await getPrisma().$queryRaw<Array<{ date: string; count: bigint }>>(Prisma.sql`SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, count(*) AS count FROM search_logs WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1`); return rows.map((row) => ({ date: row.date, count: Number(row.count) })); },
  async getUserHistory(value: string) { const resolved = await userId(value); return resolved ? getPrisma().searchLog.findMany({ where: { userId: resolved }, orderBy: { createdAt: "desc" }, take: 50 }) : []; },
  async getSummary(): Promise<SearchSummary> { const [totalSearches, totalPapers, uniqueUsers] = await Promise.all([getPrisma().searchLog.count(), getPrisma().paper.count({ where: { dataStatus: "active" } }), getPrisma().user.count()]); return { totalSearches, totalPapers, uniqueUsers }; },
};
