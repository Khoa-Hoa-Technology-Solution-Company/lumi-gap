export interface ProjectMemberUserSummary {
  _id: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
}

export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
// Legacy visibility values remain readable during the client migration.
export type ProjectVisibility = "PRIVATE" | "PUBLIC" | "INVITE_ONLY" | "PUBLIC_SUMMARY";
export type ProjectExportPolicy = "ALL_MEMBERS" | "OWNER_ONLY";
export type ProjectAiDataPolicy = "ALLOW_PERSONAL_AI" | "PLATFORM_AI_ONLY" | "DISABLED";
export type ProjectExternalLookupPolicy = "ALLOW_PUBLIC_INDEX" | "LOCAL_CORPUS_ONLY";
export type ResearchApproach = "EXPLORATORY" | "LITERATURE_REVIEW" | "EMPIRICAL" | "UNDECIDED";
export type ProjectRole = "OWNER" | "MEMBER";
export type ProjectMemberStatus = "ACTIVE" | "REMOVED" | "LEFT";
export type ProjectScreeningStatus = "UNDECIDED" | "INCLUDED" | "EXCLUDED" | "MAYBE";
export type ProjectReadingStatus = "NOT_STARTED" | "READING" | "REVIEWED";
export type ProjectExclusionReason =
  | "WRONG_RESEARCH_TOPIC"
  | "WRONG_POPULATION_CONTEXT"
  | "WRONG_METHODOLOGY"
  | "NOT_PEER_REVIEWED"
  | "INSUFFICIENT_RELEVANT_EVIDENCE"
  | "DUPLICATE"
  | "OTHER";
export type ProjectInvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
export type ProjectActivityType =
  | "PROJECT_CREATED"
  | "PROJECT_UPDATED"
  | "MEMBER_INVITED"
  | "MEMBER_JOINED"
  | "MEMBER_REMOVED"
  | "MEMBER_LEFT"
  | "OWNERSHIP_TRANSFERRED"
  | "PAPER_ADDED"
  | "PAPER_REMOVED"
  | "PAPER_SCREENED"
  | "PAPER_READING_STATUS_CHANGED"
  | "EVIDENCE_ADDED"
  | "GAP_CREATED"
  | "GAP_STATUS_CHANGED"
  | "REPORT_CREATED"
  | "REPORT_STATUS_CHANGED"
  | "REPORT_FINALIZED"
  | "PROJECT_ARCHIVED";

export interface ProjectPaperSummary {
  _id: string;
  title: string;
  publicationYear?: number;
  journalName?: string;
  doi?: string;
  hasAiAnalysis?: boolean;
  authors?: Array<{ displayName?: string }>;
  abstractText?: string;
}

export interface IProjectMember {
  targetKind: "User";
  targetId: string | ProjectMemberUserSummary;
  role: ProjectRole;
  status?: ProjectMemberStatus;
  joinedAt?: string;
}

export interface IProjectPaper {
  id: string;
  targetKind: "Paper";
  targetId: string | ProjectPaperSummary;
  screeningStatus: ProjectScreeningStatus;
  readingStatus: ProjectReadingStatus;
  inclusionReason?: string;
  exclusionReason?: string;
  exclusionNote?: string;
  screenedBy?: ProjectMemberUserSummary;
  screenedAt?: string;
  notes?: string;
  evidenceCount: number;
  addedBy?: ProjectMemberUserSummary;
  addedAt: string;
  updatedAt: string;
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  invitedUser?: ProjectMemberUserSummary;
  email: string;
  message?: string;
  status: ProjectInvitationStatus;
  expiresAt: string;
  createdAt: string;
  lastSentAt?: string;
  resendAvailableAt?: string;
}

export interface IncomingProjectInvitation {
  id: string;
  invitedEmail?: string;
  projectId: string;
  projectTitle: string;
  projectDescription?: string;
  inviterName?: string;
  role: ProjectRole;
  status: ProjectInvitationStatus;
  message?: string;
  expiresAt: string;
  createdAt: string;
}

export interface ProjectInvitationPreview {
  id: string;
  projectId: string;
  projectTitle: string;
  projectDescription?: string;
  invitedEmail: string;
  currentUserEmail?: string;
  inviterName: string;
  role: ProjectRole;
  message?: string;
  status: ProjectInvitationStatus;
  expiresAt: string;
  createdAt: string;
  authenticated: boolean;
  emailMatches: boolean;
  alreadyMember: boolean;
}

export type MentorshipRequestStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "CANCELED_BY_PROJECT" | "EXPIRED" | "CLOSED_CAPACITY_REACHED" | "SUPERSEDED";
export type MentorRole = "UNASSIGNED" | "PRIMARY" | "SECONDARY";

export interface MentorProspectiveAccessPolicy {
  preset: import("./mentor-access.js").MentorPreset;
  permissions: import("./mentor-access.js").MentorPermission[];
  expiresAt: string | null;
  scopeNote?: string;
  approvedAt?: string;
  approvedById?: string;
  policyHash?: string;
}

export interface MentorRecruitmentProgressSummary {
  completed?: string;
  inProgress?: string;
  notStarted?: string;
  challenges?: string;
  feedbackNeeded?: string;
  upcomingMilestone?: string;
}

export interface MentorRecruitmentProfile {
  researchProblem?: string;
  researchObjectives?: string[];
  researchQuestions?: string[];
  expectedOutcomes?: string;
  expectedDuration?: string;
  expectedFrequency?: string;
  workingMode?: string;
  mentoringGoals?: string;
  progressSummary?: MentorRecruitmentProgressSummary;
  recruitingRoles?: ("PRIMARY" | "SECONDARY")[];
  sharedAttachmentIds?: string[];
  prospectiveAccess?: MentorProspectiveAccessPolicy | null;
  researchSupportNeeds?: import("./mentor-recommendation.js").ResearchSupportNeed[];
  selectedChallenges?: import("./mentor-recommendation.js").StudentResearchChallengeId[];
  needsUpdatedAt?: string;
}

export interface ProjectMemberMentorshipConsent {
  projectId: string;
  userId: string;
  shared: boolean;
  roleNote?: string;
  profileVisibility: "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
  effectiveVisibleToLecturers: boolean;
  updatedAt?: string;
}

export interface TeamDossierConsentedMember {
  userId: string;
  publicHandle?: string;
  fullName: string;
  avatarUrl?: string;
  projectRole: "OWNER" | "MEMBER";
  researchResponsibility?: string;
  academicRole?: string;
  institutionName?: string;
  department?: string;
  programName?: string;
  academicYearLabel?: string;
  headline?: string;
  shortBio?: string;
  researchInterests: string[];
  skills: string[];
  researchMethods: string[];
  featuredWorks: DossierFeaturedWork[];
  affiliationVerified: boolean;
}

export interface ResearchTeamDossier {
  projectId: string;
  discovery: "CLOSED" | "SEEKING_MENTOR";
  discoveryVersion: number;
  previewToken: string;
  overview: {
    title: string;
    summary: string;
    researchField?: string;
    researchAreas: string[];
    researchClassification?: import("./research-classification.js").ResearchClassification;
    methodologies: string[];
    stage: ProjectStatus;
    researchProblem?: string;
    researchObjectives: string[];
    researchQuestions: string[];
    expectedOutcomes?: string;
    expectedDuration?: string;
  };
  team: {
    teamMemberCount: number;
    consentedMembers: TeamDossierConsentedMember[];
    unsharedMemberCount: number;
  };
  progress: MentorRecruitmentProgressSummary & {
    stage: ProjectStatus;
    hasSharedProgress: boolean;
  };
  needs: {
    supportTypes: import("./academic-profile.js").ResearchSupportType[];
    expertise: string[];
    methodologies: string[];
    mentoringNeeds: string;
    researchSupportNeeds?: import("./mentor-recommendation.js").ResearchSupportNeed[];
    availableRoles: MentorRole[];
    recruitingRoles: ("PRIMARY" | "SECONDARY")[];
    expectedDuration?: string;
    expectedFrequency?: string;
    workingMode?: string;
    mentoringGoals?: string;
  };
  collaborationTerms: {
    sharedAttachments: MentorshipAttachment[];
    prospectiveAccess: MentorProspectiveAccessPolicy | null;
    canDirectPropose: boolean;
    directProposeBlockedReason?: string;
    confidentialityNotice: string;
    beforeAcceptNotice: string;
  };
  viewerState?: {
    canPropose: boolean;
    blockedReason?: string;
    existingRequestId?: string;
    existingRequestDirection?: "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT";
    existingRequestStatus?: MentorshipRequestStatus;
    existingRelationshipId?: string;
  };
}

export interface MentorshipProposalAvailability {
  frequency?: string;
  duration?: string;
  mode?: string;
  note?: string;
}

export interface MentorshipProposalTerms {
  proposalKind: "FORMAL_PROPOSAL" | "INVITATION" | "COUNTER_PROPOSAL";
  supportAreas: import("./academic-profile.js").ResearchSupportType[];
  needConfirmations?: import("./mentor-recommendation.js").NeedScopeConfirmation[];
  availability?: MentorshipProposalAvailability;
  prospectivePolicyHash?: string;
  prospectivePolicyVersion?: number;
  consentConfirmedAt?: string;
  consentActorId?: string;
  changeSummary?: string;
  requestedAccessNote?: string;
}

export interface MentorshipProposalInput {
  mentorRole: MentorRole;
  supportAreas: import("./academic-profile.js").ResearchSupportType[];
  availability?: MentorshipProposalAvailability;
  message: string;
  consentConfirmed: true;
  expectedDiscoveryVersion: number;
  expectedPolicyHash: string;
  idempotencyKey: string;
}

export interface MentorshipCounterProposalInput {
  mentorRole: MentorRole;
  supportAreas: import("./academic-profile.js").ResearchSupportType[];
  availability?: MentorshipProposalAvailability;
  message: string;
  changeSummary: string;
  access?: import("./mentor-access.js").MentorPolicyInput;
  requestedAccessNote?: string;
  expectedProposalVersion: number;
  idempotencyKey: string;
}

export interface MentorshipRequestMessageItem {
  id: string;
  requestId: string;
  authorId: string;
  authorName: string;
  authorRole: "OWNER" | "LECTURER";
  body: string;
  createdAt: string;
}

export interface MentorshipProposalHistoryEntry {
  id: string;
  proposalVersion: number;
  direction: "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT";
  mentorRole: MentorRole;
  status: MentorshipRequestStatus;
  requestedByName?: string;
  changeSummary?: string;
  supportAreas?: import("./academic-profile.js").ResearchSupportType[];
  availability?: MentorshipProposalAvailability;
  accessPreset?: import("./mentor-access.js").MentorPreset;
  accessPermissionCount?: number;
  createdAt: string;
}
export interface MentorRoleProposal {
  id: string; status: "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "SUPERSEDED"; createdAt: string;
  assignments: Array<{ relationshipId: string; mentorId: string; fullName: string; from: MentorRole; to: MentorRole }>;
  confirmedBy: string[]; canConfirm: boolean; canCancel: boolean;
}
export interface MentorRolesWorkspace {
  canPropose: boolean;
  mentors: Array<{ relationshipId: string; mentorId: string; fullName: string; role: MentorRole }>;
  proposals: MentorRoleProposal[];
}
export type MentorPlanCommand = { expectedVersion: number } & (
  { action: "add"; mentorUserId: string; mentorRole: MentorRole } |
  { action: "remove"; candidateId: string } |
  { action: "move"; candidateId: string; offset: -1 | 1 } |
  { action: "configure"; parallelInvitations: boolean } |
  { action: "restart" }
);
export interface MentorPlanCandidate {
  id: string; mentorUserId: string; fullName: string; mentorRole: MentorRole; priority: number;
  status: string; requestId?: string; canSend: boolean; unavailableReason?: string;
}
export interface MentorRecruitmentPlan {
  id?: string; version: number; parallelInvitations: boolean; autoSend: false;
  closedRoles: MentorRole[]; candidates: MentorPlanCandidate[]; positions: MentorPositions; canManage: boolean;
  currentMentors: { mentorRole: MentorRole; fullName: string }[];
  currentInvitations: { mentorRole: MentorRole; fullName: string; expiresAt?: string }[];
}
export interface MentorPosition {
  role: MentorRole; status: "LOCKED" | "VACANT" | "INVITING" | "ASSIGNED";
  pendingRequests: number; relationshipId?: string;
}
export type MentorPositions = Record<MentorRole, MentorPosition>;
export interface MentorshipAttachment { id: string; fileName: string; mimeType: string; byteSize: number }
export interface MentorshipDraft {
  message: string; mentorRole: MentorRole; attachments: MentorshipAttachment[]; version: number; updatedAt?: string;
}
export type MentorRelationshipStatus = "ACTIVE" | "ENDED";
export interface MentorshipPerson extends ProjectMemberUserSummary {
  academicRole?: string;
  institutionName?: string;
  positionTitle?: string;
  verifiedLecturer?: boolean;
}
export interface MentorProjectPreview {
  supportTypes?: import("./academic-profile.js").ResearchSupportType[];
  researchClassification?: import("./research-classification.js").ResearchClassification;
  id: string; title: string; summary: string; researchField?: string;
  /** Active team size, including the owner once. No member identities are shared. */
  teamMemberCount?: number;
  stage: ProjectStatus; expertise: string[]; discovery: "CLOSED" | "SEEKING_MENTOR";
  researchAreas: string[]; mentoringNeeds: string; methodologies?: string[];
  availableRoles?: MentorRole[];
  hasProspectiveAccessPolicy?: boolean;
  expectedDuration?: string;
  expectedFrequency?: string;
  recruitingRoles?: ("PRIMARY" | "SECONDARY")[];
}
export type DossierProvenance =
  | "SELF_DECLARED"
  | "VERIFIED_AFFILIATION"
  | "VERIFIED_IDENTITY"
  | "PUBLIC_WORK"
  | "PROJECT_METADATA";

export interface DossierPublicLink {
  provider: string;
  label?: string;
  profileUrl: string;
  verified: boolean;
}

export interface DossierFeaturedWork {
  id: string;
  kind: string;
  title: string;
  year?: number;
  doi?: string;
  provenance: DossierProvenance;
}

export interface DossierStudentProfile {
  _id: string;
  fullName: string;
  avatarUrl?: string;
  academicRole?: string;
  institutionName?: string;
  department?: string;
  programName?: string;
  academicYearLabel?: string;
  positionTitle?: string;
  headline?: string;
  shortBio?: string;
  researchInterests: string[];
  skills: string[];
  expertiseAreas: string[];
  featuredWorks: DossierFeaturedWork[];
  publicLinks: DossierPublicLink[];
  affiliationVerified: boolean;
  verifiedLecturer?: boolean;
  provenance: DossierProvenance[];
  redacted?: boolean;
}

export interface DossierTeamMemberSummary {
  _id: string;
  fullName: string;
  avatarUrl?: string;
  projectRole: "OWNER" | "MEMBER";
  academicRole?: string;
  institutionName?: string;
  programName?: string;
  academicYearLabel?: string;
  skills: string[];
  researchInterests: string[];
  affiliationVerified: boolean;
  provenance: DossierProvenance;
}

export interface DossierCompetencyItem {
  name: string;
  category: "METHOD" | "SKILL" | "TOOL";
  provenance: DossierProvenance;
}

export interface DossierCompetencies {
  researchMethods: DossierCompetencyItem[];
  technicalSkills: DossierCompetencyItem[];
  researchTools: DossierCompetencyItem[];
  experienceHighlights: DossierFeaturedWork[];
  teamStrengthsNote?: string;
  integrityNotice: string;
}

export interface DossierExpectations {
  supportAreas: string[];
  expectedPeriod?: string;
  meetingFrequency?: string;
  expectedMilestone?: string;
  preferredChannel?: string;
  proposedNote?: string;
}

export interface DossierAccessSummary {
  mentorRole: MentorRole;
  preset: import("./mentor-access.js").MentorPreset;
  permissionCount: number;
  permissions: import("./mentor-access.js").MentorPermission[];
  sharedResourceSummary: string[];
  expiresAt?: string | null;
  responseDeadline?: string;
  beforeAcceptNotice: string;
  afterAcceptNotice: string;
}

export interface InvitationDossier {
  /** Compact invitation; older full dossiers retain their original presentation. */
  presentation?: "BRIEF";
  senderDisplayName?: string;
  additionalMessage?: string;
  version: 1;
  generatedAt: string;
  project: {
    id: string;
    title: string;
    abstract: string;
    abstractApproved: boolean;
    researchField?: string;
    researchAreas: string[];
    keywords: string[];
    stage: ProjectStatus;
    primaryObjective?: string;
    teamMemberCount: number;
  };
  team: {
    teamMemberCount: number;
    representative: DossierStudentProfile | null;
    sharedMembersCount: number;
    sharedMembers: DossierTeamMemberSummary[];
    teamOverviewNote?: string;
    privacyRedactedCount: number;
  };
  competencies: DossierCompetencies;
  whyThisLecturer: {
    message: string;
    lecturerName?: string;
    lecturerInstitution?: string;
  };
  expectations: DossierExpectations;
  accessPreview: DossierAccessSummary;
}

export interface InvitationDossierInput {
  presentation?: "BRIEF";
  researchField?: string;
  researchSummary?: string;
  additionalMessage?: string;
  sharingConfirmed?: boolean;
  approvedObjective?: string;
  keywords?: string[];
  shareRepresentativeProfile?: boolean;
  shareRepresentativeLinks?: boolean;
  shareRepresentativeWorks?: boolean;
  shareTeamOverview?: boolean;
  shareCompetencies?: boolean;
  teamOverviewNote?: string;
  researchMethods?: string[];
  researchTools?: string[];
  expectations?: DossierExpectations;
}

export interface PreviewInvitationDossierRequest {
  mentorUserId: string;
  message?: string;
  mentorRole?: MentorRole;
  access?: import("./mentor-access.js").MentorPolicyInput;
  dossier?: InvitationDossierInput;
}

export interface MentorDiscoverySettings extends MentorProjectPreview {
  invitationContext?: MentorInvitationContext;
  /** Owner-only composing defaults. Never part of the public proposal preview. */
  invitationDefaults?: { summary: string; goal: string; keywords: string[]; researchField?: string };
  /** Opaque revision of the approved invitation brief, not an access credential. */
  previewToken?: string;
  /** Optimistic version for owner-only discovery edits; excluded from public opportunity DTOs. */
  version: number;
  /** Sender identity as it will appear to the lecturer, respecting profile visibility. */
  invitationSender?: MentorshipPerson;
  /** Structured owner-approved recruitment profile and prospective access policy. */
  mentorshipProfile?: MentorRecruitmentProfile;
  /** Shared intro files explicitly approved for mentor discovery. */
  sharedAttachments?: MentorshipAttachment[];
  /** Owner's view of per-member contextual sharing consent status (read-only for other members). */
  memberConsentSummary?: {
    totalMembers: number;
    consentedCount: number;
    members: Array<{
      userId: string;
      fullName: string;
      role: "OWNER" | "MEMBER";
      consented: boolean;
      profileVisibility: "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
      effectiveVisibleToLecturers: boolean;
      roleNote?: string;
    }>;
  };
  /** Server-sanitized defaults for composing the mentorship invitation dossier. */
  dossierDefaults?: {
    representative: DossierStudentProfile | null;
    shareableMemberCount: number;
    keywords: string[];
    competencies: DossierCompetencies;
    defaultExpectations: DossierExpectations;
  };
}
/** Owner-visible fields approved by the send action; token prevents stale context. */
export interface MentorInvitationContext {
  title: string;
  researchField?: string;
  researchAreas: string[];
  senderDisplayName: string;
  memberCount: number;
  token: string;
}
export interface MentorshipInfoRequest {
  message: string;
  requestedAt: string;
  requestedByName?: string;
}
export interface MentorshipActions {
  accept: boolean; decline: boolean; cancel: boolean; end: boolean; openProject: boolean; requestInfo?: boolean; counterPropose?: boolean; clarify?: boolean;
}
export interface MentorshipRequest {
  /** Derived by the API from the authenticated account and current project ownership. */
  viewer?: "SENDER" | "RECIPIENT" | "TEAM";
  /** Older invitations have no recoverable original snapshot. */
  legacyPreview?: boolean;
  reviewRequired?: boolean;
  kind: "REQUEST";
  /** Approved brief revision to recheck when accepting from the web UI. */
  previewToken?: string;
  proposalVersion?: number;
  previousRequestId?: string;
  terms?: MentorshipProposalTerms;
  clarificationCount?: number;
  clarificationMessages?: MentorshipRequestMessageItem[];
  revisionHistory?: MentorshipProposalHistoryEntry[];
  acceptBlockedReason?: string;
  accessPolicy?: import("./mentor-access.js").MentorAccessPolicy;
  mentorRole?: MentorRole;
  attachments?: MentorshipAttachment[];
  dossier?: InvitationDossier;
  infoRequest?: MentorshipInfoRequest;
  direction: "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT";
  expiresAt?: string;
  respondedAt?: string;
  id: string;
  projectId: string;
  project?: MentorProjectPreview;
  mentorUser: MentorshipPerson;
  requestedBy: MentorshipPerson;
  status: MentorshipRequestStatus;
  message?: string;
  responseNote?: string;
  closeReason?: string;
  relationshipId?: string;
  currentRelationship?: {
    id: string;
    status: MentorRelationshipStatus;
    mentorRole?: MentorRole;
    startedAt: string;
    endedAt?: string;
    endReason?: string;
    accessEffective: boolean;
    accessExpiresAt?: string | null;
    accessRevokedAt?: string | null;
  };
  actions: MentorshipActions;
  createdAt: string;
  updatedAt: string;
}
export interface MentorRelationship {
  kind: "RELATIONSHIP";
  accessPolicy?: import("./mentor-access.js").MentorAccessPolicy;
  mentorRole?: MentorRole;
  id: string; projectId: string; sourceRequestId: string;
  project?: MentorProjectPreview; mentorUser: MentorshipPerson;
  status: MentorRelationshipStatus; startedAt: string;
  endedAt?: string; endedById?: string; endReason?: string;
  actions: MentorshipActions; createdAt: string; updatedAt: string;
}
export interface AcademicPageMeta { page: number; pageSize: number; total: number; totalPages: number }
export interface AcademicSupportSearch {
  q?: string; page?: number; pageSize?: number; institution?: string;
  area?: string; interest?: string; specialization?: string; technology?: string; position?: string;
  view?: "all" | "incoming" | "outgoing" | "active" | "history";
}
export type MentorSuggestionStatus = "PENDING" | "INVITED" | "DISMISSED";
export type MentorSuggestionScope = "pending" | "all" | "mine" | "history";
export interface MentorSuggestion {
  id: string; projectId: string; mentorUser: MentorshipPerson; suggestedBy: MentorshipPerson;
  message: string; status: MentorSuggestionStatus; createdAt: string;
  expertiseAreas?: string[];
  acceptingMentorships?: boolean;
  resolvedAt?: string;
  resolvedBy?: MentorshipPerson;
  requestId?: string;
  requestStatus?: MentorshipRequestStatus;
  inRecruitmentPlan?: boolean;
  plannedRole?: MentorRole;
  hasPendingRequest?: boolean;
  hasActiveRelationship?: boolean;
  dismissReason?: string;
}
export interface MentorSuggestionsResponse {
  items: MentorSuggestion[];
  meta: AcademicPageMeta;
  counts?: { pending: number; total: number; mine: number; minePending: number };
}
export interface MentorshipCollection {
  requests: MentorshipRequest[]; relationships: MentorRelationship[];
  counts: { pending: number; incoming: number; active: number };
  policy: { maxActiveMentors: number; maxPendingRequests: number | null; maxPendingPerRole?: number; expiryDays?: number | null };
  positions?: MentorPositions;
  requestMeta: AcademicPageMeta; relationshipMeta: AcademicPageMeta;
}
export interface AvailableMentor extends MentorshipPerson {
  isDemo?: boolean;
  mentorshipStatus?: "PENDING" | "ACTIVE";
  pendingRequestId?: string;
  pendingRequestDirection?: "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT";
  matchExplanation?: { relevance: "HIGHLY_RELEVANT" | "RELEVANT" | "POTENTIAL"; topics: string[]; subfields: string[]; fields: string[]; skills: string[]; interests: string[]; supervisionTopics?: string[]; support: string[]; gaps: string[] };
  recommendation?: import("./mentor-recommendation.js").MentorRecommendationSummary;
  capacityReached?: boolean;
  remainingSlots?: number | null;
  maxActiveProjects?: number | null;
  activeProjectCount?: number;
  expertiseAreas: string[]; researchInterests: string[]; matchedTerms: string[];
  researchSpecializations?: string[]; skills?: string[]; researchMethods?: string[]; researchKeywords?: string[];
  supportTypes?: import("./academic-profile.js").ResearchSupportType[];
  preferredRoles?: ("PRIMARY" | "SECONDARY")[];
  expectedFrequency?: string;
  expectedDuration?: string;
  communicationMode?: string;
  sameInstitution: boolean; acceptingMentorships: true;
}
export interface MentoringPreferences {
  acceptingMentorships: boolean;
  effectiveAcceptingMentorships?: boolean;
  capacityReached?: boolean;
  canEnable: boolean; emailEnabled: boolean; locale: "en" | "vi";
  maxActiveProjects?: number | null;
  externalGroupCount?: number | null;
  activeProjectCount?: number;
  remainingSlots?: number | null;
  capacityUpdatedAt?: string;
  supportTypes?: import("./academic-profile.js").ResearchSupportType[];
  preferredTopics?: string[];
  preferredRoles?: ("PRIMARY" | "SECONDARY")[];
  expectedFrequency?: string;
  expectedDuration?: string;
  communicationMode?: string;
  note?: string;
  researchMethods?: string[];
  emailDelivery?: { status: "READY" | "NOT_CONFIGURED" | "TEST_ADDRESS"; recipient: string };
}
export interface RequestMentorRelationshipRequest {
  mentorUserId: string;
  message: string;
  idempotencyKey?: string;
  mentorRole?: MentorRole;
  attachmentIds?: string[];
  access?: import("./mentor-access.js").MentorPolicyInput;
  expectedPreviewToken?: string;
  candidateId?: string;
  expectedPlanVersion?: number;
  dossier?: InvitationDossierInput;
}

export interface RespondMentorRelationshipRequest {
  note?: string;
}

export interface ProjectActivity {
  id: string;
  projectId: string;
  type: ProjectActivityType;
  actor?: ProjectMemberUserSummary;
  entityKind?: string;
  entityId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface IProject {
  researchClassification?: import("./research-classification.js").ResearchClassification;
  _id: string;
  title: string;
  description?: string;
  researchField?: string;
  researchAreas?: string[];
  keywords?: string[];
  researchApproach?: ResearchApproach;
  publicSummary?: string;
  mentorshipDiscovery?: "CLOSED" | "SEEKING_MENTOR";
  version?: number;
  screeningMode?: "EXPLORATORY" | "INDEPENDENT";
  screeningBlinded?: boolean;
  screeningCriteria?: {
    inclusion: string[];
    exclusion: string[];
  };
  status: ProjectStatus;
  visibility: ProjectVisibility;
  exportPolicy?: ProjectExportPolicy;
  aiDataPolicy?: ProjectAiDataPolicy;
  externalLookupPolicy?: ProjectExternalLookupPolicy;
  ownerId: string;
  owner?: ProjectMemberUserSummary;
  accessRole?: ProjectRole;
  isPublicSummary?: boolean;
  members: IProjectMember[];
  papers: IProjectPaper[];
  pendingInvitations?: ProjectInvitation[];
  recentActivity?: ProjectActivity[];
  memberCount: number;
  paperCount: number;
  archivedAt?: string;
  deletedAt?: string;
  purgeAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const PROJECT_TRASH_RETENTION_DAYS = 30;

export interface TrashedProjectItem {
  _id: string;
  title: string;
  description?: string;
  researchField?: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  memberCount: number;
  paperCount: number;
  deletedAt: string;
  purgeAt: string;
  daysRemaining: number;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSoftDeleteResponse {
  deleted: boolean;
  softDeleted: boolean;
  deletedAt: string;
  purgeAt: string;
  retentionDays: number;
}

export interface CreateProjectRequest {
  researchClassification?: import("./research-classification.js").ResearchClassificationInput;
  title: string;
  description?: string;
  researchField?: string;
  keywords?: string[];
  status?: Exclude<ProjectStatus, "ARCHIVED">;
  visibility?: ProjectVisibility;
  researchAreas?: string[];
  researchApproach?: ResearchApproach;
  idempotencyKey?: string;
}

export interface UpdateProjectRequest {
  researchClassification?: import("./research-classification.js").ResearchClassificationInput;
  title?: string;
  description?: string;
  researchField?: string | null;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  exportPolicy?: ProjectExportPolicy;
  aiDataPolicy?: ProjectAiDataPolicy;
  externalLookupPolicy?: ProjectExternalLookupPolicy;
  publicSummary?: string;
  researchAreas?: string[];
  keywords?: string[];
  researchApproach?: ResearchApproach;
  expectedVersion?: number;
  inclusionCriteria?: string[];
  exclusionCriteria?: string[];
}

export interface ProjectTeamPage {
  members: IProjectMember[];
  invitations: ProjectInvitation[];
  memberMeta: AcademicPageMeta;
  invitationMeta: AcademicPageMeta;
}

export interface AddProjectMemberRequest {
  targetKind: "User";
  targetId: string;
  role: ProjectRole;
}

export interface AddProjectPaperRequest {
  paperId: string;
  proposalReason?: string;
}

export interface UpdateProjectPaperRequest {
  expectedUpdatedAt?: string;
  screeningStatus?: ProjectScreeningStatus;
  readingStatus?: ProjectReadingStatus;
  inclusionReason?: string | null;
  exclusionReason?: string | null;
  exclusionNote?: string | null;
  notes?: string | null;
}

export interface InviteProjectMemberRequest {
  userId?: string;
  email?: string;
  message?: string;
}

export type ProjectContributionRole =
  | "SUPERVISION"
  | "METHODOLOGY"
  | "VALIDATION"
  | "SOFTWARE"
  | "CONCEPTUALIZATION"
  | "WRITING_ORIGINAL_DRAFT"
  | "WRITING_REVIEW_EDITING"
  | "PROJECT_ADMINISTRATION"
  | "OTHER";

export type ProjectContributionProposalStatus =
  | "PENDING_CONFIRMATION"
  | "CONFIRMING"
  | "CONFIRMED"
  | "REJECTED"
  | "WITHDRAWN";

export interface ProjectContributionActor {
  _id: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ProjectContributionHistoryEntry {
  action: "PROPOSED" | "CONFIRMED" | "REJECTED" | "WITHDRAWN";
  actorId: string | ProjectContributionActor;
  note?: string;
  createdAt: string;
}

export interface ProjectContributionProposal {
  _id: string;
  projectId: string;
  contributorId: string | ProjectContributionActor;
  roles: ProjectContributionRole[];
  description: string;
  evidence?: string;
  visibility: "PUBLIC" | "PRIVATE";
  status: ProjectContributionProposalStatus;
  confirmationRequiredFrom: "OWNER" | "CONTRIBUTOR";
  proposedBy: string | ProjectContributionActor;
  confirmedBy?: string | ProjectContributionActor;
  confirmedAt?: string;
  rejectedBy?: string | ProjectContributionActor;
  rejectedAt?: string;
  rejectionReason?: string;
  history: ProjectContributionHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ProposeProjectContributionRequest {
  contributorId: string;
  roles: ProjectContributionRole[];
  description: string;
  evidence?: string;
  visibility?: "PUBLIC" | "PRIVATE";
}

export interface ResolveProjectContributionRequest {
  note?: string;
}

export type ProjectChatRole = "user" | "assistant";
export type ProjectChatScope = "private" | "team";
export type ProjectChatCitationSourceKind = "METADATA" | "ABSTRACT" | "FULLTEXT";
export type ProjectChatIntent = "capability" | "grounded" | "methodology" | "project_context";
export type ProjectChatRetrievalMode = "semantic" | "hybrid" | "lexical_fallback" | "direct" | "none";

export interface ProjectChatCitation {
  citationNumber: number | null;
  paperId: string;
  title: string;
  authors: string[];
  publicationYear?: number | null;
  journalName?: string | null;
  doi?: string | null;
  sourceKind: ProjectChatCitationSourceKind;
  excerpt?: string | null;
  pageNumber?: number | null;
  chunkId?: string | null;
  screeningStatus?: ProjectScreeningStatus | null;
  available: boolean;
}

export interface ProjectChatRetrievalMeta {
  intent: ProjectChatIntent;
  retrievalMode: ProjectChatRetrievalMode;
  totalLibraryCount: number;
  eligibleCount: number;
  retrievedCount: number;
  admittedCount: number;
  coverage: {
    fullText: number;
    abstract: number;
    metadataOnly: number;
  };
  truncatedAbstracts: number;
  droppedPapers: number;
  hasReliableCitations: boolean;
}

export interface ProjectChatSourcesOverview {
  totalLibraryCount: number;
  eligibleCount: number;
  includedCount: number;
  excludedCount: number;
  pendingCount: number;
  coverage: {
    fullTextIndexed: number;
    abstractAvailable: number;
    metadataOnly: number;
    withEmbeddings: number;
  };
  aiDataPolicy: ProjectAiDataPolicy;
  externalLookupPolicy: ProjectExternalLookupPolicy;
}

export interface ProjectChatMessage {
  id: string;
  projectId: string;
  userId: string;
  scope: ProjectChatScope;
  role: ProjectChatRole;
  content: string;
  citedPaperIds: string[];
  citations?: ProjectChatCitation[];
  retrievalMeta?: ProjectChatRetrievalMeta | null;
  clientKey?: string;
  requester?: ProjectTeamChatSender;
  creditCost?: number;
  isPinned?: boolean;
  pinnedAt?: string;
  pinnedBy?: ProjectTeamChatSender;
  createdAt: string;
}

export interface SendProjectChatMessageRequest {
  message: string;
  scope?: ProjectChatScope;
  clientKey?: string;
}

export interface SendProjectChatMessageResponse {
  scope: ProjectChatScope;
  answer: string;
  citedPaperIds: string[];
  citations?: ProjectChatCitation[];
  retrievalMeta?: ProjectChatRetrievalMeta;
  creditCost: number;
  userMessage?: ProjectChatMessage;
  assistantMessage?: ProjectChatMessage;
}

export interface ProjectChatHistoryResponse {
  messages: ProjectChatMessage[];
}

export interface PinProjectChatMessageResponse {
  message: ProjectChatMessage;
}

export type ProjectChatEventType = "ready" | "message.created" | "message.updated";

export interface ProjectChatEvent {
  type: ProjectChatEventType;
  projectId: string;
  scope: ProjectChatScope;
  message?: ProjectChatMessage;
  occurredAt: string;
}

export interface ProjectTeamChatSender {
  id: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ProjectTeamChatMessage {
  id: string;
  projectId: string;
  sender: ProjectTeamChatSender;
  content: string;
  readBy: ProjectTeamChatSender[];
  readCount: number;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: ProjectTeamChatSender;
  deleteReason?: string;
  createdAt: string;
  clientKey?: string;
  replyTo?: { id: string; content: string; sender: ProjectTeamChatSender; isDeleted: boolean };
  reference?: ProjectChatReference;
}

/** References never grant access; resolve their display metadata through the project API. */
export interface ProjectChatReference { kind: "PAPER" | "TASK" | "MANUSCRIPT_SNAPSHOT" | "SUBMISSION_REVISION"; id: string }
export interface ProjectChatReferenceCard extends ProjectChatReference {
  title: string; subtitle?: string; status?: string; version?: number; href: string;
}

export interface SendProjectTeamChatMessageRequest {
  content: string;
  clientKey?: string;
  replyToId?: string;
  reference?: ProjectChatReference;
}

export interface SendProjectTeamChatMessageResponse {
  message: ProjectTeamChatMessage;
}

export interface ProjectTeamChatHistoryResponse {
  messages: ProjectTeamChatMessage[];
}

export type ProjectTeamChatEventType = "ready" | "message.created" | "message.updated" | "message.deleted";

export interface ProjectTeamChatEvent {
  type: ProjectTeamChatEventType;
  projectId: string;
  message?: ProjectTeamChatMessage;
  occurredAt: string;
}
