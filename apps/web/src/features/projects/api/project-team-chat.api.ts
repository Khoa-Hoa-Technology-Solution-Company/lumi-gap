import type {
  ProjectTeamChatEvent,
  ProjectTeamChatHistoryResponse,
  ProjectTeamChatMessage,
  SendProjectTeamChatMessageResponse,
} from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api, API_BASE_URL } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";

interface StreamTeamChatEventsOptions {
  signal: AbortSignal;
  onEvent: (event: ProjectTeamChatEvent) => void;
  onOpen?: () => void;
}

export const projectTeamChatApi = {
  async listMessages(projectId: string, params?: { limit?: number; before?: string }): Promise<ProjectTeamChatMessage[]> {
    const res = await api.get<{
      success: boolean;
      data: ProjectTeamChatHistoryResponse;
      meta: { count: number };
    }>(API_ROUTES.projects.teamChat.history(projectId), { params });
    return res.data.data.messages;
  },

  async sendMessage(projectId: string, content: string): Promise<ProjectTeamChatMessage> {
    const res = await api.post<{
      success: boolean;
      data: SendProjectTeamChatMessageResponse;
      meta: null;
    }>(API_ROUTES.projects.teamChat.send(projectId), { content });
    return res.data.data.message;
  },

  async markRead(projectId: string, messageId: string): Promise<ProjectTeamChatMessage> {
    const res = await api.post<{
      success: boolean;
      data: SendProjectTeamChatMessageResponse;
      meta: null;
    }>(API_ROUTES.projects.teamChat.read(projectId, messageId));
    return res.data.data.message;
  },

  async deleteMessage(projectId: string, messageId: string, reason?: string): Promise<ProjectTeamChatMessage> {
    const res = await api.delete<{
      success: boolean;
      data: SendProjectTeamChatMessageResponse;
      meta: null;
    }>(API_ROUTES.projects.teamChat.delete(projectId, messageId), { data: { reason } });
    return res.data.data.message;
  },

  async streamEvents(projectId: string, options: StreamTeamChatEventsOptions): Promise<void> {
    const token = useAuthStore.getState().tokens?.accessToken;
    const response = await fetch(resolveApiUrl(API_ROUTES.projects.teamChat.events(projectId)), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: options.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Team chat event stream failed with status ${response.status}`);
    }

    options.onOpen?.();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        throw new Error("Team chat event stream closed");
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

function parseSseFrame(frame: string): ProjectTeamChatEvent | null {
  const dataLine = frame
    .split("\n")
    .find((line) => line.startsWith("data:"));
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine.slice("data:".length).trim()) as ProjectTeamChatEvent;
  } catch {
    return null;
  }
}
