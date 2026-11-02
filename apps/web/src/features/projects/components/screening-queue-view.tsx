import { useState } from "react";
import {

  BookOpen,
  ArrowRight,
  Eye,
  Search,
  CheckCircle2,
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
  const [slotFilter, setSlotFilter] = useState<"ALL" | "UNCLAIMED" | "LAST_SLOT">("ALL");

  const command = useScreeningCommand(projectId);
  const boardQuery = useResearchResource(
    projectId,
    ["screening-queue", page, search, slotFilter],
    () => screeningApi.board(projectId, { filter: "QUEUE", page, pageSize: 12, q: search, slots: slotFilter }), true, () => !readOnly, 10000
  );

  const board = boardQuery.data;

  const filteredItems = board?.items ?? [];

  const handleClaim = async (roundId: string, paperId: string) => {
    setClaimingId(roundId);
    try {
      const ok = await command.run({ roundId, action: "claim" }, async (clientKey) => {
        return await screeningApi.claim(projectId, roundId, { clientKey });
      });
      if (ok) {
        toast.success("Đã nhận bài thành công! Suất đánh giá được giữ trong 24 giờ.");
        void boardQuery.refetch();
        onOpenPaper(paperId);
      } else {
        toast.error("Không thể nhận suất đánh giá. Có thể suất vừa được thành viên khác nhận.");
      }
    } catch {
      toast.error("Không thể nhận suất đánh giá. Có thể suất vừa được thành viên khác nhận.");
    } finally {
      setClaimingId(null);
    }
  };

  const handleClaimNext = async () => {
    try {
      let claimPaperId: string | null = null;
      const ok = await command.run({ action: "claim-next" }, async (clientKey) => {
        const res = (await screeningApi.claimNext(projectId, { clientKey })) as { paperId?: string | null } | null;
        claimPaperId = res?.paperId ?? null;
        return res;
      });

      if (ok && claimPaperId) {
        toast.success("Đã nhận bài tiếp theo thành công!");
        void boardQuery.refetch();
        onOpenPaper(claimPaperId);
      } else if (ok) {
        toast.info("Không có bài báo nào đủ điều kiện trong hàng đợi hiện tại.");
      } else {
        toast.error("Không thể nhận bài. Vui lòng thử lại.");
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
            Chỉ liệt kê các bài đủ điều kiện để bạn tham gia đánh giá độc lập. Bài do bạn đề xuất (trong nhóm từ 3 thành viên trở lên) sẽ được dành cho 2 thành viên khác đánh giá khách quan và theo dõi tại "Tôi đã đề xuất".
          </p>
        </div>

        {board && board.total > 0 && !readOnly && (
          <div className="queue-header-right">
            <Button
              onClick={() => void handleClaimNext()}
              disabled={command.isPending}
              className="queue-claim-next-btn"
            >

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

      {/* Slot Availability Filter Pills */}
      {board && (
        <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Lọc theo suất đánh giá">
          <button
            type="button"
            onClick={() => { setSlotFilter("ALL"); setPage(1); }}
            className={`h-7 px-3 rounded-full text-xs font-semibold transition-colors border ${
              slotFilter === "ALL"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => { setSlotFilter("UNCLAIMED"); setPage(1); }}
            className={`h-7 px-3 rounded-full text-xs font-semibold transition-colors border ${
              slotFilter === "UNCLAIMED"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            Chưa ai nhận
          </button>
          <button
            type="button"
            onClick={() => { setSlotFilter("LAST_SLOT"); setPage(1); }}
            className={`h-7 px-3 rounded-full text-xs font-semibold transition-colors border ${
              slotFilter === "LAST_SLOT"
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            Còn 1 suất cuối
          </button>
        </div>
      )}

      {/* Main Queue Content */}
      {boardQuery.isLoading ? (
        <WorkspaceLoading />
      ) : boardQuery.isError ? (
        <ScreeningError error={boardQuery.error} retry={() => void boardQuery.refetch()} />
      ) : board && filteredItems.length > 0 ? (
        <>
          <div className="queue-paper-grid">
            {filteredItems.map(p => {
              const round = p.round;
              const assignedCount = round?.assigned ?? 0;
              const requiredCount = round?.settings.requiredReviewers ?? 2;
              const remainingCount = Math.max(0, requiredCount - assignedCount);
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
                      {assignedCount === 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-xs">
                          Chưa ai nhận · Còn {requiredCount} suất
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 font-semibold text-xs">
                          {assignedCount} người đã nhận · {round?.completed ?? 0}/{requiredCount} phiếu đã gửi · Còn {remainingCount} suất
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

          {board && board.total > 0 && (
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
            {search ? "Không tìm thấy bài báo nào khớp với từ khóa" : "Hiện không có suất đánh giá phù hợp"}
          </h3>
          <p className="queue-empty-desc">
            {search
              ? "Hãy thử tìm kiếm bằng từ khóa khác hoặc xóa bộ lọc."
              : "Bài có thể đã đủ người nhận hoặc đang giải quyết bất đồng. Kiểm tra Việc của tôi và Thư viện để theo dõi tiếp."}
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
