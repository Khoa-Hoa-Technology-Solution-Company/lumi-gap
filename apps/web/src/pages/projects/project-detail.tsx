import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useProject } from "@/features/projects/hooks/use-projects";
import { useQueryClient } from "@tanstack/react-query";
import { useReports, useCreateReport, useUpdateArtifactStatus } from "@/features/reports/hooks/use-reports";
import { useGaps, useAnalyzeGap, useGapAnalysisStatus, useActiveGapAnalysis } from "@/features/gaps";
import { GapDetailDrawer } from "@/features/gaps/components/gap-detail-drawer";
import { GapAnalysisWorkflow } from "@/features/gaps/components/gap-analysis-workflow";
import { ResearchGapProposal } from "@/features/projects/components/research-gap-proposal";
import { assessmentLabels } from "@/features/projects/components/research-gap-evaluation";
import { ProjectDiscussionPanel } from "@/features/projects/components/project-discussion-panel";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { AnalyzeGapRequest, GapAssessment, IProject, ReportLanguage, ResearchArtifactType, ResearchGapItem } from "@trend/shared-types";
import { ProjectLiteratureWorkspace } from "@/features/projects/components/project-literature-workspace";
import { ResearchLiterature } from "@/features/projects/components/research-literature";
import { type ProjectTab } from "@/features/projects/components/project-section-nav";
import { WorkspaceOverviewPanel, WorkspaceStage, WorkspaceStageSelector } from "@/features/projects/components/workspace-overview";
import { useWorkspaceOverview } from "@/features/projects/hooks/use-workspace";
import { WorkspacePlanPanel } from "@/features/projects/components/workspace-plan";
import { WorkspaceTasksPanel } from "@/features/projects/components/workspace-tasks";
import { WorkspaceDiscussionsPanel } from "@/features/projects/components/workspace-discussions";
import { canLeaveWorkspace } from "@/features/projects/components/workspace-common";
import { ProjectSectionContent } from "@/features/projects/components/project-section-content";
import "@/features/projects/project-workspace.css";
import { ProjectPaperPickerDialog, type PaperPickerSource } from "@/features/projects/components/project-paper-picker-dialog";
import { SubmitReviewDialog } from "@/features/reviews/components/submit-review-dialog";
import { useReviewCenter, type ReviewCenterItem } from "@/features/reviews";

import { toast } from "sonner";
import { Archive, FileText, Plus, Loader2, XCircle, Sparkles, MessageSquare, Settings2, ShieldCheck, ChevronRight, LockKeyhole, Globe2, UsersRound, Clock3, Compass, FolderGit2, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { MentorProjectPanel } from "@/pages/academics/academic-support";
import { ProjectTeamSettings } from "@/features/projects/components/project-team-settings";
import { ProjectNextSteps } from "@/features/projects/components/project-next-steps";
import { ProjectContributionsWorkspace } from "@/features/projects/components/project-contributions-workspace";
import { ManuscriptsPanel } from "@/features/manuscripts/manuscripts-panel";
import { useI18n } from "@/i18n";

const ProjectSubmissionsPanel = lazy(() => import("@/features/projects/components/project-submissions-panel").then(m => ({ default: m.ProjectSubmissionsPanel })));

export function ProjectDetailPage() {
  const currentUser = useAuthStore(s => s.user);
  const { t, language } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, isError, isFetching, refetch } = useProject(id);
  const resolvedProjectId = project?._id ?? id ?? "";
  const overview = useWorkspaceOverview(resolvedProjectId, Boolean(project && !project.isPublicSummary));
  const mentorCount = overview.data?.mentors?.length ?? 0;
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: ProjectTab = ["overview", "plan", "tasks", "papers", "members", "contributions", "reports", "gaps", "chat", "support", "submissions", "manuscripts"].includes(tabParam ?? "") ? tabParam as ProjectTab : "overview";
  const setActiveTab = async (tab: ProjectTab, settings = false) => {
    if (!(await canLeaveWorkspace())) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    params.delete("submission");
    if (settings) params.set("team", "settings"); else params.delete("team");
    setSearchParams(params, { replace: true });
  };
  const [autoOpenReport, setAutoOpenReport] = useState(false);
  const [autoOpenGap, setAutoOpenGap] = useState(false);
  const [paperPickerOpen, setPaperPickerOpen] = useState(false);
  const [paperPickerSource, setPaperPickerSource] = useState<PaperPickerSource>("search");
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);

  const relativeActivity = (value: string) => {
    const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
    if (!Number.isFinite(elapsed)) return t("Date unavailable");
    const unit = elapsed < 60 * 60 * 1000 ? "minute" : elapsed < 24 * 60 * 60 * 1000 ? "hour" : "day";
    const divisor = unit === "minute" ? 60_000 : unit === "hour" ? 3_600_000 : 86_400_000;
    const amount = Math.max(1, Math.floor(elapsed / divisor));
    return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(-amount, unit);
  };

  if (isLoading) {
    return (
      <div className="project-workspace" role="status" aria-busy="true">
        <span className="sr-only">{t("Loading projects...")}</span>
        <div className="project-page-width project-detail-page" aria-hidden="true">
          <Skeleton className="mb-[26px] h-5 w-40 rounded" />
          <div className="flex items-start gap-4">
            <Skeleton className="h-[68px] w-[68px] shrink-0 rounded-md" />
            <div className="w-full max-w-lg space-y-3"><Skeleton className="h-4 w-32 rounded" /><Skeleton className="h-10 w-3/4 rounded" /></div>
          </div>
          <Skeleton className="mt-[22px] h-9 w-64 max-w-full rounded" />
          <div className="project-workspace-shell">
            <Skeleton className="h-[62px] w-full rounded-none" />
            <Skeleton className="mt-7 h-8 w-52 rounded" />
            <Skeleton className="mt-6 h-[310px] w-full rounded-none" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="project-workspace">
        <div className="project-page-width">
          <Link to="/projects" className="project-breadcrumb hover:text-primary">{t("Back to projects")}</Link>
          <div className="border-y py-12 text-center text-muted-foreground" role="status">
            <p>{isError ? t("The project could not be loaded. Refresh and try again.") : t("Project not found or you do not have access.")}</p>
            {isError ? <Button variant="outline" className="mt-4" disabled={isFetching} onClick={() => void refetch()}>{t("Try again")}</Button> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="project-workspace">
      <div className="project-page-width project-detail-page">

        <header className="project-detail-intro coord-project-intro" data-no-i18n>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                <FolderGit2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <nav className="project-breadcrumb" aria-label={t("Projects")}>
                  <Link to="/projects" className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">{t("Projects")}</Link>
                  <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />
                  <span className="truncate max-w-[240px] text-muted-foreground">{project.title}</span>
                </nav>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-tight truncate">
                    {project.title}
                  </h1>
                  <span className="project-status-tag" data-status={project.status}>
                    {t({ ACTIVE: "Active", PLANNING: "Planning", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" }[project.status])}
                  </span>
                  {project.researchField ? (
                    <span className="project-detail-scope">
                      <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{project.researchField}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center mt-2 sm:mt-0">
              {!project.isPublicSummary && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab("members")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/80 bg-background/80 hover:bg-accent/60 hover:text-foreground text-muted-foreground text-xs font-semibold transition-all shadow-xs cursor-pointer"
                    title={t("Team members")}
                  >
                    <UsersRound className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                    <span>{t("Team")} · <strong className="text-foreground font-semibold">{project.memberCount}</strong></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("support")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/80 bg-background/80 hover:bg-accent/60 hover:text-foreground text-muted-foreground text-xs font-semibold transition-all shadow-xs cursor-pointer"
                    title={t("Academic mentors")}
                  >
                    <GraduationCap className="h-3.5 w-3.5 text-purple-500" aria-hidden="true" />
                    <span>{t("Mentors")} · <strong className="text-foreground font-semibold">{mentorCount}</strong></span>
                  </button>
                </>
              )}
              {project.accessRole ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg font-semibold text-xs h-8 px-3 border-border/80 shadow-xs hover:border-primary/40 hover:text-primary shrink-0"
                  onClick={() => setActiveTab("members", true)}
                >
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                  {t("Project settings")}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="project-detail-meta">
            {!project.isPublicSummary && (
              <WorkspaceStageSelector projectId={project._id} />
            )}
            <span className="inline-flex items-center gap-1.5">
              {["PUBLIC", "PUBLIC_SUMMARY"].includes(project.visibility) ? <Globe2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> : project.visibility === "INVITE_ONLY" ? <UsersRound className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" /> : <LockKeyhole className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
              {t(project.visibility === "PRIVATE" ? "Private" : project.visibility === "INVITE_ONLY" ? "Invite only" : "Public summary")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
              {t("Updated {{time}}", { time: relativeActivity(project.updatedAt) })}
            </span>
          </div>
        </header>
        {project.status === "ARCHIVED" ? <p role="status" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground"><Archive className="h-4 w-4 shrink-0" />{t("Archived projects are read-only.")}</p> : null}

        {project.isPublicSummary ? (
          <div className="rounded-lg border bg-card p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 text-lg font-semibold">{t("Public project summary")}</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{t("Papers, member details, reports, candidate gaps, contributions and chat are available only to current project members.")}</p></div>
        ) : <>
        <ProjectNextSteps key={project._id} project={project} onAddPaper={() => { setPaperPickerSource("search"); setPaperPickerOpen(true); }} onNavigate={(tab, settings) => setActiveTab(tab, settings)} />
        <div className="project-workspace-shell">
        <ProjectSectionContent activeTab={activeTab}>
          {activeTab === "overview" && <section id="project-panel-overview" role="tabpanel" aria-labelledby="project-tab-overview"><WorkspaceOverviewPanel project={project} /></section>}
          {activeTab === "manuscripts" && <section id="project-panel-manuscripts" role="tabpanel" aria-labelledby="project-tab-manuscripts"><ManuscriptsPanel projectId={project._id} readOnly={project.status === "ARCHIVED" || !project.accessRole} /></section>}
          {activeTab === "plan" && <section id="project-panel-plan" role="tabpanel" aria-labelledby="project-tab-plan"><WorkspacePlanPanel projectId={project._id} /></section>}
          {activeTab === "tasks" && <section id="project-panel-tasks" role="tabpanel" aria-labelledby="project-tab-tasks"><WorkspaceTasksPanel projectId={project._id} readOnly={project.status === "ARCHIVED" || !project.accessRole} /></section>}
          {activeTab === "submissions" && <section id="project-panel-submissions" role="tabpanel" aria-labelledby="project-tab-submissions">
            <Suspense fallback={<Skeleton className="h-48 w-full" />}><ProjectSubmissionsPanel projectId={project._id} projectTitle={project.title} readOnly={project.status === "ARCHIVED" || !project.accessRole} /></Suspense>
          </section>}
          {activeTab === "papers" && (
            <section id="project-panel-papers" role="tabpanel" aria-labelledby="project-tab-papers">
              <ResearchLiterature projectId={project._id} readOnly={project.status === "ARCHIVED" || !project.accessRole}>
              <ProjectLiteratureWorkspace
                projectId={project._id}
                papers={project.papers}
                criteria={project.screeningCriteria}
                screeningMode={project.screeningMode}
                isOwner={project.accessRole === "OWNER"}
                readOnly={project.status === "ARCHIVED" || !project.accessRole}
                onRequestAddPaper={(source = "search") => { setPaperPickerSource(source); setPaperPickerOpen(true); }}
                onViewEvidence={() => { setAutoOpenGap(false); setActiveTab("gaps"); }}
                onNavigateToReports={() => {
                  setActiveTab("reports");
                  setAutoOpenReport(true);
                }}
                onNavigateToGaps={() => {
                  setActiveTab("gaps");
                  setAutoOpenGap(true);
                }}
              />
              </ResearchLiterature>
            </section>
          )}
          {activeTab === "members" && (
            <section id="project-panel-members" role="tabpanel" aria-labelledby="project-tab-members">
              <ProjectTeamSettings key={project._id} project={project} />
            </section>
          )}
          {activeTab === "support" && <div role="tabpanel" id="project-panel-support" aria-labelledby="project-tab-support"><MentorProjectPanel projectId={id!} /></div>}
          {activeTab === "contributions" && (
            <section id="project-panel-contributions" role="tabpanel" aria-labelledby="project-tab-contributions">
              <ProjectContributionsWorkspace
                projectId={project._id}
                currentUserId={currentUser?.id ?? ""}
                isOwner={project.accessRole === "OWNER"}
                readOnly={project.status === "ARCHIVED"}
              />
            </section>
          )}
          {activeTab === "reports" && (
            <section id="project-panel-reports" role="tabpanel" aria-labelledby="project-tab-reports">
              <ReportsTab
                projectId={project._id}
                defaultTopic={project.title}
                canRequestReview={project.ownerId === currentUser?.id}
                openOnInit={autoOpenReport}
                onOpenChange={setAutoOpenReport}
                draft={reportDraft}
                onDraftConsumed={() => setReportDraft(null)}
              />
            </section>
          )}
          {activeTab === "gaps" && (
            <section id="project-panel-gaps" role="tabpanel" aria-labelledby="project-tab-gaps">
              <GapsTab
                projectId={project._id}
                projectPapers={project.papers ?? []}
                defaultTopic={project.title}
                openOnInit={autoOpenGap}
                onOpenChange={setAutoOpenGap}
                onDraftProposal={(gap) => {
                  setReportDraft(buildProposalDraft(gap, project.papers ?? []));
                  setActiveTab("reports");
                }}
              />
            </section>
          )}
          {activeTab === "chat" && (
            <section id="project-panel-chat" role="tabpanel" aria-labelledby="project-tab-chat">
              <WorkspaceDiscussionsPanel projectId={project._id} readOnly={project.status === "ARCHIVED" || !project.accessRole} owner={project.accessRole === "OWNER"} legacyChat={<ProjectDiscussionPanel
                projectId={project._id}
                paperCount={project.papers?.length || 0}
                ownerId={project.ownerId}
                onAddPapers={() => { if (project.status !== "ARCHIVED") { setPaperPickerSource("search"); setPaperPickerOpen(true); } }}
              />} />
            </section>
          )}
        </ProjectSectionContent>
        </div>
        <ProjectPaperPickerDialog
          initialSource={paperPickerSource}
          readOnly={project.status === "ARCHIVED" || !project.accessRole}
          projectId={project._id}
          papers={project.papers ?? []}
          open={paperPickerOpen}
          onOpenChange={setPaperPickerOpen}
        />
        </>}
      </div>
    </div>
  );
}

const REVIEW_TONES: Record<string, string> = {
  REQUESTED: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  REVISION_REQUESTED: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  DECLINED: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
  EXPIRED: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
};
const REVIEW_TONE_IN_PROGRESS = "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300";
const CLOSED_REVIEW_STATUSES = ["DECLINED", "CANCELLED", "EXPIRED"];

function ReviewProgressBadge({ item }: { item: ReviewCenterItem }) {
  const { t } = useI18n();
  const name = item.reviewer.fullName;
  const labels: Record<string, string> = {
    REQUESTED: t("Waiting for {{name}} to accept", { name }),
    ACCEPTED: t("{{name}} is reviewing", { name }),
    IN_REVIEW: t("{{name}} is reviewing", { name }),
    SUBMITTED: t("{{name}} is reviewing", { name }),
    REVISION_REQUESTED: t("Revision requested by {{name}}", { name }),
    RESUBMITTED: t("Revision sent back to {{name}}", { name }),
    COMPLETED: t("Review completed by {{name}}", { name }),
    DECLINED: t("{{name}} declined the review", { name }),
    CANCELLED: t("Review request cancelled"),
    EXPIRED: t("Review request expired"),
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${REVIEW_TONES[item.status] ?? REVIEW_TONE_IN_PROGRESS}`}>
      {labels[item.status] ?? item.status.replaceAll("_", " ")}
    </span>
  );
}

/** Prefilled "New Report" form, e.g. a research proposal drafted from a research gap. */
type ReportDraft = { title: string; topic: string; query: string; artifactType: ResearchArtifactType; selectedPaperIds: string[]; sourceGapTitle: string };

const MAX_REPORT_SELECTED_PAPERS = 20; // CreateReportSchema.selectedPaperIds limit

function buildProposalDraft(gap: ResearchGapItem, projectPapers: IProject["papers"]): ReportDraft {
  // Reports scoped to a project reject papers outside it, so keep only the gap's evidence still in the project.
  const projectPaperIds = new Set(projectPapers.map((paper) => (typeof paper.targetId === "string" ? paper.targetId : paper.targetId._id)));
  const evidenceIds = [...new Set([...gap.supportingPaperIds, ...gap.evidencePaperIds])].filter((id) => projectPaperIds.has(id));
  const question = gap.suggestedResearchQuestion?.trim()
    || `Write a research proposal that addresses this research gap: "${gap.title}". ${gap.description}`;
  return {
    title: `Research proposal: ${gap.title}`.slice(0, 240),
    topic: gap.topic.slice(0, 200),
    query: question.slice(0, 500),
    artifactType: "RESEARCH_PROPOSAL",
    selectedPaperIds: evidenceIds.slice(0, MAX_REPORT_SELECTED_PAPERS),
    sourceGapTitle: gap.title,
  };
}

function ReportsTab({
  canRequestReview,
  projectId,
  defaultTopic,
  openOnInit,
  onOpenChange,
  draft,
  onDraftConsumed
}: {
  canRequestReview?: boolean;
  projectId: string;
  defaultTopic?: string;
  openOnInit?: boolean;
  onOpenChange?: (open: boolean) => void;
  draft?: ReportDraft | null;
  onDraftConsumed?: () => void;
}) {
  const { t } = useI18n();
  const { data: reports, isLoading } = useReports(projectId);
  const createReport = useCreateReport();
  const reviewCenter = useReviewCenter();
  // Only the requester (and reviewer) can open review feedback, so link the current user's own requests.
  // Per artifact show the request that matters most: an active one, else a completed one, else the latest closed one.
  const reviewByReport = useMemo(() => {
    const rank = (item: ReviewCenterItem) => (CLOSED_REVIEW_STATUSES.includes(item.status) ? 0 : item.status === "COMPLETED" ? 1 : 2);
    const map = new Map<string, ReviewCenterItem>();
    for (const item of reviewCenter.data?.sent ?? []) { // sent is newest first
      const reportId = item.artifact.sourceReportId;
      if (!reportId) continue;
      const current = map.get(reportId);
      if (!current || rank(item) > rank(current)) map.set(reportId, item);
    }
    return map;
  }, [reviewCenter.data]);
  const updateArtifactStatus = useUpdateArtifactStatus();

  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(defaultTopic || "");
  const [reportTitle, setReportTitle] = useState("");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<ReportLanguage>("auto");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [deepAnalysis, setDeepAnalysis] = useState(false);
  const [fast, setFast] = useState(true);
  const [artifactType, setArtifactType] = useState<ResearchArtifactType>("GENERAL_REPORT");
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [draftSource, setDraftSource] = useState<string | null>(null);

  // Open the form prefilled when a draft arrives (e.g. from a research gap).
  useEffect(() => {
    if (!draft) return;
    setReportTitle(draft.title);
    setTopic(draft.topic);
    setQuery(draft.query);
    setArtifactType(draft.artifactType);
    setSelectedPaperIds(draft.selectedPaperIds);
    setDraftSource(draft.sourceGapTitle);
    setOpen(true);
    onDraftConsumed?.();
  }, [draft, onDraftConsumed]);

  const clearDraftScope = () => {
    setSelectedPaperIds([]);
    setDraftSource(null);
  };

  // Sync openOnInit
  useEffect(() => {
    if (openOnInit) {
      setOpen(true);
      onOpenChange?.(false);
    }
  }, [openOnInit, onOpenChange]);

  // Sync defaultTopic when dialog opens (a draft brings its own topic)
  useEffect(() => {
    if (open && defaultTopic && !draftSource) {
      setTopic(defaultTopic);
    }
  }, [open, defaultTopic, draftSource]);

  const handleGenerate = async () => {
    if (!query.trim()) {
      toast.error("Please enter a question for the AI to analyze");
      return;
    }

    const fromYear = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const toYear = yearTo ? parseInt(yearTo, 10) : undefined;

    if (fromYear && toYear && fromYear > toYear) {
      toast.error("Year From must be less than or equal to Year To");
      return;
    }

    try {
      await createReport.mutateAsync({
        query: query.trim(),
        title: reportTitle.trim() || undefined,
        topic: topic.trim() || undefined,
        language,
        deepAnalysis,
        fast,
        projectId,
        artifactType,
        selectedPaperIds: selectedPaperIds.length ? selectedPaperIds : undefined,
        yearFrom: fromYear,
        yearTo: toYear
      });
      setOpen(false);
      setTopic(defaultTopic || "");
      setReportTitle("");
      setQuery("");
      setYearFrom("");
      setYearTo("");
      setLanguage("auto");
      setDeepAnalysis(false);
      setFast(true);
      setArtifactType("GENERAL_REPORT");
      clearDraftScope();
      toast.success("Report generation started");
    } catch (error: any) {
      console.error("Failed to create report:", error);
      const errMsg = error.response?.data?.error?.message || "Failed to create report. Please try again.";
      toast.error(errMsg);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Project Reports</h3>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) clearDraftScope(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" /> New Report</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create AI Report</DialogTitle>
              <DialogDescription>
                Generate a comprehensive analysis report for this project.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {draftSource && (
                <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs leading-relaxed text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200">
                  <p>{t("Drafted from research gap \"{{title}}\".", { title: draftSource })}</p>
                  <p className="mt-1">
                    {selectedPaperIds.length
                      ? t("Evidence limited to the gap's {{count}} paper(s) in this project.", { count: selectedPaperIds.length })
                      : t("All project papers will be used as evidence.")}
                    {selectedPaperIds.length > 0 && (
                      <button type="button" onClick={() => setSelectedPaperIds([])} className="ml-1 font-semibold underline underline-offset-2">
                        {t("Use all project papers")}
                      </button>
                    )}
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-2"><Label htmlFor="report-title">Title</Label><Input id="report-title" value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} maxLength={240} placeholder="e.g. Evidence synthesis for adaptive learning" /></div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="artifact-type">Artifact type</Label>
                <select id="artifact-type" value={artifactType} onChange={(event) => setArtifactType(event.target.value as ResearchArtifactType)} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="LITERATURE_REVIEW">Literature review</option><option value="EVIDENCE_SYNTHESIS">Evidence synthesis</option><option value="GAP_ANALYSIS">Gap analysis</option><option value="RESEARCH_PROPOSAL">Research proposal</option><option value="RESEARCH_PLAN">Research plan</option><option value="GENERAL_REPORT">General report</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="topic">Topic / Keyword</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. LLM in Education"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="query">Question</Label>
                <textarea
                  id="query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What should the AI analyze?"
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none font-medium"
                />

                {/* PR1: Template query actions */}
                <div className="flex flex-wrap gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => setQuery("Summarize the key trends and methodologies in these papers.")}
                    className="text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded transition-colors"
                  >
                    Summarize Trends
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuery("Identify the major research gaps and literature scarcity in this project.")}
                    className="text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded transition-colors"
                  >
                    Find Gaps
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuery("Suggest future research directions and potential next steps based on these findings.")}
                    className="text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded transition-colors"
                  >
                    Next Steps
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-2">
                  <Label htmlFor="project-year-from">Year From</Label>
                  <Input
                    id="project-year-from"
                    type="number"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    placeholder="2020"
                    className="h-10 text-center"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <Label htmlFor="project-year-to">Year To</Label>
                  <Input
                    id="project-year-to"
                    type="number"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    placeholder="2026"
                    className="h-10 text-center"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="project-report-language">Report language</Label>
                <select
                  id="project-report-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as ReportLanguage)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="auto">Auto-detect from topic and question</option>
                  <option value="en">English</option>
                  <option value="vi">Vietnamese</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Choose English to force all report sections and research gaps to English.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} className="rounded border-gray-300" />
                <span className="font-semibold">Fast Mode</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={deepAnalysis} onChange={(e) => setDeepAnalysis(e.target.checked)} className="rounded border-gray-300" />
                <span className="font-semibold">Deep Analysis</span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={createReport.isPending}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={createReport.isPending}>
                {createReport.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" /></div>
      ) : reports && reports.length > 0 ? (
        <div className="rounded-2xl border bg-card divide-y divide-border/50">
          {reports.map(report => {
            const reviewRequest = reviewByReport.get(report.id);
            const underReview = (report.artifactReview?.activeRequestCount ?? 0) > 0;
            const canFinalize = (report.artifactReview?.completedRequestCount ?? 0) > 0;
            const hasOpenReview = reviewRequest !== undefined && !CLOSED_REVIEW_STATUSES.includes(reviewRequest.status);
            return (
            <div key={report.id} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:bg-muted/30 transition-colors">
              <div className="flex items-start gap-4 w-full sm:w-auto">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <Link to={`/reports/${report.id}`} className="font-semibold hover:text-primary transition-colors block truncate">
                    {report.title || report.topic || 'AI Report'}
                  </Link>
                  <p className="text-sm text-muted-foreground line-clamp-1 mt-1 max-w-xl">{report.query}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{report.artifactType?.replaceAll("_", " ") || "GENERAL REPORT"}</Badge>{report.isAiGenerated ? <Badge variant="secondary">AI-generated draft</Badge> : null}<select aria-label={`Artifact status for ${report.topic || "report"}`} value={report.artifactStatus || "DRAFT"} disabled={underReview} title={underReview ? t("The status is locked while the artifact is under review.") : t("Reviewing is set when you submit for review. Final needs a completed review.")} onChange={async (event) => { try { await updateArtifactStatus.mutateAsync({ id: report.id, status: event.target.value as "DRAFT" | "REVIEWING" | "FINAL" | "ARCHIVED" }); toast.success("Artifact status updated"); } catch (error) { const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message; toast.error(message || "Could not update artifact status"); } }} className="h-7 rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-70"><option value="DRAFT">Draft</option><option value="REVIEWING" disabled={!underReview}>Reviewing</option><option value="FINAL" disabled={!canFinalize}>Final</option><option value="ARCHIVED">Archived</option></select>{reviewRequest ? <ReviewProgressBadge item={reviewRequest} /> : null}</div>
                </div>
              </div>
              <div className="flex items-center gap-6 w-full sm:w-auto sm:justify-end ml-14 sm:ml-0">
                {reviewRequest && (hasOpenReview || reviewRequest.latestReview) ? (
                  <Button asChild size="sm" variant={reviewRequest.latestReview ? "default" : "outline"}>
                    <Link to={`/review-requests/${reviewRequest.id}`}>
                      <MessageSquare className="w-4 h-4 mr-1.5" />
                      {reviewRequest.latestReview ? t("View feedback") : t("View review request")}
                    </Link>
                  </Button>
                ) : null}
                {canRequestReview && report.status === "ready" && report.artifactStatus !== "ARCHIVED" ? <SubmitReviewDialog reportId={report.id} artifactTitle={report.title || report.topic || "Research artifact"} artifactType={report.artifactType} trigger={<Button size="sm" variant="outline">{hasOpenReview ? t("Request another review") : t("Submit for Review")}</Button>} /> : null}
                <Badge
                  variant={report.status === 'ready' ? 'default' : report.status === 'failed' ? 'destructive' : 'secondary'}
                  className={`rounded-full ${report.status === 'ready' ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' : ''}`}
                >
                  {report.status}
                </Badge>
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm mb-4">
            <FileText className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h4 className="text-lg font-semibold tracking-tight mb-2">{t("No research artifacts yet")}</h4>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {t("Create a research artifact from your project evidence and analysis.")}
          </p>
          <Button onClick={() => setOpen(true)} variant="outline" className="rounded-full shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            {t("Generate first report")}
          </Button>
        </div>
      )}
    </div>
  );
}

function AnalysisPoller({ analysisId, onDone }: { analysisId: string; onDone: () => void }) {
  const { data } = useGapAnalysisStatus(analysisId);
  const { t } = useI18n();

  useEffect(() => {
    if (data?.status === "ready") {
      onDone();
    }
  }, [data?.status, onDone]);

  if (data?.status === "failed") {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 text-sm flex items-center gap-2 mb-4">
        <XCircle className="w-4 h-4" />
        {data.errorMessage ?? t("Analysis failed.")}
      </div>
    );
  }
  if (data?.status === "ready") return null;
  return (
    <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 p-4 rounded-lg flex items-center gap-3 mb-4 shadow-sm">
      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
        {data?.status === "analyzing" ? t("Analyzing documents with AI...") : t("Queued for analysis...")}
      </p>
    </div>
  );
}

function GapsTab({
  projectId,
  projectPapers,
  defaultTopic,
  openOnInit,
  onOpenChange,
  onDraftProposal
}: {
  projectId: string;
  projectPapers: IProject["papers"];
  defaultTopic?: string;
  openOnInit?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDraftProposal?: (gap: ResearchGapItem) => void;
}) {
  const [assessment, setAssessment] = useState<GapAssessment | "">("");
  const [page, setPage] = useState(1), [propose, setPropose] = useState(false);
  const { data: currentProject } = useProject(projectId);
  const readOnly = currentProject?.status === "ARCHIVED";
  const { data: gapsData, isLoading, refetch } = useGaps({ projectId, status: "active", page, pageSize: 20, assessmentStatus: assessment || undefined, sortBy: "newest" });
  const analyze = useAnalyzeGap();
  const queryClient = useQueryClient();
  const { data: activeAnalysis } = useActiveGapAnalysis(projectId);
  const [selectedGap, setSelectedGap] = useState<ResearchGapItem | null>(null);
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);

  // Sync openOnInit
  useEffect(() => {
    if (openOnInit) {
      setOpen(true);
      onOpenChange?.(false);
    }
  }, [openOnInit, onOpenChange]);

  // Resume polling a run started earlier in this project (tab switch, reload).
  useEffect(() => {
    if (activeAnalysis && (activeAnalysis.status === "queued" || activeAnalysis.status === "analyzing")) {
      setActiveAnalysisId(activeAnalysis.id);
    }
  }, [activeAnalysis]);

  const handleAnalyze = (payload: AnalyzeGapRequest) => {
    analyze.mutate(payload, {
      onSuccess: ({ analysisId }) => {
        setOpen(false);
        setActiveAnalysisId(analysisId);
        toast.success(t("Gap analysis queued with the reviewed evidence pack."));
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.error?.message || t("Failed to trigger gap analysis."));
      }
    });
  };

  const handleDone = useCallback(() => {
    setActiveAnalysisId(null);
    void queryClient.invalidateQueries({ queryKey: ["activeGapAnalysis", projectId] });
    void refetch();
  }, [projectId, queryClient, refetch]);

  return (
    <div className="space-y-4 mt-2">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div><h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{t("Candidate Research Gaps")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("AI-assisted results are candidates for review, not validated research conclusions.")}</p></div>

        <div className="flex flex-wrap items-center gap-3">
          <select aria-label={t("Team assessment")} value={assessment} onChange={e => { setAssessment(e.target.value as GapAssessment | ""); setPage(1); }} className="h-10 rounded-md border bg-white px-3 text-sm">
            <option value="">{t("All candidates")}</option>{Object.entries(assessmentLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          </select>
          {!readOnly && <Button variant="outline" onClick={async () => { if ((await canLeaveWorkspace())) setPropose(value => !value); }}>{t("Propose candidate")}</Button>}
          <Button size="sm" className="rounded-full shadow-sm shrink-0" onClick={() => setOpen((current) => !current)} disabled={readOnly || Boolean(activeAnalysisId)}>
            <Sparkles className="w-4 h-4 mr-2" /> {open ? t("Close gap analysis") : t("New Gap Analysis")}
          </Button>
        </div>
      </div>

      {propose && <ResearchGapProposal projectId={projectId} topic={defaultTopic ?? ""} onClose={() => setPropose(false)} />}
      {open && !readOnly && (
        <GapAnalysisWorkflow
          isAnalyzing={analyze.isPending}
          onAnalyze={handleAnalyze}
          projectId={projectId}
          projectPapers={projectPapers}
          defaultTopic={defaultTopic}
        />
      )}

      {activeAnalysisId && (
        <AnalysisPoller
          analysisId={activeAnalysisId}
          onDone={handleDone}
        />
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" /></div>
      ) : gapsData?.data && gapsData.data.length > 0 ? (
        <div className="research-candidates" data-no-i18n>
          {gapsData.data.map(gap => <button type="button" key={gap.id} className="research-candidate" onClick={() => setSelectedGap(gap)}>
            <span className="research-origin">{t(gap.origin === "HUMAN" ? "Human proposal" : "AI-suggested candidate")} · v{gap.version ?? 1}</span>
            <strong>{gap.title}</strong><p>{gap.description}</p>
            <span className="research-state">{t(assessmentLabels[gap.assessmentStatus ?? "PROPOSED"])}</span>
          </button>)}
          <div className="research-pagination"><Button variant="ghost" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t("Previous")}</Button><span>{t("Page {{page}}", { page })}</span><Button variant="ghost" disabled={!gapsData.meta || page >= gapsData.meta.totalPages} onClick={() => setPage(value => value + 1)}>{t("Next")}</Button></div>
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm mb-4">
            <Sparkles className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h4 className="text-lg font-semibold tracking-tight mb-2">{t("No candidate research gaps yet")}</h4>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {t("Candidate research gaps will appear after the project has sufficient screened literature and evidence.")}
          </p>
          {!readOnly && !open && (
            <Button onClick={() => setOpen(true)} variant="outline" className="rounded-full shadow-sm" disabled={readOnly || Boolean(activeAnalysisId)}>
              <Sparkles className="w-4 h-4 mr-2 text-cyan-500" />
              {t("Run first analysis")}
            </Button>
          )}
        </div>
      )}

      <GapDetailDrawer
        researchProjectId={projectId}
        gap={gapsData?.data.find(item => item.id === selectedGap?.id) ?? selectedGap}
        isOpen={selectedGap !== null}
        onClose={() => setSelectedGap(null)}
        onDraftProposal={onDraftProposal ? (gap) => { setSelectedGap(null); onDraftProposal(gap); } : undefined}
      />
    </div>
  );
}
