import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize2,
  Minimize2,
  Quote,
  StickyNote,
  Table2,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "react-router-dom";
import { useResearchResource } from "../hooks/use-project-research";
import { screeningApi } from "../api/screening.api";
import { ScreeningPaperDetail } from "./screening-round";
import { ScreeningError } from "./screening-common";
import { canLeaveWorkspace, WorkspaceLoading } from "./workspace-common";
import { PaperNotesDialog } from "./paper-notes-dialog";
import { cn } from "@/utils/cn";

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
  const [expandedReading, setExpandedReading] = useState(false);
  const [mobilePane, setMobilePane] = useState<"reading" | "assessment">("reading");
  const [copiedCitation, setCopiedCitation] = useState(false);
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

  // Switch mobile pane automatically if deep-linked to review/discussion/history
  useEffect(() => {
    if (["review", "discussion", "history"].includes(section ?? "")) {
      setMobilePane("assessment");
    } else {
      setMobilePane("reading");
    }
  }, [paperId, section]);

  useEffect(() => {
    if (!focusQuery.data || !["review", "discussion", "history"].includes(section ?? "")) return;
    const selector =
      section === "history"
        ? ".paper-reading-assessment"
        : section === "discussion"
          ? '[data-screening-section="discussion"], .paper-discussion'
          : '[data-screening-section="review"]';
    // Focus without abruptly scrolling past Screening Context & Frozen Criteria on desktop.
    const timer = window.setTimeout(() => {
      const target = contentRef.current?.querySelector<HTMLElement>(selector);
      if (section === "discussion") {
        target?.scrollIntoView?.({ block: "nearest" });
      }
      if (section !== "history") {
        target
          ?.querySelector<HTMLElement>("textarea:not(:disabled), input:not(:disabled), select:not(:disabled), button:not(:disabled)")
          ?.focus({ preventScroll: true });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusQuery.data?.paper?.round?.id, section]);

  const currentIndex = paperIds && paperId ? paperIds.indexOf(paperId) : -1;
  const hasPrevPaper = Boolean(paperIds?.length && onSelectPaper && currentIndex > 0);
  const hasNextPaper = Boolean(paperIds?.length && onSelectPaper && currentIndex >= 0 && currentIndex < paperIds.length - 1);

  const navigateToPaper = async (nextPaperId: string | undefined) => {
    if (!nextPaperId || !onSelectPaper) return;
    if (!(await canLeaveWorkspace())) return;
    onSelectPaper(nextPaperId);
  };

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
        if (prevId) void canLeaveWorkspace().then(ok => { if (ok) onSelectPaper(prevId); });
      } else if (e.key === "ArrowRight" && currentIndex < paperIds.length - 1) {
        e.preventDefault();
        const nextId = paperIds[currentIndex + 1];
        if (nextId) void canLeaveWorkspace().then(ok => { if (ok) onSelectPaper(nextId); });
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

  const round = focused?.round;
  const phaseLabel = round
    ? round.phase === "FULL_TEXT"
      ? "Sàng lọc toàn văn"
      : "Sàng lọc tiêu đề & tóm tắt"
    : "Chưa mở vòng sàng lọc";

  const canExtract =
    focused?.round?.finalDecision?.decision === "INCLUDED" &&
    focused?.round?.extractionReady !== false;

  const extractionDisabledReason = !focused?.round?.finalDecision
    ? "Khả dụng sau khi tài liệu được lựa chọn chính thức."
    : focused.round.finalDecision.decision !== "INCLUDED"
    ? "Chỉ khả dụng cho tài liệu được chọn vào tập phân tích."
    : "Cần hoàn tất đánh giá toàn văn trước khi trích xuất minh chứng.";

  const formatApaCitation = () => {
    if (!focused) return "";
    const authorStr = focused.authors?.length
      ? focused.authors.length > 3
        ? `${focused.authors[0]} et al.`
        : focused.authors.join(", ")
      : "Không rõ tác giả";
    const yearStr = focused.publicationYear ? ` (${focused.publicationYear})` : "";
    const titleStr = focused.title ? ` ${focused.title.replace(/\.$/, "")}.` : "";
    const journalStr = focused.journalName ? ` ${focused.journalName}.` : "";
    const doiStr = focused.doi ? ` https://doi.org/${focused.doi}` : "";
    return `${authorStr}${yearStr}.${titleStr}${journalStr}${doiStr}`.trim();
  };

  const handleCopyCitation = async () => {
    const apa = formatApaCitation();
    if (!apa) return;
    try {
      await navigator.clipboard.writeText(apa);
      setCopiedCitation(true);
      toast.success("Đã sao chép trích dẫn chuẩn APA.");
      window.setTimeout(() => setCopiedCitation(false), 2000);
    } catch {
      toast.error("Không thể sao chép trích dẫn.");
    }
  };

  const externalSourceHref = focused?.paperLink
    ? focused.paperLink
    : focused?.doi && /^10\.\d{4,9}\/\S+$/i.test(focused.doi)
    ? `https://doi.org/${encodeURIComponent(focused.doi)}`
    : null;

  const externalSourceLabel =
    focused?.fullTextStatus === "EXTERNAL_PDF_LINK"
      ? "Mở liên kết PDF"
      : focused?.doi && !focused?.paperLink
      ? "Mở DOI"
      : "Mở trang nguồn";

  const advanceToNextAfterSubmit = hasNextPaper && onSelectPaper
    ? () => {
        const nextId = paperIds![currentIndex + 1];
        if (nextId) onSelectPaper(nextId);
      }
    : undefined;

  return (
    <>
      <Dialog open onOpenChange={async open => { if (!open && await canLeaveWorkspace()) onClose(); }}>
        <DialogContent
          ref={contentRef}
          closeLabel="Đóng"
          className="screening-workspace library-paper-dialog"
          data-no-i18n
          onOpenAutoFocus={e => { if (section === "review" || section === "discussion") e.preventDefault(); }}
        >
          {/* 1. Persistent Simplified Workspace Header */}
          <div className="library-dialog-header">
            <div className="flex flex-col gap-2.5 pr-9 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-semibold text-primary">
                    Đọc và đánh giá tài liệu
                  </span>
                  {focused && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-foreground/80">{phaseLabel}</span>
                    </>
                  )}
                </div>

                <DialogTitle className="text-[17px] font-bold leading-snug text-foreground line-clamp-3">
                  {focused?.title || "Đọc và đánh giá tài liệu"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Đọc nguồn tài liệu, đối chiếu tiêu chí nghiên cứu và gửi phiếu đánh giá độc lập theo quy trình khoa học.
                </DialogDescription>
              </div>

              {focused && (
                <div className="flex flex-wrap items-center gap-1.5 shrink-0 pt-0.5">
                  {paperIds && paperIds.length > 1 && onSelectPaper && (
                    <nav
                      className="inline-flex items-center rounded-md border border-border bg-muted/35 p-0.5 mr-1"
                      aria-label="Chuyển bài báo trong hàng đợi"
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs gap-1"
                        disabled={!hasPrevPaper}
                        title="Bài trước (Phím mũi tên trái ←)"
                        onClick={() => void navigateToPaper(paperIds[currentIndex - 1])}
                      >
                        <ChevronLeft size={14} aria-hidden="true" />
                        <span className="hidden xl:inline">Bài trước</span>
                      </Button>
                      <span className="px-2 text-xs font-medium tabular-nums text-muted-foreground">
                        {currentIndex >= 0 ? `${currentIndex + 1} / ${paperIds.length}` : "—"}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs gap-1"
                        disabled={!hasNextPaper}
                        title="Bài tiếp theo (Phím mũi tên phải →)"
                        onClick={() => void navigateToPaper(paperIds[currentIndex + 1])}
                      >
                        <span className="hidden xl:inline">Bài tiếp</span>
                        <ChevronRight size={14} aria-hidden="true" />
                      </Button>
                    </nav>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="hidden lg:inline-flex h-8 gap-1.5 px-2.5 text-xs"
                    title={expandedReading ? "Trở về tỷ lệ đọc chuẩn" : "Mở rộng khung đọc tài liệu"}
                    onClick={() => setExpandedReading(v => !v)}
                  >
                    {expandedReading ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    <span>{expandedReading ? "Thu gọn" : "Mở rộng đọc"}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    title="Sao chép trích dẫn chuẩn APA"
                    onClick={() => void handleCopyCitation()}
                  >
                    {copiedCitation ? <Check size={14} className="text-emerald-600" /> : <Quote size={14} />}
                    <span>{copiedCitation ? "Đã chép" : "Trích dẫn"}</span>
                  </Button>
                  {externalSourceHref && (
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
                      <a href={externalSourceHref} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} />
                        <span>{externalSourceLabel}</span>
                      </a>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground">
                    <a href={`/papers/${encodeURIComponent(focused.paperId)}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} />
                      <span>Hồ sơ bài báo</span>
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {focused && (
            <div className="paper-mobile-pane-switcher" role="tablist" aria-label="Chuyển vùng làm việc trên màn hình nhỏ">
              <button
                type="button"
                role="tab"
                aria-selected={mobilePane === "reading"}
                className={cn("paper-mobile-pane-btn", mobilePane === "reading" && "is-active")}
                onClick={() => setMobilePane("reading")}
              >
                Đọc tài liệu
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobilePane === "assessment"}
                className={cn("paper-mobile-pane-btn", mobilePane === "assessment" && "is-active")}
                onClick={() => setMobilePane("assessment")}
              >
                Đánh giá &amp; Tiêu chí
              </button>
            </div>
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
                onBack={onClose}
                settings={settings}
                collaborative={settings?.reviewMode === "COLLABORATIVE"}
                key={`modal-detail-${focused.paperId}`}
                projectId={projectId}
                paper={focused}
                people={people}
                readOnly={readOnly}
                discussionRequested={section === "discussion"}
                hideTitleInLeft
                mobilePane={mobilePane}
                expandedReading={expandedReading}
                onSwitchMobilePane={setMobilePane}
                onSubmittedAdvance={advanceToNextAfterSubmit}
              />

              {/* 4. Compact Contextual Footer with adjacent extraction explanation */}
              <footer className="library-dialog-footer">
                <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setShowNotes(true)}
                  >
                    <StickyNote size={14} />
                    Ghi chú tài liệu
                  </Button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={!canExtract}
                      title={canExtract ? "Mở ma trận minh chứng để trích xuất dữ liệu từ bài báo này" : extractionDisabledReason}
                      variant={canExtract ? "default" : "outline"}
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => {
                        const next = new URLSearchParams(params);
                        next.set("view", "evidence");
                        next.set("extract", focused.paperId);
                        next.delete("source");
                        next.delete("paper");
                        void canLeaveWorkspace().then(ok => { if (ok) setParams(next); });
                      }}
                    >
                      <Table2 size={14} />
                      Trích xuất vào ma trận minh chứng
                    </Button>
                    {!canExtract && (
                      <span className="text-xs text-muted-foreground">
                        {extractionDisabledReason}
                      </span>
                    )}
                  </div>
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
