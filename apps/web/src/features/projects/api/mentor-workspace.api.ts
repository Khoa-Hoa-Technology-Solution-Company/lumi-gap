import type { MentorWorkQuery, MentorWorkspaceData } from "@trend/shared-types";
import { api } from "@/services/api-client";

export const mentorWorkspaceApi = {
  async read(params: MentorWorkQuery): Promise<MentorWorkspaceData> {
    return (await api.get("/projects/academic-support/workspace", { params })).data.data;
  },
};
