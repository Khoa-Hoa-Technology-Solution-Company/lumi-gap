import { create } from "zustand";
import type { ProjectChatReference } from "@trend/shared-types";

interface QuickChatState {
  isOpen: boolean;
  activeProjectId: string | null;
  pendingReference: ProjectChatReference | null;
  openChat: (projectId: string, reference?: ProjectChatReference) => void;
  closeChat: () => void;
  toggleChat: (projectId: string) => void;
  clearPendingReference: () => void;
}

export const useQuickChatStore = create<QuickChatState>((set) => ({
  isOpen: false,
  activeProjectId: null,
  pendingReference: null,
  openChat: (projectId: string, reference?: ProjectChatReference) =>
    set({
      isOpen: true,
      activeProjectId: projectId,
      ...(reference ? { pendingReference: reference } : {}),
    }),
  closeChat: () => set({ isOpen: false }),
  toggleChat: (projectId: string) =>
    set((state) => ({
      isOpen: !state.isOpen || state.activeProjectId !== projectId,
      activeProjectId: projectId,
    })),
  clearPendingReference: () => set({ pendingReference: null }),
}));
