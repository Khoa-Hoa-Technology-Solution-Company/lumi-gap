import type {
  PinProjectChatMessageResponse,
  ProjectChatEvent,
  ProjectChatHistoryResponse,
  ProjectChatMessage,
  ProjectChatScope,
  SendProjectChatMessageResponse,
} from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api, API_BASE_URL } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";

interface StreamProjectChatEventsOptions {
  signal: AbortSignal;
  scope?: ProjectChatScope;
  onEvent: (event: ProjectChatEvent) => void;
  onOpen?: () => void;
}

export const projectChatApi = {
  async listHistory(projectId: string, limit = 50, scope: ProjectChatScope = "private"): Promise<ProjectChatMessage[]> {
    const res = await api.get<{
      success: boolean;
      data: ProjectChatHistoryResponse;
      meta: { count: number };
    }>(API_ROUTES.projects.chat.history(projectId), { params: { limit, scope } });
    return res.data.data.messages;
  },

  async sendMessage(
    projectId: string,
    message: string,
    scope: ProjectChatScope = "private",
  ): Promise<SendProjectChatMessageResponse> {
    const res = await api.post<{
      success: boolean;
      data: SendProjectChatMessageResponse;
      meta: null;
    }>(API_ROUTES.projects.chat.send(projectId), { message, scope });
    return res.data.data;
  },

  async pinMessage(projectId: string, messageId: string, pinned: boolean): Promise<ProjectChatMessage> {
    const res = await api.patch<{
      success: boolean;
      data: PinProjectChatMessageResponse;
      meta: null;
    }>(API_ROUTES.projects.chat.pin(projectId, messageId), { pinned });
    return res.data.data.message;
  },

  async streamEvents(projectId: string, options: StreamProjectChatEventsOptions): Promise<void> {
    const token = useAuthStore.getState().tokens?.accessToken;
    const params = new URLSearchParams({ scope: options.scope ?? "team" });
    const response = await fetch(`${resolveApiUrl(API_ROUTES.projects.chat.events(projectId))}?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: options.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Project AI chat event stream failed with status ${response.status}`);
    }

    options.onOpen?.();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        throw new Error("Project AI chat event stream closed");
      }
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let frameEnd = buffer.indexOf("\n\n");
      while (frameEnd >= 0) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        const event = parseSseFrame(frame);
        if (event) options.onEvent(event);
        frameEnd = buffer.indexOf("\n\n");
      }
    }
  },
};

function resolveApiUrl(path: string): string {
  const base = API_BASE_URL.startsWith("http")
    ? API_BASE_URL
    : `${window.location.origin}${API_BASE_URL}`;
  return `${base}${path}`;
}

function parseSseFrame(frame: string): ProjectChatEvent | null {
  const dataLine = frame
    .split("\n")
    .find((line) => line.startsWith("data:"));
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine.slice("data:".length).trim()) as ProjectChatEvent;
  } catch {
    return null;
  }
}
