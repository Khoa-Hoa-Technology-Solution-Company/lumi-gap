import { Suspense, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, User, Bell, Bookmark, Menu, X } from "lucide-react";

import logoImage from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requiresAcademicProfile, useCurrentUser, useLogout } from "@/features/auth";
import { useCreditBalance } from "@/features/credits";
import { useAuthStore } from "@/stores/auth-store";
import { useBookmarks } from "@/features/bookmarks";
import { useNotifications } from "@/features/notifications";
import { cn } from "@/utils/cn";
import { avatars, getLevel } from "@/utils/level";
import { formatNumber } from "@/utils";
import { LanguageSwitcher, useI18n } from "@/i18n";

const navItems = [
  { to: "/search", label: "Search" },
  { to: "/trends", label: "Trends" },
  { to: "/reports", label: "Reports" },
  { to: "/research-gaps", label: "Research Gaps" },
  { to: "/forum", label: "Forum" },
  { to: "/papers/review", label: "AI Review" },
  { to: "/papers/format-check", label: "Format Check" },
  { to: "/projects", label: "Projects" },
  { to: "/rankings", label: "Rankings" },
] as const;

function PageLoadingFallback() {
  return (
    <div className="min-h-[50vh] bg-slate-50 dark:bg-[#09090b]" role="status" aria-live="polite">
      <span className="sr-only">Loading page...</span>
    </div>
  );
}

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useI18n();

  const isAuthed = useAuthStore((s) => !!s.tokens?.accessToken);
  const user = useAuthStore((s) => s.user);
  const { data: bookmarks } = useBookmarks({ enabled: isAuthed });
  const { data: notifications } = useNotifications({ enabled: isAuthed });
  const { data: currentUserData } = useCurrentUser();
  const activeUser = currentUserData?.user ?? user;

  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0;

  const validBookmarksCount = bookmarks?.filter((b) => {
    if (b.targetKind === "paper") return !!b.paperDetail;
    if (b.targetKind === "report") return !!b.reportDetail;
    return false;
  }).length || 0;

  const filteredNavItems = navItems;

  if (isAuthed && requiresAcademicProfile(activeUser)) {
    return (
      <Navigate
        to="/onboarding/academic-profile"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-[#09090b]">
      <header className="border-b bg-white dark:bg-[#0f0f11] sticky top-0 z-50">
        <div className="container mx-auto flex h-20 min-w-0 items-center justify-between gap-1 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/" className="relative flex h-20 w-24 shrink-0 select-none items-center gap-2 overflow-visible text-2xl font-black tracking-tight sm:w-[150px]">
              <img
                src={logoImage}
                alt="PAPERLENS logo"
                className="absolute left-0 h-20 w-auto max-w-none object-contain"
              />
              <span className="text-slate-900 dark:text-white">

              </span>
            </Link>

            <nav
              aria-label={t("Primary navigation")}
              className="hidden min-[1440px]:flex items-center gap-0.5 whitespace-nowrap"
            >
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "shrink-0 whitespace-nowrap px-2.5 py-2 leading-none rounded-t-md rounded-b-none text-sm font-medium transition-colors border-b-2",
                      isActive
                        ? "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-600"
                        : "text-slate-600 dark:text-slate-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/10 hover:text-blue-600 dark:hover:text-blue-400 border-transparent"
                    )
                  }
                >
                  {t(item.label)}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-4">
            <ThemeToggle />
            <LanguageSwitcher />
            {isAuthed && (
              <Button variant="ghost" size="icon" className="relative hidden rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-950/20 dark:hover:text-blue-400 sm:inline-flex" asChild>
                <Link to="/bookmarks" aria-label={t("Bookmarks")}>
                  <Bookmark className="h-5 w-5" />
                  {validBookmarksCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 min-w-[18px] items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#0f0f11] px-1">
                      {validBookmarksCount}
                    </span>
                  )}
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="relative hidden rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-950/20 dark:hover:text-blue-400 sm:inline-flex" asChild>
              <Link to="/notifications" aria-label={t("Notifications")}>
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 min-w-[18px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#0f0f11] px-1">
                    {unreadCount}
                  </span>
                )}
              </Link>
            </Button>
            <UserMenu />

            <Button
              variant="ghost"
              size="icon"
              className="min-[1440px]:hidden shrink-0"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={t("Toggle Menu")}
              aria-expanded={isMobileMenuOpen}
              aria-controls="primary-navigation-menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div
            id="primary-navigation-menu"
            className="min-[1440px]:hidden border-t bg-white dark:bg-[#0f0f11] absolute top-20 left-0 right-0 z-40 shadow-lg animate-in slide-in-from-top-2 duration-200"
          >
            <nav
              aria-label={t("Primary navigation")}
              className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "whitespace-nowrap rounded-md px-4 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800"
                    )
                  }
                >
                  {t(item.label)}
                </NavLink>
              ))}
              {isAuthed && (
                <>
                  <Link
                    to="/bookmarks"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-between rounded-md px-4 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-zinc-800"
                  >
                    {t("Bookmarks")}
                    {validBookmarksCount > 0 && <span>{validBookmarksCount}</span>}
                  </Link>
                  <Link
                    to="/notifications"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-between rounded-md px-4 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-zinc-800"
                  >
                    {t("Notifications")}
                    {unreadCount > 0 && <span>{unreadCount}</span>}
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </header>
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <Suspense fallback={<PageLoadingFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t bg-white dark:bg-[#0f0f11] py-6 mt-auto">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 dark:text-slate-400">
          <p>&copy; {new Date().getFullYear()} {t("Liem Research Team. All rights reserved.")}</p>
          <div className="flex gap-4 mt-4 md:mt-0">
            <Link to="#" className="hover:text-slate-900 dark:hover:text-white">{t("Privacy Policy")}</Link>
            <Link to="#" className="hover:text-slate-900 dark:hover:text-white">{t("Terms of Service")}</Link>
            <Link to="#" className="hover:text-slate-900 dark:hover:text-white">{t("Contact Support")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const isAuthed = useAuthStore((s) => !!s.tokens?.accessToken);
  const { data } = useCurrentUser();
  const logout = useLogout();
  const { data: balanceData } = useCreditBalance({ enabled: isAuthed });

  if (!isAuthed) {
    return (
      <>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/login">{t("Sign in")}</Link>
        </Button>
        <Button size="sm" asChild>
          <Link to="/register">{t("Sign up")}</Link>
        </Button>
      </>
    );
  }

  const email = data?.user?.email ?? t("Account");
  const fullName = data?.user?.fullName || email;
  const role = data?.user?.role;
  const credits = balanceData?.credits ?? data?.user?.credits ?? 0;
  const points = data?.user?.points ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-10 pl-1 pr-1.5 sm:pl-1.5 sm:pr-3 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
          {role !== "admin" ? (
            (() => {
              const currentLevel = getLevel(points);
              const levelAvatar = avatars[currentLevel];
              return (
                <div className="w-9 h-9 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-0.5 overflow-hidden shrink-0 shadow-sm">
                  <img src={levelAvatar} alt={`Level ${currentLevel}`} className="w-full h-full object-contain rounded-full" />
                </div>
              );
            })()
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0 shadow-sm">
              <User className="h-4 w-4 text-slate-500" />
            </div>
          )}
          <span className="hidden sm:inline font-semibold text-xs text-slate-700 dark:text-slate-300">{fullName}</span>
          {role !== "admin" && (
            <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90">
              Lv {getLevel(points)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-[9999] bg-white dark:bg-zinc-950 shadow-xl border border-slate-200 dark:border-slate-800">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none text-slate-900 dark:text-white truncate">{fullName}</p>
            <p className="text-xs leading-none text-slate-500 truncate">{email}</p>
          </div>
        </DropdownMenuLabel>
        {role !== "admin" && (
          <>
            <DropdownMenuSeparator />
            <div className="px-3 py-2 text-xs font-semibold text-slate-500 space-y-1.5 bg-slate-50/50 dark:bg-zinc-900/30 rounded-md animate-fadeIn">
              <div className="flex justify-between items-center">
                <span>{t("Balance:")}</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">{formatNumber(credits)} {t("credits")}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>{t("Points:")}</span>
                <span className="text-amber-600 dark:text-amber-500 font-bold">{formatNumber(points)} {t("pts")}</span>
              </div>
            </div>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/profile")}>
          {t("Profile")}
        </DropdownMenuItem>
        {role === "admin" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/admin")}>
              {t("Admin")}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            logout.mutate(undefined, {
              onSettled: () => navigate("/login", { replace: true }),
            });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("Sign out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

