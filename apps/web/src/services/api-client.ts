import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";

const rawBaseURL = import.meta.env.VITE_API_BASE?.trim();
export const API_BASE_URL = rawBaseURL && rawBaseURL.length > 0 ? rawBaseURL : "/api/v1";

export const api = axios.create({ baseURL: API_BASE_URL });

if (import.meta.env.DEV) {
  console.info("[api] Base URL resolved to:", API_BASE_URL);
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().tokens?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

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
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const refreshToken = useAuthStore.getState().tokens?.refreshToken;

    if (error.response?.status === 401 && original && refreshToken && !original._retry && isProtectedRequest(original)) {
      original._retry = true;
      refreshPromise ??= refreshAccessToken(refreshToken).finally(() => {
        refreshPromise = null;
      });
      const newAccess = await refreshPromise;
      if (newAccess) {
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
      useAuthStore.getState().clear();
    }

    // A legacy/missing refresh token must not leave the app stuck with a
    // persisted access token that can never authorize another request.
    if (error.response?.status === 401 && isProtectedRequest(original)) {
      useAuthStore.getState().clear();
    }

    return Promise.reject(error);
  },
);

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
    const tokens = res.data?.data;
    if (tokens) {
      useAuthStore.getState().setTokens(tokens);
      return tokens.accessToken as string;
    }
  } catch {
    // fall through
  }
  return null;
}
