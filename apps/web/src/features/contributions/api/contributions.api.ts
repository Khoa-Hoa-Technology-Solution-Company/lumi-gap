import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export interface ResearchContribution {
  _id: string;
  contributorId: string;
  contributionType: string;
  description?: string;
  evidence?: string;
  provenance: string;
  verificationStatus: string;
  visibility: "PUBLIC" | "PRIVATE";
  verifiedAt?: string;
  createdAt: string;
  projectId?: { _id: string; title: string };
  submissionId?: { _id: string; title: string };
}

export const contributionsApi = {
  async forUser(userId: string): Promise<ResearchContribution[]> {
    const response = await api.get(API_ROUTES.contributions.user(userId));
    return response.data.data;
  },
};
