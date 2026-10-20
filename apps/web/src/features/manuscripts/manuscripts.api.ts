import type { CreateManuscript, ManuscriptSummary, ManuscriptDetail, ManuscriptContext, ManuscriptSnapshot, ManuscriptComment } from "@trend/shared-types";
import { api } from "@/services/api-client";
import type { ManuscriptCompilation, ManuscriptCompilationState, ManuscriptEngine, CreateManuscriptSnapshot } from "@trend/shared-types";
const root = (project: string, id?: string) => `/projects/${encodeURIComponent(project)}/manuscripts${id ? `/${encodeURIComponent(id)}` : ""}`;
export const manuscriptsApi = {
  compile: async (project: string, id: string, snapshotId: string, engine: ManuscriptEngine) => (await api.post<{ data: ManuscriptCompilation }>(`${root(project, id)}/snapshots/${snapshotId}/compile`, { engine })).data.data,
  compilations: async (project: string, id: string, snapshotId?: string) => (await api.get<{ data: ManuscriptCompilationState }>(`${root(project, id)}/compilations`, { params: { snapshotId } })).data.data,
  pdf: async (project: string, id: string, compilationId: string) => (await api.get<Blob>(`${root(project, id)}/compilations/${compilationId}/pdf`, { responseType: "blob" })).data,
  list: async (project: string) => (await api.get<{ data: ManuscriptSummary[] }>(root(project))).data.data,
  create: async (project: string, input: CreateManuscript) => (await api.post<{ data: ManuscriptSummary }>(root(project), input)).data.data,
  detail: async (project: string, id: string) => (await api.get<{ data: ManuscriptDetail }>(root(project, id))).data.data,
  context: async (project: string, id: string) => (await api.get<{ data: ManuscriptContext }>(`${root(project, id)}/context`)).data.data,
  insertCitation: async (project: string, id: string, paperId: string) => (await api.post<{ data: { key: string } }>(`${root(project, id)}/citations`, { paperId })).data.data,
  snapshots: async (project: string, id: string) => (await api.get<{ data: ManuscriptSnapshot[] }>(`${root(project, id)}/snapshots`)).data.data,
  snapshot: async (project: string, id: string, input: CreateManuscriptSnapshot) => (await api.post<{ data: { id: string; sourceVersion: number } }>(`${root(project, id)}/snapshots`, input)).data.data,
  viewSnapshot: async (project: string, id: string, snapshotId: string) => (await api.get<{ data: ManuscriptSnapshot }>(`${root(project, id)}/snapshots/${encodeURIComponent(snapshotId)}`)).data.data,
  restore: async (project: string, id: string, snapshotId: string, title: string, clientKey: string) => (await api.post<{ data: ManuscriptSummary }>(`${root(project, id)}/snapshots/${snapshotId}/restore`, { title, clientKey })).data.data,
  publish: async (project: string, id: string, snapshotId: string, authorIds: string[]) => (await api.post<{ data: { submissionId: string; revisionId: string } }>(`${root(project, id)}/snapshots/${snapshotId}/publish`, { authorIds })).data.data,
  createFile: async (project: string, id: string, path: string, kind: "TEXT" | "FOLDER", clientKey: string) => (await api.post(`${root(project, id)}/files`, { path, kind, content: "", clientKey })).data.data,
  changeFile: async (project: string, id: string, fileId: string, input: { expectedVersion: number; path?: string; main?: true; delete?: true }) => (await api.patch(`${root(project, id)}/files/${fileId}`, input)).data.data,
  upload: async (project: string, id: string, file: File, path: string, replace?: { id: string; version: number }) => { const form = new FormData(); form.append("path", path); form.append("asset", file); if (replace) { form.append("replaceId", replace.id); form.append("expectedVersion", String(replace.version)); } return (await api.post(`${root(project, id)}/assets`, form)).data.data; },
  downloadAsset: async (project: string, id: string, fileId: string) => (await api.get<Blob>(`${root(project, id)}/files/${fileId}/download`, { responseType: "blob" })).data,
  export: async (project: string, id: string, snapshotId?: string) => (await api.get<Blob>(`${root(project, id)}/export`, { params: { snapshotId }, responseType: "blob" })).data,
  comments: async (project: string, id: string, snapshotId?: string) => (await api.get<{ data: ManuscriptComment[] }>(`${root(project, id)}/comments`, { params: { snapshotId } })).data.data,
  comment: async (project: string, id: string, input: { body: string; clientKey: string; fileId?: string; snapshotId?: string; quote?: string; start?: unknown; end?: unknown; mentorRelationshipId?: string }) => (await api.post(`${root(project, id)}/comments`, input)).data.data,
  reply: async (project: string, threadId: string, body: string, clientKey: string) => (await api.post(`/projects/${project}/discussions/${threadId}/messages`, { body, clientKey, replyToId: null, mentions: [] })).data.data,
  resolve: async (project: string, threadId: string, status: "OPEN" | "RESOLVED", expectedVersion: number, conclusion: string) => (await api.post(`/projects/${project}/discussions/${threadId}/resolve`, { status, expectedVersion, conclusion })).data.data,
  mentors: async (project: string, id: string) => (await api.get<{ data: Array<{ id: string; mentor: { id: string; name: string } }> }>(`${root(project, id)}/mentors`)).data.data,
};
export function saveDownload(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
