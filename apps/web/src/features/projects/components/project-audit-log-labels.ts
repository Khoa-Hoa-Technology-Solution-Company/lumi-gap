import type { ProjectAuditEventCategory } from "@trend/shared-types";

export const AUDIT_CATEGORY_OPTIONS: Array<{ value: ProjectAuditEventCategory; label: string }> = [
  { value: "MEMBERSHIP", label: "Members & ownership" },
  { value: "MANUSCRIPT", label: "Manuscripts & documents" },
  { value: "ACCESS_EXPORT", label: "Access & downloads" },
  { value: "SETTINGS_PRIVACY", label: "Settings & privacy" },
  { value: "INTEGRITY_SECURITY", label: "Incidents & security" },
];

const EVENT_LABELS: Record<string, string> = {
  MANUSCRIPT_PDF_DOWNLOADED: "Downloaded manuscript PDF",
  MANUSCRIPT_FILE_DOWNLOADED: "Downloaded manuscript file",
  MANUSCRIPT_SOURCE_EXPORTED: "Exported manuscript source",
  PROJECT_SOURCE_EXPORTED: "Exported project source",
  SUBMISSION_REVISION_DOWNLOADED: "Accessed submission file",
  ALLOCATION_EXPORTED: "Exported contribution allocation",
  CONTRIBUTION_EVIDENCE_EXPORTED: "Exported contribution evidence",
  CREDIT_STATEMENT_EXPORTED: "Exported CRediT statement",
  MANUSCRIPT_INTEGRITY_EXPORTED: "Exported manuscript integrity report",
  ATTRIBUTION_REVIEW_PDF_READ: "Viewed attribution review PDF",

  MANUSCRIPT_SNAPSHOT_SAVED: "Saved manuscript snapshot",
  MANUSCRIPT_SOFT_DELETED: "Moved manuscript to Trash",
  MANUSCRIPT_RESTORED_FROM_TRASH: "Restored manuscript from Trash",
  MANUSCRIPT_SUBMISSION_SNAPSHOT_CREATED: "Created submission snapshot",
  MANUSCRIPT_AI_ACCEPTED: "Accepted AI edit suggestion",
  MANUSCRIPT_REMOTE_BOUND: "Linked GitHub repository",
  MANUSCRIPT_REMOTE_APPLIED: "Synced changes from GitHub",
  GITHUB_REPOSITORY_INITIALIZED: "Initialized GitHub repository",
  MENTOR_MANUSCRIPT_PREPARED: "Prepared manuscript for mentor review",
  PRIVATE_SOURCE_UPLOADED: "Uploaded private source file",
  MANUSCRIPT_ATTRIBUTION_SAVED: "Saved authorship attribution",
  MANUSCRIPT_ATTRIBUTION_DECIDED: "Recorded authorship decision",
  AUTHORSHIP_UPDATED: "Updated authorship registry",
  AUTHORSHIP_CONFIRMED: "Confirmed authorship role",
  CITATION_VERIFIED: "Verified citation metadata",
  EXTERNAL_AI_DECLARED: "Declared external AI usage",
  MANUSCRIPT_INTEGRITY_RECORDED: "Recorded manuscript integrity check",
  MANUSCRIPT_INTEGRITY_ACKNOWLEDGED: "Acknowledged integrity declaration",

  MEMBER_JOINED: "Member joined project",
  MEMBER_LEFT: "Member left project",
  MEMBER_REMOVED: "Removed member from project",
  OWNERSHIP_TRANSFERRED: "Transferred project ownership",
  MEMBER_CREDIT_UPDATED: "Updated member CRediT roles",
  CREDIT_ROLES_CONFIRMED: "Confirmed CRediT roles",
  MENTOR_FEEDBACK_HANDLED: "Handled mentor feedback",

  PROJECT_VISIBILITY_CHANGED: "Changed project privacy",
  PROJECT_SECURITY_POLICY_CHANGED: "Updated security & AI policies",

  INTEGRITY_CASE_OPENED: "Reported integrity or leak incident",
  INTEGRITY_CASE_RESPONDED: "Added response to incident",
  INTEGRITY_CASE_ESCALATED: "Escalated incident for institutional review",
  INTEGRITY_CASE_RESOLVED: "Resolved integrity incident",
  PROJECT_LEAK_CONTAINMENT_APPLIED: "Applied leak containment measures",
};

const RESOURCE_LABELS: Record<string, string> = {
  PROJECT: "Project",
  PROJECT_MEMBER: "Team member",
  MANUSCRIPT: "Manuscript",
  MANUSCRIPT_FILE: "Manuscript file",
  MANUSCRIPT_COMPILATION: "Compiled manuscript PDF",
  MANUSCRIPT_SNAPSHOT: "Manuscript snapshot",
  MANUSCRIPT_ATTRIBUTION: "Manuscript attribution",
  MANUSCRIPT_INTEGRITY: "Manuscript integrity",
  MANUSCRIPT_AI_ACCEPTANCE: "AI manuscript suggestion",
  SUBMISSION_REVISION: "Submission revision",
  GITHUB_REPOSITORY: "GitHub repository",
  INTEGRITY_CASE: "Integrity case",
  ALLOCATION_REVISION: "Contribution allocation",
  WORK_CONTRIBUTION: "Work contribution",
  MENTOR_FEEDBACK: "Mentor feedback",
  MENTOR_SHARE: "Mentor shared resource",
  PAPER_FILE: "Paper file",
};

export function getAuditEventLabel(eventType: string): string {
  if (EVENT_LABELS[eventType]) return EVENT_LABELS[eventType];
  const fallback = eventType.replace(/_/g, " ").toLowerCase();
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

export function getAuditResourceLabel(entityKind: string | null | undefined): string {
  if (!entityKind) return "Project";
  return RESOURCE_LABELS[entityKind] ?? entityKind.replace(/_/g, " ").toLowerCase();
}

export function getAuditCategoryLabel(category: ProjectAuditEventCategory | undefined): string {
  return AUDIT_CATEGORY_OPTIONS.find(option => option.value === category)?.label ?? "Manuscripts & documents";
}

export function formatAuditMetadataValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key === "byteSize" && typeof value === "number") {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
