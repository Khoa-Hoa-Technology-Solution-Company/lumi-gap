import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, BadgeCheck, FileText, RefreshCw,
  Activity, CheckCircle, MessageSquare, Cpu, ClipboardCheck, History,
  Server, Settings, ShieldAlert, ChevronRight, Menu, X, ExternalLink,
  LogOut, User, ArrowLeft, ShieldCheck
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

interface NavItem {
  to: string;
  end?: boolean;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeColor?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function AdminLayout() {
  const { t } = useI18n();
  const { data: authData } = useCurrentUser();
  const isAdmin = isAdminSystemRole(authData?.user?.systemRole);
  const { data: stats } = useAdminStats(isAdmin);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const pendingVerificationsCount = stats?.pendingVerifications ?? 0;
  const isSyncRunning = stats?.sync?.latestRun?.status === "running";

  const NAVIGATION: NavSection[] = [
    {
      title: "Overview",
      items: [
        { to: "/admin", end: true, label: "Overview", icon: LayoutDashboard },
      ],
    },
    {
      title: "User Management",
      items: [
        { to: "/admin/users", label: "Users", icon: Users },
        {
          to: "/admin/academic-verifications",
          label: "Affiliation Verification",
          icon: BadgeCheck,
          badge: pendingVerificationsCount > 0 ? pendingVerificationsCount : undefined,
          badgeColor: "bg-amber-500/20 text-amber-500 border border-amber-500/30",
        },
      ],
    },
    {
      title: "Research Data",
      items: [
        { to: "/admin/papers", label: "Papers in Corpus", icon: FileText },
        {
          to: "/admin/sync",
          label: "OpenAlex Sync",
          icon: RefreshCw,
          badge: isSyncRunning ? "Running" : undefined,
          badgeColor: "bg-blue-500/20 text-blue-500 border border-blue-500/30 animate-pulse",
        },
        { to: "/admin/pipeline", label: "Ingestion Pipeline", icon: Activity },
        { to: "/admin/corpus-validation", label: "Corpus Validation", icon: CheckCircle },
      ],
    },
    {
      title: "Community",
      items: [
        { to: "/admin/community", label: "Community & Moderation", icon: MessageSquare },
        { to: "/admin/trust-safety", label: "Trust & Safety", icon: ShieldCheck },
      ],
    },
    {
      title: "AI Operations",
      items: [
        { to: "/admin/ai-jobs", label: "AI Jobs & Analysis", icon: Cpu },
        { to: "/admin/evaluation", label: "Quality Evaluation", icon: ClipboardCheck },
      ],
    },
    {
      title: "System",
      items: [
        { to: "/admin/audit-logs", label: "Audit Logs", icon: History },
        { to: "/admin/workers", label: "Workers & Fleet", icon: Server },
        { to: "/admin/settings", label: "Platform Settings", icon: Settings },
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Admin Access Restricted</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your account does not have administrator privileges to access the LumiGAP Admin Control Panel.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              to="/home"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Determine active section for breadcrumb
  const currentPath = location.pathname;
  let currentTitle = "Overview";
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (item.end ? currentPath === item.to : currentPath.startsWith(item.to)) {
        currentTitle = item.label;
      }
    }
  }

  return (
    <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-slate-50/60 font-sans dark:bg-slate-950">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* TailAdmin-Inspired Sleek Fixed Sticky Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(18rem,calc(100vw-2rem))] shrink-0 select-none flex-col bg-[#1C2434] pb-[env(safe-area-inset-bottom)] text-slate-300 transition-transform duration-300 ease-in-out md:static md:h-full md:w-64 md:translate-x-0 md:z-20",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Brand Header with Unified LumiGap Admin Badge */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-700/60 px-3">
          <Link to="/home" className="flex items-center gap-1.5 flex-1 min-w-0 group" title="Home">
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

        {/* Nav Categories */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAVIGATION.map((section) => (
            <div key={section.title} className="space-y-1">
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t(section.title)}
              </p>
              <div className="mt-1.5 space-y-0.5">
                {section.items.map(({ to, end, label, icon: Icon, badge, badgeColor }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "group flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-150",
                        isActive
                          ? "bg-[#333A48] text-white shadow-sm ring-1 ring-white/10"
                          : "text-slate-300 hover:bg-[#333A48]/50 hover:text-white",
                      )
                    }
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="h-4 w-4 shrink-0 transition-colors group-hover:text-blue-400" />
                      <span className="truncate">{t(label)}</span>
                    </div>
                    {badge !== undefined && (
                      <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none", badgeColor || "bg-blue-600 text-white")}>
                        {badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer User Info - Pinned to bottom */}
        <div className="border-t border-slate-700/60 p-3 shrink-0 bg-[#1C2434]">
          <div className="mb-3 flex min-h-11 items-center justify-between rounded-lg border border-slate-700/70 bg-slate-800/60 px-2.5 min-[420px]:hidden md:hidden">
            <span className="text-xs font-semibold text-slate-300">{t("Language")}</span>
            <LanguageSwitcher />
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-800/60 p-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-xs ring-1 ring-blue-500/30 shrink-0">
              {authData?.user?.fullName?.charAt(0) || "A"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">{authData?.user?.fullName || "Administrator"}</p>
              <p className="truncate text-[10px] text-slate-400">{authData?.user?.email || "admin@lumigap.com"}</p>
            </div>
            <Link
              to="/home"
              title="Return to Main Application"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Standalone Admin Top Bar */}
          <header className="sticky top-0 z-30 flex h-16 min-w-0 shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/90 px-3 backdrop-blur-md sm:px-4 md:px-6 dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
                aria-label={t("Open navigation")}
                aria-expanded={mobileOpen}
              >
                <Menu className="h-5 w-5" />
              </button>
              {/* Breadcrumb */}
              <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <Link to="/admin" className="hidden hover:text-slate-900 sm:inline dark:hover:text-white">Admin</Link>
                <ChevronRight className="hidden h-3.5 w-3.5 sm:block" />
                <span className="truncate font-bold text-slate-900 dark:text-white">{t(currentTitle)}</span>
              </div>
            </div>

            {/* Top Bar Actions & Profile Controls */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
              {/* Health Indicator */}
              <div className="hidden lg:flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                System Healthy
              </div>

              {/* Theme & Language Controls */}
              <ThemeToggle />
              <div className="hidden min-[420px]:block"><LanguageSwitcher /></div>

              {/* Exit to Main App */}
              <Link
                to="/home"
                className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Main Site
              </Link>

              {/* Admin Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-blue-500 transition-all">
                    {authData?.user?.fullName?.charAt(0) || "A"}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-1.5">
                  <DropdownMenuLabel className="font-normal px-2 py-1.5">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{authData?.user?.fullName}</p>
                    <p className="text-[11px] text-slate-400">{authData?.user?.email}</p>
                    <span className="inline-block mt-1 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                      Administrator
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <User className="mr-2 h-4 w-4" />
                    Account Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/home")}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Public Platform
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => logout.mutate()}
                    className="text-rose-600 dark:text-rose-400 focus:bg-rose-50 dark:focus:bg-rose-950/30"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Main View Container */}
          <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 p-4 sm:p-6 md:p-8">
            <Outlet />
          </main>
        </div>
    </div>
  );
}
