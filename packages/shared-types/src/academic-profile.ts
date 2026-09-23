import type { ISODateString } from "./common.js";
import type { AcademicProfileType } from "./user.js";

export type AcademicVerificationStatus = "SELF_DECLARED" | "PENDING" | "VERIFIED" | "REJECTED";
export type ExternalIdentityProvider = "ORCID" | "GITHUB";
export type ExternalIdentityVerificationStatus = "UNVERIFIED" | "LINKED" | "VERIFIED";

export type ResearchSupportType =
  | "RESEARCH_DIRECTION"
  | "LITERATURE_REVIEW"
  | "RESEARCH_GAP_VALIDATION"
  | "METHODOLOGY"
  | "EXPERIMENT_DESIGN"
  | "DATA_ANALYSIS"
  | "ACADEMIC_WRITING"
  | "PAPER_REVIEW"
  | "SOFTWARE_TECHNICAL_REVIEW";

export type AcademicReviewType =
  | "RESEARCH_PROPOSAL"
  | "LITERATURE_REVIEW"
  | "RESEARCH_GAP"
  | "METHODOLOGY"
  | "EXPERIMENT_REPORT"
  | "MANUSCRIPT"
  | "SOFTWARE_RESEARCH_PROJECT";

export interface AcademicExternalIdentity {
  provider: ExternalIdentityProvider;
  externalId?: string;
  profileUrl?: string;
  verificationStatus: ExternalIdentityVerificationStatus;
}

export interface AcademicAvailability<T extends string> {
  enabled: boolean;
  types: T[];
  preferredTopics: string[];
  note?: string;
}

export interface AcademicProfile {
  id: string;
  userId: string;
  academicType: AcademicProfileType;
  displayName: string;
  bio?: string;
  institution?: string;
  department?: string;
  academicTitle?: string;
  institutionalEmail?: string;
  researchInterests: string[];
  expertiseAreas: string[];
  skills: string[];
  externalIdentities: AcademicExternalIdentity[];
  supportAvailability: AcademicAvailability<ResearchSupportType>;
  reviewAvailability: AcademicAvailability<AcademicReviewType>;
  verificationStatus: AcademicVerificationStatus;
  verificationRequestedAt?: ISODateString;
  verifiedAt?: ISODateString;
  verifiedBy?: string;
  rejectionReason?: string;
  verificationNote?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type PublicAcademicProfile = Omit<
  AcademicProfile,
  "institutionalEmail" | "verifiedBy" | "rejectionReason" | "verificationNote"
>;

export interface UpdateAcademicProfileDetailsRequest {
  academicType?: AcademicProfileType;
  displayName?: string;
  bio?: string;
  institution?: string;
  department?: string;
  academicTitle?: string;
  institutionalEmail?: string;
  researchInterests?: string[];
  expertiseAreas?: string[];
  skills?: string[];
  externalIdentities?: Array<{
    provider: ExternalIdentityProvider;
    externalId?: string;
    profileUrl?: string;
  }>;
  supportAvailability?: AcademicAvailability<ResearchSupportType>;
  reviewAvailability?: AcademicAvailability<AcademicReviewType>;
}

export interface AcademicVerificationListResponse {
  data: AcademicProfile[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
