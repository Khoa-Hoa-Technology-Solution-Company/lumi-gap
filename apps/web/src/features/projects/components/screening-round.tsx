import { ProjectPaperAnalysis } from "./project-paper-analysis";
import { ScreeningStatusBadge } from "./screening-status-badge";
import { ScreeningDecisionChoices, screeningReviewOptions } from "./screening-decision-choices";
import { screeningChoiceTone, screeningStatusTone } from "../screening-status";
import { ScreeningTaskGuard } from "./screening-task-feedback";
import { RoundHistory, ReviewVersionHistory } from "./screening-round-history";
export { RoundHistory } from "./screening-round-history";
import { ScreeningCaseStatus } from "./screening-case-status";
import { ScreeningConflictResolution } from "./screening-conflict-resolution";
import { ScreeningAgreementPanel } from "./screening-agreement";
import { ScreeningPacketPreview } from "./screening-adjudication";
import { LibraryAssessment } from "./library-assessment";
import { LegacyScreeningRepair } from "./screening-legacy-repair";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles, RotateCcw, FileText, ExternalLink, Globe, Copy, Check, Quote, Tag, CheckCircle2, Bookmark, BookOpen, Info, Users, AlertTriangle, Edit3 } from "lucide-react";
import { toast } from "sonner";
import type { ScreeningChoice, ScreeningPaperRow, ScreeningRoundView, ScreeningSettings, WorkspacePerson } from "@trend/shared-types";
import { AssessmentContextFields, initialAssessmentContext, ReviewContextSummary } from "./assessment-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { researchApi } from "../api/project-research.api";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { useUnsavedWorkspace, canLeaveWorkspace } from "./workspace-common";
import { choiceLabels, screeningMetadataWarning, ScreeningError, ScreeningPager, ScreeningStatus, useScreeningCommand, isConflictedRound } from "./screening-common";

export function ScreeningPaperDetail({ projectId, paper, people, readOnly, collaborative = false, settings, relatedSection: _relatedSection, discussionRequested = false, onBack }: { onBack?: () => void; discussionRequested?: boolean; settings?: ScreeningSettings; collaborative?: boolean; projectId: string; paper: ScreeningPaperRow; people: WorkspacePerson[]; readOnly: boolean; relatedSection?: ReactNode }) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const assessmentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (overviewRef.current) {
      if (typeof overviewRef.current.scrollTo === "function") {
        overviewRef.current.scrollTo({ top: 0, behavior: "instant" });
      } else {
        overviewRef.current.scrollTop = 0;
      }
    }
    if (assessmentRef.current) {
      if (typeof assessmentRef.current.scrollTo === "function") {
        assessmentRef.current.scrollTo({ top: 0, behavior: "instant" });
      } else {
        assessmentRef.current.scrollTop = 0;
      }
    }
  }, [paper.paperId]);

  const [roundPage, setRoundPage] = useState(1), [pastId, setPastId] = useState<string | null>(null);
  const [copiedCitation, setCopiedCitation] = useState(false);
  const [copiedDoi, setCopiedDoi] = useState(false);
  const [copiedAbstract, setCopiedAbstract] = useState(false);
  const [abstractSize, setAbstractSize] = useState<"sm" | "base" | "lg">("base");
  const [showFullAuthors, setShowFullAuthors] = useState(false);

  const past = useResearchResource(projectId, ["screening-rounds", paper.paperId, roundPage], () => screeningApi.rounds(projectId, paper.paperId, roundPage));
  const current = paper.round;
  const round = pastId ? past.data?.items.find(r => r.id === pastId) : current;
  const metadataWarning = screeningMetadataWarning(paper);

  const copyText = async (text: string, label: string, setSuccess: (val: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setSuccess(true);
      toast.success(label);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      toast.error("Không thể sao chép");
    }
  };

  const formatApaCitation = () => {
    const authorStr = paper.authors?.length
      ? paper.authors.length > 3
        ? `${paper.authors[0]} et al.`
        : paper.authors.join(", ")
      : "Không rõ tác giả";
    const yearStr = paper.publicationYear ? ` (${paper.publicationYear})` : "";
    const titleStr = paper.title ? ` ${paper.title.replace(/\.$/, "")}.` : "";
    const journalStr = paper.journalName ? ` ${paper.journalName}.` : "";
    const doiStr = paper.doi ? ` https://doi.org/${paper.doi}` : "";
    return `${authorStr}${yearStr}.${titleStr}${journalStr}${doiStr}`.trim();
  };

  return (
    <section className="screening-detail paper-reading-layout" aria-label="Chi tiết sàng lọc">
      <div ref={overviewRef} className="paper-reading-overview">
        {/* Tiêu đề & Thông tin cốt lõi */}
        <div className="paper-reading-header-block">
          <h3 className="paper-reading-title">{paper.title}</h3>

          {/* Dòng metadata thanh lịch: Năm · Tạp chí · Tác giả · DOI */}
          <div className="paper-reading-byline">
            <div className="paper-byline-line1">
              {paper.publicationYear && <span className="font-semibold text-foreground">{paper.publicationYear}</span>}
              {paper.journalName && (
                <>
                  <span className="paper-byline-sep">·</span>
                  <span className="font-medium text-foreground/90" title={paper.journalName}>{paper.journalName}</span>
                </>
              )}
            </div>
            <div className="paper-byline-line2">
              <span className="paper-byline-authors-text">
                {paper.authors?.length
                  ? showFullAuthors || paper.authors.length <= 2
                    ? paper.authors.join(", ")
                    : `${paper.authors[0]} và cộng sự`
                  : "Chưa rõ tác giả"}
              </span>
              {paper.authors && paper.authors.length > 2 && (
                <button
                  type="button"
                  className="paper-authors-toggle-inline"
                  onClick={() => setShowFullAuthors(v => !v)}
                >
                  {showFullAuthors ? "(Thu gọn)" : `(+ ${paper.authors.length - 1} tác giả)`}
                </button>
              )}
              {paper.doi && (
                <>
                  <span className="paper-byline-sep">·</span>
                  {/^10\.\d{4,9}\/\S+$/i.test(paper.doi) ? (
                    <a
                      href={`https://doi.org/${encodeURIComponent(paper.doi)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="paper-byline-doi-link hover:underline"
                      title={`DOI: ${paper.doi}`}
                    >
                      DOI
                    </a>
                  ) : (
                    <span className="paper-byline-doi-text">DOI: {paper.doi}</span>
                  )}
                </>
              )}
              <span className={`paper-badge-access ${paper.fullTextAvailable ? "paper-badge-fulltext" : "paper-badge-abstract"}`}>
                {paper.fullTextAvailable ? "Có toàn văn" : "Đánh giá từ tóm tắt"}
              </span>
            </div>
          </div>

          {/* Thanh tác vụ chính: Đọc toàn văn & Trích dẫn & Hồ sơ bài báo */}
          <div className="paper-reading-actions-bar">
            <div className="paper-actions-primary-group">
              {paper.fullTextAvailable && (paper.paperLink || paper.doi) ? (
                <Button asChild size="sm" className="paper-btn-read-full">
                  <a
                    href={paper.paperLink || (paper.doi ? `https://doi.org/${encodeURIComponent(paper.doi)}` : "#")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <BookOpen size={14} className="mr-1.5" />
                    Đọc toàn văn
                  </a>
                </Button>
              ) : paper.doi ? (
                <Button asChild size="sm" variant="outline" className="paper-btn-read-full">
                  <a
                    href={`https://doi.org/${encodeURIComponent(paper.doi)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Globe size={14} className="mr-1.5" />
                    Mở nguồn DOI
                  </a>
                </Button>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="paper-btn-quick-cite"
                title="Sao chép trích dẫn chuẩn APA"
                onClick={() => void copyText(formatApaCitation(), "Đã sao chép trích dẫn APA!", setCopiedCitation)}
              >
                {copiedCitation ? <Check size={13} className="mr-1.5 text-emerald-600" /> : <Quote size={13} className="mr-1.5" />}
                <span>{copiedCitation ? "Đã chép trích dẫn" : "Trích dẫn"}</span>
              </Button>

              {paper.doi && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="paper-btn-quick-copy"
                  title="Sao chép đường dẫn DOI"
                  onClick={() => void copyText(`https://doi.org/${paper.doi}`, "Đã sao chép DOI!", setCopiedDoi)}
                >
                  {copiedDoi ? <Check size={12} className="mr-1 text-emerald-600" /> : <Copy size={12} />}
                  <span>{copiedDoi ? "Đã chép DOI" : "Chép DOI"}</span>
                </Button>
              )}

              <Button asChild variant="ghost" size="sm" className="paper-btn-quick-record">
                <a href={`/papers/${encodeURIComponent(paper.paperId)}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} className="mr-1 text-muted-foreground" />
                  <span>Hồ sơ bài báo</span>
                </a>
              </Button>
            </div>
          </div>

          {metadataWarning && <p className="screening-notice" role="status">{metadataWarning}</p>}
        </div>

        {/* TÓM TẮT (ABSTRACT) - ĐƯỢC ƯU TIÊN LÊN NGAY SAU TIÊU ĐỀ */}
        <div className="paper-reading-abstract-card">
          <div className="paper-abstract-header">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
              <FileText size={14} className="text-primary" />
              <span>Tóm tắt (Abstract)</span>
            </div>
            <div className="flex items-center gap-2">
              {Boolean(paper.abstractText) && (
                <span className="text-xs text-muted-foreground font-normal">
                  {paper.abstractText!.split(/\s+/).filter(Boolean).length} từ · ~{Math.max(1, Math.round(paper.abstractText!.split(/\s+/).filter(Boolean).length / 180))} phút đọc
                </span>
              )}
              {Boolean(paper.abstractText) && (
                <button
                  type="button"
                  className="paper-abstract-copy-btn"
                  title="Sao chép toàn bộ đoạn tóm tắt"
                  onClick={() => void copyText(paper.abstractText!, "Đã sao chép tóm tắt bài báo!", setCopiedAbstract)}
                >
                  {copiedAbstract ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span className="text-[11px]">{copiedAbstract ? "Đã chép" : "Chép tóm tắt"}</span>
                </button>
              )}
              <div className="paper-font-size-switcher" role="group" aria-label="Cỡ chữ tóm tắt">
                <button
                  type="button"
                  className={`paper-font-btn ${abstractSize === "sm" ? "active" : ""}`}
                  title="Cỡ chữ nhỏ"
                  onClick={() => setAbstractSize("sm")}
                >
                  A-
                </button>
                <button
                  type="button"
                  className={`paper-font-btn ${abstractSize === "base" ? "active" : ""}`}
                  title="Cỡ chữ chuẩn"
                  onClick={() => setAbstractSize("base")}
                >
                  A
                </button>
                <button
                  type="button"
                  className={`paper-font-btn ${abstractSize === "lg" ? "active" : ""}`}
                  title="Cỡ chữ lớn"
                  onClick={() => setAbstractSize("lg")}
                >
                  A+
                </button>
              </div>
            </div>
          </div>
          <div className="screening-abstract-body">
            <p className={`screening-abstract abstract-size-${abstractSize}`}>
              {paper.abstractText || "Chưa có tóm tắt. Hãy đọc nguồn hợp lệ trước khi đánh giá."}
            </p>
          </div>
        </div>

        {/* AI PAPER INSIGHT PANEL: Vấn đề, Phương pháp, Kết quả, Hạn chế, Mức độ liên quan RQ & Minh chứng */}
        <details className="paper-secondary-meta-details" open>
          <summary className="paper-secondary-meta-summary">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Sparkles size={13} className="shrink-0 text-primary" />
              <span>AI Paper Insight · Vấn đề, Phương pháp, Kết quả, Hạn chế & Minh chứng</span>
              <span className="paper-meta-summary-pill">
                {paper.fullTextAvailable ? "Có toàn văn" : "Chỉ từ tóm tắt (Abstract-only)"}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground/80">Ẩn/Hiện ▾</span>
          </summary>
          <div className="paper-secondary-meta-body pt-3">
            <ProjectPaperAnalysis
              projectId={projectId}
              paperId={paper.paperId}
              readOnly={readOnly}
              paper={paper}
            />
          </div>
        </details>

        {/* THU GỌN: Chỉ số trích dẫn, Loại bài, Quyền truy cập & Keywords */}
        {(Boolean(paper.keywords?.length) || Boolean(paper.tags?.length) || typeof paper.citationCount === "number" || paper.paperKind || paper.importSource) && (
          <details className="paper-secondary-meta-details">
            <summary className="paper-secondary-meta-summary">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Info size={13} className="shrink-0 text-muted-foreground" />
                <span>Thông tin bổ sung & Từ khóa</span>
                {typeof paper.citationCount === "number" && paper.citationCount > 0 && (
                  <span className="paper-meta-summary-pill">{paper.citationCount} trích dẫn</span>
                )}
                {Boolean(paper.keywords?.length) && (
                  <span className="paper-meta-summary-pill">{paper.keywords!.length} từ khóa</span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground/80">Chi tiết ▾</span>
            </summary>
            <div className="paper-secondary-meta-body">
              <div className="paper-meta-grid">
                {typeof paper.citationCount === "number" && paper.citationCount > 0 && (
                  <div className="paper-meta-item">
                    <span className="paper-meta-item-label">Lượt trích dẫn:</span>
                    <span className="paper-meta-item-value font-semibold text-amber-600 dark:text-amber-400">
                      <Quote size={11} className="inline mr-1" />
                      {paper.citationCount}
                    </span>
                  </div>
                )}
                {paper.paperKind && (
                  <div className="paper-meta-item">
                    <span className="paper-meta-item-label">Loại bài báo:</span>
                    <span className="paper-meta-item-value">
                      {paper.paperKind === "article" ? "Bài báo khoa học" : paper.paperKind === "review" ? "Bài tổng quan" : paper.paperKind === "conference" ? "Kỷ yếu hội nghị" : paper.paperKind}
                    </span>
                  </div>
                )}
                {paper.openAccessStatus && paper.openAccessStatus !== "unknown" && paper.openAccessStatus !== "closed" && (
                  <div className="paper-meta-item">
                    <span className="paper-meta-item-label">Truy cập mở:</span>
                    <span className="paper-meta-item-value">
                      Open Access ({paper.openAccessStatus})
                    </span>
                  </div>
                )}
                {paper.importSource && (
                  <div className="paper-meta-item">
                    <span className="paper-meta-item-label">Nguồn nhập:</span>
                    <span className="paper-meta-item-value">{paper.importSource}</span>
                  </div>
                )}
              </div>

              {Boolean(paper.keywords?.length) && (
                <div className="paper-meta-tags-block">
                  <span className="paper-meta-tags-label">
                    <Bookmark size={11} className="inline mr-1 text-muted-foreground" />
                    Từ khóa:
                  </span>
                  <div className="paper-chips-wrap">
                    {paper.keywords!.map(kw => (
                      <span key={kw} className="paper-keyword-pill">{kw}</span>
                    ))}
                  </div>
                </div>
              )}

              {Boolean(paper.tags?.length) && (
                <div className="paper-meta-tags-block">
                  <span className="paper-meta-tags-label">
                    <Tag size={11} className="inline mr-1 text-primary" />
                    Nhãn nhóm:
                  </span>
                  <div className="paper-chips-wrap">
                    {paper.tags!.map(tag => (
                      <span key={tag} className="paper-tag-pill">#{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}



        {/* Ghi chú nội bộ nếu có */}
        {paper.notes && (
          <div className="paper-notes-card">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <FileText size={13} className="text-amber-500" />
              Ghi chú nội bộ
            </h4>
            <p className="text-xs text-foreground bg-muted/40 p-2.5 rounded-md border border-border/60">
              {paper.notes}
            </p>
          </div>
        )}

        {/* Người đề xuất */}
        <div className="paper-proposer-card">
          <p className="text-xs text-muted-foreground">
            Đề xuất bởi <strong className="text-foreground">{paper.proposer?.name ?? "Không có thông tin lịch sử"}</strong> · {new Date(paper.proposedAt).toLocaleString("vi-VN")}
          </p>
        </div>

        <ProposalReason key={paper.paperId} projectId={projectId} paper={paper} readOnly={readOnly} />

        {past.isError && <ScreeningError error={past.error} retry={() => void past.refetch()} />}
        {past.data?.legacy && (
          <details className="paper-legacy-details">
            <summary>Phân loại đã lưu trước đây</summary>
            <div className="paper-legacy-body">
              <p>Trạng thái: <strong>{legacyLabel(String(past.data.legacy.status))}</strong>. Đây là dữ liệu lịch sử, không suy diễn có đánh giá độc lập khi chưa có minh chứng.</p>
              {typeof past.data.legacy.inclusionReason === "string" && <p>{past.data.legacy.inclusionReason}</p>}
              {typeof past.data.legacy.exclusionNote === "string" && <p>{past.data.legacy.exclusionNote}</p>}
            </div>
          </details>
        )}
        {Boolean(past.data?.items.length && past.data.total > 1) && (
          <details className="paper-rounds-details">
            <summary>Các vòng sàng lọc ({past.data!.total})</summary>
            <div className="paper-rounds-body">
              <div className="screening-actions">
                <Button variant={!pastId ? "default" : "outline"} size="sm" onClick={() => void canLeaveWorkspace().then(ok => { if (ok) setPastId(null); })}>Vòng hiện tại</Button>
                {past.data!.items.filter(r => !r.active).map(r => (
                  <Button key={r.id} variant={pastId === r.id ? "default" : "outline"} size="sm" onClick={() => void canLeaveWorkspace().then(ok => { if (ok) setPastId(r.id); })}>
                    Vòng {r.number}
                  </Button>
                ))}
              </div>
              <ScreeningPager page={roundPage} total={past.data!.total} hasNext={past.data!.hasNext} onPage={p => void canLeaveWorkspace().then(ok => { if (ok) { setPastId(null); setRoundPage(p); } })} />
            </div>
          </details>
        )}
      </div>

      <div ref={assessmentRef} className="paper-reading-assessment">
        {round ? (
          <RoundContent onBack={onBack} key={round.id} discussionRequested={discussionRequested} projectId={projectId} initial={round} paper={paper} people={people} readOnly={readOnly || !round.active && !round.canManage} newRoundPhase={settings?.stages?.[0] ?? "TITLE_ABSTRACT"} />
        ) : collaborative && settings ? (
          <LibraryAssessment projectId={projectId} paperId={paper.paperId} round={null} settings={settings} readOnly={readOnly} />
        ) : (
          <BeginScreening key={paper.paperId} projectId={projectId} paper={paper} readOnly={readOnly} />
        )}
      </div>
    </section>
  );
}

function BeginScreening({ projectId, paper, readOnly }: { projectId: string; paper: ScreeningPaperRow; readOnly: boolean }) {
  const command = useScreeningCommand(projectId), [confirmed, setConfirmed] = useState(false);
  return <div className="space-y-3"><p>Bắt đầu đánh giá và tự phân công reviewer theo quy trình của dự án.</p>{paper.legacyProvenance && <label className="screening-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Mở quy trình mới; giữ kết quả cũ trong lịch sử.</label>}<Button disabled={readOnly || command.isPending || paper.legacyProvenance && !confirmed} onClick={() => { const payload = { confirmRescreen: confirmed }; void command.run({ paperId: paper.paperId, ...payload }, clientKey => screeningApi.begin(projectId, paper.paperId, { ...payload, clientKey })); }}>Bắt đầu đánh giá độc lập</Button><ScreeningError error={command.error} /></div>;
}
function ConservativeAdvance({ projectId, round, readOnly }: { projectId: string; round: ScreeningRoundView; readOnly: boolean }) {
  const [reason, setReason] = useState(""), [version, setVersion] = useState(round.version), [confirmed, setConfirmed] = useState(false);
  const command = useScreeningCommand(projectId); useUnsavedWorkspace(Boolean(reason) || command.isPending);
  if (!round.canAdvanceConservatively && !reason) return null;
  return <details><summary>Đọc toàn văn để làm rõ bất đồng</summary><form className="screening-form mt-3" onSubmit={async e => { e.preventDefault(); if (!round.canAdvanceConservatively || !confirmed || version !== round.version) return; const payload = { reason, confirmed: true, expectedVersion: version }; if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.advanceConservatively(projectId, round.id, { ...payload, clientKey }))) { setReason(""); setConfirmed(false); } }}><p>Quy trình cho phép chuyển bước vì chưa có người phân xử đủ điều kiện. Hai phiếu và bất đồng ở vòng tóm tắt vẫn được lưu; bài chưa được chọn cho phân tích.</p><label>Lý do cần đọc toàn văn<textarea value={reason} minLength={10} maxLength={2000} required onChange={e => { if (!reason) setVersion(round.version); setReason(e.target.value); setConfirmed(false); }} /></label><label className="screening-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Tôi hiểu bước này không xác nhận đã giải quyết bất đồng.</label>{version !== round.version && <Button type="button" variant="outline" onClick={() => { setVersion(round.version); setConfirmed(false); }}>Tôi đã kiểm tra vòng hiện tại</Button>}<Button disabled={readOnly || !round.canAdvanceConservatively || command.isPending || !confirmed || version !== round.version || reason.trim().length < 10}>Chuyển sang đọc toàn văn</Button><ScreeningError error={command.error} /></form></details>;
}

function legacyLabel(status: string) { return status === "INCLUDED" ? "Phù hợp" : status === "EXCLUDED" ? "Không phù hợp" : status === "BACKGROUND" ? "Tài liệu tham khảo nền" : status === "MAYBE" ? "Đang xem xét" : "Chưa xem xét"; }

function RoundContent(props: Parameters<typeof RoundContentInner>[0]) {
  return <ScreeningTaskGuard projectId={props.projectId} roundId={props.initial.id}><RoundContentInner {...props} /></ScreeningTaskGuard>;
}
function RoundContentInner({ projectId, initial, paper, people, readOnly: projectReadOnly, newRoundPhase, discussionRequested = false, onBack }: { onBack?: () => void; discussionRequested?: boolean; projectId: string; initial: ScreeningRoundView; paper?: ScreeningPaperRow; people: WorkspacePerson[]; readOnly: boolean; newRoundPhase: "TITLE_ABSTRACT" | "FULL_TEXT" }) {
  const data = useResearchResource(projectId, ["screening-round", initial.id], () => screeningApi.detail(projectId, initial.id), true, r => Boolean(r?.active && !r.finalDecision));
  const round = data.data ?? initial;
  const readOnly = projectReadOnly || Boolean(round.legacyNeedsAudit);
  const [hadReviewAccess, setHadReviewAccess] = useState(initial.canReview && !initial.legacyNeedsAudit);
  const [hadManagementAccess, setHadManagementAccess] = useState(initial.canManage || initial.canFinalize || Boolean(initial.canDefer));
  const [isEditingVote, setIsEditingVote] = useState(false);
  useEffect(() => {
    if (round.canReview && !round.legacyNeedsAudit) setHadReviewAccess(true);
    if (round.canManage || round.canFinalize || round.canDefer || round.canReopenOwn) setHadManagementAccess(true);
  }, [round.canReview, round.canManage, round.canFinalize, round.canDefer, round.canReopenOwn, round.legacyNeedsAudit]);

  const legacyNotice = round.legacyNeedsAudit && <LegacyScreeningRepair projectId={projectId} paperId={round.paperId} phase={newRoundPhase} canManage={!projectReadOnly && round.active && round.canManage} />;

  const conflicted = isConflictedRound(round);
  const canEditOwnVote = !readOnly && Boolean(round.active && !round.finalDecision && !conflicted && !round.unblindedAt && round.completed < 2 && !round.assignments.some(a => a.id !== round.myAssignmentId && a.completed) && round.myAssignmentId && round.myReview);
  const ownVoteInTeam = !round.hiddenReviews && !canEditOwnVote && Boolean(round.myReview && round.reviews.some(review => review.assignmentId === round.myAssignmentId));

  const isTeamScreening = round.settings?.workflowKind === "TEAM_SCREENING";
  const roundHeaderLabel = isTeamScreening
    ? (round.number > 1 ? `Đánh giá mức độ phù hợp (Lần ${round.number})` : "Đánh giá mức độ phù hợp")
    : `Vòng ${round.number} · ${round.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề và tóm tắt"}`;

  if (round.status === "CLOSED_UNRESOLVED") {
    return (
      <ClosedUnresolvedRound
        projectId={projectId}
        round={round}
        people={people}
        readOnly={readOnly}
      />
    );
  }

  if (round.status === "WAITING_FULLTEXT") return <section data-screening-section="review" className="space-y-4">
    <h4 className="font-semibold">Qua vòng tiêu đề / tóm tắt · Chờ toàn văn</h4>
    <p className="text-sm text-muted-foreground">Bài chưa được chấp nhận cuối. Đính kèm PDF trong phần tài liệu nguồn. Khi có toàn văn, mở vòng mới với hai phiếu độc lập.</p>
    {round.canResumeFullText && <ResumeFullText projectId={projectId} round={round} />}
    <RoundHistory projectId={projectId} round={round} people={people} readOnly />
    {round.canManage && <OwnerActions projectId={projectId} round={round} people={people} readOnly={readOnly} />}
  </section>;

  if (round.settings.reviewMode === "COLLABORATIVE" && (!conflicted || Boolean(round.finalDecision))) {
    const includeCount = round.reviews.filter(r => r.decision === "INCLUDE").length;
    const excludeCount = round.reviews.filter(r => r.decision === "EXCLUDE").length;
    const unsureCount = round.reviews.filter(r => r.decision === "UNSURE").length;
    const isUnanimous = round.reviews.length > 1 && (includeCount === round.reviews.length || excludeCount === round.reviews.length);
    const hasDisagreement = round.reviews.length > 1 && !isUnanimous;

    return (
      <div className="space-y-3">
        {legacyNotice}
        {data.isError && <ScreeningError error={data.error} retry={() => void data.refetch()} />}
        <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-muted/40 border border-border/60">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Users size={14} className="text-primary shrink-0" />
            <span>Đánh giá cộng tác</span>
          </div>
          <div className="text-muted-foreground">
            Người phụ trách chọn bài: <strong className="text-foreground">{round.finalizer.name}</strong>
          </div>
        </div>

        {(!round.finalDecision || !ownVoteInTeam) && <LibraryAssessment projectId={projectId} paperId={round.paperId} round={round} settings={round.settings} readOnly={readOnly} />}

        {hasDisagreement && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
            <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <strong>Có ý kiến khác nhau:</strong> {includeCount} Phù hợp · {excludeCount} Không phù hợp{unsureCount > 0 ? ` · ${unsureCount} Chưa chắc chắn` : ""}. Cần trao đổi để thống nhất trước khi chốt.
            </div>
          </div>
        )}
        {isUnanimous && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs">
            <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="flex-1">
              <strong>Đồng thuận nhóm ({round.reviews.length}/{round.reviews.length}):</strong> Tất cả thành viên đều chọn {includeCount > 0 ? "Phù hợp" : "Không phù hợp"}.
            </div>
          </div>
        )}

        {round.status === "NEEDS_RESOLUTION" && !hasDisagreement && (
          <p className="screening-notice text-xs">Cần xem xét thêm. Nhóm có thể đối chiếu tiêu chí, thảo luận và cập nhật ý kiến.</p>
        )}

        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Ý kiến các thành viên ({round.reviews.length})</span>
            <span>{round.completed}/{round.assigned} đã gửi</span>
          </div>

          {round.reviews.length ? (
            <ul className="space-y-2">
              {round.reviews.map(r => {
                const reviewerName = round.assignments.find(a => a.id === r.assignmentId)?.name ?? "Thành viên";
                const isMe = r.assignmentId === round.myAssignmentId;
                return (
                  <li
                    key={r.id}
                    className="p-3 rounded-lg border text-xs bg-card space-y-1.5 transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <strong className="text-foreground text-xs font-semibold">
                          {reviewerName}{isMe ? " (Bạn)" : ""}
                        </strong>
                        <ScreeningStatusBadge tone={screeningChoiceTone(r.decision)}>{choiceLabels[r.decision]}</ScreeningStatusBadge>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span>Phiên bản {r.revision}</span>
                        <span>·</span>
                        <span>{new Date(r.submittedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} {new Date(r.submittedAt).toLocaleDateString("vi-VN")}</span>
                      </div>
                    </div>

                    {r.exclusionReason && (
                      <p className="text-xs text-rose-700 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-950/20 px-2 py-1 rounded border border-rose-200/50">
                        <strong>Lý do:</strong> {r.exclusionReason}
                      </p>
                    )}
                    {r.comment && (
                      <p className="text-xs text-muted-foreground italic bg-muted/30 px-2 py-1 rounded">
                        {r.comment}
                      </p>
                    )}
                    <ReviewContextSummary review={r} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground italic py-1">Chưa có ý kiến từ các thành viên khác.</p>
          )}
        </div>

        {round.finalDecision && (
          <div className="screening-tone screening-status-surface screening-notice screening-final-decision" data-tone={screeningStatusTone({ status: round.finalDecision.decision })} data-decision={round.finalDecision.decision}>
            <h4 className="screening-status-text">{round.finalDecision.decision === "INCLUDED" ? (round.extractionReady === false ? "Đã qua giai đoạn này · Cần đánh giá toàn văn" : "Đã chọn cho phân tích") : round.finalDecision.decision === "BACKGROUND" ? "Tài liệu tham khảo nền" : "Không chọn cho phân tích"}</h4>
            <p>{round.finalDecision.reason}</p>
            <small>{people.find(p => p.id === round.finalDecision?.resolverId)?.name ?? round.finalizer.name} · {new Date(round.finalDecision.createdAt).toLocaleString("vi-VN")}</small>
          </div>
        )}
        {!round.legacyNeedsAudit && <OwnerActions projectId={projectId} round={round} people={people} readOnly={readOnly} />}
        <RoundHistory projectId={projectId} round={round} people={people} readOnly={readOnly} />
      </div>
    );
  }

  if (conflicted && !round.finalDecision) {
    return (
      <div className="screening-resolution-round" data-screening-section="discussion">
        {legacyNotice}
        <div className="screening-resolution-round-heading">
          <h4>Vòng {round.number} · {round.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề và tóm tắt"}</h4>
          <ScreeningStatus status={round.status} round={round} />
        </div>
        {data.isError && <ScreeningError error={data.error} retry={() => void data.refetch()} />}
        <ScreeningConflictResolution
          onBack={onBack}
          discussionRequested={discussionRequested}
          projectId={projectId}
          round={round}
          paper={paper}
          people={people}
          readOnly={readOnly}
        />
        {round.canAdvanceConservatively && <ConservativeAdvance projectId={projectId} round={round} readOnly={readOnly} />}
        {!round.legacyNeedsAudit && (round.canManage || round.canFinalize) && (
          <details className="owner-actions-details">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
              ⚙ Tùy chọn quản lý vòng (Dành cho chủ dự án)
            </summary>
            <div className="mt-2 pt-2 border-t">
              <OwnerActions projectId={projectId} round={round} people={people} readOnly={readOnly} />
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <>
      {legacyNotice}
      {round.settings.reviewMode !== "INDEPENDENT" && <ScreeningCaseStatus projectId={projectId} round={round} />}
      <div className="screening-actions">
        <h4>{roundHeaderLabel}</h4>
        <ScreeningStatus status={round.status} round={round} />
      </div>
      {data.isError && <ScreeningError error={data.error} retry={() => void data.refetch()} />}
      <p className="text-xs font-semibold text-muted-foreground">{round.completed}/{round.settings.requiredReviewers} phiếu đã gửi · cần {round.settings.requiredReviewers} reviewer</p>
      <section className="sr-only" aria-label="Phân công đánh giá của vòng">
        <h5 className="text-sm font-semibold">Người đánh giá được phân công ({round.assigned})</h5>
        <p className="text-sm text-muted-foreground">{people.length > 0 ? `Nhóm có ${people.length} thành viên đủ điều kiện đánh giá. ` : ""}Quy trình của vòng yêu cầu {round.settings.requiredReviewers} reviewer. Mỗi bài có phân công riêng; các thành viên khác có thể được giao đánh giá bài khác.</p>
        {round.myAssignmentId && <p className="text-sm font-medium">Bạn là reviewer được phân công cho vòng này.</p>}
      </section>
      {round.settings.reviewMode !== "INDEPENDENT" && round.finalizerAssigned && <p className="text-xs text-muted-foreground">Người phân xử: <strong>{round.finalizer.name}</strong></p>}
      {round.reviewerIntakeClosed && <p className="sr-only">Đã đóng nhận reviewer mới.{round.finalDecision ? " Các phiếu và kết quả đã được lưu." : " Reviewer chỉ có thể đổi kết luận khi xem xét lại sau thảo luận, có lưu phiên bản."}</p>}
      <progress className="h-1.5 w-full rounded-full overflow-hidden" value={round.completed} max={Math.max(round.assigned, round.settings.requiredReviewers)} aria-label="Tiến độ gửi phiếu" />
      {!round.settings.inclusionCriteria.length && !round.settings.exclusionCriteria.length && (
        <p role="status" className="sr-only">Vòng này chưa lưu tiêu chí đưa vào và tiêu chí loại. Nhóm nên thống nhất tiêu chí trước khi gửi phiếu. Chủ dự án có thể lưu cấu hình cho vòng mới; quy tắc của vòng hiện tại được giữ trong lịch sử.</p>
      )}
      {(!round.settings.researchQuestions?.length && !round.settings.inclusionCriteria?.length && !round.settings.exclusionCriteria?.length) ? (
        <details className="sr-only">
          <summary>Tiêu chí và quy tắc của vòng</summary>
          <p>{round.settings.resolutionPolicy === "CONSENSUS" ? "Reviewer cần nhất trí theo tiêu chí của vòng" : "Người phụ trách phân xử nếu reviewer bất đồng"}. Chờ tất cả người được phân công gửi phiếu. {(round.settings.workflowVersion ?? 0) >= 3 && round.settings.reviewMode === "INDEPENDENT" ? "Nếu tất cả cùng Phù hợp hoặc Không phù hợp, hệ thống ghi kết quả và chuyển bước theo quy trình. Bất đồng cần hai reviewer thảo luận trước; người phân xử phải được chỉ định và không là reviewer của vòng." : "Kết quả cần người được giao xác nhận."}</p>
          <FrozenCriteria title="Câu hỏi nghiên cứu" items={round.settings.researchQuestions} />
          <FrozenCriteria title="Tiêu chí đưa vào" items={round.settings.inclusionCriteria} />
          <FrozenCriteria title="Tiêu chí loại" items={round.settings.exclusionCriteria} />
        </details>
      ) : (
        <details className="text-xs text-muted-foreground rounded-lg border bg-muted/20 p-2.5">
          <summary className="cursor-pointer font-medium hover:text-foreground">Tiêu chí và quy tắc của vòng</summary>
          <div className="mt-2 space-y-2 pt-2 border-t">
            <FrozenCriteria title="Câu hỏi nghiên cứu" items={round.settings.researchQuestions} />
            <FrozenCriteria title="Tiêu chí đưa vào" items={round.settings.inclusionCriteria} />
            <FrozenCriteria title="Tiêu chí loại" items={round.settings.exclusionCriteria} />
          </div>
        </details>
      )}
      <ul className="screening-assignees space-y-1.5 my-2" aria-label="Reviewer được phân công">
        {round.assignments.map(a => (
          <li key={a.id} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-md bg-muted/30 border border-border/50">
            <strong>{a.name}{a.id === round.myAssignmentId ? " (Bạn)" : ""}</strong>
            <span className="screening-tone screening-status-text font-medium" data-tone={a.completed ? "success" : a.overdue ? "warning" : "neutral"}>
              {a.completed ? "Đã gửi, đã khóa" : a.overdue ? "Quá hạn" : "Đang chờ"}{a.dueAt ? ` · hạn ${new Date(a.dueAt).toLocaleString("vi-VN")}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {round.independenceCompromised && <p className="screening-notice">Vòng đã công bố sớm hoặc mở lại sau công bố. Các phiếu vẫn được lưu; vòng này không dùng cho thống kê đồng ý độc lập và Kappa.</p>}
      {(!ownVoteInTeam || isEditingVote) && <div className="mt-3" data-screening-section="review">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Phiếu của tôi</h4>
          {round.myReview && canEditOwnVote && !isEditingVote && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs gap-1.5 hover:bg-muted font-medium"
              onClick={() => setIsEditingVote(true)}
            >
              <Edit3 size={12} />
              Sửa lựa chọn
            </Button>
          )}
        </div>
        {round.myReview && !isEditingVote ? (
          <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScreeningStatusBadge tone={screeningChoiceTone(round.myReview.decision)}>{choiceLabels[round.myReview.decision]} · đã khóa</ScreeningStatusBadge>
                <span className="text-xs text-muted-foreground">· Phiên bản {round.myReview.revision}</span>
              </div>
            </div>
            {round.myReview.exclusionReason && (
              <div className="text-xs rounded-lg bg-rose-50/60 dark:bg-rose-950/20 p-2 border border-rose-200/50 dark:border-rose-900/30">
                <span className="font-semibold text-rose-700 dark:text-rose-400">Lý do loại: </span>
                <span className="text-foreground">{round.myReview.exclusionReason}</span>
              </div>
            )}
            {round.myReview.comment && (
              <p className="text-xs text-foreground whitespace-pre-wrap">{round.myReview.comment}</p>
            )}
            <ReviewContextSummary review={round.myReview} />
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
              Đã lưu lúc {new Date(round.myReview.submittedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} {new Date(round.myReview.submittedAt).toLocaleDateString("vi-VN")}
            </div>
          </div>
        ) : ((!round.legacyNeedsAudit && round.canReview) || hadReviewAccess || isEditingVote) ? (
          <ReviewForm
            projectId={projectId}
            round={round}
            readOnly={readOnly}
            initialDecision={isEditingVote && round.myReview ? round.myReview.decision : undefined}
            initialReason={isEditingVote && round.myReview ? round.myReview.decision === "EXCLUDE" ? round.myReview.exclusionReason : round.myReview.comment : undefined}
            onCancel={isEditingVote ? () => setIsEditingVote(false) : undefined}
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">
            {round.finalDecision ? "Vòng đánh giá đã có kết quả. Bạn có thể xem các phiếu và kết luận của nhóm bên dưới." : readOnly ? "Vòng này chỉ được xem." : !round.myAssignmentId ? "Bạn chưa giữ suất đánh giá. Nhận suất còn trống để gửi phiếu; khi đã đủ hai reviewer, thành viên khác chỉ theo dõi kết quả." : "Phiếu của bạn hiện không nhận đánh giá mới. Kiểm tra trạng thái vòng và lịch sử trước khi tiếp tục."}
          </p>
        )}
      </div>}
      {round.hiddenReviews ? (
        <div className="sr-only">
          <h4>Phiếu nhóm</h4>
          <p className="screening-notice">Phiếu và nhận xét của người khác đang được ẩn, kể cả với chủ dự án. Phiếu sẽ công bố khi tất cả người được phân công gửi xong và đủ số người yêu cầu.</p>
        </div>
      ) : (
        <div className="mt-3">
          <h4 className="text-sm font-semibold mb-2">Phiếu nhóm</h4>
          <ul className="screening-team-reviews">
            {round.reviews.map(r => (
              <li key={r.id} aria-label={r.assignmentId === round.myAssignmentId ? "Phiếu của bạn" : undefined}>
                <strong>{round.assignments.find(a => a.id === r.assignmentId)?.name ?? "Thành viên"}{r.assignmentId === round.myAssignmentId && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Bạn</span>} · {choiceLabels[r.decision]}</strong>
                <p>{r.exclusionReason}</p>
                <p>{r.comment}</p>
                <ReviewContextSummary review={r} />
                <small>Phiên bản {r.revision} · {new Date(r.submittedAt).toLocaleString("vi-VN")}</small>
                {round.consensus && <ReviewVersionHistory round={round} assignmentId={r.assignmentId} beforeRevision={r.revision} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {round.resolution && <div className="screening-notice"><h4>Cần đọc thêm / bổ sung thông tin</h4><p>{round.resolution.reason}</p></div>}
      <ConservativeAdvance projectId={projectId} round={round} readOnly={readOnly} />
      {round.provisionalAdvance && <p role="status" className="screening-notice">Chuyển đọc toàn văn để làm rõ thông tin. Bất đồng ở vòng tóm tắt vẫn được lưu và chưa được coi là đã giải quyết.</p>}
      {round.finalDecision && Boolean(round.consensus?.confirmations.length) && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Xác nhận cuối cùng của hai reviewer</summary>{round.assignments.filter(a => a.completed).map(a => { const final = round.consensus!.confirmations.find(v => v.reviewerId === a.reviewerId); return <div key={a.id} className="mt-3 min-w-0"><strong>{a.name}{a.id === round.myAssignmentId ? " (Bạn)" : ""}</strong><p>{final ? choiceLabels[final.decision] : "Chưa xác nhận trong thời hạn"}</p>{final && <><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{final.reason}</p><time className="text-xs text-muted-foreground" dateTime={final.confirmedAt}>{new Date(final.confirmedAt).toLocaleString("vi-VN")}</time></>}</div>; })}</details>}
      {round.finalDecision && <div className="screening-notice"><h4>Kết quả của vòng: {round.resolutionType === "CONSENSUS_NOT_REACHED" ? "Không đạt đồng thuận" : round.finalDecision.decision === "INCLUDED" && round.extractionReady === false ? "Qua sàng lọc · Chờ đọc toàn văn" : round.finalDecision.decision === "INCLUDED" ? "Đã chấp nhận" : legacyLabel(round.finalDecision.decision)}</h4><p>{round.resolutionType === "CONSENSUS_NOT_REACHED" ? "Không đạt đồng thuận trong thời hạn" : round.finalDecision.source === "CONSENSUS" ? "Đồng thuận của tất cả reviewer theo quy trình đã lưu" : `Chốt bởi ${people.find(p => p.id === round.finalDecision?.resolverId)?.name ?? round.finalDecision.resolverId ?? "Không có thông tin"}`} · phiên bản {round.finalDecision.version} · {new Date(round.finalDecision.createdAt).toLocaleString("vi-VN")}</p><p>{round.finalDecision.reason}</p></div>}
      {!round.legacyNeedsAudit && (round.canManage || round.canFinalize || round.canDefer || hadManagementAccess) && <OwnerActions projectId={projectId} round={round} people={people} readOnly={readOnly} />}
      <ScreeningAgreementPanel projectId={projectId} round={round} readOnly={readOnly} />
      <RoundHistory projectId={projectId} round={round} people={people} readOnly={readOnly} />
    </>
  );
}

function ClosedUnresolvedRound({ projectId, round, people, readOnly }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean }) {
  const [isReopenOpen, setIsReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const command = useScreeningCommand(projectId);
  const queryClient = useQueryClient();

  const isTeamScreening = round.settings?.workflowKind === "TEAM_SCREENING";
  const roundHeaderLabel = isTeamScreening
    ? (round.number > 1 ? `Đánh giá mức độ phù hợp (Lần ${round.number})` : "Đánh giá mức độ phù hợp")
    : `Vòng ${round.number} · ${round.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề và tóm tắt"}`;

  const closureDetails = round.closureDetails;
  const reasonLabel = closureDetails?.reason === "DEADLINE_EXPIRED"
    ? "Hết thời hạn thảo luận (48 giờ)"
    : closureDetails?.reason === "NO_CONSENSUS"
    ? "Không đạt đồng thuận sau thảo luận"
    : closureDetails?.reason === "NO_RESPONSE"
    ? "Không có phản hồi từ người đánh giá"
    : closureDetails?.reason === "INSUFFICIENT_INFORMATION"
    ? "Không đủ thông tin để kết luận"
    : "Không đạt đồng thuận";

  const closedByName = closureDetails?.actorType === "SYSTEM"
    ? "Hệ thống (tự động hết hạn)"
    : people.find(p => p.id === closureDetails?.actorId)?.name ?? "Chủ đề tài";

  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (command.isPending || readOnly || reopenReason.trim().length < 5) return;
    const payload = {
      expectedVersion: round.version,
      reason: reopenReason.trim(),
    };
    const success = await command.run({ roundId: round.id, ...payload }, clientKey =>
      screeningApi.reopenUnresolved(projectId, round.id, { ...payload, clientKey })
    );
    if (success) {
      setIsReopenOpen(false);
      setReopenReason("");
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "screening"] });
    }
  };

  return (
    <div className="space-y-4" data-screening-section="closed-unresolved">
      <div className="screening-resolution-round-heading flex items-center justify-between">
        <h4 className="text-sm font-semibold">{roundHeaderLabel}</h4>
        <ScreeningStatus status={round.status} round={round} />
      </div>

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2 text-xs">
        <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm">Đã đóng — Không đạt đồng thuận</span>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Quy trình đánh giá bài báo này đã kết thúc ở trạng thái không đạt đồng thuận sau thời hạn thảo luận.
          Kết quả này <strong>không</strong> đồng nghĩa với việc bài báo bị loại vì không đạt tiêu chí khoa học.
        </p>
        <div className="pt-2 border-t border-amber-500/20 text-[11px] text-muted-foreground space-y-1">
          <div><strong>Lý do đóng:</strong> {reasonLabel}</div>
          {closureDetails?.note && <div><strong>Ghi chú:</strong> {closureDetails.note}</div>}
          {closureDetails?.closedAt && (
            <div>
              <strong>Thời gian đóng:</strong> {new Date(closureDetails.closedAt).toLocaleString("vi-VN")} · <strong>Thực hiện:</strong> {closedByName}
            </div>
          )}
        </div>
      </div>

      {/* Two independent ballots preserved */}
      <div className="space-y-2 pt-1">
        <h5 className="text-xs font-semibold text-muted-foreground">Hai phiếu đánh giá độc lập ban đầu (bảo lưu)</h5>
        <div className="space-y-2">
          {round.reviews.map(r => {
            const reviewerName = round.assignments.find(a => a.id === r.assignmentId)?.name ?? "Reviewer";
            return (
              <div key={r.id} className="p-3 rounded-lg border text-xs bg-card space-y-1.5">
                <div className="flex items-center justify-between">
                  <strong>{reviewerName}</strong>
                  <ScreeningStatusBadge tone={screeningChoiceTone(r.decision)}>{choiceLabels[r.decision]}</ScreeningStatusBadge>
                </div>
                {r.exclusionReason && <p className="text-rose-700 dark:text-rose-400"><strong>Lý do loại:</strong> {r.exclusionReason}</p>}
                {r.comment && <p className="text-muted-foreground italic">{r.comment}</p>}
                <ReviewContextSummary review={r} />
                <div className="text-[11px] text-muted-foreground">Phiên bản {r.revision} · {new Date(r.submittedAt).toLocaleString("vi-VN")}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Discussion history */}
      <div className="pt-2">
        <h5 className="text-xs font-semibold text-muted-foreground mb-2">Lịch sử trao đổi và sự kiện</h5>
        <RoundHistory projectId={projectId} round={round} people={people} readOnly={true} />
      </div>

      {/* Owner reopen button */}
      {!readOnly && (round.canReopenUnresolved || round.canManage) && (
        <div className="pt-3 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => setIsReopenOpen(true)}
          >
            <RotateCcw size={13} />
            Mở lại vòng đánh giá mới
          </Button>
        </div>
      )}

      {/* Modal: Mở lại vòng đánh giá mới */}
      <Dialog open={isReopenOpen} onOpenChange={setIsReopenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mở lại vòng đánh giá cho bài báo</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ tạo một vòng đánh giá mới (Vòng {round.number + 1}). Vòng đánh giá đã đóng và hai phiếu độc lập cũ vẫn được lưu trữ nguyên vẹn trong lịch sử đề tài.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReopenSubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Lý do mở lại vòng đánh giá <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                placeholder="Nêu căn cứ hoặc lý do đề tài cần mở lại đánh giá bài báo này..."
                rows={3}
                required
                minLength={5}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">Tối thiểu 5 ký tự để lưu vào nhật ký kiểm toán.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsReopenOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" size="sm" disabled={command.isPending || reopenReason.trim().length < 5}>
                {command.isPending ? "Đang mở lại..." : "Xác nhận mở lại"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResumeFullText({ projectId, round }: { projectId: string; round: ScreeningRoundView }) {
  const command = useScreeningCommand(projectId);
  return <div className="space-y-3"><label className="block space-y-2 text-sm"><span>Đính kèm PDF toàn văn (tối đa 10 MiB)</span><input type="file" accept="application/pdf" disabled={command.isPending} onChange={e => { const file = e.target.files?.[0]; if (file) void command.run({ upload: file.name, size: file.size, modified: file.lastModified }, () => researchApi.upload(projectId, round.paperId, file)); e.target.value = ""; }} /></label><Button disabled={command.isPending} onClick={() => { const payload = { expectedVersion: round.version, confirmed: true, reason: "Đã bổ sung nguồn toàn văn để tiếp tục quy trình" }; void command.run(payload, clientKey => screeningApi.resumeFullText(projectId, round.id, { ...payload, clientKey })); }}>Đã có toàn văn · Mở vòng 2</Button><ScreeningError error={command.error} /></div>;
}
function FrozenCriteria({ title, items }: { title: string; items: string[] }) {
  return <div><h5>{title}</h5>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">Chưa thiết lập trong quy trình của vòng này.</p>}</div>;
}

function ReviewForm({ projectId, round, readOnly, initialDecision, initialReason, onCancel }: {
  projectId: string;
  round: ScreeningRoundView;
  readOnly: boolean;
  initialDecision?: ScreeningChoice;
  initialReason?: string;
  onCancel?: () => void;
}) {
  const [context, setContext] = useState(() => initialAssessmentContext(initialDecision ? round.myReview : null, round.phase));
  const [decision, setDecision] = useState<ScreeningChoice | "">(initialDecision ?? "");
  const [reason, setReason] = useState(initialReason ?? "");
  const [exclusionCriterion, setExclusionCriterion] = useState(round.myReview?.exclusionReason ?? "");
  const hasText = Boolean(reason.trim() || (context.scope === "FULL_TEXT" && context.fullTextReference.trim()));
  const command = useScreeningCommand(projectId);
  useUnsavedWorkspace(hasText || command.isPending);
  const [assignment] = useState(() => round.assignments.find(a => a.id === round.myAssignmentId));
  const currentAssignment = round.assignments.find(a => a.id === round.myAssignmentId);
  const unavailable = readOnly || (!round.canReview && !initialDecision) || assignment?.id !== round.myAssignmentId || Boolean(initialDecision && (!round.active || round.finalDecision || round.unblindedAt || round.completed >= 2 || round.assignments.some(a => a.id !== round.myAssignmentId && a.completed)));
  if (!assignment) return null;
  return (
    <form
      className="screening-form"
      onSubmit={async e => {
        e.preventDefault();
        if (!decision || unavailable || reason.trim().length < 3) return;
        const payload = {
          assignmentId: assignment.id,
          expectedRevision: (currentAssignment ?? assignment).revision,
          decision,
          exclusionReason: decision === "EXCLUDE" ? round.settings.screeningMode && round.settings.exclusionCriteria.length ? exclusionCriterion : reason.trim() : "",
          comment: reason.trim(),
          confirmed: true,
          ...context
        };
        if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.action(projectId, round.id, "reviews", { ...payload, clientKey }))) {
          toast.success("Đã gửi phiếu đánh giá. Tiến độ của bài đã được cập nhật.");
          if (onCancel) {
            onCancel();
          } else {
            setDecision("");
            setReason("");
          }
        }
      }}
    >
      {unavailable && <p role="status">Quyền gửi phiếu đã thay đổi. Bản nháp vẫn ở đây để bạn sao chép; tải lại để kiểm tra phân công.</p>}
      <fieldset disabled={command.isPending}>
        <ScreeningDecisionChoices
          legend={initialDecision ? "Chỉnh sửa lựa chọn đánh giá" : round.settings.reviewMode === "SIMPLE" ? "Đánh giá đơn giản" : "Đánh giá độc lập"}
          value={decision} options={round.settings.reviewMode === "INDEPENDENT" ? screeningReviewOptions.filter(o => o.value !== "UNSURE") : screeningReviewOptions} onChange={setDecision} required
        />
        {decision === "EXCLUDE" && round.settings.screeningMode && round.settings.exclusionCriteria.length > 0 && <label>Tiêu chí loại của vòng<select required value={exclusionCriterion} onChange={e => setExclusionCriterion(e.target.value)}><option value="">Chọn tiêu chí</option>{round.settings.exclusionCriteria.map(item => <option key={item} value={item}>{item}</option>)}</select></label>}
        {decision === "EXCLUDE" && round.settings.screeningMode && !round.settings.exclusionCriteria.length && <p className="text-sm text-muted-foreground">Vòng chưa lưu tiêu chí loại. Hãy nêu rõ căn cứ đối chiếu với mục tiêu nghiên cứu.</p>}
        {decision === "EXCLUDE" && (
          <label>
            Lý do loại
            <textarea
              placeholder="Bài không đáp ứng tiêu chí hoặc phạm vi nghiên cứu nào?"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
            />
          </label>
        )}
        {decision === "INCLUDE" && (
          <label>
            Lý do / Căn cứ phù hợp
            <textarea
              placeholder="Nêu căn cứ hoặc tiêu chí bài đáp ứng…"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
            />
          </label>
        )}
        {decision === "UNSURE" && (
          <label>
            Điểm cần làm rõ thêm
            <textarea
              placeholder="Nêu điểm chưa chắc chắn hoặc cần đối chiếu thêm…"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
            />
          </label>
        )}
        {decision && <p className="text-xs text-muted-foreground">Bắt buộc ghi lý do hoặc căn cứ, ít nhất 3 ký tự.</p>}
        <AssessmentContextFields value={context} settings={round.settings} fixedScope disabled={unavailable || command.isPending} onChange={setContext} />
      </fieldset>
      <ScreeningError error={command.error} />
      <div className="flex items-center gap-2">
        <Button
          disabled={
            command.isPending ||
            unavailable ||
            !decision ||
            reason.trim().length < 3 ||
            (context.scope === "FULL_TEXT" && context.fullTextReference.trim().length < 10)
          }
        >
          {command.isPending ? "Đang gửi…" : initialDecision ? "Cập nhật phiếu" : "Gửi và khóa phiếu"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={command.isPending}
            onClick={onCancel}
          >
            Hủy
          </Button>
        )}
      </div>
    </form>
  );
}

export function OwnerActions(props: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean }) {
  if (props.round.settings.reviewMode === "INDEPENDENT") return null;
  return (props.round.settings.workflowVersion ?? 0) >= 5 || props.round.adjudicationCase ? <CaseReopenAction {...props} /> : <LegacyOwnerActions {...props} />;
}
function CaseReopenAction({ projectId, round, readOnly }: { projectId: string; round: ScreeningRoundView; readOnly: boolean }) {
  const [assignmentId, setAssignmentId] = useState(""), [reason, setReason] = useState(""), [version, setVersion] = useState<number | null>(null);
  const command = useScreeningCommand(projectId);
  useUnsavedWorkspace(Boolean(reason) || command.isPending);
  if (!round.canManage) return null;
  const stale = version !== null && version !== round.version;
  return <details className="owner-actions-details"><summary>Mở lại phiếu có lưu lịch sử</summary><form className="screening-form" onSubmit={async e => { e.preventDefault(); if (stale || readOnly) return; const payload = { assignmentId, reason, expectedVersion: version ?? round.version, confirmed: true }; if (await command.run(payload, clientKey => screeningApi.action(projectId, round.id, "reopen", { ...payload, clientKey }))) { setReason(""); setVersion(null); setAssignmentId(""); } }}><p>Mở lại sẽ đóng hồ sơ phân xử đang chờ. Phiếu và kết quả cũ được giữ trong lịch sử.</p><label>Phiếu đã gửi<select value={assignmentId} disabled={readOnly || command.isPending} required onChange={e => { setAssignmentId(e.target.value); if (version === null) setVersion(round.version); }}><option value="">Chọn phiếu</option>{round.assignments.filter(a => a.completed && (round.canManage || a.id === round.myAssignmentId)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Lý do mở lại<textarea minLength={10} maxLength={2000} required disabled={readOnly || command.isPending} value={reason} onChange={e => { setReason(e.target.value); if (version === null) setVersion(round.version); }} /></label>{stale && <p role="alert">Vòng đã thay đổi. Đọc lại thông tin trước khi mở lại. <button type="button" className="underline" onClick={() => setVersion(round.version)}>Tôi đã kiểm tra</button></p>}<ScreeningError error={command.error} /><Button variant="outline" disabled={readOnly || stale || command.isPending || !assignmentId || reason.trim().length < 10}>Mở lại phiếu</Button></form></details>;
}

function LegacyOwnerActions({ projectId, round, people, readOnly }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean }) {
  const [action, setAction] = useState<"defer" | "finalize" | "finalizer" | "unblind" | "reopen">(round.finalDecision ? (round.canDefer ? "defer" : "reopen") : round.canFinalize ? "finalize" : round.canReopenOwn && (!round.canManage || !round.adjudicators?.length) ? "reopen" : "finalizer"), [decision, setDecision] = useState("INCLUDED"), [assignmentId, setAssignmentId] = useState(""), [finalizerId, setFinalizerId] = useState(round.finalizer.id), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [acknowledgeProposer, setAcknowledgeProposer] = useState(false), [shareWithMentor, setShareWithMentor] = useState(false), [packetVersion, setPacketVersion] = useState<number | null>(null);
  const [discussionIds, setDiscussionIds] = useState<string[]>([]);
  const protocol = (round.settings.workflowVersion ?? 0) >= 3 && round.settings.reviewMode === "INDEPENDENT" || (round.settings.workflowVersion ?? 0) >= 5 && round.settings.reviewMode === "SIMPLE";
  const candidates = round.adjudicators ?? people.map(p => ({ ...p, proposer: false, mentor: false }));
  const candidate = candidates.find(p => p.id === finalizerId);
  const command = useScreeningCommand(projectId); useUnsavedWorkspace(Boolean(reason) || command.isPending);
  const hasUnsure = round.reviews.some(r => r.decision === "UNSURE");
  const matchesVotes = round.reviews.length > 0 && round.reviews.every(r => r.decision === (decision === "INCLUDED" ? "INCLUDE" : "EXCLUDE"));
  const available = !readOnly && (action === "finalize" ? round.canFinalize && round.assigned >= round.settings.requiredReviewers && round.completed === round.assigned && (protocol || round.settings.reviewMode === "COLLABORATIVE" || !hasUnsure) && (round.settings.reviewMode === "COLLABORATIVE" || matchesVotes || (round.settings.resolutionPolicy === "ADJUDICATION")) : action === "defer" ? Boolean(round.canDefer) : action === "reopen" ? Boolean(assignmentId) && (round.canManage || Boolean(round.canReopenOwn && assignmentId === round.myAssignmentId)) : round.canManage && (action === "finalizer" ? Boolean(candidate) && !round.finalDecision && (!protocol || Boolean(round.discussionReady) && round.settings.resolutionPolicy === "ADJUDICATION" && ["NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING"].includes(round.status) && (!candidate?.proposer || acknowledgeProposer) && (!candidate?.mentor || shareWithMentor && packetVersion === round.version)) : !round.unblindedAt && round.settings.blindReview));
  if (!(round.canManage || round.canFinalize || round.canDefer || round.canReopenOwn) && !reason && !confirmed && !command.isPending) return null;
  return <details className="owner-actions-details"><summary>Quyết định lựa chọn{round.canFinalize ? " · Chờ người phụ trách" : ""}</summary><form className="screening-form" onSubmit={async e => { e.preventDefault(); if (!available || !confirmed) return; const payload = { expectedVersion: baseVersion ?? round.version, reason, confirmed: true, ...(action === "finalize" ? { decision } : action === "reopen" ? { assignmentId } : action === "finalizer" ? { finalizerId, ...(protocol ? { acknowledgeProposer, shareWithMentor, discussionIds } : {}) } : {}) }; if (await command.run({ roundId: round.id, action, ...payload }, clientKey => screeningApi.action(projectId, round.id, action, { ...payload, clientKey }))) { setReason(""); setConfirmed(false); setBaseVersion(null); } }}>
    {(readOnly || !(round.canManage || round.canFinalize || round.canDefer || round.canReopenOwn)) && <p role="status">Quyền thao tác đã thay đổi. Bản nháp vẫn được giữ để bạn sao chép; chưa thể gửi thao tác này.</p>}
    <fieldset disabled={command.isPending}><label>Thao tác<select value={action} onChange={e => { setAction(e.target.value as typeof action); setConfirmed(false); }}>{(round.canFinalize || action === "finalize") && <option value="finalize" disabled={!round.canFinalize || readOnly}>Ghi quyết định chọn bài</option>}{round.canDefer && <option value="defer">Cần xem xét thêm / mở lại</option>}{(round.canManage && (!protocol || candidates.length > 0) || action === "finalizer") && <option value="finalizer" disabled={!round.canManage || readOnly}>Giao người chốt</option>}{(round.canManage || round.canReopenOwn || action === "reopen") && <option value="reopen" disabled={!(round.canManage || round.canReopenOwn) || readOnly}>Mở lại phiếu để sửa</option>}</select></label>
      {action === "finalize" && <><ScreeningDecisionChoices legend="Kết quả chính thức" value={decision}
        options={[
          { value: "INCLUDED", label: "Chọn cho phân tích", tone: "success" },
          { value: "BACKGROUND", label: "Chỉ dùng làm tài liệu nền", tone: "neutral" },
          { value: "EXCLUDED", label: "Loại khỏi tập phân tích", tone: "excluded" },
          ...(protocol ? [{ value: "NEEDS_MORE_INFO", label: "Cần đọc thêm / bổ sung thông tin", tone: "warning" as const }] : []),
        ]} onChange={value => { setDecision(value); setConfirmed(false); }} />
        <p>{round.settings.reviewMode === "COLLABORATIVE" ? "Người phụ trách chọn theo tiêu chí và minh chứng, có giải thích; không tự quyết định theo số phiếu." : hasUnsure ? "Còn phiếu chưa đủ thông tin. Bổ sung minh chứng và mở lại phiếu trước khi chốt." : round.settings.resolutionPolicy === "CONSENSUS" ? "Dùng quyết định chung sau thảo luận; mỗi reviewer xác nhận riêng và giữ nguyên ý kiến cá nhân." : "Khi bất đồng, người được giao chốt cần giải thích kết luận dựa trên tiêu chí và minh chứng."}</p></>}
      {action === "finalizer" && <><label>Người chịu trách nhiệm chốt<select value={finalizerId} onChange={e => { setFinalizerId(e.target.value); setAcknowledgeProposer(false); setShareWithMentor(false); setConfirmed(false); if (baseVersion === null) setBaseVersion(round.version); }} required><option value="">Chọn người được giao</option>{candidates.map(p => <option key={p.id} value={p.id}>{p.name}{p.mentor ? " · Giảng viên hướng dẫn" : p.proposer ? " · Người đề xuất bài" : ""}</option>)}</select></label>
      {protocol && <p>Ưu tiên người không đề xuất bài và không tham gia hai phiếu. Cần hai reviewer trao đổi sau khi hoàn tất đánh giá trước khi giao phân xử. Giảng viên cần quyền xem và góp ý bài đã được cấp.</p>}
      {protocol && !round.discussionReady && <p role="status">Chưa đủ trao đổi từ hai reviewer. Thảo luận bên dưới và thử thống nhất quyết định chung trước.</p>}
      {protocol && candidate?.proposer && <label className="screening-check"><input type="checkbox" checked={acknowledgeProposer} onChange={e => setAcknowledgeProposer(e.target.checked)} />Tôi xác nhận người phân xử đã đề xuất bài và đã ghi lý do chọn người này.</label>}
      {protocol && candidate?.mentor && <><ScreeningPacketPreview projectId={projectId} roundId={round.id} onReady={setPacketVersion} selectedDiscussionIds={discussionIds} onDiscussionChange={ids => { setDiscussionIds(ids); setShareWithMentor(false); setConfirmed(false); }} /><label className="screening-check"><input type="checkbox" checked={shareWithMentor} disabled={packetVersion !== round.version} onChange={e => setShareWithMentor(e.target.checked)} />Tôi đã duyệt và đồng ý chia sẻ riêng gói ở trên cho giảng viên được chọn.</label></>}
      </>}
      {action === "reopen" && <label>Phiếu đã gửi<select value={assignmentId} onChange={e => setAssignmentId(e.target.value)} required><option value="">Chọn người đánh giá</option>{round.assignments.filter(a => a.completed && (round.canManage || a.id === round.myAssignmentId)).map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>}
      {action === "finalize" && decision === "EXCLUDED" && Boolean(round.settings.exclusionCriteria?.length) && (
        <div className="assessment-quick-reasons mb-2">
          <span className="text-xs text-muted-foreground block mb-1">Gợi ý từ tiêu chí loại trừ của nhóm:</span>
          <div className="flex flex-wrap gap-1.5">
            {round.settings.exclusionCriteria.map((c, idx) => (
              <button
                type="button"
                key={idx}
                className="assessment-quick-reason-chip"
                onClick={() => {
                  setReason(c);
                  if (baseVersion === null) setBaseVersion(round.version);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      <label>Lý do (ít nhất 10 ký tự)<textarea value={reason} onChange={e => { setReason(e.target.value); if (baseVersion === null) setBaseVersion(round.version); }} minLength={10} maxLength={2000} required rows={3} placeholder="Nêu rõ lý do loại hoặc đưa vào phân tích dựa trên tiêu chí nghiên cứu…" /></label>
      <p>{action === "unblind" ? "Công bố không thể thu hồi; vòng này sẽ không được dùng tính độ đồng ý độc lập." : action === "reopen" ? "Phiếu và quyết định cũ được giữ trong lịch sử. Reviewer sẽ gửi phiên bản mới." : "Mọi thao tác đều ghi người thực hiện, thời gian và lý do vào lịch sử."}</p>
      <label className="screening-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required />Tôi hiểu tác động và xác nhận thao tác.</label></fieldset>
    <ScreeningError error={command.error} />{command.isError && baseVersion !== round.version && <Button type="button" variant="outline" onClick={() => { setBaseVersion(round.version); setConfirmed(false); }}>Tôi đã kiểm tra phiếu mới, dùng phiên bản hiện tại</Button>}<Button disabled={command.isPending || !available || !confirmed || reason.trim().length < 10}>Xác nhận và lưu lịch sử</Button>
  </form></details>;
}

function ProposalReason({ projectId, paper, readOnly }: { projectId: string; paper: ScreeningPaperRow; readOnly: boolean }) {
  const [reason, setReason] = useState(paper.proposalReason), [base, setBase] = useState(paper.updatedAt), [savedReason, setSavedReason] = useState(paper.proposalReason);
  const command = useScreeningCommand(projectId), dirty = reason !== savedReason;
  const canEdit = !readOnly && paper.canEditProposal;
  const stale = Date.parse(paper.updatedAt) > Date.parse(base);
  useUnsavedWorkspace(dirty || command.isPending);
  if (!canEdit && !dirty && !command.isPending) {
    return (
      <section className="paper-proposal-card">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lý do đề xuất</h4>
        <p className={paper.proposalReason ? "text-sm text-foreground" : "text-sm text-muted-foreground italic"}>
          {paper.proposalReason || "Chưa ghi lý do đề xuất."}
        </p>
      </section>
    );
  }
  return <details className="paper-proposal-details"><summary>Lý do đề xuất</summary><form className="screening-form" onSubmit={async e => {
    e.preventDefault(); if (!canEdit || stale || !dirty) return;
    const payload = { reason, expectedUpdatedAt: base }; let savedAt = base;
    if (await command.run({ paperId: paper.paperId, ...payload }, async clientKey => {
      const result = await screeningApi.proposal(projectId, paper.paperId, { ...payload, clientKey }) as { updatedAt: string };
      savedAt = result.updatedAt; return result;
    })) { setBase(savedAt); setSavedReason(reason); }
  }}>
    {!canEdit && <p role="status">Quyền sửa đề xuất đã thay đổi. Bản nháp vẫn ở đây để bạn sao chép.</p>}
    <label>Bài này liên quan câu hỏi nghiên cứu nào?<textarea disabled={command.isPending} rows={2} minLength={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} required placeholder="Ví dụ: Bài cung cấp phương pháp đo lường cho câu hỏi nghiên cứu thứ nhất." /></label>
    <ScreeningError error={command.error} />{stale && canEdit && <Button type="button" variant="outline" disabled={command.isPending} onClick={() => setBase(paper.updatedAt)}>Tôi đã kiểm tra thay đổi, dùng phiên bản hiện tại</Button>}
    <Button disabled={command.isPending || !canEdit || !dirty || stale || reason.trim().length < 3}>Lưu lý do đề xuất</Button>
  </form></details>;
}
