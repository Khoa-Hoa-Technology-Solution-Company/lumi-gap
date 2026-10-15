import type { ResearchApproach, ProjectStatus } from "./project.js";

export type ResearchStage = "DISCOVERY" | "SCREENING" | "EXTRACTION" | "GAP_VALIDATION" | "DESIGN" | "WRITING" | "REVIEW";
export type WorkspaceTaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
export type DiscussionCategory = "GENERAL" | "RESEARCH_QUESTION" | "EVIDENCE" | "DECISION_NEEDED" | "MENTOR_QUESTION";
export type WorkspaceLinkKind = "PAPER" | "SCREENING" | "EVIDENCE" | "GAP" | "QUESTION" | "MANUSCRIPT" | "REVIEW_REQUEST" | "PLAN_REVISION" | "REPORT";
export interface WorkspaceLink { kind: WorkspaceLinkKind; id: string; label?: string }
export interface WorkspacePerson { id: string; name: string }
export interface WorkspacePage<T> { items: T[]; page: number; pageSize: number; total: number; hasNext: boolean }
export interface PlanQuestion { id: string; text: string; sourceGapId?: string; evidenceIds?: string[]; sourceGapVersion?: number; sourceEvidenceRevisionIds?: string[] }
export interface ResearchPlanContent {
  approach: ResearchApproach;
  problem: string;
  objectives: string[];
  questions: PlanQuestion[];
  scope: string;
  methodology: string;
  searchStrategy: string;
  deliverables: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
}
export interface ResearchPlanRevision {
  id: string;
  version: number;
  content: ResearchPlanContent;
  changedBy: WorkspacePerson | null;
  changeSummary: string | null;
  createdAt: string;
  feedbackCount?: number;
}
export interface ResearchPlanView {
  projectId: string;
  projectTitle: string;
  version: number;
  content: ResearchPlanContent;
  currentRevisionId: string | null;
  canEdit: boolean;
  canShare: boolean;
  archived: boolean;
  access: "TEAM" | "MENTOR";
}
export interface SaveResearchPlan extends ResearchPlanContent { expectedVersion: number; changeSummary: string }
export type PlanSection = "problem" | "objectives" | "questions" | "scope" | "methodology" | "searchStrategy" | "deliverables";
export interface PlanDraftUpdate {
  expectedVersion: number;
  clientKey: string;
  base: Partial<ResearchPlanContent>;
  changes: Partial<ResearchPlanContent>;
}
export interface PlanDraftResult { version: number; content: ResearchPlanContent }
export interface PlanThreadContext { section: PlanSection; revisionId: string | null; draftVersion: number }
export interface CreatePlanThread { section: PlanSection; revisionId?: string; body: string; clientKey: string; mentions: string[] }
export interface WorkspaceTask {
  id: string; title: string; description: string; status: WorkspaceTaskStatus; blockedReason: string;
  assignee: WorkspacePerson | null; creator: WorkspacePerson; milestoneId: string | null; dueAt: string | null;
  completedAt: string | null; link: WorkspaceLink | null; version: number; createdAt: string; updatedAt: string;
}
export interface SaveWorkspaceTask {
  title: string; description: string; status: WorkspaceTaskStatus; blockedReason: string;
  assigneeId: string | null; milestoneId: string | null; dueAt: string | null; link: WorkspaceLink | null;
}
export interface WorkspaceMilestone {
  id: string; title: string; description: string; dueAt: string | null; status: "PLANNED" | "COMPLETE"; version: number;
}
export interface WorkspaceComment { id: string; body: string; author: WorkspacePerson; createdAt: string }
export interface WorkspaceRevision { id: string; version: number; snapshot: Record<string, unknown>; actor: WorkspacePerson; createdAt: string }
export interface WorkspaceTaskDetail { task: WorkspaceTask; canDelete: boolean; comments: WorkspacePage<WorkspaceComment>; history: WorkspacePage<WorkspaceRevision> }
export interface WorkspaceDiscussion {
  id: string; title: string; body: string; category: DiscussionCategory; status: "OPEN" | "RESOLVED";
  conclusion: string; author: WorkspacePerson; link: WorkspaceLink | null; mentorRelationshipId: string | null;
  version: number; replyCount: number; createdAt: string; updatedAt: string;
  planContext?: PlanThreadContext;
}
export interface SaveWorkspaceDiscussion {
  title: string; body: string; category: DiscussionCategory; link: WorkspaceLink | null; mentorRelationshipId: string | null;
}
export interface WorkspaceMessage extends WorkspaceComment { replyToId: string | null }
export interface WorkspaceDiscussionDetail { thread: WorkspaceDiscussion; messages: WorkspacePage<WorkspaceMessage>; canResolve: boolean; canReply: boolean; canEdit: boolean }
export interface WorkspaceDecision {
  id: string; decision: string; context: string; alternatives: string; rationale: string; link: WorkspaceLink | null;
  threadId: string | null; recordedBy: WorkspacePerson; version: number; createdAt: string; updatedAt: string;
}
export interface SaveWorkspaceDecision { decision: string; context: string; alternatives: string; rationale: string; link: WorkspaceLink | null; threadId: string | null; clientKey?: string }
export interface PlanShareSummary { id: string; revisionId: string; version: number; relationshipId: string; mentor: WorkspacePerson; revokedAt: string | null; createdAt: string }
export interface WorkspaceOverview {
  project: { id: string; title: string; status: ProjectStatus; researchStage: ResearchStage | null; version: number };
  capabilities: { editResearch: boolean; manageProject: boolean; collaborate: boolean };
  members: WorkspacePerson[];
  memberCount: number;
  mentors: Array<WorkspacePerson & { relationshipId: string }>;
  plan: ResearchPlanContent;
  progress: { papers: number; pendingScreening: number; included: number; evidence: number; gaps: number; questions: number };
  attention: { overdueTasks: number; blockedTasks: number; mentorQuestions: number; mentorFeedback: number; reviewResponses: number };
  myTasks: WorkspaceTask[];
  recentArtifacts: Array<{ id: string; title: string; kind: "REPORT" | "MANUSCRIPT"; updatedAt: string }>;
  nextMilestone: WorkspaceMilestone | null;
  activity: Array<{ id: string; type: string; actor: WorkspacePerson | null; createdAt: string; entityKind: string | null; entityId: string | null }>;
}
