import type { ISODateString } from "./common.js";
import type { AcademicProfileType } from "./user.js";

export type AcademicVerificationStatus = "SELF_DECLARED" | "PENDING" | "VERIFIED" | "REJECTED";
export type AcademicProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
export type AcademicTitle =
  | "Lecturer"
  | "Senior Lecturer"
  | "Assistant Professor"
  | "Associate Professor"
  | "Professor"
  | "Research Fellow"
  | "Other";

export type ExternalIdentityProvider =
  | "ORCID" | "GITHUB" | "OPENALEX" | "GOOGLE_SCHOLAR" | "SEMANTIC_SCHOLAR" | "OTHER";
export type ExternalIdentityVerificationStatus = "UNVERIFIED" | "LINKED" | "VERIFIED";
export type ExternalIdentitySource = "SELF_ASSERTED" | "OAUTH" | "SYSTEM" | "ADMIN";

export type ResearchSupportType =
  | "RESEARCH_DIRECTION" | "LITERATURE_REVIEW" | "RESEARCH_GAP_VALIDATION"
  | "RESEARCH_METHODOLOGY" | "EXPERIMENT_DESIGN" | "DATA_ANALYSIS"
  | "ACADEMIC_WRITING" | "SOFTWARE_TECHNICAL_GUIDANCE";

export type AcademicReviewType =
  | "RESEARCH_PROPOSAL" | "LITERATURE_REVIEW" | "THESIS_DRAFT" | "RESEARCH_GAP" | "METHODOLOGY"
  | "EXPERIMENTAL_RESULTS" | "RESEARCH_PAPER" | "SOFTWARE_RESEARCH_PROJECT";

export interface AcademicAffiliation {
  institutionName?: string;
  rorId?: string;
  department?: string;
  position?: string;
  startYear?: number;
  institutionalEmail?: string;
  institutionalEmailVerifiedAt?: ISODateString;
}

export type PublicAcademicAffiliation = Omit<
  AcademicAffiliation,
  "institutionalEmail" | "institutionalEmailVerifiedAt"
>;

export interface AcademicExternalIdentity {
  provider: ExternalIdentityProvider;
  externalId?: string;
  profileUrl?: string;
  status: ExternalIdentityVerificationStatus;
  source: ExternalIdentitySource;
  linkedAt?: ISODateString;
  verifiedAt?: ISODateString;
}

export interface AcademicAvailability<T extends string> {
  enabled: boolean;
  types: T[];
  preferredTopics: string[];
  note?: string;
  updatedAt?: ISODateString;
  acceptedFields?: string[];
  maximumActiveReviews?: number;
  preferredReviewWorkload?: string;
  temporarilyUnavailableUntil?: ISODateString;
  autoRecommendationEnabled?: boolean;
}

export type FeaturedWorkSource = "LUMIGAP" | "ORCID" | "MANUAL";
export interface AcademicFeaturedWork {
  paperId?: string;
  doi?: string;
  title?: string;
  year?: number;
  source: FeaturedWorkSource;
  /** True only when metadata was resolved from the LumiGap Paper collection. */
  canonical: boolean;
}

export type VerificationEvidenceType =
  | "INSTITUTIONAL_EMAIL"
  | "TRUSTED_INSTITUTION"
  | "ORCID"
  | "ORCID_OWNERSHIP"
  | "ORCID_AFFILIATION_MATCH"
  | "TRUSTED_SSO_FACULTY"
  | "INSTITUTION_EMPLOYMENT_API"
  | "INSTITUTION_PROFILE"
  | "ADMIN_REVIEW"
  | "OTHER";
export type VerificationEvidenceStatus = "SUBMITTED" | "VALIDATED" | "REJECTED";
export type VerificationEvidenceSource = "USER" | "SYSTEM" | "ADMIN";
export interface AcademicVerificationEvidence {
  type: VerificationEvidenceType;
  value?: string;
  status: VerificationEvidenceStatus;
  source: VerificationEvidenceSource;
  createdAt: ISODateString;
  validatedAt?: ISODateString;
}

export interface AcademicVerification {
  status: AcademicVerificationStatus;
  requestedAt?: ISODateString;
  verifiedAt?: ISODateString;
  verifiedBy?: string;
  rejectedAt?: ISODateString;
  rejectedBy?: string;
  rejectionReason?: string;
  method?: string;
  adminNote?: string;
}

export type LecturerVerificationDecision = "AUTO_VERIFIED" | "PENDING_REVIEW" | "NOT_ELIGIBLE";

export interface LecturerVerificationPolicyResult {
  decision: LecturerVerificationDecision;
  reasons: string[];
  evidenceTypes: VerificationEvidenceType[];
}

export interface InstitutionalEmailVerificationStatus {
  email?: string;
  verified: boolean;
  verifiedAt?: ISODateString;
  trustedInstitution: boolean;
  institutionName?: string;
}

export interface AcademicProfile {
  id: string;
  userId: string;
  points: number;
  publicHandle?: string;
  academicType: AcademicProfileType;
  displayName: string;
  avatarUrl?: string;
  coverUrl?: string;
  profileVisibility: AcademicProfileVisibility;
  headline?: string;
  biography?: string;
  /** @deprecated Use biography. Kept while existing clients migrate. */
  bio?: string;
  academicTitle?: AcademicTitle;
  affiliation: AcademicAffiliation;
  /** @deprecated Use affiliation.institutionName. */
  institution?: string;
  /** @deprecated Use affiliation.department. */
  department?: string;
  /** @deprecated Use affiliation.institutionalEmail. */
  institutionalEmail?: string;
  researchInterests: string[];
  expertiseAreas: string[];
  skills: string[];
  researchKeywords: string[];
  externalIdentities: AcademicExternalIdentity[];
  featuredWorks: AcademicFeaturedWork[];
  supportAvailability: AcademicAvailability<ResearchSupportType>;
  reviewAvailability: AcademicAvailability<AcademicReviewType>;
  verificationStatus: AcademicVerificationStatus;
  verification: AcademicVerification;
  verificationEvidence: AcademicVerificationEvidence[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PublicAcademicProfile extends Omit<
  AcademicProfile,
  "id" | "institutionalEmail" | "verification" | "verificationEvidence" | "affiliation" | "reviewAvailability"
> {
  affiliation: PublicAcademicAffiliation;
  reviewAvailability: Omit<
    AcademicAvailability<AcademicReviewType>,
    "maximumActiveReviews" | "preferredReviewWorkload" | "temporarilyUnavailableUntil" | "autoRecommendationEnabled"
  >;
}

export interface CompactAcademicProfile {
  userId: string;
  publicHandle?: string;
  displayName: string;
  avatarUrl?: string;
  academicTitle?: AcademicTitle;
  institutionName?: string;
  verificationStatus: AcademicVerificationStatus;
  expertiseAreas: string[];
  supportAvailable: boolean;
  reviewAvailable: boolean;
}

export interface UpdateAcademicProfileDetailsRequest {
  academicType?: AcademicProfileType;
  displayName?: string;
  headline?: string;
  biography?: string;
  profileVisibility?: AcademicProfileVisibility;
  academicTitle?: AcademicTitle | null;
  affiliation?: {
    institutionName?: string;
    rorId?: string;
    department?: string;
    position?: string;
    startYear?: number | null;
    institutionalEmail?: string;
  };
  researchInterests?: string[];
  expertiseAreas?: string[];
  skills?: string[];
  researchKeywords?: string[];
  externalIdentities?: Array<{
    provider: ExternalIdentityProvider;
    externalId?: string;
    profileUrl?: string;
  }>;
  featuredWorks?: Array<{
    paperId?: string;
    doi?: string;
    title?: string;
    year?: number;
    source: FeaturedWorkSource;
  }>;
  supportAvailability?: Omit<AcademicAvailability<ResearchSupportType>, "updatedAt">;
  reviewAvailability?: Omit<AcademicAvailability<AcademicReviewType>, "updatedAt">;
  /** Compatibility inputs accepted while older clients migrate. */
  bio?: string;
  institution?: string;
  department?: string;
  institutionalEmail?: string;
}

export interface AcademicVerificationListResponse {
  data: AcademicProfile[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface LecturerDirectoryResponse {
  data: CompactAcademicProfile[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
