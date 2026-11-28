import type { MentorRole, MentorProjectPreview } from "./project.js";

export type MentorshipApplicationStatus = "APPLIED" | "SHORTLISTED" | "INVITED" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "CLOSED";
export interface MentorshipApplicationInput {
  message: string; mentorRole?: MentorRole; areas?: string[]; methodologies?: string[]; capabilities?: string[]; availability?: string; idempotencyKey: string;
}
export interface LecturerMatchEvidence {
  method: "STRUCTURED_TERMS_V1" | "HYBRID_EVIDENCE_V2";
  profileVisible: boolean;
  verifiedLecturer: boolean;
  topics: Array<{ term: string; source: import("./mentor-recommendation.js").MentorEvidenceSourceKind }>;
  methodologies: string[];
  mentoringNeeds: string[];
  publications: Array<{
    paperId?: string;
    title: string;
    year?: number;
    authors?: string[];
    venue?: string;
    doi?: string;
    source: string;
    href?: string;
    matchedTerms: string[];
    relatedNeedIds?: string[];
    evidenceScope?: import("./mentor-recommendation.js").PublicationEvidenceScope;
    evidenceExcerpt?: string;
    explanation?: string;
    attribution: import("./mentor-recommendation.js").PublicationAttributionStatus;
  }>;
  identities: Array<{ provider: string; href: string; verified: boolean }>;
  missing: string[];
  missingReasons?: import("./mentor-recommendation.js").MentorUncertaintyItem[];
  requestedTopics: string[];
  requestedMethodologies: string[];
  recommendation?: import("./mentor-recommendation.js").MentorRecommendationSummary;
  evidenceItems?: import("./mentor-recommendation.js").MentorEvidenceItem[];
  publicationEvidence?: import("./mentor-recommendation.js").PublicationExpertiseEvidence[];
  canGenerateAiExplanation?: boolean;
  aiExplanationDisabledReason?: string;
}
export interface MentorshipApplicationView {
  id: string; projectId: string; project: MentorProjectPreview;
  lecturer: { id: string; name: string; avatarUrl?: string; verifiedLecturer: boolean; positionTitle?: string; institutionName?: string; expertiseAreas?: string[]; skills?: string[] };
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
