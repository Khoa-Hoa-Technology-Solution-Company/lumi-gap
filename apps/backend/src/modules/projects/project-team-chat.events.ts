import type { ProjectTeamChatEvent } from "@trend/shared-types";

type ProjectTeamChatListener = (event: ProjectTeamChatEvent) => void;

export class ProjectTeamChatEventHub {
  private readonly listenersByProject = new Map<string, Set<ProjectTeamChatListener>>();

  subscribe(projectId: string, listener: ProjectTeamChatListener): () => void {
    const listeners = this.listenersByProject.get(projectId) ?? new Set<ProjectTeamChatListener>();
    listeners.add(listener);
    this.listenersByProject.set(projectId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenersByProject.delete(projectId);
      }
    };
  }

  publish(event: ProjectTeamChatEvent): void {
    const listeners = this.listenersByProject.get(event.projectId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  }
}

export const projectTeamChatEventHub = new ProjectTeamChatEventHub();
