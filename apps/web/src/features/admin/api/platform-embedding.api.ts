import type { PlatformEmbeddingConnection, PlatformEmbeddingSettings } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants/api";

export interface PlatformEmbeddingDraft {
  connectionId?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Admin management of the platform-wide embedding connection. */
export const platformEmbeddingApi = {
  async get(): Promise<PlatformEmbeddingSettings> {
    return (await api.get(API_ROUTES.admin.aiConnections.embedding)).data.data;
  },
  async save(draft: PlatformEmbeddingDraft): Promise<PlatformEmbeddingConnection> {
    return (await api.post(API_ROUTES.admin.aiConnections.embeddingConnections, { ...draft, apiKey: draft.apiKey || undefined })).data.data;
  },
  async activate(connectionId: string | null): Promise<void> {
    await api.put(API_ROUTES.admin.aiConnections.embeddingActive, { connectionId });
  },
  async remove(id: string): Promise<void> {
    await api.delete(API_ROUTES.admin.aiConnections.embeddingConnection(id));
  },
};
