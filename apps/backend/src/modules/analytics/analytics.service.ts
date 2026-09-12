import type { TopQuery, VolumeByDay, SearchSummary } from "@trend/shared-types";
import { logger } from "../../infrastructure/logger.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { SearchLogModel, type SearchLogDoc } from "./models/search-log.model.js";
import { UserModel } from "../auth/models/user.model.js";

export type { SearchLogDoc };
export type { TopQuery, VolumeByDay, SearchSummary };

export interface LogSearchParams {
  userId?: string;
  query: string;
  mode: "semantic" | "semantic+rerank";
  resultCount: number;
  durationMs: number;
  filters: Record<string, unknown>;
}

export const analyticsService = {
  logSearch(params: LogSearchParams): void {
    SearchLogModel.create({
      userId: params.userId,
      query: params.query,
      mode: params.mode,
      resultCount: params.resultCount,
      durationMs: params.durationMs,
      filters: params.filters,
    }).catch((err) => logger.warn({ err }, "search log write failed (non-fatal)"));
  },

  async getTopQueries(days: number): Promise<TopQuery[]> {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const rows = await SearchLogModel.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    return rows.map((r) => ({ query: r._id, count: r.count }));
  },

  async getVolumeByDay(days: number): Promise<VolumeByDay[]> {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const rows = await SearchLogModel.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({ date: r._id, count: r.count }));
  },

  async getUserHistory(userId: string): Promise<SearchLogDoc[]> {
    return SearchLogModel.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
  },

  async getSummary(): Promise<SearchSummary> {
    const [totalSearches, totalPapers, uniqueUsers] = await Promise.all([
      SearchLogModel.countDocuments(),
      PaperModel.countDocuments({ dataStatus: "active" }),
      UserModel.countDocuments(),
    ]);
    return {
      totalSearches,
      totalPapers,
      uniqueUsers,
    };
  },
};
