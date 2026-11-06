import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "react-router-dom";
import { useResearchResource } from "../hooks/use-project-research";
import { screeningApi } from "../api/screening.api";
import { ScreeningPaperDetail } from "./screening-round";
import { ScreeningError } from "./screening-common";
import { canLeaveWorkspace, WorkspaceLoading } from "./workspace-common";
import { PaperNotesDialog } from "./paper-notes-dialog";

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
  const [showNotes, setShowNotes] = useState(false);
  const roundId = params.get("round");
  const section = params.get("section");
  const contentRef = useRef<HTMLDivElement>(null);

  const focusQuery = useResearchResource(
    projectId,
    ["paper-reading-modal", paperId, roundId],
    async () => {
      if (!paperId) return null;
      const result = await screeningApi.board(projectId, { source: paperId, filter: "ALL", pageSize: 1 });
      const found = result.items.find(i => i.paperId === paperId) ?? null;
      const requestedRound = roundId ? await screeningApi.detail(projectId, roundId) : null;
      if (requestedRound && requestedRound.paperId !== paperId) throw new Error("Vòng đánh giá không thuộc bài báo đang mở.");
      return {
        paper: found && requestedRound ? { ...found, round: requestedRound } : found,
        settings: result.settings,
        people: result.people,
      };
    },
    Boolean(paperId)
  );
  useEffect(() => {
    if (!focusQuery.data || !["review", "discussion", "history"].includes(section ?? "")) return;
    const selector = section === "history" ? ".paper-reading-assessment" : section === "discussion" ? '[data-screening-section="discussion"], .paper-discussion' : '[data-screening-section="review"]';
    const target = contentRef.current?.querySelector<HTMLElement>(selector);
    target?.scrollIntoView?.({ block: "center" });
    if (section !== "history") target?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  }, [focusQuery.data?.paper?.round?.id, section]);

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
    <>
      <Dialog open onOpenChange={async open => { if (!open && await canLeaveWorkspace()) onClose(); }}>
        <DialogContent
          ref={contentRef}
          closeLabel="Đóng"
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
              discussionRequested={section === "discussion"}
            />

            <footer className="library-dialog-footer">
              <div className="screening-actions">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNotes(true)}
                >
                  Ghi chú tài liệu
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
                    void canLeaveWorkspace().then(ok => { if (ok) setParams(next); });
                  }}
                >
                  Trích xuất vào ma trận minh chứng
                </Button>
              </div>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>

    {showNotes && focused && (
      <PaperNotesDialog
        projectId={projectId}
        paperId={focused.paperId}
        paperTitle={focused.title}
        initialNotes={focused.notes}
        updatedAt={focused.updatedAt}
        open={showNotes}
        onClose={() => setShowNotes(false)}
        readOnly={readOnly}
      />
    )}
  </>
  );
}
