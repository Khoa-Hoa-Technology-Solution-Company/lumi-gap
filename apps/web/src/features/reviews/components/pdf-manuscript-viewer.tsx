import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  Search,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useI18n } from "@/i18n";

GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfFitMode = "width" | "page" | "custom";

export interface PdfViewState {
  page: number;
  fitMode: PdfFitMode;
  customZoom: number;
}

export interface PdfManuscriptViewerProps {
  blob: Blob;
  onDownload?: () => void;
  onError?: () => void;
  initialPage?: number;
  initialFitMode?: PdfFitMode;
  initialZoom?: number;
  jumpToPageRequest?: { page: number; nonce: number } | null;
  syncedZoom?: { fitMode: PdfFitMode; customZoom: number } | null;
  onViewStateChange?: (state: PdfViewState) => void;
  ariaLabel?: string;
}

export default function PdfManuscriptViewer({
  blob,
  onDownload,
  onError,
  initialPage = 1,
  initialFitMode = "width",
  initialZoom = 1,
  jumpToPageRequest,
  syncedZoom,
  onViewStateChange,
  ariaLabel,
}: PdfManuscriptViewerProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onViewStateChangeRef = useRef(onViewStateChange);
  onViewStateChangeRef.current = onViewStateChange;
  const restoredInitialPageRef = useRef(false);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(Math.max(1, initialPage));
  const [pageInput, setPageInput] = useState(String(Math.max(1, initialPage)));
  const [fitMode, setFitMode] = useState<PdfFitMode>(initialFitMode);
  const [customZoom, setCustomZoom] = useState(initialZoom);
  const [activeScale, setActiveScale] = useState(initialZoom);
  const [viewportSize, setViewportSize] = useState({ width: 680, height: 760 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ page: number; count: number }>>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const textCacheRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof getDocument> | undefined;
    restoredInitialPageRef.current = false;
    setPdfDoc(null);
    setLoadError(false);
    const startPage = Math.max(1, initialPage);
    setPage(startPage);
    setPageInput(String(startPage));
    setSearchMatches([]);
    setMatchIndex(0);
    textCacheRef.current.clear();

    void (async () => {
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        task = getDocument({
          data: bytes,
          useWorkerFetch: false,
          useWasm: false,
          enableXfa: false,
          stopAtErrors: true,
          disableAutoFetch: true,
          disableRange: true,
          disableStream: true,
          maxImageSize: 20_000_000,
          canvasMaxAreaInBytes: 80_000_000,
        });
        const doc = await task.promise;
        if (cancelled) return;
        if (doc.numPages <= 0 || doc.numPages > 1000) {
          setLoadError(true);
          onErrorRef.current?.();
          return;
        }
        setPdfDoc(doc);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          onErrorRef.current?.();
        }
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy().catch(() => undefined);
    };
  }, [blob]);

  // Measure scroll viewport so Fit Width and Fit Page never trigger horizontal scrollbar
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(240, el.clientWidth - 28);
      const h = Math.max(280, el.clientHeight - 28);
      setViewportSize(prev => (Math.abs(prev.width - w) < 2 && Math.abs(prev.height - h) < 2 ? prev : { width: w, height: h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pdfDoc]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    setPageInput(String(page));
    onViewStateChangeRef.current?.({ page, fitMode, customZoom });
  }, [page, fitMode, customZoom]);

  // Opt-in zoom sync from Compare Mode (never forces page alignment)
  useEffect(() => {
    if (!syncedZoom) return;
    setFitMode(syncedZoom.fitMode);
    setCustomZoom(syncedZoom.customZoom);
  }, [syncedZoom?.fitMode, syncedZoom?.customZoom]);

  const jumpToPage = useCallback((targetPage: number, behavior: ScrollBehavior = "smooth") => {
    if (!pdfDoc) return;
    const clamped = Math.max(1, Math.min(pdfDoc.numPages, targetPage));
    setPage(clamped);
    setPageInput(String(clamped));
    const root = scrollRef.current;
    const slot = root?.querySelector<HTMLElement>(`[data-pdf-page="${clamped}"]`);
    if (root && slot) {
      const top = slot.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 12;
      root.scrollTo({ top: Math.max(0, top), behavior });
    }
  }, [pdfDoc]);

  // Restore initialPage when returning from Compare Mode to Review Mode
  useEffect(() => {
    if (!pdfDoc || restoredInitialPageRef.current) return;
    restoredInitialPageRef.current = true;
    if (initialPage > 1) {
      const target = Math.min(pdfDoc.numPages, initialPage);
      window.requestAnimationFrame(() => jumpToPage(target, "auto"));
    }
  }, [pdfDoc, initialPage, jumpToPage]);

  // External locator jump (e.g., "[Xem vị trí liên quan]" in Previous Revision Verification)
  useEffect(() => {
    if (!pdfDoc || !jumpToPageRequest) return;
    jumpToPage(jumpToPageRequest.page, "smooth");
  }, [pdfDoc, jumpToPageRequest?.page, jumpToPageRequest?.nonce, jumpToPage]);

  const handleStepZoom = (delta: number) => {
    const base = fitMode === "custom" ? customZoom : activeScale;
    const next = Math.max(0.5, Math.min(2.5, Math.round((base + delta) * 20) / 20));
    setCustomZoom(next);
    setFitMode("custom");
  };

  const toggleFullscreen = async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen denial in restricted iframes
    }
  };

  const runSearch = useCallback(async (query: string) => {
    const term = query.trim().toLowerCase();
    if (!pdfDoc || !term) {
      setSearchMatches([]);
      setMatchIndex(0);
      return;
    }
    setSearching(true);
    try {
      const hits: Array<{ page: number; count: number }> = [];
      for (let p = 1; p <= pdfDoc.numPages; p += 1) {
        let text = textCacheRef.current.get(p);
        if (text === undefined) {
          const pdfPage = await pdfDoc.getPage(p);
          const content = await pdfPage.getTextContent();
          text = content.items
            .map(item => ("str" in item ? item.str : ""))
            .join(" ")
            .toLowerCase();
          textCacheRef.current.set(p, text);
        }
        let idx = 0;
        let count = 0;
        while ((idx = text.indexOf(term, idx)) !== -1) {
          count += 1;
          idx += term.length;
        }
        if (count > 0) hits.push({ page: p, count });
      }
      setSearchMatches(hits);
      setMatchIndex(0);
      if (hits.length > 0) {
        jumpToPage(hits[0]!.page);
      }
    } finally {
      setSearching(false);
    }
  }, [pdfDoc, jumpToPage]);

  const stepMatch = (direction: 1 | -1) => {
    if (!searchMatches.length) return;
    const next = (matchIndex + direction + searchMatches.length) % searchMatches.length;
    setMatchIndex(next);
    jumpToPage(searchMatches[next]!.page);
  };

  const displayedPct = Math.round((fitMode === "custom" ? customZoom : activeScale) * 100);

  if (loadError) {
    return (
      <div className="rw-pdf-state" role="alert">
        <p className="text-sm text-destructive">{t("Could not load the assigned PDF.")}</p>
        {onDownload ? (
          <button type="button" className="rw-pdf-fallback-btn" onClick={onDownload}>
            <Download size={14} aria-hidden="true" />
            <span>{t("reviewWorkspace.downloadPdf")}</span>
          </button>
        ) : null}
      </div>
    );
  }

  if (!pdfDoc) {
    return (
      <div className="rw-pdf-state" role="status" aria-live="polite">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm text-muted-foreground">{t("Loading assigned PDF…")}</p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="rw-pdf-viewer" data-fullscreen={isFullscreen ? "true" : undefined}>
      <div className="rw-pdf-toolbar" role="toolbar" aria-label={t("reviewWorkspace.pdf.toolbarLabel")}>
        {/* Page navigation */}
        <div className="rw-pdf-group">
          <button
            type="button"
            className="rw-pdf-btn"
            aria-label={t("reviewWorkspace.pdf.prevPage")}
            title={t("reviewWorkspace.pdf.prevPage")}
            disabled={page <= 1}
            onClick={() => jumpToPage(page - 1)}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <form
            className="rw-pdf-page-form"
            onSubmit={e => {
              e.preventDefault();
              const parsed = Number.parseInt(pageInput, 10);
              if (Number.isFinite(parsed)) jumpToPage(parsed);
              else setPageInput(String(page));
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              aria-label={t("reviewWorkspace.pdf.pageNumber")}
              className="rw-pdf-page-input"
              value={pageInput}
              onChange={e => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={() => {
                const parsed = Number.parseInt(pageInput, 10);
                if (Number.isFinite(parsed) && parsed !== page) jumpToPage(parsed);
                else setPageInput(String(page));
              }}
            />
            <span className="rw-pdf-page-total">/ {pdfDoc.numPages}</span>
          </form>
          <button
            type="button"
            className="rw-pdf-btn"
            aria-label={t("reviewWorkspace.pdf.nextPage")}
            title={t("reviewWorkspace.pdf.nextPage")}
            disabled={page >= pdfDoc.numPages}
            onClick={() => jumpToPage(page + 1)}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>

        <span className="rw-pdf-divider" aria-hidden="true" />

        {/* Zoom & Fit presets */}
        <div className="rw-pdf-group">
          <button
            type="button"
            className="rw-pdf-btn"
            aria-label={t("reviewWorkspace.pdf.zoomOut")}
            title={t("reviewWorkspace.pdf.zoomOut")}
            disabled={displayedPct <= 50}
            onClick={() => handleStepZoom(-0.15)}
          >
            <ZoomOut size={14} aria-hidden="true" />
          </button>
          <span className="rw-pdf-zoom-readout" aria-live="polite">
            {displayedPct}%
          </span>
          <button
            type="button"
            className="rw-pdf-btn"
            aria-label={t("reviewWorkspace.pdf.zoomIn")}
            title={t("reviewWorkspace.pdf.zoomIn")}
            disabled={displayedPct >= 250}
            onClick={() => handleStepZoom(0.15)}
          >
            <ZoomIn size={14} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="rw-pdf-pill-btn"
            data-active={fitMode === "width" ? "true" : undefined}
            aria-pressed={fitMode === "width"}
            title={t("reviewWorkspace.pdf.fitWidth")}
            onClick={() => setFitMode("width")}
          >
            <MoveHorizontal size={13} aria-hidden="true" />
            <span>{t("reviewWorkspace.pdf.fitWidthShort")}</span>
          </button>
          <button
            type="button"
            className="rw-pdf-pill-btn"
            data-active={fitMode === "page" ? "true" : undefined}
            aria-pressed={fitMode === "page"}
            title={t("reviewWorkspace.pdf.fitPage")}
            onClick={() => setFitMode("page")}
          >
            <Square size={12} aria-hidden="true" />
            <span>{t("reviewWorkspace.pdf.fitPageShort")}</span>
          </button>
        </div>

        <div className="rw-pdf-group rw-pdf-group-end">
          <button
            type="button"
            className="rw-pdf-btn"
            data-active={searchOpen ? "true" : undefined}
            aria-label={t("reviewWorkspace.pdf.search")}
            title={t("reviewWorkspace.pdf.search")}
            onClick={() => {
              setSearchOpen(prev => {
                const next = !prev;
                if (next) window.requestAnimationFrame(() => searchInputRef.current?.focus());
                return next;
              });
            }}
          >
            <Search size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="rw-pdf-btn"
            aria-label={isFullscreen ? t("reviewWorkspace.pdf.exitFullscreen") : t("reviewWorkspace.pdf.fullscreen")}
            title={isFullscreen ? t("reviewWorkspace.pdf.exitFullscreen") : t("reviewWorkspace.pdf.fullscreen")}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
          </button>
          {onDownload ? (
            <button
              type="button"
              className="rw-pdf-btn"
              aria-label={t("reviewWorkspace.downloadPdf")}
              title={t("reviewWorkspace.downloadPdf")}
              onClick={onDownload}
            >
              <Download size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {searchOpen ? (
        <div className="rw-pdf-search-bar">
          <Search size={13} className="text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            className="rw-pdf-search-input"
            value={searchQuery}
            placeholder={t("reviewWorkspace.pdf.searchPlaceholder")}
            aria-label={t("reviewWorkspace.pdf.search")}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (searchMatches.length && searchQuery.trim()) {
                  void runSearch(searchQuery);
                } else {
                  void runSearch(searchQuery);
                }
              } else if (e.key === "Escape") {
                setSearchOpen(false);
              }
            }}
          />
          <button
            type="button"
            className="rw-pdf-pill-btn"
            disabled={searching || !searchQuery.trim()}
            onClick={() => void runSearch(searchQuery)}
          >
            {searching ? "…" : t("reviewWorkspace.pdf.find")}
          </button>
          {searchMatches.length > 0 ? (
            <div className="rw-pdf-search-nav">
              <span className="text-xs tabular-nums text-muted-foreground">
                {matchIndex + 1}/{searchMatches.length} (p.{searchMatches[matchIndex]?.page})
              </span>
              <button type="button" className="rw-pdf-btn" aria-label={t("Previous")} onClick={() => stepMatch(-1)}>
                <ChevronUp size={14} aria-hidden="true" />
              </button>
              <button type="button" className="rw-pdf-btn" aria-label={t("Next")} onClick={() => stepMatch(1)}>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          ) : searchQuery.trim() && !searching ? (
            <span className="text-xs text-muted-foreground">{t("reviewWorkspace.pdf.noMatches")}</span>
          ) : null}
          <button
            type="button"
            className="rw-pdf-btn"
            aria-label={t("Close")}
            onClick={() => {
              setSearchOpen(false);
              setSearchMatches([]);
            }}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel ?? t("Assigned manuscript PDF")}
        className="rw-pdf-scroll"
        data-fit={fitMode}
        onScroll={() => {
          const root = scrollRef.current;
          if (!root) return;
          const anchorY = root.getBoundingClientRect().top + Math.min(140, root.clientHeight / 3);
          const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-page]"));
          const current = pages.find(node => node.getBoundingClientRect().bottom > anchorY);
          if (current) {
            const nextPage = Number(current.dataset.pdfPage);
            if (Number.isFinite(nextPage) && nextPage !== page) setPage(nextPage);
          }
        }}
      >
        <div className="rw-pdf-pages">
          {Array.from({ length: pdfDoc.numPages }, (_, index) => {
            const pageNum = index + 1;
            const hasSearchMatch = searchMatches.some(m => m.page === pageNum);
            return (
              <PdfCanvasPage
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                fitMode={fitMode}
                customZoom={customZoom}
                viewportSize={viewportSize}
                scrollRoot={scrollRef}
                highlighted={hasSearchMatch}
                onComputedScale={pageNum === page ? setActiveScale : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PdfCanvasPage({
  pdfDoc,
  pageNum,
  fitMode,
  customZoom,
  viewportSize,
  scrollRoot,
  highlighted,
  onComputedScale,
}: {
  pdfDoc: PDFDocumentProxy;
  pageNum: number;
  fitMode: PdfFitMode;
  customZoom: number;
  viewportSize: { width: number; height: number };
  scrollRoot: RefObject<HTMLDivElement>;
  highlighted: boolean;
  onComputedScale?: (scale: number) => void;
}) {
  const { t } = useI18n();
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNum <= 2);
  const [naturalSize, setNaturalSize] = useState({ width: 816, height: 1056 });
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    if (!slotRef.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => setVisible(entries.some(entry => entry.isIntersecting)),
      { root: scrollRoot.current, rootMargin: "700px 0px" },
    );
    observer.observe(slotRef.current);
    return () => observer.disconnect();
  }, [scrollRoot]);

  const computeScale = useCallback(
    (baseWidth: number, baseHeight: number) => {
      if (fitMode === "width") {
        return Math.max(0.3, Math.min(3, viewportSize.width / baseWidth));
      }
      if (fitMode === "page") {
        return Math.max(0.3, Math.min(3, viewportSize.width / baseWidth, viewportSize.height / baseHeight));
      }
      return customZoom;
    },
    [fitMode, customZoom, viewportSize.width, viewportSize.height],
  );

  const displayScale = computeScale(naturalSize.width, naturalSize.height);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    if (!visible) return;
    setRenderError(false);

    void (async () => {
      try {
        const pdfPage = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;

        const cssUnits = 96 / 72;
        const base = pdfPage.getViewport({ scale: cssUnits });
        if (!(base.width > 0 && base.height > 0)) throw new Error("Invalid PDF page size");

        setNaturalSize(prev =>
          Math.abs(prev.width - base.width) < 1 && Math.abs(prev.height - base.height) < 1
            ? prev
            : { width: base.width, height: base.height },
        );

        const scale = computeScale(base.width, base.height);
        onComputedScale?.(scale);

        const viewport = pdfPage.getViewport({ scale: cssUnits * scale });
        const dpr = Math.max(1.5, Math.min(window.devicePixelRatio || 1, 2.5));
        const density = Math.min(dpr, Math.sqrt(14_000_000 / Math.max(1, viewport.width * viewport.height)));

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");

        canvas.width = Math.ceil(viewport.width * density);
        canvas.height = Math.ceil(viewport.height * density);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTask = pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
          annotationMode: 0,
        });
        await renderTask.promise;
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== "RenderingCancelledException") {
          setRenderError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNum, visible, computeScale, onComputedScale]);

  return (
    <div
      ref={slotRef}
      data-pdf-page={pageNum}
      data-highlighted={highlighted ? "true" : undefined}
      className="rw-pdf-page-slot"
      style={{
        width: Math.floor(naturalSize.width * displayScale),
        minHeight: Math.floor(naturalSize.height * displayScale),
      }}
    >
      {renderError ? (
        <p className="p-4 text-xs text-destructive" role="alert">
          {t("Could not load the assigned PDF.")}
        </p>
      ) : visible ? (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${t("Assigned manuscript PDF")} — ${pageNum}`}
          className="rw-pdf-canvas"
        />
      ) : null}
    </div>
  );
}
