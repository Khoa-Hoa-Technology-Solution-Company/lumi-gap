import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Render pixels only: no scripting, annotation links, forms, attachments or iframe document. */
export default function PrivateEvidencePdfPreview({ blob }: { blob: Blob }) {
  const { t } = useI18n();
  const [document, setDocument] = useState<PDFDocumentProxy>(), [page, setPage] = useState(1), [error, setError] = useState(false);
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
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{t("Previous page")}</Button><span className="tabular-nums">{page} / {document.numPages}</span><Button size="sm" variant="outline" disabled={page >= document.numPages} onClick={() => setPage(value => value + 1)}>{t("Next page")}</Button></div>
    <div className="max-h-[60dvh] overflow-auto rounded-md bg-muted p-2"><PdfPage key={page} document={document} page={page} /></div>
  </div>;
}

function PdfPage({ document, page }: { document: PDFDocumentProxy; page: number }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null), [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false, render: RenderTask | undefined;
    void (async () => {
      try {
        const pdfPage = await document.getPage(page), element = canvas.current;
        if (cancelled || !element) return;
        const base = pdfPage.getViewport({ scale: 1 });
        if (!(base.width > 0 && base.height > 0)) throw new Error("Invalid PDF viewport");
        const viewport = pdfPage.getViewport({ scale: Math.min(1.5, 680 / base.width, 1500 / base.height) });
        const density = Math.min(window.devicePixelRatio || 1, 2), context = element.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        element.width = Math.ceil(viewport.width * density); element.height = Math.ceil(viewport.height * density);
        render = pdfPage.render({ canvas: element, canvasContext: context, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0], annotationMode: 0 });
        await render.promise;
      } catch { if (!cancelled) setError(true); }
    })();
    return () => { cancelled = true; render?.cancel(); };
  }, [document, page]);
  return error ? <p role="alert" className="text-sm text-destructive">{t("Could not render this page. Download the private document to inspect it.")}</p> : <canvas ref={canvas} role="img" aria-label={t("Private PDF page {{page}}", { page })} className="mx-auto h-auto max-w-full bg-white" />;
}
