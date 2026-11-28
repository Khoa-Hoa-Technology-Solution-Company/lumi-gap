import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  Database,
  HardDrive,
  Info,
  Layers,
  Play,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { isAdminSystemRole } from "@trend/shared-types";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminEmptyPanel,
  AdminErrorPanel,
  AdminStatusBadge,
  useEmbedStatus,
  useOpenAlexCampaigns,
  useTriggerEmbedding,
} from "@/features/admin";
import { CorpusValidationPanel } from "@/features/admin/components/corpus-validation-panel";
import { usePipelineStatus } from "@/features/admin/hooks/use-pipeline-status";
import { useCurrentUser } from "@/features/auth";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";

export function AdminCorpusValidationPage() {
  const { language } = useI18n();
  const isVi = language === "vi";
  const { data: me } = useCurrentUser();
  const isAdmin = isAdminSystemRole(me?.user?.systemRole);

  const {
    data: embedStatus,
    isLoading: embedLoading,
    isError: embedError,
    refetch: refetchEmbed,
    isFetching: embedFetching,
  } = useEmbedStatus(isAdmin);

  const {
    data: campaigns,
    isLoading: campaignsLoading,
    isError: campaignsError,
    refetch: refetchCampaigns,
    isFetching: campaignsFetching,
  } = useOpenAlexCampaigns(isAdmin);

  const { data: pipelineStatus } = usePipelineStatus(isAdmin);
  const embedMutation = useTriggerEmbedding();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (!campaigns || campaigns.length === 0) return;
    if (selectedCampaignId && campaigns.some((c) => c._id === selectedCampaignId)) return;
    const preferred = campaigns.find((c) => c.state === "running") ?? campaigns[0];
    setSelectedCampaignId(preferred?._id ?? null);
  }, [campaigns, selectedCampaignId]);

  const selectedCampaign = campaigns?.find((c) => c._id === selectedCampaignId) ?? null;

  const ingestWorkerHeartbeat = pipelineStatus?.workers?.heartbeats.find((w) => w.workerName === "openalex-ingest");
  const workerStatus: "alive" | "stale" | "missing" = ingestWorkerHeartbeat?.status ?? "missing";

  const progress =
    embedStatus && embedStatus.totalPapers > 0
      ? Math.round((embedStatus.embeddedPapers / embedStatus.totalPapers) * 1000) / 10
      : null;

  const handleTriggerEmbedding = async () => {
    try {
      const res = await embedMutation.mutateAsync();
      toast.success(
        isVi
          ? `Đã đưa tác vụ tạo vector vào hàng đợi (Job #${res.jobId}).`
          : `Batch embedding queued (Job #${res.jobId}).`,
      );
    } catch {
      toast.error(isVi ? "Không thể kích hoạt tạo vector embedding." : "Failed to trigger batch embedding.");
    }
  };

  return (
    <main className="space-y-6">
      <PageHeader
        title={isVi ? "Kiểm định kho dữ liệu & Vector Index" : "Corpus Validation & Vector Index"}
        description={
          isVi
            ? "Phân tách rõ giữa độ phủ vector embedding và kết quả kiểm định chất lượng kho dữ liệu OpenAlex."
            : "Separates vector embedding indexing coverage from campaign-level OpenAlex corpus quality validation."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchEmbed();
                void refetchCampaigns();
              }}
              disabled={embedFetching || campaignsFetching}
              className="gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", (embedFetching || campaignsFetching) && "animate-spin")} />
              {isVi ? "Làm mới" : "Refresh"}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleTriggerEmbedding()}
              disabled={embedMutation.isPending}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              {embedMutation.isPending
                ? isVi ? "Đang đưa vào hàng đợi…" : "Queuing…"
                : isVi ? "Chạy batch embedding" : "Trigger Batch Embedding"}
            </Button>
          </div>
        }
      />

      <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/25 bg-blue-500/5 px-4 py-3 text-xs text-blue-900 dark:text-blue-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <p>
          {isVi
            ? "Lưu ý định nghĩa: Độ phủ embedding chỉ đo tỷ lệ bài báo đã có vector tìm kiếm ngữ nghĩa (embedded / tổng số bài), KHÔNG thay thế kết quả kiểm định chất lượng chiến dịch (Corpus Validation) ở phần bên dưới."
            : "Metric definition: Embedding coverage tracks semantic vector indexing progress (embedded / total papers) and does NOT equate to campaign-level corpus validation shown below."}
        </p>
      </div>

      {/* Section 1: Embedding Index Coverage */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity className="h-4 w-4 text-primary" />
            {isVi ? "Độ phủ Vector Embedding" : "Vector Embedding Coverage"}
          </h2>
          {embedStatus?.isEmbeddingActive ? (
            <AdminStatusBadge status="running" label={isVi ? "Đang tạo vector" : "Embedding active"} />
          ) : null}
        </div>

        {embedError ? (
          <AdminErrorPanel
            title={isVi ? "Không thể tải trạng thái embedding" : "Unable to load embedding status"}
            onRetry={() => void refetchEmbed()}
            retrying={embedFetching}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{isVi ? "Tỷ lệ đã tạo vector" : "Embedded Ratio"}</span>
                  <Database className="h-4 w-4 text-blue-600" />
                </div>
                {embedLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="font-mono text-3xl font-bold tabular-nums text-foreground">
                    {progress !== null ? `${progress}%` : "—"}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {isVi ? "Trên tổng số bài báo trong chỉ mục" : "Share of total indexed papers with vectors"}
                </p>
              </div>

              <div className="space-y-1.5 rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{isVi ? "Chờ tạo vector" : "Pending Embedding"}</span>
                  <Layers className="h-4 w-4 text-amber-500" />
                </div>
                {embedLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="font-mono text-3xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {embedStatus ? formatNumber(embedStatus.pendingPapers) : "—"}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {isVi ? "Bài báo chưa có vector biểu diễn" : "Papers not yet indexed with embeddings"}
                </p>
              </div>

              <div className="space-y-1.5 rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{isVi ? "Tổng số bài báo" : "Total Indexed Papers"}</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                {embedLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="font-mono text-3xl font-bold tabular-nums text-foreground">
                    {embedStatus ? formatNumber(embedStatus.totalPapers) : "—"}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {isVi ? "Tổng mẫu số trong bảng papers" : "Total denominator in the papers index"}
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border bg-card p-5">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${progress ?? 0}%` }}
                />
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                <span>
                  {embedStatus ? formatNumber(embedStatus.embeddedPapers) : "—"}{" "}
                  {isVi ? "bài đã tạo vector" : "embedded papers"}
                </span>
                <span>
                  {embedStatus ? formatNumber(embedStatus.totalPapers) : "—"}{" "}
                  {isVi ? "tổng số bài trong kho" : "total corpus papers"}
                </span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Section 2: OpenAlex Campaigns & Real Corpus Validation Panel */}
      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HardDrive className="h-4 w-4 text-indigo-600" />
            {isVi ? "Chiến dịch OpenAlex & Kiểm định chất lượng kho" : "OpenAlex Campaigns & Corpus Validation"}
          </h2>
          <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
            <Link to="/admin/sync">
              {isVi ? "Quản lý đồng bộ & chiến dịch" : "Manage sync & campaigns"}
            </Link>
          </Button>
        </div>

        {campaignsError ? (
          <AdminErrorPanel
            title={isVi ? "Không thể tải danh sách chiến dịch OpenAlex" : "Unable to load OpenAlex campaigns"}
            onRetry={() => void refetchCampaigns()}
            retrying={campaignsFetching}
          />
        ) : campaignsLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : !campaigns || campaigns.length === 0 ? (
          <AdminEmptyPanel
            title={isVi ? "Chưa có chiến dịch nạp dữ liệu OpenAlex nào" : "No OpenAlex ingest campaigns found"}
            description={
              isVi
                ? "Tạo hoặc khởi chạy một chiến dịch nạp dữ liệu OpenAlex tại trang Đồng bộ để thực hiện kiểm định kho dữ liệu."
                : "Create or start an OpenAlex campaign on the Sync page to run corpus validation checks."
            }
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3 text-xs font-semibold text-muted-foreground">
                {isVi ? `Danh sách chiến dịch (${campaigns.length})` : `Campaigns (${campaigns.length})`}
              </div>
              <div className="divide-y">
                {campaigns.map((campaign) => {
                  const active = campaign._id === selectedCampaign?._id;
                  return (
                    <button
                      key={campaign._id}
                      type="button"
                      onClick={() => setSelectedCampaignId(campaign._id)}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 px-4 py-3 text-left text-xs transition-colors",
                        active ? "bg-primary/5" : "hover:bg-muted/40",
                      )}
                    >
                      <div className="min-w-0">
                        <div className={cn("truncate font-semibold", active ? "text-primary" : "text-foreground")}>
                          {campaign.campaignKey}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {campaign.campaignKind} · {formatNumber(campaign.progress.uniqueWorks)}/
                          {formatNumber(campaign.targetUniqueWorks)}
                        </div>
                      </div>
                      <AdminStatusBadge status={campaign.state} showIcon={false} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              {selectedCampaign ? (
                <CorpusValidationPanel
                  campaignId={selectedCampaign._id}
                  campaignKey={selectedCampaign.campaignKey}
                  workerStatus={workerStatus}
                />
              ) : null}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
