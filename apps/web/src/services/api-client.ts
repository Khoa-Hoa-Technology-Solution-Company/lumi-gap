import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";

declare module "axios" {
  interface AxiosRequestConfig {
    expectedUserId?: string;
    _authSession?: { version: number; userId: string | null };
    _accessToken?: string;
    _retry?: boolean;
  }
}

type AuthSession = NonNullable<InternalAxiosRequestConfig["_authSession"]>;

function currentSession(): AuthSession {
  const state = useAuthStore.getState();
  return { version: state.sessionVersion, userId: state.user?.id ?? null };
}

function ownsSession(session: AuthSession): boolean {
  const current = currentSession();
  return current.version === session.version && current.userId === session.userId;
}

const rawBaseURL = import.meta.env.VITE_API_BASE?.trim();
export const API_BASE_URL = rawBaseURL && rawBaseURL.length > 0 ? rawBaseURL : "/api/v1";

export const api = axios.create({ baseURL: API_BASE_URL });

if (import.meta.env.DEV) {
  console.info("[api] Base URL resolved to:", API_BASE_URL);
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (config._authSession && !ownsSession(config._authSession)) {
    throw new axios.CanceledError("The original sign-in session has ended.");
  }
  if (config.expectedUserId && useAuthStore.getState().user?.id !== config.expectedUserId) {
    throw new axios.CanceledError("Delivery paused until the original account signs in.");
  }
  const token = useAuthStore.getState().tokens?.accessToken;
  config._authSession ??= currentSession();
  config._accessToken = token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let activeRefresh: { session: AuthSession; promise: Promise<string | null> } | null = null;

function isProtectedRequest(config?: InternalAxiosRequestConfig): boolean {
  const url = config?.url ?? "";
  return !url.includes("/auth/login")
    && !url.includes("/auth/register")
    && !url.includes("/auth/refresh")
    && !url.includes("/auth/oauth/exchange")
    && !url.includes("/auth/password/")
    && !url.includes("/auth/email/");
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config;
    const session = original?._authSession;
    if (!session || !ownsSession(session)) return Promise.reject(error);
    const tokens = useAuthStore.getState().tokens;
    const refreshToken = tokens?.refreshToken;
    if (original?.expectedUserId && useAuthStore.getState().user?.id !== original.expectedUserId) return Promise.reject(error);

    if (error.response?.status === 401 && original && refreshToken && !original._retry && isProtectedRequest(original)) {
      original._retry = true;
      // A concurrent request may already have rotated these tokens.
      if (tokens.accessToken && tokens.accessToken !== original._accessToken) return api(original);
      if (!activeRefresh || !ownsSession(activeRefresh.session)) {
        const refresh = { session, promise: refreshAccessToken(refreshToken, session) };
        activeRefresh = refresh;
        void refresh.promise.finally(() => {
          if (activeRefresh === refresh) activeRefresh = null;
        });
      }
      const newAccess = await activeRefresh.promise;
      if (!ownsSession(session)) return Promise.reject(error);
      if (newAccess) {
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
    }

    // A legacy/missing refresh token must not leave the app stuck with a
    // persisted access token that can never authorize another request.
    if (error.response?.status === 401 && isProtectedRequest(original)) {
      useAuthStore.getState().clear();
    }

    return Promise.reject(error);
  },
);

async function refreshAccessToken(refreshToken: string, session: AuthSession): Promise<string | null> {
  try {
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
    const tokens = res.data?.data;
    if (ownsSession(session) && useAuthStore.getState().tokens?.refreshToken === refreshToken
      && typeof tokens?.accessToken === "string" && typeof tokens?.refreshToken === "string") {
      useAuthStore.getState().setTokens(tokens);
      return tokens.accessToken as string;
    }
  } catch {
    // fall through
  }
  return null;
}
