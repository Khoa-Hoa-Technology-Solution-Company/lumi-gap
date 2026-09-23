import { Suspense, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, User, Bell, Bookmark, ChevronDown, Menu, Trophy, X } from "lucide-react";

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

const directNavItems = [
  { to: "/search", label: "Search" },
  { to: "/forum", label: "Forum" },
] as const;

const navGroups = [
  {
    label: "Explore",
    items: [
      { to: "/trends", label: "Trends" },
      { to: "/research-gaps", label: "Research Gaps" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/reports", label: "Reports" },
      { to: "/projects", label: "Projects" },
    ],
  },
  {
    label: "Paper Tools",
    items: [
      { to: "/papers/review", label: "AI Review" },
      { to: "/papers/format-check", label: "Format Check" },
    ],
  },
] as const;

function pathMatches(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function DesktopNavDropdown({
  label,
  items,
  pathname,
}: {
  label: string;
  items: ReadonlyArray<{ to: string; label: string }>;
  pathname: string;
}) {
  const active = items.some((item) => pathMatches(pathname, item.to));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-10 shrink-0 gap-1 rounded-b-none rounded-t-md border-b-2 px-3 text-sm font-medium",
            active
              ? "border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400"
              : "border-transparent text-slate-600 hover:bg-blue-50/50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-950/10 dark:hover:text-blue-400",
          )}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {items.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "w-full px-3 py-2.5",
                  isActive && "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
                )
              }
            >
              {item.label}
            </NavLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
              className="hidden min-[1180px]:flex items-center gap-0.5 whitespace-nowrap"
            >
              <NavLink
                to="/search"
                className={({ isActive }) =>
                  cn(
                    "shrink-0 whitespace-nowrap rounded-b-none rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium leading-none transition-colors",
                    isActive
                      ? "border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400"
                      : "border-transparent text-slate-600 hover:bg-blue-50/50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-950/10 dark:hover:text-blue-400",
                  )
                }
              >
                {t("Search")}
              </NavLink>
              <DesktopNavDropdown
                label={t("Explore")}
                pathname={location.pathname}
                items={navGroups[0].items.map((item) => ({ ...item, label: t(item.label) }))}
              />
              <DesktopNavDropdown
                label={t("Workspace")}
                pathname={location.pathname}
                items={navGroups[1].items.map((item) => ({ ...item, label: t(item.label) }))}
              />
              <NavLink
                to="/forum"
                className={({ isActive }) =>
                  cn(
                    "shrink-0 whitespace-nowrap rounded-b-none rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium leading-none transition-colors",
                    isActive
                      ? "border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400"
                      : "border-transparent text-slate-600 hover:bg-blue-50/50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-950/10 dark:hover:text-blue-400",
                  )
                }
              >
                {t("Forum")}
              </NavLink>
              <DesktopNavDropdown
                label={t("Paper Tools")}
                pathname={location.pathname}
                items={navGroups[2].items.map((item) => ({ ...item, label: t(item.label) }))}
              />
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
            {isAuthed && (
              <Button variant="ghost" size="icon" className="relative rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-950/20 dark:hover:text-blue-400" asChild>
                <Link to="/notifications" aria-label={t("Notifications")}>
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#0f0f11]">
                      {unreadCount}
                    </span>
                  )}
                </Link>
              </Button>
            )}
            <UserMenu bookmarkCount={validBookmarksCount} />

            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 min-[1180px]:hidden"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
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
            className="absolute left-0 right-0 top-20 z-40 border-t bg-white shadow-lg min-[1180px]:hidden dark:bg-[#0f0f11]"
          >
            <nav aria-label={t("Primary navigation")} className="mx-auto grid max-w-5xl gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t("Primary navigation")}</p>
                {directNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "block rounded-md px-3 py-2.5 text-sm font-medium",
                        isActive
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                          : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-zinc-800",
                      )
                    }
                  >
                    {t(item.label)}
                  </NavLink>
                ))}
              </div>
              {navGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t(group.label)}</p>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "block rounded-md px-3 py-2.5 text-sm font-medium",
                          isActive
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-zinc-800",
                        )
                      }
                    >
                      {t(item.label)}
                    </NavLink>
                  ))}
                </div>
              ))}
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

function UserMenu({ bookmarkCount }: { bookmarkCount: number }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const isAuthed = useAuthStore((s) => !!s.tokens?.accessToken);
  const { data } = useCurrentUser();
  const logout = useLogout();
  const { data: balanceData } = useCreditBalance({ enabled: isAuthed });

  if (!isAuthed) {
    return (
      <>
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
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
  const currentLevel = getLevel(points);
  const levelAvatar = avatars[currentLevel];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label={t("Account")}
        >
          {role !== "admin" ? (
            <div className="w-9 h-9 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-0.5 overflow-hidden shrink-0 shadow-sm">
              <img src={levelAvatar} alt={`Level ${currentLevel}`} className="w-full h-full object-contain rounded-full" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0 shadow-sm">
              <User className="h-4 w-4 text-slate-500" />
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 z-[9999] bg-white dark:bg-zinc-950 shadow-xl border border-slate-200 dark:border-slate-800">
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
                <span>{t("Level")}</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{currentLevel}</span>
              </div>
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
          <User className="mr-2 h-4 w-4" />
          {t("Profile")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/bookmarks")}>
          <Bookmark className="mr-2 h-4 w-4" />
          <span className="flex-1">{t("Bookmarks")}</span>
          {bookmarkCount > 0 && (
            <span className="ml-3 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-zinc-800 dark:text-slate-300">
              {bookmarkCount}
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/rankings")}>
          <Trophy className="mr-2 h-4 w-4" />
          {t("Rankings")}
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

