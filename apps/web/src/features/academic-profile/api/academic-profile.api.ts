import type {
  AcademicProfile,
  AcademicVerificationListResponse,
  LecturerDirectoryResponse,
  InstitutionalEmailVerificationStatus,
  PublicAcademicProfile,
  UpdateAcademicProfileDetailsRequest,
} from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export const academicProfileApi = {
  async mine(): Promise<AcademicProfile> {
    const response = await api.get(API_ROUTES.academicProfiles.me);
    return response.data.data;
  },
  async update(input: UpdateAcademicProfileDetailsRequest): Promise<AcademicProfile> {
    const response = await api.patch(API_ROUTES.academicProfiles.me, input);
    return response.data.data;
  },
  async requestVerification(): Promise<AcademicProfile> {
    const response = await api.post(API_ROUTES.academicProfiles.verificationRequest, {});
    return response.data.data;
  },
  async institutionalEmailStatus(): Promise<InstitutionalEmailVerificationStatus> {
    const response = await api.get(API_ROUTES.academicProfiles.institutionalEmailStatus);
    return response.data.data;
  },
  async requestInstitutionalEmailChallenge(): Promise<{ email: string; expiresAt: string }> {
    const response = await api.post(API_ROUTES.academicProfiles.institutionalEmailChallenge, {});
    return response.data.data;
  },
  async verifyInstitutionalEmail(code: string): Promise<InstitutionalEmailVerificationStatus> {
    const response = await api.post(API_ROUTES.academicProfiles.institutionalEmailVerify, { code });
    return response.data.data;
  },
  async publicProfile(userId: string): Promise<PublicAcademicProfile> {
    const response = await api.get(API_ROUTES.academicProfiles.public(userId));
    return response.data.data;
  },
  async publicProfileByHandle(handle: string): Promise<PublicAcademicProfile> {
    const response = await api.get(API_ROUTES.academicProfiles.byHandle(handle));
    return response.data.data;
  },
  async setPublicHandle(handle: string): Promise<AcademicProfile> {
    const response = await api.patch(API_ROUTES.academicProfiles.publicHandle, { handle });
    return response.data.data;
  },
  async uploadCover(file: File): Promise<AcademicProfile> {
    const form = new FormData();
    form.append("cover", file);
    const response = await api.post(API_ROUTES.academicProfiles.cover, form);
    return response.data.data;
  },
  async removeCover(): Promise<AcademicProfile> {
    const response = await api.delete(API_ROUTES.academicProfiles.cover);
    return response.data.data;
  },
  async cover(url: string): Promise<Blob> {
    const response = await api.get(url, { responseType: "blob" });
    return response.data;
  },
  async lecturers(params: {
    page?: number;
    pageSize?: number;
    expertise?: string;
    institution?: string;
    supportAvailable?: boolean;
    reviewAvailable?: boolean;
    verifiedOnly?: boolean;
  } = {}): Promise<LecturerDirectoryResponse> {
    const response = await api.get(API_ROUTES.academicProfiles.lecturers, { params });
    return { data: response.data.data, meta: response.data.meta };
  },
  async listVerifications(status = "PENDING"): Promise<AcademicVerificationListResponse> {
    const response = await api.get(API_ROUTES.admin.academicVerifications, { params: { status, page: 1, pageSize: 50 } });
    return { data: response.data.data, meta: response.data.meta };
  },
  async decide(profileId: string, input: { decision: "approve"; method?: string; note?: string } | { decision: "reject"; reason: string; note?: string }): Promise<AcademicProfile> {
    const response = await api.patch(`${API_ROUTES.admin.academicVerifications}/${profileId}`, input);
    return response.data.data;
  },
  async verificationDetails(profileId: string): Promise<AcademicProfile> {
    const response = await api.get(API_ROUTES.admin.academicVerification(profileId));
    return response.data.data;
  },
};
