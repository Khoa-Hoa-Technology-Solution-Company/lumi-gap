import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { isAdminSystemRole } from "@trend/shared-types";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  AdminStatusBadge,
  adminApi,
} from "@/features/admin";
import { useCurrentUser } from "@/features/auth";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";

function formatAge(seconds: number | null, isVi: boolean): string {
  if (seconds === null) return isVi ? "Không có nhịp" : "No heartbeat";
  if (seconds < 60) return isVi ? `${seconds} giây trước` : `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return isVi ? `${mins} phút trước` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return isVi ? `${hours} giờ trước` : `${hours}h ago`;
}

function formatDateTime(value: string | null | undefined, isVi: boolean): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function AdminWorkersPage() {
  const { language } = useI18n();
  const isVi = language === "vi";
  const { data: me } = useCurrentUser();
  const viewerId = me?.user?.id ?? "anonymous";
  const isAdmin = isAdminSystemRole(me?.user?.systemRole);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", viewerId, "workers"],
    queryFn: () => adminApi.getWorkers(),
    enabled: isAdmin,
    refetchInterval: 15_000,
  });

  return (
    <main className="space-y-6">
      <PageHeader
        title={isVi ? "Worker & Hàng đợi nền" : "Workers & Background Fleet"}
        description={
          isVi
            ? "Giám sát nhịp sống (heartbeat) thực tế của các tiến trình worker và tải hàng đợi BullMQ từ Redis."
            : "Live worker heartbeat liveness and queue-level BullMQ telemetry read directly from Redis."
        }
        actions={
          <div className="flex items-center gap-2">
            {data?.generatedAt ? (
              <span className="hidden text-xs text-muted-foreground sm:inline tabular-nums">
                {isVi ? "Cập nhật:" : "Checked:"} {formatDateTime(data.generatedAt, isVi)}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              {isVi ? "Làm mới" : "Refresh Fleet"}
            </Button>
          </div>
        }
      />

      {isError ? (
        <AdminErrorPanel
          title={isVi ? "Không thể tải trạng thái worker và hàng đợi" : "Unable to load worker fleet telemetry"}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : (
        <>
          {/* Redis status banner */}
          {data && !data.redis.ok ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-900 dark:text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <div>
                <p className="font-semibold">
                  {isVi ? "Mất kết nối Redis — không thể đọc nhịp worker hoặc hàng đợi" : "Redis unreachable — worker heartbeats and queue metrics unavailable"}
                </p>
                {data.redis.error ? <p className="mt-0.5 font-mono text-[11px]">{data.redis.error}</p> : null}
              </div>
            </div>
          ) : null}

          {/* Summary KPI Row */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile
              label={isVi ? "Worker cấu hình" : "Expected Workers"}
              value={data?.summary.expected}
              loading={isLoading}
              icon={Server}
              tone="slate"
            />
            <SummaryTile
              label={isVi ? "Đang trực tuyến" : "Alive"}
              value={data?.summary.alive}
              loading={isLoading}
              icon={CheckCircle2}
              tone="emerald"
            />
            <SummaryTile
              label={isVi ? "Quá hạn nhịp" : "Stale"}
              value={data?.summary.stale}
              loading={isLoading}
              icon={AlertTriangle}
              tone="amber"
            />
            <SummaryTile
              label={isVi ? "Mất nhịp / Chưa chạy" : "Missing"}
              value={data?.summary.missing}
              loading={isLoading}
              icon={XCircle}
              tone="rose"
            />
          </section>

          {/* Section 1: Worker Heartbeat Table */}
          <section className="rounded-xl border bg-card">
            <div className="flex flex-col gap-1 border-b px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Server className="h-4 w-4 text-primary" />
                {isVi ? "Tiến trình Worker (Heartbeat thực tế)" : "Worker Processes (Live Heartbeats)"}
              </h2>
              <span className="text-[11px] text-muted-foreground">
                {isVi
                  ? "Số lượng công việc được thống kê ở mức hàng đợi bên dưới."
                  : "Job counts are reported at queue level below rather than per-process."}
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isVi ? "Worker" : "Worker"}</TableHead>
                    <TableHead>{isVi ? "Hàng đợi" : "Queue"}</TableHead>
                    <TableHead>{isVi ? "Trạng thái" : "Status"}</TableHead>
                    <TableHead>{isVi ? "Nhịp gần nhất" : "Last Heartbeat"}</TableHead>
                    <TableHead>{isVi ? "Tuổi nhịp" : "Age"}</TableHead>
                    <TableHead>{isVi ? "Máy chủ / PID" : "Host / PID"}</TableHead>
                    <TableHead>{isVi ? "Khởi động lúc" : "Started At"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.workers.length ? (
                    data.workers.map((worker) => (
                      <TableRow key={worker.workerName}>
                        <TableCell className="font-mono text-xs font-semibold text-foreground">
                          {worker.workerName}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{worker.queueName}</TableCell>
                        <TableCell>
                          <AdminStatusBadge status={worker.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(worker.lastSeenAt, isVi)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {formatAge(worker.ageSeconds, isVi)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {worker.hostname ? `${worker.hostname}${worker.pid ? `:${worker.pid}` : ""}` : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(worker.startedAt, isVi)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="p-6">
                        <AdminEmptyPanel
                          title={isVi ? "Không có dữ liệu worker" : "No worker heartbeat records"}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Section 2: Queue-Level Workload Table */}
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Layers className="h-4 w-4 text-primary" />
                {isVi ? "Tải hàng đợi BullMQ (mức hàng đợi)" : "Queue-Level Workload Telemetry"}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isVi ? "Hàng đợi" : "Queue"}</TableHead>
                    <TableHead className="text-right">{isVi ? "Chờ" : "Waiting"}</TableHead>
                    <TableHead className="text-right">{isVi ? "Đang xử lý" : "Active"}</TableHead>
                    <TableHead className="text-right">{isVi ? "Trì hoãn" : "Delayed"}</TableHead>
                    <TableHead className="text-right">{isVi ? "Thất bại" : "Failed"}</TableHead>
                    <TableHead className="text-right">{isVi ? "Hoàn tất" : "Completed"}</TableHead>
                    <TableHead className="text-right">{isVi ? "Tác vụ chờ lâu nhất" : "Oldest Pending"}</TableHead>
                    <TableHead>{isVi ? "Tình trạng" : "Condition"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.queues.length ? (
                    data.queues.map((q) => (
                      <TableRow key={q.name}>
                        <TableCell>
                          <div className="text-xs font-medium text-foreground">{q.label}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{q.name}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{formatNumber(q.waiting)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-blue-600 dark:text-blue-400">
                          {formatNumber(q.active)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{formatNumber(q.delayed)}</TableCell>
                        <TableCell className={cn("text-right font-mono text-xs tabular-nums", q.failed > 0 && "font-semibold text-rose-600 dark:text-rose-400")}>
                          {formatNumber(q.failed)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{formatNumber(q.completed)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {q.oldestPendingJobAgeSeconds !== null ? `${q.oldestPendingJobAgeSeconds}s` : "—"}
                        </TableCell>
                        <TableCell>
                          {q.hasFailures ? (
                            <AdminStatusBadge status="failed" label={isVi ? "Có lỗi" : "Failures"} />
                          ) : q.isBacklogged ? (
                            <AdminStatusBadge status="warning" label={isVi ? "Tồn đọng" : "Backlogged"} />
                          ) : (
                            <AdminStatusBadge status="healthy" label={isVi ? "Ổn định" : "Nominal"} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="p-6">
                        <AdminEmptyPanel title={isVi ? "Không có dữ liệu hàng đợi" : "No queue metrics available"} />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Section 3: Recent Failed Jobs Diagnostics */}
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                {isVi ? "Tác vụ thất bại gần đây" : "Recent Failed Jobs"}
              </h2>
              <Badge variant="outline" className="font-mono text-[11px] tabular-nums">
                {data?.recentFailedJobs.length ?? 0}
              </Badge>
            </div>
            {data?.recentFailedJobs && data.recentFailedJobs.length > 0 ? (
              <div className="divide-y">
                {data.recentFailedJobs.map((job) => (
                  <div key={`${job.queue}-${job.jobId}`} className="flex flex-col gap-1.5 px-5 py-3.5 text-xs sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {job.queue}
                        </Badge>
                        <span className="font-mono font-semibold text-foreground">{job.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">#{job.jobId}</span>
                        {job.isExhausted ? (
                          <AdminStatusBadge status="failed" label={isVi ? "Hết lượt thử" : "Exhausted"} showIcon={false} />
                        ) : null}
                      </div>
                      <p className="break-words text-rose-700 dark:text-rose-300">{job.failedReason}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                      <div>
                        {isVi ? "Thử:" : "Attempts:"} {job.attemptsMade}/{job.maxAttempts}
                      </div>
                      <div>{formatDateTime(job.timestamp, isVi)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <AdminEmptyPanel
                  title={isVi ? "Không có tác vụ hàng đợi nào thất bại gần đây" : "No recent failed queue jobs"}
                />
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function SummaryTile({
  label,
  value,
  loading,
  icon: Icon,
  tone,
}: {
  label: string;
  value?: number;
  loading: boolean;
  icon: typeof Server;
  tone: "slate" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <div className={`rounded-lg p-2 ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-10" />
        ) : (
          <div className="text-xl font-bold tabular-nums">{value ?? "—"}</div>
        )}
      </div>
    </div>
  );
}
