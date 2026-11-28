import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  FileText,
  FolderGit2,
  GraduationCap,
  MessageSquare,
  RefreshCw,
  Scale,
  Server,
  ShieldAlert,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { isAdminSystemRole, type AgreementBucket } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminErrorPanel,
  AdminStatusBadge,
  useAdminStats,
  useQualityAgreement,
} from "@/features/admin";
import { useCurrentUser } from "@/features/auth";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";

function fmtCount(value: number | null | undefined, isVi: boolean): string {
  if (value === null || value === undefined) return isVi ? "Không rõ" : "Unavailable";
  return formatNumber(value);
}

export function AdminHomePage() {
  const { language } = useI18n();
  const isVi = language === "vi";
  const { data: me } = useCurrentUser();
  const isAdmin = isAdminSystemRole(me?.user?.systemRole);
  const { data, isLoading, isError, isFetching, refetch } = useAdminStats(isAdmin, 60_000);
  const { data: agreement, isError: agreementError } = useQualityAgreement(isAdmin);

  const agreementRows: { label: string; b: AgreementBucket }[] = agreement
    ? [
      { label: isVi ? "Tổng hợp" : "Total", b: agreement },
      { label: isVi ? "Báo cáo tổng hợp" : "Report", b: agreement.byKind.report },
      { label: isVi ? "Khoảng trống NC" : "Gap", b: agreement.byKind.gap },
      { label: isVi ? "Bài báo" : "Paper", b: agreement.byKind.paper },
    ]
    : [];

  if (isError && !data) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isVi ? "Tổng quan vận hành quản trị" : "Admin Operations Overview"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {isVi
              ? "Giám sát trạng thái hệ thống, hàng đợi xử lý và chỉ số vận hành thực tế."
              : "Operational overview of real platform metrics, work queues, and dependency health."}
          </p>
        </header>
        <AdminErrorPanel
          title={isVi ? "Không thể tải thống kê tổng quan" : "Unable to load admin overview"}
          message={isVi
            ? "Yêu cầu đến /admin/stats thất bại. Hệ thống không hiển thị số liệu giả định."
            : "The request to /admin/stats failed. No placeholder numbers are displayed."}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      </div>
    );
  }

  const attentionItems = [
    {
      key: "verifications",
      label: isVi ? "Xác minh học thuật chờ duyệt" : "Pending verifications",
      count: data?.attention.pendingVerifications,
      to: "/admin/academic-verifications",
      icon: UserCheck,
    },
    {
      key: "papers",
      label: isVi ? "Yêu cầu bài báo chờ duyệt" : "Pending paper requests",
      count: data?.attention.pendingPaperRequests,
      to: "/admin/papers",
      icon: FileText,
    },
    {
      key: "reports",
      label: isVi ? "Báo cáo vi phạm đang mở" : "Open moderation reports",
      count: data?.attention.openModerationReports,
      to: "/admin/trust-safety?tab=reports&status=open",
      icon: ShieldAlert,
    },
    {
      key: "appeals",
      label: isVi ? "Khiếu nại chưa giải quyết" : "Pending appeals",
      count: data?.attention.pendingAppeals,
      to: "/admin/trust-safety?tab=appeals",
      icon: MessageSquare,
    },
    {
      key: "failedAi",
      label: isVi ? "Tác vụ AI thất bại" : "Failed AI runs",
      count: data?.attention.failedAiRuns,
      to: "/admin/ai-jobs?status=failed",
      icon: Cpu,
    },
    {
      key: "staleAi",
      label: isVi ? "Tác vụ AI bị treo / quá hạn" : "Stale AI jobs",
      count: data?.attention.staleAiJobs,
      to: "/admin/pipeline",
      icon: Clock,
    },
    {
      key: "failedQueueJobs",
      label: isVi ? "Job nền thất bại (hết lượt thử)" : "Failed background jobs",
      count: data?.attention.failedQueueJobs,
      to: "/admin/pipeline",
      icon: AlertTriangle,
    },
    {
      key: "failedSync",
      label: isVi ? "Lượt đồng bộ OpenAlex lỗi" : "Failed OpenAlex sync runs",
      count: data?.attention.failedSyncRuns,
      to: "/admin/sync",
      icon: RefreshCw,
    },
    {
      key: "workers",
      label: isVi ? "Worker mất nhịp / quá hạn" : "Stale or missing workers",
      count: data?.attention.unhealthyWorkers,
      to: "/admin/workers",
      icon: Server,
    },
  ];

  const deps = data?.systemHealth.dependencies;
  const checkedAt = data?.systemHealth.checkedAt
    ? new Date(data.systemHealth.checkedAt).toLocaleString(isVi ? "vi-VN" : "en-US")
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isVi ? "Tổng quan vận hành quản trị" : "Admin Operations Overview"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {isVi
              ? "Số liệu truy vấn trực tiếp từ PostgreSQL, Redis và nhịp tim Worker."
              : "Live operational metrics sourced directly from PostgreSQL, Redis, and worker heartbeats."}
            {checkedAt ? ` · ${isVi ? "Cập nhật" : "Updated"}: ${checkedAt}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden="true" />
            <span>{isVi ? "Làm mới" : "Refresh"}</span>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/academic-verifications">
              <UserCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {isVi ? "Duyệt xác minh" : "Review Verifications"}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/admin/sync">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {isVi ? "Đồng bộ OpenAlex" : "Sync OpenAlex"}
            </Link>
          </Button>
        </div>
      </header>

      {/* Partial Failure Notice (honest reporting — never coerce failed queries into 0) */}
      {data?.unavailableSections && data.unavailableSections.length > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              {isVi ? "Một số nguồn dữ liệu tạm thời không truy vấn được" : "Some telemetry sections could not be queried"}
            </p>
            <p className="mt-0.5 opacity-90">
              {isVi ? "Các mục bị ảnh hưởng được đánh dấu Không rõ thay vì hiển thị 0: " : "Affected sections are marked Unavailable instead of zero: "}
              <span className="font-mono">{data.unavailableSections.join(", ")}</span>
            </p>
          </div>
        </div>
      ) : null}

      {/* Section A: Attention Required */}
      <section aria-labelledby="attention-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="attention-heading" className="text-sm font-bold tracking-tight text-foreground">
            {isVi ? "A. Hạng mục cần xử lý" : "A. Attention Required"}
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {isVi ? "Bấm vào từng hạng mục để mở hàng đợi đã lọc" : "Click any queue to open its filtered workspace"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {attentionItems.map(({ key, label, count, to, icon: Icon }) => {
            const isUnavailable = !isLoading && count === null;
            const hasAttention = typeof count === "number" && count > 0;
            return (
              <Link
                key={key}
                to={to}
                className={cn(
                  "group flex items-center justify-between rounded-xl border bg-card px-4 py-3.5 transition-colors hover:bg-muted/40",
                  hasAttention && "border-amber-500/35 bg-amber-500/[0.03]",
                  isUnavailable && "border-dashed border-border",
                )}
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
                  <div className="text-xl font-bold tabular-nums text-foreground">
                    {isLoading ? (
                      <Skeleton className="h-6 w-12" />
                    ) : isUnavailable ? (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {isVi ? "Không khả dụng" : "Unavailable"}
                      </span>
                    ) : (
                      <span className={cn(hasAttention ? "text-amber-700 dark:text-amber-300" : "text-foreground")}>
                        {formatNumber(count)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border",
                      hasAttention
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Section B: Platform Overview */}
      <section aria-labelledby="overview-heading" className="space-y-3">
        <h2 id="overview-heading" className="text-sm font-bold tracking-tight text-foreground">
          {isVi ? "B. Tổng quan nền tảng" : "B. Platform Overview"}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Users */}
          <Link to="/admin/users" className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>{isVi ? "Tài khoản người dùng" : "User Accounts"}</span>
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {isLoading ? <Skeleton className="h-7 w-16" /> : fmtCount(data?.users.total, isVi)}
            </div>
            {data ? (
              <div className="space-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                <p>
                  {isVi ? "Trạng thái: " : "Status: "}
                  <span className="font-medium text-foreground">{formatNumber(data.users.byStatus.ACTIVE)}</span> {isVi ? "hoạt động" : "active"}
                  {" · "}
                  <span>{formatNumber(data.users.byStatus.SUSPENDED)}</span> {isVi ? "tạm khóa" : "suspended"}
                  {" · "}
                  <span>{formatNumber(data.users.byStatus.DISABLED)}</span> {isVi ? "vô hiệu" : "disabled"}
                </p>
                <p>
                  {isVi ? "Vai trò học thuật: " : "Academic: "}
                  {formatNumber(data.users.byAcademicRole.STUDENT)} {isVi ? "SV" : "students"} · {formatNumber(data.users.byAcademicRole.LECTURER)} {isVi ? "GV" : "lecturers"} · {formatNumber(data.users.byAcademicRole.RESEARCHER)} {isVi ? "NCV" : "researchers"}
                </p>
              </div>
            ) : null}
          </Link>

          {/* Projects (Active vs Total clearly separated) */}
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>{isVi ? "Dự án nghiên cứu" : "Research Projects"}</span>
              <FolderGit2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {isLoading ? <Skeleton className="h-7 w-14" /> : fmtCount(data?.projects?.active, isVi)}
              </span>
              <span className="text-xs text-muted-foreground">
                {isVi ? "đang hoạt động (ACTIVE)" : "active (ACTIVE)"}
              </span>
            </div>
            {data?.projects ? (
              <div className="space-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                <p>
                  {isVi ? "Tổng dự án chưa xóa: " : "Total non-deleted: "}
                  <strong className="text-foreground">{formatNumber(data.projects.total)}</strong>
                </p>
                <p>
                  {formatNumber(data.projects.planning)} {isVi ? "lập kế hoạch" : "planning"} · {formatNumber(data.projects.completed)} {isVi ? "hoàn tất" : "completed"} · {formatNumber(data.projects.archived)} {isVi ? "lưu trữ" : "archived"}
                </p>
              </div>
            ) : (
              <p className="border-t pt-2 text-[11px] text-muted-foreground">
                {isVi ? "Chưa có dữ liệu trạng thái dự án." : "Project breakdown unavailable."}
              </p>
            )}
          </div>

          {/* Mentorship & Communities */}
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>{isVi ? "Cố vấn & Cộng đồng" : "Mentorship & Communities"}</span>
              <GraduationCap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {isLoading ? <Skeleton className="h-7 w-14" /> : fmtCount(data?.mentorships?.activeRelationships, isVi)}
              </span>
              <span className="text-xs text-muted-foreground">
                {isVi ? "quan hệ hướng dẫn hoạt động" : "active mentorships"}
              </span>
            </div>
            <div className="space-y-1 border-t pt-2 text-[11px] text-muted-foreground">
              <p>
                {isVi ? "Đề nghị/lời mời đang chờ: " : "Pending requests: "}
                <strong className="text-foreground">{fmtCount(data?.mentorships?.pendingRequests, isVi)}</strong>
              </p>
              <p>
                <Link to="/admin/community" className="text-primary hover:underline">
                  {isVi ? "Cộng đồng hoạt động: " : "Active communities: "}
                  <strong>{fmtCount(data?.communities, isVi)}</strong>
                </Link>
              </p>
            </div>
          </div>

          {/* AI Runs vs Generated Outputs (strictly separated, never summed) */}
          <Link to="/admin/ai-jobs" className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>{isVi ? "Tác vụ AI & Đầu ra nghiên cứu" : "AI Runs & Research Outputs"}</span>
              <Cpu className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden="true" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {isLoading ? <Skeleton className="h-7 w-14" /> : fmtCount(data?.aiOperations?.totalAiRuns, isVi)}
              </span>
              <span className="text-xs text-muted-foreground">AI runs</span>
            </div>
            {data?.aiOperations ? (
              <div className="space-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                <p>
                  {isVi ? "Báo cáo: " : "Reports: "}
                  <strong className="text-foreground">{formatNumber(data.aiOperations.totalReports)}</strong> ({formatNumber(data.aiOperations.readyReports)} {isVi ? "xong" : "ready"})
                </p>
                <p>
                  {isVi ? "Khoảng trống NC: " : "Research gaps: "}
                  <strong className="text-foreground">{formatNumber(data.aiOperations.totalResearchGaps)}</strong> ({formatNumber(data.aiOperations.validatedResearchGaps)} {isVi ? "đã kiểm chứng" : "validated"})
                </p>
              </div>
            ) : null}
          </Link>
        </div>
      </section>

      {/* Main Two-Column Operational Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 cols: Operational Health + Corpus Readiness */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section C: Operational Health */}
          <section aria-labelledby="health-heading" className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h2 id="health-heading" className="text-sm font-bold text-foreground">
                  {isVi ? "C. Tình trạng phụ thuộc hệ thống" : "C. Operational Health"}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {data?.systemHealth ? <AdminStatusBadge status={data.systemHealth.overall} /> : null}
                <Link to="/admin/workers" className="text-xs font-semibold text-primary hover:underline">
                  {isVi ? "Xem Workers" : "View Workers"}
                </Link>
              </div>
            </div>

            {isLoading || !deps ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
                <DependencyRow
                  title="API"
                  status={deps.api.status}
                  detail={deps.api.detail ?? (isVi ? "Phản hồi bình thường" : "Responding")}
                />
                <DependencyRow
                  title="PostgreSQL"
                  status={deps.database.status}
                  detail={deps.database.latencyMs !== null && deps.database.latencyMs !== undefined
                    ? `${deps.database.latencyMs} ms`
                    : (deps.database.detail ?? "—")}
                />
                <DependencyRow
                  title="Redis / BullMQ"
                  status={deps.redis.status}
                  detail={deps.redis.status === "healthy" && deps.redis.latencyMs !== null && deps.redis.latencyMs !== undefined
                    ? `${deps.redis.latencyMs} ms`
                    : (deps.redis.detail ?? "—")}
                />
                <DependencyRow
                  title={isVi ? "Đội ngũ Worker" : "Worker Fleet"}
                  status={deps.workers.status}
                  detail={deps.workers.detail ?? `${deps.workers.alive}/${deps.workers.expected} alive`}
                />
                <DependencyRow
                  title={isVi ? "Kết nối AI sinh nội dung" : "AI Generation Provider"}
                  status={deps.aiProvider.status}
                  detail={deps.aiProvider.name
                    ? `${deps.aiProvider.name} · ${deps.aiProvider.fastModel ?? "—"}`
                    : (isVi ? "Chưa cấu hình" : "Not configured")}
                />
                <DependencyRow
                  title={isVi ? "Kết nối Embedding" : "Embedding Provider"}
                  status={deps.embeddingProvider.status}
                  detail={deps.embeddingProvider.name
                    ? `${deps.embeddingProvider.name} · ${deps.embeddingProvider.model ?? "—"} (${deps.embeddingProvider.dimensions ?? "—"}d)`
                    : (isVi ? "Chưa cấu hình" : "Not configured")}
                />
              </div>
            )}
          </section>

          {/* Section D: Research Data Readiness */}
          <section aria-labelledby="corpus-heading" className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <h2 id="corpus-heading" className="text-sm font-bold text-foreground">
                  {isVi ? "D. Mức độ sẵn sàng dữ liệu Corpus" : "D. Research Data Readiness"}
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <Link to="/admin/corpus-validation" className="font-semibold text-primary hover:underline">
                  {isVi ? "Kiểm định Corpus" : "Validation"}
                </Link>
                <Link to="/admin/pipeline" className="font-semibold text-primary hover:underline">
                  Pipeline
                </Link>
              </div>
            </div>

            {isLoading ? (
              <Skeleton className="h-32 w-full rounded-lg" />
            ) : data?.corpus ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                  <div className="rounded-lg border bg-muted/25 p-3">
                    <span className="text-[11px] text-muted-foreground">{isVi ? "Tổng bài báo" : "Total corpus"}</span>
                    <p className="mt-1 text-lg font-bold tabular-nums font-mono">{formatNumber(data.corpus.totalPapers)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/25 p-3">
                    <span className="text-[11px] text-muted-foreground">{isVi ? "Đủ điều kiện phân tích" : "Analyzable"}</span>
                    <p className="mt-1 text-lg font-bold tabular-nums font-mono">{formatNumber(data.corpus.analyzablePapers)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/25 p-3">
                    <span className="text-[11px] text-muted-foreground">{isVi ? "Lượt đồng bộ" : "Sync runs"}</span>
                    <p className="mt-1 text-lg font-bold tabular-nums font-mono">{formatNumber(data.sync.totalRuns)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/25 p-3">
                    <span className="text-[11px] text-muted-foreground">{isVi ? "Đồng bộ lỗi" : "Failed syncs"}</span>
                    <p className={cn("mt-1 text-lg font-bold tabular-nums font-mono", data.sync.failedRuns > 0 && "text-rose-600 dark:text-rose-400")}>
                      {formatNumber(data.sync.failedRuns)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <CoverageBar
                    label={isVi ? "Độ phủ Vector Embeddings (trên bài đủ điều kiện phân tích)" : "Embedding Coverage (of analyzable papers)"}
                    numerator={data.corpus.embeddedPapers}
                    denominator={data.corpus.analyzablePapers}
                    pct={data.corpus.embeddingCoveragePct}
                  />
                  <CoverageBar
                    label={isVi ? "Độ phủ Phân tích AI có cấu trúc (trên bài đủ điều kiện)" : "Structured AI Analysis Coverage (of analyzable papers)"}
                    numerator={data.corpus.aiAnalyzedPapers}
                    denominator={data.corpus.analyzablePapers}
                    pct={data.corpus.aiAnalysisCoveragePct}
                  />
                </div>

                {data.sync.latestRun ? (
                  <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {isVi ? "Lượt đồng bộ OpenAlex gần nhất" : "Latest OpenAlex Sync Run"}
                      </span>
                      <AdminStatusBadge status={data.sync.latestRun.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{isVi ? "Truy vấn:" : "Query:"} <strong className="text-foreground">{data.sync.latestRun.searchText || "—"}</strong></span>
                      <span>{isVi ? "Thêm mới:" : "Inserted:"} <strong className="text-foreground">{formatNumber(data.sync.latestRun.totalInserted)}</strong></span>
                      <span>{isVi ? "Bắt đầu:" : "Started:"} {new Date(data.sync.latestRun.startedAt).toLocaleString(isVi ? "vi-VN" : "en-US")}</span>
                    </div>
                    {data.sync.latestRun.errorMessage ? (
                      <p className="text-[11px] text-rose-700 dark:text-rose-300 font-mono truncate" title={data.sync.latestRun.errorMessage}>
                        {data.sync.latestRun.errorMessage}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isVi ? "Chưa có dữ liệu sẵn sàng từ pipeline." : "Pipeline corpus telemetry is currently unavailable."}
              </p>
            )}
          </section>
        </div>

        {/* Right 5 cols: Recent Admin Activity + AI vs Human Agreement */}
        <div className="lg:col-span-5 space-y-6">
          {/* Section E: Recent Administrative Activity */}
          <section aria-labelledby="activity-heading" className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h2 id="activity-heading" className="text-sm font-bold text-foreground">
                  {isVi ? "E. Hoạt động quản trị gần đây" : "E. Recent Administrative Activity"}
                </h2>
              </div>
              <Link to="/admin/audit-logs" className="text-xs font-semibold text-primary hover:underline">
                {isVi ? "Xem toàn bộ nhật ký" : "Full Audit Trail"}
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : data?.recentActivity && data.recentActivity.length > 0 ? (
              <ul className="divide-y divide-border/70">
                {data.recentActivity.slice(0, 6).map((log) => (
                  <li key={log.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0 text-xs">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Zap className="h-3 w-3" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11.5px] font-semibold text-foreground">{log.actionName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {log.user?.fullName ?? (isVi ? "Hệ thống" : "System")}
                        {log.targetTableName ? ` · ${log.targetTableName}` : ""}
                        {" · "}
                        {new Date(log.createdAt).toLocaleString(isVi ? "vi-VN" : "en-US")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {isVi ? "Chưa ghi nhận sự kiện quản trị nào gần đây." : "No recent administrative audit events recorded."}
              </p>
            )}
          </section>

          {/* AI vs Human Agreement Calibration (with honest scientific boundary) */}
          <section aria-labelledby="agreement-heading" className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <h2 id="agreement-heading" className="text-sm font-bold text-foreground">
                  {isVi ? "Đối chiếu đánh giá AI và Người dùng" : "AI vs Human Rating Agreement"}
                </h2>
              </div>
              <Link to="/admin/evaluation" className="text-xs font-semibold text-primary hover:underline">
                {isVi ? "Chi tiết đánh giá" : "Evaluation"}
              </Link>
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              {isVi
                ? "Chỉ số tương đồng giữa điểm AI và đánh giá từ nhà nghiên cứu trên mẫu hiện có. Mức tương đồng cao không đồng nghĩa với bảo chứng giá trị khoa học."
                : "Measures agreement between AI scores and researcher ratings on available samples. Agreement alone does not establish scientific validity."}
            </p>
            {agreementError ? (
              <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">
                {isVi ? "Không tải được dữ liệu đối chiếu đánh giá." : "Could not load rating agreement data."}
              </p>
            ) : !agreement || agreement.sampleSize === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                {isVi
                  ? "Chưa có mẫu đánh giá đối chiếu giữa AI và người dùng."
                  : "No paired AI and human evaluation samples available yet."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-[10px] font-bold uppercase text-muted-foreground">
                      <th className="pb-2">{isVi ? "Loại" : "Scope"}</th>
                      <th className="pb-2 text-right">{isVi ? "Mẫu (n)" : "Samples"}</th>
                      <th className="pb-2 text-right">MAE</th>
                      <th className="pb-2 text-right">{isVi ? "Trong ±1" : "Within ±1"}</th>
                      <th className="pb-2 text-right">r</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {agreementRows.map(({ label, b }) => (
                      <tr key={label}>
                        <td className="py-2 font-medium text-foreground">{label}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{b.sampleSize}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{b.mae.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{b.withinOnePct}%</td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {b.correlation === null ? "—" : b.correlation.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Quick Corpus Link */}
          <section className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <BookOpen className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{isVi ? "Bài báo trong Corpus" : "Papers in Corpus"}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {isVi ? "Quản lý yêu cầu bài báo, trạng thái PDF và phê duyệt." : "Manage bibliographic records, PDFs, and approval requests."}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to="/admin/papers">{isVi ? "Mở" : "Open"}</Link>
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}

function DependencyRow({ title, status, detail }: { title: string; status: string; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border bg-muted/20 p-3">
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold text-foreground truncate">{title}</p>
        <p className="text-[11px] text-muted-foreground truncate" title={detail}>{detail}</p>
      </div>
      <AdminStatusBadge status={status} className="shrink-0" />
    </div>
  );
}

function CoverageBar({
  label,
  numerator,
  denominator,
  pct,
}: {
  label: string;
  numerator: number;
  denominator: number;
  pct: number;
}) {
  const safePct = Math.min(100, Math.max(0, pct));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
          {formatNumber(numerator)} / {formatNumber(denominator)} ({safePct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${safePct}%` }} />
      </div>
    </div>
  );
}
