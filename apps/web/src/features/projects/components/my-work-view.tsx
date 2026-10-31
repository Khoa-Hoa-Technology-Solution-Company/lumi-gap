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
} from "lucide-react";
import { toast } from "sonner";
import { useResearchResource } from "../hooks/use-project-research";
import { screeningApi } from "../api/screening.api";
import { useScreeningCommand, ScreeningError } from "./screening-common";
import { WorkspaceLoading } from "./workspace-common";
import { Button } from "@/components/ui/button";
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
    screeningApi.workspaceSummary(projectId)
  );
  const command = useScreeningCommand(projectId);
  const summary = summaryQuery.data;

  // Discovery goal edit modal state
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalTarget, setGoalTarget] = useState(2);
  const [goalPeriod, setGoalPeriod] = useState<"WEEK" | "MONTH">("WEEK");
  const [goalEnabled, setGoalEnabled] = useState(false);

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

  const hasActiveClaims = summary.myActiveClaims.length > 0;
  const hasConsensus = summary.pendingConsensus.length > 0;
  const hasAdjudications = summary.pendingAdjudications.length > 0;
  const hasActionNeeded = hasConsensus || hasAdjudications;

  return (
    <div className="my-work-dashboard">
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
          {summary.capacityAdvice.suggestedAction === "DISCOVER_MORE" && onAddPaper && !readOnly && (
            <Button size="sm" onClick={onAddPaper} className="advice-action-btn">
              <Search size={14} className="mr-1.5" />
              Tìm tài liệu mới
            </Button>
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
          {/* Action Needed Section (Consensus & Adjudications) */}
          {hasActionNeeded && (
            <section className="my-work-section action-needed-section" aria-label="Việc cần giải quyết ngay">
              <div className="section-header">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-600" />
                  <h3 className="section-title text-amber-900 dark:text-amber-300">
                    Cần giải quyết ({summary.pendingConsensus.length + summary.pendingAdjudications.length})
                  </h3>
                </div>
              </div>

              <div className="action-needed-list">
                {summary.pendingConsensus.map(c => (
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

                {summary.pendingAdjudications.map(a => (
                  <div key={a.roundId} className="action-needed-card adjudication-card">
                    <div className="action-card-header">
                      <span className="action-card-badge adjudication-badge">Bạn được giao phân xử bất đồng</span>
                    </div>
                    <h4 className="action-card-paper-title">{a.title}</h4>
                    <p className="action-card-reason">
                      Hai reviewer có ý kiến khác nhau. Hãy xem xét minh chứng và đưa ra kết luận theo tiêu chuẩn của đề tài.
                    </p>
                    <div className="action-card-footer">
                      <Button size="sm" onClick={() => onOpenPaper(a.paperId)}>
                        Mở phân xử
                        <ArrowRight size={13} className="ml-1.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Active Review Claims Section */}
          <section className="my-work-section active-claims-section" aria-label="Bài đang đánh giá">
            <div className="section-header">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary" />
                <h3 className="section-title">Bài tôi đang giữ chỗ ({summary.myActiveClaims.length})</h3>
              </div>
              <span className="section-subtitle">Mỗi suất giữ chỗ có thời hạn 24 giờ</span>
            </div>

            {hasActiveClaims ? (
              <div className="active-claims-list">
                {summary.myActiveClaims.map(claim => (
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
                    <Sparkles size={14} className="mr-1.5" />
                    Nhận bài tiếp theo
                  </Button>
                )}
              </div>
            )}
          </section>

          {/* Quick "Claim Next Paper" CTA Card if Eligible Work Exists */}
          {summary.eligibleQueueCount > 0 && !readOnly && (
            <div className="claim-next-banner">
              <div className="claim-next-left">
                <div className="claim-next-badge">Hàng đợi có sẵn</div>
                <h4 className="claim-next-title">
                  Có <strong>{summary.eligibleQueueCount} bài báo</strong> đang chờ người đánh giá
                </h4>
                <p className="claim-next-desc">
                  Hệ thống tự động ưu tiên bài chưa ai nhận hoặc bài của thành viên khác để đảm bảo tính khách quan khoa học.
                </p>
              </div>
              <div className="claim-next-right">
                <Button
                  size="default"
                  onClick={() => void handleClaimNext()}
                  disabled={command.isPending}
                  className="claim-next-btn"
                >
                  <Sparkles size={15} className="mr-2" />
                  Nhận bài tiếp theo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onSwitchView("queue")}
                  className="claim-view-queue-btn"
                >
                  Xem toàn bộ hàng đợi
                  <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
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
    publicationYear: number;
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
