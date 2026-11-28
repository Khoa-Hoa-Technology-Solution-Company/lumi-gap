import { Suspense, useMemo, useRef, useEffect } from "react";
import { Navigate, Outlet, useLocation, useParams, useSearchParams } from "react-router-dom";
import { FolderOpen, ChevronRight, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PageLoading } from "@/components/page-loading";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { useProject, useProjects } from "@/features/projects/hooks/use-projects";
import { readProjectSearchFilters, selectDirectoryProjects } from "@/features/projects/utils/project-directory";
import { projectWorkspaceHref, readLastVisitedProject, writeLastVisitedProject } from "@/features/projects/utils/project-workspace-navigation";
import { ProjectsListPage } from "./projects-list";
import { ProjectSectionNav, resolveProjectTab, type ProjectTab } from "@/features/projects/components/project-section-nav";
import { canLeaveWorkspace } from "@/features/projects/components/workspace-common";
import { useMentorProjectEntry } from "@/features/projects/hooks/use-mentor-project-entry";
import { MentorProjectNav } from "@/features/projects/components/mentor-project-workspace";
import { useMentoredProjects } from "@/features/projects/hooks/use-mentored-projects";
import { AppSingleSidebar, useSidebarCollapse } from "@/components/layout/app-single-sidebar";
import { cn } from "@/utils/cn";
import "@/features/projects/project-browser.css";
import "@/features/projects/workspace-coordination.css";

export function ProjectsWorkspacePage() {
  const user = useAuthStore(state => state.user);
  const { id } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const [collapsed, toggleCollapse] = useSidebarCollapse();
  // Public summary links remain available without loading a personal project library.
  if (!user || (user.systemRole !== "ADMIN" && !user.emailVerifiedAt)) return <Outlet />;
  // Old links must not hide projects behind controls that no longer exist.
  if ((id || user.academicRole !== "LECTURER") && ["scope", "status", "sort"].some(key => params.has(key))) {
    const search = new URLSearchParams(params);
    ["scope", "status", "sort"].forEach(key => search.delete(key));
    return <Navigate to={{ pathname: location.pathname, search: search.toString(), hash: location.hash }} replace />;
  }
  return <div className={cn("projects-page project-browser", collapsed && "sidebar-collapsed")}>
    <aside className="project-browser-sidebar"><WorkspaceSidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} /></aside>
    <div className="project-browser-panel">
      <Suspense fallback={<ProjectWorkspaceLoading />}><Outlet key={id} /></Suspense>
    </div>
  </div>;
}

function WorkspaceSidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: (val?: boolean) => void;
}) {
  const { id } = useParams();
  const { t, language } = useI18n();
  const user = useAuthStore(state => state.user);
  const userId = user?.id;
  const { data: projects, isLoading: projectsLoading, isFetching: projectsFetching, isError: projectsError } = useProjects();
  const mentoring = useMentoredProjects(user?.academicRole !== "LECTURER");
  const { data: currentProject, isLoading: projectLoading, error: projectError } = useProject(id);
  const [params, setParams] = useSearchParams();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Detail carries fresh counts and access after mutations; the library may
  // still contain an older row while its background refresh is in progress.
  const status = (projectError as { response?: { status?: number } } | null)?.response?.status;
  const unavailable = status === 403 || status === 404;
  const mentorEntry = useMentorProjectEntry(id, Boolean(id && (unavailable || currentProject?.isPublicSummary)));
  const mentor = !mentorEntry.error && mentorEntry.data?.policies.some(p => p.mentorId === mentorEntry.data.viewerId && p.policy.effective) ? mentorEntry.data : undefined;
  const project = unavailable ? undefined : currentProject ? (currentProject.accessRole ? currentProject : undefined) : projects?.find(item => item._id === id);
  const loading = !!id && !unavailable && !project && (projectsLoading || projectLoading);
  // The directory redirects as soon as its query settles. Opening its picker
  // before that decision flashes a dropdown on the first visit.
  const directoryNeedsChoice = user?.academicRole !== "LECTURER" && !id && !mentoring.isLoading && !mentoring.data?.length && !mentoring.isError && !["invitations", "trash"].includes(params.get("view") ?? "") && !projectsLoading && !projectsFetching && (
    projectsError || params.get("create") === "1" ||
    !selectDirectoryProjects(projects ?? [], readProjectSearchFilters(params), userId, language).length
  );
  const active = resolveProjectTab(params.get("tab"));
  const rawTab = params.get("tab");
  useEffect(() => {
    if (!userId || !id || (!project && !mentor)) return;
    writeLastVisitedProject(userId, id, rawTab);
  }, [userId, id, project, mentor, rawTab]);
  const navigate = async (tab: ProjectTab) => {
    if (!(await canLeaveWorkspace())) return;
    const next = new URLSearchParams();
    next.set("tab", tab);
    if (params.get("q")) next.set("q", params.get("q")!);
    setParams(next);
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (detailsRef.current?.open && !detailsRef.current.contains(target)) {
        detailsRef.current.removeAttribute("open");
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.removeAttribute("open");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handlePopoverClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("a") || target.closest(".project-switcher-item")) {
      detailsRef.current?.removeAttribute("open");
    }
  };

  if (mentor && (unavailable || currentProject?.isPublicSummary)) return <div className="space-y-4 p-3" data-no-i18n><div className="border-b pb-4"><p className="break-words font-semibold">{mentor.title}</p><p className="mt-1 text-xs text-muted-foreground">Cố vấn dự án</p></div><MentorProjectNav contributions={mentor.policies.some(p=>p.mentorId===mentor.viewerId&&p.policy.effective&&p.policy.permissions.includes("CONTRIBUTIONS_VIEW"))} /></div>;

  const canAccessMentor = Boolean(
    user?.academicRole === "LECTURER" ||
    (mentoring.data && mentoring.data.length > 0) ||
    user?.systemRole === "ADMIN"
  );

  return (
    <AppSingleSidebar
      activeWorkspace="research"
      canAccessMentor={canAccessMentor}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      currentProjectId={id}
      researchProjects={projects}
    >
      <details ref={detailsRef} className="coord-project-picker" open={directoryNeedsChoice || undefined} key={id ? "selected" : "directory"}>
        <summary className="group" title={`${project?.title ?? t("Projects")} · ${t("Switch project")}`} aria-label={t("Switch project")}>
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
        <div className="coord-project-picker-popover" onClick={handlePopoverClick}>
          <ProjectsListPage compact />
        </div>
      </details>
      {id && (project || loading) && <ProjectSectionNav activeTab={active} onChange={navigate} paperCount={project?.paperCount ?? 0} memberCount={project?.memberCount ?? 0} loading={loading} collapsed={collapsed} />}
    </AppSingleSidebar>
  );
}

function ProjectWorkspaceLoading() {
  return (
    <div className="project-browser-loading">
      <PageLoading className="min-h-[450px] items-start pt-8" />
    </div>
  );
}

export function ProjectWorkspaceStart() {
  const { data: projects, isLoading, isError, isFetching } = useProjects();
  const user = useAuthStore(state => state.user);
  const userId = user?.id;
  const mentoring = useMentoredProjects(user?.academicRole !== "LECTURER");
  const { t, language } = useI18n();
  const [params] = useSearchParams();
  const saved = readLastVisitedProject(userId);
  const candidates = useMemo(() => selectDirectoryProjects(projects ?? [], readProjectSearchFilters(params), userId, language), [projects, params, userId, language]);
  const savedProject = saved ? candidates.find(project => project._id === saved.projectId) : undefined;
  const first = candidates.find(project => project.status !== "ARCHIVED") ?? candidates[0];
  if (params.get("view") === "trash") return <ProjectsListPage trashOnly />;
  if (params.get("view") === "invitations") return <ProjectsListPage invitationsOnly />;
  if (user?.academicRole === "LECTURER") return <ProjectsListPage />;
  if (isLoading || mentoring.isLoading) return <ProjectWorkspaceLoading />;
  if (mentoring.isError || (!mentoring.error && mentoring.data?.length)) return <ProjectsListPage />;
  // Confirm the refreshed library before redirecting: a cached project may have
  // just been deleted or left by this user.
  if (isFetching) return <ProjectWorkspaceLoading />;
  const target = savedProject ?? first;
  if (target && !isError && params.get("create") !== "1") return <Navigate to={projectWorkspaceHref(target._id, params, savedProject ? saved?.tab : undefined)} replace />;
  return <div className="project-browser-welcome" data-no-i18n>
    <FolderOpen aria-hidden="true" />
    <h1>{t(projects?.length ? "Choose a project" : "Your research workspace")}</h1>
    <p>{t(projects?.length ? "Choose a project to open its literature, research outputs and team." : "Create a project to bring your literature, research outputs and team together.")}</p>
    <div className="mt-5 flex justify-center">
      <Link to="/projects?view=trash" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        <span>{t("Trash")}</span>
      </Link>
    </div>
  </div>;
}
