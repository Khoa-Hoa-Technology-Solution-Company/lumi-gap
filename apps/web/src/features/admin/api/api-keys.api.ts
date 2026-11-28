import type { PlatformApiKey, PlatformApiKeyProvider, PlatformApiKeySettings, PlatformApiKeyTestResult } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants/api";

export interface ApiKeyDraft {
  provider: PlatformApiKeyProvider;
  label: string;
  apiKey: string;
  priority: number;
}

export interface ApiKeyChanges {
  label?: string;
  priority?: number;
  isEnabled?: boolean;
  apiKey?: string;
}

/** Admin management of the platform Gemini and OpenAlex key pool. */
export const apiKeysApi = {
  async list(): Promise<PlatformApiKeySettings> {
    return (await api.get(API_ROUTES.admin.apiKeys.root)).data.data;
  },
  async create(draft: ApiKeyDraft): Promise<PlatformApiKeyTestResult> {
    return (await api.post(API_ROUTES.admin.apiKeys.root, draft)).data.data;
  },
  async update(id: string, changes: ApiKeyChanges): Promise<PlatformApiKey> {
    return (await api.patch(API_ROUTES.admin.apiKeys.key(id), changes)).data.data;
  },
  async test(id: string): Promise<PlatformApiKeyTestResult> {
    return (await api.post(API_ROUTES.admin.apiKeys.test(id))).data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(API_ROUTES.admin.apiKeys.key(id));
  },
};
