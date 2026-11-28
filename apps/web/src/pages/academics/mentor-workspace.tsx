import { MentorSharedResourceInbox } from "@/features/projects/components/mentor-paper-sharing";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Clock3,
  FolderOpen,
  Inbox,
  ListTodo,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import type {
  MentorProjectFilter,
  MentorProjectSort,
  MentorWorkQuery,
  MentorWorkspaceData,
} from "@trend/shared-types";
import { LanguageSwitcher, useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useAcademicProfile } from "@/features/academic-profile/hooks/use-academic-profile";
import { useMentorWorkspace } from "@/features/projects/hooks/use-mentor-workspace";
import { MentorWorkQueue } from "@/features/projects/components/mentor-work-queue";
import { MentorOverview } from "@/features/projects/components/mentor-overview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineLoader, PageSkeleton, RoutePendingSignal, SectionErrorState, type PageSkeletonVariant } from "@/components/loading";
import { AppSingleSidebar, useSidebarCollapse } from "@/components/layout/app-single-sidebar";
import { WorkspaceBreadcrumb } from "@/components/layout/workspace-breadcrumb";
import { cn } from "@/utils/cn";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import "@/features/projects/mentor-workspace-shell.css";
import {
  buildMentorProjectsReturn,
  mentorWorkspaceDestination,
  readMentorProjectFilters,
  readMentorWorkFilters,
  writeMentorProjectFilters,
  writeMentorWorkFilters,
  researchProjectDirectoryDestination,
  safeMentorWorkReturn,
  withMentorWorkReturn,
  type MentorProjectDirectoryQuery,
} from "@/features/projects/utils/mentor-workspace-navigation";
import { canLeaveWorkspace } from "@/features/projects/components/workspace-common";

const EmbeddedAcademicSupport = lazy(() => import("./academic-support").then(m => ({ default: m.AcademicSupportPage })));
const EmbeddedProjects = lazy(() => import("@/pages/projects/projects-list").then(m => ({ default: m.ProjectsListPage })));
const EmbeddedNotifications = lazy(() => import("@/pages/notifications").then(m => ({ default: m.NotificationsPage })));
const EmbeddedMentorProject = lazy(() => import("./mentor-project").then(m => ({ default: m.MentorProjectPage })));
const EmbeddedReviewCenter = lazy(() => import("@/pages/reviews/review-dashboard").then(m => ({ default: m.ReviewDashboardPage })));
const EmbeddedReviewTemplates = lazy(() => import("@/pages/reviews/review-templates").then(m => ({ default: m.ReviewTemplatesPage })));
const EmbeddedTemplateBuilder = lazy(() => import("@/pages/reviews/review-template-builder").then(m => ({ default: m.ReviewTemplateBuilderPage })));
const EmbeddedReviewWorkspace = lazy(() => import("@/pages/reviews/review-workspace").then(m => ({ default: m.ReviewWorkspacePage })));
const EmbeddedReviewRequest = lazy(() => import("@/pages/reviews/review-request-detail").then(m => ({ default: m.ReviewRequestDetailPage })));
const EmbeddedReviewEntry = lazy(() => import("@/pages/reviews/mentor-review-entry").then(m => ({ default: m.MentorReviewEntryPage })));
const EmbeddedPersonalContributions = lazy(() => import("@/features/projects/components/personal-contribution-profile").then(m => ({ default: m.PersonalContributionProfile })));

const PROJECT_FILTER_OPTIONS: readonly { value: MentorProjectFilter; labelKey: string }[] = [
  { value: "ALL", labelKey: "mentorWorkspace.filterAllProjects" },
  { value: "ATTENTION", labelKey: "mentorWorkspace.filterNeedsAttention" },
  { value: "NO_PENDING", labelKey: "mentorWorkspace.filterNoPendingProjects" },
];

const PROJECT_SORT_OPTIONS: readonly { value: MentorProjectSort; labelKey: string }[] = [
  { value: "attention", labelKey: "mentorWorkspace.projectSort.attention" },
  { value: "updated", labelKey: "mentorWorkspace.projectSort.updated" },
  { value: "name", labelKey: "mentorWorkspace.projectSort.name" },
];

function MentorProjects({
  data,
  query,
  loading,
  fetching,
  error,
  retry,
  returnTo,
  onChange,
  onOpenProjectWork,
}: {
  data?: MentorWorkspaceData;
  query: MentorProjectDirectoryQuery;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  retry: () => void;
  returnTo: string;
  onChange: (patch: Partial<MentorProjectDirectoryQuery>) => void;
  onOpenProjectWork: (projectId: string) => void;
}) {
  const { t, language } = useI18n();
  const projects = !error && !loading && data ? data.projects : [];
  const facets = !error && !loading && data
    ? (data.projectFacets ?? {
        ALL: data.projectMeta.total,
        ATTENTION: data.projects.filter(p => p.pendingCount > 0).length,
        NO_PENDING: data.projects.filter(p => p.pendingCount === 0).length,
      })
    : undefined;
  const total = !error && !loading && data ? data.projectMeta.total : 0;
  const pageSize = data?.projectMeta.pageSize || 20;
  const totalPages = data?.projectMeta.totalPages ?? 0;
  const hasFilters = Boolean(query.projectSearch || query.projectFilter !== "ALL" || query.projectSort !== "attention");
  const isGlobalEmpty = !loading && !error && Boolean(data) && (facets?.ALL ?? 0) === 0 && !hasFilters;
  const showToolbar = !error && (!isGlobalEmpty || hasFilters);

  const rangeFrom = total > 0 ? (query.projectPage - 1) * pageSize + 1 : 0;
  const rangeTo = total > 0 ? Math.min(total, rangeFrom + projects.length - 1) : 0;
  const resultsSummary =
    total === 0
      ? null
      : total > pageSize
        ? t("mentorWorkspace.projectsCountRange", { from: rangeFrom, to: rangeTo, total })
        : query.projectFilter === "ATTENTION"
          ? t("mentorWorkspace.projectsCountAttention", { total })
          : query.projectFilter === "NO_PENDING"
            ? t("mentorWorkspace.projectsCountNoPending", { total })
            : t("mentorWorkspace.projectsCountTotal", { total });

  const clearFilters = () =>
    onChange({ projectPage: 1, projectSearch: "", projectFilter: "ALL", projectSort: "attention" });

  return (
    <section className="mentor-projects-section">
      {showToolbar ? (
        <div className="mentor-projects-toolbar">
          <div className="mentor-project-search">
            <Search size={16} aria-hidden="true" className="mentor-project-search-icon" />
            <Input
              type="search"
              maxLength={160}
              aria-label={t("mentorWorkspace.searchProjects")}
              placeholder={t("mentorWorkspace.searchProjects")}
              value={query.projectSearch}
              onChange={e => onChange({ projectPage: 1, projectSearch: e.target.value })}
            />
            {query.projectSearch ? (
              <button
                type="button"
                className="mentor-search-clear"
                aria-label={t("mentorWorkspace.clearProjectSearch")}
                onClick={() => onChange({ projectPage: 1, projectSearch: "" })}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="mentor-projects-toolbar-right">
            <div className="mentor-filter-chips" role="tablist" aria-label={t("mentorWorkspace.projects")}>
              {PROJECT_FILTER_OPTIONS.map(({ value, labelKey }) => {
                const active = query.projectFilter === value;
                const count = facets ? facets[value] : undefined;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className="mentor-filter-chip"
                    data-active={active ? "true" : undefined}
                    data-tone={value === "ATTENTION" && (count ?? 0) > 0 ? "attention" : undefined}
                    onClick={() => onChange({ projectPage: 1, projectFilter: value })}
                  >
                    <span>{t(labelKey)}</span>
                    {count !== undefined ? <span className="mentor-chip-count">{count}</span> : null}
                  </button>
                );
              })}
            </div>

            <select
              className="mentor-project-sort"
              aria-label={t("mentorWorkspace.projectSort.label")}
              value={query.projectSort}
              onChange={e => onChange({ projectPage: 1, projectSort: e.target.value as MentorProjectSort })}
            >
              {PROJECT_SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {resultsSummary ? (
        <div className="mentor-projects-statusline">
          <p className="mentor-projects-count">{resultsSummary}</p>
          {fetching && !loading ? <InlineLoader label={t("loading.updatingResults")} /> : null}
        </div>
      ) : null}

      {error ? (
        <SectionErrorState
          error={error}
          title={t("mentorWorkspace.projectsLoadError")}
          onRetry={retry}
          retrying={fetching}
        />
      ) : loading ? (
        <div role="status" className="mentor-project-skeleton-list" aria-label={t("mentorWorkspace.updating")}>
          <span className="sr-only">{t("mentorWorkspace.updating")}</span>
          {[1, 2, 3].map(n => (
            <div key={n} className="mentor-project-skeleton-row">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
              <div className="h-8 w-28 shrink-0 rounded-md bg-muted" />
            </div>
          ))}
        </div>
      ) : isGlobalEmpty ? (
        <div className="mentor-queue-empty" role="status">
          <FolderOpen size={28} aria-hidden="true" />
          <h3>{t("mentorWorkspace.emptyProjects")}</h3>
          <p>{t("mentorWorkspace.emptyProjectsHint")}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/mentor-workspace?view=incoming">{t("mentorWorkspace.invitations")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/mentor-workspace?view=discover">{t("mentorWorkspace.discovery")}</Link>
            </Button>
          </div>
        </div>
      ) : !projects.length ? (
        <div className="mentor-queue-empty" role="status">
          <FolderOpen size={24} aria-hidden="true" />
          {query.projectFilter === "ATTENTION" && !query.projectSearch ? (
            <>
              <h3>{t("mentorWorkspace.emptyAttentionProjects")}</h3>
              <Button variant="outline" size="sm" onClick={() => onChange({ projectPage: 1, projectFilter: "ALL" })}>
                {t("mentorWorkspace.viewAllProjects")}
              </Button>
            </>
          ) : (
            <>
              <h3>{t("mentorWorkspace.noMatchingProjects")}</h3>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("mentorWorkspace.clearFilters")}
              </Button>
            </>
          )}
        </div>
      ) : (
        <ul className="mentor-project-list" aria-busy={fetching}>
          {projects.map(project => {
            const isReadOnly = ["ARCHIVED", "COMPLETED"].includes(project.status);
            const hasPending = !isReadOnly && project.pendingCount > 0;
            const hasWaiting = !hasPending && (project.waitingCount ?? 0) > 0;
            const hasOverdue = hasPending && (project.overdueCount ?? 0) > 0;
            const showSpecialStatus = ["ARCHIVED", "COMPLETED", "PAUSED"].includes(project.status);
            const openTeamHref = withMentorWorkReturn(
              mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}`),
              returnTo,
            );
            const chatHref = withMentorWorkReturn(
              mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}?tab=chat&channel=mentors`),
              returnTo,
            );
            const updatedDateText = new Date(project.updatedAt).toLocaleDateString(language);
            const stageLabel = project.researchStage
              ? t("mentorWorkspace.stageLabel", { stage: t(`mentorWorkspace.stage.${project.researchStage}`) })
              : t("mentorWorkspace.projectStatusLabel", { status: t(`mentorWorkspace.projectStatus.${project.status}`) });
            const roleKey =
              project.mentorRole && ["PRIMARY", "SECONDARY"].includes(project.mentorRole)
                ? `mentorWorkspace.overview.role.${project.mentorRole}`
                : null;

            return (
              <li
                key={project.id}
                className="mentor-project-card"
                data-pending={hasPending ? "true" : undefined}
                data-readonly={isReadOnly ? "true" : undefined}
              >
                <div className="mentor-project-card-body">
                  <span className="mentor-project-icon" data-pending={hasPending ? "true" : undefined} aria-hidden="true">
                    <FolderOpen size={17} />
                  </span>

                  <div className="mentor-project-card-main">
                    <div className="mentor-project-card-top">
                      <Link className="mentor-project-title" to={openTeamHref}>
                        {project.title}
                      </Link>
                      {showSpecialStatus ? (
                        <Badge variant="secondary" className="mentor-status-badge">
                          {t(`mentorWorkspace.projectStatus.${project.status}`)}
                        </Badge>
                      ) : null}
                    </div>

                    <p className="mentor-project-meta">
                      <span>{t("mentorWorkspace.team", { name: project.teamLead, count: project.teamSize })}</span>
                      {project.researchField ? (
                        <>
                          {" · "}
                          <span className="mentor-project-field-text">{project.researchField}</span>
                        </>
                      ) : null}
                      {roleKey ? (
                        <>
                          {" · "}
                          <span>{t(roleKey)}</span>
                        </>
                      ) : null}
                    </p>

                    <p className="mentor-project-meta mentor-project-meta-secondary">
                      <span>{stageLabel}</span>
                      {" · "}
                      <time dateTime={project.updatedAt}>
                        {t("mentorWorkspace.projectUpdatedDate", { date: updatedDateText })}
                      </time>
                    </p>

                    <div className="mentor-project-work-status">
                      {hasPending ? (
                        <>
                          <span className="mentor-pending-pill" data-pending="true">
                            {project.pendingCount === 1
                              ? t("mentorWorkspace.pendingWorkCountOne")
                              : t("mentorWorkspace.pendingWorkCount", { count: project.pendingCount })}
                          </span>
                          {hasOverdue ? (
                            <span className="mentor-overdue-pill">
                              {t("mentorWorkspace.overdueShort", { count: project.overdueCount ?? 0 })}
                            </span>
                          ) : null}
                        </>
                      ) : hasWaiting ? (
                        <span className="mentor-pending-pill" data-tone="waiting">
                          {t("mentorWorkspace.waitingOnTeam")}
                        </span>
                      ) : (
                        <span className="mentor-pending-pill">
                          {t("mentorWorkspace.noPendingWork")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mentor-project-card-actions">
                  {isReadOnly ? (
                    <Button asChild size="sm" variant="outline" className="w-full justify-center">
                      <Link to={openTeamHref}>
                        <span>{t("mentorWorkspace.viewTeam")}</span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : hasPending ? (
                    <>
                      <Button size="sm" className="w-full justify-center" onClick={() => onOpenProjectWork(project.id)}>
                        <ListTodo size={14} aria-hidden="true" />
                        <span>{t("mentorWorkspace.handleWork", { count: project.pendingCount })}</span>
                      </Button>
                      <div
                        className="mentor-project-shortcuts"
                        data-columns={project.canChat !== false ? "2" : "1"}
                      >
                        <Button asChild size="sm" variant="outline" className="mentor-project-secondary-btn">
                          <Link to={openTeamHref}>
                            <span>{t("mentorWorkspace.openTeam")}</span>
                            <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                        </Button>
                        {project.canChat !== false ? (
                          <Button asChild size="sm" variant="outline" className="mentor-project-secondary-btn mentor-shortcut-btn">
                            <Link to={chatHref}>
                              <MessageSquare size={14} aria-hidden="true" />
                              <span>{t("mentorWorkspace.projectChat")}</span>
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div
                      className="mentor-project-shortcuts"
                      data-columns={project.canChat !== false ? "2" : "1"}
                    >
                      <Button asChild size="sm" variant="default" className="mentor-project-secondary-btn">
                        <Link to={openTeamHref}>
                          <span>{t("mentorWorkspace.openTeam")}</span>
                          <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      </Button>
                      {project.canChat !== false ? (
                        <Button asChild size="sm" variant="outline" className="mentor-project-secondary-btn mentor-shortcut-btn">
                          <Link to={chatHref}>
                            <MessageSquare size={14} aria-hidden="true" />
                            <span>{t("mentorWorkspace.projectChat")}</span>
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!error && !loading && totalPages > 1 ? (
        <nav className="mentor-pagination" aria-label={t("mentorWorkspace.projectsPagination")}>
          <Button
            size="sm"
            variant="outline"
            disabled={query.projectPage <= 1}
            onClick={() => onChange({ projectPage: query.projectPage - 1 })}
          >
            {t("Previous")}
          </Button>
          <span>{t("mentorWorkspace.pageCount", { page: query.projectPage, total: totalPages })}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={query.projectPage >= totalPages}
            onClick={() => onChange({ projectPage: query.projectPage + 1 })}
          >
            {t("Next")}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}

export function MentorWorkspacePage() {
  const [params] = useSearchParams();
  const location = useLocation();
  if (params.get("view") === "research-projects") return <Navigate to={researchProjectDirectoryDestination(params, location.hash)} replace />;
  return <MentorWorkspaceContent />;
}

function MentorWorkspaceContent() {
  const { t } = useI18n();
  const [collapsed, toggleCollapse] = useSidebarCollapse();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reviewSidebarOpen, setReviewSidebarOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const profile = useAcademicProfile();
  const routerNavigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const safeReturnTo = safeMentorWorkReturn(params.get("returnTo"));
  const view =
    (
      [
        "overview",
        "work",
        "projects",
        "research-projects",
        "incoming",
        "outgoing",
        "active",
        "history",
        "discover",
        "notifications",
        "project",
        "reviews",
        "templates",
        "template-builder",
        "review",
        "review-request",
        "review-entry",
        "manuscript",
        "resources",
        "contributions",
      ] as const
    ).find(value => value === params.get("view")) ?? "overview";
  const dashboard = ["overview", "work", "projects"].includes(view);
  const breadcrumbKey =
    view === "project"
      ? "projects"
      : ["incoming", "outgoing", "active", "history"].includes(view)
        ? "invitations"
        : view === "discover"
          ? "discovery"
          : view;
  const breadcrumbLabel =
    view === "research-projects"
      ? t(
        params.get("directory") === "trash"
          ? "Trash"
          : params.get("directory") === "invitations"
            ? "Project invitations"
            : "mentorWorkspace.personalProjects",
      )
      : ["reviews", "review", "review-request", "review-entry", "manuscript"].includes(view)
        ? t("mentorWorkspace.reviewCenterTitle")
        : ["templates", "template-builder"].includes(view)
          ? t("mentorWorkspace.templatesTitle")
          : view === "contributions"
            ? t("mentorWorkspace.myContributions")
            : t(`mentorWorkspace.${breadcrumbKey}`);

  const scrollSection = ["incoming", "outgoing", "active", "history"].includes(view) ? "invitations" : view;
  useEffect(() => {
    if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
    if (view === "review") setReviewSidebarOpen(false);
  }, [scrollSection, view === "review"]);

  const filters = readMentorWorkFilters(params);
  const setFilters = (next: MentorWorkQuery) => setParams(current => writeMentorWorkFilters(current, next));
  const projectFilters = readMentorProjectFilters(params);
  const setProjectFilters = (patch: Partial<MentorProjectDirectoryQuery>) =>
    setParams(current => writeMentorProjectFilters(current, patch), { replace: true });
  const projectsReturnTo = useMemo(() => buildMentorProjectsReturn(params), [params]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  const lecturer = profile.data?.academicRole === "LECTURER";
  const verified =
    lecturer &&
    profile.data?.academicRoleVerificationStatus === "VERIFIED" &&
    profile.data?.verificationStatuses?.position === "VERIFIED";

  const actorId = useAuthStore(s => s.user?.id);
  const stableSidebarRef = useRef<{
    actorId?: string;
    metrics?: MentorWorkspaceData["summary"];
    projects?: MentorWorkspaceData["projects"];
  }>({});

  const query = useMentorWorkspace(
    {
      ...(view === "work" ? filters : { pageSize: 6 }),
      projectPage: view === "projects" ? projectFilters.projectPage : 1,
      projectSearch: view === "projects" ? (projectFilters.projectSearch || undefined) : undefined,
      ...(view === "projects" && projectFilters.projectFilter !== "ALL" ? { projectFilter: projectFilters.projectFilter } : {}),
      ...(view === "projects" && projectFilters.projectSort !== "attention" ? { projectSort: projectFilters.projectSort } : {}),
    },
    verified,
  );

  const navigate = async (next: string) => {
    if (!(await canLeaveWorkspace())) return;
    setParams({ view: next });
    setMobileOpen(false);
  };

  const openWorkWithFilter = async (patch: Partial<MentorWorkQuery>) => {
    if (!(await canLeaveWorkspace())) return;
    setParams(writeMentorWorkFilters(new URLSearchParams({ view: "work" }), { page: 1, sort: "priority", status: "ACTIONABLE", ...patch }));
    setMobileOpen(false);
  };

  if (profile.isLoading) {
    return (
      <main className="mentor-global-page p-6">
        <PageSkeleton variant="mentor-overview" />
      </main>
    );
  }
  if (profile.isError) {
    return (
      <main className="mentor-global-page mx-auto max-w-xl p-6">
        <SectionErrorState
          error={profile.error}
          title={t("mentorWorkspace.loadError")}
          onRetry={() => void profile.refetch()}
          retrying={profile.isFetching}
        />
      </main>
    );
  }
  if (!lecturer) return <Navigate to="/projects" replace />;
  // A lecturer's own project library does not require mentor verification.
  if (!verified && view !== "research-projects") {
    return (
      <main className="mentor-global-page" data-no-i18n>
        <h1>{t("mentorWorkspace.title")}</h1>
        <p>{t("mentorWorkspace.verifyRequired")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/settings/verification/lecturer">{t("mentorWorkspace.verify")}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const data = !query.error ? query.data : undefined;
  if (query.error || stableSidebarRef.current.actorId !== actorId) {
    stableSidebarRef.current = { actorId };
  }
  if (data) {
    stableSidebarRef.current = {
      actorId,
      metrics: data.summary,
      projects: data.projects,
    };
  }
  const metrics = data?.summary ?? stableSidebarRef.current.metrics;
  const sidebarRecentProjects = data?.projects ?? stableSidebarRef.current.projects;
  const reviewFocusMode = view === "review" && !reviewSidebarOpen;

  const manuscriptFromResources = Boolean(
    view === "manuscript" &&
    safeReturnTo &&
    new URLSearchParams(safeReturnTo.slice(safeReturnTo.indexOf("?") + 1)).get("view") === "resources",
  );
  const resolvedSidebarView =
    view === "research-projects"
      ? "projects"
      : view === "manuscript"
        ? manuscriptFromResources
          ? "resources"
          : "reviews"
        : view;

  return (
    <div
      className={cn(
        "mentor-workspace-shell",
        collapsed && !reviewFocusMode && "mentor-shell-collapsed",
        reviewFocusMode && "mentor-shell-focus",
      )}
      data-no-i18n
    >
      <div className="mentor-shell-sidebar">
        <AppSingleSidebar
          activeWorkspace="mentor"
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          activeMentorView={resolvedSidebarView}
          onSelectMentorView={navigate}
          mentorMetrics={metrics}
          recentProjects={sidebarRecentProjects}
        />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          id="mentor-mobile-navigation"
          className="mentor-mobile-sidebar"
          closeLabel={t("Close navigation")}
          onCloseAutoFocus={event => {
            event.preventDefault();
            mobileMenuRef.current?.focus();
          }}
        >
          <SheetTitle className="sr-only">{t("mentorWorkspace.navigation")}</SheetTitle>
          <SheetDescription className="sr-only">{t("mentorWorkspace.subtitle")}</SheetDescription>
          <div
            className="mentor-mobile-sidebar-body"
            onClickCapture={event => {
              if (event.target instanceof Element && event.target.closest("a")) setMobileOpen(false);
            }}
          >
            <AppSingleSidebar
              activeWorkspace="mentor"
              activeMentorView={resolvedSidebarView}
              onSelectMentorView={navigate}
              mentorMetrics={metrics}
              recentProjects={sidebarRecentProjects}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div ref={contentScrollRef} className={cn("mentor-shell-main", view === "review" && "mentor-shell-main-fixed")}>
        <div className={cn("mentor-shell-toolbar", view === "review" && "mentor-shell-toolbar-review")}>
          <div className="mentor-toolbar-location">
            <Button
              ref={mobileMenuRef}
              type="button"
              variant="ghost"
              size="icon"
              className="mentor-mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label={t("Open navigation")}
              aria-expanded={mobileOpen}
              aria-controls="mentor-mobile-navigation"
            >
              <Menu size={19} aria-hidden="true" />
            </Button>
            {view === "review" ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden lg:inline-flex h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setReviewSidebarOpen(open => !open)}
                  aria-expanded={reviewSidebarOpen}
                  title={reviewSidebarOpen ? t("reviewWorkspace.hideSidebar") : t("reviewWorkspace.showSidebar")}
                >
                  {reviewSidebarOpen ? (
                    <PanelLeftClose size={15} aria-hidden="true" />
                  ) : (
                    <PanelLeftOpen size={15} aria-hidden="true" />
                  )}
                  <span>{reviewSidebarOpen ? t("reviewWorkspace.hideSidebar") : t("reviewWorkspace.showSidebar")}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-xs shrink-0"
                  onClick={async () => {
                    if (!(await canLeaveWorkspace())) return;
                    if (safeReturnTo) routerNavigate(safeReturnTo);
                    else setParams({ view: "work" });
                    setMobileOpen(false);
                  }}
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  <span className="hidden sm:inline">{t("reviewWorkspace.backToWork")}</span>
                  <span className="sm:hidden">{t("Back")}</span>
                </Button>
              </>
            ) : null}
            <WorkspaceBreadcrumb
              className="mentor-shell-breadcrumb"
              items={(() => {
                const root = { label: t("mentorWorkspace.title"), href: "/mentor-workspace" };
                if (view === "manuscript") {
                  if (manuscriptFromResources && safeReturnTo) {
                    return [
                      root,
                      { label: t("mentorWorkspace.resources"), href: safeReturnTo },
                      { label: t("mentorLifecycle.readOnly"), active: true },
                    ];
                  }
                  const reqId = params.get("requestId");
                  const reqParams = new URLSearchParams({ view: "review-request" });
                  if (reqId) reqParams.set("requestId", reqId);
                  if (safeReturnTo) reqParams.set("returnTo", safeReturnTo);
                  return [
                    root,
                    { label: t("mentorWorkspace.reviewCenterTitle"), href: "/mentor-workspace?view=reviews" },
                    ...(reqId
                      ? [{ label: t("mentorWorkspace.breadcrumb.reviewDetail"), href: `/mentor-workspace?${reqParams}` }]
                      : []),
                    { label: t("mentorLifecycle.readOnly"), active: true },
                  ];
                }
                if (["review", "review-request", "review-entry"].includes(view)) {
                  return [
                    root,
                    { label: t("mentorWorkspace.reviewCenterTitle"), href: "/mentor-workspace?view=reviews" },
                    {
                      label: t(
                        view === "review-request"
                          ? "mentorWorkspace.breadcrumb.reviewDetail"
                          : "mentorWorkspace.breadcrumb.reviewSpace",
                      ),
                      active: true,
                    },
                  ];
                }
                if (view === "template-builder") {
                  return [
                    root,
                    { label: t("mentorWorkspace.templatesTitle"), href: "/mentor-workspace?view=templates" },
                    {
                      label: t(
                        params.get("templateId")
                          ? "mentorWorkspace.breadcrumb.editTemplate"
                          : "mentorWorkspace.breadcrumb.newTemplate",
                      ),
                      active: true,
                    },
                  ];
                }
                if (view === "project") {
                  const backProjectsHref =
                    safeReturnTo &&
                    new URLSearchParams(safeReturnTo.slice(safeReturnTo.indexOf("?") + 1)).get("view") === "projects"
                      ? safeReturnTo
                      : "/mentor-workspace?view=projects";
                  return [
                    root,
                    { label: t("mentorWorkspace.projects"), href: backProjectsHref },
                    { label: t("mentorWorkspace.breadcrumb.projectSpace"), active: true },
                  ];
                }
                return [root, { label: breadcrumbLabel, active: true }];
              })()}
            />
          </div>

          <div className="mentor-toolbar-actions">
            <Button
              asChild
              variant={view === "notifications" ? "secondary" : "ghost"}
              size="icon"
              aria-label={t("mentorWorkspace.notifications")}
              title={t("mentorWorkspace.notifications")}
            >
              <Link to="/mentor-workspace?view=notifications">
                <Bell size={17} aria-hidden="true" />
              </Link>
            </Button>
            <ThemeToggle />
            <LanguageSwitcher />
            <Button asChild variant="outline" size="sm" className="mentor-main-site-link">
              <Link to="/home" aria-label={t("mentorWorkspace.mainSite")}>
                <ArrowLeft size={14} aria-hidden="true" />
                <span>{t("mentorWorkspace.mainSite")}</span>
              </Link>
            </Button>
          </div>
        </div>

        <main className={cn("mentor-global-page mentor-shell-content", view === "review" && "mentor-shell-content-review")}>
          {!dashboard ? (
            <Suspense
              fallback={(
                <>
                  <RoutePendingSignal />
                  <PageSkeleton
                    embedded
                    variant={
                      (view === "review"
                        ? "review-workspace"
                        : ["reviews", "templates", "template-builder", "review-request", "review-entry", "manuscript"].includes(view)
                          ? "review-center"
                          : view === "notifications"
                            ? "notifications"
                            : view === "research-projects"
                              ? "projects"
                              : view === "project"
                                ? "project-detail"
                                : "mentor-queue") as PageSkeletonVariant
                    }
                  />
                </>
              )}
            >
              {view === "research-projects" ? (
                <EmbeddedProjects
                  compact
                  invitationsOnly={params.get("directory") === "invitations"}
                  trashOnly={params.get("directory") === "trash"}
                />
              ) : view === "reviews" ? (
                <div className="mentor-review-content">
                  <EmbeddedReviewCenter />
                </div>
              ) : view === "templates" ? (
                <div className="mentor-review-content">
                  <EmbeddedReviewTemplates />
                </div>
              ) : view === "template-builder" ? (
                <div className="mentor-review-content">
                  <EmbeddedTemplateBuilder key={params.get("templateId") ?? "new"} />
                </div>
              ) : view === "review" ? (
                <div className="mentor-review-content">
                  <EmbeddedReviewWorkspace key={params.get("assignmentId")} />
                </div>
              ) : view === "review-request" ? (
                <div className="mentor-review-content">
                  <EmbeddedReviewRequest key={params.get("requestId")} />
                </div>
              ) : view === "manuscript" ? (
                <div className="mentor-review-content">
                  <EmbeddedReviewRequest key={params.get("requestId")} forceReader />
                </div>
              ) : view === "review-entry" ? (
                <div className="mentor-review-content">
                  <EmbeddedReviewEntry key={params.get("submissionId")} />
                </div>
              ) : view === "resources" ? (
                <MentorSharedResourceInbox />
              ) : view === "contributions" ? (
                <div className="mentor-global-content">
                  <EmbeddedPersonalContributions scope="global" />
                </div>
              ) : view === "notifications" ? (
                <EmbeddedNotifications embedded />
              ) : view === "project" ? (
                <EmbeddedMentorProject embedded />
              ) : (
                <EmbeddedAcademicSupport embedded />
              )}
            </Suspense>
          ) : (
            <div className="mentor-global-content">
              {view === "work" ? (
                query.isError ? (
                  <SectionErrorState
                    error={query.error}
                    title={t("mentorWorkspace.loadError")}
                    onRetry={() => void query.refetch()}
                    retrying={query.isFetching}
                  />
                ) : (
                <>
                  <header className="mentor-page-header">
                    <div className="min-w-0">
                      <h1>{t("mentorWorkspace.work")}</h1>
                      <p>{t("mentorWorkspace.workHint")}</p>
                    </div>
                    {metrics && (metrics.overdue > 0 || metrics.blocked > 0) ? (
                      <div className="mentor-header-pills">
                        {metrics.overdue > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5"
                            onClick={() => openWorkWithFilter({ status: "OVERDUE", sort: "deadline" })}
                          >
                            <Clock3 size={14} aria-hidden="true" />
                            <span>{t("mentorWorkspace.overdueRequests", { count: metrics.overdue })}</span>
                          </Button>
                        ) : null}
                        {metrics.blocked > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5"
                            onClick={() => openWorkWithFilter({ status: "BLOCKED" })}
                          >
                            <ShieldAlert size={14} aria-hidden="true" />
                            <span>{t("mentorWorkspace.blockedRequests", { count: metrics.blocked })}</span>
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </header>
                  <MentorWorkQueue
                    data={data}
                    query={filters}
                    onChange={setFilters}
                    loading={query.isLoading}
                    fetching={query.isFetching}
                    error={query.error}
                    retry={() => void query.refetch()}
                  />
                </>
                )
              ) : view === "projects" ? (
                <>
                  <header className="mentor-page-header">
                    <div className="min-w-0">
                      <h1>{t("mentorWorkspace.projects")}</h1>
                      <p>{t("mentorWorkspace.projectsPageHint")}</p>
                    </div>
                    {metrics && metrics.invitations > 0 ? (
                      <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0">
                        <Link to="/mentor-workspace?view=incoming">
                          <Inbox size={15} aria-hidden="true" />
                          <span>
                            {t("mentorWorkspace.invitations")} ({metrics.invitations})
                          </span>
                        </Link>
                      </Button>
                    ) : null}
                  </header>
                  <MentorProjects
                    data={data}
                    query={projectFilters}
                    loading={query.isLoading}
                    fetching={query.isFetching}
                    error={query.error}
                    retry={() => void query.refetch()}
                    returnTo={projectsReturnTo}
                    onChange={setProjectFilters}
                    onOpenProjectWork={projectId =>
                      openWorkWithFilter({ projectId, status: "ACTIONABLE", sort: "priority" })
                    }
                  />
                </>
              ) : query.isError ? (
                <SectionErrorState
                  error={query.error}
                  title={t("mentorWorkspace.loadError")}
                  onRetry={() => void query.refetch()}
                  retrying={query.isFetching}
                />
              ) : query.isLoading || !data || (view === "overview" && query.isPlaceholderData) ? (
                <PageSkeleton variant="mentor-overview" embedded />
              ) : (
                <MentorOverview
                  data={data}
                  fetching={query.isFetching}
                  refresh={() => void query.refetch()}
                  openWork={openWorkWithFilter}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
