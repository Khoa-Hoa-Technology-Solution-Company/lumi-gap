import { useState } from "react";
import { Link } from "react-router-dom";
import type { EvidenceContent, EvidenceSourceScope, EvidenceVerificationStatus, ExtractionSuggestion, ProjectEvidence } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { canLeaveWorkspace, useUnsavedWorkspace, WorkspaceError, WorkspaceLoading } from "./workspace-common";

const blank: EvidenceContent = { claim: "", quotation: "", locator: "", context: "", methodology: "", population: "", results: "", limitations: "", themes: [], criteriaValues: {} };
export const verificationLabels = { DRAFT: "AI gợi ý / Bản nháp", NEEDS_VERIFICATION: "Cần kiểm chứng", VERIFIED: "Đã đối chiếu với nguồn", REVISIT: "Cần xem xét lại" } as const;
export function VerificationBadge({ status = "NEEDS_VERIFICATION" }: { status?: EvidenceVerificationStatus }) { return <span className={`evidence-verification evidence-verification-${status.toLowerCase()}`}>{verificationLabels[status]}</span>; }
const snapshotScope = (item?: ProjectEvidence): EvidenceSourceScope => item?.sourceScope ?? (String(item?.sourceSnapshot.sourceKind ?? "").toUpperCase() === "ABSTRACT" ? "ABSTRACT" : "UNSPECIFIED");
const scopeLabel = (scope: EvidenceSourceScope) => scope === "ABSTRACT" ? "Chỉ dựa trên tóm tắt" : scope === "FULL_TEXT" ? "Nguồn toàn văn" : "Chưa xác định phạm vi nguồn";
function contentOf(item?: ProjectEvidence): EvidenceContent { return item ? { claim: item.claim, quotation: item.quotation, locator: item.locator, context: item.context, methodology: item.methodology, population: item.population, results: item.results, limitations: item.limitations, themes: item.themes, criteriaValues: { ...(item.criteriaValues ?? {}) } } : { ...blank, criteriaValues: {} }; }

export function EvidenceEditor({ projectId, item, initialPaperId, onClose }: { projectId: string; item?: ProjectEvidence; initialPaperId?: string; onClose: () => void }) {
  const [base] = useState(() => contentOf(item)), [content, setContent] = useState(() => contentOf(item));
  const [paperId, setPaperId] = useState(item?.paperId ?? initialPaperId ?? ""), [clientKey] = useState(() => crypto.randomUUID());
  const [sourceQ, setSourceQ] = useState(""), [sourcePage, setSourcePage] = useState(1), [themes, setThemes] = useState(item?.themes.join(", ") ?? "");
  const [questionIds, setQuestions] = useState<string[]>(() => item?.relatedQuestions?.map(question => question.id) ?? []);
  const [scope, setScope] = useState<EvidenceSourceScope>(() => snapshotScope(item));
  const [suggestion, setSuggestion] = useState<ExtractionSuggestion | null>(null), [showSuggestions, setShowSuggestions] = useState(false), [showSource, setShowSource] = useState(false), [sourceChunkId, setSourceChunk] = useState<string | undefined>();
  const command = useResearchCommand(projectId);
  const criteria = useResearchResource(projectId, ["matrix-criteria"], () => researchApi.matrixCriteria(projectId));
  const sources = useResearchResource(projectId, ["evidence-sources", sourceQ, sourcePage], () => researchApi.evidenceWorkspace(projectId, { eligibility: "ELIGIBLE", page: sourcePage, pageSize: 20, q: sourceQ }));
  const selectedSource = useResearchResource(projectId, ["evidence-source-eligibility", paperId], () => researchApi.evidenceWorkspace(projectId, { paperId, eligibility: "ALL", page: 1, pageSize: 1 }), Boolean(paperId) && !item);
  const canSave = Boolean(paperId && content.claim.trim().length >= 3 && !command.isPending && !sources.isError && (item || selectedSource.data?.items.some(paper => paper.paperId === paperId && paper.eligible)));
  const suggestions = useResearchResource(projectId, ["suggestions", paperId], () => researchApi.suggestions(projectId, paperId), showSuggestions && Boolean(paperId) && !item);
  const source = useResearchResource(projectId, ["paper-analysis", paperId], () => researchApi.paperAnalysis(projectId, paperId), showSource && Boolean(paperId));
  useUnsavedWorkspace(JSON.stringify(content) !== JSON.stringify(base) || themes !== (item?.themes.join(", ") ?? "") || JSON.stringify(questionIds) !== JSON.stringify(item?.relatedQuestions?.map(question => question.id) ?? []) || scope !== snapshotScope(item) || Boolean(suggestion));
  const save = async (draft: boolean) => {
    if (!canSave) return;
    const active = new Set((criteria.data ?? []).map(column => column.id));
    const fields = { ...content, criteriaValues: Object.fromEntries(Object.entries(content.criteriaValues ?? {}).filter(([key]) => active.has(key))), themes: [...new Set(themes.split(",").map(value => value.trim()).filter(Boolean))], questionIds, draft, sourceScope: scope };
    try { await command.mutateAsync(() => item ? researchApi.editEvidence(projectId, item.id, { ...fields, expectedVersion: item.version }) : researchApi.createEvidence(projectId, { ...fields, paperId, origin: suggestion ? "AI_SUGGESTED" : "HUMAN", clientKey, ...(suggestion?.analysisHash ? { analysisHash: suggestion.analysisHash } : {}), ...(suggestion?.corpusPaperId ? { corpusPaperId: suggestion.corpusPaperId } : {}), ...(sourceChunkId ? { sourceChunkId } : {}) })); onClose(); } catch { /* Keep the entire draft and its provenance for correction. */ }
  };
  const selectedPaperMeta = selectedSource.data?.items.find(paper => paper.paperId === paperId) ?? sources.data?.items.find(paper => paper.paperId === paperId);
  const field = (key: keyof Omit<EvidenceContent, "themes" | "criteriaValues">, label: string, required = false, placeholder?: string) => (
    <label key={key}>
      {label}
      <textarea
        required={required}
        maxLength={key === "locator" ? 500 : 5000}
        placeholder={placeholder}
        value={content[key]}
        onChange={event => {
          if (key === "quotation") setSourceChunk(undefined);
          setContent(value => ({ ...value, [key]: event.target.value }));
        }}
      />
    </label>
  );
  return <form className="research-form research-editor evidence-editor" aria-label="Trích xuất nghiên cứu" onSubmit={event => { event.preventDefault(); void save(false); }}>
    <header className="evidence-editor-header">
      <div>
        <h3>{item ? "Chỉnh sửa trích xuất bằng chứng" : "Trích xuất bằng chứng từ bài báo"}</h3>
        <p className="research-help">Lưu nội dung làm việc trước, sau đó đối chiếu và xác nhận riêng. Chỉ phát hiện chính là bắt buộc; các mục không áp dụng (như bộ dữ liệu cho nghiên cứu lý thuyết) có thể để trống.</p>
      </div>
      {paperId && (
        <div className="research-actions">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=library&source=${encodeURIComponent(paperId)}`}>
              Mở bài báo trong Thư viện
            </Link>
          </Button>
        </div>
      )}
    </header>

    <div className="evidence-editor-columns">
      {/* CỘT TRÁI: Thông tin bài báo có sẵn từ Library, Abstract/PDF nguồn & AI hỗ trợ phân tích */}
      <aside className="evidence-source-column" aria-label="Nguồn bài báo và hỗ trợ phân tích">
        {!item && (
          <div className="evidence-source-picker">
            <label>Tìm nguồn đủ điều kiện<Input type="search" maxLength={200} placeholder="Tìm theo tên bài báo, DOI..." value={sourceQ} onChange={event => { setSourceQ(event.target.value); setSourcePage(1); }} /></label>
            <label>Bài báo<select value={paperId} required onChange={async event => { const next = event.target.value; if (!(await canLeaveWorkspace())) return; setPaperId(next); setContent({ ...blank }); setSuggestion(null); setThemes(""); setSourceChunk(undefined); setScope("UNSPECIFIED"); setShowSource(false); setShowSuggestions(false); }}><option value="">Chọn bài báo</option>{paperId && !sources.data?.items.some(paper => paper.paperId === paperId) && <option value={paperId}>{selectedPaperMeta?.title ?? "Bài báo đang chọn"}</option>}{sources.data?.items.map(paper => <option key={paper.paperId} value={paper.paperId}>{paper.title}</option>)}</select></label>
            {(sourcePage > 1 || sources.data?.hasNext) && <div className="research-actions"><Button variant="ghost" type="button" disabled={sourcePage === 1} onClick={() => setSourcePage(value => value - 1)}>Nguồn trước</Button><Button variant="ghost" type="button" disabled={!sources.data?.hasNext} onClick={() => setSourcePage(value => value + 1)}>Nguồn sau</Button></div>}
            {sources.isLoading && <p className="research-help">Đang tải nguồn…</p>}
            {sources.isError && <WorkspaceError error={sources.error} retry={() => void sources.refetch()} />}
            {sources.isSuccess && !sources.data.items.length && <p role="status" className="research-help">Chưa có nguồn phù hợp. Hoàn tất sàng lọc trong Thư viện hoặc đổi từ khóa tìm kiếm.</p>}
          </div>
        )}

        {(selectedPaperMeta || item) && (
          <div className="evidence-paper-metadata-card" aria-label="Thông tin bài báo từ Thư viện">
            <div className="evidence-paper-meta-badges">
              <span className="evidence-paper-status-pill">Đã chọn trong Thư viện</span>
              <span className="evidence-paper-scope-pill">
                {selectedPaperMeta?.fullTextAvailable ? "Có nguồn toàn văn / PDF" : "Phân tích dựa trên Abstract"}
              </span>
            </div>
            <h4>{selectedPaperMeta?.title ?? item?.sourceTitle ?? "Bài báo nghiên cứu"}</h4>
            {Boolean(selectedPaperMeta?.authors?.length) && (
              <p className="evidence-meta">{selectedPaperMeta!.authors!.join(", ")}</p>
            )}
            <p className="evidence-meta">
              {selectedPaperMeta?.publicationYear ?? (typeof item?.sourceSnapshot.publicationYear === "number" ? item.sourceSnapshot.publicationYear : "Chưa rõ năm")}
              {selectedPaperMeta?.journalName ? ` · ${selectedPaperMeta.journalName}` : ""}
              {(selectedPaperMeta?.doi ?? (typeof item?.sourceSnapshot.doi === "string" ? item.sourceSnapshot.doi : null))
                ? ` · DOI: ${selectedPaperMeta?.doi ?? String(item?.sourceSnapshot.doi)}`
                : ""}
            </p>
            {selectedPaperMeta?.paperLink && (
              <div className="research-actions">
                <Button asChild variant="outline" size="sm">
                  <a href={selectedPaperMeta.paperLink} target="_blank" rel="noopener noreferrer">
                    {selectedPaperMeta.fullTextAvailable ? "Mở PDF / Toàn văn ↗" : "Xem nguồn gốc ↗"}
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}

        {!item && selectedSource.isSuccess && !selectedSource.data.items.some(paper => paper.paperId === paperId && paper.eligible) && (
          <p role="status" className="evidence-warning">Bài đang chọn chưa đủ điều kiện phân tích. Hoàn tất quy trình sàng lọc trước khi thêm trích xuất.</p>
        )}
        {selectedSource.isError && <WorkspaceError error={selectedSource.error} retry={() => void selectedSource.refetch()} />}

        <div className="evidence-source-reader-box">
          <div className="evidence-source-reader-header">
            <strong>Nội dung nguồn (Abstract / Đoạn trích PDF)</strong>
            <Button type="button" variant="outline" size="sm" disabled={!paperId} onClick={() => setShowSource(value => !value)}>
              Xem đoạn nguồn đã lưu
            </Button>
          </div>
          {showSource ? (
            source.isLoading ? <WorkspaceLoading /> : source.isError ? <WorkspaceError error={source.error} /> : (
              <div className="evidence-source-passages">
                <p className="evidence-scope" role="status">
                  {source.data?.knowledge.sourceKind === "full_text" ? "Nguồn văn bản toàn văn đã lập chỉ mục" : "Phân tích dựa trên Abstract — Chỉ dựa trên tóm tắt"}
                </p>
                {source.data?.abstractText && (
                  <div className="evidence-abstract-preview">
                    <strong>Tóm tắt (Abstract):</strong>
                    <p>{source.data.abstractText}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSourceChunk(undefined);
                        setScope("ABSTRACT");
                        setContent(value => ({ ...value, quotation: source.data?.abstractText ?? "", locator: value.locator || "Abstract" }));
                      }}
                    >
                      Dùng đoạn tóm tắt
                    </Button>
                  </div>
                )}
                {source.data?.knowledge.status === "ready" && source.data.knowledge.passages.length > 0 ? (
                  source.data.knowledge.passages.map(passage => (
                    <details key={passage.id} open={source.data!.knowledge.passages.length <= 2}>
                      <summary>{passage.pageNumber ? `Trang ${passage.pageNumber}` : "Đoạn nguồn"}</summary>
                      <p>{passage.text}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSourceChunk(passage.id);
                          setScope(source.data?.knowledge.sourceKind === "abstract" ? "ABSTRACT" : "FULL_TEXT");
                          setContent(value => ({ ...value, quotation: passage.text, locator: passage.pageNumber ? `PDF p. ${passage.pageNumber}` : "Abstract" }));
                        }}
                      >
                        Dùng đoạn nguồn
                      </Button>
                    </details>
                  ))
                ) : (
                  <p className="research-help">Chưa có đoạn nguồn toàn văn được lập chỉ mục. Bạn vẫn có thể đọc nguồn và ghi trích dẫn, vị trí thủ công.</p>
                )}
              </div>
            )
          ) : (
            <p className="research-help">Bấm &ldquo;Xem đoạn nguồn đã lưu&rdquo; để đọc tóm tắt hoặc đoạn văn bản PDF ngay bên cạnh khi trích xuất.</p>
          )}
        </div>

        {!item && (
          <div className="evidence-ai">
            <div className="evidence-ai-header">
              <div>
                <strong>AI hỗ trợ phân tích</strong>
                <p className="research-help">Chỉ sử dụng Abstract hoặc văn bản PDF hợp lệ của bài báo, không suy diễn số liệu.</p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={!paperId} onClick={() => setShowSuggestions(true)}>
                Xem gợi ý AI có sẵn
              </Button>
            </div>
            {showSuggestions && (
              <div className="evidence-ai-body">
                <p className="evidence-scope" role="status">
                  {selectedPaperMeta?.fullTextAvailable ? "Gợi ý AI dựa trên nguồn đã lưu · Cần kiểm chứng" : "Phân tích dựa trên Abstract · Gợi ý chỉ là bản nháp, cần kiểm chứng"}
                </p>
                <p className="research-help">Gợi ý chỉ là bản nháp. Không tự chạy AI hoặc xác nhận nội dung khi mở trang.</p>
                {suggestions.isLoading ? <WorkspaceLoading /> : suggestions.isError ? <WorkspaceError error={suggestions.error} /> : !suggestions.data?.length ? (
                  <p className="research-help">Chưa có gợi ý đã lưu cho bài này. Bạn có thể trích xuất thủ công từ nguồn.</p>
                ) : (
                  suggestions.data.map((value, index) => (
                    <details key={`${value.corpusPaperId ?? value.analysisHash}-${index}`} open={index === 0}>
                      <summary>Gợi ý {index + 1}: {value.content.claim.slice(0, 110)}</summary>
                      <div className="evidence-ai-suggestion-card">
                        <p><strong>Phát hiện chính:</strong> {value.content.claim}</p>
                        {value.content.methodology && <p><strong>Phương pháp:</strong> {value.content.methodology}</p>}
                        {value.content.population && <p><strong>Dữ liệu / đối tượng:</strong> {value.content.population}</p>}
                        {value.content.limitations && <p><strong>Hạn chế:</strong> {value.content.limitations}</p>}
                        <div className="research-actions">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!(await canLeaveWorkspace())) return;
                              setSuggestion(value);
                              setContent(value.content);
                              setThemes(value.content.themes.join(", "));
                              setSourceChunk(undefined);
                              setScope(selectedPaperMeta?.fullTextAvailable ? "UNSPECIFIED" : "ABSTRACT");
                            }}
                          >
                            Dùng làm bản nháp
                          </Button>
                          {suggestion === value && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSuggestion(null)}
                            >
                              Bỏ qua gợi ý
                            </Button>
                          )}
                        </div>
                      </div>
                    </details>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        {suggestion && <p role="status" className="evidence-warning">AI gợi ý / Bản nháp. Nguồn gốc AI vẫn được giữ sau khi bạn sửa; lưu không đồng nghĩa đã kiểm chứng.</p>}
      </aside>

      {/* CỘT PHẢI: Các trường trích xuất bằng chứng có cấu trúc */}
      <div className="evidence-fields-column">
        <fieldset className="evidence-question-picker">
          <legend>Research Question liên quan <span>(không bắt buộc)</span></legend>
          {sources.data?.questions.length ? sources.data.questions.map((question, index) => (
            <label className="research-check" key={question.id}>
              <input type="checkbox" checked={questionIds.includes(question.id)} onChange={event => setQuestions(value => event.target.checked ? [...value, question.id] : value.filter(id => id !== question.id))} />
              <span>RQ{index + 1}: {question.text}</span>
            </label>
          )) : <p className="research-help">Chưa có RQ trong kế hoạch. Bạn có thể lưu trích xuất và liên kết sau.</p>}
        </fieldset>

        <div className="evidence-editor-fields">
          {field("context", "Mục tiêu & bối cảnh nghiên cứu (Research Objective)", false, "Bài báo giải quyết bài toán hoặc mục tiêu nghiên cứu nào?")}
          {field("methodology", "Phương pháp nghiên cứu (Methodology)", false, "Thiết kế nghiên cứu, mô hình, quy trình hoặc phương pháp tiếp cận...")}
          {field("population", "Dữ liệu, đối tượng hoặc mẫu (Dataset / Study Data)", false, "Bộ dữ liệu, kích thước mẫu hoặc đối tượng khảo sát (để trống nếu không áp dụng)...")}
          {field("claim", "Phát hiện chính (Key Findings — bắt buộc)", true, "Kết luận hoặc phát hiện cốt lõi có thể kiểm chứng từ bài báo...")}
          {field("results", "Kết quả bổ sung & chỉ số (Results / Findings)", false, "Số liệu thực nghiệm, chỉ số đo lường hoặc kết quả chi tiết...")}
          {field("limitations", "Hạn chế (Limitations)", false, "Hạn chế về phạm vi, dữ liệu, giả định hoặc khả năng tổng quát hóa...")}
        </div>

        <div className="evidence-provenance-fields">
          <div className="evidence-locator-row">
            <label>
              Trang, mục hoặc vị trí nguồn (Source Location)
              <Input maxLength={500} placeholder="Ví dụ: Section 4.2, Page 6, Table 2 hoặc Abstract" value={content.locator} onChange={event => setContent(value => ({ ...value, locator: event.target.value }))} />
            </label>
            <label>
              Phạm vi nguồn
              <select value={scope} onChange={event => setScope(event.target.value as EvidenceSourceScope)}>
                <option value="UNSPECIFIED">Chưa xác định</option>
                <option value="ABSTRACT">Chỉ dựa trên tóm tắt (Abstract)</option>
                <option value="FULL_TEXT">Đã đọc toàn văn (Full-text)</option>
              </select>
            </label>
          </div>
          {field("quotation", "Đoạn nguồn nguyên văn & nhận xét bổ sung (Direct Quote / Research Notes)", false, "Trích nguyên văn câu/đoạn trong bài báo hoặc ghi chú nghiên cứu của bạn...")}
          <label>
            Chủ đề (ngăn cách bằng dấu phẩy)
            <Input value={themes} maxLength={1000} placeholder="Ví dụ: transformer, clinical trial, small sample" onChange={event => setThemes(event.target.value)} />
          </label>
        </div>

        {!!criteria.data?.length && (
          <fieldset className="evidence-matrix-fields">
            <legend>Cột ma trận của dự án <span>(không bắt buộc)</span></legend>
            {criteria.data.map(column => (
              <label key={column.id}>
                {column.label}
                {column.description && <small className="research-help">{column.description}</small>}
                <textarea maxLength={2000} value={content.criteriaValues?.[column.id] ?? ""} onChange={event => setContent(value => ({ ...value, criteriaValues: { ...(value.criteriaValues ?? {}), [column.id]: event.target.value } }))} />
              </label>
            ))}
          </fieldset>
        )}

        {command.isError && <WorkspaceError error={command.error} />}
        <div className="research-actions evidence-editor-actions">
          <Button type="submit" disabled={!canSave}>Lưu để kiểm chứng</Button>
          <Button type="button" variant="outline" disabled={!canSave} onClick={() => void save(true)}>Lưu bản nháp</Button>
          <Button type="button" variant="ghost" onClick={async () => { if (await canLeaveWorkspace()) onClose(); }}>Hủy</Button>
        </div>
      </div>
    </div>
  </form>;
}

export function EvidenceDetail({ projectId, item, readOnly, onEdit }: { projectId: string; item: ProjectEvidence; readOnly: boolean; onEdit: () => void }) {
  const [historyOpen, setHistoryOpen] = useState(false), [reviewOpen, setReviewOpen] = useState(false);
  const [reviewVersion, setReviewVersion] = useState(item.version), [confirmed, setConfirmed] = useState(false), [rationale, setRationale] = useState("");
  const history = useResearchResource(projectId, ["evidence-history", item.id], () => researchApi.evidenceHistory(projectId, item.id), historyOpen);
  const command = useResearchCommand(projectId);
  const status = item.verificationStatus ?? (item.sourceNeedsReview || item.reviewState === "REJECTED" ? "REVISIT" : item.reviewState === "ACCEPTED" ? "VERIFIED" : "NEEDS_VERIFICATION");
  useUnsavedWorkspace(reviewOpen && (confirmed || Boolean(rationale)));
  const review = async (state: "ACCEPTED" | "REJECTED") => { try { await command.mutateAsync(() => researchApi.reviewEvidence(projectId, item.id, { expectedVersion: reviewVersion, state, sourceConfirmed: confirmed, rationale: rationale.trim() || (state === "ACCEPTED" ? "Đã đối chiếu nội dung trích xuất với nguồn đã đọc." : "Cần xem xét lại nội dung trích xuất.") })); setReviewOpen(false); setConfirmed(false); setRationale(""); } catch { /* Preserve review version and input on conflict. */ } };
  return <article className="evidence-detail" data-extraction-id={item.id}>
    <header><div><span className="evidence-meta">Bản trích xuất · v{item.version} · {item.origin === "AI_SUGGESTED" ? "Nguồn gốc: AI gợi ý" : "Trích xuất của thành viên"}</span><h4>{item.claim}</h4></div><VerificationBadge status={status} /></header>
    <p className="evidence-meta">{item.extractedByName ?? item.extractedById} · {item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : ""}{item.reviewedByName ? ` · Đối chiếu bởi ${item.reviewedByName}` : ""}</p>
    <p className="evidence-scope">{scopeLabel(snapshotScope(item))}</p>
    <div className="evidence-cross-links">
      <Link className="research-source-link" to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=library&source=${encodeURIComponent(item.paperId)}`}>Mở nguồn trong Thư viện</Link>
      <Link className="research-source-link" to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=analysis`}>Xem Bảng tổng hợp bằng chứng</Link>
      <Link className="research-source-link" to={`/projects/${encodeURIComponent(projectId)}?tab=manuscripts`}>Mở bản thảo LaTeX</Link>
    </div>
    {item.sourceNeedsReview && <p role="status" className="evidence-warning">Nguồn, điều kiện phân tích hoặc kết quả sàng lọc đã thay đổi. Giữ trích xuất và lịch sử để xem xét lại; nếu văn bản nguồn đã đổi, tạo bản trích xuất mới từ nguồn hiện tại.</p>}
    {item.relatedQuestions?.length ? <div className="evidence-linked-questions"><strong>RQ liên quan</strong>{item.relatedQuestions.map(question => <Link key={question.id} to={`/projects/${encodeURIComponent(projectId)}?tab=gaps&research=questions`}>{question.text}</Link>)}</div> : <p className="research-help">Chưa liên kết RQ.</p>}
    <dl className="evidence-detail-fields">{([ ["methodology", "Phương pháp"], ["results", "Kết quả bổ sung"], ["limitations", "Hạn chế"], ["context", "Bối cảnh"], ["population", "Dữ liệu / mẫu"] ] as const).map(([key, label]) => item[key] && !(key === "results" && item.results === item.claim) ? <div key={key}><dt>{label}</dt><dd>{item[key]}</dd></div> : null)}</dl>
    {item.themes.length > 0 && <div className="research-tags">{item.themes.map(theme => <span key={theme}>{theme}</span>)}</div>}
    <details className="evidence-provenance"><summary>Đoạn nguồn và nguồn gốc</summary><p>{item.sourceTitle}</p>{item.quotation ? <blockquote><p>{item.quotation}</p><cite>{item.locator || "Chưa ghi vị trí nguồn"}</cite></blockquote> : <p className="research-help">Chưa đính kèm đoạn nguồn nguyên văn.</p>}<p className="research-help">{item.sourceSnapshot.quoteCheckedAgainstIndexedSource ? "Đoạn trích khớp với văn bản nguồn đã lưu. Đây là kiểm tra văn bản, không tự xác nhận diễn giải." : "Đoạn trích chưa được kiểm tra khớp với văn bản đã lập chỉ mục."}</p>{typeof item.sourceSnapshot.doi === "string" && <p>DOI: {item.sourceSnapshot.doi}</p>}{typeof item.sourceSnapshot.chunkId === "string" && <p className="evidence-meta">Source chunk: {item.sourceSnapshot.chunkId}</p>}{item.relatedGaps?.map(gap => <p key={gap.id}><Link className="research-source-link" to={`/projects/${projectId}?tab=gaps&gap=${encodeURIComponent(gap.id)}`}>{gap.title}</Link></p>)}</details>
    {item.reviewRationale && <p className="research-help">Ghi chú đối chiếu: {item.reviewRationale}</p>}
    {!readOnly && <div className="research-actions"><Button variant="outline" size="sm" onClick={async () => { if (!(await canLeaveWorkspace())) return; setReviewVersion(item.version); setReviewOpen(value => !value); setConfirmed(false); }}>Đối chiếu trích xuất</Button><Button variant="ghost" size="sm" onClick={onEdit}>Chỉnh sửa</Button></div>}
    {reviewOpen && !readOnly && <div className="research-review"><p className="research-help">Đọc nguồn và kiểm tra phương pháp, phát hiện, hạn chế của đúng phiên bản v{reviewVersion}. Xác nhận này không thay đổi kết quả sàng lọc bài báo.</p><label className="research-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Tôi đã đối chiếu nội dung trích xuất với nguồn đã đọc</span></label><label>Ghi chú đối chiếu (không bắt buộc)<textarea maxLength={2000} value={rationale} onChange={event => setRationale(event.target.value)} /></label><div className="research-actions"><Button size="sm" disabled={command.isPending || !confirmed || item.sourceNeedsReview || item.version !== reviewVersion} onClick={() => void review("ACCEPTED")}>Xác nhận đã đối chiếu</Button><Button variant="outline" size="sm" disabled={command.isPending || item.version !== reviewVersion} onClick={() => void review("REJECTED")}>Cần xem xét lại</Button></div>{item.version !== reviewVersion && <p role="alert" className="evidence-warning">Bản trích xuất đã thay đổi. Đóng phần đối chiếu và mở lại phiên bản mới.</p>}</div>}
    {command.isError && <WorkspaceError error={command.error} />}
    <details onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>Lịch sử và phiên bản</summary>{history.isLoading ? <WorkspaceLoading /> : history.isError ? <WorkspaceError error={history.error} /> : history.data?.map(row => <details className="research-history" key={row.id}><summary>v{row.version} · {row.createdAt ? new Date(row.createdAt).toLocaleString("vi-VN") : ""} · {String(row.snapshot.reviewState ?? "PENDING")}</summary>{([ ["claim", "Phát hiện"], ["methodology", "Phương pháp"], ["limitations", "Hạn chế"], ["quotation", "Đoạn nguồn"], ["locator", "Vị trí"], ["reviewRationale", "Ghi chú đối chiếu"] ] as const).map(([key, label]) => row.snapshot[key] ? <p key={key}><strong>{label}: </strong>{String(row.snapshot[key])}</p> : null)}<p className="evidence-meta">Người trích xuất: {String(row.snapshot.extractedById ?? "")} · Người đối chiếu: {String(row.snapshot.reviewedById ?? "")}</p></details>)}</details>
  </article>;
}
