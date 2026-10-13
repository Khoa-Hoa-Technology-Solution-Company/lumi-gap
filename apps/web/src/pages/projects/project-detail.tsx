import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useProject, useUpdateProject, useArchiveProject, useDeleteProject, useLeaveProject } from "@/features/projects/hooks/use-projects";
import { useQueryClient } from "@tanstack/react-query";
import { useReports, useCreateReport, useUpdateArtifactStatus } from "@/features/reports/hooks/use-reports";
import { useGaps, useAnalyzeGap, useGapAnalysisStatus, useActiveGapAnalysis } from "@/features/gaps";
import { GapDetailDrawer } from "@/features/gaps/components/gap-detail-drawer";
import { GapAnalysisWorkflow } from "@/features/gaps/components/gap-analysis-workflow";
import { GapScopeNote } from "@/features/gaps/components/gap-evidence-summary";
import { ProjectDiscussionPanel } from "@/features/projects/components/project-discussion-panel";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { AnalyzeGapRequest, GapStatus, IProject, ProjectStatus, ProjectVisibility, ReportLanguage, ResearchArtifactType, ResearchGapItem } from "@trend/shared-types";
import { ProjectLiteratureWorkspace } from "@/features/projects/components/project-literature-workspace";
import { ProjectSectionNav, type ProjectTab } from "@/features/projects/components/project-section-nav";
import "@/features/projects/project-workspace.css";
import { ProjectPaperPickerDialog, type PaperPickerSource } from "@/features/projects/components/project-paper-picker-dialog";
import { SubmitReviewDialog } from "@/features/reviews/components/submit-review-dialog";
import { useReviewCenter, type ReviewCenterItem } from "@/features/reviews";

import { toast } from "sonner";
import { Archive, FileText, Trash2, Plus, Loader2, XCircle, Sparkles, Zap, MessageSquare, Settings2, ShieldCheck, FolderKanban, ChevronRight, LockKeyhole, Globe2, UsersRound, Clock3 } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { MentorProjectPanel } from "@/pages/academics/academic-support";
import { ProjectMembersTab } from "@/features/projects/components/project-members-tab";
import { ProjectMentorSummary } from "@/features/projects/components/project-mentor-summary";
import { ProjectContributionsTab } from "@/features/projects/components/project-contributions-tab";
import { useI18n } from "@/i18n";

const ProjectSubmissionsPanel = lazy(() => import("@/features/projects/components/project-submissions-panel").then(m => ({ default: m.ProjectSubmissionsPanel })));

export function ProjectDetailPage() {
  const currentUser = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, isError } = useProject(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: ProjectTab = ["papers", "members", "contributions", "reports", "gaps", "chat", "support", "submissions"].includes(tabParam ?? "") ? tabParam as ProjectTab : "papers";
  const setActiveTab = (tab: ProjectTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    params.delete("submission");
    setSearchParams(params, { replace: true });
  };
  const [autoOpenReport, setAutoOpenReport] = useState(false);
  const [autoOpenGap, setAutoOpenGap] = useState(false);
  const [paperPickerOpen, setPaperPickerOpen] = useState(false);
  const [paperPickerSource, setPaperPickerSource] = useState<PaperPickerSource>("search");
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);

  const relativeActivity = (value: string) => {
    const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
    const unit = elapsed < 60 * 60 * 1000 ? "minute" : elapsed < 24 * 60 * 60 * 1000 ? "hour" : "day";
    const divisor = unit === "minute" ? 60_000 : unit === "hour" ? 3_600_000 : 86_400_000;
    const amount = Math.max(1, Math.floor(elapsed / divisor));
    return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(-amount, unit);
  };

  if (isLoading) {
    return (
      <main className="container py-8 space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </main>
    );
  }

  if (!project) {
    return (
      <main className="container py-8">
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground" role="status">
          {isError ? t("The project could not be loaded. Refresh and try again.") : t("Project not found or you do not have access.")}
        </div>
      </main>
    );
  }

  return (
    <div className="project-workspace">
      <div className="project-page-width project-detail-page">

        <header className="project-detail-intro">
          <nav className="project-breadcrumb" aria-label={t("Projects")}>
            <Link to="/projects" className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("Projects")}</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /><span className="truncate">{project.title}</span>
          </nav>
          <div className="project-detail-title-row">
            <div className="flex min-w-0 items-start gap-4">
              <span className="project-folder-icon project-detail-icon"><FolderKanban className="h-7 w-7" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="project-eyebrow">{t("Research project")}</p>
                <h1>{project.title}</h1>
                {project.description ? <p className="project-detail-description">{project.description}</p> : null}
                {project.researchField ? <p className="project-detail-scope">{t("Research scope")}<span aria-hidden="true"> / </span>{project.researchField}</p> : null}
              </div>
            </div>
            {project.accessRole ? <ProjectHeaderActions project={project} onLeft={() => navigate("/projects")} /> : null}
          </div>
          <div className="project-detail-meta">
            <span className="project-status-tag" data-status={project.status}>{t({ ACTIVE: "Active", PLANNING: "Planning", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" }[project.status])}</span>
            <span>{project.visibility === "PUBLIC_SUMMARY" ? <Globe2 aria-hidden="true" /> : project.visibility === "INVITE_ONLY" ? <UsersRound aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}{t(project.visibility === "PRIVATE" ? "Private" : project.visibility === "INVITE_ONLY" ? "Invite only" : "Public summary")}</span>
            <span><Clock3 aria-hidden="true" />{t("Updated {{time}}", { time: relativeActivity(project.updatedAt) })}</span>
            {!project.isPublicSummary ? <button type="button" className="project-team-shortcut" onClick={() => setActiveTab("members")}><UsersRound aria-hidden="true" />{t(project.memberCount === 1 ? "{{count}} member" : "{{count}} members", { count: project.memberCount })}<ChevronRight aria-hidden="true" /></button> : null}
          </div>
        </header>
        {project.status === "ARCHIVED" ? <p role="status" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground"><Archive className="h-4 w-4 shrink-0" />{t("Archived projects are read-only.")}</p> : null}

        {project.isPublicSummary ? (
          <div className="rounded-lg border bg-card p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 text-lg font-semibold">{t("Public project summary")}</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{t("Papers, member details, reports, candidate gaps, contributions and chat are available only to current project members.")}</p></div>
        ) : <>
        <div className="project-workspace-shell">
          <ProjectSectionNav activeTab={activeTab} onChange={setActiveTab} paperCount={project.paperCount} memberCount={project.memberCount} />
        <div className="project-workspace-content">
          {activeTab === "submissions" && <section id="project-panel-submissions" role="tabpanel" aria-labelledby="project-tab-submissions">
            <Suspense fallback={<Skeleton className="h-48 w-full" />}><ProjectSubmissionsPanel projectId={project._id} projectTitle={project.title} readOnly={project.status === "ARCHIVED" || !project.accessRole} /></Suspense>
          </section>}
          {activeTab === "papers" && (
            <section id="project-panel-papers" role="tabpanel" aria-labelledby="project-tab-papers">
              <ProjectLiteratureWorkspace
                projectId={project._id}
                papers={project.papers}
                criteria={project.screeningCriteria}
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
            </section>
          )}
          {activeTab === "members" && (
            <section id="project-panel-members" role="tabpanel" aria-labelledby="project-tab-members">
              <ProjectMembersTab projectId={project._id} projectTitle={project.title} members={project.members} pendingInvitations={project.pendingInvitations ?? []} ownerId={project.ownerId} currentUserId={currentUser?.id} readOnly={project.status === "ARCHIVED"} />
              <ProjectMentorSummary projectId={project._id} />
            </section>
          )}
          {activeTab === "support" && <div role="tabpanel" id="project-panel-support" aria-labelledby="project-tab-support"><MentorProjectPanel projectId={id!} /></div>}
          {activeTab === "contributions" && (
            <section id="project-panel-contributions" role="tabpanel" aria-labelledby="project-tab-contributions">
              <ProjectContributionsTab
                projectId={project._id}
                members={project.members}
                ownerId={project.ownerId}
                currentUserId={currentUser?.id}
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
              <ProjectDiscussionPanel
                projectId={project._id}
                paperCount={project.papers?.length || 0}
                ownerId={project.ownerId}
                onAddPapers={() => { if (project.status !== "ARCHIVED") { setPaperPickerSource("search"); setPaperPickerOpen(true); } }}
              />
            </section>
          )}
        </div>
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

function ProjectHeaderActions({ project, onLeft }: { project: IProject; onLeft: () => void }) {
  const { t } = useI18n();
  const isOwner = project.accessRole === "OWNER";
  type ConfirmationAction = "archive" | "delete" | "leave";
  const [open, setOpen] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? "");
  const [researchField, setResearchField] = useState(project.researchField ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [visibility, setVisibility] = useState<ProjectVisibility>(project.visibility);
  const updateProject = useUpdateProject(project._id);
  const archiveProject = useArchiveProject(project._id);
  const deleteProject = useDeleteProject(project._id);
  const leaveProject = useLeaveProject(project._id);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateProject.mutateAsync({ title, description, researchField: researchField || null, status, visibility });
      toast.success("Project settings saved");
      setOpen(false);
    } catch {
      toast.error("Could not save project settings");
    }
  };

  const openConfirmation = (action: ConfirmationAction) => {
    setConfirmationText("");
    setConfirmationAction(action);
  };

  const closeConfirmation = (nextOpen: boolean) => {
    if (nextOpen) return;
    if (archiveProject.isPending || deleteProject.isPending || leaveProject.isPending) return;
    setConfirmationAction(null);
    setConfirmationText("");
  };

  const confirmProjectAction = async () => {
    if (!confirmationAction) return;
    if (confirmationAction !== "leave" && confirmationText !== project.title) return;
    const action = confirmationAction;
    try {
      if (action === "archive") {
        await archiveProject.mutateAsync();
        toast.success("Project archived");
        setOpen(false);
      } else if (action === "delete") {
        await deleteProject.mutateAsync();
        toast.success("Project deleted");
      } else {
        await leaveProject.mutateAsync();
        toast.success("You left the project");
      }
      setConfirmationAction(null);
      setConfirmationText("");
      if (action !== "archive") onLeft();
    } catch (error) {
      // A delete is refused (409) while submissions or other members' work remain; the server says what.
      const message = (error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      toast.error(message || (action === "archive" ? "Could not archive project" : action === "delete" ? "Could not delete project" : "Could not leave project"));
    }
  };

  const confirmationPending = archiveProject.isPending || deleteProject.isPending || leaveProject.isPending;
  const requiresProjectName = confirmationAction !== null && confirmationAction !== "leave";

  if (!isOwner) return <>
    <Button variant="outline" size="sm" disabled={project.status === "ARCHIVED"} onClick={() => openConfirmation("leave")}>Leave project</Button>
    <Dialog open={confirmationAction !== null} onOpenChange={closeConfirmation}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leave this project?</DialogTitle>
          <DialogDescription>You will immediately lose access to private project content and chat. You can be invited again by a project owner.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => closeConfirmation(false)} disabled={confirmationPending}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={confirmProjectAction} disabled={confirmationPending}>
            {leaveProject.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Leaving…</> : "Leave project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="outline" size="sm"><Settings2 className="mr-2 h-4 w-4" />{t("Project settings")}</Button></DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Project settings</DialogTitle><DialogDescription>Update the workspace details and access policy. Only the owner can change these settings.</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={project.status === "ARCHIVED" || updateProject.isPending} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="project-title">Project name</Label><Input id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required /></div>
            <div className="space-y-2"><Label htmlFor="project-description">Description</Label><textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
            <div className="space-y-2"><Label htmlFor="project-field">Research field</Label><Input id="project-field" value={researchField} onChange={(event) => setResearchField(event.target.value)} maxLength={200} placeholder="e.g. Human-computer interaction" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="project-status">Status</Label><select id="project-status" value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{project.status === "ARCHIVED" ? <option value="ARCHIVED">{t("Archived")}</option> : null}{["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
              <div className="space-y-2"><Label htmlFor="project-visibility">Visibility</Label><select id="project-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as ProjectVisibility)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{["PRIVATE", "INVITE_ONLY", "PUBLIC_SUMMARY"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
            </div>
            </fieldset>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><p className="text-sm font-medium text-amber-900 dark:text-amber-200">Prefer archive over delete</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Archiving preserves papers, activity, reports, gaps and chat as a read-only record.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => openConfirmation("archive")} disabled={archiveProject.isPending || project.status === "ARCHIVED"}><Archive className="mr-2 h-4 w-4" />{project.status === "ARCHIVED" ? "Archived" : "Archive project"}</Button><Button type="button" variant="destructive" size="sm" onClick={() => openConfirmation("delete")} disabled={deleteProject.isPending}><Trash2 className="mr-2 h-4 w-4" />Delete permanently</Button></div></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={project.status === "ARCHIVED" || updateProject.isPending || !title.trim()}>{updateProject.isPending ? "Saving..." : "Save changes"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmationAction !== null} onOpenChange={closeConfirmation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmationAction === "archive" ? "Archive this project?" : confirmationAction === "leave" ? "Leave this project?" : "Permanently delete this project?"}</DialogTitle>
            <DialogDescription>
              {confirmationAction === "archive"
                ? "Members will retain read access, but the workspace becomes read-only. Papers, reports, gaps and chat will be preserved."
                : confirmationAction === "leave"
                  ? "You will immediately lose access to private project content and chat. You can be invited again by a project owner."
                  : "This permanently deletes the project and its project-scoped data. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {requiresProjectName && <div className="space-y-2">
            <Label htmlFor="confirm-project-name">To confirm, type <span className="font-semibold text-foreground">{project.title}</span></Label>
            <Input id="confirm-project-name" value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeConfirmation(false)} disabled={confirmationPending}>Cancel</Button>
            <Button type="button" variant={confirmationAction === "delete" || confirmationAction === "leave" ? "destructive" : "default"} onClick={confirmProjectAction} disabled={confirmationPending || (requiresProjectName && confirmationText !== project.title)}>
              {confirmationPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{archiveProject.isPending ? "Archiving…" : deleteProject.isPending ? "Deleting…" : "Leaving…"}</> : confirmationAction === "archive" ? "Archive project" : confirmationAction === "leave" ? "Leave project" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
          <h4 className="text-lg font-semibold tracking-tight mb-2">No research artifacts yet</h4>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Create a research artifact from your project evidence and analysis.
          </p>
          <Button onClick={() => setOpen(true)} variant="outline" className="rounded-full shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Generate first report
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
  const [minScore, setMinScore] = useState(0);
  const [debouncedMinScore, setDebouncedMinScore] = useState(0);
  const [status, setStatus] = useState<GapStatus>("active");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMinScore(minScore), 300);
    return () => clearTimeout(timer);
  }, [minScore]);

  const { data: gapsData, isLoading, refetch } = useGaps({ projectId, status, pageSize: 50, minConfidence: debouncedMinScore });
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
          <select
            aria-label={t("Gap status")}
            value={status}
            onChange={(event) => setStatus(event.target.value as GapStatus)}
            className="h-9 rounded-full border border-slate-200/60 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm dark:border-white/10 dark:bg-zinc-900 dark:text-slate-300"
          >
            <option value="active">{t("Active")}</option>
            <option value="resolved">{t("Resolved")}</option>
            <option value="dismissed">{t("Dismissed")}</option>
          </select>
          <div
            className="flex items-center gap-3 bg-white dark:bg-zinc-900 px-4 py-1.5 rounded-full border border-slate-200/60 dark:border-white/10 shadow-sm"
            title={t("Filters by the corpus evidence score, or the AI's confidence when a gap has no evidence score.")}
          >
            <Zap className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 w-[160px]">{t("Min evidence score: {{value}}%", { value: Math.round(minScore * 100) })}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={minScore}
              onChange={(e) => setMinScore(parseFloat(e.target.value))}
              aria-label={t("Minimum evidence score")}
              className="w-24 accent-emerald-500 cursor-pointer"
            />
          </div>

          <Button size="sm" className="rounded-full shadow-sm shrink-0" onClick={() => setOpen((current) => !current)} disabled={Boolean(activeAnalysisId)}>
            <Sparkles className="w-4 h-4 mr-2" /> {open ? t("Close gap analysis") : t("New Gap Analysis")}
          </Button>
        </div>
      </div>

      {open && (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gapsData.data.map(gap => (
            <div
              key={gap.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedGap(gap)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedGap(gap); } }}
              className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-zinc-900 p-6 shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-cyan-500/10 hover:border-cyan-500/30 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative z-10 mb-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 transition-transform group-hover:scale-110 duration-500">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <Badge variant="outline" className={`text-[10px] rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wider shrink-0 shadow-sm ${gap.validationStatus === "VALIDATED" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950" : "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950"}`}>{(gap.validationStatus || "CANDIDATE").replaceAll("_", " ")}</Badge>
                </div>
                <h4 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors mb-2">
                  {gap.title}
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {gap.description}
                </p>
              </div>

              {gap.evidenceConfidence !== undefined && (() => {
                // Zero papers for a probe topic means no data; a handful means the score is noise. Either way, hide the %.
                const counts = gap.parentCounts;
                const insufficientData = counts !== undefined && Math.min(counts.a, counts.b) === 0;
                const lowSample = !insufficientData && gap.lowSample === true;
                const weakTopic = counts && gap.probe ? (counts.a <= counts.b ? { topic: gap.probe.topicA, count: counts.a } : { topic: gap.probe.topicB, count: counts.b }) : undefined;
                const pct = Math.round(gap.evidenceConfidence * 100);
                return (
                  <div
                    className="relative z-10 pt-5 border-t border-slate-100 dark:border-zinc-800/50 mt-auto"
                    title={t("Corpus evidence score: how scarce the topic intersection is across the whole LumiGap corpus and whether a parent topic is rising. Not the AI's self-reported confidence.")}
                  >
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-emerald-500" /> {t("Corpus evidence")}
                       </span>
                      {insufficientData || lowSample ? (
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{insufficientData ? t("Insufficient data") : t("Low sample")}</span>
                      ) : (
                        <span className="text-sm font-black text-slate-700 dark:text-slate-300">{pct}%</span>
                      )}
                    </div>
                    {insufficientData || lowSample ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {insufficientData
                          ? t("No corpus papers match \"{{topic}}\" yet, so this gap cannot be scored.", { topic: weakTopic?.topic ?? "" })
                          : t("Only {{count}} corpus paper(s) match \"{{topic}}\". Treat this score with caution.", { count: weakTopic?.count ?? 0, topic: weakTopic?.topic ?? "" })}
                      </p>
                    ) : (
                      <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden shadow-inner">
                        <div
                          className="bg-gradient-to-r from-emerald-400 to-teal-500 h-2 rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    {gap.probe && <div className="mt-2"><GapScopeNote evidenceScopeSize={gap.evidenceScopeSize} /></div>}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm mb-4">
            <Sparkles className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h4 className="text-lg font-semibold tracking-tight mb-2">{status === "active" ? t("No candidate research gaps yet") : t("No research gaps with this status")}</h4>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {t("Candidate research gaps will appear after the project has sufficient screened literature and evidence.")}
          </p>
          {status === "active" && !open && (
            <Button onClick={() => setOpen(true)} variant="outline" className="rounded-full shadow-sm" disabled={Boolean(activeAnalysisId)}>
              <Sparkles className="w-4 h-4 mr-2 text-cyan-500" />
              {t("Run first analysis")}
            </Button>
          )}
        </div>
      )}

      <GapDetailDrawer
        gap={selectedGap}
        isOpen={selectedGap !== null}
        onClose={() => setSelectedGap(null)}
        onDraftProposal={onDraftProposal ? (gap) => { setSelectedGap(null); onDraftProposal(gap); } : undefined}
      />
    </div>
  );
}
