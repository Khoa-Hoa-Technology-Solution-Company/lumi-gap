import type { ISODateString } from "./common.js";
import type { ResearchSupportType } from "./academic-profile.js";

export type ResearchSupportNeedCategory =
  | "DOMAIN_EXPERTISE"
  | "RESEARCH_METHOD"
  | "TECHNICAL_EXPERTISE"
  | "RESEARCH_STAGE"
  | "ACADEMIC_WRITING"
  | "EVALUATION"
  | "OTHER";

export type ResearchSupportNeedPriority = "ESSENTIAL" | "IMPORTANT" | "OPTIONAL";

export type ResearchSupportNeedSource =
  | "GROUP_DECLARED"
  | "AI_SUGGESTED"
  | "RESEARCH_PLAN"
  | "LECTURER_CONFIRMED";

export type ResearchSupportNeedStatus = "SUGGESTED" | "CONFIRMED" | "DISMISSED";

export type StudentResearchChallengeId =
  | "START_RESEARCH"
  | "RESEARCH_QUESTIONS"
  | "LITERATURE_EVALUATION"
  | "RESEARCH_GAP"
  | "METHODOLOGY_CHOICE"
  | "TECHNICAL_IMPLEMENTATION"
  | "RESULT_EVALUATION"
  | "MANUSCRIPT_FEEDBACK";

export interface StudentResearchChallengeOption {
  id: StudentResearchChallengeId;
  labelVi: string;
  labelEn: string;
  descriptionVi: string;
  descriptionEn: string;
  category: ResearchSupportNeedCategory;
  defaultSupportType: ResearchSupportType;
  relatedTerms: readonly string[];
}

export const STUDENT_RESEARCH_CHALLENGES: readonly StudentResearchChallengeOption[] = [
  {
    id: "START_RESEARCH",
    labelVi: "Chưa biết bắt đầu nghiên cứu từ đâu",
    labelEn: "Not sure where to start the research",
    descriptionVi: "Cần định hướng phạm vi đề tài, lộ trình đọc tài liệu và các mốc triển khai ban đầu.",
    descriptionEn: "Need help scoping the topic, setting initial milestones, and planning early exploration.",
    category: "RESEARCH_STAGE",
    defaultSupportType: "RESEARCH_DIRECTION",
    relatedTerms: ["Research Direction", "Topic Scoping", "Research Planning"],
  },
  {
    id: "RESEARCH_QUESTIONS",
    labelVi: "Chưa xác định được câu hỏi nghiên cứu",
    labelEn: "Need help formulating research questions",
    descriptionVi: "Cần chuyển từ ý tưởng rộng thành câu hỏi nghiên cứu cụ thể, có thể kiểm chứng.",
    descriptionEn: "Need help turning a broad idea into focused, testable research questions.",
    category: "RESEARCH_METHOD",
    defaultSupportType: "RESEARCH_DIRECTION",
    relatedTerms: ["Research Question Formulation", "Research Problem", "Study Scoping"],
  },
  {
    id: "LITERATURE_EVALUATION",
    labelVi: "Chưa biết tìm và đánh giá tài liệu",
    labelEn: "Need help finding and evaluating literature",
    descriptionVi: "Cần hướng dẫn chiến lược tìm bài báo, tiêu chí sàng lọc và tổng hợp bằng chứng khoa học.",
    descriptionEn: "Need guidance on search strategy, screening criteria, and evidence synthesis.",
    category: "RESEARCH_METHOD",
    defaultSupportType: "LITERATURE_REVIEW",
    relatedTerms: ["Literature Review", "Systematic Review", "Evidence Synthesis"],
  },
  {
    id: "RESEARCH_GAP",
    labelVi: "Chưa biết xác định khoảng trống nghiên cứu",
    labelEn: "Need help identifying a valid research gap",
    descriptionVi: "Cần phân biệt khoảng trống nghiên cứu thực sự với hạn chế riêng lẻ của một bài báo.",
    descriptionEn: "Need a reliable way to distinguish a real research gap from an individual paper limitation.",
    category: "RESEARCH_METHOD",
    defaultSupportType: "RESEARCH_GAP_VALIDATION",
    relatedTerms: ["Research Gap", "Research Gap Validation", "Literature Review"],
  },
  {
    id: "METHODOLOGY_CHOICE",
    labelVi: "Chưa biết chọn phương pháp nghiên cứu",
    labelEn: "Unsure which research methodology fits best",
    descriptionVi: "Cần tư vấn chọn phương pháp định tính, định lượng, thực nghiệm hoặc tổng quan hệ thống.",
    descriptionEn: "Need advice on selecting qualitative, quantitative, experimental, or review methodology.",
    category: "RESEARCH_METHOD",
    defaultSupportType: "RESEARCH_METHODOLOGY",
    relatedTerms: ["Research Methodology", "Research Methods", "Study Design"],
  },
  {
    id: "TECHNICAL_IMPLEMENTATION",
    labelVi: "Cần hỗ trợ triển khai kỹ thuật",
    labelEn: "Need technical or system implementation guidance",
    descriptionVi: "Cần tư vấn kiến trúc hệ thống, mô hình AI/thuật toán, dữ liệu hoặc công cụ lập trình.",
    descriptionEn: "Need advice on system architecture, AI models/algorithms, data pipelines, or engineering tools.",
    category: "TECHNICAL_EXPERTISE",
    defaultSupportType: "SOFTWARE_TECHNICAL_GUIDANCE",
    relatedTerms: ["Software Engineering", "System Architecture", "Technical Implementation"],
  },
  {
    id: "RESULT_EVALUATION",
    labelVi: "Cần hỗ trợ đánh giá kết quả",
    labelEn: "Need guidance on experimental evaluation and analysis",
    descriptionVi: "Cần thiết kế thí nghiệm, chọn chỉ số đánh giá (metrics), baseline và phân tích thống kê.",
    descriptionEn: "Need help designing experiments, selecting evaluation metrics/baselines, and analyzing results.",
    category: "EVALUATION",
    defaultSupportType: "EXPERIMENT_DESIGN",
    relatedTerms: ["Experimental Design", "Evaluation Metrics", "Data Analysis", "Statistical Analysis"],
  },
  {
    id: "MANUSCRIPT_FEEDBACK",
    labelVi: "Cần góp ý bản thảo",
    labelEn: "Need feedback on manuscript or academic writing",
    descriptionVi: "Cần góp ý cấu trúc bài báo/báo cáo, lập luận khoa học và cách trình bày kết quả.",
    descriptionEn: "Need guidance on paper structure, scientific argumentation, and academic writing quality.",
    category: "ACADEMIC_WRITING",
    defaultSupportType: "ACADEMIC_WRITING",
    relatedTerms: ["Academic Writing", "Manuscript Review", "Scientific Writing"],
  },
] as const;

export interface ResearchSupportNeed {
  id: string;
  title: string;
  description: string;
  category: ResearchSupportNeedCategory;
  priority: ResearchSupportNeedPriority;
  taxonomyNodeIds: string[];
  keywordIds?: string[];
  supportType?: ResearchSupportType;
  relatedTerms: string[];
  rationale: string;
  plainExplanation?: string;
  source: ResearchSupportNeedSource;
  status: ResearchSupportNeedStatus;
  updatedAt?: ISODateString;
}

export interface ResearchNeedsAnalysisResult {
  projectId: string;
  analysisVersion: string;
  mode: "AI_ASSISTED" | "DETERMINISTIC_FALLBACK";
  aiPolicyAllowed: boolean;
  fallbackReason?: string;
  analyzedAt: ISODateString;
  selectedChallenges: StudentResearchChallengeId[];
  needs: ResearchSupportNeed[];
  contextSummary: {
    hasTitle: boolean;
    hasDescription: boolean;
    hasClassification: boolean;
    hasKeywords: boolean;
    hasResearchPlan: boolean;
    hasMethodology: boolean;
    hasDeclaredMentoringNeeds: boolean;
    stage: string;
    completeness: "SUFFICIENT" | "MINIMAL" | "SPARSE";
  };
  missingContextHints: string[];
}

export type MentorEvidenceSourceKind =
  | "PROFILE_DECLARATION"
  | "APPLICATION_DECLARATION"
  | "PUBLICATION_TITLE"
  | "PUBLICATION_ABSTRACT"
  | "PUBLICATION_TOPIC"
  | "PUBLICATION_FULLTEXT_EXCERPT"
  | "MENTORING_PREFERENCE"
  | "PLATFORM_RECORDED_ACTIVITY"
  | "LECTURER_CONFIRMED_SCOPE";

export type PublicationEvidenceScope = "TITLE" | "METADATA" | "ABSTRACT" | "FULLTEXT_EXCERPT";

export type PublicationAttributionStatus =
  | "LINKED_IDENTITY"
  | "SELF_DECLARED"
  | "UNCERTAIN_ATTRIBUTION";

export interface PublicationExpertiseEvidence {
  id: string;
  paperId?: string;
  lecturerId: string;
  title: string;
  year?: number;
  authors?: string[];
  venue?: string;
  doi?: string;
  href?: string;
  source: string;
  relatedNeedIds: string[];
  evidenceScope: PublicationEvidenceScope;
  matchedTopicIds: string[];
  matchedTerms: string[];
  evidenceExcerpt?: string;
  explanation?: string;
  attributionStatus: PublicationAttributionStatus;
}

export type MentorNeedRelationship =
  | "RELATED_EVIDENCE"
  | "DECLARED_SUPPORT"
  | "LECTURER_CONFIRMED"
  | "NEEDS_DISCUSSION"
  | "INSUFFICIENT_INFORMATION";

export interface MentorNeedCoverageItem {
  needId: string;
  needTitle: string;
  category: ResearchSupportNeedCategory;
  priority: ResearchSupportNeedPriority;
  relationship: MentorNeedRelationship;
  evidenceIds: string[];
  explanation: string;
  evidenceLabel: string;
}

export type LecturerAvailabilityState =
  | "ACCEPTING"
  | "CAPACITY_REACHED"
  | "NOT_ACCEPTING"
  | "PENDING_REQUEST"
  | "ACTIVE_MENTOR"
  | "COOLDOWN"
  | "UNVERIFIED";

export interface LecturerEligibilitySummary {
  canInvite: boolean;
  currentAvailability: LecturerAvailabilityState;
  remainingSlots: number | null;
  maxActiveProjects: number | null;
  activeProjectCount: number;
  reasonCode?: string;
}

export interface MentorEvidenceItem {
  id: string;
  source: MentorEvidenceSourceKind;
  label: string;
  detail: string;
  relatedNeedIds: string[];
  scope?: PublicationEvidenceScope;
  attribution?: PublicationAttributionStatus;
  href?: string;
  year?: number;
  venue?: string;
  authors?: string[];
  excerpt?: string;
}

export interface MentorUncertaintyItem {
  code:
    | "PROJECT_METHODOLOGY_UNSPECIFIED"
    | "PROJECT_NEEDS_UNCONFIRMED"
    | "LECTURER_SUPPORT_UNDECLARED"
    | "NO_SHARED_TOPICS"
    | "NO_LINKED_PUBLICATIONS"
    | "UNCERTAIN_AUTHORSHIP"
    | "BROAD_TAXONOMY_ONLY"
    | "SPARSE_LECTURER_PROFILE"
    | "CAPACITY_REACHED"
    | "PROFILE_PRIVATE";
  message: string;
}

export interface ValidatedMentorAiExplanation {
  summary: string;
  needNotes: Array<{
    needId: string;
    note: string;
    evidenceIds: string[];
  }>;
  discussionQuestions: string[];
  uncertainties: string[];
  validated: true;
  source: "AI_VALIDATED" | "DETERMINISTIC_TEMPLATE";
  fallbackReason?: string;
  model?: string;
  promptVersion: string;
  generatedAt: ISODateString;
}

export interface MentorRecommendationSummary {
  projectId: string;
  lecturerId: string;
  recommendationVersion: string;
  rankingConfigVersion: string;
  retrievalMode: "HYBRID_SEMANTIC" | "HYBRID_TAXONOMY_LEXICAL";
  tier: "RECOMMENDED" | "EXPLORE" | "INSUFFICIENT_INFO";
  abstained: boolean;
  abstentionReason?: string;
  eligibility: LecturerEligibilitySummary;
  primaryHeadline: string;
  academicEvidenceHighlight?: string;
  declaredSupportHighlight?: string;
  remainingDiscussionHighlight?: string;
  complementaryNote?: string;
  needs: MentorNeedCoverageItem[];
  summary: string;
  suggestedDiscussionTopics: string[];
  uncertainties: MentorUncertaintyItem[];
  evidenceCoverage: {
    availableSignals: string[];
    missingSignals: string[];
    completenessLevel: "RICH" | "PARTIAL" | "SPARSE";
  };
  generatedAt: ISODateString;
}

export type NeedScopeConfirmationResponse = "CAN_SUPPORT" | "NEEDS_DISCUSSION" | "OUTSIDE_SCOPE";

export interface NeedScopeConfirmation {
  needId: string;
  needTitle: string;
  response: NeedScopeConfirmationResponse;
  note?: string;
}
