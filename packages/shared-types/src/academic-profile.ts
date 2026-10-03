import type { ISODateString } from "./common.js";
import type { AcademicProfileType, AcademicRole, PrimaryPosition, VerificationStatus } from "./user.js";

export type AcademicVerificationStatus = "SELF_DECLARED" | "PENDING" | "VERIFIED" | "REJECTED";
export type AcademicProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
export type ProfileFieldVisibility = "PUBLIC" | "REGISTERED_USERS" | "PRIVATE";
export type AcademicPositionCategory = "STUDENT" | "LECTURER" | "RESEARCH_STAFF" | "UNCLASSIFIED";
export type AcademicPositionSource = "PREDEFINED" | "CUSTOM";
export const ACADEMIC_BIOGRAPHY_MAX_WORDS = 500;
export const ACADEMIC_BIOGRAPHY_MAX_CHARACTERS = 10000;

export function countAcademicBiographyWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export const ACADEMIC_POSITION_OPTIONS = [
  { title: "Student", category: "STUDENT" },
  { title: "Undergraduate Student", category: "STUDENT" },
  { title: "Master's Student", category: "STUDENT" },
  { title: "PhD Student", category: "STUDENT" },
  { title: "PhD Candidate", category: "STUDENT" },
  { title: "Lecturer", category: "LECTURER" },
  { title: "Senior Lecturer", category: "LECTURER" },
  { title: "Faculty Member", category: "LECTURER" },
  { title: "Professor", category: "LECTURER" },
  { title: "Research Assistant", category: "RESEARCH_STAFF" },
  { title: "Research Associate", category: "RESEARCH_STAFF" },
  { title: "Research Scientist", category: "RESEARCH_STAFF" },
  { title: "Research Staff", category: "RESEARCH_STAFF" },
  { title: "Postdoctoral Researcher", category: "RESEARCH_STAFF" },
  { title: "Independent Researcher", category: "UNCLASSIFIED" },
] as const satisfies ReadonlyArray<{ title: string; category: AcademicPositionCategory }>;

export function classifyAcademicPosition(title: string): { category: AcademicPositionCategory; source: AcademicPositionSource } {
  const known = ACADEMIC_POSITION_OPTIONS.find((option) => option.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase());
  return known ? { category: known.category, source: "PREDEFINED" } : { category: "UNCLASSIFIED", source: "CUSTOM" };
}
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
  id?: string;
  institutionName?: string;
  rorId?: string;
  department?: string;
  position?: string;
  positionTitle?: string;
  positionCategory?: AcademicPositionCategory;
  positionSource?: AcademicPositionSource;
  affiliationVerificationStatus?: VerificationStatus;
  positionVerificationStatus?: VerificationStatus;
  startYear?: number;
  startDate?: ISODateString;
  endDate?: ISODateString;
  isCurrent?: boolean;
  isPrimary?: boolean;
  institutionalEmail?: string;
  institutionalEmailVerifiedAt?: ISODateString;
}

export interface AcademicProfilePrivacy {
  orcid: ProfileFieldVisibility;
  researchInterests: ProfileFieldVisibility;
  expertise: ProfileFieldVisibility;
}

export interface AcademicProfileDiscoverability {
  showInResearcherSearch: boolean;
  allowCollaborationRequests: boolean;
}

export type AcademicVerificationRequestType = "POSITION" | "AFFILIATION";
export type AcademicVerificationEvidenceType = "INSTITUTIONAL_EMAIL" | "INSTITUTIONAL_PROFILE" | "ORCID" | "EXTERNAL_ACADEMIC_PROFILE" | "DOCUMENT" | "OTHER";
export interface AcademicVerificationRequest {
  id: string;
  type: AcademicVerificationRequestType;
  targetValue?: string;
  evidenceType: AcademicVerificationEvidenceType;
  reference?: string;
  status: VerificationStatus;
  submittedAt: ISODateString;
  reviewedAt?: ISODateString;
  rejectionReason?: string;
  metadata?: Record<string, unknown>;
  evidenceFileName?: string;
  evidenceMimeType?: string;
  evidenceSizeBytes?: number;
}

export interface AdminAcademicVerificationItem {
  profile: AcademicProfile;
  request: AcademicVerificationRequest;
  history: AcademicVerificationRequest[];
}

export interface AcademicProfileHistoryEntry {
  id: string;
  action: string;
  summary: string;
  createdAt: ISODateString;
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

export type AcademicIdentityProvider = "ORCID" | "OPENALEX" | "GOOGLE_SCHOLAR" | "SEMANTIC_SCHOLAR" | "OTHER";
export type AcademicIdentityStatus = "SELF_DECLARED" | "CONNECTED" | "LINKED" | "INVALID";
export type AcademicIdentityConnectionMethod = "MANUAL" | "OAUTH" | "SYSTEM" | "ADMIN";
export type AcademicIdentityVisibility = "PUBLIC" | "REGISTERED_USERS" | "PRIVATE";

export interface AcademicIdentityLink {
  id: string;
  provider: AcademicIdentityProvider;
  label?: string;
  identifier?: string;
  profileUrl?: string;
  connectionMethod: AcademicIdentityConnectionMethod;
  status: AcademicIdentityStatus;
  visibility: AcademicIdentityVisibility;
  createdAt: ISODateString;
  updatedAt: ISODateString;
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
  academicRole?: AcademicRole;
  academicRoleVerificationStatus?: VerificationStatus | "SELF_DECLARED";
  primaryPosition?: PrimaryPosition;
  positionTitle?: string;
  positionCategory: AcademicPositionCategory;
  positionSource: AcademicPositionSource;
  displayName: string;
  displayNamePolicy?: {
    maxChanges: number;
    remainingChanges: number;
    windowDays: number;
    nextAvailableAt?: ISODateString;
  };
  avatarUrl?: string;
  coverUrl?: string;
  profileVisibility: AcademicProfileVisibility;
  discoverability: AcademicProfileDiscoverability;
  headline?: string;
  biography?: string;
  /** @deprecated Use biography. Kept while existing clients migrate. */
  bio?: string;
  academicTitle?: AcademicTitle;
  affiliation: AcademicAffiliation;
  affiliationHistory: AcademicAffiliation[];
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
  academicIdentityLinks: AcademicIdentityLink[];
  featuredWorks: AcademicFeaturedWork[];
  supportAvailability: AcademicAvailability<ResearchSupportType>;
  reviewAvailability: AcademicAvailability<AcademicReviewType>;
  verificationStatus: AcademicVerificationStatus;
  verificationStatuses?: {
    identity: VerificationStatus;
    email: VerificationStatus;
    affiliation: VerificationStatus;
    position: VerificationStatus;
    orcid: VerificationStatus;
  };
  verification: AcademicVerification;
  verificationEvidence: AcademicVerificationEvidence[];
  verificationRequests: AcademicVerificationRequest[];
  profileHistory: AcademicProfileHistoryEntry[];
  privacy: AcademicProfilePrivacy;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PublicAcademicProfile extends Omit<
  AcademicProfile,
  "id" | "institutionalEmail" | "displayNamePolicy" | "verification" | "verificationEvidence" | "verificationRequests" | "profileHistory" | "privacy" | "affiliation" | "affiliationHistory" | "reviewAvailability"
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

export type ForumActivityFilter = "all" | "topics" | "replies" | "reactions";
export interface PublicForumActivityItem {
  id: string;
  kind: "topic" | "reply" | "reaction";
  topicId: string;
  topicSlug: string;
  topicTitle: string;
  postNumber: number;
  excerpt: string;
  communityName?: string;
  communitySlug?: string;
  createdAt: ISODateString;
  reaction?: string;
  reactionCount: number;
  accepted: boolean;
}
export interface PublicForumActivity {
  stats: {
    joinedAt: ISODateString;
    lastContributionAt?: ISODateString;
    topicsCreated: number;
    repliesCreated: number;
    reactionsGiven: number;
    reactionsReceived: number;
    acceptedResponses: number;
    topicViews: number;
  };
  items: PublicForumActivityItem[];
  topTopics: PublicForumActivityItem[];
  topReplies: PublicForumActivityItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface UpdateAcademicProfileDetailsRequest {
  primaryPosition?: PrimaryPosition;
  positionTitle?: string;
  /** @deprecated Use primaryPosition. Kept only for old clients during migration. */
  academicType?: AcademicProfileType;
  displayName?: string;
  headline?: string;
  biography?: string;
  profileVisibility?: AcademicProfileVisibility;
  discoverability?: Partial<AcademicProfileDiscoverability>;
  privacy?: Partial<AcademicProfilePrivacy>;
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
  data: AdminAcademicVerificationItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface LecturerDirectoryResponse {
  data: CompactAcademicProfile[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
