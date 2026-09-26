import type {
  AcademicProfile,
  AdminAcademicVerificationItem,
  AcademicIdentityLink,
  AcademicIdentityProvider,
  AcademicIdentityVisibility,
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
  async listAcademicIdentities(): Promise<AcademicIdentityLink[]> {
    const response = await api.get(API_ROUTES.academicProfiles.academicIdentities);
    return response.data.data;
  },
  async createAcademicIdentity(input: {
    provider: AcademicIdentityProvider;
    label?: string;
    identifier?: string;
    profileUrl?: string;
    visibility: AcademicIdentityVisibility;
  }): Promise<AcademicIdentityLink> {
    const response = await api.post(API_ROUTES.academicProfiles.academicIdentities, input);
    return response.data.data;
  },
  async updateAcademicIdentity(identityId: string, input: Partial<{
    provider: AcademicIdentityProvider;
    label: string;
    identifier: string;
    profileUrl: string;
    visibility: AcademicIdentityVisibility;
  }>): Promise<AcademicIdentityLink> {
    const response = await api.patch(API_ROUTES.academicProfiles.academicIdentity(identityId), input);
    return response.data.data;
  },
  async deleteAcademicIdentity(identityId: string): Promise<void> {
    await api.delete(API_ROUTES.academicProfiles.academicIdentity(identityId));
  },
  async requestVerification(input: { type?: "POSITION" | "AFFILIATION"; evidenceType?: "INSTITUTIONAL_EMAIL" | "INSTITUTIONAL_PROFILE" | "ORCID" | "EXTERNAL_ACADEMIC_PROFILE" | "DOCUMENT" | "OTHER"; reference?: string; file?: File } = {}): Promise<AcademicProfile> {
    const { file, ...request } = input;
    const form = new FormData();
    form.append("type", request.type || "POSITION");
    form.append("evidenceType", request.evidenceType || "INSTITUTIONAL_EMAIL");
    if (request.reference) form.append("reference", request.reference);
    if (file) form.append("evidence", file);
    const response = await api.post(API_ROUTES.academicProfiles.verificationRequest, form);
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
  async uploadAvatar(file: File): Promise<AcademicProfile> {
    const form = new FormData();
    form.append("avatar", file);
    const response = await api.post(API_ROUTES.academicProfiles.avatar, form);
    return response.data.data;
  },
  async removeAvatar(): Promise<AcademicProfile> {
    const response = await api.delete(API_ROUTES.academicProfiles.avatar);
    return response.data.data;
  },
  async removeCover(): Promise<AcademicProfile> {
    const response = await api.delete(API_ROUTES.academicProfiles.cover);
    return response.data.data;
  },
  async media(url: string): Promise<Blob> {
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
  async decide(requestId: string, input: { decision: "approve"; method?: string; note?: string } | { decision: "reject"; reason: string; note?: string }): Promise<AcademicProfile> {
    const response = await api.patch(`${API_ROUTES.admin.academicVerifications}/${requestId}`, input);
    return response.data.data;
  },
  async verificationDetails(requestId: string): Promise<AdminAcademicVerificationItem> {
    const response = await api.get(API_ROUTES.admin.academicVerification(requestId));
    return response.data.data;
  },
  async verificationEvidenceFile(requestId: string): Promise<Blob> {
    const response = await api.get(API_ROUTES.academicProfiles.verificationEvidence(requestId), { responseType: "blob" });
    return response.data;
  },
};
