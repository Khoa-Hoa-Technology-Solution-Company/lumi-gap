import { useDeferredValue, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Cpu,
  FileText,
  Layers,
  Lightbulb,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import {
  isAdminSystemRole,
  type AdminAiOperationKind,
} from "@trend/shared-types";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdminEmptyPanel,
  AdminErrorPanel,
  AdminPaginationBar,
  AdminStatusBadge,
  adminApi,
} from "@/features/admin";
import { platformAiApi } from "@/features/admin/api/platform-ai.api";
import { useCurrentUser } from "@/features/auth";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";

const KIND_OPTIONS: Array<{ value: "all" | AdminAiOperationKind; labelVi: string; labelEn: string }> = [
  { value: "all", labelVi: "Tất cả", labelEn: "All" },
  { value: "ai_run", labelVi: "AI Runs", labelEn: "AI Runs" },
  { value: "report", labelVi: "Báo cáo tổng hợp", labelEn: "Reports" },
  { value: "gap_analysis", labelVi: "Phân tích khoảng trống", labelEn: "Gap Analyses" },
];

const STATUS_OPTIONS = [
  "all",
  "queued",
  "running",
  "generating",
  "analyzing",
  "completed",
  "ready",
  "failed",
  "cancelled",
] as const;

function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) return "—";
  if (durationMs < 1000) return `${durationMs}ms`;
  const sec = durationMs / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
}

function formatDateTime(value: string | null | undefined, isVi: boolean): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function kindLabel(kind: AdminAiOperationKind, isVi: boolean): string {
  if (kind === "ai_run") return "AI Run";
  if (kind === "report") return isVi ? "Báo cáo" : "Report";
  return isVi ? "Gap Analysis" : "Gap Analysis";
}

export function AdminAiJobsPage() {
  const { language } = useI18n();
  const isVi = language === "vi";
  const { data: me } = useCurrentUser();
  const viewerId = me?.user?.id ?? "anonymous";
  const isAdmin = isAdminSystemRole(me?.user?.systemRole);

  const [kind, setKind] = useState<"all" | AdminAiOperationKind>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [kind, status, deferredSearch, pageSize]);

  const { data: aiSettings } = useQuery({
    queryKey: ["admin", viewerId, "ai-connections"],
    queryFn: platformAiApi.get,
    enabled: isAdmin,
  });

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", viewerId, "ai-operations", kind, status, deferredSearch, page, pageSize],
    queryFn: () =>
      adminApi.getAiOperations({
        kind,
        status: status === "all" ? undefined : status,
        search: deferredSearch || undefined,
        page,
        pageSize,
      }),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const activeAi = aiSettings?.connections.find((c) => c.isActive);
  const fastModel = activeAi?.fastModel ?? aiSettings?.environmentDefaults.fastModel ?? null;
  const deepModel = activeAi?.deepModel ?? aiSettings?.environmentDefaults.deepModel ?? null;
  const providerSourceLabel = activeAi
    ? `${activeAi.name} (${activeAi.provider})`
    : aiSettings
      ? isVi
        ? `Mặc định môi trường (${aiSettings.environmentDefaults.provider})`
        : `Environment defaults (${aiSettings.environmentDefaults.provider})`
      : isVi
        ? "Đang kiểm tra…"
        : "Checking…";

  return (
    <main className="space-y-6">
      <PageHeader
        title={isVi ? "Vận hành AI & Hàng đợi tác vụ" : "AI Operations & Jobs"}
        description={
          isVi
            ? "Giám sát toàn hệ thống các lượt AI Run, báo cáo tổng hợp, phân tích khoảng trống nghiên cứu và hàng đợi BullMQ AI."
            : "System-wide observability for AI runs, synthesis reports, gap analyses, and AI BullMQ queues without exposing private prompts."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            {isVi ? "Làm mới" : "Refresh"}
          </Button>
        }
      />

      {/* Summary KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{isVi ? "Lượt chạy AI (AI Runs)" : "AI Runs"}</span>
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {data ? formatNumber(data.summary.aiRuns.total) : "—"}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {data
              ? isVi
                ? `${formatNumber(data.summary.aiRuns.running)} đang chạy · ${formatNumber(data.summary.aiRuns.failed)} thất bại`
                : `${formatNumber(data.summary.aiRuns.running)} running · ${formatNumber(data.summary.aiRuns.failed)} failed`
              : "—"}
          </p>
        </div>

        <div className="space-y-1 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{isVi ? "Báo cáo tổng hợp (Reports)" : "Synthesis Reports"}</span>
            <FileText className="h-4 w-4 text-purple-600" />
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {data ? formatNumber(data.summary.reports.total) : "—"}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {data
              ? isVi
                ? `${formatNumber(data.summary.reports.ready)} sẵn sàng · ${formatNumber(data.summary.reports.failed)} thất bại`
                : `${formatNumber(data.summary.reports.ready)} ready · ${formatNumber(data.summary.reports.failed)} failed`
              : "—"}
          </p>
        </div>

        <div className="space-y-1 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{isVi ? "Phân tích & Khoảng trống" : "Gap Analyses & Gaps"}</span>
            <Lightbulb className="h-4 w-4 text-amber-500" />
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {data ? formatNumber(data.summary.gapAnalyses.total) : "—"}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {data
              ? isVi
                ? `${formatNumber(data.summary.researchGaps.validated)}/${formatNumber(data.summary.researchGaps.total)} khoảng trống đã kiểm chứng`
                : `${formatNumber(data.summary.researchGaps.validated)}/${formatNumber(data.summary.researchGaps.total)} validated gaps`
              : "—"}
          </p>
        </div>

        <div className="space-y-1 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{isVi ? "Nhà cung cấp AI đang dùng" : "Active AI Provider"}</span>
            <Cpu className="h-4 w-4 text-blue-600" />
          </div>
          <div className="break-all font-mono text-sm font-bold text-foreground">
            {fastModel ?? (isVi ? "Chưa cấu hình" : "Not configured")}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {deepModel && deepModel !== fastModel ? (
              <>
                Deep: <span className="font-mono">{deepModel}</span> ·{" "}
              </>
            ) : null}
            {providerSourceLabel}
          </p>
        </div>
      </section>

      {isError ? (
        <AdminErrorPanel
          title={isVi ? "Không thể tải dữ liệu vận hành AI" : "Unable to load AI operations"}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : (
        <>
          {/* AI Queues Table */}
          {data?.queues && data.queues.length > 0 ? (
            <section className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Layers className="h-4 w-4 text-primary" />
                  {isVi ? "Hàng đợi BullMQ AI" : "AI BullMQ Queues"}
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {isVi ? "Đo trực tiếp từ Redis" : "Live from Redis"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isVi ? "Hàng đợi" : "Queue"}</TableHead>
                      <TableHead className="text-right">{isVi ? "Đang chờ" : "Waiting"}</TableHead>
                      <TableHead className="text-right">{isVi ? "Đang chạy" : "Active"}</TableHead>
                      <TableHead className="text-right">{isVi ? "Trì hoãn" : "Delayed"}</TableHead>
                      <TableHead className="text-right">{isVi ? "Thất bại" : "Failed"}</TableHead>
                      <TableHead className="text-right">{isVi ? "Hoàn tất" : "Completed"}</TableHead>
                      <TableHead>{isVi ? "Trạng thái" : "Condition"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.queues.map((q) => (
                      <TableRow key={q.name}>
                        <TableCell>
                          <div className="font-medium text-foreground">{q.label}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{q.name}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatNumber(q.waiting)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-blue-600 dark:text-blue-400">
                          {formatNumber(q.active)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatNumber(q.delayed)}</TableCell>
                        <TableCell className={cn("text-right font-mono tabular-nums", q.failed > 0 && "font-semibold text-rose-600 dark:text-rose-400")}>
                          {formatNumber(q.failed)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatNumber(q.completed)}</TableCell>
                        <TableCell>
                          {q.hasFailures ? (
                            <AdminStatusBadge status="failed" label={isVi ? "Có tác vụ lỗi" : "Has failures"} />
                          ) : q.isBacklogged ? (
                            <AdminStatusBadge status="warning" label={isVi ? "Đang tồn đọng" : "Backlogged"} />
                          ) : (
                            <AdminStatusBadge status="healthy" label={isVi ? "Bình thường" : "Nominal"} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ) : null}

          {/* Operations Table */}
          <section className="rounded-xl border bg-card">
            <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {KIND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setKind(option.value)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      kind === option.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {isVi ? option.labelVi : option.labelEn}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label={isVi ? "Tìm tác vụ AI" : "Search AI operations"}
                    placeholder={isVi ? "Tìm theo loại, model, người tạo…" : "Search type, model, initiator…"}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 pl-8 text-xs"
                  />
                </div>
                <select
                  aria-label={isVi ? "Lọc theo trạng thái" : "Filter by status"}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === "all" ? (isVi ? "Mọi trạng thái" : "All statuses") : opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isVi ? "Loại & Tác vụ" : "Kind & Operation"}</TableHead>
                    <TableHead>{isVi ? "Trạng thái" : "Status"}</TableHead>
                    <TableHead>{isVi ? "Người khởi tạo" : "Initiator"}</TableHead>
                    <TableHead>{isVi ? "Model / Thử lại" : "Model / Attempts"}</TableHead>
                    <TableHead>{isVi ? "Thời lượng / Chi phí" : "Duration / Cost"}</TableHead>
                    <TableHead>{isVi ? "Thời điểm" : "Created"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <TableRow key={idx}>
                        {Array.from({ length: 6 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.items.length ? (
                    data.items.map((item) => (
                      <TableRow key={`${item.kind}-${item.id}`}>
                        <TableCell className="max-w-[260px]">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              {kindLabel(item.kind, isVi)}
                            </Badge>
                            <span className="truncate font-mono text-xs font-semibold text-foreground">
                              {item.operationType}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                            {item.id}
                          </div>
                          {item.errorMessage ? (
                            <div className="mt-1 flex items-start gap-1 text-[11px] text-rose-700 dark:text-rose-300">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              <span className="line-clamp-2">
                                {item.errorCode ? `[${item.errorCode}] ` : ""}
                                {item.errorMessage}
                              </span>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge status={item.status || "unknown"} />
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.initiator ? (
                            <div>
                              <div className="font-medium text-foreground">{item.initiator.fullName}</div>
                              <div className="max-w-[180px] truncate text-[11px] text-muted-foreground">
                                {item.initiator.email}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{isVi ? "Hệ thống" : "System"}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-mono text-[11px] text-foreground">
                            {item.modelVersion ?? (isVi ? "Không ghi nhận" : "Not recorded")}
                          </div>
                          {item.attempts !== null ? (
                            <div className="text-[11px] text-muted-foreground tabular-nums">
                              {isVi ? "Thử:" : "Attempts:"} {item.attempts}
                              {item.maxAttempts ? `/${item.maxAttempts}` : ""}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          <div>{formatDuration(item.durationMs)}</div>
                          {item.creditCost !== null ? (
                            <div className="text-[11px] text-muted-foreground">{item.creditCost} credits</div>
                          ) : item.costUsd !== null ? (
                            <div className="text-[11px] text-muted-foreground">${item.costUsd.toFixed(4)}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(item.createdAt, isVi)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="p-6">
                        <AdminEmptyPanel
                          title={isVi ? "Chưa có tác vụ AI nào khớp bộ lọc" : "No AI operations match the current filters"}
                          description={
                            isVi
                              ? "Các lượt AI Run, báo cáo tổng hợp và phân tích khoảng trống sẽ xuất hiện tại đây khi hệ thống xử lý."
                              : "Persisted AI runs, synthesis reports, and gap analyses appear here once triggered."
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {data ? (
              <AdminPaginationBar
                page={data.meta.page}
                totalPages={data.meta.totalPages}
                total={data.meta.total}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                isFetching={isFetching && !isLoading}
                noun={isVi ? "tác vụ" : "operations"}
              />
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
