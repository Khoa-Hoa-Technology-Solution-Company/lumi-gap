import type { CreditRole } from "./project-contributions.js";

export const mentorPermissions = ["OVERVIEW_VIEW", "PAPERS_VIEW", "PAPERS_COMMENT", "PAPERS_SUGGEST", "GAPS_VIEW", "GAPS_COMMENT", "GAPS_RECOMMEND", "TASKS_VIEW", "TASKS_SUGGEST", "MANUSCRIPTS_VIEW", "MANUSCRIPTS_COMMENT", "MANUSCRIPTS_SUGGEST", "MANUSCRIPTS_REVIEW", "MENTOR_CHAT", "SUBMISSIONS_VIEW", "CONTRIBUTIONS_VIEW"] as const;
export type MentorPermission = typeof mentorPermissions[number];
export const mentorDefaultPermissions: readonly MentorPermission[] = ["OVERVIEW_VIEW", "MENTOR_CHAT"];
export type MentorPaperAccessMode = "VIEW" | "COMMENT";
export interface MentorPaperShareInput { kind: "PAPER"; resourceId: string; accessMode: MentorPaperAccessMode; expectedVersion: number; message?: string }
export type MentorPreset = "OBSERVER" | "ADVISOR" | "REVIEWER";
export const mentorPresets: Record<MentorPreset, readonly MentorPermission[]> = {
  OBSERVER: ["OVERVIEW_VIEW", "PAPERS_VIEW", "GAPS_VIEW", "TASKS_VIEW", "MANUSCRIPTS_VIEW", "SUBMISSIONS_VIEW", "CONTRIBUTIONS_VIEW"],
  ADVISOR: ["OVERVIEW_VIEW", "PAPERS_VIEW", "PAPERS_COMMENT", "PAPERS_SUGGEST", "GAPS_VIEW", "GAPS_COMMENT", "GAPS_RECOMMEND", "TASKS_VIEW", "TASKS_SUGGEST", "MANUSCRIPTS_VIEW", "MANUSCRIPTS_COMMENT", "MANUSCRIPTS_SUGGEST", "MENTOR_CHAT", "SUBMISSIONS_VIEW", "CONTRIBUTIONS_VIEW"],
  REVIEWER: [...mentorPermissions],
};
export const mentorResourceKinds = ["OVERVIEW", "PAPER", "GAP", "TASK", "MILESTONE", "MANUSCRIPT", "SUBMISSION", "CONTRIBUTION"] as const;
export type MentorResourceKind = typeof mentorResourceKinds[number];
export interface MentorShareInput { kind: MentorResourceKind; resourceId: string; sectionKey: string; title: string; content: string }
export interface MentorPolicyInput { preset: MentorPreset; permissions: MentorPermission[]; expiresAt: string | null; shares?: MentorShareInput[] }
export interface MentorAccessPolicy { id: string; requestId: string; relationshipId: string | null; version: number; preset: MentorPreset; permissions: MentorPermission[]; expiresAt: string | null; revokedAt: string | null; effective: boolean }
export interface MentorPaperMetadata { authors: string[]; publicationYear: number; doi: string | null; source: string | null; originalUrl: string | null }
export interface MentorSharedResource extends MentorShareInput { message?: string | null; paper?: MentorPaperMetadata | null; canUnshare?: boolean; hasPdf?: boolean; accessMode?: MentorPaperAccessMode | null; canComment?: boolean; id: string; createdAt: string; revokedAt: string | null }
export type MentorResourceSummary = Omit<MentorSharedResource, "content">;
export interface MentorFeedback { id: string; authorId: string; authorName: string; mentor: boolean; shareId: string | null; replyToId: string | null; kind: "MESSAGE" | "COMMENT" | "SUGGESTION" | "REVIEW"; body: string; creditRoles: CreditRole[]; status: "PENDING" | "ACCEPTED" | "REJECTED" | "RESOLVED"; version: number; handledById: string | null; handledByName?: string; handledAt: string | null; response: string; resultingRevisionRef?: string | null; createdAt: string }
export interface MentorAgreement { id: string; proposedById: string; creditRoles: CreditRole[]; acknowledgement: string; note: string; status: "PROPOSED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN"; respondedById: string | null; createdAt: string }
export interface MentorProjectTeamMember {
  id: string;
  name: string;
  role: "OWNER" | "MEMBER";
  avatarUrl?: string | null;
  academicRole?: string | null;
  institutionName?: string | null;
  department?: string | null;
  programName?: string | null;
  headline?: string | null;
  researchInterests?: string[];
  skills?: string[];
  publicHandle?: string | null;
  profileAccessible?: boolean;
}
export interface MentorProjectBasics {
  summary: string | null;
  researchField: string | null;
  researchAreas?: string[];
  researchStage?: string | null;
  status: string;
  team: MentorProjectTeamMember[];
}
export const mentorResourceCategories = ["ALL", "MANUSCRIPT_REPORT", "REFERENCE_PAPER", "RESEARCH_PLAN", "RESEARCH_GAP"] as const;
export type MentorResourceCategory = typeof mentorResourceCategories[number];
export const mentorResourceSorts = ["newest", "oldest", "title"] as const;
export type MentorResourceSort = typeof mentorResourceSorts[number];
export type MentorResourcePermissionLabel = "VIEW_ONLY" | "COMMENT" | "REVIEW_ASSIGNED";
export type MentorResourceSourceKind = "EXPLICIT_SHARE" | "REVIEW_REQUEST";
export interface MentorResourceVersionEntry {
  revisionId: string;
  revisionNumber: number;
  originalFileName?: string | null;
  contentType?: string | null;
  createdAt: string;
  reviewRequestId?: string | null;
  reviewId?: string | null;
  reviewStatus?: string | null;
}
export interface MentorResourceReviewLink {
  requestId: string;
  assignmentId: string;
  revisionId: string;
  revisionNumber: number;
  status: string;
  createdAt: string;
}
export interface MentorReviewResource { id: string; submissionId: string; title: string; revisionId: string; revisionNumber: number; status: string; createdAt: string }
export interface MentorResourceInboxItem {
  id: string;
  canonicalKey?: string;
  projectId: string;
  projectTitle: string;
  sharedByName?: string;
  accessId: string;
  category?: Exclude<MentorResourceCategory, "ALL">;
  sourceKinds?: MentorResourceSourceKind[];
  permissionMode?: MentorResourcePermissionLabel;
  documentType?: string | null;
  originalFileName?: string | null;
  latestRevisionNumber?: number | null;
  latestRevisionId?: string | null;
  sharedVersionCount?: number;
  versions?: MentorResourceVersionEntry[];
  reviewRequests?: MentorResourceReviewLink[];
  sharedAt?: string;
  resource: MentorResourceSummary;
}
export interface MentorResourceInboxQuery {
  q?: string;
  projectId?: string;
  paperId?: string;
  category?: MentorResourceCategory;
  sort?: MentorResourceSort;
  pageSize?: number;
}
export interface MentorResourceInbox extends MentorAccessPage<MentorResourceInboxItem> {
  unfilteredTotal: number;
  projects: { id: string; title: string }[];
  categoryCounts?: Record<MentorResourceCategory, number>;
}
export interface MentorAccessWorkspace { viewerId: string; projectId: string; title: string; basics?: MentorProjectBasics; canManage: boolean; readOnly: boolean; page: number; pageSize: number; total: number; hasNext: boolean; policies: { policy: MentorAccessPolicy; mentorRole?: string | null; startedAt?: string; mentorInstitution?: string | null; mentorAvatarUrl?: string | null; mentorId: string; mentorName: string; invitationState: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED"; reviewResources?: MentorReviewResource[]; shares: MentorResourceSummary[] }[] }
export interface MentorAccessPage<T> { items: T[]; total: number; page: number; pageSize: number; hasNext: boolean }
/** Only tasks assigned to the authenticated mentor in this project. */
export interface MentorAssignedTask {
  id: string;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  dueAt: string | null;
  blockedReason: string;
  submissionId: string | null;
}
