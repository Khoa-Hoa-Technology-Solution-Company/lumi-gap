export const mentorWorkKinds = ["TASK", "MANUSCRIPT_REVIEW", "PROPOSAL_REVIEW", "MENTOR_QUESTION"] as const;
export type MentorWorkKind = typeof mentorWorkKinds[number];
export type MentorWorkStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "WAITING" | "DONE";
export type MentorWorkPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export interface MentorWorkQuery {
  page?: number; pageSize?: number; q?: string; projectId?: string; kind?: MentorWorkKind | "REVIEW";
  status?: MentorWorkStatus | "ACTIONABLE" | "OVERDUE" | "ALL"; sort?: "priority" | "deadline";
  projectPage?: number; projectSearch?: string; item?: string;
}
export interface MentorWorkItem {
  id: string; sourceId: string; kind: MentorWorkKind; title: string; description: string;
  projectId: string; projectTitle: string; sender: string; status: MentorWorkStatus;
  priority: MentorWorkPriority; dueAt: string | null; updatedAt: string;
  needsAction: boolean; overdue: boolean; blocked: boolean; version: number | null;
  href: string; action: "VIEW" | "REVIEW" | "RESPOND";
  accessIssue?: "MANUSCRIPT_NOT_SHARED";
  canContactTeam?: boolean;
}
export interface MentorProjectSummary {
  id: string; title: string; researchField: string | null; status: string;
  teamLead: string; teamSize: number; researchStage: string | null; pendingCount: number; updatedAt: string;
}
export interface MentorWorkspaceData {
  items: MentorWorkItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  projects: MentorProjectSummary[];
  projectMeta: { page: number; pageSize: number; total: number; totalPages: number };
  projectOptions: { id: string; title: string }[];
  summary: { projects: number; needsResponse: number; overdue: number; blocked: number; manuscripts: number; invitations: number };
  generatedAt: string;
}
