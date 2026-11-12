import type { MentorRole, MentorProjectPreview } from "./project.js";

export type MentorshipApplicationStatus = "APPLIED" | "SHORTLISTED" | "INVITED" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "CLOSED";
export interface MentorshipApplicationInput {
  message: string; mentorRole: MentorRole; areas: string[]; methodologies: string[]; capabilities: string[]; availability: string; idempotencyKey: string;
}
export interface LecturerMatchEvidence {
  method: "STRUCTURED_TERMS_V1";
  profileVisible: boolean;
  verifiedLecturer: boolean;
  topics: Array<{ term: string; source: "PROFILE_DECLARATION" | "APPLICATION_DECLARATION" | "PUBLICATION_TITLE" }>;
  methodologies: string[];
  mentoringNeeds: string[];
  publications: Array<{ title: string; year?: number; source: string; href?: string; matchedTerms: string[]; attribution: "LINKED_IDENTITY" | "SELF_DECLARED" }>;
  identities: Array<{ provider: string; href: string; verified: boolean }>;
  missing: string[];
  requestedTopics: string[];
  requestedMethodologies: string[];
}
export interface MentorshipApplicationView {
  id: string; projectId: string; project: MentorProjectPreview;
  lecturer: { id: string; name: string; avatarUrl?: string; verifiedLecturer: boolean };
  mentorRole: MentorRole; message: string; areas: string[]; methodologies: string[]; capabilities: string[]; availability: string;
  status: MentorshipApplicationStatus; version: number; createdAt: string; updatedAt: string;
  canManage: boolean; canWithdraw: boolean; canInvite: boolean; canClarify: boolean;
  invitation?: { id: string; status: string; expiresAt: string | null };
  evidence?: LecturerMatchEvidence;
}
export interface MentorshipApplicationDetail extends MentorshipApplicationView {
  notes: Array<{ id: string; authorId: string; authorName: string; body: string; createdAt: string }>;
  events: Array<{ id: string; type: string; createdAt: string }>;
}
