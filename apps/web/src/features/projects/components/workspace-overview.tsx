import { Link } from "react-router-dom";
import type { IProject, ResearchStage } from "@trend/shared-types";
import {
  ArrowUpRight,
  UsersRound,
  GraduationCap,
  Compass,
  BookOpen,
  Filter,
  CheckCircle2,
  FileSpreadsheet,
  Sparkles,
  HelpCircle,
  CheckSquare,
  Clock,
  AlertTriangle,
  TrendingUp,
  Layers,
  FileText,
  Globe2,
  LockKeyhole,
  Clock3,
  Settings2,
  Info,
  FileBarChart2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceCommand, useWorkspaceOverview } from "../hooks/use-workspace";
import { ProjectTrendEvidence } from "@/features/trends/components/project-trend-evidence";
import { approachLabels, formatRelativeActivity, projectSectionHref, stageLabels, taskLabels, WorkspaceDate, WorkspaceError, WorkspaceLoading } from "./workspace-common";
import { LiteratureScreeningFunnel, ResearchStagePipeline } from "./workspace-overview-widgets";

export function WorkspaceStageSelector({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const overview = useWorkspaceOverview(projectId);
  const update = useWorkspaceCommand(projectId, (stage: ResearchStage | null) => workspaceApi.stage(projectId, { stage, expectedVersion: overview.data!.project.version }));

  if (!overview.data) return null;
  const { project, capabilities } = overview.data;

  return (
    <div className="coord-stage-inline inline-flex items-center gap-2" data-no-i18n>
      <span className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-1.5 whitespace-nowrap">
        <Layers className="h-3.5 w-3.5 text-primary" />
        {t("Research stage")}:
      </span>
      {capabilities.manageProject ? (
        <select
          aria-label={t("Research stage")}
          value={project.researchStage ?? ""}
          disabled={update.isPending}
          onChange={e => update.mutate((e.target.value || null) as ResearchStage | null)}
          className="h-7 rounded-lg border border-border/80 bg-background/90 px-2 py-0 text-xs font-semibold text-foreground shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer hover:border-primary/40 transition-colors"
        >
          <option value="">{t("Not set")}</option>
          {Object.entries(stageLabels).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}
        </select>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary">
          {t(project.researchStage ? stageLabels[project.researchStage] : "Not set")}
        </span>
      )}
    </div>
  );
}

export function WorkspaceStage({ projectId, compact }: { projectId: string; compact?: boolean }) {
  const { t } = useI18n();
  const overview = useWorkspaceOverview(projectId);
  const update = useWorkspaceCommand(projectId, (stage: ResearchStage | null) => workspaceApi.stage(projectId, { stage, expectedVersion: overview.data!.project.version }));

  if (compact) {
    return <WorkspaceStageSelector projectId={projectId} />;
  }

  if (!overview.data) return overview.isError ? <WorkspaceError error={overview.error} retry={() => void overview.refetch()} /> : null;
  const { project, capabilities, memberCount, mentors } = overview.data;

  return (
    <div className="coord-stage" data-no-i18n>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          {t("Research stage")}:
        </span>
        {capabilities.manageProject ? (
          <select
            aria-label={t("Research stage")}
            value={project.researchStage ?? ""}
            disabled={update.isPending}
            onChange={e => update.mutate((e.target.value || null) as ResearchStage | null)}
            className="h-9 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer hover:border-primary/40 transition-colors"
          >
            <option value="">{t("Not set")}</option>
            {Object.entries(stageLabels).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}
          </select>
        ) : (
          <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold bg-primary/10 text-primary">
            {t(project.researchStage ? stageLabels[project.researchStage] : "Not set")}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-auto text-sm font-medium">
        <Link
          to={projectSectionHref(projectId, "members")}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-accent/60 hover:text-foreground text-muted-foreground transition-all shadow-sm"
        >
          <UsersRound size={15} className="text-blue-500" aria-hidden="true" />
          <span>{t("Team")} · <strong className="text-foreground font-semibold">{memberCount}</strong></span>
        </Link>
        <Link
          to={projectSectionHref(projectId, "support")}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-accent/60 hover:text-foreground text-muted-foreground transition-all shadow-sm"
        >
          <GraduationCap size={16} className="text-purple-500" aria-hidden="true" />
          <span>{t("Mentors")} · <strong className="text-foreground font-semibold">{mentors.length}</strong></span>
        </Link>
      </div>
      {update.isError && <WorkspaceError error={update.error} retry={() => void overview.refetch()} />}
    </div>
  );
}

const activityLabels: Record<string, string> = {
  PLAN_UPDATED: "Updated the research plan", PLAN_SHARED: "Shared a plan revision with a mentor", PLAN_SHARE_REVOKED: "Revoked plan access",
  PLAN_DRAFT_SAVED: "Updated the plan draft", PLAN_SNAPSHOT_CREATED: "Created a plan version", PLAN_RESTORED: "Restored a plan version to the draft",
  PLAN_SECTION_COMMENTED: "Commented on a plan section",
  RESEARCH_STAGE_CHANGED: "Changed the research stage", TASK_CREATED: "Created a task", TASK_UPDATED: "Updated a task", TASK_STATUS_CHANGED: "Changed a task status", TASK_DELETED: "Deleted a task",
  MILESTONE_CREATED: "Created a milestone", MILESTONE_UPDATED: "Updated a milestone", DISCUSSION_CREATED: "Started a discussion", DISCUSSION_UPDATED: "Updated a discussion", DISCUSSION_RESOLVED: "Recorded a discussion conclusion", DISCUSSION_REOPENED: "Reopened a discussion", DISCUSSION_REPLY: "Replied to a discussion", DECISION_CREATED: "Recorded a research decision", DECISION_UPDATED: "Revised a research decision", WORKSPACE_COMMENT_ADDED: "Left a comment", MENTOR_PLAN_FEEDBACK: "Left mentor feedback", PROJECT_CREATED: "Created the project", PROJECT_UPDATED: "Updated project details", PAPER_ADDED: "Added a paper", PAPER_REMOVED: "Removed a paper", MEMBER_JOINED: "Joined the project", MEMBER_INVITED: "Invited a team member",
};


export function WorkspaceOverviewPanel({ project }: { project: IProject }) {
  const { t, language } = useI18n();
  const currentUserId = useAuthStore(state => state.user?.id);
  const id = project._id;
  const overview = useWorkspaceOverview(id);
  const updateStage = useWorkspaceCommand(id, (stage: ResearchStage | null) =>
    workspaceApi.stage(id, { stage, expectedVersion: overview.data!.project.version }),
  );

  if (overview.isLoading) return <WorkspaceLoading />;
  if (!overview.data) return <WorkspaceError error={overview.error} retry={() => void overview.refetch()} />;

  const data = overview.data;

  const attention = [
    { count: data.attention.mentorFeedback, label: "Mentor feedback is waiting for a team response", tab: "plan" },
    { count: data.attention.overdueTasks, label: "Overdue tasks", tab: "tasks" },
    { count: data.attention.blockedTasks, label: "Blocked tasks", tab: "tasks" },
    { count: data.attention.reviewResponses, label: "Review responses requiring action", tab: "reviews" },
  ].filter(item => item.count > 0);

  // 6 KPI Metric Cards
  const kpiItems = [
    {
      key: "papers",
      label: "Literature",
      sublabel: "Articles in library",
      count: data.progress.papers,
      icon: BookOpen,
      color: "blue",
      href: projectSectionHref(id, "papers"),
      alert: false,
    },
    {
      key: "pendingScreening",
      label: "Awaiting screening",
      sublabel: "Needs criteria review",
      count: data.progress.pendingScreening,
      icon: Filter,
      color: "amber",
      href: projectSectionHref(id, "papers", { view: "screening" }),
      alert: data.progress.pendingScreening > 0,
      badge: data.progress.pendingScreening > 0 ? "Needs screening" : undefined,
    },
    {
      key: "included",
      label: "Included papers",
      sublabel: "Meets research criteria",
      count: data.progress.included,
      icon: CheckCircle2,
      color: "emerald",
      href: projectSectionHref(id, "papers", { screening: "INCLUDED" }),
      alert: false,
    },
    {
      key: "evidence",
      label: "Evidence records",
      sublabel: "Extracted matrix entries",
      count: data.progress.evidence,
      icon: FileSpreadsheet,
      color: "violet",
      href: projectSectionHref(id, "papers", { view: "evidence" }),
      alert: false,
    },
    {
      key: "gaps",
      label: "Research gaps",
      sublabel: "Candidate gap opportunities",
      count: data.progress.gaps,
      icon: Sparkles,
      color: "rose",
      href: projectSectionHref(id, "gaps"),
      alert: false,
    },
    {
      key: "questions",
      label: "Plan questions",
      sublabel: "Formulated research inquiries",
      count: data.progress.questions,
      icon: HelpCircle,
      color: "sky",
      href: projectSectionHref(id, "plan"),
      alert: false,
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="coord-overview space-y-7" data-no-i18n>
        {/* Overview Page Header */}
        <div className="bg-card rounded-2xl border border-border/80 p-5 sm:p-6 shadow-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground leading-tight">
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

              <div className="flex items-center gap-3.5 text-xs font-medium text-muted-foreground flex-wrap pt-0.5">
                <span className="inline-flex items-center gap-1.5">
                  {["PUBLIC", "PUBLIC_SUMMARY"].includes(project.visibility) ? (
                    <Globe2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                  ) : project.visibility === "INVITE_ONLY" ? (
                    <UsersRound className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                  ) : (
                    <LockKeyhole className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                  )}
                  {t(project.visibility === "PRIVATE" ? "Private" : project.visibility === "INVITE_ONLY" ? "Invite only" : "Public summary")}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
                  {t("Updated {{time}}", { time: formatRelativeActivity(project.updatedAt, language, t) })}
                </span>
                {project.accessRole ? (
                  <>
                    <span>•</span>
                    <Link
                      to={projectSectionHref(id, "members", { team: "settings" })}
                      className="inline-flex items-center gap-1.5 hover:text-primary transition-colors font-semibold"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      <span>{t("Project settings")}</span>
                    </Link>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap lg:self-center shrink-0">
              <WorkspaceStageSelector projectId={id} />
              <Button asChild size="default" className="project-primary-action h-9 px-4 text-xs font-semibold shadow-sm">
                <Link to={projectSectionHref(id, "plan")}>
                  {t(data.plan.problem ? "About project" : "Describe your research")}
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>

          <ResearchStagePipeline
            stage={data.project.researchStage}
            canManage={data.capabilities.manageProject}
            pending={updateStage.isPending}
            onSelect={stage => updateStage.mutate(stage)}
          />
          {updateStage.isError ? <WorkspaceError error={updateStage.error} retry={() => void overview.refetch()} /> : null}
        </div>

        {/* Main Grid: Left Column (8 cols) and Right Column (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 space-y-7">
            {/* Card 1: Research Direction */}
            <section className="bg-card rounded-2xl border border-border/80 p-6 sm:p-7 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Compass className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-snug">{t("Research direction")}</h3>
                    <span className="text-sm text-muted-foreground">{t("Core focus & framing")}</span>
                  </div>
                </div>
                <Link to={projectSectionHref(id, "plan")} className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1">
                  {t("Edit plan")}<ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {data.plan.problem || project.description ? (
                <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-transparent dark:from-blue-950/30 dark:via-indigo-950/20 border-l-4 border-blue-600 rounded-r-xl p-4 sm:p-5 text-base text-foreground/90 font-medium leading-relaxed mb-5">
                  {data.plan.problem || project.description}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("Start with a question or a problem. You can refine the plan as your research develops.")}
                  </p>
                  <Button asChild variant="outline" size="sm" className="shrink-0 font-semibold rounded-lg">
                    <Link to={projectSectionHref(id, "plan")}>
                      {t("Describe your research")}
                      <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border/60">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="text-muted-foreground font-medium">{t("Approach")}:</span>
                <span className="px-3 py-1 rounded-md bg-muted font-semibold text-foreground">
                  {t(approachLabels[data.plan.approach])}
                </span>
              </div>
              {project.researchField && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-muted-foreground font-medium">{t("Research field")}:</span>
                  <span className="px-3 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold">
                    {project.researchField}
                  </span>
                </div>
              )}
            </div>

            {data.plan.objectives.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border/60">
                <span className="text-sm font-bold text-foreground block mb-2.5">{t("Objectives")}:</span>
                <ul className="space-y-2">
                  {data.plan.objectives.map((obj, i) => (
                    <li key={i} className="text-sm flex items-start gap-2.5 text-foreground/90 leading-relaxed">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <ProjectTrendEvidence projectId={id} currentUserId={currentUserId} ownerId={project.ownerId} />

            {/* Card 2: Research Progress KPI Metrics Dashboard */}
            <section className="bg-card rounded-2xl border border-border/80 p-6 sm:p-7 shadow-sm">
              <div className="flex items-center justify-between mb-5 gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-snug">{t("Research progress")}</h3>
                    <span className="text-sm text-muted-foreground">{t("Saved workspace deliverables")}</span>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("Notes on workspace metrics")}
                      className="h-7 w-7 rounded-full border border-border/70 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors shrink-0"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs leading-relaxed">
                    {t("Counts reflect saved work. They do not indicate academic approval or research quality.")}
                  </TooltipContent>
                </Tooltip>
              </div>

              <LiteratureScreeningFunnel
                projectId={id}
                papers={data.progress.papers}
                pendingScreening={data.progress.pendingScreening}
                included={data.progress.included}
              />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {kpiItems.map((kpi) => {
                  const Icon = kpi.icon;
                  return (
                    <Link
                      key={kpi.key}
                      to={kpi.href}
                      className={`group relative rounded-xl border p-4 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        kpi.alert
                          ? "border-amber-300 bg-gradient-to-br from-amber-50/60 via-amber-50/20 to-card dark:from-amber-950/30 dark:border-amber-800"
                          : "border-border/80 bg-gradient-to-br from-muted/30 to-card hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                          kpi.color === "blue" ? "bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400" :
                          kpi.color === "amber" ? "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400" :
                          kpi.color === "emerald" ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400" :
                          kpi.color === "violet" ? "bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400" :
                          kpi.color === "rose" ? "bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400" :
                          "bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400"
                        }`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-3xl font-black font-mono tracking-tight text-foreground tabular-nums">{kpi.count}</div>
                      <div className="text-sm font-bold text-foreground mt-1 truncate">{t(kpi.label)}</div>
                      {kpi.badge ? (
                        <span className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          {t(kpi.badge)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground truncate block mt-1">{t(kpi.sublabel)}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Card 3: Continue Working */}
            <section className="bg-card rounded-2xl border border-border/80 p-6 sm:p-7 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <CheckSquare className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground leading-snug">{t("Continue working")}</h3>
                  <span className="text-sm text-muted-foreground">{t("Assigned tasks and recent artifacts")}</span>
                </div>
              </div>
              <Link to={projectSectionHref(id, "tasks")} className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1">
                {t("All tasks")}<ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {data.myTasks.length ? (
              <ul className="divide-y divide-border/60">
                {data.myTasks.map(task => (
                  <li key={task.id} className="py-3.5 first:pt-0 last:pb-0">
                    <Link to={projectSectionHref(id, "tasks", { task: task.id })} className="group flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <strong className="block text-base font-semibold text-foreground group-hover:text-primary transition-colors truncate">{task.title}</strong>
                        <span className="text-sm text-muted-foreground">{t(taskLabels[task.status])}</span>
                      </div>
                      <div className="text-sm text-muted-foreground shrink-0 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <WorkspaceDate value={task.dueAt} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-border/80 p-6 sm:p-7 text-center bg-muted/20">
                <CheckSquare className="h-9 w-9 text-muted-foreground/60 mx-auto mb-2" />
                <p className="text-base font-semibold text-foreground">{t("No tasks assigned to you")}</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{t("Divide the next research steps into tasks and assign them to your team.")}</p>
                <Button asChild variant="outline" size="sm" className="mt-4 text-sm font-semibold rounded-lg">
                  <Link to={projectSectionHref(id, "tasks")}>
                    {t("Plan the next task")}<ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            )}

            {data.recentArtifacts.length > 0 && (
              <div className="mt-6 pt-5 border-t border-border/60">
                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3.5 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t("Recently edited outputs")}
                </h4>
                <ul className="space-y-2.5">
                  {data.recentArtifacts.map(item => (
                    <li key={item.id}>
                      <Link
                        to={item.kind === "REPORT" ? `/reports/${encodeURIComponent(item.id)}` : `/projects/${encodeURIComponent(id)}/manuscripts/${encodeURIComponent(item.id)}`}
                        className="group flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-muted/40 transition-all text-sm"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                            item.kind === "REPORT"
                              ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400"
                              : "bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400"
                          }`}>
                            {item.kind === "REPORT" ? <FileBarChart2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <span className="block font-semibold text-foreground group-hover:text-primary truncate">{item.title}</span>
                            <Badge variant="secondary" className="mt-0.5 text-[10px] px-1.5 py-0 font-semibold">
                              {t(item.kind === "REPORT" ? "Report" : "Manuscript")}
                            </Badge>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          <WorkspaceDate value={item.updatedAt} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        {/* Right Column (4 cols) */}
        <div className="lg:col-span-4 space-y-7">
          {/* Card: Needs Attention */}
          <section className={`rounded-2xl border p-6 shadow-sm transition-colors ${
            attention.length > 0
              ? "bg-gradient-to-br from-amber-50/80 to-card dark:from-amber-950/20 border-amber-200/80 dark:border-amber-900/60"
              : "bg-card border-border/80"
          }`}>
            <div className="flex items-center gap-2.5 mb-3.5">
              {attention.length > 0 ? (
                <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-[18px] w-[18px]" />
                </div>
              ) : (
                <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-[18px] w-[18px]" />
                </div>
              )}
              <h3 className="font-bold text-base text-foreground">{t("Needs attention")}</h3>
            </div>

            {attention.length ? (
              <ul className="space-y-2.5">
                {attention.map(item => (
                  <li key={item.label}>
                    <Link
                      to={item.tab === "reviews" ? "/reviews" : projectSectionHref(id, item.tab)}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-card/80 border border-amber-200 dark:border-amber-800 hover:border-amber-400 text-sm text-foreground transition-all"
                    >
                      <span className="h-5 min-w-[22px] px-2 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center text-xs">
                        {item.count}
                      </span>
                      <span className="font-medium truncate flex-1">{t(item.label)}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("No overdue tasks or unanswered mentor feedback right now.")}
              </p>
            )}

            {data.attention.mentorQuestions > 0 && (
              <Link to={projectSectionHref(id, "chat")} className="mt-3.5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {t("Open mentor questions")} · {data.attention.mentorQuestions}
              </Link>
            )}
          </section>

          {/* Card: Top Contributors / Bảng vinh danh đóng góp */}
          <section className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">{t("researchContribution.research")}</h3>
            <p className="my-3 text-sm leading-6 text-muted-foreground">{t("researchContribution.evidenceHint")}</p>
            <Button asChild variant="outline"><Link to={projectSectionHref(id, "contributions", { contributionTab: "work" })}>{t("researchContribution.evidenceRecords")}</Link></Button>
          </section>

          {/* Card: Recent Activity */}
          <section className="bg-card rounded-2xl border border-border/80 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-3.5">
              <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-base text-foreground">{t("Recent activity")}</h3>
            </div>

            {data.activity.length ? (
              <ol className="relative border-l border-border/80 ml-3 space-y-4 my-2">
                {data.activity.slice(0, 6).map(event => {
                  const isPaper = event.type.startsWith("PAPER_");
                  const isTask = event.type.startsWith("TASK_") || event.type.startsWith("MILESTONE_");
                  const isPlan = event.type.startsWith("PLAN_") || event.type.startsWith("RESEARCH_STAGE");
                  const badgeBg = isPaper
                    ? "bg-blue-500 ring-blue-100 dark:ring-blue-950"
                    : isTask
                      ? "bg-emerald-500 ring-emerald-100 dark:ring-emerald-950"
                      : isPlan
                        ? "bg-violet-500 ring-violet-100 dark:ring-violet-950"
                        : "bg-amber-500 ring-amber-100 dark:ring-amber-950";
                  return (
                    <li key={event.id} className="ml-4 relative">
                      <span className={`absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ${badgeBg}`} />
                      <p className="text-sm leading-normal">
                        <strong className="font-semibold text-foreground">{event.actor?.name ?? t("Research team")}</strong> ·{" "}
                        <span className="text-muted-foreground">{t(activityLabels[event.type] ?? "Updated research work")}</span>
                      </p>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        <WorkspaceDate value={event.createdAt} />
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("Saved research work and team changes will appear here.")}
              </p>
            )}
          </section>
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
}
