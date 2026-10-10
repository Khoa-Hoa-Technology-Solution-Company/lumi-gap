import type {
  AcademicOnboardingOptions,
  AuthResponse,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  UpdateAcademicProfileRequest,
  User,
} from "@trend/shared-types";
import { api, API_BASE_URL } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export const authApi = {
  googleAuthorizationUrl(invitationToken?: string): string {
    const url = new URL(`${API_BASE_URL}/auth/google`, window.location.origin);
    url.searchParams.set("returnOrigin", window.location.origin);
    if (invitationToken) url.searchParams.set("invitationToken", invitationToken);
    return url.toString();
  },
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
  async exchangeOAuthCode(code: string): Promise<AuthResponse> {
    const res = await api.post(API_ROUTES.auth.oauthExchange, { code });
    return res.data.data;
  },
  async me(): Promise<{ user: User }> {
    const res = await api.get(API_ROUTES.auth.me);
    return res.data.data;
  },
  async updateProfile(payload: UpdateProfileRequest): Promise<{ user: User }> {
    const res = await api.patch(API_ROUTES.auth.me, payload);
    return res.data.data;
  },
  async updateAcademicProfile(payload: UpdateAcademicProfileRequest): Promise<{ user: User }> {
    const res = await api.patch(API_ROUTES.auth.academicProfile, payload);
    return res.data.data;
  },
  async addEmail(email: string, purpose: "INSTITUTIONAL" | "CONTACT" = "CONTACT"): Promise<void> {
    await api.post(API_ROUTES.auth.emails, { email, purpose });
  },
  async academicOnboardingOptions(params?: { q?: string; institutionId?: string }): Promise<AcademicOnboardingOptions> {
    const res = await api.get(API_ROUTES.auth.academicOnboardingOptions, { params });
    return res.data.data;
  },
  async changePassword(payload: ChangePasswordRequest): Promise<void> {
    await api.post(API_ROUTES.auth.changePassword, payload);
  },
  async verifyEmail(token: string): Promise<void> {
    await api.post(API_ROUTES.auth.verifyEmail, { token });
  },
  async resendEmailVerification(email: string): Promise<void> {
    await api.post(API_ROUTES.auth.resendEmailVerification, { email });
  },
  async forgotPassword(email: string): Promise<void> {
    await api.post(API_ROUTES.auth.forgotPassword, { email });
  },
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api.post(API_ROUTES.auth.resetPassword, { token, newPassword });
  },
};

export interface UpdateProfileRequest {
  fullName?: string;
  institution?: string;
  researchInterests?: string[];
}

export interface ChangePasswordRequest {
  currentPassword?: string;
  newPassword: string;
}

