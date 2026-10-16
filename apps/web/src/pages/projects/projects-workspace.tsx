import { Suspense, useMemo } from "react";
import { Navigate, Outlet, useLocation, useParams, useSearchParams } from "react-router-dom";
import { FolderOpen, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { readProjectSearchFilters, selectDirectoryProjects } from "@/features/projects/utils/project-directory";
import { projectWorkspaceHref } from "@/features/projects/utils/project-workspace-navigation";
import { ProjectsListPage } from "./projects-list";
import { ProjectSectionNav, projectSections, type ProjectTab } from "@/features/projects/components/project-section-nav";
import { canLeaveWorkspace } from "@/features/projects/components/workspace-common";
import "@/features/projects/project-browser.css";
import "@/features/projects/workspace-coordination.css";

export function ProjectsWorkspacePage() {
  const user = useAuthStore(state => state.user);
  const { id } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  // Public summary links remain available without loading a personal project library.
  if (!user || (user.systemRole !== "ADMIN" && !user.emailVerifiedAt)) return <Outlet />;
  // Old links must not hide projects behind controls that no longer exist.
  if (["scope", "status", "sort"].some(key => params.has(key))) {
    const search = new URLSearchParams(params);
    ["scope", "status", "sort"].forEach(key => search.delete(key));
    return <Navigate to={{ pathname: location.pathname, search: search.toString(), hash: location.hash }} replace />;
  }
  return <div className="projects-page project-browser">
    <aside className="project-browser-sidebar"><WorkspaceSidebar /></aside>
    <div className="project-browser-panel">
      <Suspense fallback={<ProjectWorkspaceLoading />}><Outlet key={id} /></Suspense>
    </div>
  </div>;
}

function WorkspaceSidebar() {
  const { id } = useParams(); const { t } = useI18n(); const { data: projects } = useProjects(); const [params, setParams] = useSearchParams();
  const project = projects?.find(item => item._id === id);
  const active = projectSections.some(section => section.key === params.get("tab")) ? params.get("tab") as ProjectTab : "overview";
  const navigate = (tab: ProjectTab) => {
    if (!canLeaveWorkspace()) return;
    const next = new URLSearchParams(); next.set("tab", tab); if (params.get("q")) next.set("q", params.get("q")!);
    setParams(next);
  };
  return <>
    <details className="coord-project-picker" open={!id || undefined} key={id ? "selected" : "directory"}>
      <summary className="group">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-xs">
            <FolderOpen className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block font-bold text-base truncate text-foreground">{project?.title ?? t("Projects")}</span>
            <small className="block text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">{t("Switch project")}</small>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-2 pt-2 border-t border-border/60">
        <ProjectsListPage compact />
      </div>
    </details>
    {id && project && <ProjectSectionNav activeTab={active} onChange={navigate} paperCount={project.paperCount ?? 0} memberCount={project.memberCount ?? 0} />}
  </>;
}

function ProjectWorkspaceLoading() {
  const { t } = useI18n();
  return <div className="project-browser-loading" role="status" aria-label={t("Loading projects")}>
    <Skeleton className="h-5 w-32" /><Skeleton className="mt-4 h-10 w-64 max-w-full" />
    <Skeleton className="mt-6 h-10 w-full" /><Skeleton className="mt-6 h-64 w-full" />
  </div>;
}

export function ProjectWorkspaceStart() {
  const { data: projects, isLoading, isError, isFetching } = useProjects();
  const userId = useAuthStore(state => state.user?.id);
  const { t, language } = useI18n();
  const [params] = useSearchParams();
  const candidates = useMemo(() => selectDirectoryProjects(projects ?? [], readProjectSearchFilters(params), userId, language), [projects, params, userId, language]);
  const first = candidates.find(project => project.status !== "ARCHIVED") ?? candidates[0];
  if (isLoading || isFetching) return <ProjectWorkspaceLoading />;
  if (first && !isError && params.get("create") !== "1") return <Navigate to={projectWorkspaceHref(first._id, params)} replace />;
  return <div className="project-browser-welcome" data-no-i18n>
    <FolderOpen aria-hidden="true" />
    <h1>{t(projects?.length ? "Choose a project" : "Your research workspace")}</h1>
    <p>{t(projects?.length ? "Choose a project to open its literature, research outputs and team." : "Create a project to bring your literature, research outputs and team together.")}</p>
  </div>;
}
