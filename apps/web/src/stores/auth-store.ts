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
      user: null,
      tokens: null,
      setAuth: ({ user, tokens }) => set({ user, tokens }),
      setTokens: (tokens) => set({ tokens }),
      clear: () => set({ user: null, tokens: null }),
    }),
    {
      name: "trend-auth",
      version: 1,
      migrate: (persistedState) =>
        isCurrentAuthState(persistedState)
          ? persistedState
          : { user: null, tokens: null },
    },
  ),
);
