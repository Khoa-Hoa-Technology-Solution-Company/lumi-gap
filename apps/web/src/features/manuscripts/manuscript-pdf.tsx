import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ManuscriptCompilationState } from "@trend/shared-types";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { manuscriptsApi, saveDownload } from "./manuscripts.api";
const PdfPreview = lazy(() => import("@/features/academic-profile/components/private-evidence-pdf-preview"));

export function latexErrors(log: string) {
  const errors = log.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(?:\.\/)?([A-Za-z0-9][A-Za-z0-9_./ ()-]*\.(?:tex|sty|cls|bib|bst)):(\d+):\s*(.+)$/);
    return match ? [{ path: match[1]!, line: Number(match[2]), message: match[3]! }] : [];
  });
  const actionable = errors.filter(error => !/Fatal error occurred, no output PDF/i.test(error.message));
  return (actionable.length ? actionable : errors).slice(0, 20);
}
export const latexErrorHint = (message: string) => /Missing \\begin\{document\}/.test(message) ? "Place document content, including the abstract, after \\begin{document}." : /Environment abstract\s+.+ undefined/.test(message) ? "Use \\begin{abstract} and \\end{abstract}. Write the abstract text between these commands." : undefined;
export function ManuscriptPdf({ projectId, id, userId, state, sourceVersion, pending, available, compiling, onCompile, onSource, onRepair, sourceTarget }: {
  projectId: string; id: string; userId: string; state?: ManuscriptCompilationState; sourceVersion?: number;
  pending: boolean; available: boolean; compiling: boolean; onCompile: () => void; onSource: (path: string, line: number) => void; onRepair?: (path?: string, line?: number) => void;
  sourceTarget?: { path: string; line: number; key: number };
}) {
  const { t } = useI18n(), latest = state?.latest, success = state?.successful;
  const running = latest?.status === "QUEUED" || latest?.status === "COMPILING" || compiling;
  const failed = latest && ["FAILED", "BLOCKED", "TIMED_OUT"].includes(latest.status);
  const pdf = useQuery({ queryKey: ["manuscript-pdf", userId, projectId, id, success?.id], queryFn: () => manuscriptsApi.pdf(projectId, id, success!.id), enabled: Boolean(success), staleTime: Infinity, gcTime: 0, retry: false });
  const stale = success && (pending || (sourceVersion !== undefined && success.sourceVersion !== sourceVersion));
  const [target, setTarget] = useState<{ page: number; x: number; y: number; key: number }>(), [syncError, setSyncError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    if (!sourceTarget || !success || stale) return;
    let cancelled = false;
    setSyncError("");
    void manuscriptsApi.syncTex(projectId, id, success.id, { direction: "forward", path: sourceTarget.path, line: sourceTarget.line }).then(locations => {
      if (cancelled) return;
      const location = locations.find(point => point.page !== undefined && point.x !== undefined && point.y !== undefined);
      if (location) setTarget({ page: location.page!, x: location.x!, y: location.y!, key: sourceTarget.key });
      else setSyncError(t("No PDF location for this source line."));
    }).catch(() => { if (!cancelled) setSyncError(t("SyncTeX unavailable. Compile again and retry.")); });
    return () => { cancelled = true; };
  }, [sourceTarget, success?.id, stale, projectId, id, t]);
  const inverse = async (page: number, x: number, y: number) => {
    if (!success || stale) return;
    const token = ++request.current; setSyncError("");
    try {
      const locations = await manuscriptsApi.syncTex(projectId, id, success.id, { direction: "inverse", page, x, y });
      if (token !== request.current) return;
      const location = locations.find(point => point.path && point.line);
      if (location) onSource(location.path!, location.line!); else setSyncError(t("No source location for this PDF position."));
    } catch { if (token === request.current) setSyncError(t("SyncTeX unavailable. Compile again and retry.")); }
  };
  useEffect(() => () => { request.current++; }, [id, success?.id, stale]);
  return <div className="writing-pdf-panel">
    {running ? <div className="writing-compile-progress" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t(latest?.status === "COMPILING" ? "Compiling PDF…" : "Waiting for compiler…")}</div> : null}
    {latest && failed ? <section className="writing-compile-errors" role="alert"><strong>{t(latest.status === "TIMED_OUT" ? "PDF compilation timed out" : "PDF compilation failed")}</strong><p>{t("Fix the source errors and compile again. Your saved source is retained.")}</p>{latexErrors(latest.diagnostics).map((error, index) => <button key={index} onClick={() => onSource(error.path, error.line)}><code>{error.path}:{error.line}</code><span>{error.message}{latexErrorHint(error.message) ? <small className="writing-error-hint">{t(latexErrorHint(error.message)!)}</small> : null}</span></button>)}{onRepair ? <Button size="sm" variant="outline" className="writing-ai-repair-button" aria-label={t("Ask AI to fix errors")} disabled={running} onClick={() => { const error = latexErrors(latest.diagnostics)[0]; onRepair(error?.path, error?.line); }}>{t("Ask AI to fix errors")}</Button> : null}{latest.diagnostics ? <details><summary>{t("Compiler log")}</summary><pre>{latest.diagnostics}</pre></details> : null}</section> : null}
    {success ? <>
      <div className="writing-pdf-meta"><span>{t("Compiled source revision {{version}}", { version: success.sourceVersion })} · {success.engine === "lualatex" ? "LuaLaTeX" : success.engine === "xelatex" ? "XeLaTeX" : "pdfLaTeX"}</span><Button size="sm" variant="ghost" disabled={!pdf.data} onClick={() => pdf.data && saveDownload(pdf.data, `manuscript-v${success.sourceVersion}.pdf`)}><Download className="h-4 w-4" />{t("Download PDF")}</Button></div>
      {failed || stale ? <p role="status" className="writing-pdf-stale">{failed ? t("Showing the last successful PDF (revision {{version}}). The current source has not compiled.", { version: success.sourceVersion }) : t("Source changed. Compile again to update this PDF.")}</p> : null}
      {syncError ? <p role="status" className="writing-small">{syncError}</p> : null}
      {pdf.isLoading ? <p role="status">{t("Loading private PDF…")}</p> : pdf.error ? <div role="alert"><p>{t("Could not load the PDF. Check your access and try again.")}</p><Button size="sm" variant="outline" onClick={() => void pdf.refetch()}>{t("Try again")}</Button></div> : pdf.data ? <Suspense fallback={<p role="status">{t("Loading private PDF…")}</p>}><PdfPreview blob={pdf.data} zoomable compact continuous target={target} onPoint={!stale ? (page, x, y) => void inverse(page, x, y) : undefined} /></Suspense> : null}
      {latest?.status === "SUCCESS" && latest.diagnostics ? <details className="writing-compile-log"><summary>{t("Compiler log")}</summary><pre>{latest.diagnostics}</pre></details> : null}
    </> : !running ? <div className="writing-preview"><FileText className="h-10 w-10" /><h2>{t("PDF preview")}</h2><p>{t(available ? "Compile your saved source to preview the paper here." : "PDF compilation is not available on this server.")}</p>{available ? <Button size="sm" disabled={compiling} onClick={onCompile}>{t("Compile PDF")}</Button> : null}<p className="writing-small">{t("Saving source does not compile a PDF.")}</p></div> : null}
  </div>;
}
