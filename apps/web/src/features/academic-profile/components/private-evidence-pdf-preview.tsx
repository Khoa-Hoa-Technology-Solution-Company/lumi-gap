import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Render pixels only: no scripting, annotation links, forms, attachments or iframe document. */
export default function PrivateEvidencePdfPreview({ blob, zoomable = false, compact = false, continuous = false, target, onPoint }: { blob: Blob; zoomable?: boolean; compact?: boolean; continuous?: boolean; target?: { page: number; x: number; y: number; key: number }; onPoint?: (page: number, x: number, y: number) => void }) {
  const { t } = useI18n();
  const [document, setDocument] = useState<PDFDocumentProxy>(), [page, setPage] = useState(1), [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1), [fitWidth, setFitWidth] = useState(true), [fitScale, setFitScale] = useState(1);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const readingAnchor = useRef<{ page: number; fraction: number }>();
  const rememberPosition = () => {
    const root = scrollRoot.current;
    if (!continuous || !root) return;
    const line = root.getBoundingClientRect().top + Math.min(120, root.clientHeight / 3);
    const element = Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-page]")).find(node => node.getBoundingClientRect().bottom > line);
    if (element) { const rect = element.getBoundingClientRect(); readingAnchor.current = { page: Number(element.dataset.pdfPage), fraction: rect.height > 0 ? (line - rect.top) / rect.height : 0 }; }
  };
  useLayoutEffect(() => {
    const root = scrollRoot.current, anchor = readingAnchor.current;
    readingAnchor.current = undefined;
    if (!root || !anchor) return;
    const element = root.querySelector<HTMLElement>(`[data-pdf-page="${anchor.page}"]`);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    root.scrollTop += rect.top - root.getBoundingClientRect().top + rect.height * anchor.fraction - Math.min(120, root.clientHeight / 3);
    setPage(anchor.page);
  }, [zoom, fitWidth]);
  useEffect(() => { if (scrollRoot.current) scrollRoot.current.scrollTop = 0; }, [document]);
  useEffect(() => {
    if (!target || !document || !continuous) return;
    const root = scrollRoot.current, element = root?.querySelector<HTMLElement>(`[data-pdf-page="${target.page}"]`);
    if (!root || !element) return;
    let cancelled = false;
    void document.getPage(target.page).then(pdfPage => {
      if (cancelled) return;
      const height = pdfPage.getViewport({ scale: 1 }).height;
      const rect = element.getBoundingClientRect();
      root.scrollTop += rect.top - root.getBoundingClientRect().top + rect.height * Math.min(1, target.y / height) - root.clientHeight / 3;
      setPage(target.page);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [target, document, continuous]);
  const currentScale = fitWidth ? fitScale : zoom;
  const changeZoom = (step: number) => { rememberPosition(); setZoom(Math.max(0.25, Math.min(3, Math.round((currentScale + step) * 4) / 4))); setFitWidth(false); };
  const fitToWidth = () => { rememberPosition(); setFitWidth(true); };
  useEffect(() => {
    let cancelled = false, task: ReturnType<typeof getDocument> | undefined;
    setDocument(undefined); setPage(1); setError(false);
    void (async () => {
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        task = getDocument({ data: bytes, useWorkerFetch: false, useWasm: false, enableXfa: false, stopAtErrors: true, disableAutoFetch: true, disableRange: true, disableStream: true, maxImageSize: 20_000_000, canvasMaxAreaInBytes: 80_000_000 });
        const pdf = await task.promise;
        if (!cancelled) setDocument(pdf);
      } catch { if (!cancelled) setError(true); }
    })();
    return () => { cancelled = true; void task?.destroy().catch(() => undefined); };
  }, [blob]);
  if (error) return <p role="alert" className="text-sm text-destructive">{t("Could not preview this PDF. Download the private document to inspect it.")}</p>;
  if (!document) return <p role="status" className="text-sm text-muted-foreground">{t("Loading private PDF…")}</p>;
  return <div className={compact ? "writing-pdf-viewer" : "space-y-3"}>
    {compact ? <div className="writing-pdf-controls" role="group" aria-label={t("PDF navigation")}>
      {continuous ? <span className="tabular-nums">{page} / {document.numPages}</span> : <><Button size="sm" variant="ghost" aria-label={t("Previous page")} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>‹</Button><span className="tabular-nums">{page} / {document.numPages}</span><Button size="sm" variant="ghost" aria-label={t("Next page")} disabled={page >= document.numPages} onClick={() => setPage(value => value + 1)}>›</Button></>}
      {zoomable ? <><span className="writing-pdf-control-space" /><Button size="sm" variant="ghost" aria-label={t("Zoom out")} disabled={currentScale <= 0.25} onClick={() => changeZoom(-0.25)}>−</Button><span>{Math.round(currentScale * 100)}%</span><Button size="sm" variant="ghost" aria-label={t("Zoom in")} disabled={currentScale >= 3} onClick={() => changeZoom(0.25)}>+</Button><Button size="sm" variant="ghost" aria-pressed={fitWidth} onClick={fitToWidth}>{t("Fit width")}</Button></> : null}
    </div> : <>
    <div className="flex items-center justify-between gap-2 text-sm">{continuous ? <span className="tabular-nums">{page} / {document.numPages}</span> : <><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{t("Previous page")}</Button><span className="tabular-nums">{page} / {document.numPages}</span><Button size="sm" variant="outline" disabled={page >= document.numPages} onClick={() => setPage(value => value + 1)}>{t("Next page")}</Button></>}</div>
    {zoomable ? <div className="flex items-center justify-center gap-2 text-sm"><Button size="sm" variant="ghost" aria-label={t("Zoom out")} disabled={currentScale <= 0.25} onClick={() => changeZoom(-0.25)}>−</Button><span>{Math.round(currentScale * 100)}%</span><Button size="sm" variant="ghost" aria-label={t("Zoom in")} disabled={currentScale >= 3} onClick={() => changeZoom(0.25)}>+</Button><Button size="sm" variant="ghost" aria-pressed={fitWidth} onClick={fitToWidth}>{t("Fit width")}</Button></div> : null}
    </>}
    <div ref={scrollRoot} tabIndex={continuous ? 0 : undefined} role={continuous ? "region" : undefined} aria-label={continuous ? t("PDF pages") : undefined} className={compact ? "writing-pdf-canvas" : "max-h-[65dvh] overflow-auto rounded-md bg-muted p-2"} onScroll={continuous ? () => {
      const root = scrollRoot.current;
      if (!root) return;
      const readingLine = root.getBoundingClientRect().top + Math.min(120, root.clientHeight / 3);
      const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-page]"));
      const current = pages.find(element => element.getBoundingClientRect().bottom > readingLine);
      if (current) setPage(Number(current.dataset.pdfPage));
    } : undefined}>
      {continuous ? <div className="writing-pdf-pages">{Array.from({ length: document.numPages }, (_, index) => <PdfPage key={index + 1} document={document} page={index + 1} zoom={zoomable ? zoom : undefined} fitWidth={fitWidth} onFitScale={index + 1 === page ? setFitScale : undefined} scrollRoot={scrollRoot} onPoint={onPoint} />)}</div> : <PdfPage key={page} document={document} page={page} zoom={zoomable ? zoom : undefined} fitWidth={fitWidth} onFitScale={setFitScale} onPoint={onPoint} />}
    </div>
  </div>;
}

function PdfPage({ document, page, zoom, fitWidth, onFitScale, scrollRoot, onPoint }: { document: PDFDocumentProxy; page: number; zoom?: number; fitWidth: boolean; onFitScale?: (scale: number) => void; scrollRoot?: RefObject<HTMLDivElement>; onPoint?: (page: number, x: number, y: number) => void }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null), [error, setError] = useState(false);
  const [width, setWidth] = useState(680);
  const slot = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(page === 1);
  const [naturalSize, setNaturalSize] = useState({ width: 816, height: 1056 });
  useEffect(() => {
    if (!scrollRoot || !slot.current) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { root: scrollRoot.current, rootMargin: "600px 0px" });
    observer.observe(slot.current); return () => observer.disconnect();
  }, [scrollRoot]);
  useEffect(() => { const parent = scrollRoot?.current ?? canvas.current?.parentElement; if (!parent || zoom === undefined) return; const measure = () => { if (parent.clientWidth > 0) setWidth(Math.max(100, parent.clientWidth - 16)); }; measure(); const observer = new ResizeObserver(measure); observer.observe(parent); return () => observer.disconnect(); }, [zoom !== undefined, scrollRoot]);
  const displayScale = zoom === undefined ? Math.min(1.5, 680 / naturalSize.width, 1500 / naturalSize.height) : Math.min(fitWidth ? width / naturalSize.width : zoom, 5000 / naturalSize.width, 8000 / naturalSize.height);
  useEffect(() => {
    let cancelled = false, render: RenderTask | undefined;
    if (scrollRoot && !visible) return;
    setError(false);
    void (async () => {
      try {
        const pdfPage = await document.getPage(page), element = canvas.current;
        if (cancelled || !element) return;
        const cssUnits = 96 / 72;
        const base = pdfPage.getViewport({ scale: cssUnits });
        if (!(base.width > 0 && base.height > 0)) throw new Error("Invalid PDF viewport");
        if (scrollRoot) setNaturalSize(prior => prior.width === base.width && prior.height === base.height ? prior : { width: base.width, height: base.height });
        const scale = zoom === undefined ? Math.min(1.5, 680 / base.width, 1500 / base.height) : Math.min(fitWidth ? width / base.width : zoom, 5000 / base.width, 8000 / base.height);
        const viewport = pdfPage.getViewport({ scale: cssUnits * scale });
        if (zoom !== undefined && fitWidth) onFitScale?.(scale);
        // Supersample even on standard-density displays, with a bounded bitmap budget.
        const density = Math.min(Math.max(2, Math.min(window.devicePixelRatio || 1, 3)), Math.sqrt(16_000_000 / (viewport.width * viewport.height))), context = element.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        element.width = Math.ceil(viewport.width * density); element.height = Math.ceil(viewport.height * density);
        element.style.width = `${viewport.width}px`;
        element.style.height = zoom === undefined ? "auto" : `${viewport.height}px`;
        render = pdfPage.render({ canvas: element, canvasContext: context, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0], annotationMode: 0 });
        await render.promise;
      } catch { if (!cancelled) setError(true); }
    })();
    return () => { cancelled = true; render?.cancel(); };
  }, [document, page, width, zoom, fitWidth, onFitScale, scrollRoot, visible]);
  const locate = (element: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    if (!onPoint || rect.width <= 0 || rect.height <= 0) return;
    void document.getPage(page).then(pdfPage => { const size = pdfPage.getViewport({ scale: 1 }); onPoint(page, Math.max(0, (clientX - rect.left) / rect.width * size.width), Math.max(0, (clientY - rect.top) / rect.height * size.height)); }).catch(() => {});
  };
  const content = error ? <p role="alert" className="text-sm text-destructive">{t("Could not render this page. Download the private document to inspect it.")}</p> : !scrollRoot || visible ? <canvas ref={canvas} role="img" aria-label={t("Private PDF page {{page}}", { page })} tabIndex={onPoint ? 0 : undefined} title={onPoint ? t("Double-click to find source; press Enter for page center.") : undefined} onDoubleClick={event => locate(event.currentTarget, event.clientX, event.clientY)} onKeyDown={event => { if (event.key === "Enter" && onPoint) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); locate(event.currentTarget, rect.left + rect.width / 2, rect.top + rect.height / 2); } }} className={`mx-auto h-auto ${zoom === undefined ? "max-w-full" : "max-w-none"} bg-white`} /> : null;
  return scrollRoot ? <div ref={slot} className="writing-pdf-page" data-pdf-page={page} style={{ width: naturalSize.width * displayScale, minHeight: naturalSize.height * displayScale }}>{content}</div> : content;
}
