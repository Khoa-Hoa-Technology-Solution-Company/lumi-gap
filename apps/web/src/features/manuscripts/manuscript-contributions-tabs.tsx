import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCode2,
  FileText,
  GitPullRequest,
  ListTree,
  MessageSquare,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import {
  creditRoleMetadata,
  type CreditRole,
  type ManuscriptContributionsSummary,
  type ManuscriptContributorOverviewItem,
  type ManuscriptFileContributionItem,
  type WorkContribution,
} from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { contributionsApi } from "@/features/projects/api/contributions.api";
import { contributionStatusLabels } from "@/features/projects/components/work-contributions";
import { ManuscriptAttributionDialog } from "./components/manuscript-attribution-dialog";
import type { ContributionEditorInitialScope } from "@/features/projects/components/work-contributions";

export interface OutlineHeading {
  line: number;
  depth: number;
  title: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function localizedRoleName(role: CreditRole, language: string): string {
  const meta = creditRoleMetadata[role];
  if (!meta) return role;
  return language === "vi" ? meta.nameVi : meta.name;
}

function ackStatusBadge(
  state: ManuscriptContributorOverviewItem["acknowledgementState"],
  t: (key: string) => string,
): { label: string; tone: "neutral" | "pending" | "confirmed" | "warning" | "danger" } {
  switch (state) {
    case "ACKNOWLEDGED":
      return { label: t("Acknowledged"), tone: "confirmed" };
    case "SELF_RECORDED":
      return { label: t("Self-recorded"), tone: "neutral" };
    case "PENDING":
      return { label: t("Pending acknowledgement"), tone: "pending" };
    case "DISPUTED":
      return { label: t("Disputed"), tone: "danger" };
    case "NEEDS_CHANGES":
      return { label: t("Changes requested"), tone: "warning" };
    case "DRAFT_ONLY":
      return { label: t("Draft declaration"), tone: "neutral" };
    default:
      return { label: t("Activity recorded only"), tone: "neutral" };
  }
}

export function ManuscriptContributionsOverviewTab({
  summary,
  canWrite,
  selectedFilePath,
  technicalOpen,
  onToggleTechnical,
  onOpenDeclare,
  onOpenAcknowledgement,
  technicalPanel,
}: {
  summary?: ManuscriptContributionsSummary;
  canWrite: boolean;
  selectedFilePath?: string;
  technicalOpen: boolean;
  onToggleTechnical: () => void;
  onOpenDeclare: (scope: ContributionEditorInitialScope) => void;
  onOpenAcknowledgement: () => void;
  technicalPanel: React.ReactNode;
}) {
  const { t, language } = useI18n();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const contributors = summary?.contributors ?? [];
  const declarations = summary?.declarations ?? [];
  const aiReceipts = summary?.aiReceipts;
  const hasAiActivity = Boolean(
    aiReceipts && (aiReceipts.totalRuns > 0 || aiReceipts.acceptedEditsCount > 0 || aiReceipts.externalDeclarationsCount > 0),
  );

  return (
    <div className="mc-tab-body" role="tabpanel" id="mc-panel-overview" aria-labelledby="mc-tab-overview">
      {/* Primary actions */}
      <div className="mc-action-bar">
        {canWrite && summary ? (
          <Button
            size="sm"
            type="button"
            className="mc-primary-cta"
            onClick={() =>
              onOpenDeclare({
                manuscriptId: summary.manuscriptId,
                manuscriptTitle: summary.manuscriptTitle,
                snapshotId: summary.latestSnapshot?.id,
                filePath: selectedFilePath,
              })
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Declare contribution")}
          </Button>
        ) : null}
        <Button
          size="sm"
          type="button"
          variant="outline"
          aria-expanded={technicalOpen}
          aria-controls="mc-technical-evidence"
          onClick={onToggleTechnical}
        >
          {technicalOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {t("View technical evidence")}
        </Button>
      </div>

      {/* Collapsible Technical Evidence (Collapsed by default) */}
      {technicalOpen ? (
        <section id="mc-technical-evidence" className="mc-technical-box" aria-label={t("Technical evidence — Text provenance")}>
          {technicalPanel}
        </section>
      ) : null}

      {/* Contributors Overview */}
      <section className="mc-section" aria-label={t("Manuscript contributors")}>
        <div className="mc-section-header">
          <h3>
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Contributors & participants")}
          </h3>
          <span className="mc-count-pill">{contributors.length}</span>
        </div>

        {!contributors.length ? (
          <p className="mc-empty-note">{t("No manuscript contributions or recorded activities yet.")}</p>
        ) : (
          <ul className="mc-contributor-list">
            {contributors.map(person => {
              const status = ackStatusBadge(person.acknowledgementState, t);
              const isExpanded = expandedUserId === person.userId;
              const personDeclarations = declarations.filter(d =>
                d.participants.some(p => p.userId === person.userId),
              );
              const act = person.activity;
              const activityTags: string[] = [];
              if (act.editedFilePaths.length > 0) {
                activityTags.push(
                  t("Edited {{count}} files", { count: act.editedFilePaths.length }),
                );
              }
              if (act.suggestionsProposed > 0) {
                activityTags.push(
                  t("{{count}} edit proposals ({{accepted}} accepted)", {
                    count: act.suggestionsProposed,
                    accepted: act.suggestionsAcceptedAsAuthor,
                  }),
                );
              }
              if (act.suggestionsResolvedAsReviewer > 0) {
                activityTags.push(
                  t("Reviewed {{count}} proposals", { count: act.suggestionsResolvedAsReviewer }),
                );
              }
              if (act.commentsCount > 0) {
                activityTags.push(t("{{count}} comments", { count: act.commentsCount }));
              }
              if (act.formalReviewsCount > 0) {
                activityTags.push(t("{{count}} formal reviews", { count: act.formalReviewsCount }));
              }
              if (act.mentorFeedbackCount > 0) {
                activityTags.push(t("{{count}} mentor notes", { count: act.mentorFeedbackCount }));
              }

              return (
                <li key={person.userId} className="mc-contributor-card">
                  <button
                    type="button"
                    className="mc-contributor-head"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedUserId(isExpanded ? null : person.userId)}
                  >
                    <span className="mc-avatar" aria-hidden="true">
                      {initials(person.name)}
                    </span>
                    <div className="mc-contributor-main">
                      <div className="mc-contributor-name-row">
                        <strong className="mc-contributor-name">{person.name}</strong>
                        {person.membershipStatus === "MENTOR" ? (
                          <span className="mc-meta-tag">{t("Mentor")}</span>
                        ) : person.membershipStatus === "FORMER" ? (
                          <span className="mc-meta-tag">{t("Former member")}</span>
                        ) : null}
                      </div>
                      <div className="mc-status-row">
                        <span className={`mc-status-badge is-${status.tone}`}>{status.label}</span>
                        {person.declarationCount > 0 ? (
                          <span className="mc-subtle-meta">
                            {t("{{count}} declarations", { count: person.declarationCount })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 mc-chevron" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 mc-chevron" aria-hidden="true" />
                    )}
                  </button>

                  {/* Declared / acknowledged CRediT roles */}
                  {person.declaredRoles.length > 0 ? (
                    <div className="mc-role-chips" aria-label={t("CRediT roles")}>
                      {person.declaredRoles.map(role => {
                        const confirmed = person.acknowledgedRoles.includes(role);
                        return (
                          <span
                            key={role}
                            className={`mc-role-chip ${confirmed ? "is-acknowledged" : "is-declared"}`}
                            title={confirmed ? t("Acknowledged CRediT role") : t("Declared CRediT role (awaiting acknowledgement)")}
                          >
                            {confirmed ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : null}
                            {localizedRoleName(role, language)}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}

                  {/* System-recorded manuscript activity (distinct from declared/acknowledged roles) */}
                  {activityTags.length > 0 ? (
                    <div className="mc-activity-tags" aria-label={t("System-recorded manuscript activity")}>
                      <span className="mc-provenance-label">{t("Recorded")}:</span>
                      {activityTags.map((tag, idx) => (
                        <span key={idx} className="mc-activity-pill">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {isExpanded ? (
                    <div className="mc-contributor-details">
                      {act.editedFilePaths.length > 0 ? (
                        <div className="mc-detail-row">
                          <span className="mc-detail-label">{t("Edited files")}:</span>
                          <span className="mc-detail-value">{act.editedFilePaths.join(", ")}</span>
                        </div>
                      ) : null}
                      {personDeclarations.length > 0 ? (
                        <div className="mc-detail-list">
                          <span className="mc-detail-label">{t("Linked declarations")}:</span>
                          <ul>
                            {personDeclarations.map(decl => (
                              <li key={decl.id}>
                                <span>{decl.title}</span>
                                <span className="mc-mini-status">
                                  {t(contributionStatusLabels[decl.status] ?? decl.status)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="mc-detail-empty">
                          {t("No declared work linked to this manuscript yet. Recorded editing activity does not auto-assign CRediT roles.")}
                        </p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Manuscript-linked work declarations */}
      <section className="mc-section" aria-label={t("Manuscript work declarations")}>
        <div className="mc-section-header">
          <h3>
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Declared manuscript work")}
          </h3>
          <span className="mc-count-pill">{declarations.length}</span>
        </div>

        {!declarations.length ? (
          <p className="mc-empty-note">
            {t("Declare writing, methodology, analysis, review, or offline research work linked to this manuscript.")}
          </p>
        ) : (
          <ul className="mc-decl-list">
            {declarations.slice(0, 6).map(item => (
              <li key={item.id} className="mc-decl-row">
                <div className="mc-decl-head">
                  <strong>{item.title}</strong>
                  <Badge variant="outline" className="mc-badge-xs">
                    {t(contributionStatusLabels[item.status] ?? item.status)}
                  </Badge>
                </div>
                <p className="mc-decl-meta">
                  {item.participants.map(p => p.name).join(", ")}
                </p>
                {item.reviewActions.length > 0 ? (
                  <button
                    type="button"
                    className="mc-inline-link"
                    onClick={onOpenAcknowledgement}
                  >
                    {t("Review in Acknowledgement tab")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* AI Assistance Receipts — strictly separated from human contributors */}
      {hasAiActivity && aiReceipts ? (
        <section className="mc-ai-box" aria-label={t("AI assistance receipts")}>
          <div className="mc-section-header">
            <h3>
              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
              {t("AI assistance receipts")}
            </h3>
            <span className="mc-meta-tag">{t("Not a contributor")}</span>
          </div>
          <p className="mc-small-note">{t(aiReceipts.notice)}</p>
          <div className="mc-ai-stats">
            <span>{t("Generated runs")}: <strong>{aiReceipts.totalRuns}</strong></span>
            <span>{t("Accepted insertions")}: <strong>{aiReceipts.acceptedEditsCount}</strong></span>
            {aiReceipts.externalDeclarationsCount > 0 ? (
              <span>{t("External AI declarations")}: <strong>{aiReceipts.externalDeclarationsCount}</strong></span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function ManuscriptContributionsContentTab({
  summary,
  canWrite,
  selectedFileId,
  selectedFilePath,
  activeOutline,
  onNavigateSource,
  onOpenDeclare,
}: {
  summary?: ManuscriptContributionsSummary;
  canWrite: boolean;
  selectedFileId?: string;
  selectedFilePath?: string;
  activeOutline?: OutlineHeading[];
  onNavigateSource?: (fileId: string, line?: number) => void;
  onOpenDeclare: (scope: ContributionEditorInitialScope) => void;
}) {
  const { t } = useI18n();
  const [followActive, setFollowActive] = useState(false);
  const [selectedScope, setSelectedScope] = useState<string>("MANUSCRIPT");

  useEffect(() => {
    if (followActive && selectedFileId) {
      setSelectedScope(selectedFileId);
    }
  }, [followActive, selectedFileId]);

  const files: ManuscriptFileContributionItem[] = summary?.files ?? [];
  const activeFileItem = selectedScope === "MANUSCRIPT"
    ? null
    : files.find(f => f.fileId === selectedScope) ?? null;
  const showingActiveEditorFile = Boolean(activeFileItem && selectedFileId && activeFileItem.fileId === selectedFileId);
  const outlineItems = showingActiveEditorFile ? (activeOutline ?? []) : [];

  return (
    <div className="mc-tab-body" role="tabpanel" id="mc-panel-content" aria-labelledby="mc-tab-content">
      <p className="mc-granularity-note" role="note">
        {t(
          summary?.granularityNotice ??
            "Recorded editing, suggestion, comment, and retained-writing evidence is tracked at the manuscript or file level. Section-level attribution is not fabricated when underlying records are file- or manuscript-scoped.",
        )}
      </p>

      <div className="mc-content-controls">
        <label className="mc-follow-toggle">
          <input
            type="checkbox"
            checked={followActive}
            onChange={e => {
              const checked = e.target.checked;
              setFollowActive(checked);
              if (checked && selectedFileId) setSelectedScope(selectedFileId);
            }}
          />
          <span>{t("Follow active file")}</span>
        </label>
      </div>

      {/* Scope picker list */}
      <div className="mc-scope-list" role="listbox" aria-label={t("Manuscript content scope")}>
        <button
          type="button"
          role="option"
          aria-selected={selectedScope === "MANUSCRIPT"}
          className={`mc-scope-item ${selectedScope === "MANUSCRIPT" ? "is-selected" : ""}`}
          onClick={() => {
            setFollowActive(false);
            setSelectedScope("MANUSCRIPT");
          }}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="mc-scope-name">{t("Whole manuscript")}</span>
          <span className="mc-scope-meta">
            {t("{{count}} declarations", { count: summary?.declarations.length ?? 0 })}
          </span>
        </button>

        {files.map(file => (
          <button
            type="button"
            role="option"
            key={file.fileId}
            aria-selected={selectedScope === file.fileId}
            className={`mc-scope-item ${selectedScope === file.fileId ? "is-selected" : ""}`}
            onClick={() => {
              setFollowActive(false);
              setSelectedScope(file.fileId);
            }}
          >
            <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="mc-scope-name" title={file.path}>
              {file.path}
              {file.isMain ? ` · ${t("Main")}` : ""}
            </span>
            <span className="mc-scope-meta">
              {file.editors.length > 0
                ? t("{{count}} editors", { count: file.editors.length })
                : t("No edits")}
            </span>
          </button>
        ))}
      </div>

      {/* Selected Scope Detail */}
      {selectedScope === "MANUSCRIPT" ? (
        <section className="mc-scope-detail">
          <div className="mc-section-header">
            <h3>{t("Whole manuscript evidence")}</h3>
            <span className="mc-meta-tag">{t("Manuscript-level")}</span>
          </div>
          <p className="mc-small-note">
            {t("Includes all work declarations, snapshots, reviews, and recorded activities explicitly scoped to this manuscript.")}
          </p>
          <div className="mc-stat-grid">
            <div className="mc-stat-cell">
              <span>{t("Files")}</span>
              <strong>{files.length}</strong>
            </div>
            <div className="mc-stat-cell">
              <span>{t("Declarations")}</span>
              <strong>{summary?.declarations.length ?? 0}</strong>
            </div>
            <div className="mc-stat-cell">
              <span>{t("Participants")}</span>
              <strong>{summary?.contributors.length ?? 0}</strong>
            </div>
          </div>
          {canWrite && summary ? (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() =>
                onOpenDeclare({
                  manuscriptId: summary.manuscriptId,
                  manuscriptTitle: summary.manuscriptTitle,
                  snapshotId: summary.latestSnapshot?.id,
                  filePath: selectedFilePath,
                })
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Declare contribution for manuscript")}
            </Button>
          ) : null}
        </section>
      ) : activeFileItem ? (
        <section className="mc-scope-detail">
          <div className="mc-section-header">
            <h3 title={activeFileItem.path}>{activeFileItem.path}</h3>
            <span className="mc-meta-tag">{t("File-level")}</span>
          </div>

          <div className="mc-file-actions">
            {onNavigateSource ? (
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => onNavigateSource(activeFileItem.fileId, 1)}
              >
                {t("Open file in editor")}
              </Button>
            ) : null}
            {canWrite && summary ? (
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() =>
                  onOpenDeclare({
                    manuscriptId: summary.manuscriptId,
                    manuscriptTitle: summary.manuscriptTitle,
                    snapshotId: summary.latestSnapshot?.id,
                    filePath: activeFileItem.path,
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Declare for this file")}
              </Button>
            ) : null}
          </div>

          {/* Recorded file editors */}
          <div className="mc-file-block">
            <h4>{t("Recorded source editors")}</h4>
            {activeFileItem.editors.length ? (
              <ul className="mc-compact-list">
                {activeFileItem.editors.map(ed => (
                  <li key={ed.userId}>
                    <strong>{ed.name}</strong>
                    <span>{t("{{count}} saved edits", { count: ed.updateCount })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mc-small-note">{t("No saved collaborative edits recorded for this file yet.")}</p>
            )}
          </div>

          {/* Tracked Suggestions: Proposer vs Reviewer */}
          <div className="mc-file-block">
            <h4>
              <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Tracked edit suggestions")} ({activeFileItem.suggestions.total})
            </h4>
            {activeFileItem.suggestions.total > 0 ? (
              <div className="mc-small-stack">
                <p className="mc-small-note">
                  {t("Accepted")}: <strong>{activeFileItem.suggestions.accepted}</strong> ·{" "}
                  {t("Pending")}: <strong>{activeFileItem.suggestions.pending}</strong> ·{" "}
                  {t("Rejected")}: <strong>{activeFileItem.suggestions.rejected}</strong>
                </p>
                {activeFileItem.suggestions.proposers.length > 0 ? (
                  <p className="mc-small-note">
                    {t("Proposed by")}:{" "}
                    {activeFileItem.suggestions.proposers.map(p => p.name).join(", ")}
                  </p>
                ) : null}
                {activeFileItem.suggestions.resolvers.length > 0 ? (
                  <p className="mc-small-note">
                    {t("Reviewed by")}:{" "}
                    {activeFileItem.suggestions.resolvers.map(p => p.name).join(", ")}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mc-small-note">{t("No tracked suggestions in this file.")}</p>
            )}
          </div>

          {/* File comments */}
          <div className="mc-file-block">
            <h4>
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Comments")} ({activeFileItem.comments.total})
            </h4>
            {activeFileItem.comments.total > 0 ? (
              <p className="mc-small-note">
                {t("Open")}: <strong>{activeFileItem.comments.open}</strong> ·{" "}
                {t("Resolved")}: <strong>{activeFileItem.comments.resolved}</strong>
                {activeFileItem.comments.authors.length
                  ? ` · ${activeFileItem.comments.authors.map(a => a.name).join(", ")}`
                  : ""}
              </p>
            ) : (
              <p className="mc-small-note">{t("No file-anchored comments recorded.")}</p>
            )}
          </div>

          {/* Technical stats if present */}
          {activeFileItem.totalWords !== null || activeFileItem.aiAcceptedEdits > 0 ? (
            <div className="mc-file-block">
              <h4>{t("Technical file notes")}</h4>
              {activeFileItem.totalWords !== null ? (
                <p className="mc-small-note">
                  {t("Latest writing report prose words")}: <strong>{activeFileItem.totalWords}</strong>
                </p>
              ) : null}
              {activeFileItem.aiAcceptedEdits > 0 ? (
                <p className="mc-small-note">
                  {t("Accepted AI insertions (separate from human authorship)")}:{" "}
                  <strong>{activeFileItem.aiAcceptedEdits}</strong>
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Live Structural Outline for active .tex file */}
          {outlineItems.length > 0 ? (
            <div className="mc-file-block">
              <div className="mc-section-header">
                <h4>
                  <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("Sections in this file")}
                </h4>
                <span className="mc-meta-tag">{t("Navigation only")}</span>
              </div>
              <p className="mc-small-note">
                {t("Jump to a section in the editor or pre-fill a declaration with its heading. Evidence remains file- or manuscript-scoped.")}
              </p>
              <ul className="mc-outline-list">
                {outlineItems.map(heading => (
                  <li key={heading.line} style={{ paddingLeft: `${Math.max(0, heading.depth - 1) * 10}px` }}>
                    <button
                      type="button"
                      className="mc-outline-jump"
                      onClick={() => onNavigateSource?.(activeFileItem.fileId, heading.line)}
                    >
                      <span>{heading.title}</span>
                      <small>L{heading.line}</small>
                    </button>
                    {canWrite && summary ? (
                      <button
                        type="button"
                        className="mc-outline-declare"
                        title={t("Declare contribution referencing this section")}
                        aria-label={t("Declare contribution for {{section}}", { section: heading.title })}
                        onClick={() =>
                          onOpenDeclare({
                            manuscriptId: summary.manuscriptId,
                            manuscriptTitle: summary.manuscriptTitle,
                            snapshotId: summary.latestSnapshot?.id,
                            filePath: activeFileItem.path,
                            sectionHeading: heading.title,
                          })
                        }
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ActionableDeclarationCard({
  projectId,
  item,
  readOnly,
  onUpdated,
}: {
  projectId: string;
  item: WorkContribution;
  readOnly: boolean;
  onUpdated: () => void;
}) {
  const { t, language } = useI18n();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const reviewMutation = useMutation({
    mutationFn: (decision: "ACKNOWLEDGE" | "ACCEPT" | "NEEDS_CHANGES" | "DISPUTE" | "INSUFFICIENT_INFORMATION") =>
      contributionsApi.review(projectId, item.id, {
        expectedVersion: item.version,
        decision,
        note: note.trim(),
      }),
    onSuccess: () => {
      setNote("");
      setShowNote(false);
      toast.success(t("Response recorded."));
      onUpdated();
    },
    onError: (err: Error) => {
      toast.error(err.message || t("Could not record response."));
    },
  });

  const canAck = item.reviewActions.includes("ACKNOWLEDGE");
  const canAccept = item.reviewActions.includes("ACCEPT");
  const canInsufficient = item.reviewActions.includes("INSUFFICIENT_INFORMATION");
  const canNeedsChanges = item.reviewActions.includes("NEEDS_CHANGES");
  const canDispute = item.reviewActions.includes("DISPUTE");
  const noteReady = note.trim().length >= 10;

  return (
    <article className="mc-ack-card">
      <div className="mc-decl-head">
        <strong>{item.title}</strong>
        <Badge variant="outline" className="mc-badge-xs">
          {t(contributionStatusLabels[item.status] ?? item.status)}
        </Badge>
      </div>
      <p className="mc-small-note">{item.description}</p>
      <ul className="mc-ack-participants">
        {item.participants.map(p => (
          <li key={p.userId}>
            <strong>{p.name}</strong>
            <span>
              {p.roles.length
                ? p.roles.map(r => localizedRoleName(r, language)).join(", ")
                : t("No role specified")}
            </span>
          </li>
        ))}
      </ul>

      {!readOnly && item.reviewActions.length > 0 ? (
        <div className="mc-ack-actions">
          <div className="mc-ack-primary-row">
            {canAck ? (
              <Button
                size="sm"
                type="button"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate("ACKNOWLEDGE")}
              >
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Acknowledge my roles")}
              </Button>
            ) : canAccept ? (
              <Button
                size="sm"
                type="button"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate("ACCEPT")}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Acknowledge as independent peer")}
              </Button>
            ) : null}

            {canInsufficient ? (
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate("INSUFFICIENT_INFORMATION")}
              >
                {t("Not enough information")}
              </Button>
            ) : null}

            {(canNeedsChanges || canDispute) && !showNote ? (
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => setShowNote(true)}
              >
                {t("Request changes or dispute")}
              </Button>
            ) : null}
          </div>

          {showNote && (canNeedsChanges || canDispute) ? (
            <div className="mc-note-box">
              <label>
                <span className="mc-detail-label">{t("Explanation (at least 10 characters)")}</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={note}
                  disabled={reviewMutation.isPending}
                  placeholder={t("Explain what needs correction or why you dispute this record…")}
                  onChange={e => setNote(e.target.value)}
                />
              </label>
              <div className="mc-ack-primary-row">
                {canNeedsChanges ? (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={reviewMutation.isPending || !noteReady}
                    onClick={() => reviewMutation.mutate("NEEDS_CHANGES")}
                  >
                    {t("Request changes")}
                  </Button>
                ) : null}
                {canDispute ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    type="button"
                    disabled={reviewMutation.isPending || !noteReady}
                    onClick={() => reviewMutation.mutate("DISPUTE")}
                  >
                    {t("Challenge attribution")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  disabled={reviewMutation.isPending}
                  onClick={() => {
                    setShowNote(false);
                    setNote("");
                  }}
                >
                  {t("Cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ManuscriptContributionsAckTab({
  projectId,
  manuscriptId,
  summary,
  canWrite,
  onRefresh,
}: {
  projectId: string;
  manuscriptId: string;
  summary?: ManuscriptContributionsSummary;
  canWrite: boolean;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();

  const submitDraftMutation = useMutation({
    mutationFn: (item: WorkContribution) => contributionsApi.submit(projectId, item.id, item.version),
    onSuccess: () => {
      toast.success(t("Submitted for team acknowledgement."));
      void client.invalidateQueries({ queryKey: ["manuscript-contributions"] });
      onRefresh();
    },
    onError: (err: Error) => {
      toast.error(err.message || t("Could not submit declaration."));
    },
  });

  const actionable = summary?.viewerActionableDeclarations ?? [];
  const disputed = summary?.disputedOrClarificationDeclarations ?? [];
  const own = summary?.viewerOwnDeclarations ?? [];
  const attributionCheck = summary?.attributionCheck;
  const statement = summary?.statement;
  const latestSnapshot = summary?.latestSnapshot;

  return (
    <div className="mc-tab-body" role="tabpanel" id="mc-panel-ack" aria-labelledby="mc-tab-ack">
      <p className="mc-small-note">
        {t("Acknowledgement confirms reported work and CRediT roles — it does not decide authorship eligibility, author order, or scientific quality.")}
      </p>

      {/* Priority 1: Actionable items for current viewer */}
      <section className="mc-section" aria-label={t("Needs my review")}>
        <div className="mc-section-header">
          <h3>
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Needs my review")}
          </h3>
          <span className="mc-count-pill">{actionable.length}</span>
        </div>

        {attributionCheck?.viewerCanDecide ? (
          <div className="mc-alert-box is-pending" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{t("A pre-submission authorship attribution check awaits your own confirmation below.")}</p>
          </div>
        ) : null}

        {actionable.length ? (
          <div className="mc-stack">
            {actionable.map(item => (
              <ActionableDeclarationCard
                key={`${item.id}:${item.version}`}
                projectId={projectId}
                item={item}
                readOnly={!canWrite || item.readOnly}
                onUpdated={onRefresh}
              />
            ))}
          </div>
        ) : (
          <p className="mc-empty-note">{t("No manuscript contribution records currently require your review.")}</p>
        )}
      </section>

      {/* Priority 2: Open disputes or clarifications */}
      {disputed.length > 0 ? (
        <section className="mc-section" aria-label={t("Disputes & clarifications")}>
          <div className="mc-section-header">
            <h3>
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
              {t("Disputes & clarifications")}
            </h3>
            <span className="mc-count-pill">{disputed.length}</span>
          </div>
          <ul className="mc-decl-list">
            {disputed.map(item => {
              const latestChallenge = [...item.reviews]
                .reverse()
                .find(r => ["DISPUTE", "NEEDS_CHANGES"].includes(r.decision));
              return (
                <li key={item.id} className="mc-decl-row is-disputed">
                  <div className="mc-decl-head">
                    <strong>{item.title}</strong>
                    <Badge variant="destructive" className="mc-badge-xs">
                      {t(contributionStatusLabels[item.status] ?? item.status)}
                    </Badge>
                  </div>
                  {latestChallenge?.note ? (
                    <p className="mc-small-note">
                      <strong>{latestChallenge.name}:</strong> {latestChallenge.note}
                    </p>
                  ) : null}
                  <Link
                    className="mc-inline-link"
                    to={`/projects/${encodeURIComponent(projectId)}?tab=contributions&contributionTab=work&contributionId=${encodeURIComponent(item.id)}`}
                  >
                    {t("Open in Project Contributions")}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Priority 3: Viewer's own drafts & declarations */}
      <section className="mc-section" aria-label={t("My declarations")}>
        <div className="mc-section-header">
          <h3>{t("My declarations")}</h3>
          <span className="mc-count-pill">{own.length}</span>
        </div>
        {own.length ? (
          <ul className="mc-decl-list">
            {own.map(item => (
              <li key={item.id} className="mc-decl-row">
                <div className="mc-decl-head">
                  <strong>{item.title}</strong>
                  <Badge variant="outline" className="mc-badge-xs">
                    {t(contributionStatusLabels[item.status] ?? item.status)}
                  </Badge>
                </div>
                <div className="mc-decl-footer">
                  {item.status === "DRAFT" && item.canManage && canWrite ? (
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      disabled={submitDraftMutation.isPending}
                      onClick={() => submitDraftMutation.mutate(item)}
                    >
                      {t("Submit for acknowledgement")}
                    </Button>
                  ) : null}
                  <Link
                    className="mc-inline-link"
                    to={`/projects/${encodeURIComponent(projectId)}?tab=contributions&contributionTab=work&contributionId=${encodeURIComponent(item.id)}`}
                  >
                    {t("View details")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mc-empty-note">{t("You have not declared any work on this manuscript yet.")}</p>
        )}
      </section>

      {/* Priority 4: Contribution Statement & Governance Links */}
      <section className="mc-governance-box" aria-label={t("Contribution statement and governance")}>
        <div className="mc-section-header">
          <h3>
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Statement & pre-submission checks")}
          </h3>
        </div>

        {statement ? (
          <div className="mc-statement-status">
            <span className={`mc-status-badge ${statement.ready ? "is-confirmed" : "is-pending"}`}>
              {statement.ready
                ? t("CRediT statement ready")
                : statement.pendingCount > 0
                  ? t("{{count}} pending records before statement", { count: statement.pendingCount })
                  : t("No acknowledged CRediT roles yet")}
            </span>
            {statement.statement ? (
              <p className="mc-statement-preview">{statement.statement}</p>
            ) : null}
          </div>
        ) : null}

        {latestSnapshot ? (
          <div className="mc-attribution-trigger">
            <ManuscriptAttributionDialog
              projectId={projectId}
              manuscriptId={manuscriptId}
              snapshotId={latestSnapshot.id}
              snapshotLabel={latestSnapshot.label}
              sourceVersion={latestSnapshot.sourceVersion}
              canWrite={canWrite}
            />
          </div>
        ) : (
          <p className="mc-small-note">
            {t("Save a snapshot in Version history to run a Pre-Submission Attribution Check.")}
          </p>
        )}

        <nav className="mc-deep-links" aria-label={t("Contribution governance links")}>
          <Link to={`/projects/${encodeURIComponent(projectId)}?tab=contributions`}>
            {t("Project Contributions")}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
          <Link
            to={`/projects/${encodeURIComponent(projectId)}/manuscripts/${encodeURIComponent(manuscriptId)}/integrity${latestSnapshot ? `?snapshot=${encodeURIComponent(latestSnapshot.id)}` : ""}`}
          >
            {t("Research Integrity Center")}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        </nav>
      </section>
    </div>
  );
}
