import { useCallback, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bell,
  BookOpenCheck,
  Shapes,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  FolderOpen,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  ListTodo,
  SlidersHorizontal,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  activeMentorView?: "overview" | "work" | "projects" | "incoming" | "outgoing" | "active" | "history" | "discover" | "notifications" | "project" | "reviews" | "templates" | "template-builder" | "review" | "review-request" | "review-entry";
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
  canAccessMentor,
  collapsed = false,
  onToggleCollapse,
  activeMentorView = "overview",
  onSelectMentorView,
  mentorMetrics,
  recentProjects,
  currentProjectId,
  researchProjects,
  children,
}: AppSingleSidebarProps) {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const user = useAuthStore(s => s.user);

  const userIsLecturer = user?.academicRole === "LECTURER";
  const isAdmin = user?.systemRole === "ADMIN";
  const isMentorWorkspace = activeWorkspace === "mentor";
  const canAccess =
    canAccessMentor !== undefined
      ? canAccessMentor
      : Boolean(userIsLecturer || isAdmin || isMentorWorkspace);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn("app-single-sidebar", activeWorkspace === "mentor" && "admin-style")}
        data-collapsed={collapsed ? "true" : "false"}
        data-no-i18n
        aria-label={t("Sidebar navigation") || "Thanh điều hướng"}
      >
        {/* Brand Header for Mentor Workspace (Admin-inspired) */}
        {activeWorkspace === "mentor" && !collapsed && (
          <div className="sidebar-brand-badge">
            <Link to="/home" className="flex items-center gap-2 group min-w-0" title="LumiGap">
              <img src={logoImage} alt="LumiGap" className="sidebar-brand-logo" />
              <span className="rounded-md bg-indigo-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
                Mentor
              </span>
            </Link>
          </div>
        )}

        {/* Workspace switcher is only shown in the mentor workspace. */}
        {activeWorkspace === "mentor" && (
          <div className="sidebar-workspace-switcher">
            {canAccess ? (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="workspace-switcher-trigger"
                        aria-label={
                          activeWorkspace === "mentor"
                            ? `${t("mentorWorkspace.title")} (${t("Switch workspace")})`
                            : `${t("Research workspace")} (${t("Switch workspace")})`
                        }
                      >
                        <div
                          className={cn(
                            "workspace-switcher-icon-box",
                            activeWorkspace === "mentor"
                              ? "workspace-switcher-icon-mentor"
                              : "workspace-switcher-icon-research"
                          )}
                        >
                          {activeWorkspace === "mentor" ? (
                            <GraduationCap className="h-5 w-5" aria-hidden="true" />
                          ) : (
                            <FolderOpen className="h-5 w-5" aria-hidden="true" />
                          )}
                        </div>
                        {!collapsed && (
                          <div className="workspace-switcher-text">
                            <span className="workspace-switcher-name">
                              {activeWorkspace === "mentor"
                                ? t("mentorWorkspace.title")
                                : (t("Research workspace") || "Không gian nghiên cứu")}
                            </span>
                            <span className="workspace-switcher-sub">
                              {t("Switch workspace") || "Chuyển không gian"}
                            </span>
                          </div>
                        )}
                        {!collapsed && (
                          <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right">
                      {activeWorkspace === "mentor" ? t("mentorWorkspace.title") : (t("Research workspace") || "Không gian nghiên cứu")}
                    </TooltipContent>
                  )}
                </Tooltip>

                <DropdownMenuContent align="start" className="w-64 p-1.5 shadow-xl">
                  <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                    {t("Workspaces") || "Không gian làm việc"}
                  </DropdownMenuLabel>

                  <DropdownMenuItem asChild>
                    <Link
                      to="/projects"
                      className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer"
                    >
                      <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{t("Research workspace") || "Không gian nghiên cứu"}</div>
                        <div className="text-xs text-muted-foreground truncate">Quản lý đề tài & tài liệu</div>
                      </div>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link
                      to="/mentor-workspace?view=projects"
                      className={cn(
                        "flex items-center gap-2.5 p-2 rounded-lg cursor-pointer",
                        activeWorkspace === "mentor" &&
                          "bg-indigo-50 dark:bg-indigo-950/40 font-semibold text-indigo-700 dark:text-indigo-300"
                      )}
                    >
                      <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold flex items-center gap-1.5">
                          <span>{t("mentorWorkspace.title")}</span>
                          {mentorMetrics && mentorMetrics.needsResponse > 0 && (
                            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">Hướng dẫn nhóm & phản hồi</div>
                      </div>
                      {activeWorkspace === "mentor" && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        )}

        {/* Workspace Navigation Body */}
        {activeWorkspace === "mentor" ? (
          <nav className="sidebar-main-nav" aria-label={t("mentorWorkspace.navigation")}>
            {(
              [
                { id: "overview", label: "overview", Icon: LayoutDashboard, count: undefined },
                { id: "work", label: "work", Icon: ListTodo, count: mentorMetrics?.needsResponse },
                { id: "projects", label: "projects", Icon: FolderOpen, count: mentorMetrics?.projects },
              ] as const
            ).map(({ id, label, Icon, count }) => {
              const isActive = activeMentorView === id;
              const buttonNode = (
                <button
                  key={id}
                  type="button"
                  className="sidebar-nav-item"
                  data-active={isActive ? "true" : undefined}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={t(`mentorWorkspace.${label}`)}
                  onClick={() => onSelectMentorView?.(id)}
                >
                  <Icon size={17} aria-hidden="true" className="sidebar-nav-icon" />
                  {!collapsed && <span>{t(`mentorWorkspace.${label}`)}</span>}
                  {!collapsed && typeof count === "number" ? (
                    <small className="sidebar-nav-badge" data-highlight={id === "work" && count > 0}>
                      {count}
                    </small>
                  ) : null}
                </button>
              );

              return collapsed ? (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>{buttonNode}</TooltipTrigger>
                  <TooltipContent side="right">
                    {t(`mentorWorkspace.${label}`)} {typeof count === "number" ? `(${count})` : ""}
                  </TooltipContent>
                </Tooltip>
              ) : (
                buttonNode
              );
            })}

            {/* Invitations Link */}
            {(() => {
              const linkNode = (
                <Link
                  to="/mentor-workspace?view=incoming"
                  className="sidebar-nav-item"
                  aria-current={["incoming", "outgoing", "active", "history"].includes(activeMentorView) ? "page" : undefined}
                  aria-label={t("mentorWorkspace.invitations")}
                >
                  <Inbox size={17} aria-hidden="true" className="sidebar-nav-icon" />
                  {!collapsed && <span>{t("mentorWorkspace.invitations")}</span>}
                  {!collapsed && mentorMetrics && mentorMetrics.invitations > 0 ? (
                    <small className="sidebar-nav-badge" data-highlight="true">
                      {mentorMetrics.invitations}
                    </small>
                  ) : null}
                </Link>
              );
              return collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{linkNode}</TooltipTrigger>
                  <TooltipContent side="right">
                    {t("mentorWorkspace.invitations")}{" "}
                    {mentorMetrics && mentorMetrics.invitations > 0 ? `(${mentorMetrics.invitations})` : ""}
                  </TooltipContent>
                </Tooltip>
              ) : (
                linkNode
              );
            })()}

            {/* Notifications Link */}
            {(() => {
              const linkNode = (
                <Link to="/mentor-workspace?view=notifications" aria-current={activeMentorView === "notifications" ? "page" : undefined} className="sidebar-nav-item" aria-label={t("mentorWorkspace.notifications")}>
                  <Bell size={17} aria-hidden="true" className="sidebar-nav-icon" />
                  {!collapsed && <span>{t("mentorWorkspace.notifications")}</span>}
                </Link>
              );
              return collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{linkNode}</TooltipTrigger>
                  <TooltipContent side="right">{t("mentorWorkspace.notifications")}</TooltipContent>
                </Tooltip>
              ) : (
                linkNode
              );
            })()}

            {([
              { view: "reviews", label: "Review Center", Icon: BookOpenCheck, active: ["reviews", "review", "review-request", "review-entry"].includes(activeMentorView) },
              { view: "templates", label: "Review Templates", Icon: Shapes, active: ["templates", "template-builder"].includes(activeMentorView) },
            ] as const).map(({ view, label, Icon, active }) => {
              const link = <Link to={`/mentor-workspace?view=${view}`} aria-label={t(label)} aria-current={active ? "page" : undefined} className="sidebar-nav-item"><Icon size={17} aria-hidden="true" className="sidebar-nav-icon" />{!collapsed && <span>{t(label)}</span>}</Link>;
              return collapsed ? <Tooltip key={view}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{t(label)}</TooltipContent></Tooltip> : <div key={view}>{link}</div>;
            })}

            {/* Recent Mentored Projects */}
            {!collapsed && recentProjects && recentProjects.length > 0 && (
              <section className="mentor-recent sidebar-recent-section">
                <h2>{t("mentorWorkspace.recent")}</h2>
                <div className="mentor-recent-list sidebar-recent-list">
                  {recentProjects.slice(0, 5).map(project => (
                    <Link
                      key={project.id}
                      to={mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}?tab=tasks`)}
                      aria-current={activeMentorView === "project" && searchParams.get("projectId") === project.id ? "page" : undefined}
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

            {/* Discovery Settings Link */}
            {!collapsed && (
              <Link className="mentor-settings-link mt-4" aria-current={activeMentorView === "discover" ? "page" : undefined} to="/mentor-workspace?view=discover">
                <SlidersHorizontal size={14} aria-hidden="true" />
                <span>{t("mentorWorkspace.discovery")}</span>
              </Link>
            )}
          </nav>
        ) : (
          <nav className="sidebar-main-nav" aria-label={t("Research navigation") || "Điều hướng nghiên cứu"}>
            {/* Slotted content (e.g. Project Picker / coord-project-picker) */}
            {children}

            {/* Recent Research Projects (only shown when not collapsed and not inside a specific project) */}
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

        {/* Sidebar Footer User Info (Admin-inspired) */}
        {activeWorkspace === "mentor" && (
          <div className="sidebar-user-box mt-auto">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-xs ring-1 ring-indigo-500/30 shrink-0">
              {user?.fullName?.charAt(0) || "M"}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white">{user?.fullName || "Mentor"}</p>
                <p className="truncate text-[10px] text-slate-400">{user?.email || ""}</p>
              </div>
            )}
            {!collapsed && (
              <Link
                to="/projects"
                title={t("Research workspace") || "Không gian nghiên cứu"}
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
