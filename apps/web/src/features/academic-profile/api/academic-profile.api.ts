import type {
  AcademicProfile,
  AcademicFeaturedWork,
  AcademicFeaturedWorkKind,
  AdminAcademicVerificationItem,
  AcademicIdentityLink,
  AcademicIdentityProvider,
  AcademicIdentityVisibility,
  AcademicVerificationListResponse,
  AcademicVerificationDecision,
  LecturerEvidenceType,
  LecturerEvidenceEntry,
  LecturerDirectoryResponse,
  InstitutionalEmailVerificationStatus,
  PublicAcademicProfile,
  PublicForumActivity,
  ForumActivityFilter,
  UpdateAcademicProfileDetailsRequest,
  LecturerVerificationSubmitInput,
  LecturerVerificationSubmission,
  AcademicVerificationStatusResponse,
} from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export const academicProfileApi = {
  async stageLecturerEvidence(file: File, institutionId: string, onUploadProgress?: (percent: number) => void, expectedUserId?: string): Promise<{ uploadId: string; status: "UPLOADED"; expiresAt: string }> {
    const form = new FormData(); form.append("institutionId", institutionId); form.append("evidence", file);
    const response = await api.post(`${API_ROUTES.academicProfiles.me}/verification-evidence`, form, { expectedUserId, timeout: 90000, onUploadProgress: event => { if (event.total) onUploadProgress?.(Math.round(event.loaded / event.total * 100)); } });
    return response.data.data;
  },
  async verificationStatus(submissionKey?: string, expectedUserId?: string): Promise<AcademicVerificationStatusResponse> {
    const response = await api.get(`${API_ROUTES.academicProfiles.me}/verification-status`, { expectedUserId, params: { submissionKey }, timeout: 15000 });
    return response.data.data;
  },
  async lecturerTracking(requestId?: string, page = 1): Promise<AcademicVerificationStatusResponse> {
    const response = await api.get(`${API_ROUTES.academicProfiles.me}/verification-status`, { params: { requestId, page }, timeout: 15000 });
    return response.data.data;
  },
  async ownVerificationEvidenceFile(requestId: string, sourceId?: string): Promise<Blob> {
    const response = await api.get(`${API_ROUTES.academicProfiles.me}/verification-requests/${encodeURIComponent(requestId)}/evidence`, { params: { sourceId }, responseType: "blob" });
    return response.data;
  },
  async submitLecturerVerification(input: LecturerVerificationSubmitInput, expectedUserId?: string): Promise<LecturerVerificationSubmission> {
    try {
      const response = await api.post(API_ROUTES.academicProfiles.verificationRequest, input, { expectedUserId, timeout: 20000 });
      return response.data.data;
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (!status || status >= 500 || status === 429) {
        try {
          const current = await academicProfileApi.verificationStatus(input.submissionKey, expectedUserId);
          if (current.submission?.accepted && current.submission.submissionKey === input.submissionKey) return current.submission;
        } catch { /* Unknown outcome: keep draft and the same idempotency key for retry. */ }
      }
      throw error;
    }
  },
  async featuredWorkOptions(kind: AcademicFeaturedWorkKind, q: string, signal?: AbortSignal): Promise<AcademicFeaturedWork[]> {
    const response = await api.get(`${API_ROUTES.academicProfiles.me}/featured-work-options`, { params: { kind, q }, signal });
    return response.data.data;
  },
  async forumActivity(userId: string, filter: ForumActivityFilter, page: number, signal?: AbortSignal): Promise<PublicForumActivity> {
    const response = await api.get(API_ROUTES.academicProfiles.forumActivity(userId), { params: { filter, page }, signal });
    return response.data.data;
  },
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
    identifier: string | null;
    profileUrl: string | null;
    visibility: AcademicIdentityVisibility;
  }>): Promise<AcademicIdentityLink> {
    const response = await api.patch(API_ROUTES.academicProfiles.academicIdentity(identityId), input);
    return response.data.data;
  },
  async deleteAcademicIdentity(identityId: string): Promise<void> {
    await api.delete(API_ROUTES.academicProfiles.academicIdentity(identityId));
  },
  async requestVerification(input: { type?: "POSITION" | "AFFILIATION"; evidenceType?: "INSTITUTIONAL_EMAIL" | "INSTITUTIONAL_PROFILE" | "ORCID" | "EXTERNAL_ACADEMIC_PROFILE" | "DOCUMENT" | "OTHER"; reference?: string; file?: File; additionalFile?: File; sources?: LecturerEvidenceEntry[]; evidenceFiles?: File[]; onUploadProgress?: (percent: number) => void; path?: "STANDARD" | "MANUAL"; primarySourceType?: LecturerEvidenceType; additionalSourceType?: LecturerEvidenceType; additionalReference?: string; institutionId?: string; studentId?: string; staffId?: string; additionalNote?: string; proofType?: "STUDENT_CARD" | "ENROLLMENT" | "STAFF" | "APPOINTMENT" } = {}): Promise<AcademicProfile> {
    const { file, additionalFile, sources, evidenceFiles, onUploadProgress, ...request } = input;
    const form = new FormData();
    form.append("type", request.type || "POSITION");
    form.append("evidenceType", request.evidenceType || "INSTITUTIONAL_EMAIL");
    if (request.reference) form.append("reference", request.reference);
    for (const field of ["institutionId", "studentId", "staffId", "additionalNote", "proofType", "path", "primarySourceType", "additionalSourceType", "additionalReference"] as const) if (request[field]) form.append(field, request[field]);
    if (file) form.append("evidence", file);
    if (additionalFile) form.append("additionalEvidence", additionalFile);
    if (sources) form.append("sources", JSON.stringify(sources));
    for (const evidenceFile of evidenceFiles ?? []) form.append("evidenceFiles", evidenceFile);
    const response = await api.post(API_ROUTES.academicProfiles.verificationRequest, form, { onUploadProgress: event => { if (event.total) onUploadProgress?.(Math.round(event.loaded / event.total * 100)); } });
    return response.data.data;
  },
  async institutionalEmailStatus(): Promise<InstitutionalEmailVerificationStatus> {
    const response = await api.get(API_ROUTES.academicProfiles.institutionalEmailStatus);
    return response.data.data;
  },
  async requestInstitutionalEmailChallenge(email?: string): Promise<{ email: string; expiresAt?: string; resendAt?: string; alreadyVerified?: boolean }> {
    const response = await api.post(API_ROUTES.academicProfiles.institutionalEmailChallenge, email ? { email } : {});
    return response.data.data;
  },
  async verifyInstitutionalEmail(code: string, email?: string): Promise<InstitutionalEmailVerificationStatus> {
    const response = await api.post(API_ROUTES.academicProfiles.institutionalEmailVerify, { code, email });
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
  async listVerifications(status = "ALL", page = 1, pageSize = 10): Promise<AcademicVerificationListResponse> {
    const response = await api.get(API_ROUTES.admin.academicVerifications, { params: { status, page, pageSize } });
    return { data: response.data.data, meta: response.data.meta };
  },
  async decide(requestId: string, input: AcademicVerificationDecision): Promise<AcademicProfile> {
    const response = await api.patch(`${API_ROUTES.admin.academicVerifications}/${requestId}`, input);
    return response.data.data;
  },
  async verificationDetails(requestId: string): Promise<AdminAcademicVerificationItem> {
    const response = await api.get(API_ROUTES.admin.academicVerification(requestId));
    return response.data.data;
  },
  async verificationEvidenceFile(input: string | { requestId: string; sourceId: string }): Promise<Blob> {
    const requestId = typeof input === "string" ? input : input.requestId;
    const response = await api.get(API_ROUTES.academicProfiles.verificationEvidence(requestId), { responseType: "blob", params: typeof input === "string" ? undefined : { sourceId: input.sourceId } });
    return response.data;
  },
};
