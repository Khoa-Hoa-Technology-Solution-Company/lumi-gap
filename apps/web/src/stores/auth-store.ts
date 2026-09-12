import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthTokens, User } from "@trend/shared-types";

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  setAuth: (payload: { user: User; tokens: AuthTokens }) => void;
  setTokens: (tokens: AuthTokens) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      setAuth: ({ user, tokens }) => set({ user, tokens }),
      setTokens: (tokens) => set({ tokens }),
      clear: () => set({ user: null, tokens: null }),
    }),
    { name: "trend-auth" },
  ),
);
