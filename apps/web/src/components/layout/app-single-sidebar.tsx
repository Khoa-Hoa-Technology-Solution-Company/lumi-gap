import { useCallback, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bell,
  BookMarked,
  BookOpenCheck,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  ExternalLink,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Users,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import logoImage from "@/assets/logo.png";
import { mentorWorkspaceDestination } from "@/features/projects/utils/mentor-workspace-navigation";
import "./app-single-sidebar.css";

export function useSidebarCollapse() {
  const [collapsed, setCollapsedState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("lumigap.sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggle = useCallback((value?: boolean) => {
    setCollapsedState(prev => {
      const next = typeof value === "boolean" ? value : !prev;
      try {
        localStorage.setItem("lumigap.sidebar.collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return [collapsed, toggle] as const;
}

export interface AppSingleSidebarProps {
  activeWorkspace: "research" | "mentor";
  canAccessMentor?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  // Mentor-specific
  activeMentorView?:
    | "overview"
    | "work"
    | "projects"
    | "incoming"
    | "outgoing"
    | "active"
    | "history"
    | "discover"
    | "notifications"
    | "project"
    | "reviews"
    | "templates"
    | "template-builder"
    | "review"
    | "review-request"
    | "review-entry"
    | "resources";
  onSelectMentorView?: (view: "overview" | "work" | "projects") => void;
  mentorMetrics?: {
    projects: number;
    needsResponse: number;
    overdue: number;
    blocked: number;
    manuscripts: number;
    invitations: number;
  };
  recentProjects?: Array<{
    id: string;
    title: string;
    pendingCount: number;
  }>;
  unreadNotificationCount?: number;
  // Research-specific
  currentProjectId?: string;
  researchProjects?: Array<{
    _id: string;
    title: string;
    paperCount?: number;
    status?: string;
  }>;
  children?: ReactNode;
}

export function AppSingleSidebar({
  activeWorkspace,
  collapsed = false,
  onToggleCollapse,
  activeMentorView = "overview",
  onSelectMentorView,
  mentorMetrics,
  recentProjects,
  unreadNotificationCount = 0,
  currentProjectId,
  researchProjects,
  children,
}: AppSingleSidebarProps) {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const user = useAuthStore(s => s.user);

  const wrapTooltip = (node: ReactNode, label: string, count?: number, key?: string) =>
    collapsed ? (
      <Tooltip key={key}>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right">
          {label}
          {typeof count === "number" && count > 0 ? ` (${count})` : ""}
        </TooltipContent>
      </Tooltip>
    ) : (
      <div key={key}>{node}</div>
    );

  const isAcademicReviewActive = [
    "reviews",
    "review",
    "review-request",
    "review-entry",
    "templates",
    "template-builder",
  ].includes(activeMentorView);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn("app-single-sidebar", activeWorkspace === "mentor" && "admin-style")}
        data-collapsed={collapsed ? "true" : "false"}
        data-no-i18n
        aria-label={t("Sidebar navigation") || "Thanh điều hướng"}
      >
        {/* Brand Header for Mentor Workspace */}
        {activeWorkspace === "mentor" && !collapsed && (
          <div className="sidebar-brand-badge">
            <Link to="/home" className="flex items-center gap-2 group min-w-0" title="LumiGap">
              <img src={logoImage} alt="LumiGap" className="sidebar-brand-logo" />
              <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-xs">
                Mentor
              </span>
            </Link>
          </div>
        )}

        {/* Workspace Navigation Body */}
        {activeWorkspace === "mentor" ? (
          <nav className="sidebar-main-nav" aria-label={t("mentorWorkspace.navigation")}>
            {/* Group 1: Core Mentor Workspace (5 task-oriented items) */}
            {!collapsed && (
              <p className="sidebar-category-heading">{t("mentorWorkspace.navGroup.workspace")}</p>
            )}

            {(
              [
                { id: "overview", label: "overview", Icon: LayoutDashboard, count: undefined },
                { id: "work", label: "work", Icon: ListTodo, count: mentorMetrics?.needsResponse },
                { id: "projects", label: "projects", Icon: Users, count: mentorMetrics?.projects },
              ] as const
            ).map(({ id, label, Icon, count }) => {
              const isActive = activeMentorView === id || (id === "projects" && activeMentorView === "project");
              const text = t(`mentorWorkspace.${label}`);
              const buttonNode = (
                <button
                  type="button"
                  className="sidebar-nav-item"
                  data-active={isActive ? "true" : undefined}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={text}
                  onClick={() => onSelectMentorView?.(id)}
                >
                  <Icon size={17} aria-hidden="true" className="sidebar-nav-icon" />
                  {!collapsed && <span className="truncate">{text}</span>}
                  {!collapsed && typeof count === "number" && (id !== "work" || count > 0) ? (
                    <small className="sidebar-nav-badge" data-highlight={id === "work" && count > 0}>
                      {count}
                    </small>
                  ) : null}
                </button>
              );
              return wrapTooltip(buttonNode, text, count, id);
            })}

            {wrapTooltip(
              <Link
                to="/mentor-workspace?view=incoming"
                className="sidebar-nav-item"
                data-active={["incoming", "outgoing", "active", "history"].includes(activeMentorView) ? "true" : undefined}
                aria-current={["incoming", "outgoing", "active", "history"].includes(activeMentorView) ? "page" : undefined}
                aria-label={t("mentorWorkspace.invitations")}
              >
                <Inbox size={17} aria-hidden="true" className="sidebar-nav-icon" />
                {!collapsed && <span className="truncate">{t("mentorWorkspace.invitations")}</span>}
                {!collapsed && mentorMetrics && mentorMetrics.invitations > 0 ? (
                  <small className="sidebar-nav-badge" data-highlight="true">
                    {mentorMetrics.invitations}
                  </small>
                ) : null}
              </Link>,
              t("mentorWorkspace.invitations"),
              mentorMetrics?.invitations,
              "incoming",
            )}

            {wrapTooltip(
              <Link
                to="/mentor-workspace?view=discover"
                className="sidebar-nav-item"
                data-active={activeMentorView === "discover" ? "true" : undefined}
                aria-current={activeMentorView === "discover" ? "page" : undefined}
                aria-label={t("mentorWorkspace.discovery")}
              >
                <Compass size={17} aria-hidden="true" className="sidebar-nav-icon" />
                {!collapsed && <span className="truncate">{t("mentorWorkspace.discovery")}</span>}
              </Link>,
              t("mentorWorkspace.discovery"),
              undefined,
              "discover",
            )}

            {/* Group 2: Academic Review & Shared Resources */}
            {!collapsed && (
              <p className="sidebar-category-heading mt-3">{t("mentorWorkspace.navGroup.academic")}</p>
            )}

            {wrapTooltip(
              <Link
                to="/mentor-workspace?view=reviews"
                className="sidebar-nav-item"
                data-active={isAcademicReviewActive ? "true" : undefined}
                aria-current={isAcademicReviewActive ? "page" : undefined}
                aria-label={t("mentorWorkspace.reviewCenterTitle")}
              >
                <BookOpenCheck size={17} aria-hidden="true" className="sidebar-nav-icon" />
                {!collapsed && <span className="truncate">{t("mentorWorkspace.reviewCenterTitle")}</span>}
              </Link>,
              t("mentorWorkspace.reviewCenterTitle"),
              undefined,
              "reviews",
            )}

            {wrapTooltip(
              <Link
                to="/mentor-workspace?view=resources"
                className="sidebar-nav-item"
                data-active={activeMentorView === "resources" ? "true" : undefined}
                aria-current={activeMentorView === "resources" ? "page" : undefined}
                aria-label={t("mentorWorkspace.resources")}
              >
                <BookMarked size={17} aria-hidden="true" className="sidebar-nav-icon" />
                {!collapsed && <span className="truncate">{t("mentorWorkspace.resources")}</span>}
              </Link>,
              t("mentorWorkspace.resources"),
              undefined,
              "resources",
            )}

            {/* Group 3: Utilities */}
            {!collapsed && (
              <p className="sidebar-category-heading mt-3">{t("mentorWorkspace.navGroup.utilities")}</p>
            )}

            {wrapTooltip(
              <Link
                to="/mentor-workspace?view=notifications"
                className="sidebar-nav-item"
                data-active={activeMentorView === "notifications" ? "true" : undefined}
                aria-current={activeMentorView === "notifications" ? "page" : undefined}
                aria-label={t("mentorWorkspace.notifications")}
              >
                <Bell size={17} aria-hidden="true" className="sidebar-nav-icon" />
                {!collapsed && <span className="truncate">{t("mentorWorkspace.notifications")}</span>}
                {!collapsed && unreadNotificationCount > 0 ? (
                  <small className="sidebar-nav-badge" data-highlight="true">
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </small>
                ) : null}
              </Link>,
              t("mentorWorkspace.notifications"),
              unreadNotificationCount,
              "notifications",
            )}

            {/* Recent Guided Teams */}
            {!collapsed && recentProjects && recentProjects.length > 0 && (
              <section className="mentor-recent sidebar-recent-section">
                <h2>{t("mentorWorkspace.recent")}</h2>
                <div className="mentor-recent-list sidebar-recent-list">
                  {recentProjects.slice(0, 5).map(project => (
                    <Link
                      key={project.id}
                      to={mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}?tab=tasks`)}
                      aria-current={
                        activeMentorView === "project" && searchParams.get("projectId") === project.id
                          ? "page"
                          : undefined
                      }
                      title={project.title}
                      className="sidebar-recent-link"
                    >
                      <span className="mentor-recent-name sidebar-recent-title">{project.title}</span>
                      {project.pendingCount > 0 ? (
                        <span className="mentor-recent-badge sidebar-recent-badge">{project.pendingCount}</span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </nav>
        ) : (
          <nav className="sidebar-main-nav" aria-label={t("Research navigation") || "Điều hướng nghiên cứu"}>
            {children}

            {!collapsed && !currentProjectId && researchProjects && researchProjects.length > 0 && (
              <section className="sidebar-recent-section">
                <h3 className="sidebar-recent-heading">
                  <span>{t("Recent projects") || "Dự án gần đây"}</span>
                </h3>
                <div className="sidebar-recent-list">
                  {researchProjects
                    .filter(p => p.status !== "ARCHIVED")
                    .slice(0, 5)
                    .map(p => {
                      const isCurrent = currentProjectId === p._id;
                      return (
                        <Link
                          key={p._id}
                          to={`/projects/${p._id}`}
                          className="sidebar-recent-link"
                          data-active={isCurrent ? "true" : undefined}
                          title={p.title}
                        >
                          <span className="sidebar-recent-title">{p.title}</span>
                          {p.paperCount !== undefined && p.paperCount > 0 && (
                            <span className="sidebar-nav-badge">{p.paperCount}</span>
                          )}
                        </Link>
                      );
                    })}
                </div>
              </section>
            )}
          </nav>
        )}

        {/* Sidebar Footer User Info */}
        {activeWorkspace === "mentor" && (
          <div className="sidebar-user-box mt-auto">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-blue-300 font-bold text-xs ring-1 ring-blue-500/30 shrink-0">
              {user?.fullName?.charAt(0) || "M"}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{user?.fullName || "Mentor"}</p>
                <p className="truncate text-[11px] text-slate-400">{user?.email || ""}</p>
              </div>
            )}
            {!collapsed && (
              <Link
                to="/profile"
                aria-label={t("Profile") || "Hồ sơ"}
                title={t("Profile") || "Hồ sơ"}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        )}

        {/* Sidebar Collapse Toggle Footer */}
        {onToggleCollapse && (
          <div className="sidebar-footer">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="sidebar-collapse-button"
                  onClick={() => onToggleCollapse(!collapsed)}
                  aria-label={collapsed ? (t("Expand sidebar") || "Mở rộng thanh bên") : (t("Collapse sidebar") || "Thu gọn thanh bên")}
                >
                  {collapsed ? (
                    <ChevronsRight size={17} aria-hidden="true" className="mx-auto" />
                  ) : (
                    <>
                      <ChevronsLeft size={17} aria-hidden="true" />
                      <span>{t("Collapse sidebar") || "Thu gọn"}</span>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {collapsed ? (t("Expand sidebar") || "Mở rộng thanh bên") : (t("Collapse sidebar") || "Thu gọn thanh bên")}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
