import { useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Clock3,
  Compass,
  FileText,
  FolderOpen,
  GraduationCap,
  Inbox,
  ListTodo,
  MessageSquare,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import type { MentorWorkQuery, MentorWorkspaceData } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { useAcademicProfile } from "@/features/academic-profile/hooks/use-academic-profile";
import { useMentorWorkspace } from "@/features/projects/hooks/use-mentor-workspace";
import { MentorQueueLoading, MentorWorkQueue, MentorWorkRows } from "@/features/projects/components/mentor-work-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSingleSidebar, useSidebarCollapse } from "@/components/layout/app-single-sidebar";
import { WorkspaceBreadcrumb } from "@/components/layout/workspace-breadcrumb";
import { cn } from "@/utils/cn";

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
          <Button asChild variant="outline">
            <Link to="/academic-support?view=incoming">{t("mentorWorkspace.invitations")}</Link>
          </Button>
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
                    <Link className="mentor-project-title" to={`/projects/${project.id}?tab=tasks`}>
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
                      <Link to={`/projects/${project.id}?tab=tasks`}>
                        {t("mentorWorkspace.openProject")}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="mentor-shortcut-btn">
                      <Link to={`/projects/${project.id}?tab=chat&channel=mentors`}>
                        <MessageSquare size={14} aria-hidden="true" />
                        <span>{t("mentorWorkspace.projectChat")}</span>
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="mentor-shortcut-btn">
                      <Link to={`/projects/${project.id}`}>
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
  const { t } = useI18n();
  const [collapsed, toggleCollapse] = useSidebarCollapse();
  const profile = useAcademicProfile();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "work" ? "work" : params.get("view") === "projects" ? "projects" : "overview";
  const [filters, setFilters] = useState<MentorWorkQuery>({ page: 1, status: "ACTIONABLE", sort: "priority" });
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPage, setProjectPage] = useState(1);

  const lecturer = profile.data?.academicRole === "LECTURER";
  const verified =
    lecturer &&
    profile.data?.academicRoleVerificationStatus === "VERIFIED" &&
    profile.data?.verificationStatuses?.position === "VERIFIED";

  const query = useMentorWorkspace(
    {
      ...(view === "work" ? filters : { pageSize: 6 }),
      projectPage,
      projectSearch: view === "projects" ? projectSearch : undefined,
    },
    verified,
  );

  const navigate = (next: string) => setParams({ view: next });
  const openWorkWithFilter = (patch: Partial<MentorWorkQuery>) => {
    setFilters({ page: 1, sort: "priority", status: "ACTIONABLE", ...patch });
    navigate("work");
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
  if (!verified) {
    return (
      <main className="mentor-global-page" data-no-i18n>
        <h1>{t("mentorWorkspace.title")}</h1>
        <p>{t("mentorWorkspace.verifyRequired")}</p>
        <Button asChild>
          <Link to="/settings/verification/lecturer">{t("mentorWorkspace.verify")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/academic-support?view=incoming">{t("mentorWorkspace.invitations")}</Link>
        </Button>
      </main>
    );
  }

  const data = !query.error ? query.data : undefined;
  const metrics = data?.summary;

  return (
    <main className="mentor-global-page" data-no-i18n>
      <header className="mentor-global-header">
        <div className="mentor-header-copy">
          <span className="mentor-eyebrow-pill">
            <GraduationCap size={13} aria-hidden="true" />
            <span>{t("mentorWorkspace.eyebrow")}</span>
          </span>
          <h1>{t("mentorWorkspace.title")}</h1>
          <p>{t("mentorWorkspace.subtitle")}</p>
        </div>
        <div className="mentor-header-actions">
          {metrics && metrics.needsResponse > 0 ? (
            <Button onClick={() => openWorkWithFilter({ status: "ACTIONABLE" })}>
              <ListTodo size={16} aria-hidden="true" />
              {t("mentorWorkspace.metric.needsResponse")} ({metrics.needsResponse})
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/academic-support?view=incoming">
              <Inbox size={16} aria-hidden="true" />
              {t("mentorWorkspace.invitations")}
              {metrics ? ` (${metrics.invitations})` : ""}
            </Link>
          </Button>
        </div>
      </header>

      <div className={cn("mentor-global-layout", collapsed && "sidebar-collapsed")}>
        <aside className="mentor-global-sidebar">
          <AppSingleSidebar
            activeWorkspace="mentor"
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            activeMentorView={view}
            onSelectMentorView={navigate}
            mentorMetrics={metrics}
            recentProjects={data?.projects}
          />
        </aside>

        <div className="mentor-global-content">
          <WorkspaceBreadcrumb
            items={[
              { label: t("mentorWorkspace.title"), href: "/mentor-workspace" },
              {
                label: t(`mentorWorkspace.${view === "overview" ? "overview" : view}`),
                active: true,
              },
            ]}
          />
          {query.isError ? (
            <div className="mentor-queue-empty" role="alert">
              <p>{t("mentorWorkspace.loadError")}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                {t("Try again")}
              </Button>
            </div>
          ) : (
            <>
              {metrics ? (
                <div className="mentor-summary" role="region" aria-label={t("mentorWorkspace.overview")}>
                  <button
                    type="button"
                    className="mentor-kpi-card"
                    data-tone="primary"
                    data-active={view === "projects"}
                    onClick={() => navigate("projects")}
                  >
                    <span className="mentor-kpi-top">
                      <FolderOpen size={15} aria-hidden="true" />
                      <span>{t("mentorWorkspace.metric.projects")}</span>
                    </span>
                    <strong className="mentor-kpi-value">{metrics.projects}</strong>
                  </button>

                  <button
                    type="button"
                    className="mentor-kpi-card"
                    data-tone={metrics.needsResponse > 0 ? "amber" : "neutral"}
                    data-active={view === "work" && filters.status === "ACTIONABLE" && !filters.kind}
                    onClick={() => openWorkWithFilter({ status: "ACTIONABLE", sort: "priority" })}
                  >
                    <span className="mentor-kpi-top">
                      <Clock3 size={15} aria-hidden="true" />
                      <span>{t("mentorWorkspace.metric.needsResponse")}</span>
                    </span>
                    <strong className="mentor-kpi-value">{metrics.needsResponse}</strong>
                  </button>

                  <button
                    type="button"
                    className="mentor-kpi-card"
                    data-tone={metrics.overdue > 0 ? "danger" : "neutral"}
                    onClick={() => openWorkWithFilter({ status: "ACTIONABLE", sort: "deadline" })}
                  >
                    <span className="mentor-kpi-top">
                      <AlertTriangle size={15} aria-hidden="true" />
                      <span>{t("mentorWorkspace.metric.overdue")}</span>
                    </span>
                    <strong className="mentor-kpi-value">{metrics.overdue}</strong>
                  </button>

                  <button
                    type="button"
                    className="mentor-kpi-card"
                    data-tone={metrics.blocked > 0 ? "danger" : "neutral"}
                    data-active={view === "work" && filters.status === "BLOCKED"}
                    onClick={() => openWorkWithFilter({ status: "BLOCKED" })}
                  >
                    <span className="mentor-kpi-top">
                      <ShieldAlert size={15} aria-hidden="true" />
                      <span>{t("mentorWorkspace.metric.blocked")}</span>
                    </span>
                    <strong className="mentor-kpi-value">{metrics.blocked}</strong>
                  </button>

                  <button
                    type="button"
                    className="mentor-kpi-card"
                    data-tone={metrics.manuscripts > 0 ? "indigo" : "neutral"}
                    data-active={view === "work" && filters.kind === "MANUSCRIPT_REVIEW"}
                    onClick={() => openWorkWithFilter({ kind: "MANUSCRIPT_REVIEW", status: "ACTIONABLE" })}
                  >
                    <span className="mentor-kpi-top">
                      <FileText size={15} aria-hidden="true" />
                      <span>{t("mentorWorkspace.metric.manuscripts")}</span>
                    </span>
                    <strong className="mentor-kpi-value">{metrics.manuscripts}</strong>
                  </button>

                  <Link
                    className="mentor-kpi-card"
                    data-tone={metrics.invitations > 0 ? "emerald" : "neutral"}
                    to="/academic-support?view=incoming"
                  >
                    <span className="mentor-kpi-top">
                      <Inbox size={15} aria-hidden="true" />
                      <span>{t("mentorWorkspace.metric.invitations")}</span>
                    </span>
                    <strong className="mentor-kpi-value">{metrics.invitations}</strong>
                  </Link>
                </div>
              ) : null}

              <header className="mentor-content-heading">
                <h2>{t(`mentorWorkspace.${view === "overview" ? "priorities" : view}`)}</h2>
                {view === "overview" ? (
                  <Button variant="ghost" size="sm" onClick={() => navigate("work")}>
                    {t("mentorWorkspace.viewAll")}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Button>
                ) : null}
              </header>

              {view === "work" ? (
                <MentorWorkQueue
                  data={data}
                  query={filters}
                  onChange={setFilters}
                  loading={query.isLoading}
                  fetching={query.isFetching}
                  error={query.error}
                  retry={() => void query.refetch()}
                />
              ) : query.isLoading || !data ? (
                <MentorQueueLoading />
              ) : view === "projects" ? (
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
              ) : (
                <>
                  {data.items.length ? (
                    <MentorWorkRows items={data.items} />
                  ) : (
                    <div className="mentor-queue-empty">
                      <h3>{t("mentorWorkspace.emptyPriorities")}</h3>
                      <p>{t("mentorWorkspace.emptyWorkHint")}</p>
                    </div>
                  )}
                  <div className="mentor-overview-links">
                    <Link to="/mentor-workspace?view=projects">
                      <FolderOpen size={18} aria-hidden="true" />
                      <span>
                        {t("mentorWorkspace.projects")}
                        <small>{t("mentorWorkspace.projectsHint")}</small>
                      </span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                    <Link to="/academic-support?view=incoming">
                      <Inbox size={18} aria-hidden="true" />
                      <span>
                        {t("mentorWorkspace.invitations")}
                        <small>{t("mentorWorkspace.consent")}</small>
                      </span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
