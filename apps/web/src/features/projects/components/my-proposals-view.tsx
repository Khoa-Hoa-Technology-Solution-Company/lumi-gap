import { useState } from "react";
import {
  FileText,
  Search,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertCircle,
  Clock,
  Pencil,
  ArrowRight,
  Plus,
  BookOpen,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useResearchResource } from "../hooks/use-project-research";
import { screeningApi } from "../api/screening.api";
import { useScreeningCommand, ScreeningError, ScreeningPager } from "./screening-common";
import { WorkspaceLoading } from "./workspace-common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type ProposalFilter = "ALL" | "NOT_REVIEWED" | "IN_REVIEW" | "INCLUDED" | "EXCLUDED" | "NEEDS_RESOLUTION" | "NEEDS_MORE_INFO";

export function MyProposalsView({
  projectId,
  readOnly,
  onOpenPaper,
  onAddPaper,
}: {
  projectId: string;
  readOnly: boolean;
  onOpenPaper: (paperId: string) => void;
  onAddPaper?: () => void;
}) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ProposalFilter>("ALL");
  const [search, setSearch] = useState("");

  // Edit proposal reason modal
  const [editingPaper, setEditingPaper] = useState<{
    paperId: string;
    title: string;
    reason: string;
    updatedAt: string;
  } | null>(null);
  const [editReasonText, setEditReasonText] = useState("");

  const command = useScreeningCommand(projectId);
  const queryParams: Record<string, string | number> = {
    filter: "PROPOSED_BY_ME",
    page,
    pageSize: 12,
    q: search,
  };
  if (filter !== "ALL") {
    queryParams.status = filter;
  }

  const boardQuery = useResearchResource(
    projectId,
    ["my-proposals", page, filter, search],
    () => screeningApi.board(projectId, queryParams)
  );

  const board = boardQuery.data;

  const handleSaveReason = async () => {
    if (!editingPaper) return;
    try {
      await command.run({}, async () => {
        return await screeningApi.proposal(projectId, editingPaper.paperId, {
          reason: editReasonText.trim(),
          expectedUpdatedAt: editingPaper.updatedAt,
        });
      });
      toast.success("Đã cập nhật lý do đề xuất bài báo!");
      setEditingPaper(null);
      void boardQuery.refetch();
    } catch {
      toast.error("Không thể lưu lý do đề xuất.");
    }
  };

  return (
    <div className="my-proposals-container">
      {/* Header */}
      <div className="my-proposals-header">
        <div className="my-proposals-header-left">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Tôi đã đề xuất</h2>
            {board && (
              <span className="my-proposals-count-badge">
                {board.total} bài báo đã đóng góp
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Theo dõi tất cả bài báo bạn đã đưa vào dự án. Mọi tài liệu đề xuất — kể cả tài liệu được kết luận loại trừ — đều là đóng góp khoa học có giá trị giúp định hình phạm vi nghiên cứu của đề tài.
          </p>
        </div>

        {onAddPaper && !readOnly && (
          <div className="my-proposals-header-right">
            <Button onClick={onAddPaper} className="my-proposals-add-btn">
              <Plus size={14} className="mr-1.5" />
              Đề xuất bài báo mới
            </Button>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="my-proposals-filter-bar">
        <div className="my-proposals-tabs" role="tablist" aria-label="Bộ lọc trạng thái đề xuất">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "ALL"}
            className={`proposals-tab ${filter === "ALL" ? "active" : ""}`}
            onClick={() => {
              setFilter("ALL");
              setPage(1);
            }}
          >
            Tất cả
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "NOT_REVIEWED"}
            className={`proposals-tab ${filter === "NOT_REVIEWED" ? "active" : ""}`}
            onClick={() => {
              setFilter("NOT_REVIEWED");
              setPage(1);
            }}
          >
            Chưa được nhận
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "IN_REVIEW"}
            className={`proposals-tab ${filter === "IN_REVIEW" ? "active" : ""}`}
            onClick={() => {
              setFilter("IN_REVIEW");
              setPage(1);
            }}
          >
            Đang đánh giá
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "INCLUDED"}
            className={`proposals-tab ${filter === "INCLUDED" ? "active" : ""}`}
            onClick={() => {
              setFilter("INCLUDED");
              setPage(1);
            }}
          >
            Qua sàng lọc
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "NEEDS_RESOLUTION"}
            className={`proposals-tab ${filter === "NEEDS_RESOLUTION" ? "active" : ""}`}
            onClick={() => {
              setFilter("NEEDS_RESOLUTION");
              setPage(1);
            }}
          >
            Có bất đồng
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "EXCLUDED"}
            className={`proposals-tab ${filter === "EXCLUDED" ? "active" : ""}`}
            onClick={() => {
              setFilter("EXCLUDED");
              setPage(1);
            }}
          >
            Đã loại
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "NEEDS_MORE_INFO"}
            className={`proposals-tab ${filter === "NEEDS_MORE_INFO" ? "active" : ""}`}
            onClick={() => {
              setFilter("NEEDS_MORE_INFO");
              setPage(1);
            }}
          >
            Cần đọc thêm
          </button>
        </div>

        <div className="my-proposals-search-wrap">
          <Search size={13} className="my-proposals-search-icon" />
          <Input
            placeholder="Tìm trong danh sách đã đề xuất…"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="my-proposals-search-input"
          />
        </div>
      </div>

      {/* Main Content */}
      {boardQuery.isLoading ? (
        <WorkspaceLoading />
      ) : boardQuery.isError ? (
        <ScreeningError error={boardQuery.error} retry={() => void boardQuery.refetch()} />
      ) : board && board.items.length > 0 ? (
        <>
          <div className="my-proposals-list">
            {board.items.map(p => {
              const round = p.round;
              const completedCount = round?.completed ?? 0;
              const requiredCount = round?.settings.requiredReviewers ?? 2;
              const status = round?.status ?? p.legacyStatus;
              const isExcluded = status === "EXCLUDED" || round?.finalDecision?.decision === "EXCLUDED";
              const isIncluded = status === "INCLUDED" || round?.finalDecision?.decision === "INCLUDED";
              const hasConflict = status === "NEEDS_RESOLUTION" || status === "ADJUDICATING";
              const needsMoreInfo = status === "NEEDS_MORE_INFO";

              return (
                <article key={p.paperId} className="my-proposal-card">
                  <header className="my-proposal-card-header">
                    <div className="proposal-meta-left">
                      <span className="proposal-year">{p.publicationYear || "Chưa rõ năm"}</span>
                      {p.journalName && (
                        <span className="proposal-journal" title={p.journalName}>
                          · {p.journalName}
                        </span>
                      )}
                      {p.fullTextAvailable && (
                        <span className="proposal-fulltext-chip">Có toàn văn</span>
                      )}
                    </div>

                    <div className="proposal-status-wrap">
                      {isIncluded ? (
                        <span className="proposal-status-badge status-included">
                          <CheckCircle2 size={12} className="inline mr-1" />
                          Qua sàng lọc
                        </span>
                      ) : isExcluded ? (
                        <span className="proposal-status-badge status-excluded">
                          <XCircle size={12} className="inline mr-1" />
                          Không chọn cho phân tích
                        </span>
                      ) : hasConflict ? (
                        <span className="proposal-status-badge status-conflict">
                          <AlertCircle size={12} className="inline mr-1" />
                          Có bất đồng · Đang thảo luận
                        </span>
                      ) : needsMoreInfo ? (
                        <span className="proposal-status-badge status-more-info">
                          <BookOpen size={12} className="inline mr-1" />
                          Cần đọc toàn văn
                        </span>
                      ) : round?.status === "IN_REVIEW" ? (
                        <span className="proposal-status-badge status-reviewing">
                          <Clock size={12} className="inline mr-1" />
                          Đang đánh giá
                        </span>
                      ) : (
                        <span className="proposal-status-badge status-not-reviewed">
                          Chưa có reviewer
                        </span>
                      )}
                    </div>
                  </header>

                  <div className="my-proposal-card-body">
                    <h3 className="proposal-paper-title">
                      <button type="button" onClick={() => onOpenPaper(p.paperId)}>
                        {p.title}
                      </button>
                    </h3>

                    {Boolean(p.authors?.length) && (
                      <p className="proposal-authors" title={p.authors!.join(", ")}>
                        {p.authors!.join(", ")}
                      </p>
                    )}

                    {/* Proposal Reason Section */}
                    <div className="proposal-reason-box">
                      <div className="flex items-center justify-between">
                        <span className="proposal-reason-label">Lý do đề xuất của bạn:</span>
                        {p.canEditProposal && !readOnly && (
                          <button
                            type="button"
                            className="proposal-edit-reason-btn"
                            onClick={() => {
                              setEditingPaper({
                                paperId: p.paperId,
                                title: p.title,
                                reason: p.proposalReason,
                                updatedAt: p.updatedAt,
                              });
                              setEditReasonText(p.proposalReason);
                            }}
                          >
                            <Pencil size={11} className="inline mr-1" />
                            Sửa lý do
                          </button>
                        )}
                      </div>
                      <p className="proposal-reason-text">
                        {p.proposalReason || "Chưa ghi lý do đề xuất."}
                      </p>
                    </div>

                    {/* Scientific Exclusion Note */}
                    {isExcluded && (
                      <div className="proposal-exclusion-notice">
                        <Info size={14} className="shrink-0 text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-xs text-foreground font-medium">
                            {round?.finalDecision?.reason
                              ? `Lý do loại trừ: ${round.finalDecision.reason}`
                              : "Bài báo không đáp ứng tiêu chuẩn đưa vào của nghiên cứu này."}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Trong nghiên cứu tổng quan (Systematic Review), việc phát hiện và loại trừ tài liệu không phù hợp tiêu chí là đóng góp quan trọng để làm rõ ranh giới nghiên cứu.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <footer className="my-proposal-card-footer">
                    <div className="proposal-footer-left">
                      <span className="proposal-time-text" title={`Thời điểm thêm: ${new Date(p.proposedAt).toLocaleString("vi-VN")}`}>
                        Đề xuất lúc {new Date(p.proposedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ngày {new Date(p.proposedAt).toLocaleDateString("vi-VN")}
                      </span>
                      <span className="proposal-footer-sep">·</span>
                      <span className="proposal-review-progress">
                        Tiến độ đánh giá: <strong>{completedCount}/{requiredCount} phiếu đã gửi</strong>
                        {round?.assignments && round.assignments.some(a => !a.completed && a.dueAt && new Date(a.dueAt) > new Date()) && (
                          <span className="ml-1 text-primary">· Đang có người giữ suất</span>
                        )}
                      </span>
                    </div>

                    <div className="proposal-footer-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenPaper(p.paperId)}
                      >
                        <span>Chi tiết & Lịch sử</span>
                        <ArrowRight size={13} className="ml-1" />
                      </Button>
                    </div>
                  </footer>
                </article>
              );
            })}
          </div>

          {(board.total > 12 || page > 1) && (
            <div className="mt-4">
              <ScreeningPager
                page={page}
                total={board.total}
                hasNext={board.hasNext}
                onPage={setPage}
              />
            </div>
          )}
        </>
      ) : (
        <div className="my-proposals-empty">
          <div className="my-proposals-empty-icon">
            <BookOpen size={32} className="text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mt-2">
            {search || filter !== "ALL"
              ? "Không tìm thấy bài báo nào khớp với bộ lọc"
              : "Bạn chưa đề xuất bài báo nào vào dự án này"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md text-center">
            {search || filter !== "ALL"
              ? "Thử đổi từ khóa hoặc chọn tab 'Tất cả' để xem toàn bộ đóng góp của bạn."
              : "Tìm kiếm các nghiên cứu liên quan từ OpenAlex, DOI hoặc tải lên PDF để bắt đầu đóng góp tài liệu cho nhóm."}
          </p>
          {onAddPaper && !readOnly && (
            <Button size="sm" onClick={onAddPaper} className="mt-3">
              <Plus size={14} className="mr-1.5" />
              Đề xuất bài báo đầu tiên
            </Button>
          )}
        </div>
      )}

      {/* Edit Proposal Reason Dialog */}
      {editingPaper && (
        <Dialog open onOpenChange={open => !open && setEditingPaper(null)}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Sửa lý do đề xuất bài báo</DialogTitle>
              <DialogDescription className="line-clamp-2">
                {editingPaper.title}
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Lý do đề xuất bài này cho đề tài (tối thiểu 3 ký tự)
              </label>
              <textarea
                value={editReasonText}
                onChange={e => setEditReasonText(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Giải thích vì sao bài báo này quan trọng đối với câu hỏi nghiên cứu của nhóm…"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPaper(null)}>
                Hủy bỏ
              </Button>
              <Button
                onClick={() => void handleSaveReason()}
                disabled={command.isPending || editReasonText.trim().length < 3}
              >
                Lưu lý do đề xuất
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
