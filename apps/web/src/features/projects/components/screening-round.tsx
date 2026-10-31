import { ScreeningAgreementPanel } from "./screening-agreement";
import { ScreeningPacketPreview } from "./screening-adjudication";
import { LibraryAssessment } from "./library-assessment";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, ExternalLink, Globe, Copy, Check, Quote, Tag, Sparkles, HelpCircle, CheckCircle2, XCircle, Bookmark, BookOpen, Info } from "lucide-react";
import { toast } from "sonner";
import type { ScreeningChoice, ScreeningPaperRow, ScreeningRoundView, ScreeningSettings, WorkspacePerson } from "@trend/shared-types";
import { AssessmentContextFields, initialAssessmentContext, ReviewContextSummary } from "./assessment-context";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { useUnsavedWorkspace, WorkspaceLoading, canLeaveWorkspace } from "./workspace-common";
import { choiceLabels, screeningMetadataWarning, ScreeningError, ScreeningPager, ScreeningStatus, useScreeningCommand } from "./screening-common";

export function ScreeningPaperDetail({ projectId, paper, people, readOnly, collaborative = false, settings, relatedSection }: { settings?: ScreeningSettings; collaborative?: boolean; projectId: string; paper: ScreeningPaperRow; people: WorkspacePerson[]; readOnly: boolean; relatedSection?: ReactNode }) {
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

        {/* TIÊU CHUẨN SÀNG LỌC & CÂU HỎI NGHIÊN CỨU CỦA NHÓM (Collapsible) */}
        {settings && (
          <details className="paper-criteria-details">
            <summary className="paper-criteria-summary">
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-primary" />
                <span className="font-semibold text-xs">Tiêu chuẩn sàng lọc & Câu hỏi nghiên cứu của nhóm</span>
              </div>
              <span className="paper-criteria-count">
                {(settings.researchQuestions?.length ?? 0) + (settings.inclusionCriteria?.length ?? 0) + (settings.exclusionCriteria?.length ?? 0)} mục
              </span>
            </summary>
            <div className="paper-criteria-body">
              {settings.researchQuestions?.length > 0 && (
                <div className="paper-criteria-group">
                  <div className="paper-criteria-label text-primary">
                    <HelpCircle size={13} className="shrink-0" />
                    <span>Câu hỏi nghiên cứu:</span>
                  </div>
                  <ul className="paper-criteria-list">
                    {settings.researchQuestions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              {settings.inclusionCriteria?.length > 0 && (
                <div className="paper-criteria-group">
                  <div className="paper-criteria-label text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span>Tiêu chí đưa vào (Inclusion):</span>
                  </div>
                  <ul className="paper-criteria-list criteria-list-include">
                    {settings.inclusionCriteria.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {settings.exclusionCriteria?.length > 0 && (
                <div className="paper-criteria-group">
                  <div className="paper-criteria-label text-destructive">
                    <XCircle size={13} className="shrink-0" />
                    <span>Tiêu chí loại trừ (Exclusion):</span>
                  </div>
                  <ul className="paper-criteria-list criteria-list-exclude">
                    {settings.exclusionCriteria.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!settings.researchQuestions?.length && !settings.inclusionCriteria?.length && !settings.exclusionCriteria?.length && (
                <p className="text-xs text-muted-foreground italic">
                  Dự án chưa cấu hình câu hỏi nghiên cứu hoặc tiêu chí loại trừ cụ thể. Bạn có thể đánh giá dựa trên mức độ phù hợp với mục tiêu đề tài.
                </p>
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
        {Boolean(past.data?.items.length) && (
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
        {relatedSection}
      </div>

      <div ref={assessmentRef} className="paper-reading-assessment">
        {round ? (
          <RoundContent key={round.id} projectId={projectId} initial={round} people={people} readOnly={readOnly || !round.active} />
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

function RequestAdjudication({ projectId, round, readOnly }: { projectId: string; round: ScreeningRoundView; readOnly: boolean }) {
  const [reason, setReason] = useState(""), [version, setVersion] = useState(round.version);
  const command = useScreeningCommand(projectId); useUnsavedWorkspace(Boolean(reason) || command.isPending);
  if (!round.canRequestAdjudication && !reason) return null;
  return <details><summary>Yêu cầu người độc lập phân xử</summary><form className="screening-form mt-3" onSubmit={async e => { e.preventDefault(); if (!round.canRequestAdjudication || version !== round.version) return; const payload = { reason, expectedVersion: version, confirmed: true }; if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.requestAdjudication(projectId, round.id, { ...payload, clientKey }))) setReason(""); }}><p>Nhóm đã thảo luận nhưng chưa thống nhất. Chủ dự án sẽ được thông báo để chỉ định người đủ độc lập và có quyền phù hợp.</p><label>Lý do yêu cầu<textarea value={reason} minLength={10} maxLength={2000} required onChange={e => { setReason(e.target.value); if (!reason) setVersion(round.version); }} /></label>{version !== round.version && <Button type="button" variant="outline" onClick={() => setVersion(round.version)}>Tôi đã kiểm tra vòng hiện tại</Button>}<Button disabled={readOnly || command.isPending || !round.canRequestAdjudication || version !== round.version || reason.trim().length < 10}>Gửi yêu cầu phân xử</Button><ScreeningError error={command.error} /></form></details>;
}

function legacyLabel(status: string) { return status === "INCLUDED" ? "Phù hợp" : status === "EXCLUDED" ? "Không phù hợp" : status === "BACKGROUND" ? "Tài liệu tham khảo nền" : status === "MAYBE" ? "Đang xem xét" : "Chưa xem xét"; }

function RoundContent({ projectId, initial, people, readOnly }: { projectId: string; initial: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean }) {
  const data = useResearchResource(projectId, ["screening-round", initial.id], () => screeningApi.detail(projectId, initial.id), true, r => Boolean(r?.active && !r.finalDecision));
  const round = data.data ?? initial;
  const [hadReviewAccess, setHadReviewAccess] = useState(initial.canReview);
  const [hadManagementAccess, setHadManagementAccess] = useState(initial.canManage || initial.canFinalize || Boolean(initial.canDefer));
  useEffect(() => {
    if (round.canReview) setHadReviewAccess(true);
    if (round.canManage || round.canFinalize || round.canDefer || round.canReopenOwn) setHadManagementAccess(true);
  }, [round.canReview, round.canManage, round.canFinalize, round.canDefer, round.canReopenOwn]);

  if (round.settings.reviewMode === "COLLABORATIVE") {
    const includeCount = round.reviews.filter(r => r.decision === "INCLUDE").length;
    const excludeCount = round.reviews.filter(r => r.decision === "EXCLUDE").length;
    const unsureCount = round.reviews.filter(r => r.decision === "UNSURE").length;
    const isUnanimous = round.reviews.length > 1 && (includeCount === round.reviews.length || excludeCount === round.reviews.length);
    const hasDisagreement = round.reviews.length > 1 && !isUnanimous;

    return (
      <>
        {data.isError && <ScreeningError error={data.error} retry={() => void data.refetch()} />}
        <div className="screening-collaborator-banner">
          <span>Đánh giá cộng tác · Người phụ trách chọn bài: <strong>{round.finalizer.name}</strong></span>
        </div>

        <LibraryAssessment projectId={projectId} paperId={round.paperId} round={round} settings={round.settings} readOnly={readOnly} />

        <details className="screening-team-details" open={hasDisagreement || round.reviews.length > 0}>
          <summary className="screening-team-summary">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-foreground">Đánh giá của nhóm ({round.reviews.length})</span>
              <span className="screening-team-count-badge">
                {round.completed === 0
                  ? "Chưa có đánh giá"
                  : round.completed < round.assigned
                    ? `${round.completed}/${round.assigned} đã gửi`
                    : `${round.completed}/${round.assigned} đã gửi · Đã đủ lượt`}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">{hasDisagreement ? "Có bất đồng ▾" : "Chi tiết ▾"}</span>
          </summary>

          <div className="screening-team-body">
            {hasDisagreement && (
              <div className="screening-consensus-banner screening-consensus-conflict">
                <strong>Có ý kiến khác nhau:</strong>
                <span> {includeCount} Phù hợp · {excludeCount} Không phù hợp{unsureCount > 0 ? ` · ${unsureCount} Chưa chắc chắn` : ""}. Cần trao đổi để thống nhất trước khi chốt.</span>
              </div>
            )}
            {isUnanimous && (
              <div className="screening-consensus-banner screening-consensus-unanimous">
                <strong>Đồng thuận nhóm ({round.reviews.length}/{round.reviews.length}):</strong>
                <span> Tất cả thành viên đều chọn {includeCount > 0 ? "Phù hợp" : "Không phù hợp"}.</span>
              </div>
            )}

            {round.status === "NEEDS_RESOLUTION" && !hasDisagreement && (
              <p className="screening-notice">Cần xem xét thêm. Nhóm có thể đối chiếu tiêu chí, thảo luận và cập nhật ý kiến.</p>
            )}

            {round.reviews.length ? (
              <ul className="screening-team-reviews">
                {round.reviews.map(r => {
                  const reviewerName = round.assignments.find(a => a.id === r.assignmentId)?.name ?? "Thành viên";
                  return (
                    <li key={r.id} className="screening-review-card" data-decision={r.decision}>
                      <div className="screening-review-card-header">
                        <strong>{reviewerName} · {choiceLabels[r.decision]}</strong>
                        <small>Phiên bản {r.revision}</small>
                      </div>
                      {r.exclusionReason && <p className="screening-review-reason"><strong>Lý do:</strong> {r.exclusionReason}</p>}
                      {r.comment && <p className="screening-review-comment">{r.comment}</p>}
                      <ReviewContextSummary review={r} />
                      <small>{new Date(r.submittedAt).toLocaleString("vi-VN")}</small>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="assessment-hint">Chưa có ý kiến từ các thành viên khác.</p>
            )}
          </div>
        </details>

        {round.finalDecision && (
          <div className="screening-notice screening-final-decision" data-decision={round.finalDecision.decision}>
            <h4>{round.finalDecision.decision === "INCLUDED" ? (round.extractionReady === false ? "Đã qua giai đoạn này · Cần đánh giá toàn văn" : "Đã chọn cho phân tích") : round.finalDecision.decision === "BACKGROUND" ? "Tài liệu tham khảo nền" : "Không chọn cho phân tích"}</h4>
            <p>{round.finalDecision.reason}</p>
            <small>{people.find(p => p.id === round.finalDecision?.resolverId)?.name ?? round.finalizer.name} · {new Date(round.finalDecision.createdAt).toLocaleString("vi-VN")}</small>
          </div>
        )}
        <OwnerActions projectId={projectId} round={round} people={people} readOnly={readOnly} />
        <RoundHistory projectId={projectId} round={round} people={people} readOnly={readOnly} />
      </>
    );
  }

  return (
    <>
      <div className="screening-actions">
        <h4>Vòng {round.number} · {round.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề và tóm tắt"}</h4>
        <ScreeningStatus status={round.status} round={round} />
      </div>
      {data.isError && <ScreeningError error={data.error} retry={() => void data.refetch()} />}
      <p>{round.completed}/{round.assigned} phiếu đã gửi · cần {round.settings.requiredReviewers} reviewer</p>
      <section className="space-y-2" aria-label="Phân công đánh giá của vòng">
        <h5 className="text-sm font-semibold">Người đánh giá được phân công ({round.assigned})</h5>
        <p className="text-sm text-muted-foreground">{people.length > 0 ? `Nhóm có ${people.length} thành viên đủ điều kiện đánh giá. ` : ""}Quy trình của vòng yêu cầu {round.settings.requiredReviewers} reviewer. Mỗi bài có phân công riêng; các thành viên khác có thể được giao đánh giá bài khác.</p>
        {round.myAssignmentId && <p className="text-sm font-medium">Bạn là reviewer được phân công cho vòng này.</p>}
      </section>
      {round.finalizerAssigned && <p>Người phân xử: <strong>{round.finalizer.name}</strong></p>}
      {round.reviewerIntakeClosed && <p className="text-sm text-muted-foreground">Đã đóng nhận reviewer mới. Reviewer hiện tại vẫn có thể sửa phiếu của mình, có lưu phiên bản.</p>}
      <progress value={round.completed} max={Math.max(round.assigned, round.settings.requiredReviewers)} aria-label="Tiến độ gửi phiếu" />
      {!round.settings.inclusionCriteria.length && !round.settings.exclusionCriteria.length && <p role="status" className="screening-notice">Vòng này chưa lưu tiêu chí đưa vào và tiêu chí loại. Nhóm nên thống nhất tiêu chí trước khi gửi phiếu. Chủ dự án có thể lưu cấu hình cho vòng mới; quy tắc của vòng hiện tại được giữ trong lịch sử.</p>}
      <details><summary>Tiêu chí và quy tắc của vòng</summary><p>{round.settings.resolutionPolicy === "CONSENSUS" ? "Reviewer cần nhất trí theo tiêu chí của vòng" : "Người phụ trách phân xử nếu reviewer bất đồng"}. Chờ tất cả người được phân công gửi phiếu. {(round.settings.workflowVersion ?? 0) >= 3 && round.settings.reviewMode === "INDEPENDENT" ? "Nếu tất cả cùng Phù hợp hoặc Không phù hợp, hệ thống ghi kết quả và chuyển bước theo quy trình. Bất đồng cần hai reviewer thảo luận trước; người phân xử phải được chỉ định và không là reviewer của vòng." : "Kết quả cần người được giao xác nhận."}</p><FrozenCriteria title="Câu hỏi nghiên cứu" items={round.settings.researchQuestions} /><FrozenCriteria title="Tiêu chí đưa vào" items={round.settings.inclusionCriteria} /><FrozenCriteria title="Tiêu chí loại" items={round.settings.exclusionCriteria} /></details>
      <ul className="screening-assignees" aria-label="Reviewer được phân công">{round.assignments.map(a => <li key={a.id}><strong>{a.name}{a.id === round.myAssignmentId ? " (Bạn)" : ""}</strong><span>{a.completed ? "Đã gửi, đã khóa" : a.overdue ? "Quá hạn" : "Đang chờ"}{a.dueAt ? ` · hạn ${new Date(a.dueAt).toLocaleString("vi-VN")}` : ""}</span></li>)}</ul>
      {round.independenceCompromised && <p className="screening-notice">Vòng đã công bố sớm hoặc mở lại sau công bố. Các phiếu vẫn được lưu; vòng này không dùng cho thống kê đồng ý độc lập và Kappa.</p>}
      <h4>Phiếu của tôi</h4>{round.myReview ? <div className="screening-notice"><strong>{choiceLabels[round.myReview.decision]} · đã khóa</strong><p>{round.myReview.exclusionReason}</p><p>{round.myReview.comment}</p><ReviewContextSummary review={round.myReview} /></div> : (round.canReview || hadReviewAccess) ? <ReviewForm projectId={projectId} round={round} readOnly={readOnly} /> : <p>{readOnly ? "Vòng này chỉ được xem." : !round.myAssignmentId ? "Bạn không được phân công đánh giá bài này. Chỉ reviewer trong danh sách được gửi phiếu. Liên hệ chủ dự án nếu cần thay đổi phân công; chủ dự án cũng không tự có thêm một phiếu." : "Phiếu của bạn hiện không nhận đánh giá mới. Kiểm tra trạng thái vòng và lịch sử trước khi tiếp tục."}</p>}
      <h4>Phiếu nhóm</h4>{round.hiddenReviews ? <p className="screening-notice">Phiếu và nhận xét của người khác đang được ẩn, kể cả với chủ dự án. Phiếu sẽ công bố khi tất cả người được phân công gửi xong và đủ số người yêu cầu.</p> : <ul className="screening-team-reviews">{round.reviews.map(r => <li key={r.id}><strong>{round.assignments.find(a => a.id === r.assignmentId)?.name ?? "Thành viên"} · {choiceLabels[r.decision]}</strong><p>{r.exclusionReason}</p><p>{r.comment}</p><ReviewContextSummary review={r} /><small>Phiên bản {r.revision} · {new Date(r.submittedAt).toLocaleString("vi-VN")}</small></li>)}</ul>}
      {round.resolution && <div className="screening-notice"><h4>Cần đọc thêm / bổ sung thông tin</h4><p>{round.resolution.reason}</p></div>}
      <ConservativeAdvance projectId={projectId} round={round} readOnly={readOnly} />
      {round.provisionalAdvance && <p role="status" className="screening-notice">Chuyển đọc toàn văn để làm rõ thông tin. Bất đồng ở vòng tóm tắt vẫn được lưu và chưa được coi là đã giải quyết.</p>}
      <RequestAdjudication projectId={projectId} round={round} readOnly={readOnly} />
      {round.finalDecision && <div className="screening-notice"><h4>Kết quả của vòng: {round.finalDecision.decision === "INCLUDED" && round.extractionReady === false ? "Qua sàng lọc · Chờ đọc toàn văn" : legacyLabel(round.finalDecision.decision)}</h4><p>{round.finalDecision.source === "CONSENSUS" ? "Đồng thuận của tất cả reviewer theo quy trình đã lưu" : `Chốt bởi ${people.find(p => p.id === round.finalDecision?.resolverId)?.name ?? round.finalDecision.resolverId ?? "Không có thông tin"}`} · phiên bản {round.finalDecision.version} · {new Date(round.finalDecision.createdAt).toLocaleString("vi-VN")}</p><p>{round.finalDecision.reason}</p></div>}
      {(round.canManage || round.canFinalize || round.canDefer || round.canReopenOwn || hadManagementAccess) && <OwnerActions projectId={projectId} round={round} people={people} readOnly={readOnly} />}
      <ScreeningAgreementPanel projectId={projectId} round={round} readOnly={readOnly} />
      <AiPanel projectId={projectId} round={round} readOnly={readOnly} />
      <RoundHistory projectId={projectId} round={round} people={people} readOnly={readOnly} />
    </>
  );
}

function FrozenCriteria({ title, items }: { title: string; items: string[] }) {
  return <div><h5>{title}</h5>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">Chưa thiết lập trong quy trình của vòng này.</p>}</div>;
}

function ReviewForm({ projectId, round, readOnly }: { projectId: string; round: ScreeningRoundView; readOnly: boolean }) {
  const [context, setContext] = useState(() => initialAssessmentContext(null, round.phase));
  const [decision, setDecision] = useState<ScreeningChoice | "">(""), [reason, setReason] = useState(""), [comment, setComment] = useState(""), [confirmed, setConfirmed] = useState(false);
  const command = useScreeningCommand(projectId); useUnsavedWorkspace(Boolean(decision || reason || comment || context.fullTextReference || context.researchQuestionIds.length) || command.isPending);
  const [assignment] = useState(() => round.assignments.find(a => a.id === round.myAssignmentId));
  const unavailable = readOnly || !round.canReview || assignment?.id !== round.myAssignmentId;
  if (!assignment) return null;
  return <form className="screening-form" onSubmit={async e => { e.preventDefault(); if (!decision || !confirmed || unavailable) return; const payload = { assignmentId: assignment.id, expectedRevision: assignment.revision, decision, exclusionReason: reason, comment, confirmed: true, ...context }; if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.action(projectId, round.id, "reviews", { ...payload, clientKey }))) { setDecision(""); setReason(""); setComment(""); setConfirmed(false); } }}>
    {unavailable && <p role="status">Quyền gửi phiếu đã thay đổi. Bản nháp vẫn ở đây để bạn sao chép; tải lại để kiểm tra phân công.</p>}
    <fieldset disabled={command.isPending}><legend>{round.settings.reviewMode === "SIMPLE" ? "Đánh giá đơn giản" : "Đánh giá độc lập"}</legend><div className="screening-actions">{Object.entries(choiceLabels).map(([key, label]) => <label key={key} className="screening-check"><input type="radio" name="review-choice" value={key} checked={decision === key} onChange={() => { setDecision(key as ScreeningChoice); setConfirmed(false); }} required />{label}</label>)}</div>
      {decision === "EXCLUDE" && <label>Lý do loại<textarea placeholder="Bài không đáp ứng tiêu chí hoặc phạm vi nghiên cứu nào?" required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} rows={2} /></label>}
      <label>Giải thích (không bắt buộc)<textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={2000} rows={3} /></label>
      <AssessmentContextFields value={context} settings={round.settings} fixedScope onChange={setContext} />
      <label className="screening-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required />Tôi xác nhận gửi phiếu. {(round.settings.workflowVersion ?? 0) >= 3 && round.settings.reviewMode === "INDEPENDENT" ? "Tôi có thể mở lại phiếu của mình để cập nhật; mọi phiên bản và lý do được lưu." : "Sau khi gửi, chủ dự án có thể mở lại để sửa, có lưu lý do và lịch sử."}</label>
    </fieldset><ScreeningError error={command.error} /><Button disabled={command.isPending || unavailable || !decision || !confirmed || (context.scope === "FULL_TEXT" && context.fullTextReference.trim().length < 10)}>{command.isPending ? "Đang gửi…" : "Gửi và khóa phiếu"}</Button>
  </form>;
}

export function OwnerActions({ projectId, round, people, readOnly }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean }) {
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
      {action === "finalize" && <><fieldset><legend>Kết quả chính thức</legend><div className="screening-actions">{[["INCLUDED", "Chọn cho phân tích"], ["BACKGROUND", "Chỉ dùng làm tài liệu nền"], ["EXCLUDED", "Loại khỏi tập phân tích"], ...(protocol ? [["NEEDS_MORE_INFO", "Cần đọc thêm / bổ sung thông tin"]] : [])].map(([value, label]) => <label className="screening-check" key={value}><input type="radio" name="final-choice" checked={decision === value} onChange={() => { setDecision(value!); setConfirmed(false); }} />{label}</label>)}</div></fieldset><p>{round.settings.reviewMode === "COLLABORATIVE" ? "Người phụ trách chọn theo tiêu chí và minh chứng, có giải thích; không tự quyết định theo số phiếu." : hasUnsure ? "Còn phiếu chưa đủ thông tin. Bổ sung minh chứng và mở lại phiếu trước khi chốt." : round.settings.resolutionPolicy === "CONSENSUS" ? "Dùng quyết định chung sau thảo luận; mỗi reviewer xác nhận riêng và giữ nguyên ý kiến cá nhân." : "Khi bất đồng, người được giao chốt cần giải thích kết luận dựa trên tiêu chí và minh chứng."}</p></>}
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

function AiPanel({ projectId, round, readOnly }: { projectId: string; round: ScreeningRoundView; readOnly: boolean }) {
  const data = useResearchResource(projectId, ["screening-ai", round.id], () => screeningApi.ai(projectId, round.id), round.aiVisible, d => d?.status === "QUEUED");
  const command = useScreeningCommand(projectId), result = data.data?.result;
  return <section className="screening-ai"><h4>Trợ lý AI sàng lọc</h4><p>AI chỉ đưa ra đề xuất. Quyết định cuối cùng thuộc về nhóm nghiên cứu.</p>
    {!round.aiVisible ? <p>Đề xuất AI được ẩn trong giai đoạn đánh giá độc lập. Chủ dự án có thể cho phép AI trước khi bắt đầu vòng mới.</p> : <>
      {data.isLoading ? <WorkspaceLoading /> : data.isError ? <ScreeningError error={data.error} retry={() => void data.refetch()} /> : data.data?.status === "QUEUED" ? <p role="status">Đang đối chiếu tiêu đề và tóm tắt với tiêu chí. Bạn có thể tiếp tục đọc bài trong lúc chờ.</p> : data.data?.status === "FAILED" ? <p role="alert">Chưa tạo được đề xuất AI. Bạn có thể thử lại và tiếp tục đánh giá thủ công.</p> : result ? <><strong>Đề xuất: {choiceLabels[result.decision]}</strong><p>{result.explanation}</p><h5>Tiêu chí liên quan</h5><ul>{[...result.inclusionCriteria, ...result.exclusionCriteria].map((s, i) => <li key={i}>{s}</li>)}</ul><h5>Minh chứng từ metadata</h5>{result.evidence.map((e, i) => <blockquote key={i}><small>{e.field === "title" ? "Tiêu đề" : "Tóm tắt"}</small><p>{e.quote}</p></blockquote>)}<h5>Thông tin còn thiếu</h5><ul>{result.missingInformation.map((s, i) => <li key={i}>{s}</li>)}</ul><small>Tạo lúc {new Date(data.data!.generatedAt!).toLocaleString("vi-VN")}. Không phân tích toàn văn.</small></> : <p>Chưa tạo đề xuất AI cho vòng này.</p>}
      {!readOnly && <Button variant="outline" disabled={command.isPending || data.isLoading || data.data?.status === "QUEUED"} onClick={() => void command.run({ action: "ai", roundId: round.id, previousId: data.data?.id }, key => screeningApi.requestAi(projectId, round.id, key))}>{data.data?.status === "FAILED" ? "Thử tạo lại đề xuất" : "Yêu cầu đề xuất AI"}</Button>}<ScreeningError error={command.error} />
    </>}
  </section>;
}

const auditLabels: Record<string, string> = { PROVISIONAL_FULL_TEXT: "Đọc toàn văn để làm rõ bất đồng", AUTO_ASSIGNED: "Tự phân công reviewer", ROUND_INITIALIZED: "Bắt đầu đánh giá", AGREEMENT_DECLINED: "Tiếp tục thảo luận, chưa đồng ý đề xuất", ADJUDICATION_REQUESTED: "Yêu cầu phân xử độc lập", AGREEMENT_PROPOSED: "Đề xuất quyết định chung", AGREEMENT_CONFIRMED: "Xác nhận quyết định chung", GROUP_AGREEMENT: "Ghi quyết định chung sau thảo luận", ASSESSMENT_REVISED: "Lưu phiên bản ý kiến", SELECTION_DEFERRED: "Cần xem xét thêm / mở lại", ANALYSIS_SET_CREATED: "Tạo bộ bài phân tích", ROUND_STARTED: "Bắt đầu vòng", ASSIGNED: "Phân công người đánh giá", REVIEW_SUBMITTED: "Gửi phiếu", REVIEW_REOPENED: "Mở lại phiếu", EARLY_UNBLIND: "Công bố sớm", CONFLICT_RESOLVED: "Giải quyết bất đồng", PROPOSAL_REASON_UPDATED: "Cập nhật lý do đề xuất", FINALIZED: "Ghi quyết định cuối", FINALIZER_ASSIGNED: "Giao người chốt", REVIEWS_COMPLETED: "Đủ lượt đánh giá", DISCUSSION: "Thảo luận", ASSIGNMENT_REVOKED: "Thu hồi phân công chưa hoàn thành", CONSENSUS: "Ghi kết quả đồng thuận", STAGE_ADVANCED: "Chuyển sang đánh giá toàn văn" };

export function RoundHistory({ projectId, round, people, readOnly }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean }) {
  const [page, setPage] = useState(1), [comment, setComment] = useState("");
  const [kind, setKind] = useState<"DISCUSSION" | "HISTORY">("DISCUSSION");
  const data = useResearchResource(projectId, ["screening-history", round.id, page, kind], () => screeningApi.history(projectId, round.id, page, kind));
  const command = useScreeningCommand(projectId); useUnsavedWorkspace(Boolean(comment) || command.isPending);
  return <section className="paper-discussion"><div className="screening-actions" role="group" aria-label="Thảo luận và lịch sử">{([["DISCUSSION", "Thảo luận"], ["HISTORY", "Lịch sử đánh giá"]] as const).map(([value, label]) => <Button key={value} size="sm" variant={kind === value ? "secondary" : "ghost"} aria-pressed={kind === value} onClick={() => { setKind(value); setPage(1); }}>{label}</Button>)}</div>{kind === "DISCUSSION" && !round.hiddenReviews && !readOnly && <form className="screening-form" onSubmit={async e => { e.preventDefault(); if (await command.run({ roundId: round.id, comment }, clientKey => screeningApi.action(projectId, round.id, "comments", { comment, clientKey }))) setComment(""); }}><label>Thảo luận với nhóm<textarea disabled={command.isPending} value={comment} onChange={e => setComment(e.target.value)} minLength={3} maxLength={2000} required rows={2} /></label><ScreeningError error={command.error} /><Button disabled={command.isPending || comment.trim().length < 3}>Gửi thảo luận</Button></form>}
    {data.isLoading ? <WorkspaceLoading /> : data.isError ? <ScreeningError error={data.error} retry={() => void data.refetch()} /> : <>{!data.data?.items.length && <p className="assessment-hint">{kind === "DISCUSSION" ? "Chưa có thảo luận." : "Chưa có lịch sử đánh giá."}</p>}<ol className="screening-history">{data.data?.items.map(item => <li key={item.id}><strong>{auditLabels[item.type] ?? "Cập nhật vòng"}</strong><small>{item.actorName ?? people.find(p => p.id === item.actorId)?.name ?? round.assignments.find(a => a.reviewerId === item.actorId)?.name ?? (round.finalizer.id === item.actorId ? round.finalizer.name : `Thành viên (${item.actorId})`)} · {new Date(item.createdAt).toLocaleString("vi-VN")}</small>{item.details ? <><p>{String(item.details.reason ?? item.details.comment ?? "")}</p>{["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(String(item.details.decision ?? item.details.status)) && <p>Kết quả: {legacyLabel(String(item.details.decision ?? item.details.status))}{typeof item.details.version === "number" ? ` · phiên bản ${item.details.version}` : ""}</p>}{item.details.review && typeof item.details.review === "object" ? <HistoricalReview value={item.details.review as Record<string, unknown>} /> : null}</> : <p>Nội dung đang được ẩn theo quy tắc đánh giá độc lập.</p>}</li>)}</ol>{data.data && (data.data.hasNext || page > 1) && <ScreeningPager page={page} total={data.data.total} hasNext={data.data.hasNext} onPage={setPage} />}</>}
  </section>;
}

function HistoricalReview({ value }: { value: Record<string, unknown> }) { return <div><small>{value.scope === "FULL_TEXT" ? "Toàn văn" : value.scope === "TITLE_ABSTRACT" ? "Tiêu đề / Tóm tắt" : "Chưa ghi nhận phạm vi đọc"}</small>{typeof value.fullTextReference === "string" && <p>{value.fullTextReference}</p>}{Array.isArray(value.researchQuestions) && value.researchQuestions.map((q: { id: string; text: string }) => <p key={q.id}>RQ: {q.text}</p>)}<p>Phiên bản {String(value.revision)} · {choiceLabels[value.decision as ScreeningChoice]}</p><p>{String(value.exclusionReason ?? "")}</p><p>{String(value.comment ?? "")}</p></div>; }
