import type { ScreeningLiveEvent, ScreeningAutomaticTask } from "@trend/shared-types";
import type { ScreeningWorkspaceSummary, ScreeningAdjudicationView, ProjectAnalysisSet, ScreeningBoard, ScreeningRoundView, ScreeningSettings, ScreeningMetrics, ScreeningAiView, ScreeningAuditView, WorkspacePage, WorkspacePerson } from "@trend/shared-types";
import { api, API_BASE_URL } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";
const path = (id: string, suffix: string) => `/projects/${encodeURIComponent(id)}/research/screening-v2/${suffix}`;
async function get<T>(id: string, suffix: string, params?: Record<string, string | number>) { return (await api.get<{ data: T }>(path(id, suffix), { params })).data.data; }
async function write(id: string, suffix: string, data: unknown, method = "post") { return (await api.request<{ data: unknown }>({ url: path(id, suffix), method, data })).data.data; }
export const screeningApi = {
  automaticTasks: (id: string) => get<ScreeningAutomaticTask[]>(id, "automatic-tasks"),
  resumeFullText: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/resume-full-text`, data),
  caseAction: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/adjudication`, data),
  caseSource: async (id: string, roundId: string, fileId: string, caseId?: string) => (await api.get<Blob>(path(id, `rounds/${roundId}/adjudication/sources/${fileId}`), { responseType: "blob", params: { caseId } })).data,
  adjudicationTasks: (id: string) => get<Array<{ automaticTaskId?: string; taskStatus?: string; roundId: string; paperId: string; title: string; phase: "TITLE_ABSTRACT" | "FULL_TEXT"; caseStatus?: string }>>(id, "adjudications"),
  advanceConservatively: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/advance-full-text`, data),
  begin: (id: string, paperId: string, data: unknown) => write(id, `papers/${paperId}/begin`, data),
  declineAgreement: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/agreement/decline`, data),
  requestAdjudication: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/request-adjudication`, data),
  reassess: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/reassess`, data),
  proposeAgreement: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/agreement`, data),
  confirmAgreement: (id: string, roundId: string, data: unknown) => write(id, `rounds/${roundId}/agreement/confirm`, data),
  adjudication: (id: string, roundId: string, caseId?: string) => get<ScreeningAdjudicationView>(id, `rounds/${roundId}/adjudication`, caseId ? { caseId } : undefined),
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
  action: (id: string, roundId: string, action: "defer" | "finalize" | "finalizer" | "reviews" | "resolve" | "reopen" | "unblind" | "comments" | "reassess", data: unknown) => write(id, `rounds/${roundId}/${action}`, data),
  history: (id: string, roundId: string, page: number, kind: "ALL" | "DISCUSSION" | "HISTORY" = "ALL") => get<WorkspacePage<ScreeningAuditView>>(id, `rounds/${roundId}/history`, { page, kind }),
  rounds: (id: string, paperId: string, page: number) => get<WorkspacePage<ScreeningRoundView> & { legacy: Record<string, unknown> | null }>(id, `papers/${paperId}/rounds`, { page }),
  analytics: (id: string) => get<ScreeningMetrics>(id, "analytics"),
  ai: (id: string, roundId: string) => get<ScreeningAiView | null>(id, `rounds/${roundId}/ai`),
  requestAi: (id: string, roundId: string, clientKey: string) => write(id, `rounds/${roundId}/ai`, { clientKey }),
  workspaceSummary: (id: string) => get<ScreeningWorkspaceSummary>(id, "workspace-summary"),
  claim: (id: string, roundId: string, data?: unknown) => write(id, `rounds/${roundId}/claim`, typeof data === "object" && data !== null && "clientKey" in data ? data : { ...(typeof data === "object" && data ? data : {}), clientKey: crypto.randomUUID() }),
  release: (id: string, roundId: string, data?: unknown) => write(id, `rounds/${roundId}/release`, typeof data === "object" && data !== null && "clientKey" in data ? data : { ...(typeof data === "object" && data ? data : {}), clientKey: crypto.randomUUID() }),
  extend: (id: string, roundId: string, data?: unknown) => write(id, `rounds/${roundId}/extend`, typeof data === "object" && data !== null && "clientKey" in data ? data : { ...(typeof data === "object" && data ? data : {}), clientKey: crypto.randomUUID() }),
  grantProposerException: (id: string, roundId: string, data: { reason: string; clientKey?: string }) => write(id, `rounds/${roundId}/proposer-exception`, data),
  claimNext: (id: string, data?: unknown) => write(id, "papers/claim-next", typeof data === "object" && data !== null && "clientKey" in data ? data : { ...(typeof data === "object" && data ? data : {}), clientKey: crypto.randomUUID() }) as Promise<{ paperId: string | null; roundId: string | null; dueAt: string | null }>,
  extendDiscussion: (id: string, roundId: string, data: { expectedVersion: number; hours?: number; reason: string; clientKey?: string }) => write(id, `rounds/${roundId}/discussion/extend`, typeof data === "object" && data !== null && "clientKey" in data && data.clientKey ? data : { ...data, clientKey: crypto.randomUUID() }),
  closeUnresolved: (id: string, roundId: string, data: { expectedVersion: number; reason: string; note?: string; clientKey?: string }) => write(id, `rounds/${roundId}/close-unresolved`, typeof data === "object" && data !== null && "clientKey" in data && data.clientKey ? data : { ...data, clientKey: crypto.randomUUID() }),
  reopenUnresolved: (id: string, roundId: string, data: { expectedVersion: number; reason: string; clientKey?: string }) => write(id, `rounds/${roundId}/reopen-unresolved`, typeof data === "object" && data !== null && "clientKey" in data && data.clientKey ? data : { ...data, clientKey: crypto.randomUUID() }),
  requestMoreInfo: (id: string, roundId: string, data: { expectedVersion: number; reason: string; clientKey?: string }) => write(id, `rounds/${roundId}/request-more-info`, typeof data === "object" && data !== null && "clientKey" in data && data.clientKey ? data : { ...data, clientKey: crypto.randomUUID() }),
  updateDiscoveryGoal: (id: string, data: unknown) => write(id, "discovery-goal", data, "put"),
  streamEvents: async (
    id: string,
    roundId: string,
    options: {
      signal?: AbortSignal;
      onOpen?: () => void;
      onEvent: (event: ScreeningLiveEvent) => void;
    }
  ): Promise<void> => {
    const token = useAuthStore.getState().tokens?.accessToken;
    const url = `/projects/${encodeURIComponent(id)}/research/screening-v2/rounds/${encodeURIComponent(roundId)}/events`;
    const fullUrl = API_BASE_URL.startsWith("http")
      ? `${API_BASE_URL}${url}`
      : `${window.location.origin}${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: options.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Screening event stream failed with status ${response.status}`);
    }
    options.onOpen?.();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error("Screening event stream closed");
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let frameEnd = buffer.indexOf("\n\n");
      while (frameEnd >= 0) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        const dataLine = frame.split("\n").find(line => line.startsWith("data:"));
        if (dataLine) {
          try {
            const data = JSON.parse(dataLine.replace(/^data:\s*/, ""));
            options.onEvent(data);
          } catch {}
        }
        frameEnd = buffer.indexOf("\n\n");
      }
    }
  },
};
