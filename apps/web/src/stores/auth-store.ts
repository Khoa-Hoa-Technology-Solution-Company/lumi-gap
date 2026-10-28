import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthTokens, User } from "@trend/shared-types";

interface AuthState {
  sessionVersion: number;
  user: User | null;
  tokens: AuthTokens | null;
  setAuth: (payload: { user: User; tokens: AuthTokens }) => void;
  setTokens: (tokens: AuthTokens) => void;
  clear: () => void;
}

type PersistedAuthState = Pick<AuthState, "user" | "tokens">;

function isCurrentAuthState(value: unknown): value is PersistedAuthState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PersistedAuthState>;
  const user = state.user;
  const tokens = state.tokens;

  // The auth token format changed with the PostgreSQL identity migration.
  // Old persisted sessions cannot be refreshed by the new API, so discard
  // them during hydration instead of rendering a page that can only produce
  // repeated 401 responses.
  return Boolean(
    user
      && typeof user === "object"
      && "systemRole" in user
      && tokens
      && typeof tokens === "object"
      && typeof (tokens as { accessToken?: unknown }).accessToken === "string"
      && typeof (tokens as { refreshToken?: unknown }).refreshToken === "string",
  );
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      sessionVersion: 0,
      user: null,
      tokens: null,
      setAuth: ({ user, tokens }) => set(state => ({ user, tokens, sessionVersion: state.sessionVersion + 1 })),
      setTokens: (tokens) => set({ tokens }),
      clear: () => set(state => ({ user: null, tokens: null, sessionVersion: state.sessionVersion + 1 })),
    }),
    {
      name: "trend-auth",
      version: 1,
      partialize: ({ user, tokens }) => ({ user, tokens }),
      migrate: (persistedState) =>
        isCurrentAuthState(persistedState)
          ? persistedState
          : { user: null, tokens: null },
    },
  ),
);
