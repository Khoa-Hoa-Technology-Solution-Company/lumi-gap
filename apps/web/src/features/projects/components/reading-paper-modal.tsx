import { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useResearchResource } from "../hooks/use-project-research";
import { screeningApi } from "../api/screening.api";
import { ScreeningPaperDetail } from "./screening-round";
import { ScreeningError } from "./screening-common";
import { WorkspaceLoading } from "./workspace-common";
import { LibraryRelatedPapers } from "./library-related-papers";

export function ReadingPaperModal({
  projectId,
  paperId,
  readOnly,
  onClose,
  paperIds,
  onSelectPaper,
}: {
  projectId: string;
  paperId: string | null;
  readOnly: boolean;
  onClose: () => void;
  paperIds?: string[];
  onSelectPaper?: (paperId: string) => void;
}) {
  const [params, setParams] = useSearchParams();

  const focusQuery = useResearchResource(
    projectId,
    ["paper-reading-modal", paperId],
    async () => {
      if (!paperId) return null;
      const result = await screeningApi.board(projectId, { source: paperId, filter: "ALL", pageSize: 1 });
      const found = result.items.find(i => i.paperId === paperId) ?? result.items[0] ?? null;
      return {
        paper: found,
        settings: result.settings,
        people: result.people,
      };
    },
    Boolean(paperId)
  );

  const currentIndex = paperIds && paperId ? paperIds.indexOf(paperId) : -1;

  useEffect(() => {
    if (!paperIds?.length || !onSelectPaper || currentIndex < 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && currentIndex > 0) {
        e.preventDefault();
        const prevId = paperIds[currentIndex - 1];
        if (prevId) onSelectPaper(prevId);
      } else if (e.key === "ArrowRight" && currentIndex < paperIds.length - 1) {
        e.preventDefault();
        const nextId = paperIds[currentIndex + 1];
        if (nextId) onSelectPaper(nextId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paperIds, currentIndex, onSelectPaper]);

  if (!paperId) return null;

  const data = focusQuery.data;
  const focused = data?.paper;
  const settings = data?.settings;
  const people = data?.people ?? [];

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className="screening-workspace library-paper-dialog"
        data-no-i18n
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div className="library-dialog-header">
          <DialogTitle>Đọc và đánh giá tài liệu</DialogTitle>
          <DialogDescription>
            Giữ riêng ý kiến cá nhân, đối chiếu tiêu chí và ghi nhận kết quả theo quy trình khoa học.
          </DialogDescription>
        </div>

        {paperIds && paperIds.length > 1 && onSelectPaper && (
          <nav className="paper-reading-navigation" aria-label="Chuyển bài báo">
            <Button
              size="sm"
              variant="outline"
              disabled={currentIndex <= 0}
              onClick={() => {
                const prev = paperIds[currentIndex - 1];
                if (prev) onSelectPaper(prev);
              }}
            >
              ← Bài trước
            </Button>
            <span className="paper-reading-counter">
              {currentIndex >= 0 ? `${currentIndex + 1} / ${paperIds.length} bài` : "Bài đang mở"}
              <kbd className="paper-nav-hint" title="Dùng phím mũi tên Trái / Phải để chuyển bài nhanh">← / →</kbd>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentIndex < 0 || currentIndex >= paperIds.length - 1}
              onClick={() => {
                const next = paperIds[currentIndex + 1];
                if (next) onSelectPaper(next);
              }}
            >
              Bài tiếp →
            </Button>
          </nav>
        )}

        {focusQuery.isLoading ? (
          <WorkspaceLoading />
        ) : focusQuery.isError ? (
          <ScreeningError error={focusQuery.error} retry={() => void focusQuery.refetch()} />
        ) : !focused ? (
          <p className="p-4 text-sm text-muted-foreground">
            Không tìm thấy thông tin bài báo trong dự án này.
          </p>
        ) : (
          <>
            <ScreeningPaperDetail
              settings={settings}
              collaborative={settings?.reviewMode === "COLLABORATIVE"}
              key={`modal-detail-${focused.paperId}`}
              projectId={projectId}
              paper={focused}
              people={people}
              readOnly={readOnly}
              relatedSection={
                <LibraryRelatedPapers
                  key={`modal-related-${focused.paperId}`}
                  projectId={projectId}
                  paperId={focused.paperId}
                  readOnly={readOnly}
                />
              }
            />

            <footer className="library-dialog-footer">
              <div className="screening-actions">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("view", "organize");
                    next.delete("paper");
                    setParams(next);
                    onClose();
                  }}
                >
                  Ghi chú, nhãn & nguồn
                </Button>
                <Button
                  size="sm"
                  disabled={focused.round?.finalDecision?.decision !== "INCLUDED" || focused.round?.extractionReady === false}
                  variant="outline"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("view", "evidence");
                    next.set("extract", focused.paperId);
                    next.delete("source");
                    next.delete("paper");
                    setParams(next);
                    onClose();
                  }}
                >
                  Trích xuất vào ma trận minh chứng
                </Button>
              </div>
              {(focused.round?.finalDecision?.decision !== "INCLUDED" || focused.round?.extractionReady === false) && (
                <p className="text-xs text-muted-foreground">
                  Trích xuất mở sau khi hoàn thành quy trình và có quyết định đưa vào phân tích. Minh chứng đã lưu vẫn được giữ khi thay đổi lựa chọn.
                </p>
              )}
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
