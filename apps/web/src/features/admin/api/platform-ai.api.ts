import type { AiConnectionProvider, PlatformAiConnection, PlatformAiSettings } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants/api";

export interface PlatformAiDraft {
  connectionId?: string;
  name: string;
  provider: AiConnectionProvider;
  baseUrl: string;
  apiKey: string;
  fastModel: string;
  deepModel: string;
}

/** Admin management of the platform-wide AI connection. */
export const platformAiApi = {
  async get(): Promise<PlatformAiSettings> {
    return (await api.get(API_ROUTES.admin.aiConnections.root)).data.data;
  },
  async models(draft: PlatformAiDraft): Promise<Array<{ id: string; name: string }>> {
    return (await api.post(API_ROUTES.admin.aiConnections.models, { connectionId: draft.connectionId, provider: draft.provider, baseUrl: draft.baseUrl, apiKey: draft.apiKey || undefined })).data.data;
  },
  async save(draft: PlatformAiDraft): Promise<PlatformAiConnection> {
    return (await api.post(API_ROUTES.admin.aiConnections.connections, { ...draft, apiKey: draft.apiKey || undefined })).data.data;
  },
  async activate(connectionId: string | null): Promise<void> {
    await api.put(API_ROUTES.admin.aiConnections.active, { connectionId });
  },
  async remove(id: string): Promise<void> {
    await api.delete(API_ROUTES.admin.aiConnections.connection(id));
  },
};
