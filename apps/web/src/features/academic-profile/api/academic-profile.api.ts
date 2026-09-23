import type {
  AcademicProfile,
  AcademicVerificationListResponse,
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
  async listVerifications(status = "PENDING"): Promise<AcademicVerificationListResponse> {
    const response = await api.get(API_ROUTES.admin.academicVerifications, { params: { status, page: 1, pageSize: 50 } });
    return { data: response.data.data, meta: response.data.meta };
  },
  async decide(profileId: string, input: { decision: "approve"; note?: string } | { decision: "reject"; reason: string; note?: string }): Promise<AcademicProfile> {
    const response = await api.patch(`${API_ROUTES.admin.academicVerifications}/${profileId}`, input);
    return response.data.data;
  },
};
