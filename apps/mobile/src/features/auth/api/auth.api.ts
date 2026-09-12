import type {
  AuthResponse,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  User,
} from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export const authApi = {
  async register(payload: RegisterRequest): Promise<AuthResponse> {
    const res = await api.post(API_ROUTES.auth.register, payload);
    return res.data.data;
  },
  async login(payload: LoginRequest): Promise<AuthResponse> {
    const res = await api.post(API_ROUTES.auth.login, payload);
    return res.data.data;
  },
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const res = await api.post(API_ROUTES.auth.refresh, { refreshToken });
    return res.data.data;
  },
  async logout(refreshToken: string): Promise<void> {
    await api.post(API_ROUTES.auth.logout, { refreshToken });
  },
  async me(): Promise<{ user: User }> {
    const res = await api.get(API_ROUTES.auth.me);
    return res.data.data;
  },
  async updateProfile(payload: UpdateProfileRequest): Promise<{ user: User }> {
    const res = await api.patch(API_ROUTES.auth.me, payload);
    return res.data.data;
  },
  async changePassword(payload: ChangePasswordRequest): Promise<void> {
    await api.post(API_ROUTES.auth.changePassword, payload);
  },
};

export interface UpdateProfileRequest {
  fullName?: string;
  institution?: string | null;
  researchInterests?: string[];
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
