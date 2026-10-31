import { useState } from "react";
import {
  Sparkles,
  BookOpen,
  ArrowRight,
  Eye,
  Search,
  CheckCircle2,
  Clock,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useResearchResource } from "../hooks/use-project-research";
import { screeningApi } from "../api/screening.api";
import { useScreeningCommand, ScreeningError, ScreeningPager } from "./screening-common";
import { WorkspaceLoading } from "./workspace-common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ScreeningQueueView({
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
  const [search, setSearch] = useState("");
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const command = useScreeningCommand(projectId);
  const boardQuery = useResearchResource(
    projectId,
    ["screening-queue", page, search],
    () => screeningApi.board(projectId, { filter: "QUEUE", page, pageSize: 12, q: search })
  );

  const board = boardQuery.data;

  const handleClaim = async (roundId: string, paperId: string) => {
    setClaimingId(roundId);
    try {
      await command.run({}, async () => {
        return await screeningApi.claim(projectId, roundId);
      });
      toast.success("Đã nhận bài thành công! Suất đánh giá được giữ trong 24 giờ.");
      void boardQuery.refetch();
      onOpenPaper(paperId);
    } catch {
      toast.error("Không thể nhận suất đánh giá. Có thể suất vừa được thành viên khác nhận.");
    } finally {
      setClaimingId(null);
    }
  };

  const handleClaimNext = async () => {
    try {
      let claimPaperId: string | null = null;
      const ok = await command.run({}, async () => {
        const res = (await screeningApi.claimNext(projectId)) as { paperId?: string | null } | null;
        claimPaperId = res?.paperId ?? null;
        return res;
      });

      if (ok && claimPaperId) {
        toast.success("Đã nhận bài tiếp theo thành công!");
        void boardQuery.refetch();
        onOpenPaper(claimPaperId);
      } else if (ok) {
        toast.info("Không có bài báo nào đủ điều kiện trong hàng đợi hiện tại.");
      }
    } catch {
      toast.error("Không thể nhận bài. Vui lòng thử lại.");
    }
  };

  return (
    <div className="screening-queue-container">
      {/* Queue Header */}
      <div className="screening-queue-header">
        <div className="queue-header-left">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Hàng đợi đánh giá</h2>
            {board && (
              <span className="queue-count-badge">
                {board.total} bài cần người đánh giá
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Chỉ liệt kê các bài đủ điều kiện để bạn tham gia đánh giá độc lập. Mở xem trước bài báo sẽ không tự động chiếm suất đánh giá.
          </p>
        </div>

        {board && board.total > 0 && !readOnly && (
          <div className="queue-header-right">
            <Button
              onClick={() => void handleClaimNext()}
              disabled={command.isPending}
              className="queue-claim-next-btn"
            >
              <Sparkles size={14} className="mr-1.5" />
              Nhận bài tiếp theo
            </Button>
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="queue-search-bar">
        <div className="queue-search-input-wrap">
          <Search size={14} className="queue-search-icon" />
          <Input
            placeholder="Tìm theo tiêu đề, tác giả, DOI hoặc từ khóa…"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="queue-search-input"
          />
        </div>
      </div>

      {/* Main Queue Content */}
      {boardQuery.isLoading ? (
        <WorkspaceLoading />
      ) : boardQuery.isError ? (
        <ScreeningError error={boardQuery.error} retry={() => void boardQuery.refetch()} />
      ) : board && board.items.length > 0 ? (
        <>
          <div className="queue-paper-grid">
            {board.items.map(p => {
              const round = p.round;
              const completedCount = round?.completed ?? 0;
              const requiredCount = round?.settings.requiredReviewers ?? 2;
              const isClaimingThis = claimingId === round?.id;

              return (
                <article key={p.paperId} className="queue-paper-card">
                  <header className="queue-card-header">
                    <div className="queue-meta-left">
                      <span className="queue-year">{p.publicationYear || "Chưa rõ năm"}</span>
                      {p.journalName && (
                        <span className="queue-journal" title={p.journalName}>
                          · {p.journalName}
                        </span>
                      )}
                      {p.fullTextAvailable && (
                        <span className="queue-fulltext-chip">Có toàn văn</span>
                      )}
                    </div>

                    <div className="queue-slot-badge">
                      <Users size={12} className="inline mr-1 text-primary" />
                      {completedCount === 0 ? (
                        <span className="text-primary font-medium">Chưa ai nhận (0/{requiredCount})</span>
                      ) : (
                        <span className="text-amber-600 font-medium">
                          Còn {requiredCount - completedCount} suất ({completedCount}/{requiredCount})
                        </span>
                      )}
                    </div>
                  </header>

                  <div className="queue-card-body">
                    <h3 className="queue-paper-title">
                      <button
                        type="button"
                        onClick={() => onOpenPaper(p.paperId)}
                        title="Xem trước bài báo (không giữ chỗ)"
                      >
                        {p.title}
                      </button>
                    </h3>

                    {Boolean(p.authors?.length) && (
                      <p className="queue-authors" title={p.authors!.join(", ")}>
                        {p.authors!.join(", ")}
                      </p>
                    )}

                    {p.abstractText && (
                      <p className="queue-abstract-preview">
                        {p.abstractText}
                      </p>
                    )}

                    {p.proposalReason && (
                      <p className="queue-proposal-reason">
                        <strong>Lý do đề xuất:</strong> {p.proposalReason}
                      </p>
                    )}
                  </div>

                  <footer className="queue-card-footer">
                    <div className="queue-proposer-text">
                      <span title={`Thời điểm thêm: ${new Date(p.proposedAt).toLocaleString("vi-VN")}`}>
                        Thêm bởi {p.proposer?.name ?? "Thành viên"} · {new Date(p.proposedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} {new Date(p.proposedAt).toLocaleDateString("vi-VN")}
                      </span>
                    </div>

                    <div className="queue-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="queue-preview-btn"
                        onClick={() => onOpenPaper(p.paperId)}
                        title="Xem trước nội dung mà không giữ chỗ"
                      >
                        <Eye size={13} className="mr-1" />
                        Xem trước
                      </Button>

                      {round && !readOnly && (
                        <Button
                          type="button"
                          size="sm"
                          className="queue-claim-btn"
                          disabled={command.isPending || isClaimingThis}
                          onClick={() => void handleClaim(round.id, p.paperId)}
                        >
                          <span>{isClaimingThis ? "Đang nhận…" : "Nhận đánh giá"}</span>
                          <ArrowRight size={13} className="ml-1" />
                        </Button>
                      )}
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
        <div className="queue-empty-state">
          <div className="queue-empty-icon">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <h3 className="queue-empty-title">
            {search ? "Không tìm thấy bài báo nào khớp với từ khóa" : "Hàng đợi đánh giá đã sạch bài!"}
          </h3>
          <p className="queue-empty-desc">
            {search
              ? "Hãy thử tìm kiếm bằng từ khóa khác hoặc xóa bộ lọc."
              : "Hiện không còn bài báo nào cần reviewer. Cả nhóm có thể tìm kiếm thêm tài liệu mới cho đề tài."}
          </p>
          {!search && onAddPaper && !readOnly && (
            <Button size="sm" onClick={onAddPaper} className="queue-empty-cta-btn">
              <BookOpen size={14} className="mr-1.5" />
              Đề xuất bài báo mới
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
