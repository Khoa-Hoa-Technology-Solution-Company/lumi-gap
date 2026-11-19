import { api } from "@/services/api-client";
import type { IntegrityReadiness, IntegrityStoredRecord } from "@trend/shared-types";
const root = (project: string, manuscript: string, snapshot: string) => `/projects/${encodeURIComponent(project)}/manuscripts/${encodeURIComponent(manuscript)}/snapshots/${encodeURIComponent(snapshot)}/integrity`;
export const manuscriptIntegrityApi = {
  overview: async (project: string, manuscript: string, snapshot: string): Promise<IntegrityReadiness> => (await api.get(root(project, manuscript, snapshot))).data.data,
  command: async (project: string, manuscript: string, snapshot: string, body: unknown): Promise<IntegrityStoredRecord> => (await api.post(root(project, manuscript, snapshot), body)).data.data,
  packet: async (project: string, manuscript: string, snapshot: string, record: string): Promise<{ projectId: string; manuscriptId: string; snapshotId: string; viewerId: string; snapshotChecksum: string; record: IntegrityStoredRecord; stale: boolean; latestRecordId?: string; canAcknowledge: boolean; notice: string }> => (await api.get(`${root(project, manuscript, snapshot)}/${encodeURIComponent(record)}/declaration`)).data.data,
  export: async (project: string, manuscript: string, snapshot: string, record: string): Promise<Blob> => (await api.get(`${root(project, manuscript, snapshot)}/${encodeURIComponent(record)}/export`, { responseType: "blob" })).data,
  acceptAi: async (project: string, manuscript: string, run: string, input: { fileId: string; sequence: number; clientKey: string; paperId?: string }) => (await api.post(`/projects/${encodeURIComponent(project)}/manuscripts/${encodeURIComponent(manuscript)}/ai/${encodeURIComponent(run)}/acceptance`, input)).data.data,
};
