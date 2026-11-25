import { MentorSharedResourceInbox } from "@/features/projects/components/mentor-paper-sharing";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  BookOpen,
  Clock3,
  Compass,
  FolderOpen,
  Inbox,
  ListTodo,
  Menu,
  MessageSquare,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import type { MentorWorkQuery, MentorWorkspaceData } from "@trend/shared-types";
import { LanguageSwitcher, useI18n } from "@/i18n";
import { useAcademicProfile } from "@/features/academic-profile/hooks/use-academic-profile";
import { useMentorWorkspace } from "@/features/projects/hooks/use-mentor-workspace";
import { MentorQueueLoading, MentorWorkQueue } from "@/features/projects/components/mentor-work-queue";
import { MentorOverview } from "@/features/projects/components/mentor-overview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSingleSidebar, useSidebarCollapse } from "@/components/layout/app-single-sidebar";
import { WorkspaceBreadcrumb } from "@/components/layout/workspace-breadcrumb";
import { cn } from "@/utils/cn";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import "@/features/projects/mentor-workspace-shell.css";
import { readMentorWorkFilters, writeMentorWorkFilters, mentorWorkspaceDestination, researchProjectDirectoryDestination } from "@/features/projects/utils/mentor-workspace-navigation";
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

type ProjectQuickFilter = "ALL" | "ATTENTION" | "ACTIVE";

function MentorProjects({
  data,
  page,
  search,
  onChange,
  onOpenProjectWork,
}: {
  data: MentorWorkspaceData;
  page: number;
  search: string;
  onChange: (page: number, search: string) => void;
  onOpenProjectWork: (projectId: string) => void;
}) {
  const { t, language } = useI18n();
  const [quickFilter, setQuickFilter] = useState<ProjectQuickFilter>("ALL");

  const attentionCount = useMemo(
    () => data.projects.filter(project => project.pendingCount > 0).length,
    [data.projects],
  );
  const visibleProjects = useMemo(() => {
    if (quickFilter === "ATTENTION") return data.projects.filter(project => project.pendingCount > 0);
    if (quickFilter === "ACTIVE") return data.projects.filter(project => project.status === "ACTIVE");
    return data.projects;
  }, [data.projects, quickFilter]);

  return (
    <section className="mentor-projects-section">
      {data.projects.length > 0 || Boolean(search) ? (
        <div className="mentor-projects-toolbar">
          <div className="mentor-project-search">
            <Search size={16} aria-hidden="true" className="mentor-project-search-icon" />
            <Input
              type="search"
              maxLength={160}
              aria-label={t("mentorWorkspace.searchProjects")}
              placeholder={t("mentorWorkspace.searchProjects")}
              value={search}
              onChange={e => onChange(1, e.target.value)}
            />
            {search ? (
              <button
                type="button"
                className="mentor-search-clear"
                aria-label={t("mentorWorkspace.clearProjectSearch")}
                onClick={() => onChange(1, "")}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {data.projects.length > 0 ? (
            <div className="mentor-filter-chips" role="group" aria-label={t("mentorWorkspace.projects")}>
              <button
                type="button"
                className="mentor-filter-chip"
                data-active={quickFilter === "ALL"}
                onClick={() => setQuickFilter("ALL")}
              >
                <span>{t("mentorWorkspace.filterAllProjects")}</span>
                <span className="mentor-chip-count">{data.projects.length}</span>
              </button>
              <button
                type="button"
                className="mentor-filter-chip"
                data-active={quickFilter === "ATTENTION"}
                data-tone={attentionCount > 0 ? "attention" : undefined}
                onClick={() => setQuickFilter("ATTENTION")}
              >
                <span>{t("mentorWorkspace.filterNeedsAttention")}</span>
                <span className="mentor-chip-count">{attentionCount}</span>
              </button>
              <button
                type="button"
                className="mentor-filter-chip"
                data-active={quickFilter === "ACTIVE"}
                onClick={() => setQuickFilter("ACTIVE")}
              >
                <span>{t("mentorWorkspace.filterActiveProjects")}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {data.projects.length > 0 ? (
        <p className="mentor-projects-count">
          {t("mentorWorkspace.showingProjectsCount", { shown: visibleProjects.length, total: data.projects.length })}
        </p>
      ) : null}

      {!data.projects.length ? (
        <div className="mentor-queue-empty">
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
      ) : !visibleProjects.length ? (
        <div className="mentor-queue-empty">
          <h3>{t("mentorWorkspace.noProjectsMatchFilter")}</h3>
          <Button variant="outline" size="sm" onClick={() => setQuickFilter("ALL")}>
            {t("mentorWorkspace.showAllOnPage")}
          </Button>
        </div>
      ) : (
        <ul className="mentor-project-list">
          {visibleProjects.map(project => {
            const hasPending = project.pendingCount > 0;
            return (
              <li key={project.id} className="mentor-project-card" data-pending={hasPending}>
                <div className="mentor-project-card-main">
                  <div className="mentor-project-card-top">
                    <Link
                      className="mentor-project-title"
                      to={mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}?tab=tasks`)}
                    >
                      {project.title}
                    </Link>
                    <div className="mentor-project-badges">
                      <Badge variant="secondary" className="mentor-status-badge">
                        {t(`mentorWorkspace.projectStatus.${project.status}`)}
                      </Badge>
                      <span className="mentor-pending-pill" data-pending={hasPending}>
                        {hasPending
                          ? t("mentorWorkspace.pendingCount", { count: project.pendingCount })
                          : t("mentorWorkspace.noPending")}
                      </span>
                    </div>
                  </div>

                  <div className="mentor-project-meta">
                    {project.researchField ? (
                      <span className="mentor-meta-pill">
                        <BookOpen size={13} aria-hidden="true" />
                        <span>{project.researchField}</span>
                      </span>
                    ) : null}
                    <span className="mentor-meta-item">
                      <Users size={13} aria-hidden="true" />
                      <span>{t("mentorWorkspace.team", { name: project.teamLead, count: project.teamSize })}</span>
                    </span>
                    {project.researchStage ? (
                      <span className="mentor-meta-item">
                        <Compass size={13} aria-hidden="true" />
                        <span>{t(`mentorWorkspace.stage.${project.researchStage}`)}</span>
                      </span>
                    ) : null}
                    <span className="mentor-meta-item">
                      <Clock3 size={13} aria-hidden="true" />
                      <span>
                        {t("mentorWorkspace.lastActivity")}{" "}
                        <time dateTime={project.updatedAt}>
                          {new Date(project.updatedAt).toLocaleDateString(language)}
                        </time>
                      </span>
                    </span>
                  </div>
                </div>

                <div className="mentor-project-card-actions">
                  {hasPending ? (
                    <Button size="sm" onClick={() => onOpenProjectWork(project.id)}>
                      <ListTodo size={14} aria-hidden="true" />
                      {t("mentorWorkspace.reviewPendingWork", { count: project.pendingCount })}
                    </Button>
                  ) : null}
                  <div className="mentor-project-shortcuts">
                    <Button asChild size="sm" variant={hasPending ? "outline" : "default"}>
                      <Link to={mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}?tab=tasks`)}>
                        {t("mentorWorkspace.openProject")}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="mentor-shortcut-btn">
                      <Link to={mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}?tab=chat&channel=mentors`)}>
                        <MessageSquare size={14} aria-hidden="true" />
                        <span>{t("mentorWorkspace.projectChat")}</span>
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="mentor-shortcut-btn">
                      <Link to={mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}`)}>
                        <span>{t("mentorWorkspace.projectOverview")}</span>
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data.projectMeta.totalPages > 1 ? (
        <nav className="mentor-pagination" aria-label={t("mentorWorkspace.pagination")}>
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1, search)}>
            {t("Previous")}
          </Button>
          <span>{t("mentorWorkspace.pageCount", { page, total: data.projectMeta.totalPages })}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= data.projectMeta.totalPages}
            onClick={() => onChange(page + 1, search)}
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
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const profile = useAcademicProfile();
  const [params, setParams] = useSearchParams();
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
        "resources",
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
      : ["reviews", "review", "review-request", "review-entry"].includes(view)
        ? t("mentorWorkspace.reviewCenterTitle")
        : ["templates", "template-builder"].includes(view)
          ? t("mentorWorkspace.templatesTitle")
          : t(`mentorWorkspace.${breadcrumbKey}`);

  useEffect(() => {
    if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
  }, [view]);

  const filters = readMentorWorkFilters(params);
  const setFilters = (next: MentorWorkQuery) => setParams(current => writeMentorWorkFilters(current, next));
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPage, setProjectPage] = useState(1);

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

  const query = useMentorWorkspace(
    {
      ...(view === "work" ? filters : { pageSize: 6 }),
      projectPage: view === "projects" ? projectPage : 1,
      projectSearch: view === "projects" ? projectSearch : undefined,
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
  };

  if (profile.isLoading) {
    return (
      <main className="mentor-global-page">
        <MentorQueueLoading />
      </main>
    );
  }
  if (profile.isError) {
    return (
      <main className="mentor-global-page">
        <p role="alert">{t("mentorWorkspace.loadError")}</p>
        <Button onClick={() => void profile.refetch()}>{t("Try again")}</Button>
      </main>
    );
  }
  if (!lecturer) return <Navigate to="/academic-support" replace />;
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
          <Button asChild variant="outline">
            <Link to="/academic-support?view=incoming">{t("mentorWorkspace.invitations")}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const data = !query.error ? query.data : undefined;
  const metrics = data?.summary;

  return (
    <div className={cn("mentor-workspace-shell", collapsed && "mentor-shell-collapsed")} data-no-i18n>
      <div className="mentor-shell-sidebar">
        <AppSingleSidebar
          activeWorkspace="mentor"
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          activeMentorView={view === "research-projects" ? "projects" : view}
          onSelectMentorView={navigate}
          mentorMetrics={metrics}
          recentProjects={data?.projects}
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
              activeMentorView={view === "research-projects" ? "projects" : view}
              onSelectMentorView={navigate}
              mentorMetrics={metrics}
              recentProjects={data?.projects}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div ref={contentScrollRef} className={cn("mentor-shell-main", view === "review" && "mentor-shell-main-fixed")}>
        <div className="mentor-shell-toolbar">
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
            <WorkspaceBreadcrumb
              className="mentor-shell-breadcrumb"
              items={(() => {
                const root = { label: t("mentorWorkspace.title"), href: "/mentor-workspace" };
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
                  return [
                    root,
                    { label: t("mentorWorkspace.projects"), href: "/mentor-workspace?view=projects" },
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
            <Suspense fallback={<MentorQueueLoading />}>
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
              ) : view === "review-entry" ? (
                <div className="mentor-review-content">
                  <EmbeddedReviewEntry key={params.get("submissionId")} />
                </div>
              ) : view === "resources" ? (
                <MentorSharedResourceInbox />
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
              {query.isError ? (
                <div className="mentor-queue-empty" role="alert">
                  <p>{t("mentorWorkspace.loadError")}</p>
                  <Button variant="outline" onClick={() => void query.refetch()}>
                    {t("Try again")}
                  </Button>
                </div>
              ) : view === "work" ? (
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
              ) : query.isLoading || !data || (view === "overview" && query.isPlaceholderData) ? (
                <MentorQueueLoading />
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
                    page={projectPage}
                    search={projectSearch}
                    onChange={(page, search) => {
                      setProjectPage(page);
                      setProjectSearch(search);
                    }}
                    onOpenProjectWork={projectId =>
                      openWorkWithFilter({ projectId, status: "ACTIONABLE", sort: "priority" })
                    }
                  />
                </>
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
