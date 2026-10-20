import { lazy, Suspense, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileInput, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";
import { PdfConversionQuality } from "./pdf-conversion-quality";
const PdfPreview = lazy(() => import("@/features/academic-profile/components/private-evidence-pdf-preview"));
const errorMessage = (failure: unknown, fallback: string) => (failure as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
const isMissingConversion = (failure: unknown) => (failure as { response?: { status?: number } })?.response?.status === 404;

export function ImportManuscriptPdf({ project, onImported }: { project: string; onImported: (id: string) => void }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id);
  const [open, setOpen] = useState(false), [title, setTitle] = useState(""), [file, setFile] = useState<File>();
  const [run, setRun] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [mode, setMode] = useState<"layout" | "structured">("layout"), [ai, setAi] = useState(false);
  const submitting = useRef(false), clientKey = useRef(crypto.randomUUID());
  const query = useQuery({ queryKey: ["manuscript-pdf-import", userId, project, run], queryFn: () => manuscriptsApi.pdfImport(project, run!), enabled: open && Boolean(run), refetchInterval: query => query.state.error || ["ready", "failed"].includes(query.state.data?.status ?? "") ? false : 1500, retry: 1 });
  const result = query.data;
  const pdf = useQuery({ queryKey: ["manuscript-pdf-import-preview", userId, project, run], queryFn: () => manuscriptsApi.pdfImportPreview(project, run!), enabled: open && Boolean(run) && result?.status === "ready" && result.compilation?.status === "success", retry: false, gcTime: 0 });
  const converting = Boolean(run && !query.error && !["ready", "failed"].includes(result?.status ?? ""));
  const reset = () => { setRun(undefined); setError(""); clientKey.current = crypto.randomUUID(); };
  return <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
    <DialogTrigger asChild><Button variant="outline"><FileInput size={16} />{t("PDF to LaTeX")}</Button></DialogTrigger>
    <DialogContent className="writing-pdf-import-dialog" data-no-i18n closeLabel={t("Close")} showClose={!busy} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{t("PDF to LaTeX")}</DialogTitle><DialogDescription>{t("Preserve page layout, then review before creating a new manuscript.")}</DialogDescription></DialogHeader>
      {result?.status !== "ready" ? <form className="writing-create-form" onSubmit={async event => {
        event.preventDefault(); if (!file || submitting.current) return;
        if (file.size > 5_000_000 || !file.name.toLowerCase().endsWith(".pdf")) { setError(t("Choose a PDF no larger than 5 MB")); return; }
        submitting.current = true; setBusy(true); setError("");
        try { const next = await manuscriptsApi.convertPdf(project, file, title.trim(), clientKey.current, { mode, ai: mode === "structured" && ai }); setRun(next.id); }
        catch (failure) { setError(errorMessage(failure, t("Could not convert this PDF. Please try again."))); }
        finally { submitting.current = false; setBusy(false); }
      }}>
        <fieldset disabled={busy || converting}>
          <label>{t("Manuscript title")}<Input required minLength={2} maxLength={160} value={title} onChange={event => { setTitle(event.target.value); reset(); }} /></label>
          <label>{t("PDF to convert")}<input required type="file" accept=".pdf,application/pdf" onChange={event => { const next = event.target.files?.[0]; setFile(next); if (!title && next) setTitle(next.name.replace(/\.pdf$/i, "").slice(0, 160)); reset(); }} /></label>
          <p className="writing-small">{t("Up to 5 MB and 100 pages. Long PDFs may take several minutes. Compare the compiled PDF before creating a manuscript.")}</p>
          <div className="writing-pdf-import-modes" role="group" aria-label={t("Conversion mode")}>
            <label><input type="radio" name="pdf-mode" checked={mode === "layout"} onChange={() => { setMode("layout"); reset(); }} /><span><strong>{t("Preserve PDF layout")}</strong><small>{t("Keep positions and graphics. Words stay editable without reflow.")}</small></span></label>
          </div>
          <details className="writing-pdf-import-advanced"><summary>{t("Advanced: extract text for rewriting or scanned PDFs")}</summary>
            <p className="writing-small">{t("Rebuild editable paragraphs and tables, using source page size, spacing and alignment. Complex layouts may still change.")}</p>
            <div className="writing-pdf-import-modes"><label><input type="radio" name="pdf-mode" checked={mode === "structured"} onChange={() => { setMode("structured"); reset(); }} /><span><strong>{t("Extract editable content · Docling")}</strong><small>{t("Text reflows when edited. Tables keep separate cells; Vietnamese/English scans use local OCR.")}</small></span></label></div>
          </details>
          {mode === "structured" ? <label className="writing-pdf-import-ai"><input type="checkbox" checked={ai} onChange={event => { setAi(event.target.checked); reset(); }} /><span>{t("Use AI to identify document structure")}<small>{t("Sends text snippets to your configured AI provider. AI can label headings, information groups, totals and notes; it cannot change content or numbers.")}</small></span></label> : null}
        </fieldset>
        {!run ? <Button disabled={busy || !file || title.trim().length < 2} type="submit">{busy ? <Loader2 size={16} className="animate-spin" /> : null}{t(busy ? "Uploading…" : "Convert and preview")}</Button> : null}
      </form> : null}
      {converting ? <p role="status" className="writing-pdf-import-status"><Loader2 size={18} className="animate-spin" />{t(result?.phase === "comparing" ? "Comparing the original and compiled PDF…" : result?.phase === "compiling" ? "Compiling the converted LaTeX for preview…" : result?.status === "processing" ? mode === "structured" ? "Extracting editable content…" : "Reconstructing page layout…" : "Waiting for conversion…")}</p> : null}
      {error || query.error || result?.status === "failed" ? <div role="alert" className="writing-error"><p>{error || (query.error ? errorMessage(query.error, t("Could not load the conversion. Please try again.")) : result?.error)}</p>{run && result?.status !== "ready" ? <Button variant="outline" onClick={() => { if (query.error && !isMissingConversion(query.error)) { void query.refetch(); } else reset(); }}>{t("Try again")}</Button> : null}</div> : null}
      {result?.status === "ready" ? <>
        <div role="status"><strong>{title} · {result.pageCount} {t("pages")} · {result.wordCount} {t("editable words")}</strong><p className="writing-small">{t("Preview expires after one hour. Accept to save the manuscript for your team.")}</p></div>
        <div className="writing-pdf-import-preview">
          <section aria-label={t("Original PDF")}><h3>{t("Original PDF")}</h3>{file ? <Suspense fallback={<p>{t("Loading PDF…")}</p>}><PdfPreview blob={file} compact continuous zoomable /></Suspense> : null}</section>
          <section aria-label={t("PDF compiled from converted LaTeX")}><h3>{t("PDF compiled from converted LaTeX")}</h3>{result.compilation?.status === "success" ? pdf.data ? <Suspense fallback={<p>{t("Loading PDF…")}</p>}><PdfPreview blob={pdf.data} compact continuous zoomable /></Suspense> : pdf.error ? <div role="alert" className="writing-pdf-import-placeholder"><p>{t("Could not load the compiled preview. Please try again.")}</p><Button variant="outline" onClick={() => void pdf.refetch()}>{t("Try again")}</Button></div> : <p role="status" className="writing-pdf-import-placeholder">{t("Loading PDF…")}</p> : <div role="status" className="writing-pdf-import-placeholder"><strong>{t(result.compilation?.status === "failed" ? "The converted source could not compile" : "Compiled preview is unavailable")}</strong><p>{t("No preview PDF was generated. You can still create the manuscript and fix its source in the editor.")}</p>{result.compilation?.diagnostics ? <details><summary>{t("Compilation log")}</summary><pre>{result.compilation.diagnostics}</pre></details> : null}</div>}</section>
        </div>
        <p className="writing-small">{t("The right preview is compiled from the converted main.tex, not a copy of the original PDF.")}</p>
        {(result.mode ?? mode) === "structured" ? <p className="writing-notice">{t("This mode prioritizes editable text. For a result closer to the original, choose Preserve PDF layout.")}</p> : null}
        {(result.mode ?? mode) === "structured" ? <PdfConversionQuality result={result} /> : null}
        <details className="writing-pdf-import-advanced"><summary>{t("Conversion notes and limitations")}</summary><ul className="writing-pdf-import-limits">
          {(result.mode ?? mode) === "structured" ? <li>{t("Paragraphs and detected tables are editable. Check reading order, merged cells and OCR against the original PDF.")}</li> : <li>{t("Layout is reconstructed with positioned words. Edited text does not reflow automatically.")}</li>}
          <li>{t("Original fonts are substituted. Check formulas, special characters and spacing after compiling.")}</li>
          <li>{t("References stay as printed text; BibTeX entries are not reconstructed.")}</li>
          {result.warnings?.some(warning => warning.startsWith("IMAGE_ONLY_PAGE:")) ? <li>{t("Some pages contain only images and are preserved without editable text.")}</li> : null}
          {result.warnings?.some(warning => warning.startsWith("OCR_REVIEW_PAGE:")) ? <li>{t("OCR was used. Check every number, formula and Vietnamese accent before accepting.")}</li> : null}
          {result.warnings?.some(warning => warning.startsWith("INFERRED_TABLE_REVIEW_PAGE:")) ? <li>{t("Some tables were inferred from aligned text. Check that every product, amount and quantity is in the correct cell.")}</li> : null}
          {result.warnings?.includes("AI_STRUCTURE_REVIEW") ? <li>{t("AI reviewed structure labels only. Text, numbers and source order were preserved.")}</li> : null}
          {result.warnings?.includes("AI_STRUCTURE_UNAVAILABLE") ? <li role="status">{t("AI assistance was unavailable or invalid. The original extraction is retained.")}</li> : null}
          {(result.mode ?? mode) === "structured" ? <li>{t("Scanned tables, complex equations and vector-only figures may need manual correction. Keep original.pdf for comparison.")}</li> : null}
          <li>{t("For an exact visual copy, compile original-layout.tex. That file embeds the original PDF; its contents are not directly editable.")}</li>
        </ul></details>
        <div className="writing-actions"><Button disabled={busy} onClick={async () => {
          if (submitting.current || !run) return; submitting.current = true; setBusy(true); setError("");
          try { const row = await manuscriptsApi.acceptPdfImport(project, run); setOpen(false); reset(); setFile(undefined); setTitle(""); onImported(row.id); }
          catch (failure) { if (isMissingConversion(failure)) reset(); setError(errorMessage(failure, t("Could not create the manuscript. Your input is retained; try again."))); }
          finally { submitting.current = false; setBusy(false); }
        }}>{t(busy ? "Creating…" : "Accept and open editor")}</Button><Button variant="outline" disabled={busy} onClick={() => { reset(); setFile(undefined); setTitle(""); }}>{t("Choose another PDF")}</Button></div>
      </> : null}
    </DialogContent>
  </Dialog>;
}
