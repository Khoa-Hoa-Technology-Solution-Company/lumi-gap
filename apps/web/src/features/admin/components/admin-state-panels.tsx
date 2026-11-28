import { AlertCircle, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

export function AdminErrorPanel({
  title,
  message,
  onRetry,
  retrying = false,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const { language } = useI18n();
  const isVi = language === "vi";
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 text-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="font-semibold text-rose-900 dark:text-rose-200">
            {title ?? (isVi ? "Không thể tải dữ liệu từ máy chủ" : "Unable to load data from the server")}
          </p>
          <p className="text-xs text-rose-800/80 dark:text-rose-300/80">
            {message ?? (isVi
              ? "Hệ thống không hiển thị số liệu giả định khi yêu cầu thất bại. Vui lòng thử tải lại."
              : "Placeholder counts are not shown when a request fails. Please retry.")}
          </p>
        </div>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="shrink-0 gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} aria-hidden="true" />
          <span>{isVi ? "Thử lại" : "Retry"}</span>
        </Button>
      ) : null}
    </div>
  );
}

export function AdminEmptyPanel({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center", className)}>
      <Inbox className="h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
      <p className="mt-2.5 text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function AdminPaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isFetching = false,
  noun,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextSize: number) => void;
  isFetching?: boolean;
  noun?: string;
}) {
  const { language } = useI18n();
  const isVi = language === "vi";
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <div className="flex flex-col gap-3 border-t border-border/80 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground tabular-nums">
        {isVi
          ? `${total.toLocaleString("vi-VN")} ${noun ?? "bản ghi"} · Trang ${page} / ${safeTotalPages}`
          : `${total.toLocaleString("en-US")} ${noun ?? "records"} · Page ${page} of ${safeTotalPages}`}
        {isFetching ? (isVi ? " · Đang cập nhật…" : " · Updating…") : ""}
      </div>
      <div className="flex items-center gap-2">
        {onPageSizeChange && pageSize ? (
          <select
            aria-label={isVi ? "Số dòng mỗi trang" : "Rows per page"}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {isVi ? `${size} / trang` : `${size} per page`}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={isVi ? "Trang trước" : "Previous page"}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={isVi ? "Trang sau" : "Next page"}
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
