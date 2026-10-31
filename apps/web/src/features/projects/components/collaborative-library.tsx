import { screeningStatusLabel } from "./screening-common";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Plus, Search, ArrowRight, MessageSquare, Check, SlidersHorizontal, ArrowUpDown, X, Filter, RotateCcw, LayoutGrid, List } from "lucide-react";
import type { ScreeningPaperRow } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { canLeaveWorkspace, useUnsavedWorkspace, WorkspaceLoading } from "./workspace-common";
import { ScreeningError, ScreeningPager, screeningMetadataWarning, useScreeningCommand, choiceLabels } from "./screening-common";
import { ScreeningPaperDetail } from "./screening-round";
import { LibraryRelatedPapers } from "./library-related-papers";
import "../screening.css";
import "../collaborative-library.css";

const states: Record<string, string> = { NOT_REVIEWED: "Chờ đánh giá", IN_REVIEW: "Đang đánh giá", NEEDS_RESOLUTION: "Có bất đồng", NEEDS_MORE_INFO: "Cần xem xét thêm", ADJUDICATING: "Đang phân xử", AWAITING_FINALIZATION: "Chờ quyết định", INCLUDED: "Đã chọn", BACKGROUND: "Tài liệu nền", EXCLUDED: "Đã loại" };

export function CollaborativeLibrary({ projectId, readOnly, onAdd }: { projectId: string; readOnly: boolean; onAdd?: () => void }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [proposer, setProposer] = useState(""), [tag, setTag] = useState(""), [sort, setSort] = useState("newest"), [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lumigap_papers_view");
      if (saved === "grid" || saved === "list") return saved;
    }
    return "list";
  });
  const changeViewMode = (mode: "list" | "grid") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("lumigap_papers_view", mode);
    }
  };
  const q = useDebouncedValue(search, 250);
  const [reviewer, setReviewer] = useState(""), [personal, setPersonal] = useState("ALL"), [navigating, setNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState<unknown>(null);
  const query = { q, pageSize: 12, sort, filter: personal, ...(status ? { status } : {}), ...(proposer ? { proposerId: proposer } : {}), ...(reviewer ? { reviewerId: reviewer } : {}), ...(tag ? { tag } : {}) };
  const data = useResearchResource(projectId, ["library", q, status, proposer, reviewer, personal, tag, sort, page], () => screeningApi.board(projectId, { ...query, page }), true, () => !readOnly, 15000);
  const board = data.data, focusId = params.get("source"), local = board?.items.find(p => p.paperId === focusId);
  const focus = useResearchResource(projectId, ["library-source", focusId], () => screeningApi.board(projectId, { source: focusId!, page: 1, pageSize: 1 }), Boolean(focusId && board && !local));
  const focused = local ?? focus.data?.items[0];
  const position = board?.items.findIndex(p => p.paperId === focusId) ?? -1;

  const navigatePaper = async (direction: -1 | 1) => {
    if (!board || navigating || position < 0 || !(await canLeaveWorkspace())) return;
    const adjacent = board.items[position + direction];
    if (adjacent) { const next = new URLSearchParams(params); next.set("source", adjacent.paperId); setParams(next); return; }
    const nextPage = page + direction;
    if (nextPage < 1 || (direction === 1 && !board.hasNext)) return;
    setNavigating(true);
    setNavigationError(null);
    try {
      const result = await screeningApi.board(projectId, { ...query, page: nextPage });
      const target = direction === 1 ? result.items[0] : result.items[result.items.length - 1];
      if (target) { setPage(nextPage); const next = new URLSearchParams(params); next.set("source", target.paperId); setParams(next); }
    } catch (error) { setNavigationError(error); }
    finally { setNavigating(false); }
  };

  useEffect(() => {
    if (!focusId) return;
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
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void navigatePaper(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        void navigatePaper(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusId, position, page, board, navigating]);

  const [showFilters, setShowFilters] = useState(false);
  const advancedFilterCount = (proposer ? 1 : 0) + (reviewer ? 1 : 0) + (tag ? 1 : 0);
  const isPillAll = !status && personal === "ALL" && !proposer && !reviewer && !tag;
  const isPillPending = personal === "PENDING" && !status;
  const isPillNeedsResolution = status === "NEEDS_RESOLUTION" && personal === "ALL";
  const isPillIncluded = status === "INCLUDED" && personal === "ALL";
  const isPillNotReviewed = status === "NOT_REVIEWED" && personal === "ALL";
  const activeFilterCount = (status ? 1 : 0) + (personal !== "ALL" ? 1 : 0) + advancedFilterCount;
  const resetFilters = () => {
    setStatus("");
    setProposer("");
    setReviewer("");
    setPersonal("ALL");
    setTag("");
    setPage(1);
  };
  const [selected, setSelected] = useState<Map<string, string>>(new Map()), [makingSet, setMakingSet] = useState(false);
  const [setsPage, setSetsPage] = useState(1), [showSets, setShowSets] = useState(false);
  const sets = useResearchResource(projectId, ["analysis-sets", setsPage], () => screeningApi.sets(projectId, setsPage), showSets);
  const move = async (next: URLSearchParams) => { if (await canLeaveWorkspace()) setParams(next); };
  const open = (id: string | null) => { const next = new URLSearchParams(params); if (id) next.set("source", id); else next.delete("source"); void move(next); };
  const analyzeSet = (id: string, saved = false) => { const next = new URLSearchParams(params); next.set("tab", "gaps"); next.set("analysisSet", id); next.delete("source"); next.delete("view"); if (saved) setParams(next); else void move(next); };
  function toggle(p: ScreeningPaperRow) { setSelected(old => { const next = new Map(old); if (next.has(p.paperId)) next.delete(p.paperId); else if (next.size < 10) next.set(p.paperId, p.title); return next; }); }
  const change = (run: () => void) => { run(); setPage(1); };

  return <section className="collaborative-library" aria-label="Thư viện nghiên cứu chung" aria-busy={data.isLoading}>
    <header className="library-heading"><div><div className="library-eyebrow"><BookOpen size={14} />Không gian nghiên cứu chung</div><h2>Thư viện của nhóm</h2><p>Thu thập tài liệu, cùng đánh giá và chọn bài cho phân tích.</p></div>{!readOnly && <Button size="sm" onClick={onAdd}><Plus size={14} />Thêm bài báo</Button>}</header>
    {board && <div className="library-summary" aria-label="Tổng quan thư viện"><span><strong>{board.progress.total}</strong> bài báo</span><span><strong>{board.librarySummary?.attention ?? board.progress.total - board.progress.finalized}</strong> cần xem xét</span><span><Check size={13} /><strong>{board.librarySummary?.selected ?? 0}</strong> đã chọn</span><span><MessageSquare size={13} /><strong>{board.librarySummary?.discussion ?? 0}</strong> cần trao đổi</span></div>}
    <div className="library-tools">
      <div className="library-tools-header">
        <label className="library-search">
          <Search size={14} className="library-search-icon" aria-hidden="true" />
          <Input
            aria-label="Tìm trong thư viện"
            placeholder="Tiêu đề, tác giả, DOI, từ khóa…"
            value={search}
            onChange={e => change(() => setSearch(e.target.value))}
          />
          {search && (
            <button
              type="button"
              className="library-search-clear"
              aria-label="Xóa từ khóa tìm kiếm"
              onClick={() => change(() => setSearch(""))}
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </label>

        <div className="library-tools-right">
          <div className="library-select-wrap" title="Lọc theo quyết định">
            <select
              aria-label="Quyết định chọn bài"
              className={status ? "is-filtered" : ""}
              value={status}
              onChange={e => change(() => setStatus(e.target.value))}
            >
              <option value="">Tất cả quyết định</option>
              {Object.entries(states).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="library-select-wrap" title="Lọc theo phần việc cá nhân">
            <select
              aria-label="Đánh giá của tôi"
              className={personal !== "ALL" ? "is-filtered" : ""}
              value={personal}
              onChange={e => change(() => setPersonal(e.target.value))}
            >
              <option value="ALL">Tất cả bài</option>
              <option value="PENDING">Cần tôi đánh giá</option>
              <option value="COMPLETED">Tôi đã đánh giá</option>
              <option value="MINE">Được giao cho tôi</option>
            </select>
          </div>

          <div className="library-sort-wrap" title="Sắp xếp danh sách">
            <ArrowUpDown size={13} className="library-sort-icon" aria-hidden="true" />
            <select
              aria-label="Sắp xếp thư viện"
              value={sort}
              onChange={e => change(() => setSort(e.target.value))}
            >
              <option value="newest">Mới thêm</option>
              <option value="oldest">Thêm lâu nhất</option>
              <option value="title">Tiêu đề A–Z</option>
              <option value="year">Năm xuất bản</option>
            </select>
          </div>

          <div className="library-view-switcher" role="group" aria-label="Chế độ hiển thị danh sách">
            <button
              type="button"
              className={"library-view-btn " + (viewMode === "list" ? "active" : "")}
              title="Chế độ danh sách (Side-by-side)"
              aria-pressed={viewMode === "list"}
              onClick={() => changeViewMode("list")}
            >
              <List size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={"library-view-btn " + (viewMode === "grid" ? "active" : "")}
              title="Chế độ lưới 2 cột (Chống dài text)"
              aria-pressed={viewMode === "grid"}
              onClick={() => changeViewMode("grid")}
            >
              <LayoutGrid size={14} aria-hidden="true" />
            </button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={"library-filter-toggle " + (showFilters ? "active" : "")}
            aria-expanded={showFilters}
            aria-label="Lọc thêm"
            title="Bộ lọc nâng cao (người đánh giá, người thêm, nhãn)"
            onClick={() => setShowFilters(v => !v)}
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            <span>Lọc thêm</span>
            {advancedFilterCount > 0 && <span className="library-filter-badge">{advancedFilterCount}</span>}
          </Button>
        </div>
      </div>

      <div className="library-quick-pills-row" role="group" aria-label="Bộ lọc nhanh">
        <div className="library-quick-pills">
          <button
            type="button"
            className={`library-pill ${isPillAll ? "active" : ""}`}
            onClick={resetFilters}
          >
            Tất cả
          </button>
          <button
            type="button"
            className={`library-pill pill-pending ${isPillPending ? "active" : ""}`}
            onClick={() => change(() => {
              if (isPillPending) {
                setPersonal("ALL");
              } else {
                setPersonal("PENDING");
                setStatus("");
              }
            })}
          >
            Cần tôi đánh giá
          </button>
          <button
            type="button"
            className={`library-pill pill-needs-resolution ${isPillNeedsResolution ? "active" : ""}`}
            onClick={() => change(() => {
              if (isPillNeedsResolution) {
                setStatus("");
              } else {
                setStatus("NEEDS_RESOLUTION");
                setPersonal("ALL");
              }
            })}
          >
            Cần xem xét thêm
          </button>
          <button
            type="button"
            className={`library-pill pill-included ${isPillIncluded ? "active" : ""}`}
            onClick={() => change(() => {
              if (isPillIncluded) {
                setStatus("");
              } else {
                setStatus("INCLUDED");
                setPersonal("ALL");
              }
            })}
          >
            Đã chọn
          </button>
          <button
            type="button"
            className={`library-pill pill-not-reviewed ${isPillNotReviewed ? "active" : ""}`}
            onClick={() => change(() => {
              if (isPillNotReviewed) {
                setStatus("");
              } else {
                setStatus("NOT_REVIEWED");
                setPersonal("ALL");
              }
            })}
          >
            Chưa có đánh giá
          </button>
        </div>

        {activeFilterCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="library-reset-filters-btn"
            onClick={resetFilters}
          >
            <RotateCcw size={12} aria-hidden="true" />
            <span>Xóa bộ lọc</span>
          </Button>
        )}
      </div>

      <div className={"library-filters-tray " + (showFilters ? "expanded" : "collapsed")}>
        <div className="library-filters-row">
          <div className="library-filters-intro">
            <Filter size={12} className="text-primary shrink-0" aria-hidden="true" />
            <span>Bộ lọc nâng cao:</span>
          </div>

          <div className="library-filters-selects">
            <select
              aria-label="Người đánh giá"
              className={reviewer ? "is-filtered" : ""}
              value={reviewer}
              onChange={e => change(() => setReviewer(e.target.value))}
            >
              <option value="">Mọi người đánh giá</option>
              {board?.filters.reviewers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              aria-label="Người thêm bài"
              className={proposer ? "is-filtered" : ""}
              value={proposer}
              onChange={e => change(() => setProposer(e.target.value))}
            >
              <option value="">Mọi người thêm bài</option>
              {board?.filters.proposers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {Boolean(board?.tags?.length) && (
              <select
                aria-label="Chủ đề và nhãn"
                className={tag ? "is-filtered" : ""}
                value={tag}
                onChange={e => change(() => setTag(e.target.value))}
              >
                <option value="">Mọi chủ đề / nhãn</option>
                {board?.tags?.map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
    </div>
    {data.isLoading ? <WorkspaceLoading /> : data.isError ? <ScreeningError error={data.error} retry={() => void data.refetch()} /> : board && <>
      {board.progress.legacy > 0 && <p className="library-legacy">Có {board.progress.legacy} bài mang phân loại từ quy trình cũ. Nhóm vẫn đọc được tài liệu; phân loại cũ không được tính là đánh giá hoặc quyết định chọn mới.</p>}
      {!board.items.length && <div className="library-empty"><BookOpen size={24} /><h3>{board.progress.total ? "Không có bài khớp bộ lọc" : "Bắt đầu từ những bài nhóm đang đọc"}</h3><p>{board.progress.total ? "Thử đổi từ khóa hoặc bộ lọc để tìm lại tài liệu." : "Thêm từ kho bài, OpenAlex, DOI, BibTeX hoặc PDF riêng của dự án."}</p>{!readOnly && !board.progress.total && <Button size="sm" onClick={onAdd}><Plus size={14} />Thêm bài đầu tiên</Button>}</div>}
      <div className={`library-list ${viewMode === "grid" ? "is-grid" : "is-list"}`}>
        {board.items.map(p => {
          const round = p.round, disagreement = round && !round.hiddenReviews && new Set(round.reviews.map(r => r.decision)).size > 1;
          return (
            <article key={p.paperId} className="library-paper">
              <header className="library-paper-header">
                <div className="library-paper-header-left">
                  {!readOnly && (
                    <input
                      type="checkbox"
                      aria-label={`Đưa vào bộ phân tích: ${p.title}`}
                      checked={selected.has(p.paperId)}
                      disabled={selected.size >= 10 && !selected.has(p.paperId)}
                      onChange={() => toggle(p)}
                      className="library-paper-checkbox"
                    />
                  )}
                  <span className="library-paper-year">{p.publicationYear || "Chưa rõ năm"}</span>
                  {p.journalName && (
                    <span className="library-paper-journal" title={p.journalName}>
                      {p.journalName}
                    </span>
                  )}
                  {p.fullTextAvailable && (
                    <span className="library-paper-fulltext-chip" title="Có nguồn toàn văn">
                      Có toàn văn
                    </span>
                  )}
                </div>

                <div className="library-paper-header-right">
                  <span className="library-selection-state" data-state={round?.status ?? "NOT_REVIEWED"}>
                    {screeningStatusLabel(round?.status ?? "NOT_REVIEWED", round)}
                  </span>
                </div>
              </header>

              <div className="library-paper-body">
                <h3 className="library-paper-title">
                  <button type="button" onClick={() => open(p.paperId)}>
                    {p.title}
                  </button>
                </h3>

                {Boolean(p.authors?.length) && (
                  <p className="library-authors" title={p.authors!.join(", ")}>
                    {p.authors!.join(", ")}
                  </p>
                )}

                {p.abstractText && <p className="library-abstract">{p.abstractText}</p>}

                {Boolean(p.tags?.length) && (
                  <div className="library-tags">
                    {p.tags!.map(t => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                )}

                {screeningMetadataWarning(p) && (
                  <p className="library-metadata-warning">Cần kiểm tra metadata trước khi sử dụng.</p>
                )}
                {p.notes && <p className="library-note">Ghi chú: {p.notes}</p>}
              </div>

              <footer className="library-paper-footer">
                <div className="library-paper-footer-left">
                  <span
                    className="library-paper-proposer"
                    title={`Thời điểm thêm: ${new Date(p.proposedAt).toLocaleString("vi-VN")}`}
                  >
                    Thêm bởi {p.proposer?.name ?? "Không có dữ liệu lịch sử"} · {new Date(p.proposedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} {new Date(p.proposedAt).toLocaleDateString("vi-VN")}
                  </span>
                  <span className="library-footer-dot" aria-hidden="true">·</span>
                  <div className="library-opinions">
                    {round?.hiddenReviews ? (
                      <span className="library-opinion-text">Ý kiến nhóm đang được ẩn</span>
                    ) : round?.myReview ? (
                      <span className="library-opinion-text" data-choice={round.myReview.decision}>
                        Tôi: <strong>{choiceLabels[round.myReview.decision]}</strong> · {round.completed} người đánh giá
                      </span>
                    ) : round?.reviews.length ? (
                      <span className="library-opinion-text">
                        {round.completed} người đánh giá · Tôi chưa đánh giá
                      </span>
                    ) : (
                      <span className="library-opinion-muted">Chưa có đánh giá của nhóm</span>
                    )}
                    {disagreement && (
                      <strong className="library-disagreement-warning">
                        Có ý kiến khác nhau
                      </strong>
                    )}
                  </div>
                </div>

                <div className="library-paper-footer-right">
                  <Button variant="outline" size="sm" className="library-action-btn" onClick={() => open(p.paperId)}>
                    <span>{round?.myReview ? "Xem & cập nhật" : "Đọc & đánh giá"}</span>
                    <ArrowRight size={13} aria-hidden="true" />
                  </Button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>
      {(board.total > 12 || page > 1) && <ScreeningPager page={page} total={board.total} hasNext={board.hasNext} onPage={setPage} />}
    </>}
    {selected.size > 0 && !readOnly && <div className="library-selection-bar" role="region" aria-label="Bộ bài đang chọn"><span><strong>{selected.size}/10</strong> bài trong bộ phân tích</span><Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>Bỏ chọn</Button><Button disabled={selected.size < 2} onClick={() => setMakingSet(true)}>Đưa vào phân tích<ArrowRight size={14} /></Button><small>Cần 2–10 bài. Có thể tạo bộ nháp trước khi chốt.</small></div>}
    <details onToggle={e => setShowSets(e.currentTarget.open)} className="library-sets"><summary>Các bộ bài phân tích đã lưu</summary>{sets.isLoading ? <WorkspaceLoading /> : sets.isError ? <ScreeningError error={sets.error} retry={() => void sets.refetch()} /> : <>{sets.data?.items.map(s => <div key={s.id}><span><strong>{s.mode === "DRAFT" ? "Nháp" : "Chính thức"} · {s.sources.length} bài</strong><small>{s.topic} · {new Date(s.createdAt).toLocaleString("vi-VN")}</small></span><Button size="sm" variant="outline" onClick={() => analyzeSet(s.id)}>Mở bộ bài</Button></div>)}{sets.data && !sets.data.total && <p>Chưa tạo bộ bài. Đánh dấu từ hai bài trong thư viện để bắt đầu.</p>}{sets.data && sets.data.total > 20 && <ScreeningPager page={setsPage} total={sets.data.total} hasNext={sets.data.hasNext} onPage={setSetsPage} />}</>}</details>
    {focusId && <Dialog open onOpenChange={v => { if (!v) open(null); }}><DialogContent className="screening-workspace library-paper-dialog" data-no-i18n onOpenAutoFocus={e => e.preventDefault()}>
      <div className="library-dialog-header">
        <DialogTitle>Đọc và đánh giá tài liệu</DialogTitle>
        <DialogDescription>Giữ riêng ý kiến cá nhân, đối chiếu tiêu chí và lưu quyết định của nhóm theo quy trình.</DialogDescription>
      </div>
      {!focused ? focus.isError ? <ScreeningError error={focus.error} retry={() => void focus.refetch()} /> : focus.isLoading || data.isLoading ? <WorkspaceLoading /> : <p>Không tìm thấy bài trong dự án. Thư viện có thể vừa thay đổi.</p> : <>
        <nav className="paper-reading-navigation" aria-label="Chuyển bài báo">
          <Button size="sm" variant="outline" disabled={navigating || position < 0 || (position === 0 && page === 1)} onClick={() => void navigatePaper(-1)}>← Bài trước</Button>
          <span className="paper-reading-counter">
            {position >= 0 ? `${(page - 1) * 12 + position + 1} / ${board?.total ?? 0} bài` : "Bài đang mở"}
            <kbd className="paper-nav-hint" title="Dùng phím mũi tên Trái / Phải để chuyển bài nhanh">← / →</kbd>
          </span>
          <Button size="sm" variant="outline" disabled={navigating || position < 0 || (position === (board?.items.length ?? 0) - 1 && !board?.hasNext)} onClick={() => void navigatePaper(1)}>Bài tiếp →</Button>
        </nav>
        <ScreeningError error={navigationError} />
        <ScreeningPaperDetail settings={board?.settings} collaborative={board?.settings.reviewMode === "COLLABORATIVE"} key={`detail-${focused.paperId}`} projectId={projectId} paper={focused} people={board?.people ?? []} readOnly={readOnly} relatedSection={<LibraryRelatedPapers key={`related-${focused.paperId}`} projectId={projectId} paperId={focused.paperId} readOnly={readOnly} />} />
        <footer className="library-dialog-footer">
          <div className="screening-actions">
            <Button size="sm" variant="outline" onClick={() => { const next = new URLSearchParams(params); next.set("view", "organize"); void move(next); }}>Ghi chú, nhãn & nguồn</Button>
            <Button size="sm" disabled={focused.round?.finalDecision?.decision !== "INCLUDED" || focused.round?.extractionReady === false} variant="outline" onClick={() => { const next = new URLSearchParams(params); next.set("view", "evidence"); next.set("extract", focused.paperId); next.delete("source"); void move(next); }}>Trích xuất vào ma trận minh chứng</Button>
          </div>
          {(focused.round?.finalDecision?.decision !== "INCLUDED" || focused.round?.extractionReady === false) && <p className="text-xs text-muted-foreground">Trích xuất mở sau khi hoàn thành quy trình và có quyết định đưa vào phân tích. Minh chứng đã lưu vẫn được giữ khi thay đổi lựa chọn.</p>}
        </footer>
      </>}
    </DialogContent></Dialog>}
    {makingSet && <CreateAnalysisSet projectId={projectId} selected={selected} canConfirm={Boolean(board?.canManage)} onClose={() => setMakingSet(false)} onCreated={id => { setMakingSet(false); setSelected(new Map()); analyzeSet(id, true); }} />}
  </section>;
}

function CreateAnalysisSet({ projectId, selected, canConfirm, onClose, onCreated }: { projectId: string; selected: Map<string, string>; canConfirm: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [mode, setMode] = useState("DRAFT"), [topic, setTopic] = useState("");
  const command = useScreeningCommand(projectId); useUnsavedWorkspace(Boolean(topic) || command.isPending);
  return <Dialog open onOpenChange={async open => { if (!open && !command.isPending && await canLeaveWorkspace()) onClose(); }}><DialogContent className="screening-workspace" data-no-i18n><DialogTitle>Tạo bộ bài phân tích</DialogTitle><DialogDescription>Lưu đúng tài liệu, quyết định và phiên bản minh chứng tại thời điểm này. Chưa chạy AI hoặc sử dụng credit ở bước này.</DialogDescription><form className="screening-form" onSubmit={async e => { e.preventDefault(); let id = ""; const payload = { mode, topic: topic.trim(), paperIds: [...selected.keys()] }; if (await command.run(payload, async clientKey => { const result = await screeningApi.createSet(projectId, { ...payload, clientKey }); id = result.id; return result; })) { setTopic(""); onCreated(id); } }}>
    <fieldset disabled={command.isPending}><label>Câu hỏi / hướng phân tích<Input value={topic} onChange={e => setTopic(e.target.value)} required minLength={3} maxLength={200} /></label><label>Loại bộ bài<select value={mode} onChange={e => setMode(e.target.value)}><option value="DRAFT">Nháp — khám phá, kết quả sơ bộ</option>{canConfirm && <option value="OFFICIAL">Chính thức — chỉ bài đã được chọn</option>}</select></label><p>{mode === "DRAFT" ? "Có thể dùng bài chưa chốt. Không thay đổi quyết định chính thức của nhóm." : "Chủ dự án xác nhận bộ bài. Mỗi bài phải có quyết định chọn hiện hành; phân loại lịch sử chưa đủ điều kiện."}</p><ul>{[...selected].map(([id, title]) => <li key={id}>{title}</li>)}</ul></fieldset><ScreeningError error={command.error} /><Button disabled={command.isPending || topic.trim().length < 3}>Lưu bộ bài & mở phân tích</Button>
  </form></DialogContent></Dialog>;
}
