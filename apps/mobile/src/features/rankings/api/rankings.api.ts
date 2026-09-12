import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export interface RankingUser {
  rank: number;
  id: string;
  name: string;
  university: string;
  role: string;
  points: number;
  credits: number;
  avatarUrl: string | null;
}

export interface RankingsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MyRankingStats {
  points: number;
  uploadCreditReward: number;
  uploadedPdfs: number;
  requestedPapers: number;
  ratingsGiven: number;
  penaltyPoints: number;
}

export interface MyRanking {
  rank: number;
  user: {
    id: string;
    name: string;
    university: string;
    role: string;
    avatarUrl: string | null;
  };
  stats: MyRankingStats;
}

export const rankingsApi = {
  async top(params: { page?: number; limit?: number } = {}) {
    const res = await api.get(API_ROUTES.auth.rankingsTop, { params });
    return {
      rankings: res.data.data as RankingUser[],
      meta: res.data.meta as RankingsMeta,
    };
  },
  async me(): Promise<MyRanking> {
    const res = await api.get(API_ROUTES.auth.rankingsMe);
    return res.data.data;
  },
};
