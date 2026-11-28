import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileSearch,
  Loader2,
  Lock,
  RefreshCw,
  WifiOff,
  XCircle,
} from "lucide-react";
import logoImage from "@/assets/logo.png";
import logoDarkImage from "@/assets/logo-dark.png";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";

const TEXT_WIDTHS = ["w-full", "w-11/12", "w-5/6", "w-3/4", "w-2/3"] as const;

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => {
        const isLast = index === lines - 1 && lines > 1;
        const width = isLast ? "w-2/3" : TEXT_WIDTHS[index % TEXT_WIDTHS.length];
        return <Skeleton key={index} className={cn("h-3.5", width)} />;
      })}
    </div>
  );
}

const AVATAR_SIZES = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
  xl: "h-24 w-24",
} as const;

export function SkeletonAvatar({
  size = "md",
  rounded = "full",
  className,
}: {
  size?: keyof typeof AVATAR_SIZES;
  rounded?: "full" | "lg";
  className?: string;
}) {
  return (
    <Skeleton
      className={cn(
        "shrink-0",
        AVATAR_SIZES[size],
        rounded === "full" ? "rounded-full" : "rounded-xl",
        className,
      )}
    />
  );
}

export function SkeletonCard({
  lines = 3,
  showHeader = true,
  className,
}: {
  lines?: number;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-2xl border border-border/80 bg-card p-5 space-y-4",
        className,
      )}
    >
      {showHeader ? (
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-44 max-w-[65%]" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ) : null}
      <SkeletonText lines={lines} />
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  showToolbar = true,
  className,
}: {
  rows?: number;
  columns?: number;
  showToolbar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)} aria-hidden="true">
      {showToolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-9 w-64 max-w-full rounded-lg" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card">
        <div
          className="grid gap-4 border-b border-border/70 bg-muted/35 px-5 py-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className="h-3.5 w-20" />
          ))}
        </div>
        <div className="divide-y divide-border/60">
          {Array.from({ length: rows }, (_, r) => (
            <div
              key={r}
              className="grid items-center gap-4 px-5 py-3.5"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: columns }, (_, c) => (
                <Skeleton
                  key={c}
                  className={cn("h-4", c === 0 ? "w-5/6" : c === columns - 1 ? "w-16" : "w-3/5")}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({
  items = 4,
  showAvatar = false,
  className,
}: {
  items?: number;
  showAvatar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {Array.from({ length: items }, (_, idx) => (
        <div
          key={idx}
          className="flex items-start gap-3.5 rounded-xl border border-border/80 bg-card p-4"
        >
          {showAvatar ? <SkeletonAvatar size="md" /> : null}
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-4/5" />
            <div className="flex items-center gap-2 pt-0.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InlineLoader({
  label,
  size = "sm",
  className,
}: {
  label?: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const iconSize = size === "xs" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Loader2
        className={cn(iconSize, "shrink-0 animate-spin text-primary/80 motion-reduce:animate-none")}
        aria-hidden="true"
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

/**
 * Full-screen branded initialization view.
 * Used ONLY for genuine cold app/locale/session bootstrap — never for routine page transitions.
 * Works safely both inside and outside `<I18nProvider>`.
 */
export function AppLoading({
  message,
  slowDelayMs = 8000,
  className,
}: {
  message?: string;
  slowDelayMs?: number;
  className?: string;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), slowDelayMs);
    return () => window.clearTimeout(timer);
  }, [slowDelayMs]);

  const isVi =
    typeof document !== "undefined" &&
    (document.documentElement.lang?.startsWith("vi") ||
      window.localStorage?.getItem("lumigap.uiLanguage") === "vi" ||
      window.localStorage?.getItem("LumiGap.uiLanguage") === "vi");

  const resolvedMessage =
    message ??
    (isVi ? "Đang chuẩn bị không gian làm việc LumiGap…" : "Preparing your LumiGap workspace…");
  const slowMessage = isVi
    ? "Tải lâu hơn dự kiến. Vui lòng kiểm tra kết nối mạng hoặc tải lại trang."
    : "Taking longer than expected. Check your connection or try reloading.";
  const reloadLabel = isVi ? "Tải lại trang" : "Reload page";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-no-i18n
      className={cn(
        "flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 text-center text-foreground dark:bg-[#09090b]",
        className,
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-4">
        <div className="flex items-center justify-center">
          <img src={logoImage} alt="LumiGap" className="h-9 w-auto object-contain dark:hidden" />
          <img src={logoDarkImage} alt="LumiGap" className="hidden h-9 w-auto object-contain dark:block" />
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2
            className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>{resolvedMessage}</span>
        </div>
        {slow ? (
          <div className="mt-2 space-y-3 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground shadow-xs">
            <p>{slowMessage}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.location.reload()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{reloadLabel}</span>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type AsyncTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/**
 * Standardized long-running research task indicator.
 * - Uses determinate progress bar ONLY when `completed`/`total` or `percent` comes from real backend state.
 * - Uses honest indeterminate progress otherwise — never fakes percent via timers.
 */
export function AsyncTaskProgress({
  title,
  description,
  status,
  percent,
  completed,
  total,
  onRetry,
  retrying,
  onCancel,
  cancelling,
  className,
}: {
  title: string;
  description?: string;
  status: AsyncTaskStatus;
  percent?: number;
  completed?: number;
  total?: number;
  onRetry?: () => void;
  retrying?: boolean;
  onCancel?: () => void;
  cancelling?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const hasRealProgress =
    (typeof percent === "number" && Number.isFinite(percent)) ||
    (typeof completed === "number" && typeof total === "number" && total > 0);
  const clampedPercent =
    typeof percent === "number"
      ? Math.max(0, Math.min(100, Math.round(percent)))
      : typeof completed === "number" && typeof total === "number" && total > 0
        ? Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
        : undefined;

  const isActive = status === "queued" || status === "running";
  const toneClass =
    status === "failed"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : status === "completed"
        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
        : status === "cancelled"
          ? "border-border bg-muted/40 text-muted-foreground"
          : "border-primary/25 bg-primary/[0.04] text-foreground";

  return (
    <div
      role={status === "failed" ? "alert" : "status"}
      aria-live="polite"
      className={cn("rounded-xl border p-4 space-y-3", toneClass, className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {status === "running" ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          ) : status === "queued" ? (
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          ) : status === "completed" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold break-words">{title}</p>
              <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px] font-medium">
                {t(`loading.task.${status}`)}
              </span>
            </div>
            {description ? (
              <p className="mt-1 text-xs opacity-85 break-words">{description}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isActive && onCancel ? (
            <Button type="button" size="sm" variant="outline" loading={cancelling} onClick={onCancel}>
              {t("loading.task.cancel")}
            </Button>
          ) : null}
          {status === "failed" && onRetry ? (
            <Button type="button" size="sm" variant="outline" loading={retrying} onClick={onRetry}>
              {t("loading.task.retry")}
            </Button>
          ) : null}
        </div>
      </div>

      {isActive ? (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-label={title}
            aria-valuemin={hasRealProgress ? 0 : undefined}
            aria-valuemax={hasRealProgress ? 100 : undefined}
            aria-valuenow={clampedPercent}
            className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15"
          >
            {hasRealProgress && clampedPercent !== undefined ? (
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${clampedPercent}%` }}
              />
            ) : (
              <div className="lumi-indeterminate-bar h-full w-1/2 rounded-full bg-primary motion-reduce:w-full motion-reduce:opacity-60" />
            )}
          </div>
          {hasRealProgress ? (
            <p className="text-right text-[11px] tabular-nums text-muted-foreground">
              {typeof completed === "number" && typeof total === "number"
                ? `${completed}/${total} (${clampedPercent}%)`
                : `${clampedPercent}%`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type ClassifiedErrorKind =
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "server";

export function classifyApiError(error: unknown): {
  kind: ClassifiedErrorKind;
  status?: number;
  retryable: boolean;
} {
  const err = error as {
    code?: string;
    message?: string;
    response?: { status?: number };
  } | null;
  const status = err?.response?.status;
  if (status === 401) return { kind: "unauthorized", status, retryable: false };
  if (status === 403) return { kind: "forbidden", status, retryable: false };
  if (status === 404) return { kind: "not_found", status, retryable: false };
  if (err?.code === "ECONNABORTED" || status === 408 || status === 504) {
    return { kind: "timeout", status, retryable: true };
  }
  if (!status && (err?.code === "ERR_NETWORK" || (typeof navigator !== "undefined" && navigator.onLine === false))) {
    return { kind: "network", retryable: true };
  }
  return { kind: "server", status, retryable: true };
}

/**
 * Standardized accessible Error State.
 * Distinguishes network/timeout/401/403/404/500 and never offers Retry on 403 Forbidden or 404 Not Found.
 */
export function SectionErrorState({
  error,
  title,
  description,
  onRetry,
  retrying,
  action,
  compact = false,
  className,
}: {
  error?: unknown;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const classified = classifyApiError(error);

  const defaultKeys: Record<ClassifiedErrorKind, { title: string; desc: string }> = {
    network: { title: "loading.error.networkTitle", desc: "loading.error.networkDesc" },
    timeout: { title: "loading.error.timeoutTitle", desc: "loading.error.timeoutDesc" },
    unauthorized: { title: "loading.error.unauthorizedTitle", desc: "loading.error.unauthorizedDesc" },
    forbidden: { title: "loading.error.forbiddenTitle", desc: "loading.error.forbiddenDesc" },
    not_found: { title: "loading.error.notFoundTitle", desc: "loading.error.notFoundDesc" },
    server: { title: "loading.error.serverTitle", desc: "loading.error.serverDesc" },
  };

  const Icon =
    classified.kind === "network"
      ? WifiOff
      : classified.kind === "forbidden" || classified.kind === "unauthorized"
        ? Lock
        : classified.kind === "not_found"
          ? FileSearch
          : classified.kind === "timeout"
            ? Clock3
            : AlertCircle;

  const resolvedTitle = title ?? t(defaultKeys[classified.kind].title);
  const resolvedDesc = description ?? t(defaultKeys[classified.kind].desc);

  return (
    <div
      role="alert"
      className={cn(
        "rounded-2xl border border-border bg-card text-center",
        compact ? "p-5" : "px-6 py-10",
        className,
      )}
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-base font-semibold text-foreground">{resolvedTitle}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{resolvedDesc}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {classified.kind === "unauthorized" ? (
          <Button asChild size="sm">
            <Link to="/login">{t("loading.error.signIn")}</Link>
          </Button>
        ) : classified.retryable && onRetry ? (
          <Button type="button" size="sm" variant="outline" loading={retrying} onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("loading.error.retry")}</span>
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}

export function SectionEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? <div className="mx-auto mb-3 flex justify-center text-muted-foreground">{icon}</div> : null}
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
