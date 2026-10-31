import type { ApiResponse, GithubConnectionStatus, GithubRepositories } from "@trend/shared-types";
import { api } from "@/services/api-client";

function data<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error("GitHub connection request failed");
  return response.data;
}

const root = "/integrations/github";
export const githubConnectionApi = {
  async status(userId: string, signal?: AbortSignal) { return data((await api.get<ApiResponse<GithubConnectionStatus>>(root, { expectedUserId: userId, signal })).data); },
  async start(userId: string, returnTo: string) { return data((await api.post<ApiResponse<{ url: string }>>(`${root}/start`, { returnTo }, { expectedUserId: userId })).data); },
  async complete(userId: string, code: string, state: string) { return data((await api.post<ApiResponse<{ returnTo: string }>>(`${root}/complete`, { code, state }, { expectedUserId: userId })).data); },
  async repositories(userId: string, page: number, signal?: AbortSignal) { return data((await api.get<ApiResponse<GithubRepositories>>(`${root}/repositories`, { params: { page }, expectedUserId: userId, signal })).data); },
  async disconnect(userId: string) { return data((await api.delete<ApiResponse<{ disconnected: boolean; revoked: boolean }>>(root, { expectedUserId: userId })).data); },
  async initializeRepository(userId: string, input: import("@trend/shared-types").InitializeGithubRepoInput) { return data((await api.post<ApiResponse<{ head: string }>>(`${root}/initialize-repository`, input, { expectedUserId: userId })).data); },
};
