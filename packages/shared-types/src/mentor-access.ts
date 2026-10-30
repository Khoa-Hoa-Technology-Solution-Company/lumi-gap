import type { CreditRole } from "./project-contributions.js";

export const mentorPermissions = ["OVERVIEW_VIEW", "PAPERS_VIEW", "PAPERS_COMMENT", "PAPERS_SUGGEST", "GAPS_VIEW", "GAPS_COMMENT", "GAPS_RECOMMEND", "TASKS_VIEW", "TASKS_SUGGEST", "MANUSCRIPTS_VIEW", "MANUSCRIPTS_COMMENT", "MANUSCRIPTS_SUGGEST", "MANUSCRIPTS_REVIEW", "MENTOR_CHAT", "SUBMISSIONS_VIEW", "CONTRIBUTIONS_VIEW"] as const;
export type MentorPermission = typeof mentorPermissions[number];
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
export interface MentorSharedResource extends MentorShareInput { id: string; createdAt: string; revokedAt: string | null }
export type MentorResourceSummary = Omit<MentorSharedResource, "content">;
export interface MentorFeedback { id: string; authorId: string; authorName: string; mentor: boolean; shareId: string | null; replyToId: string | null; kind: "MESSAGE" | "COMMENT" | "SUGGESTION" | "REVIEW"; body: string; creditRoles: CreditRole[]; status: "PENDING" | "ACCEPTED" | "REJECTED" | "RESOLVED"; version: number; handledById: string | null; handledByName?: string; handledAt: string | null; response: string; resultingRevisionRef?: string | null; createdAt: string }
export interface MentorAgreement { id: string; proposedById: string; creditRoles: CreditRole[]; acknowledgement: string; note: string; status: "PROPOSED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN"; respondedById: string | null; createdAt: string }
export interface MentorAccessWorkspace { viewerId: string; projectId: string; title: string; canManage: boolean; readOnly: boolean; page: number; pageSize: number; total: number; hasNext: boolean; policies: { policy: MentorAccessPolicy; mentorId: string; mentorName: string; invitationState: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED"; shares: MentorResourceSummary[] }[] }
export interface MentorAccessPage<T> { items: T[]; total: number; page: number; pageSize: number; hasNext: boolean }
