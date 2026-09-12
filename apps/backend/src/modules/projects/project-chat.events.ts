import type { ProjectChatEvent } from "@trend/shared-types";

type ProjectChatListener = (event: ProjectChatEvent) => void;

export class ProjectChatEventHub {
  private readonly listenersByProject = new Map<string, Set<ProjectChatListener>>();

  subscribe(projectId: string, listener: ProjectChatListener): () => void {
    const listeners = this.listenersByProject.get(projectId) ?? new Set<ProjectChatListener>();
    listeners.add(listener);
    this.listenersByProject.set(projectId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenersByProject.delete(projectId);
      }
    };
  }

  publish(event: ProjectChatEvent): void {
    const listeners = this.listenersByProject.get(event.projectId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  }
}

export const projectChatEventHub = new ProjectChatEventHub();
