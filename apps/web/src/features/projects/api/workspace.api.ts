import { api } from "@/services/api-client";
import type {
  PlanShareSummary, ResearchPlanRevision, ResearchPlanView, ResearchStage, SaveResearchPlan,
  SaveWorkspaceDecision, SaveWorkspaceDiscussion, SaveWorkspaceTask, WorkspaceComment,
  WorkspaceDecision, WorkspaceDiscussion, WorkspaceDiscussionDetail, WorkspaceLink,
  WorkspaceMilestone, WorkspaceOverview, WorkspacePage, WorkspacePerson, WorkspaceRevision,
  WorkspaceTask, WorkspaceTaskDetail,
} from "@trend/shared-types";

type Query = Record<string, string | number | undefined>;
const path = (id: string, section: string) => `/projects/${encodeURIComponent(id)}/${section}`;
async function get<T>(id: string, section: string, params?: Query): Promise<T> {
  return (await api.get<{ data: T }>(path(id, section), { params })).data.data;
}
async function write<T>(id: string, section: string, method: "post" | "put" | "patch" | "delete", data?: unknown): Promise<T> {
  return (await api.request<{ data: T }>({ url: path(id, section), method, data })).data.data;
}
export const workspaceApi = {
  overview: (id: string) => get<WorkspaceOverview>(id, "workspace"),
  stage: (id: string, data: { stage: ResearchStage | null; expectedVersion: number }) => write(id, "workspace/stage", "patch", data),
  people: (id: string, q = "", page = 1) => get<WorkspacePage<WorkspacePerson>>(id, "workspace/people", { q, page, pageSize: 50 }),
  artifacts: (id: string, kind: WorkspaceLink["kind"], q: string) => get<WorkspaceLink[]>(id, "workspace/artifacts", { kind, q }),
  plan: (id: string, revisionId?: string) => get<ResearchPlanView>(id, "plan", { revisionId }),
  savePlan: (id: string, data: SaveResearchPlan) => write<{ version: number; revisionId: string }>(id, "plan", "put", data),
  planHistory: (id: string, page: number) => get<WorkspacePage<ResearchPlanRevision>>(id, "plan/revisions", { page }),
  shares: (id: string) => get<PlanShareSummary[]>(id, "plan/shares"),
  share: (id: string, data: { revisionId: string; relationshipId: string }) => write(id, "plan/shares", "post", data),
  revokeShare: (id: string, shareId: string) => write(id, `plan/shares/${shareId}`, "delete"),
  tasks: (id: string, query: Query) => get<WorkspacePage<WorkspaceTask>>(id, "tasks", query),
  task: (id: string, taskId: string, page: number) => get<WorkspaceTaskDetail>(id, `tasks/${taskId}`, { page }),
  saveTask: (id: string, data: SaveWorkspaceTask & { expectedVersion?: number; clientKey?: string }, taskId?: string) => write<{ id: string; version: number }>(id, taskId ? `tasks/${taskId}` : "tasks", taskId ? "patch" : "post", data),
  deleteTask: (id: string, taskId: string, expectedVersion: number) => write(id, `tasks/${taskId}`, "delete", { expectedVersion }),
  milestones: (id: string, page = 1) => get<WorkspacePage<WorkspaceMilestone>>(id, "milestones", { page, pageSize: 50 }),
  saveMilestone: (id: string, data: Omit<WorkspaceMilestone, "id" | "version"> & { expectedVersion?: number }, milestoneId?: string) => write<WorkspaceMilestone>(id, milestoneId ? `milestones/${milestoneId}` : "milestones", milestoneId ? "patch" : "post", data),
  comments: (id: string, targetKind: "TASK" | "PLAN_REVISION", targetId: string, page: number) => get<WorkspacePage<WorkspaceComment>>(id, "workspace/comments", { targetKind, targetId, page }),
  comment: (id: string, data: { targetKind: "TASK" | "PLAN_REVISION"; targetId: string; body: string; clientKey: string; mentions: string[] }) => write<WorkspaceComment>(id, "workspace/comments", "post", data),
  discussions: (id: string, query: Query) => get<WorkspacePage<WorkspaceDiscussion>>(id, "discussions", query),
  discussion: (id: string, threadId: string, page: number) => get<WorkspaceDiscussionDetail>(id, `discussions/${threadId}`, { page }),
  saveDiscussion: (id: string, data: SaveWorkspaceDiscussion & { clientKey?: string; expectedVersion?: number; mentions: string[] }, threadId?: string) => write<{ id: string; version: number }>(id, threadId ? `discussions/${threadId}` : "discussions", threadId ? "patch" : "post", data),
  reply: (id: string, threadId: string, data: { body: string; clientKey: string; mentions: string[]; replyToId: string | null }) => write(id, `discussions/${threadId}/messages`, "post", data),
  resolve: (id: string, threadId: string, data: { status: "OPEN" | "RESOLVED"; conclusion: string; expectedVersion: number }) => write<{ id: string; version: number }>(id, `discussions/${threadId}/resolve`, "post", data),
  decisions: (id: string, query: Query) => get<WorkspacePage<WorkspaceDecision>>(id, "decisions", query),
  saveDecision: (id: string, data: SaveWorkspaceDecision & { expectedVersion?: number }, decisionId?: string) => write<{ id: string; version: number }>(id, decisionId ? `decisions/${decisionId}` : "decisions", decisionId ? "patch" : "post", data),
  history: (id: string, kind: "decisions" | "discussions", itemId: string, page: number) => get<WorkspacePage<WorkspaceRevision>>(id, `${kind}/${itemId}/history`, { page }),
};
