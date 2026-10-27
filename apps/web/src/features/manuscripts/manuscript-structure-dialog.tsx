import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import { useI18n } from "@/i18n";
import { equationBody, parseTable, serializeTable } from "./latex-structures";
import type { AiSelection } from "./ai-selection";
import "katex/dist/katex.min.css";

export type StructureDraft = { kind: "table" | "equation"; target: AiSelection };
export function ManuscriptStructureDialog({ draft, onClose, onApply }: { draft: StructureDraft; onClose: () => void; onApply: (target: AiSelection, text: string) => Promise<void> }) {
  const { t } = useI18n(), original = draft.target.original;
  const initial = useMemo(() => original ? parseTable(original) : null, [original]);
  const [rows, setRows] = useState(initial?.rows ?? [["", ""], ["", ""]]), [align, setAlign] = useState(initial?.align ?? "ll");
  const [math, setMath] = useState(equationBody(original) ?? (original ? "" : "E = mc^2"));
  const [previewError, setPreviewError] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const preview = useRef<HTMLDivElement>(null), submitting = useRef(false);
  const supported = !original || (draft.kind === "table" ? Boolean(initial) : equationBody(original) !== null);
  const dirty = draft.kind === "table" ? rows.some(row => row.some(Boolean)) : Boolean(math);
  useUnsavedWorkspace(dirty || busy);
  useEffect(() => {
    if (draft.kind !== "equation") return;
    let disposed = false; setReady(false); setPreviewError("");
    const timer = setTimeout(() => {
      void import("katex").then(katex => {
        if (disposed || !preview.current) return;
        preview.current.replaceChildren();
        try {
          if (!math.trim() || math.length > 4000 || /\\(?:href|url|includegraphics|html\w*)\b/.test(math)) throw new Error();
          katex.render(math, preview.current, { displayMode: true, throwOnError: true, trust: false, strict: "error", maxExpand: 100, maxSize: 20 });
          setReady(true);
        } catch { setPreviewError(t("This equation cannot be previewed. Check the syntax or use the source editor.")); }
      }).catch(() => { if (!disposed) setPreviewError(t("Could not load equation preview.")); });
    }, 150);
    return () => { disposed = true; clearTimeout(timer); };
  }, [draft.kind, math, t]);
  const source = draft.kind === "table" ? serializeTable({ align, rows, layout: initial?.layout }) : original.startsWith("\\begin{equation") ? original.replace(equationBody(original)!, () => math.trim()) : `\\[\n${math.trim()}\n\\]`;
  const resize = (height: number, width: number) => { setRows(current => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => current[r]?.[c] ?? ""))); setAlign(current => current.slice(0, width).padEnd(width, "l")); };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="writing-structure-dialog" closeLabel={t("Close")} showClose={!busy}>
    <DialogTitle>{t(draft.kind === "table" ? "Table editor" : "Equation editor")}</DialogTitle>
    <DialogDescription>{t("Preview the source, then apply. TeX compilation remains the final check.")}</DialogDescription>
    {!supported ? <p role="alert">{t("This structure uses unsupported formatting. Edit it in the source editor to preserve its commands.")}</p> : <>
      {draft.kind === "table" ? <>
        <div className="writing-structure-controls"><label>{t("Rows")}<select value={rows.length} onChange={e => resize(Number(e.target.value), align.length)} disabled={busy}>{Array.from({ length: 20 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label><label>{t("Columns")}<select value={align.length} onChange={e => resize(rows.length, Number(e.target.value))} disabled={busy}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label></div>
        <div className="writing-table-grid"><table><thead><tr>{[...align].map((value, c) => <th key={c}><label>{t("Alignment")} {c + 1}<select aria-label={`${t("Alignment")} ${c + 1}`} value={value} disabled={busy} onChange={e => setAlign(current => current.slice(0, c) + e.target.value + current.slice(c + 1))}><option value="l">{t("Left")}</option><option value="c">{t("Center")}</option><option value="r">{t("Right")}</option></select></label></th>)}</tr></thead><tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}><input aria-label={`${t("Cell")} ${r + 1}, ${c + 1}`} value={cell} maxLength={500} disabled={busy} onChange={e => setRows(current => current.map((old, i) => i === r ? old.map((value, j) => j === c ? e.target.value : value) : old))} /></td>)}</tr>)}</tbody></table></div>
        <p className="writing-small">{t("Plain text cells. LaTeX special characters are escaped automatically.")}</p>
      </> : <><label>{t("Equation source")}<textarea rows={5} maxLength={4000} disabled={busy} value={math} onChange={e => { setReady(false); setMath(e.target.value); }} spellCheck={false} /></label><div className="writing-equation-preview" ref={preview} aria-label={t("Equation preview")} />{previewError ? <p role="alert">{previewError}</p> : null}</>}
      <details><summary>{t("LaTeX source")}</summary><pre>{source}</pre></details>
    </>}
    {error ? <p role="alert" className="writing-error">{error}</p> : null}
    <div className="writing-actions"><Button disabled={!supported || busy || (draft.kind === "equation" && (!ready || Boolean(previewError))) || source === original} onClick={() => {
      if (submitting.current) return; submitting.current = true; setBusy(true); setError("");
      void onApply(draft.target, source).then(onClose).catch(() => { setError(t("The source or your access changed. Close this preview and reopen it from the current source.")); }).finally(() => { submitting.current = false; setBusy(false); });
    }}>{t("Apply to source")}</Button><Button variant="outline" disabled={busy} onClick={onClose}>{t("Cancel")}</Button></div>
  </DialogContent></Dialog>;
}
