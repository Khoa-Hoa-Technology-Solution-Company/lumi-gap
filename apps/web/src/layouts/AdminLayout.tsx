import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, Link, useNavigate } from "react-router-dom";
import { RouteAwarePageSkeleton } from "@/components/loading";
import {
  LayoutDashboard,
  Users,
  BadgeCheck,
  FileText,
  RefreshCw,
  Activity,
  CheckCircle,
  MessageSquare,
  Cpu,
  ClipboardCheck,
  History,
  Server,
  Settings,
  KeyRound,
  ShieldAlert,
  ChevronRight,
  Menu,
  X,
  ExternalLink,
  LogOut,
  User,
  ArrowLeft,
  ShieldCheck,
  Network,
  Tags,
  Tag,
  GraduationCap,
  FolderOpen,
} from "lucide-react";
import logoImage from "@/assets/logo.png";
import { useCurrentUser, useLogout } from "@/features/auth";
import { useAdminStats } from "@/features/admin";
import { cn } from "@/utils/cn";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher, useI18n } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAdminSystemRole } from "@trend/shared-types";
import { isLecturerWorkspaceEligible } from "@/features/auth/utils/lecturer-eligibility";

interface NavItem {
  to: string;
  end?: boolean;
  labelVi: string;
  labelEn: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeColor?: string;
}

interface NavSection {
  titleVi: string;
  titleEn: string;
  items: NavItem[];
}

export function AdminLayout() {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const { data: authData } = useCurrentUser();
  const isAdmin = isAdminSystemRole(authData?.user?.systemRole);
  const { data: stats, isLoading: statsLoading, isError: statsError } = useAdminStats(isAdmin, 60_000);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const pendingVerificationsCount = stats?.attention?.pendingVerifications ?? stats?.pendingVerifications ?? 0;
  const openReportsCount = stats?.attention?.openModerationReports ?? 0;
  const unhealthyWorkersCount = stats?.attention?.unhealthyWorkers ?? 0;
  const isSyncRunning = stats?.sync?.latestRun?.status === "running";

  const NAVIGATION: NavSection[] = [
    {
      titleVi: "Tổng quan",
      titleEn: "Overview",
      items: [
        { to: "/admin", end: true, labelVi: "Tổng quan", labelEn: "Overview", icon: LayoutDashboard },
      ],
    },
    {
      titleVi: "Người dùng & Tin cậy học thuật",
      titleEn: "Users & Academic Trust",
      items: [
        { to: "/admin/users", labelVi: "Người dùng", labelEn: "Users", icon: Users },
        {
          to: "/admin/academic-verifications",
          labelVi: "Xác minh học thuật",
          labelEn: "Academic Verification",
          icon: BadgeCheck,
          badge: pendingVerificationsCount > 0 ? pendingVerificationsCount : undefined,
          badgeColor: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
        },
      ],
    },
    {
      titleVi: "Dữ liệu nghiên cứu",
      titleEn: "Research Data",
      items: [
        { to: "/admin/papers", labelVi: "Bài báo trong Corpus", labelEn: "Papers in Corpus", icon: FileText },
        {
          to: "/admin/sync",
          labelVi: "Đồng bộ OpenAlex",
          labelEn: "OpenAlex Sync",
          icon: RefreshCw,
          badge: isSyncRunning ? (isVi ? "Đang chạy" : "Running") : undefined,
          badgeColor: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
        },
        { to: "/admin/pipeline", labelVi: "Ingestion Pipeline", labelEn: "Ingestion Pipeline", icon: Activity },
        { to: "/admin/corpus-validation", labelVi: "Kiểm định Corpus", labelEn: "Corpus Validation", icon: CheckCircle },
      ],
    },
    {
      titleVi: "Danh mục nghiên cứu",
      titleEn: "Research Catalog",
      items: [
        { to: "/admin/taxonomy", labelVi: "Phân loại", labelEn: "Taxonomy", icon: Network },
        { to: "/admin/keywords", labelVi: "Từ khóa", labelEn: "Keywords", icon: Tags },
        { to: "/admin/tags", labelVi: "Thẻ chủ đề", labelEn: "Tags", icon: Tag },
      ],
    },
    {
      titleVi: "Cộng đồng & An toàn",
      titleEn: "Community & Safety",
      items: [
        { to: "/admin/community", labelVi: "Cộng đồng & Diễn đàn", labelEn: "Communities & Forum", icon: MessageSquare },
        {
          to: "/admin/trust-safety",
          labelVi: "Tin cậy & An toàn",
          labelEn: "Trust & Safety",
          icon: ShieldCheck,
          badge: openReportsCount > 0 ? openReportsCount : undefined,
          badgeColor: "bg-rose-500/20 text-rose-300 border border-rose-500/30",
        },
      ],
    },
    {
      titleVi: "Vận hành AI",
      titleEn: "AI Operations",
      items: [
        { to: "/admin/ai-jobs", labelVi: "AI Jobs & Analysis", labelEn: "AI Jobs & Analysis", icon: Cpu },
        { to: "/admin/evaluation", labelVi: "Quality Evaluation", labelEn: "Quality Evaluation", icon: ClipboardCheck },
      ],
    },
    {
      titleVi: "Hệ thống",
      titleEn: "System",
      items: [
        { to: "/admin/audit-logs", labelVi: "Nhật ký kiểm toán", labelEn: "Audit Logs", icon: History },
        {
          to: "/admin/workers",
          labelVi: "Workers & Fleet",
          labelEn: "Workers & Fleet",
          icon: Server,
          badge: unhealthyWorkersCount > 0 ? unhealthyWorkersCount : undefined,
          badgeColor: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
        },
        { to: "/admin/api-keys", labelVi: "API Keys", labelEn: "API Keys", icon: KeyRound },
        { to: "/admin/settings", labelVi: "Cài đặt nền tảng", labelEn: "Platform Settings", icon: Settings },
      ],
    },
  ];

  if (authData?.user && authData.user.role !== "admin" && !isAdminSystemRole(authData.user.systemRole)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 ring-8 ring-rose-500/5">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {isVi ? "Quyền quản trị bị hạn chế" : "Admin Access Restricted"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isVi
              ? "Tài khoản của bạn không có quyền quản trị hệ thống để truy cập khu vực này."
              : "Your account does not have administrator privileges to access the LumiGap Admin Control Panel."}
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              to="/home"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              {isVi ? "Quay lại Trang chủ" : "Back to Home"}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Breadcrumb calculation supporting nested detail routes (/admin/tags/:id, /admin/papers/new)
  const currentPath = location.pathname;
  const breadcrumbs: Array<{ label: string; to?: string }> = [];
  let matchedItem: NavItem | undefined;
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (item.end ? currentPath === item.to : currentPath === item.to || currentPath.startsWith(`${item.to}/`)) {
        matchedItem = item;
      }
    }
  }
  if (matchedItem) {
    const label = isVi ? matchedItem.labelVi : matchedItem.labelEn;
    if (currentPath !== matchedItem.to && !matchedItem.end) {
      breadcrumbs.push({ label, to: matchedItem.to });
      if (currentPath.startsWith("/admin/tags/")) {
        breadcrumbs.push({ label: isVi ? "Chi tiết thẻ" : "Tag detail" });
      } else if (currentPath === "/admin/papers/new") {
        breadcrumbs.push({ label: isVi ? "Thêm bài báo" : "Add paper" });
      } else {
        breadcrumbs.push({ label: isVi ? "Chi tiết" : "Detail" });
      }
    } else {
      breadcrumbs.push({ label });
    }
  } else {
    breadcrumbs.push({ label: isVi ? "Tổng quan" : "Overview" });
  }

  // Truthful operational health badge from real backend probes (never hardcoded healthy)
  const overallHealth = stats?.systemHealth?.overall;
  const checkedAtLabel = stats?.systemHealth?.checkedAt
    ? new Date(stats.systemHealth.checkedAt).toLocaleTimeString(isVi ? "vi-VN" : "en-US", { hour12: false })
    : null;

  const healthUi = statsError
    ? {
      tone: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      dot: "bg-rose-500",
      label: isVi ? "Không kiểm tra được hệ thống" : "Health Unavailable",
      title: isVi ? "Không tải được trạng thái kiểm tra phụ thuộc từ máy chủ." : "Could not load live health telemetry.",
    }
    : statsLoading || !overallHealth
      ? {
        tone: "border-border bg-muted/60 text-muted-foreground",
        dot: "bg-slate-400",
        label: isVi ? "Đang kiểm tra…" : "Checking health…",
        title: isVi ? "Đang đọc trạng thái thực tế của PostgreSQL, Redis và Workers." : "Checking PostgreSQL, Redis, and worker heartbeats.",
      }
      : overallHealth === "healthy"
        ? {
          tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          dot: "bg-emerald-500",
          label: isVi ? "Hệ thống ổn định" : "System Healthy",
          title: `${isVi ? "Kiểm tra lúc" : "Checked at"} ${checkedAtLabel ?? "—"}`,
        }
        : overallHealth === "degraded"
          ? {
            tone: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
            dot: "bg-amber-500",
            label: isVi ? "Hệ thống suy giảm" : "System Degraded",
            title: `${isVi ? "Một số worker hoặc dịch vụ cần kiểm tra · Kiểm tra lúc" : "Some dependencies or workers need attention · Checked at"} ${checkedAtLabel ?? "—"}`,
          }
          : {
            tone: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
            dot: "bg-rose-500",
            label: isVi ? "Phụ thuộc ngừng kết nối" : "System Unavailable",
            title: `${isVi ? "Phụ thuộc cốt lõi không khả dụng · Kiểm tra lúc" : "Core dependency unavailable · Checked at"} ${checkedAtLabel ?? "—"}`,
          };

  const userDisplayName = authData?.user?.fullName?.trim() || (isVi ? "Quản trị viên" : "Administrator");
  const userEmail = authData?.user?.email?.trim() || "";
  const userInitial = userDisplayName.charAt(0).toUpperCase() || "A";

  return (
    <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-slate-50/60 font-sans dark:bg-slate-950" data-no-i18n>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Fixed Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(18rem,calc(100vw-2rem))] shrink-0 select-none flex-col bg-[#1C2434] pb-[env(safe-area-inset-bottom)] text-slate-300 transition-transform duration-300 ease-in-out md:static md:h-full md:w-64 md:translate-x-0 md:z-20",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-700/60 px-3">
          <Link
            to="/home"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-1.5 flex-1 min-w-0 group"
            title={isVi ? "Về trang chủ LumiGap" : "Back to LumiGap Home"}
            aria-label={isVi ? "LumiGap Admin — Về trang chủ" : "LumiGap Admin — Back to Home"}
          >
            <div className="flex items-center justify-between w-full rounded-xl bg-white px-2.5 py-1.5 shadow-sm transition-all group-hover:bg-slate-50">
              <img
                src={logoImage}
                alt="LumiGap Admin"
                className="h-7 w-auto max-w-[130px] object-contain"
              />
              <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs shrink-0">
                Admin
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
            aria-label={t("Close navigation")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Admin Navigation Categories */}
        <nav
          aria-label={isVi ? "Điều hướng quản trị" : "Admin navigation"}
          className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
        >
          {NAVIGATION.map((section) => (
            <div key={section.titleEn} className="space-y-1">
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {isVi ? section.titleVi : section.titleEn}
              </p>
              <div className="mt-1 space-y-0.5">
                {section.items.map(({ to, end, labelVi, labelEn, icon: Icon, badge, badgeColor }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "group flex min-h-9 items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                        isActive
                          ? "bg-[#333A48] text-white shadow-sm ring-1 ring-white/10"
                          : "text-slate-300 hover:bg-[#333A48]/50 hover:text-white",
                      )
                    }
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="h-4 w-4 shrink-0 transition-colors group-hover:text-blue-400" aria-hidden="true" />
                      <span className="truncate">{isVi ? labelVi : labelEn}</span>
                    </div>
                    {badge !== undefined && (
                      <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none tabular-nums", badgeColor || "bg-blue-600 text-white")}>
                        {badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          {/* Clearly Separated User-Facing Workspace Links (Not Admin Modules) */}
          <div className="border-t border-slate-700/60 pt-4 space-y-1">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {isVi ? "Không gian người dùng (ngoài quản trị)" : "User Workspaces (Non-Admin)"}
            </p>
            <div className="mt-1 space-y-0.5">
              <Link
                to="/projects"
                className="flex min-h-9 items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-[#333A48]/40 hover:text-white"
              >
                <span className="flex items-center gap-2.5 truncate">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{isVi ? "Dự án cá nhân" : "My Research Projects"}</span>
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
              </Link>
              {isLecturerWorkspaceEligible(authData?.user) ? (
                <Link
                  to="/mentor-workspace"
                  className="flex min-h-9 items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-[#333A48]/40 hover:text-white"
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{isVi ? "Không gian giảng viên" : "Lecturer Workspace"}</span>
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </div>
        </nav>

        {/* Sidebar Footer User Identity */}
        <div className="border-t border-slate-700/60 p-3 shrink-0 bg-[#1C2434] space-y-2">
          <div className="mb-1 flex min-h-11 items-center justify-between rounded-lg border border-slate-700/70 bg-slate-800/60 px-2.5 min-[420px]:hidden md:hidden">
            <span className="text-xs font-semibold text-slate-300">{isVi ? "Ngôn ngữ" : "Language"}</span>
            <LanguageSwitcher />
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-800/60 p-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-blue-300 font-bold text-xs ring-1 ring-blue-500/30 shrink-0">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">{userDisplayName}</p>
              {userEmail ? <p className="truncate text-[10px] text-slate-400">{userEmail}</p> : null}
            </div>
            <Link
              to="/home"
              title={isVi ? "Về nền tảng chính" : "Return to Main Platform"}
              aria-label={isVi ? "Về nền tảng chính" : "Return to Main Platform"}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex w-full min-h-9 items-center justify-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/20 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{logout.isPending ? (isVi ? "Đang đăng xuất…" : "Logging out…") : (isVi ? "Đăng xuất" : "Log Out")}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-14 min-w-0 shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur-md sm:px-4 md:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
              aria-label={t("Open navigation")}
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Link to="/admin" className="hidden hover:text-slate-900 sm:inline dark:hover:text-white">
                Admin
              </Link>
              {breadcrumbs.map((crumb, idx) => (
                <span key={`${crumb.label}-${idx}`} className="flex min-w-0 items-center gap-1.5">
                  <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden="true" />
                  {crumb.to ? (
                    <Link to={crumb.to} className="truncate hover:text-slate-900 dark:hover:text-white">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate font-bold text-slate-900 dark:text-white">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              to="/admin/workers"
              title={healthUi.title}
              className={cn(
                "hidden lg:inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold transition-opacity hover:opacity-90",
                healthUi.tone,
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", healthUi.dot)} aria-hidden="true" />
              <span>{healthUi.label}</span>
            </Link>

            <ThemeToggle />
            <div className="hidden min-[420px]:block"><LanguageSwitcher /></div>

            <Link
              to="/home"
              className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isVi ? "Trang chính" : "Main Site"}</span>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={isVi ? "Tài khoản quản trị" : "Admin account menu"}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-blue-500 transition-all"
                >
                  {userInitial}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuLabel className="font-normal px-2 py-1.5">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{userDisplayName}</p>
                  {userEmail ? <p className="text-[11px] text-slate-400">{userEmail}</p> : null}
                  <span className="inline-block mt-1 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                    {isVi ? "Quản trị viên" : "Administrator"}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <User className="mr-2 h-4 w-4" />
                  {isVi ? "Cài đặt tài khoản" : "Account Settings"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/home")}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {isVi ? "Mở nền tảng chính" : "Open Public Platform"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logout.mutate()}
                  className="text-rose-600 dark:text-rose-400 focus:bg-rose-50 dark:focus:bg-rose-950/30"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {isVi ? "Đăng xuất" : "Log Out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 p-4 sm:p-6">
          <Suspense fallback={<RouteAwarePageSkeleton variant="table" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
