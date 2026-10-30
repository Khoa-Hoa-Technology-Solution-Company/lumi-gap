import type { ReactNode } from "react";
import type { AxiosError } from "axios";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n";
import type { PageMeta } from "../api/catalog.api";

export const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Delay before background re-tagging results are refetched after a save. */
export const RETAG_REFETCH_MS = 3000;

export function apiErr(err: unknown): string {
  const ax = err as AxiosError<{ error?: { message?: string } }>;
  return ax?.response?.data?.error?.message ?? "Action failed.";
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

/** Slug the way the backend validates it: lowercase words joined by single hyphens. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function TableSkeletonRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <TableRow key={row}>
          {Array.from({ length: columns }).map((__, cell) => (
            <TableCell key={cell}><Skeleton className="h-5 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function TableMessageRow({ columns, children }: { columns: number; children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="py-12 text-center text-muted-foreground">{children}</TableCell>
    </TableRow>
  );
}

export function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">{message ?? t("Could not load this data.")}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>{t("Retry")}</Button>
    </div>
  );
}

export function PaginationBar({ meta, page, onPage, isFetching, noun }: {
  meta?: PageMeta;
  page: number;
  onPage: (page: number) => void;
  isFetching?: boolean;
  noun: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground">
        {meta
          ? t("{{total}} {{noun}} · Page {{page}} of {{pages}}", {
              total: meta.total,
              noun: t(noun),
              page: meta.page,
              pages: Math.max(meta.totalPages, 1),
            })
          : t("Loading…")}
        {isFetching && meta ? ` · ${t("Updating…")}` : ""}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label={t("Previous page")} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" aria-label={t("Next page")} disabled={!meta || page >= meta.totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, loading }: {
  label: string;
  value?: ReactNode;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      {loading ? <Skeleton className="mt-1.5 h-7 w-16" /> : <div className="mt-1 text-2xl font-semibold tabular-nums">{value ?? 0}</div>}
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
