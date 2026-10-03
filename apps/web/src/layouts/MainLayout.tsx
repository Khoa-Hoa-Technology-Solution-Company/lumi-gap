import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, User, Bookmark, ChevronDown, KeyRound, Menu, Trophy, X } from "lucide-react";

import logoImage from "@/assets/logo.png";
import logoDarkImage from "@/assets/logo-dark.png";
import { Button } from "@/components/ui/button";
import { RouteTransition } from "@/components/route-transition";
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
import { isAdminSystemRole } from "@trend/shared-types";

const NotificationMenu = lazy(() => import("@/features/notifications/components/notification-menu"));

const navGroups = [
  {
    label: "Explore",
    items: [
      { to: "/trends", label: "Trends" },
      { to: "/research-gaps", label: "Research Gaps" },
      { to: "/research-gap/discover", label: "Gap Discovery" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/reports", label: "Reports" },
      { to: "/projects", label: "Projects" },
      { to: "/submissions", label: "Submissions" },
      { to: "/reviews", label: "Review Center" },
      { to: "/review-templates", label: "Review Templates" },
      { to: "/review-opportunities", label: "Review Opportunities" },
    ],
  },
  {
    label: "Community",
    items: [
      { to: "/forum", label: "Forum" },
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
  open,
  onOpen,
  onClose,
  onDismiss,
}: {
  label: string;
  items: ReadonlyArray<{ to: string; label: string }>;
  pathname: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const active = items.some((item) => pathMatches(pathname, item.to));

  return (
    <div
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onOpen();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onClose();
      }}
    >
      <DropdownMenu
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => (nextOpen ? onOpen() : onDismiss())}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-10 shrink-0 gap-1.5 rounded-b-none rounded-t-md border-b-2 px-3 text-sm font-medium transition-colors [&[data-state=open]>svg]:rotate-180",
              active
                ? "border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400"
                : "border-transparent text-slate-600 hover:bg-blue-50/50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-950/10 dark:hover:text-blue-400",
            )}
          >
            {label}
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") onOpen();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") onClose();
          }}
          className="w-56 rounded-xl border-slate-200/90 p-1.5 shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:shadow-black/30"
        >
          {items.map((item) => (
            <DropdownMenuItem key={item.to} asChild>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "w-full rounded-lg px-3 py-2.5",
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
    </div>
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
  const location = useLocation();
  const isHomeSurface = location.pathname === "/home" || location.pathname === "/" || location.pathname === "/literature";
  const isForumSurface = location.pathname === "/forum" || location.pathname.startsWith("/forum/") || /^\/(?:u|academics)\/[^/]+\/(?:activity|summary)\/?$/.test(location.pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(null);
  const desktopMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useI18n();

  const cancelDesktopMenuClose = useCallback(() => {
    if (desktopMenuCloseTimer.current) {
      clearTimeout(desktopMenuCloseTimer.current);
      desktopMenuCloseTimer.current = null;
    }
  }, []);

  const openDesktopMenu = useCallback((label: string) => {
    cancelDesktopMenuClose();
    setActiveDesktopMenu(label);
  }, [cancelDesktopMenuClose]);

  const scheduleDesktopMenuClose = useCallback(() => {
    cancelDesktopMenuClose();
    desktopMenuCloseTimer.current = setTimeout(() => setActiveDesktopMenu(null), 140);
  }, [cancelDesktopMenuClose]);

  const dismissDesktopMenu = useCallback(() => {
    cancelDesktopMenuClose();
    setActiveDesktopMenu(null);
  }, [cancelDesktopMenuClose]);

  useEffect(() => cancelDesktopMenuClose, [cancelDesktopMenuClose]);
  useEffect(() => {
    setIsMobileMenuOpen(false);
    dismissDesktopMenu();
  }, [dismissDesktopMenu, location.pathname]);

  const isAuthed = useAuthStore((s) => !!s.tokens?.accessToken);
  const user = useAuthStore((s) => s.user);
  const currentUserQuery = useCurrentUser();
  const { data: bookmarks } = useBookmarks({ enabled: isAuthed && !currentUserQuery.isFetching && !!currentUserQuery.data?.user });
  const { data: notifications, isLoading: notificationsLoading } = useNotifications({ enabled: isAuthed && !currentUserQuery.isFetching && !!currentUserQuery.data?.user });
  const currentUserData = currentUserQuery.data;
  const activeUser = currentUserData?.user ?? user;

  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0;

  const validBookmarksCount = bookmarks?.filter((b) => {
    if (b.targetKind === "paper") return !!b.paperDetail;
    if (b.targetKind === "report") return !!b.reportDetail;
    return false;
  }).length || 0;

  if (isAuthed && !currentUserQuery.isFetching && currentUserData?.user && requiresAcademicProfile(activeUser)) {
    return (
      <Navigate
        to="/onboarding/academic-profile"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  return (
    <div
      className={cn("flex min-h-screen flex-col", isForumSurface ? "bg-background" : "bg-slate-50 dark:bg-[#09090b]", isHomeSurface && "home-app-shell")}
    >
      <header className={cn("sticky top-0 z-50 h-[var(--app-header-height)] shrink-0 border-b bg-white dark:bg-[#0f0f11]", isForumSurface && "forum-app-header", isHomeSurface && "home-app-header")}>
        <div className={cn("mx-auto grid h-full w-full min-w-0 grid-cols-[minmax(0,auto)_1fr_auto] items-center gap-1 px-3 sm:gap-4 sm:px-6 lg:px-8", isForumSurface ? "max-w-none" : "max-w-screen-2xl", isHomeSurface && "home-app-nav-inner")}>
          <Link to="/" className="forum-app-brand flex h-full min-w-0 shrink select-none items-center">
            <img
              src={logoImage}
              alt="LumiGap"
              className="h-9 w-auto max-w-[7rem] object-contain dark:hidden min-[420px]:max-w-[9rem] sm:h-10 sm:max-w-none"
            />
            <img
              src={logoDarkImage}
              alt="LumiGap"
              className="hidden h-9 w-auto max-w-[7rem] object-contain dark:block min-[420px]:max-w-[9rem] sm:h-10 sm:max-w-none"
            />
          </Link>

          <nav
            aria-label={t("Primary navigation")}
            className="hidden items-center justify-self-center gap-0.5 whitespace-nowrap min-[1180px]:flex"
          >
            {navGroups.map((group) => (
              group.label === "Community" ? <Link key={group.label} to="/forum" className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", location.pathname.startsWith("/forum") && "bg-muted text-primary")}>{t(group.label)}</Link> :
              <DesktopNavDropdown
                key={group.label}
                label={t(group.label)}
                pathname={location.pathname}
                items={group.items.map((item) => ({ ...item, label: t(item.label) }))}
                open={activeDesktopMenu === group.label}
                onOpen={() => openDesktopMenu(group.label)}
                onClose={scheduleDesktopMenuClose}
                onDismiss={dismissDesktopMenu}
              />
            ))}
          </nav>

          <div className="forum-app-controls flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-2">
            <div className="hidden sm:block"><ThemeToggle /></div>
            <div className="hidden min-[360px]:block"><LanguageSwitcher /></div>
            {isAuthed && (
              <Suspense fallback={<span className="h-10 w-10" aria-hidden="true" />}>
                <NotificationMenu notifications={notifications} isLoading={notificationsLoading} unreadCount={unreadCount} isAdmin={isAdminSystemRole(activeUser?.systemRole)} />
              </Suspense>
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
            className="absolute left-0 right-0 top-[var(--app-header-height)] z-40 max-h-[calc(100dvh-var(--app-header-height))] overflow-y-auto overscroll-y-contain border-t bg-white pb-[env(safe-area-inset-bottom)] shadow-lg min-[1180px]:hidden dark:bg-[#0f0f11]"
          >
            <nav aria-label={t("Primary navigation")} className="mx-auto grid max-w-5xl gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 sm:hidden dark:bg-zinc-900">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("Preferences")}</span>
                <div className="flex items-center gap-2">
                  <div className="min-[360px]:hidden"><LanguageSwitcher /></div>
                  <ThemeToggle />
                </div>
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
      <main className={cn("relative z-10 min-w-0 flex-1", isForumSurface || isHomeSurface ? "w-full p-0" : "container mx-auto w-full px-4 py-5 sm:px-6 sm:py-8 lg:px-8")}>
        <Suspense fallback={<PageLoadingFallback />}>
          <RouteTransition><Outlet /></RouteTransition>
        </Suspense>
      </main>
      {!isForumSurface ? <footer className="border-t bg-white py-6 mt-auto dark:bg-[#0f0f11]">
        <div className="container mx-auto flex flex-col items-center justify-between px-4 text-center text-xs text-slate-500 sm:px-6 md:flex-row md:text-left lg:px-8 dark:text-slate-400">
          <p className="max-w-full break-words">&copy; {new Date().getFullYear()} {t("Liem Research Team. All rights reserved.")}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 md:mt-0 md:justify-end">
            <Link to="#" className="hover:text-slate-900 dark:hover:text-white">{t("Privacy Policy")}</Link>
            <Link to="#" className="hover:text-slate-900 dark:hover:text-white">{t("Terms of Service")}</Link>
            <Link to="#" className="hover:text-slate-900 dark:hover:text-white">{t("Contact Support")}</Link>
          </div>
        </div>
      </footer> : null}
    </div>
  );
}

function UserMenu({ bookmarkCount }: { bookmarkCount: number }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const isAuthed = useAuthStore((s) => !!s.tokens?.accessToken);
  const currentUserQuery = useCurrentUser();
  const data = currentUserQuery.data;
  const logout = useLogout();
  const { data: balanceData } = useCreditBalance({ enabled: isAuthed && !currentUserQuery.isFetching && !!data?.user });

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
  const systemRole = data?.user?.systemRole;
  const credits = balanceData?.credits ?? data?.user?.credits ?? 0;
  const points = data?.user?.points ?? 0;
  const currentLevel = getLevel(points);
  const levelAvatar = avatars[currentLevel];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label={t("Account")}
        >
          {!isAdminSystemRole(systemRole) ? (
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
        {!isAdminSystemRole(systemRole) && (
          <>
            <DropdownMenuSeparator />
            <button type="button" onClick={() => navigate("/settings/credits")} className="w-full rounded-md bg-slate-50/50 px-3 py-2 text-left text-xs font-semibold text-slate-500 transition-colors hover:bg-blue-50 dark:bg-zinc-900/30 dark:hover:bg-blue-950/20">
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
            </button>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/profile")}>
          <User className="mr-2 h-4 w-4" />
          {t("Profile")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/settings/security")}>
          <KeyRound className="mr-2 h-4 w-4" />
          {t("Security & password")}
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
        {isAdminSystemRole(systemRole) && (
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

