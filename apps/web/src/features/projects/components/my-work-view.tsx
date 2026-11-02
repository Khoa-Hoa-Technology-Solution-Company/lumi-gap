import { useState, useEffect } from "react";
import {
  Clock,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Target,
  FileText,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  ChevronRight,
  Search,
  ExternalLink,
  Settings2,
  Check,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import { useResearchResource } from "../hooks/use-project-research";
import { screeningApi } from "../api/screening.api";
import { useScreeningCommand, ScreeningError, classificationLabels } from "./screening-common";
import { caseStatusLabels } from "./screening-case-labels";
import { WorkspaceLoading } from "./workspace-common";
import { ScreeningAdjudicationDialog } from "./screening-adjudication";
import { Button } from "@/components/ui/button";

function renderBallotBadge(decision: string) {
  if (decision === "INCLUDE" || decision === "INCLUDED") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
        Phù hợp
      </span>
    );
  }
  if (decision === "EXCLUDE" || decision === "EXCLUDED") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
        Không phù hợp
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
      Chưa chắc chắn
    </span>
  );
}

function renderFinalDecisionBadge(decision: string) {
  if (decision === "INCLUDE" || decision === "INCLUDED") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
        <CheckCircle2 size={12} /> Đã đưa vào (Phù hợp)
      </span>
    );
  }
  if (decision === "EXCLUDE" || decision === "EXCLUDED") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200">
        Đã loại (Không phù hợp)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
      {decision}
    </span>
  );
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function MyWorkView({
  projectId,
  readOnly,
  canManage,
  onOpenPaper,
  onSwitchView,
  onAddPaper,
}: {
  projectId: string;
  readOnly: boolean;
  canManage?: boolean;
  onOpenPaper: (paperId: string) => void;
  onSwitchView: (view: string) => void;
  onAddPaper?: () => void;
}) {
  const summaryQuery = useResearchResource(projectId, ["screening-workspace-summary"], () =>
    screeningApi.workspaceSummary(projectId), true, data => Boolean(data?.myTrackedDisputes?.some(item => item.needsMyStatement)), 30000
  );
  const command = useScreeningCommand(projectId);
  const summary = summaryQuery.data;

  // Discovery goal edit modal state
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalTarget, setGoalTarget] = useState(2);
  const [goalPeriod, setGoalPeriod] = useState<"WEEK" | "MONTH">("WEEK");
  const [goalEnabled, setGoalEnabled] = useState(false);

  // Adjudication popup modal state
  const [adjudicationModalRoundId, setAdjudicationModalRoundId] = useState<string | null>(null);

  // Work filter & search state
  type WorkViewFilter = "ALL" | "REVIEWING" | "ACTION_NEEDED" | "DISPUTES" | "COMPLETED" | "ADJUDICATED";
  const [activeFilter, setActiveFilter] = useState<WorkViewFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (summary?.discoveryGoal) {
      setGoalEnabled(summary.discoveryGoal.enabled);
      setGoalTarget(summary.discoveryGoal.target);
      setGoalPeriod((summary.discoveryGoal.period as "WEEK" | "MONTH") || "WEEK");
    }
  }, [summary?.discoveryGoal]);

  const handleClaimNext = async () => {
    try {
      let claimPaperId: string | null = null;
      const ok = await command.run({}, async () => {
        const res = (await screeningApi.claimNext(projectId)) as { paperId?: string | null } | null;
        claimPaperId = res?.paperId ?? null;
        return res;
      });

      if (ok && claimPaperId) {
        toast.success("Đã nhận bài thành công! Giữ suất đánh giá trong 24 giờ.");
        onOpenPaper(claimPaperId);
      } else if (ok) {
        toast.info("Không có bài báo nào đủ điều kiện trong hàng đợi hiện tại.");
      }
    } catch {
      toast.error("Không thể nhận bài. Vui lòng thử lại.");
    }
  };

  const handleExtend = async (roundId: string) => {
    try {
      await command.run({}, async () => {
        return await screeningApi.extend(projectId, roundId);
      });
      toast.success("Đã gia hạn thêm 24 giờ giữ suất đánh giá.");
      void summaryQuery.refetch();
    } catch {
      toast.error("Không thể gia hạn suất đánh giá.");
    }
  };

  const handleRelease = async (roundId: string) => {
    if (!window.confirm("Bạn có chắc muốn trả bài báo này lại hàng đợi để thành viên khác đánh giá?")) {
      return;
    }
    try {
      await command.run({}, async () => {
        return await screeningApi.release(projectId, roundId);
      });
      toast.success("Đã trả bài lại hàng đợi thành công.");
      void summaryQuery.refetch();
    } catch {
      toast.error("Không thể trả bài lại hàng đợi.");
    }
  };

  const handleSaveGoal = async () => {
    try {
      await command.run({}, async () => {
        return await screeningApi.updateDiscoveryGoal(projectId, {
          enabled: goalEnabled,
          target: goalTarget,
          period: goalPeriod,
          paused: false,
        });
      });
      toast.success("Đã cập nhật mục tiêu tìm kiếm tài liệu!");
      setGoalModalOpen(false);
      void summaryQuery.refetch();
    } catch {
      toast.error("Không thể lưu mục tiêu.");
    }
  };

  if (summaryQuery.isLoading) {
    return <WorkspaceLoading />;
  }

  if (summaryQuery.isError) {
    return <ScreeningError error={summaryQuery.error} retry={() => void summaryQuery.refetch()} />;
  }

  if (!summary) return null;

  const discussions = (summary.pendingDiscussions ?? []).filter(
    p => !summary.pendingConsensus.some(c => c.roundId === p.roundId) && !summary.pendingAdjudications.some(a => a.roundId === p.roundId) && !summary.myTrackedDisputes?.some(t => t.roundId === p.roundId && t.caseStatus)
  );
  const trackedDisputes = (summary.myTrackedDisputes ?? []).filter(
    t => !discussions.some(d => d.roundId === t.roundId)
  );
  const completedEvaluations = summary.myCompletedEvaluations ?? [];
  const statementTasks = trackedDisputes.filter(item => item.needsMyStatement && !readOnly)
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));

  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = (title?: string) => !q || (title?.toLowerCase().includes(q) ?? false);

  const filteredClaims = summary.myActiveClaims.filter(c => matchesSearch(c.title));
  const filteredConsensus = summary.pendingConsensus.filter(c => matchesSearch(c.title));
  const filteredDiscussions = discussions.filter(d => matchesSearch(d.title));
  const filteredAdjudications = summary.pendingAdjudications.filter(a => matchesSearch(a.title));
  const filteredDisputes = [...trackedDisputes].sort((a, b) => Number(Boolean(b.needsMyStatement)) - Number(Boolean(a.needsMyStatement)))
    .filter(t => matchesSearch(t.title) && (activeFilter !== "ACTION_NEEDED" || t.needsMyStatement && !readOnly));
  const filteredCompleted = completedEvaluations.filter(e => {
    if (!matchesSearch(e.title)) return false;
    if (activeFilter === "ADJUDICATED") return Boolean(e.isAdjudicated || e.resolverName);
    return true;
  });

  const claimsCount = summary.myActiveClaims.length;
  const actionNeededCount = summary.pendingConsensus.length + discussions.length + summary.pendingAdjudications.length + statementTasks.length;
  const disputesCount = trackedDisputes.length;
  const completedCount = completedEvaluations.length;
  const adjudicatedCount = completedEvaluations.filter(e => e.isAdjudicated || Boolean(e.resolverName)).length;
  const totalCount = claimsCount + actionNeededCount - statementTasks.length + disputesCount + completedCount;

  const showClaims = (activeFilter === "ALL" || activeFilter === "REVIEWING");
  const showActionNeeded = (activeFilter === "ALL" || activeFilter === "ACTION_NEEDED");
  const showDisputes = (activeFilter === "ALL" || activeFilter === "DISPUTES" || activeFilter === "ACTION_NEEDED");
  const showCompleted = (activeFilter === "ALL" || activeFilter === "COMPLETED" || activeFilter === "ADJUDICATED");

  const visibleItemsCount =
    (showClaims ? filteredClaims.length : 0) +
    (showActionNeeded ? (filteredConsensus.length + filteredDiscussions.length + filteredAdjudications.length) : 0) +
    (showDisputes ? filteredDisputes.length : 0) +
    (showCompleted ? filteredCompleted.length : 0);

  return (
    <div className="my-work-dashboard">
      {statementTasks[0] && <section aria-label="Ý kiến phân xử cần gửi" role="status" className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold">Bạn chưa gửi ý kiến cho {statementTasks.length} hồ sơ phân xử</h3>
            <p className="line-clamp-2 break-words text-sm">{statementTasks[0].title}</p>
            <p className="text-xs">{statementTasks[0].deadline && <>Hạn gửi: {new Date(statementTasks[0].deadline).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}. </>}Gửi ý kiến của bạn để hồ sơ sớm được phân xử.</p>
          </div>
        </div>
        <Button className="shrink-0 self-start sm:self-center" size="sm" onClick={() => setAdjudicationModalRoundId(statementTasks[0]!.roundId)}>Nhập ý kiến ngay<ArrowRight size={14} className="ml-1.5" aria-hidden="true" /></Button>
      </section>}
      {/* 1. Contextual Advice & Capacity Banner */}
      <div className={`my-work-advice-banner status-${summary.capacityAdvice.queueStatus.toLowerCase()}`}>
        <div className="advice-banner-left">
          {summary.capacityAdvice.queueStatus === "EMPTY_LIBRARY" ? (
            <BookOpen size={20} className="text-primary shrink-0" />
          ) : summary.capacityAdvice.queueStatus === "EMPTY_QUEUE" ? (
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          ) : summary.capacityAdvice.queueStatus === "HIGH_BACKLOG" ? (
            <Clock size={20} className="text-amber-500 shrink-0" />
          ) : (
            <Sparkles size={20} className="text-primary shrink-0" />
          )}
          <div className="advice-banner-text">
            <h4 className="advice-banner-title">
              {summary.capacityAdvice.queueStatus === "EMPTY_LIBRARY"
                ? "Thư viện dự án đang trống"
                : summary.capacityAdvice.queueStatus === "EMPTY_QUEUE"
                  ? "Hàng đợi sàng lọc hoàn tất"
                  : summary.capacityAdvice.queueStatus === "HIGH_BACKLOG"
                    ? "Hàng đợi cần xử lý tập trung"
                    : "Tiến độ sàng lọc đều đặn"}
            </h4>
            <p className="advice-banner-desc">{summary.capacityAdvice.message}</p>
          </div>
        </div>
        <div className="advice-banner-right">
          {summary.capacityAdvice.suggestedAction === "DISCOVER_MORE" && (
            summary.capacityAdvice.queueStatus === "EMPTY_QUEUE" ? (
              <Button size="sm" onClick={() => onSwitchView("library")} className="advice-action-btn">
                Mở Thư viện
                <ArrowRight size={14} className="ml-1.5" />
              </Button>
            ) : onAddPaper && !readOnly ? (
              <Button size="sm" onClick={onAddPaper} className="advice-action-btn">
                <Search size={14} className="mr-1.5" />
                Tìm tài liệu mới
              </Button>
            ) : null
          )}
          {summary.capacityAdvice.suggestedAction === "REVIEW_QUEUE" && (
            <Button size="sm" variant="default" onClick={() => onSwitchView("queue")} className="advice-action-btn">
              Xem hàng đợi ({summary.eligibleQueueCount})
              <ArrowRight size={14} className="ml-1.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="my-work-grid">
        {/* Main Column */}
        <div className="my-work-main-column">
          {/* Work Status Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-border/60">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Bộ lọc công việc">
              <button
                type="button"
                onClick={() => setActiveFilter("ALL")}
                className={`h-7.5 px-3 rounded-full text-xs font-semibold transition-all border ${activeFilter === "ALL"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  }`}
              >
                Tất cả ({totalCount})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("REVIEWING")}
                className={`h-7.5 px-3 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5 ${activeFilter === "REVIEWING"
                  ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                  : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  }`}
              >
                <Clock size={12} />
                Đang đánh giá ({claimsCount})
              </button>

              {actionNeededCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveFilter("ACTION_NEEDED")}
                  className={`h-7.5 px-3 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5 ${activeFilter === "ACTION_NEEDED"
                    ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                    : "bg-card text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/50 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                    }`}
                >
                  <AlertCircle size={12} />
                  Cần giải quyết ({actionNeededCount})
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveFilter("DISPUTES")}
                className={`h-7.5 px-3 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5 ${activeFilter === "DISPUTES"
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                  : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  }`}
              >
                <Scale size={12} />
                Đang theo dõi phân xử & bất đồng ({disputesCount})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("COMPLETED")}
                className={`h-7.5 px-3 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5 ${activeFilter === "COMPLETED"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  }`}
              >
                <CheckCircle2 size={12} />
                Đã hoàn thành đánh giá ({completedCount})
              </button>

              {adjudicatedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveFilter("ADJUDICATED")}
                  className={`h-7.5 px-3 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5 ${activeFilter === "ADJUDICATED"
                    ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                    : "bg-card text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-800/50 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                    }`}
                >
                  <Scale size={12} />
                  Đã qua phân xử ({adjudicatedCount})
                </button>
              )}
            </div>

            {/* Quick search input */}
            <div className="relative shrink-0 sm:w-60">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Lọc theo tên bài báo…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-7.5 text-xs bg-card border-border"
              />
            </div>
          </div>

          {/* Active Review Claims Section */}
          {showClaims && (
            <section className="my-work-section active-claims-section" aria-label="Bài đang đánh giá">
              <div className="section-header">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-primary" />
                  <h3 className="section-title">Bài tôi đang giữ chỗ ({filteredClaims.length})</h3>
                </div>
                <span className="section-subtitle">Mỗi suất giữ chỗ có thời hạn 24 giờ</span>
              </div>

              {filteredClaims.length > 0 ? (
                <div className="active-claims-list">
                  {filteredClaims.map(claim => (
                    <ClaimedPaperCard
                      key={claim.roundId}
                      claim={claim}
                      onOpen={() => onOpenPaper(claim.paperId)}
                      onExtend={() => void handleExtend(claim.roundId)}
                      onRelease={() => void handleRelease(claim.roundId)}
                      isPending={command.isPending}
                    />
                  ))}
                </div>
              ) : activeFilter === "REVIEWING" ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Không có bài nào đang giữ chỗ phù hợp với bộ lọc.</p>
              ) : (
                <div className="my-work-empty-claims">
                  <div className="empty-claims-icon">
                    <FileText size={24} className="text-muted-foreground" />
                  </div>
                  <div className="empty-claims-text">
                    <p className="font-semibold text-foreground">Bạn chưa nhận bài nào trong vòng này</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {summary.eligibleQueueCount > 0
                        ? `Có ${summary.eligibleQueueCount} bài báo đang chờ người đánh giá trong hàng đợi.`
                        : "Hàng đợi đánh giá hiện đã sạch. Cả nhóm có thể tìm thêm tài liệu mới."}
                    </p>
                  </div>
                  {summary.eligibleQueueCount > 0 && !readOnly && (
                    <Button
                      size="sm"
                      className="empty-claims-btn"
                      onClick={() => void handleClaimNext()}
                      disabled={command.isPending}
                    >
                      Nhận bài tiếp theo
                    </Button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Action Needed Section (Consensus & Adjudications) */}
          {showActionNeeded && (filteredConsensus.length > 0 || filteredDiscussions.length > 0 || filteredAdjudications.length > 0) && (
            <section className="my-work-section action-needed-section" aria-label="Cần tôi giải quyết">
              <div className="section-header">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-600" />
                  <h3 className="section-title text-amber-900 dark:text-amber-300">
                    Cần giải quyết ({filteredConsensus.length + filteredDiscussions.length + filteredAdjudications.length})
                  </h3>
                </div>
              </div>

              <div className="action-needed-list">
                {filteredConsensus.map(c => (
                  <div key={c.agreementId} className="action-needed-card consensus-card">
                    <div className="action-card-header">
                      <span className="action-card-badge consensus-badge">Đồng thuận nhóm chờ phản hồi</span>
                      <span className="action-card-author">Đề xuất bởi: {c.proposedByName}</span>
                    </div>
                    <h4 className="action-card-paper-title">{c.title}</h4>
                    <p className="action-card-reason">
                      <strong>Lý do đề xuất:</strong> {c.reason}
                    </p>
                    <div className="action-card-footer">
                      <Button size="sm" onClick={() => onOpenPaper(c.paperId)}>
                        Xem & phản hồi
                        <ArrowRight size={13} className="ml-1.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                {filteredDiscussions.map(p => (
                  <article key={p.roundId} className="action-needed-card conflict-card">
                    <div className="action-card-header">
                      <span className="action-card-badge conflict-badge">
                        {p.classification ? classificationLabels[p.classification] : "Có bất đồng"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề / Tóm tắt"}
                      </span>
                    </div>
                    <h4 className="action-card-paper-title">{p.title}</h4>
                    <p className="action-card-reason">
                      {p.classification === "CONFLICT"
                        ? "Hai người có kết luận khác nhau. Trao đổi và xem xét lại trước khi nhờ phân xử."
                        : p.classification === "EXCLUSION_REASON_MISMATCH"
                          ? "Cả hai đều loại bài nhưng khác lý do. Cần thống nhất lý do loại chính thức."
                          : p.classification === "NEEDS_CLARIFICATION" ? "2/2 đánh giá đã gửi. Cần trao đổi thêm để làm rõ tiêu chí hoặc bổ sung nguồn minh chứng." : "Cần trao đổi thêm để làm rõ tiêu chí hoặc bổ sung nguồn minh chứng."}
                    </p>
                    <div className="action-card-footer">
                      <Button size="sm" onClick={() => onOpenPaper(p.paperId)}>
                        Trao đổi và xem lại
                        <ArrowRight size={13} className="ml-1.5" />
                      </Button>
                    </div>
                  </article>
                ))}

                {filteredAdjudications.map(a => (
                  <div key={a.roundId} className="action-needed-card adjudication-card">
                    <div className="action-card-header">
                      <span className="action-card-badge adjudication-badge">{caseStatusLabels[a.caseStatus ?? ""] ?? "Bạn được giao phân xử bất đồng"}</span>
                    </div>
                    <h4 className="action-card-paper-title">{a.title}</h4>
                    <p className="action-card-reason">
                      Hai reviewer có ý kiến khác nhau. Hãy xem xét minh chứng và đưa ra kết luận theo tiêu chuẩn của đề tài.
                    </p>
                    <div className="action-card-footer">
                      <Button size="sm" onClick={() => setAdjudicationModalRoundId(a.roundId)}>
                        Mở hồ sơ phân xử
                        <ArrowRight size={13} className="ml-1.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tracked Disputes & Adjudication Cases */}
          {showDisputes && (Boolean(filteredDisputes.length) || activeFilter === "DISPUTES") && (
            <section className="my-work-section tracked-disputes-section" aria-label="Bài đang theo dõi phân xử">
              <div className="section-header">
                <div className="flex items-center gap-2">
                  <Scale size={16} className="text-indigo-600 dark:text-indigo-400" />
                  <h3 className="section-title text-indigo-950 dark:text-indigo-200">
                    Đang theo dõi phân xử & bất đồng ({filteredDisputes.length})
                  </h3>
                </div>
                <span className="section-subtitle">Bài bạn đã gửi đánh giá, đang chờ thống nhất ý kiến hoặc kết luận phân xử</span>
              </div>

              {filteredDisputes.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {filteredDisputes.map(item => (
                    <div
                      key={item.roundId}
                      className={`p-4 rounded-xl border shadow-sm flex flex-col gap-2.5 ${item.needsMyStatement && !readOnly ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20" : "border-indigo-100 bg-white dark:bg-card dark:border-indigo-900/40"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800">
                            {item.caseStatus
                              ? caseStatusLabels[item.caseStatus] || item.caseStatus
                              : item.status === "ADJUDICATING"
                                ? "Đang phân xử"
                                : "Có ý kiến khác nhau"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề / Tóm tắt"}
                            {item.publicationYear ? ` · ${item.publicationYear}` : ""}
                            {item.journalName ? ` · ${item.journalName}` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-muted-foreground">Phiếu của bạn:</span>
                          {renderBallotBadge(item.myDecision)}
                        </div>
                      </div>

                      <h4 className="font-medium text-foreground text-sm leading-snug line-clamp-2">
                        {item.title}
                      </h4>

                      {(item.deadline || item.adjudicatorName) && (
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/50">
                          {item.adjudicatorName && (
                            <span>Người phân xử: <strong className="text-foreground">{item.adjudicatorName}</strong></span>
                          )}
                          {item.deadline && (
                            <span>Hạn hoàn tất ý kiến: <strong className="text-foreground">{new Date(item.deadline).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}</strong></span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                          onClick={() => setAdjudicationModalRoundId(item.roundId)}
                        >
                          <Scale size={13} className="mr-1.5" />
                          {item.needsMyStatement && !readOnly ? "Nhập ý kiến ngay" : "Hồ sơ phân xử"}
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => onOpenPaper(item.paperId)}
                        >
                          Xem chi tiết bài
                          <ArrowRight size={13} className="ml-1.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Không có bài nào đang phân xử phù hợp với bộ lọc.</p>
              )}
            </section>
          )}

          {/* Completed Evaluations Section */}
          {showCompleted && (Boolean(filteredCompleted.length) || activeFilter === "COMPLETED" || activeFilter === "ADJUDICATED") && (
            <section className="my-work-section completed-evaluations-section" aria-label="Bài tôi đã hoàn thành đánh giá">
              <div className="section-header">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <h3 className="section-title text-emerald-950 dark:text-emerald-200">
                    {activeFilter === "ADJUDICATED" ? "Bài đã qua phân xử" : "Bài tôi đã hoàn thành đánh giá"} ({filteredCompleted.length})
                  </h3>
                </div>
                <span className="section-subtitle">
                  {activeFilter === "ADJUDICATED" ? "Các bài đã được giải quyết qua hội đồng hoặc người phân xử độc lập" : "Các bài bạn đã tham gia đánh giá và đã có quyết định chính thức"}
                </span>
              </div>

              {filteredCompleted.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {filteredCompleted.map(item => (
                    <div
                      key={item.roundId}
                      className="p-3.5 rounded-xl border border-border bg-white dark:bg-card shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-border/80 transition-colors"
                    >
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {renderFinalDecisionBadge(item.finalDecision)}
                          {(item.isAdjudicated || Boolean(item.resolverName)) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800">
                              <Scale size={11} /> Đã qua phân xử
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {item.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề / Tóm tắt"}
                            {item.publicationYear ? ` · ${item.publicationYear}` : ""}
                          </span>
                        </div>
                        <h4 className="font-medium text-foreground text-sm line-clamp-1">
                          {item.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            Phiếu của bạn: {renderBallotBadge(item.myDecision)}
                          </span>
                          {item.decidedAt && (
                            <span>Ngày quyết định: {new Date(item.decidedAt).toLocaleDateString("vi-VN")}</span>
                          )}
                          {item.resolverName && (
                            <span>Phân xử bởi: <strong>{item.resolverName}</strong></span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => onOpenPaper(item.paperId)}
                        >
                          Xem lại bài
                          <ChevronRight size={14} className="ml-1" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Không có bài đánh giá nào phù hợp với bộ lọc.</p>
              )}
            </section>
          )}

          {/* Overall Empty State when all filtered results are 0 */}
          {visibleItemsCount === 0 && (
            <div className="p-8 text-center rounded-2xl border border-dashed border-border bg-card/40 my-4">
              <FileText size={32} className="mx-auto text-muted-foreground/60 mb-2" />
              <p className="font-semibold text-foreground text-sm">Không có bài báo nào trong mục này</p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery ? "Không tìm thấy bài nào khớp với từ khóa tìm kiếm." : "Bạn có thể chuyển sang bộ lọc khác hoặc kiểm tra lại hàng đợi."}
              </p>
              {(searchQuery || activeFilter !== "ALL") && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  {searchQuery && (
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setSearchQuery("")}>
                      Xóa tìm kiếm
                    </Button>
                  )}
                  {activeFilter !== "ALL" && (
                    <Button size="sm" variant="default" className="text-xs h-7" onClick={() => setActiveFilter("ALL")}>
                      Xem tất cả ({totalCount})
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {Boolean(summary.expiredClaims?.length) && (
            <section className="my-work-section" aria-label="Suất đã hết hạn">
              <h3 className="section-title">Suất đã hết hạn</h3>
              <p className="text-sm text-muted-foreground">
                Bản nháp trên thiết bị này vẫn được giữ. Cần nhận lại suất còn trống trước khi gửi.
              </p>
              {summary.expiredClaims!.map(p => (
                <div key={p.roundId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{p.title}</span>
                  <Button size="sm" variant="outline" onClick={() => onOpenPaper(p.paperId)}>
                    Xem bài và bản nháp
                  </Button>
                </div>
              ))}
            </section>
          )}

        </div>

        {/* Sidebar Column: Discovery Goal & Recent Proposals */}
        <aside className="my-work-sidebar">
          {/* Research Discovery Goal Card */}
          <div className="discovery-goal-card">
            <div className="discovery-goal-header">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-primary" />
                <h4 className="discovery-goal-title">Mục tiêu tìm tài liệu</h4>
              </div>
              {canManage && (
                <button
                  type="button"
                  className="discovery-goal-settings-btn"
                  title="Cài đặt mục tiêu đề tài"
                  onClick={() => setGoalModalOpen(true)}
                >
                  <Settings2 size={14} />
                </button>
              )}
            </div>

            {summary.discoveryGoal.enabled ? (
              <div className="discovery-goal-body">
                <div className="goal-progress-header">
                  <span className="goal-period-label">
                    {summary.discoveryGoal.period === "MONTH" ? "Tháng này" : "Tuần này"}:
                  </span>
                  <span className="goal-progress-number">
                    <strong>{summary.discoveryGoal.currentCount}</strong> / {summary.discoveryGoal.target} bài
                  </span>
                </div>
                <div className="goal-progress-bar-wrap">
                  <div
                    className="goal-progress-bar-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((summary.discoveryGoal.currentCount / summary.discoveryGoal.target) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <p className="goal-gentle-hint">
                  {summary.discoveryGoal.remaining > 0
                    ? `Cần thêm ${summary.discoveryGoal.remaining} bài báo phù hợp để đạt mục tiêu nhẹ nhàng của nhóm.`
                    : "Tuyệt vời! Bạn đã đạt mục tiêu tìm kiếm tài liệu của nhóm."}
                </p>
                {onAddPaper && !readOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-3 text-xs"
                    onClick={onAddPaper}
                  >
                    <Search size={13} className="mr-1.5" />
                    Đề xuất bài báo mới
                  </Button>
                )}
              </div>
            ) : (
              <div className="discovery-goal-body">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Đề xuất tài liệu khoa học chất lượng, không trùng lặp và liên quan trực tiếp đến câu hỏi nghiên cứu của đề tài.
                </p>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-3 text-xs"
                    onClick={() => setGoalModalOpen(true)}
                  >
                    Bật mục tiêu nhóm (gợi ý: 2 bài/tuần)
                  </Button>
                ) : onAddPaper && !readOnly ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-3 text-xs"
                    onClick={onAddPaper}
                  >
                    <Search size={13} className="mr-1.5" />
                    Đề xuất tài liệu
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          {/* Recent Proposals Compact Preview */}
          <div className="recent-proposals-card">
            <div className="recent-proposals-header">
              <div className="flex items-center justify-between w-full">
                <h4 className="recent-proposals-title">
                  Tôi đã đề xuất ({summary.myProposalsCount})
                </h4>
                <button
                  type="button"
                  className="recent-proposals-all-link"
                  onClick={() => onSwitchView("my-proposals")}
                >
                  Xem tất cả
                  <ChevronRight size={13} className="inline ml-0.5" />
                </button>
              </div>
            </div>

            {summary.recentProposals.length > 0 ? (
              <div className="recent-proposals-list">
                {summary.recentProposals.map(p => (
                  <div key={p.paperId} className="recent-proposal-item">
                    <button
                      type="button"
                      className="recent-proposal-item-title text-left hover:text-primary transition-colors line-clamp-2"
                      onClick={() => onOpenPaper(p.paperId)}
                    >
                      {p.title}
                    </button>
                    <div className="recent-proposal-item-meta">
                      <span className="recent-proposal-progress-badge">
                        {p.reviewProgress.completed}/{p.reviewProgress.required} đã gửi
                        {p.reviewProgress.held > 0 && ` · ${p.reviewProgress.held} đang giữ`}
                      </span>
                      <span className={`recent-proposal-status-badge status-${p.screeningStatus.toLowerCase()}`}>
                        {p.finalDecision
                          ? p.finalDecision === "INCLUDED"
                            ? "Phù hợp"
                            : "Đã loại"
                          : p.screeningStatus === "INCLUDED"
                            ? "Phù hợp"
                            : p.screeningStatus === "EXCLUDED"
                              ? "Đã loại"
                              : "Đang xem xét"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="recent-proposals-empty">
                <p className="text-xs text-muted-foreground">Bạn chưa đề xuất bài báo nào vào dự án này.</p>
                {onAddPaper && !readOnly && (
                  <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={onAddPaper}>
                    Đề xuất bài đầu tiên
                  </Button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Discovery Goal Settings Modal */}
      {goalModalOpen && (
        <Dialog open onOpenChange={setGoalModalOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Cài đặt mục tiêu tìm tài liệu</DialogTitle>
              <DialogDescription>
                Mục tiêu nhẹ nhàng khuyến khích thành viên phát hiện và đề xuất tài liệu có giá trị, không tạo áp lực số lượng.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={goalEnabled}
                  onChange={e => setGoalEnabled(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm font-medium">Bật mục tiêu tìm tài liệu cho đề tài</span>
              </label>

              {goalEnabled && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Số bài báo mỗi thành viên</label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={goalTarget}
                      onChange={e => setGoalTarget(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <small className="text-xs text-muted-foreground">Khuyến nghị mặc định: 2 bài / tuần.</small>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Chu kỳ mục tiêu</label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={goalPeriod}
                      onChange={e => setGoalPeriod(e.target.value as "WEEK" | "MONTH")}
                    >
                      <option value="WEEK">Mỗi tuần (Khuyến nghị)</option>
                      <option value="MONTH">Mỗi tháng</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setGoalModalOpen(false)}>
                Hủy bỏ
              </Button>
              <Button onClick={() => void handleSaveGoal()} disabled={command.isPending}>
                Lưu cài đặt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {adjudicationModalRoundId && (
        <ScreeningAdjudicationDialog
          projectId={projectId}
          roundId={adjudicationModalRoundId}
          open={Boolean(adjudicationModalRoundId)}
          onClose={() => {
            setAdjudicationModalRoundId(null);
            void summaryQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

function ClaimedPaperCard({
  claim,
  onOpen,
  onExtend,
  onRelease,
  isPending,
}: {
  claim: {
    paperId: string;
    roundId: string;
    title: string;
    authors?: string[];
    publicationYear: number | null;
    journalName?: string | null;
    phase: string;
    dueAt: string | null;
    expiresInSeconds: number | null;
    canExtend: boolean;
    canRelease: boolean;
  };
  onOpen: () => void;
  onExtend: () => void;
  onRelease: () => void;
  isPending: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(claim.expiresInSeconds);

  useEffect(() => {
    if (claim.expiresInSeconds === null) return;
    setRemaining(claim.expiresInSeconds);

    const timer = setInterval(() => {
      setRemaining(prev => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [claim.expiresInSeconds]);

  const formatCountdown = (seconds: number | null) => {
    if (seconds === null) return "Không giới hạn";
    if (seconds <= 0) return "Đã hết hạn lease";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const isUrgent = remaining !== null && remaining < 7200; // less than 2 hours

  return (
    <div className={`claimed-paper-card ${isUrgent ? "is-urgent" : ""}`}>
      <div className="claimed-card-header">
        <div className="claimed-meta-row">
          <span className="claimed-phase-badge">
            {claim.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề / Tóm tắt"}
          </span>
          <span className="claimed-year">{claim.publicationYear}</span>
          {claim.journalName && (
            <span className="claimed-journal" title={claim.journalName}>
              · {claim.journalName}
            </span>
          )}
        </div>

        <div className={`claimed-timer-badge ${isUrgent ? "timer-urgent" : ""}`}>
          <Clock size={12} className="inline mr-1" />
          <span>{formatCountdown(remaining)}</span>
        </div>
      </div>

      <h4 className="claimed-paper-title">
        <button type="button" onClick={onOpen}>
          {claim.title}
        </button>
      </h4>

      {claim.authors && claim.authors.length > 0 && (
        <p className="claimed-authors">{claim.authors.join(", ")}</p>
      )}

      <div className="claimed-card-actions">
        <Button size="sm" onClick={onOpen} className="claimed-review-btn">
          Tiếp tục đánh giá
          <ArrowRight size={13} className="ml-1.5" />
        </Button>
        {claim.canExtend && (
          <Button
            size="sm"
            variant="outline"
            onClick={onExtend}
            disabled={isPending}
            className="claimed-extend-btn"
            title="Gia hạn thêm 24 giờ giữ suất nếu bạn cần thêm thời gian"
          >
            +24h Gia hạn
          </Button>
        )}
        {claim.canRelease && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRelease}
            disabled={isPending}
            className="claimed-release-btn text-muted-foreground hover:text-destructive"
            title="Trả bài lại hàng đợi cho thành viên khác nếu bạn chưa kịp đọc"
          >
            <RotateCcw size={12} className="mr-1" />
            Trả lại hàng đợi
          </Button>
        )}
      </div>
    </div>
  );
}
