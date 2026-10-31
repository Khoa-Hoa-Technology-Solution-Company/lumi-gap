import type { ScreeningWorkspaceSummary, ScreeningAdjudicationView, ProjectAnalysisSet, ScreeningBoard, ScreeningRoundView, ScreeningSettings, ScreeningMetrics, ScreeningAiView, ScreeningAuditView, WorkspacePage, WorkspacePerson } from "@trend/shared-types";
import { api } from "@/services/api-client";
const path = (id: string, suffix: string) => `/projects/${encodeURIComponent(id)}/research/screening-v2/${suffix}`;
async function get<T>(id: string, suffix: string, params?: Record<string, string | number>) { return (await api.get<{ data: T }>(path(id, suffix), { params })).data.data; }
async function write(id: string, suffix: string, data: unknown, method = "post") { return (await api.request<{ data: unknown }>({ url: path(id, suffix), method, data })).data.data; }
export const screeningApi = {
  advanceConservatively: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/advance-full-text`, data),
  begin: (id: string, paperId: string, data: unknown) => write(id, `papers/${paperId}/begin`, data),
  declineAgreement: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/agreement/decline`, data),
  requestAdjudication: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/request-adjudication`, data),
  proposeAgreement: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/agreement`, data),
  confirmAgreement: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/agreement/confirm`, data),
  adjudication: (id: string, roundId: string) => get<ScreeningAdjudicationView>(id, `rounds/${roundId}/adjudication`),
  assess: (id: string, paperId: string, data: unknown) => write(id, `papers/${paperId}/assessment`, data),
  createSet: async (id: string, data: unknown) => await write(id, "analysis-sets", data) as { id: string },
  getSet: (id: string, setId: string) => get<ProjectAnalysisSet>(id, `analysis-sets/${setId}`),
  sets: (id: string, page: number) => get<WorkspacePage<ProjectAnalysisSet>>(id, "analysis-sets", { page }),
  board: (id: string, params: Record<string, string | number>) => get<ScreeningBoard>(id, "papers", params),
  config: (id: string) => get<{ settings: ScreeningSettings; canManage: boolean; people: WorkspacePerson[] }>(id, "config"),
  configure: (id: string, data: unknown) => write(id, "config", data, "put"),
  proposal: (id: string, paperId: string, data: unknown) => write(id, `papers/${paperId}/proposal`, data, "put"),
  start: (id: string, data: unknown) => write(id, "rounds", data),
  assign: (id: string, data: unknown) => write(id, "assignments", data),
  detail: (id: string, roundId: string) => get<ScreeningRoundView>(id, `rounds/${roundId}`),
  action: (id: string, roundId: string, action: "defer" | "finalize" | "finalizer" | "reviews" | "resolve" | "reopen" | "unblind" | "comments", data: unknown) => write(id, `rounds/${roundId}/${action}`, data),
  history: (id: string, roundId: string, page: number, kind: "ALL" | "DISCUSSION" | "HISTORY" = "ALL") => get<WorkspacePage<ScreeningAuditView>>(id, `rounds/${roundId}/history`, { page, kind }),
  rounds: (id: string, paperId: string, page: number) => get<WorkspacePage<ScreeningRoundView> & { legacy: Record<string, unknown> | null }>(id, `papers/${paperId}/rounds`, { page }),
  analytics: (id: string) => get<ScreeningMetrics>(id, "analytics"),
  ai: (id: string, roundId: string) => get<ScreeningAiView | null>(id, `rounds/${roundId}/ai`),
  requestAi: (id: string, roundId: string, clientKey: string) => write(id, `rounds/${roundId}/ai`, { clientKey }),
  workspaceSummary: (id: string) => get<ScreeningWorkspaceSummary>(id, "workspace-summary"),
  claim: (id: string, roundId: string, data?: unknown) => write(id, `rounds/${roundId}/claim`, data ?? {}),
  release: (id: string, roundId: string, data?: unknown) => write(id, `rounds/${roundId}/release`, data ?? {}),
  extend: (id: string, roundId: string, data?: unknown) => write(id, `rounds/${roundId}/extend`, data ?? {}),
  claimNext: (id: string, data?: unknown) => write(id, "papers/claim-next", data ?? {}) as Promise<{ paperId: string | null; roundId: string | null; dueAt: string | null }>,
  updateDiscoveryGoal: (id: string, data: unknown) => write(id, "discovery-goal", data, "put"),
};