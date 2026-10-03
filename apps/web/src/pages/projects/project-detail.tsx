import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useProject, useRemoveMemberFromProject, useInviteProjectMember, useCancelProjectInvitation, useUpdateProject, useArchiveProject, useDeleteProject, useLeaveProject, useTransferProjectOwnership } from "@/features/projects/hooks/use-projects";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api-client";
import { useReports, useCreateReport, useUpdateArtifactStatus } from "@/features/reports/hooks/use-reports";
import { useGaps, useAnalyzeGap, useGapAnalysisStatus } from "@/features/gaps";
import { ProjectDiscussionPanel } from "@/features/projects/components/project-discussion-panel";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { IProject, ProjectStatus, ProjectVisibility, ReportLanguage, ResearchArtifactType } from "@trend/shared-types";
import { ProjectLiteratureWorkspace } from "@/features/projects/components/project-literature-workspace";
import { ProjectPaperPickerDialog } from "@/features/projects/components/project-paper-picker-dialog";
import { SubmitReviewDialog } from "@/features/reviews/components/submit-review-dialog";

function useSearchUsers(email: string) {
  return useQuery({
    queryKey: ["searchUsers", email],
    queryFn: async () => {
      if (!email || email.length < 2) return [];
      const res = await api.get<{ success: boolean; data: any[] }>(`/auth/search?email=${encodeURIComponent(email)}`);
      return res.data.data;
    },
    enabled: email.length >= 2,
  });
}

import { toast } from "sonner";
import { Archive, FileText, Users, Trash2, Plus, Loader2, XCircle, Sparkles, Zap, MessageSquare, Settings2, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { ProjectContributionsTab } from "@/features/projects/components/project-contributions-tab";
import { useI18n } from "@/i18n";

export function ProjectDetailPage() {
  const currentUser = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, isError } = useProject(id);
  const [searchParams, setSearchParams] = useSearchParams();
  type ProjectTab = "papers" | "members" | "contributions" | "reports" | "gaps" | "chat";
  const tabParam = searchParams.get("tab");
  const activeTab: ProjectTab = ["papers", "members", "contributions", "reports", "gaps", "chat"].includes(tabParam ?? "") ? tabParam as ProjectTab : "papers";
  const setActiveTab = (tab: ProjectTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    setSearchParams(params, { replace: true });
  };
  const [autoOpenReport, setAutoOpenReport] = useState(false);
  const [autoOpenGap, setAutoOpenGap] = useState(false);
  const [paperPickerOpen, setPaperPickerOpen] = useState(false);

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
    <div className="min-h-screen bg-background">
      <main className="container max-w-7xl space-y-5 py-5 sm:py-6">

        <header className="space-y-3 border-b pb-4">
          <Link to="/projects" className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← {t("Projects")}</Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.title}</h1>
              {project.description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{project.description}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {project.researchField ? <span>{project.researchField}</span> : null}
                {project.researchField ? <span aria-hidden="true">·</span> : null}
                <span>{t(project.status.replaceAll("_", " "))}</span><span aria-hidden="true">·</span>
                <span>{t(project.visibility.replaceAll("_", " "))}</span><span aria-hidden="true">·</span>
                <span>{t("{{count}} papers", { count: project.paperCount })}</span><span aria-hidden="true">·</span>
                <span>{t("{{count}} members", { count: project.memberCount })}</span><span aria-hidden="true">·</span>
                <span>{t("Updated {{time}}", { time: relativeActivity(project.updatedAt) })}</span>
              </div>
            </div>
            {project.accessRole ? <ProjectHeaderActions project={project} onLeft={() => navigate("/projects")} /> : null}
          </div>
        </header>

        {project.isPublicSummary ? (
          <div className="rounded-lg border bg-card p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 text-lg font-semibold">{t("Public project summary")}</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{t("Papers, member details, reports, candidate gaps, contributions and chat are available only to current project members.")}</p></div>
        ) : <>
        {/* Underline Tabs */}
        <div className="border-b border-slate-200 dark:border-white/10 overflow-x-auto">
          <div className="flex gap-5 sm:gap-7 min-w-max pb-1" role="tablist" aria-label={t("Project sections")}>
            <button
              id="project-tab-papers"
              role="tab"
              aria-selected={activeTab === "papers"}
              aria-controls="project-panel-papers"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "papers" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("papers")}
            >
              {t("Literature")}
              <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300">{project.papers?.length || 0}</Badge>
              {activeTab === "papers" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

            <button
              id="project-tab-members"
              role="tab"
              aria-selected={activeTab === "members"}
              aria-controls="project-panel-members"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "members" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("members")}
            >
              {t("Members")}
              <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300">{project.members?.length || 0}</Badge>
              {activeTab === "members" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

            <button
              id="project-tab-contributions"
              role="tab"
              aria-selected={activeTab === "contributions"}
              aria-controls="project-panel-contributions"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "contributions" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("contributions")}
            >
              {t("Contributions")}
              {activeTab === "contributions" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

            <button
              id="project-tab-reports"
              role="tab"
              aria-selected={activeTab === "reports"}
              aria-controls="project-panel-reports"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "reports" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("reports")}
            >
              {t("Artifacts")}
              {activeTab === "reports" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

            <button
              id="project-tab-gaps"
              role="tab"
              aria-selected={activeTab === "gaps"}
              aria-controls="project-panel-gaps"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "gaps" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("gaps")}
            >
              {t("Research Gaps")}
              {activeTab === "gaps" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

            <button
              id="project-tab-chat"
              role="tab"
              aria-selected={activeTab === "chat"}
              aria-controls="project-panel-chat"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "chat" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("chat")}
            >
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" />
                {t("Chat")}
              </span>
              {activeTab === "chat" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

          </div>
        </div>

        <div>
          {activeTab === "papers" && (
            <section id="project-panel-papers" role="tabpanel" aria-labelledby="project-tab-papers">
              <ProjectLiteratureWorkspace
                projectId={project._id}
                papers={project.papers}
                criteria={project.screeningCriteria}
                isOwner={project.accessRole === "OWNER"}
                readOnly={project.status === "ARCHIVED" || !project.accessRole}
                onRequestAddPaper={() => setPaperPickerOpen(true)}
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
              <MembersTab projectId={project._id} members={project.members} pendingInvitations={project.pendingInvitations ?? []} ownerId={project.ownerId} currentUserId={currentUser?.id} />
            </section>
          )}
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
                openOnInit={autoOpenReport}
                onOpenChange={setAutoOpenReport}
              />
            </section>
          )}
          {activeTab === "gaps" && (
            <section id="project-panel-gaps" role="tabpanel" aria-labelledby="project-tab-gaps">
              <GapsTab
                projectId={project._id}
                defaultTopic={project.title}
                openOnInit={autoOpenGap}
                onOpenChange={setAutoOpenGap}
              />
            </section>
          )}
          {activeTab === "chat" && (
            <section id="project-panel-chat" role="tabpanel" aria-labelledby="project-tab-chat">
              <ProjectDiscussionPanel
                projectId={project._id}
                paperCount={project.papers?.length || 0}
                ownerId={project.ownerId}
                onAddPapers={() => setPaperPickerOpen(true)}
              />
            </section>
          )}
        </div>
        <ProjectPaperPickerDialog
          projectId={project._id}
          papers={project.papers ?? []}
          open={paperPickerOpen}
          onOpenChange={setPaperPickerOpen}
        />
        </>}
      </main>
    </div>
  );
}

function ProjectHeaderActions({ project, onLeft }: { project: IProject; onLeft: () => void }) {
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
    } catch {
      toast.error(action === "archive" ? "Could not archive project" : action === "delete" ? "Could not delete project" : "Could not leave project");
    }
  };

  const confirmationPending = archiveProject.isPending || deleteProject.isPending || leaveProject.isPending;
  const requiresProjectName = confirmationAction !== null && confirmationAction !== "leave";

  if (!isOwner) return <>
    <Button variant="outline" size="sm" onClick={() => openConfirmation("leave")}>Leave project</Button>
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
        <DialogTrigger asChild><Button variant="outline" size="sm"><Settings2 className="mr-2 h-4 w-4" />Project settings</Button></DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Project settings</DialogTitle><DialogDescription>Update the workspace details and access policy. Only the owner can change these settings.</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="project-title">Project name</Label><Input id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required /></div>
            <div className="space-y-2"><Label htmlFor="project-description">Description</Label><textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
            <div className="space-y-2"><Label htmlFor="project-field">Research field</Label><Input id="project-field" value={researchField} onChange={(event) => setResearchField(event.target.value)} maxLength={200} placeholder="e.g. Human-computer interaction" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="project-status">Status</Label><select id="project-status" value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
              <div className="space-y-2"><Label htmlFor="project-visibility">Visibility</Label><select id="project-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as ProjectVisibility)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{["PRIVATE", "INVITE_ONLY", "PUBLIC_SUMMARY"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><p className="text-sm font-medium text-amber-900 dark:text-amber-200">Prefer archive over delete</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Archiving preserves papers, activity, reports, gaps and chat as a read-only record.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => openConfirmation("archive")} disabled={archiveProject.isPending || project.status === "ARCHIVED"}><Archive className="mr-2 h-4 w-4" />{project.status === "ARCHIVED" ? "Archived" : "Archive project"}</Button><Button type="button" variant="destructive" size="sm" onClick={() => openConfirmation("delete")} disabled={deleteProject.isPending}><Trash2 className="mr-2 h-4 w-4" />Delete permanently</Button></div></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={updateProject.isPending || !title.trim()}>{updateProject.isPending ? "Saving..." : "Save changes"}</Button></DialogFooter>
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

function ReportsTab({
  projectId,
  defaultTopic,
  openOnInit,
  onOpenChange
}: {
  projectId: string;
  defaultTopic?: string;
  openOnInit?: boolean;
  onOpenChange?: (open: boolean) => void
}) {
  const { data: reports, isLoading } = useReports(projectId);
  const createReport = useCreateReport();
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

  // Sync openOnInit
  useEffect(() => {
    if (openOnInit) {
      setOpen(true);
      onOpenChange?.(false);
    }
  }, [openOnInit, onOpenChange]);

  // Sync defaultTopic when dialog opens
  useEffect(() => {
    if (open && defaultTopic) {
      setTopic(defaultTopic);
    }
  }, [open, defaultTopic]);

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
        <Dialog open={open} onOpenChange={setOpen}>
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
          {reports.map(report => (
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
                  <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{report.artifactType?.replaceAll("_", " ") || "GENERAL REPORT"}</Badge>{report.isAiGenerated ? <Badge variant="secondary">AI-generated draft</Badge> : null}<select aria-label={`Artifact status for ${report.topic || "report"}`} value={report.artifactStatus || "DRAFT"} onChange={async (event) => { try { await updateArtifactStatus.mutateAsync({ id: report.id, status: event.target.value as "DRAFT" | "REVIEWING" | "FINAL" | "ARCHIVED" }); toast.success("Artifact status updated"); } catch { toast.error("Could not update artifact status"); } }} className="h-7 rounded-md border bg-background px-2 text-xs"><option value="DRAFT">Draft</option><option value="REVIEWING">Reviewing</option><option value="FINAL">Final</option><option value="ARCHIVED">Archived</option></select></div>
                </div>
              </div>
              <div className="flex items-center gap-6 w-full sm:w-auto sm:justify-end ml-14 sm:ml-0">
                {report.status === "ready" && report.artifactStatus !== "ARCHIVED" ? <SubmitReviewDialog reportId={report.id} artifactTitle={report.title || report.topic || "Research artifact"} artifactType={report.artifactType} trigger={<Button size="sm" variant="outline">Submit for Review</Button>} /> : null}
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
          ))}
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

  useEffect(() => {
    if (data?.status === "ready") {
      onDone();
    }
  }, [data?.status, onDone]);

  if (data?.status === "failed") {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 text-sm flex items-center gap-2 mb-4">
        <XCircle className="w-4 h-4" />
        {data.errorMessage ?? "Analysis failed."}
      </div>
    );
  }
  if (data?.status === "ready") return null;
  return (
    <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 p-4 rounded-lg flex items-center gap-3 mb-4 shadow-sm">
      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
        {data?.status === "analyzing" ? "Analyzing documents with AI..." : "Queued for analysis..."}
      </p>
    </div>
  );
}

function GapsTab({
  projectId,
  defaultTopic,
  openOnInit,
  onOpenChange
}: {
  projectId: string;
  defaultTopic?: string;
  openOnInit?: boolean;
  onOpenChange?: (open: boolean) => void
}) {
  const [minConfidence, setMinConfidence] = useState(0);
  const [debouncedConfidence, setDebouncedConfidence] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedConfidence(minConfidence), 300);
    return () => clearTimeout(timer);
  }, [minConfidence]);

  const { data: gapsData, isLoading, refetch } = useGaps({ projectId, pageSize: 50, minConfidence: debouncedConfidence });
  const analyze = useAnalyzeGap();

  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(defaultTopic || "");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);

  // Sync openOnInit
  useEffect(() => {
    if (openOnInit) {
      setOpen(true);
      onOpenChange?.(false);
    }
  }, [openOnInit, onOpenChange]);

  // Sync defaultTopic when dialog opens
  useEffect(() => {
    if (open && defaultTopic) {
      setTopic(defaultTopic);
    }
  }, [open, defaultTopic]);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Please enter a topic for gap analysis");
      return;
    }
    const fromYear = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const toYear = yearTo ? parseInt(yearTo, 10) : undefined;

    if (fromYear && toYear && fromYear > toYear) {
      toast.error("Year From must be less than or equal to Year To");
      return;
    }

    analyze.mutate({
      topic: topic.trim(),
      projectId,
      yearFrom: fromYear,
      yearTo: toYear
    }, {
      onSuccess: ({ analysisId }) => {
        setOpen(false);
        setTopic(defaultTopic || "");
        setYearFrom("");
        setYearTo("");
        setActiveAnalysisId(analysisId);
        toast.success("Gap analysis queued");
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.error?.message || "Failed to start gap analysis");
      }
    });
  };

  const handleDone = useCallback(() => {
    setActiveAnalysisId(null);
    void refetch();
  }, [refetch]);

  return (
    <div className="space-y-4 mt-2">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div><h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Candidate Research Gaps</h3><p className="mt-1 text-sm text-muted-foreground">AI-assisted results are candidates for review, not validated research conclusions.</p></div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 px-4 py-1.5 rounded-full border border-slate-200/60 dark:border-white/10 shadow-sm">
            <Zap className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 w-[140px]">Min Confidence: {Math.round(minConfidence * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-24 accent-emerald-500 cursor-pointer"
            />
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full shadow-sm shrink-0"><Sparkles className="w-4 h-4 mr-2" /> New Gap Analysis</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gap Analysis</DialogTitle>
              <DialogDescription>
                Discover research opportunities and missing literature for the project.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gap-topic">Topic</Label>
                <Input
                  id="gap-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. AI in Healthcare"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-2">
                  <Label htmlFor="gap-year-from">Year From</Label>
                  <Input
                    id="gap-year-from"
                    type="number"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    placeholder="2020"
                    className="h-10 text-center"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <Label htmlFor="gap-year-to">Year To</Label>
                  <Input
                    id="gap-year-to"
                    type="number"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    placeholder="2026"
                    className="h-10 text-center"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={analyze.isPending}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={analyze.isPending}>
                {analyze.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Analyze
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

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
            <div key={gap.id} className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-zinc-900 p-6 shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-cyan-500/10 hover:border-cyan-500/30 group">
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

              {gap.evidenceConfidence !== undefined && (
                <div className="relative z-10 pt-5 border-t border-slate-100 dark:border-zinc-800/50 mt-auto">
                  <div className="flex justify-between items-center mb-2">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-emerald-500" /> Confidence
                     </span>
                    <span className="text-sm font-black text-slate-700 dark:text-slate-300">{Math.round(gap.evidenceConfidence * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden shadow-inner">
                    <div
                      className="bg-gradient-to-r from-emerald-400 to-teal-500 h-2 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${Math.round(gap.evidenceConfidence * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm mb-4">
            <Sparkles className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h4 className="text-lg font-semibold tracking-tight mb-2">No candidate research gaps yet</h4>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Candidate research gaps will appear after the project has sufficient screened literature and evidence.
          </p>
          <Button onClick={() => setOpen(true)} variant="outline" className="rounded-full shadow-sm">
            <Sparkles className="w-4 h-4 mr-2 text-cyan-500" />
            Run first analysis
          </Button>
        </div>
      )}
    </div>
  );
}

function MembersTab({ projectId, members, pendingInvitations, ownerId, currentUserId }: { projectId: string; members: any[]; pendingInvitations: IProject["pendingInvitations"]; ownerId: string; currentUserId?: string }) {
  const isCurrentUserOwner = currentUserId === ownerId;
  const { t } = useI18n();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: string; fullName: string; email: string } | null>(null);
  const [invitationMessage, setInvitationMessage] = useState("");

  const { data: searchResults, isLoading: isSearching } = useSearchUsers(searchEmail);
  const inviteMember = useInviteProjectMember(projectId);
  const cancelInvitation = useCancelProjectInvitation(projectId);
  const removeMember = useRemoveMemberFromProject(projectId);
  const transferOwnership = useTransferProjectOwnership(projectId);
  const [memberToTransfer, setMemberToTransfer] = useState<{ id: string; name: string } | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser && !searchEmail.trim()) return toast.error("Select a LumiGap user or enter an email address");
    try {
      await inviteMember.mutateAsync({ userId: selectedUser?.id, email: selectedUser ? undefined : searchEmail.trim(), message: invitationMessage.trim() || undefined });
      toast.success("Invitation sent");
      setIsDialogOpen(false);
      setSelectedUser(null);
      setSearchEmail("");
      setInvitationMessage("");
    } catch {
      toast.error("Could not send the invitation");
    }
  };

  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);

  const handleRemove = async () => {
    if (!memberToDelete) return;
    try {
      await removeMember.mutateAsync(memberToDelete);
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setMemberToDelete(null);
    }
  };

  const handleTransferOwnership = async () => {
    if (!memberToTransfer) return;
    try {
      await transferOwnership.mutateAsync(memberToTransfer.id);
      toast.success("Ownership transferred");
      setMemberToTransfer(null);
    } catch {
      toast.error("Could not transfer ownership");
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Project Members</h3>
        {isCurrentUserOwner && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full shadow-sm"><Plus className="w-4 h-4 mr-2" /> Add Member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Member</DialogTitle>
                <DialogDescription>Add a user or expert to the project.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label>Project role</Label>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm"><span className="font-medium">Member</span><p className="mt-0.5 text-xs text-muted-foreground">Academic position does not change project permissions.</p></div>
                  </div>
                </div>
                <div className="space-y-2 relative">
                  <Label>Search user by email</Label>
                  {selectedUser ? (
                    <div className="flex items-center justify-between p-2 border rounded-md bg-secondary/20">
                      <div className="text-sm">
                        <p className="font-medium">{selectedUser.fullName}</p>
                        <p className="text-muted-foreground text-xs">{selectedUser.email}</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>Change</Button>
                    </div>
                  ) : (
                    <div>
                      <Input
                        value={searchEmail}
                        onChange={(e) => setSearchEmail(e.target.value)}
                        placeholder="e.g. user@example.com..."
                        autoComplete="off"
                      />
                      {searchEmail.length > 1 && (
                        <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-md max-h-60 overflow-auto">
                          {isSearching ? (
                            <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                          ) : searchResults?.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground">User not found.</div>
                          ) : (
                            searchResults?.map((u: any) => (
                              <div
                                key={u.id}
                                className="p-3 hover:bg-secondary cursor-pointer border-b last:border-0"
                                onClick={() => setSelectedUser(u)}
                              >
                                <p className="font-medium text-sm">{u.fullName}</p>
                                <p className="text-muted-foreground text-xs">{u.email}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2"><Label htmlFor="invitation-message">Invitation message <span className="text-muted-foreground">(optional)</span></Label><textarea id="invitation-message" value={invitationMessage} onChange={(event) => setInvitationMessage(event.target.value)} maxLength={1000} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Add context about the project and expected collaboration." /></div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setSelectedUser(null); setSearchEmail(""); setInvitationMessage(""); }}>Cancel</Button>
                  <Button type="submit" disabled={inviteMember.isPending || (!selectedUser && !searchEmail.trim())}>
                    {inviteMember.isPending ? "Sending..." : "Send invitation"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Dialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this member? They will lose permissions to add papers and generate reports.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToDelete(null)} disabled={removeMember.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removeMember.isPending}>
              {removeMember.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberToTransfer !== null} onOpenChange={(open) => { if (!open && !transferOwnership.isPending) setMemberToTransfer(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer project ownership?</DialogTitle>
            <DialogDescription>
              {memberToTransfer ? t("{{name}} will become the project owner. You will become a regular member and lose owner-only controls.", { name: memberToTransfer.name }) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMemberToTransfer(null)} disabled={transferOwnership.isPending}>Cancel</Button>
            <Button type="button" onClick={handleTransferOwnership} disabled={transferOwnership.isPending}>
              {transferOwnership.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Transferring…</> : "Transfer ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isCurrentUserOwner && pendingInvitations && pendingInvitations.length > 0 ? (
        <section className="space-y-3">
          <div><h4 className="font-semibold">Pending invitations</h4><p className="text-sm text-muted-foreground">Invitations expire automatically after 14 days.</p></div>
          <div className="divide-y rounded-xl border bg-card">
            {pendingInvitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{invitation.invitedUser?.fullName || invitation.email}</p><p className="text-xs text-muted-foreground">{invitation.email} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</p></div><Button size="sm" variant="outline" disabled={cancelInvitation.isPending} onClick={async () => { try { await cancelInvitation.mutateAsync(invitation.id); toast.success("Invitation cancelled"); } catch { toast.error("Could not cancel invitation"); } }}>Cancel invitation</Button></div>)}
          </div>
        </section>
      ) : null}

      {members?.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm mb-4">
            <Users className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h4 className="text-lg font-semibold tracking-tight mb-2">Invite researchers to collaborate on this project.</h4>
          <p className="text-sm text-muted-foreground max-w-sm">
            Pending invitations and active members will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          {members.map((m) => {
            const memberObj = typeof m.targetId === 'object' && m.targetId !== null ? m.targetId : null;
            const memberId = memberObj ? memberObj._id : m.targetId;
            const isPrimaryOwner = memberId === ownerId;
            return (
              <div key={memberId} className="group relative flex flex-row justify-between items-center rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-zinc-900 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-500/10 hover:border-purple-500/30 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 dark:bg-purple-900/10 rounded-bl-full -mr-10 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="flex items-center gap-5 flex-1 overflow-hidden z-10">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-bold text-lg uppercase transition-all duration-500 group-hover:scale-110 shadow-sm border border-purple-200 dark:border-purple-500/20">
                    {memberObj ? memberObj.fullName.charAt(0) : <Users className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    {memberObj ? (
                      <>
                        <h4 className="text-[16px] font-bold truncate text-slate-900 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors leading-tight mb-1">{memberObj.fullName || 'Unknown User'}</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                          <span className="truncate max-w-full">{memberObj.email}</span>
                          <span className="opacity-30 text-xs hidden sm:inline">•</span>
                          <span className={`capitalize font-bold text-xs px-2 py-0.5 rounded-md shrink-0 ${m.role === 'OWNER' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50' : 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50'}`}>
                            {m.role === 'OWNER' ? 'Owner' : 'Member'}
                          </span>
                          {isPrimaryOwner && <span className="text-[10px] uppercase font-black shrink-0 bg-amber-500 text-white px-2 py-0.5 rounded shadow-sm tracking-wider">Creator</span>}
                        </p>
                      </>
                    ) : (
                      <>
                        <h4 className="text-[16px] font-bold truncate text-slate-900 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors leading-tight mb-1">
                          {m.targetKind} <span className="font-mono text-slate-400 text-xs font-normal ml-2">(ID: {memberId})</span>
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                          <span className={`capitalize font-bold text-xs px-2 py-0.5 rounded-md shrink-0 ${m.role === 'OWNER' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50' : 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50'}`}>
                            {m.role === 'OWNER' ? 'Owner' : 'Member'}
                          </span>
                          {isPrimaryOwner && <span className="text-[10px] uppercase font-black shrink-0 bg-amber-500 text-white px-2 py-0.5 rounded shadow-sm tracking-wider">Creator</span>}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                {isCurrentUserOwner && !isPrimaryOwner && (
                  <div className="ml-4 flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" title="Transfer ownership" disabled={transferOwnership.isPending} className="h-8 w-8 rounded-full text-muted-foreground hover:text-amber-700" onClick={() => setMemberToTransfer({ id: memberId, name: memberObj?.fullName || "this member" })}><ShieldCheck className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Remove member" className="h-8 w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => setMemberToDelete(memberId)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
