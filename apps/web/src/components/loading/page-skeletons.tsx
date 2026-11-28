import { useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { SkeletonAvatar, SkeletonCard, SkeletonList, SkeletonTable, SkeletonText } from "./primitives";
import { RoutePendingSignal } from "./route-progress";

export type PageSkeletonVariant =
  | "dashboard"
  | "projects"
  | "project-detail"
  | "profile"
  | "literature"
  | "paper-detail"
  | "research-gaps"
  | "reports"
  | "manuscript-editor"
  | "review-workspace"
  | "review-center"
  | "mentor-overview"
  | "mentor-queue"
  | "mentor-projects"
  | "notifications"
  | "settings"
  | "chat"
  | "table"
  | "default";

export function resolveSkeletonVariant(pathname: string, search = ""): PageSkeletonVariant {
  if (pathname === "/dashboard" || pathname === "/admin/analytics") return "dashboard";
  if (pathname === "/profile" || pathname.startsWith("/u/") || pathname.startsWith("/academics/")) return "profile";
  if (pathname === "/notifications") return "notifications";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  if (pathname === "/literature" || pathname === "/home") return "literature";
  if (/^\/papers\/[^/]+$/.test(pathname) && !["review", "format-check", "submit"].includes(pathname.split("/")[2] ?? "")) {
    return "paper-detail";
  }
  if (/^\/projects\/[^/]+\/manuscripts\/[^/]+/.test(pathname)) return "manuscript-editor";
  if (/^\/projects\/[^/]+/.test(pathname)) return "project-detail";
  if (pathname === "/projects") return "projects";
  if (pathname.startsWith("/research-gap")) return "research-gaps";
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return "reports";
  if (/^\/reviews\/[^/]+/.test(pathname)) return "review-workspace";
  if (pathname === "/reviews" || pathname.startsWith("/review-templates") || pathname === "/review-opportunities") {
    return "review-center";
  }
  if (pathname === "/mentor-workspace") {
    const view = new URLSearchParams(search).get("view") ?? "overview";
    if (view === "review") return "review-workspace";
    if (view === "reviews" || view === "templates" || view === "template-builder") return "review-center";
    if (view === "notifications") return "notifications";
    if (view === "projects" || view === "research-projects") return "mentor-projects";
    if (view === "work" || view === "resources" || view === "incoming" || view === "discover") return "mentor-queue";
    return "mentor-overview";
  }
  if (pathname.startsWith("/admin")) return "table";
  return "default";
}

export function PageSkeleton({
  variant = "default",
  embedded = false,
  label,
  className,
}: {
  variant?: PageSkeletonVariant;
  embedded?: boolean;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const ariaLabel = label ?? t("loading.pageLabel");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
      className={cn("min-w-0 w-full", className)}
    >
      <span className="sr-only">{ariaLabel}</span>

      {variant === "dashboard" ? (
        <div className="container space-y-8 py-6" aria-hidden="true">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => (
              <SkeletonCard key={i} lines={2} showHeader className="p-4" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-2xl border border-border/80 bg-card p-5 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
          <SkeletonTable rows={4} columns={4} showToolbar={false} />
        </div>
      ) : variant === "profile" ? (
        <div className="mx-auto max-w-[1120px] space-y-6 px-4 py-6 sm:px-6" aria-hidden="true">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card">
            <Skeleton className="h-28 w-full rounded-none sm:h-36" />
            <div className="px-5 pb-5 sm:px-7">
              <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
                <SkeletonAvatar size="xl" className="ring-4 ring-card" />
                <div className="flex items-center gap-2 pt-2">
                  <Skeleton className="h-9 w-32 rounded-lg" />
                  <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-7 w-64 max-w-full" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Skeleton className="h-6 w-36 rounded-full" />
                <Skeleton className="h-6 w-32 rounded-full" />
              </div>
              <div className="mt-5 flex gap-3 border-t border-border/70 pt-3">
                {[0, 1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-8 w-24 rounded-lg" />
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <SkeletonCard lines={3} />
              <SkeletonCard lines={4} />
            </div>
            <div className="space-y-6 lg:col-span-4">
              <SkeletonCard lines={3} />
              <SkeletonCard lines={2} />
            </div>
          </div>
        </div>
      ) : variant === "projects" || variant === "mentor-projects" ? (
        <div className={cn("space-y-6", !embedded && "mx-auto max-w-6xl px-4 py-6")} aria-hidden="true">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-10 w-72 max-w-full rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map(i => (
              <SkeletonCard key={i} lines={3} />
            ))}
          </div>
        </div>
      ) : variant === "project-detail" ? (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6" aria-hidden="true">
          <Skeleton className="h-4 w-44" />
          <div className="flex items-start gap-4">
            <SkeletonAvatar size="lg" rounded="lg" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <Skeleton className="h-7 w-80 max-w-full" />
              <Skeleton className="h-4 w-56 max-w-full" />
            </div>
          </div>
          <div className="flex gap-2 border-b border-border/70 pb-3">
            {[0, 1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-8 w-24 rounded-lg" />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <SkeletonCard lines={5} className="lg:col-span-2" />
            <SkeletonCard lines={4} />
          </div>
        </div>
      ) : variant === "literature" ? (
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6" aria-hidden="true">
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
          <SkeletonList items={4} />
        </div>
      ) : variant === "paper-detail" ? (
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8" aria-hidden="true">
          <Skeleton className="h-4 w-44" />
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
              </div>
              <SkeletonCard lines={5} />
              <SkeletonCard lines={4} />
            </div>
            <div className="space-y-5 lg:col-span-4">
              <SkeletonCard lines={4} />
              <SkeletonCard lines={3} />
            </div>
          </div>
        </div>
      ) : variant === "manuscript-editor" ? (
        <div className="flex h-[calc(100dvh-1rem)] min-h-[560px] flex-col bg-background" aria-hidden="true">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-24 rounded-md" />
              <Skeleton className="h-5 w-48" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
          <div className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="hidden border-r border-border p-3 space-y-2.5 md:block">
              <Skeleton className="h-5 w-28" />
              {[0, 1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-7 w-full rounded-md" />
              ))}
            </div>
            <div className="border-r border-border p-5 space-y-3">
              <Skeleton className="h-8 w-full rounded-md" />
              <SkeletonText lines={10} />
            </div>
            <div className="hidden bg-muted/20 p-6 md:flex md:flex-col md:items-center">
              <Skeleton className="h-full w-full max-w-[460px] rounded-xl" />
            </div>
          </div>
        </div>
      ) : variant === "review-workspace" ? (
        <div className={cn("space-y-4", !embedded && "mx-auto max-w-[1440px] px-4 py-4")} aria-hidden="true">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="rounded-2xl border border-border/80 bg-card p-4 lg:col-span-7">
              <div className="mb-3 flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-7 w-28 rounded-md" />
              </div>
              <Skeleton className="h-[520px] w-full rounded-xl" />
            </div>
            <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 lg:col-span-5">
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1 rounded-lg" />
                <Skeleton className="h-8 flex-1 rounded-lg" />
              </div>
              <SkeletonCard lines={4} className="p-4" />
              <SkeletonCard lines={3} className="p-4" />
              <div className="flex justify-end gap-2 pt-2">
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      ) : variant === "review-center" ? (
        <div className={cn("space-y-5", !embedded && "mx-auto max-w-6xl px-4 py-6")} aria-hidden="true">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-5">
            <div className="space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="h-9 w-28 rounded-lg" />
            ))}
          </div>
          <SkeletonList items={3} />
        </div>
      ) : variant === "mentor-overview" ? (
        <div className="space-y-6" aria-hidden="true">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-border/80 bg-card p-4 space-y-2.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <SkeletonList items={3} />
            </div>
            <div className="space-y-4 lg:col-span-5">
              <SkeletonCard lines={4} />
              <SkeletonCard lines={3} />
            </div>
          </div>
        </div>
      ) : variant === "mentor-queue" ? (
        <div className="space-y-4" aria-hidden="true">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-9 w-40 rounded-lg" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-56 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
          <SkeletonList items={4} />
        </div>
      ) : variant === "notifications" ? (
        <div
          className={cn(
            "flex flex-col gap-8 md:flex-row",
            !embedded && "container mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8",
          )}
          aria-hidden="true"
        >
          <div className="w-full shrink-0 space-y-3 md:w-64">
            <Skeleton className="h-7 w-36" />
            <div className="space-y-1.5 pt-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
            <SkeletonList items={5} showAvatar />
          </div>
        </div>
      ) : variant === "settings" ? (
        <div className="container max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8" aria-hidden="true">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-1.5">
              {[0, 1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
            <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-6">
              <Skeleton className="h-6 w-44" />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-20 w-full rounded-lg" />
                </div>
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      ) : variant === "research-gaps" || variant === "reports" ? (
        <div className="container space-y-6 py-6" aria-hidden="true">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
          <SkeletonCard lines={2} />
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map(i => (
              <SkeletonCard key={i} lines={4} />
            ))}
          </div>
        </div>
      ) : variant === "chat" ? (
        <div className="space-y-4 p-4" aria-hidden="true">
          <div className="flex items-start gap-3">
            <SkeletonAvatar size="sm" />
            <div className="max-w-[75%] flex-1 space-y-2 rounded-2xl border border-border/70 bg-card p-3.5">
              <Skeleton className="h-3.5 w-24" />
              <SkeletonText lines={2} />
            </div>
          </div>
          <div className="flex items-start justify-end gap-3">
            <div className="max-w-[65%] flex-1 space-y-2 rounded-2xl bg-primary/10 p-3.5">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>
          <div className="flex items-start gap-3">
            <SkeletonAvatar size="sm" />
            <div className="max-w-[70%] flex-1 space-y-2 rounded-2xl border border-border/70 bg-card p-3.5">
              <Skeleton className="h-3.5 w-28" />
              <SkeletonText lines={3} />
            </div>
          </div>
        </div>
      ) : variant === "table" ? (
        <div className="space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <SkeletonTable rows={6} columns={5} />
        </div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8" aria-hidden="true">
          <div className="space-y-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </div>
      )}
    </div>
  );
}

/**
 * Route-aware `<Suspense>` fallback for `<MainLayout>` & `<AdminLayout>`.
 * Renders the skeleton matching the target route and drives `<RouteProgress />`.
 */
export function RouteAwarePageSkeleton({
  variant,
  embedded = false,
}: {
  variant?: PageSkeletonVariant;
  embedded?: boolean;
}) {
  const { pathname, search } = useLocation();
  const resolved = variant ?? resolveSkeletonVariant(pathname, search);
  return (
    <>
      <RoutePendingSignal />
      <PageSkeleton variant={resolved} embedded={embedded} />
    </>
  );
}
