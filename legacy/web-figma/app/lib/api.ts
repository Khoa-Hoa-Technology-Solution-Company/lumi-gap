/// <reference types="vite/client" />

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const REFRESHED_TOKEN_HEADER = 'x-access-token';

export const AUTH_CHANGED_EVENT = 'auth-changed';

export type AuthUser = {
  _id: string;
  fullName: string;
  university: string;
  email: string;
  role: 'user' | 'admin';
  status?: 'active' | 'banned';
  credits?: number;
  createdAt?: string;
  updatedAt?: string;
};

type RequestOptions = RequestInit & {
  auth?: boolean;
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const rawUser = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function saveToken(token: string) {
  if (localStorage.getItem(TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }

  if (sessionStorage.getItem(TOKEN_KEY)) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

export function saveAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  notifyAuthChanged();
}

export function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notifyAuthChanged();
}

export function resolveFileUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;

  const apiUrl = new URL(API_BASE_URL);
  return `${apiUrl.origin}${value}`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.auth) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (_error) {
    throw new Error(`Unable to connect to API server at ${API_BASE_URL}`);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && options.auth) {
      clearAuth();
    }

    throw new Error(data.message || 'Request failed');
  }

  const refreshedToken = response.headers.get(REFRESHED_TOKEN_HEADER);
  if (options.auth && refreshedToken) {
    saveToken(refreshedToken);
  }

  return data as T;
}
