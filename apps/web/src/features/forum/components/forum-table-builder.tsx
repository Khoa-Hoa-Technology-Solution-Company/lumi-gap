import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import type { ForumTableConfig } from "../utils/forum-discussion-editor";

export function ForumTableBuilder({ initial, onInsert, onClose }: { initial?: ForumTableConfig; onInsert: (config: ForumTableConfig) => boolean | void; onClose: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState(initial?.rows ?? 3);
  const [columns, setColumns] = useState(initial?.columns ?? 3);
  const [includeHeader, setIncludeHeader] = useState(initial?.includeHeader ?? true);
  const [headers, setHeaders] = useState(initial?.headers ?? [t("Column") + " 1", t("Column") + " 2", t("Column") + " 3"]);
  const [cells, setCells] = useState<string[][]>(initial?.cells ?? []);
  const maxRows = Math.max(20, initial?.rows ?? 0), maxColumns = Math.max(8, initial?.columns ?? 0);
  const [error, setError] = useState(false);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl flex-col gap-4 overflow-hidden">
      <DialogHeader><DialogTitle>{t(initial ? "Edit table" : "Table builder")}</DialogTitle><DialogDescription>{t("Fill in the cells, then insert the table. You can also edit cells directly in your discussion.")}</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm"><span>{t("Rows")}</span><Input type="number" min={1} max={maxRows} className="w-20" value={rows} onChange={(event) => setRows(Math.max(1, Math.min(maxRows, Math.round(Number(event.target.value)) || 1)))} /></label>
        <label className="space-y-1 text-sm"><span>{t("Columns")}</span><Input type="number" min={1} max={maxColumns} className="w-20" value={columns} onChange={(event) => setColumns(Math.max(1, Math.min(maxColumns, Math.round(Number(event.target.value)) || 1)))} /></label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={includeHeader} onChange={(event) => setIncludeHeader(event.target.checked)} className="h-4 w-4 accent-primary" />{t("Include header row")}</label>
      </div>
      <div className="min-h-0 overflow-auto rounded-md border border-border" aria-label={t("Table cells")}>
        <table className="w-full border-collapse text-sm">
          <thead><tr><th className="w-10 border-b border-r bg-muted px-3 py-2"><span className="sr-only">{t("Row")}</span></th>{Array.from({ length: columns }, (_, column) => <th key={column} className="min-w-36 border-b border-r bg-muted/70 p-0 font-semibold"><input aria-label={`${t("Column")} ${column + 1}`} value={headers[column] ?? `${t("Column")} ${column + 1}`} disabled={!includeHeader} maxLength={200} onChange={(event) => setHeaders((current) => { const next = [...current]; next[column] = event.target.value; return next; })} className="h-11 w-full min-w-0 bg-transparent px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" /></th>)}</tr></thead>
          <tbody>{Array.from({ length: rows }, (_, row) => <tr key={row}><th scope="row" className="border-b border-r bg-muted/30 px-3 py-2 text-center font-normal text-muted-foreground">{row + 1}</th>{Array.from({ length: columns }, (_, column) => <td key={column} className="border-b border-r p-0"><input aria-label={`${t("Row")} ${row + 1}, ${t("Column")} ${column + 1}`} value={cells[row]?.[column] ?? ""} maxLength={1000} onChange={(event) => setCells((current) => { const next = current.map((values) => [...values]); next[row] ??= []; next[row][column] = event.target.value; return next; })} className="h-11 w-full min-w-0 bg-transparent px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" /></td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={rows >= maxRows} onClick={() => setRows((count) => count + 1)}><Plus aria-hidden className="mr-1 h-4 w-4" />{t("Add row")}</Button>
        <Button type="button" variant="outline" size="sm" disabled={columns >= maxColumns} onClick={() => setColumns((count) => count + 1)}><Plus aria-hidden className="mr-1 h-4 w-4" />{t("Add column")}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={rows <= 1} onClick={() => setRows((count) => count - 1)}><Minus aria-hidden className="mr-1 h-4 w-4" />{t("Remove last row")}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={columns <= 1} onClick={() => setColumns((count) => count - 1)}><Minus aria-hidden className="mr-1 h-4 w-4" />{t("Remove last column")}</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{t("This table exceeds the discussion length limit. Shorten its contents and try again.")}</p> : null}
      <DialogFooter className="gap-2 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button><Button type="button" onClick={() => { if (onInsert({ rows, columns, includeHeader, headers, cells }) === false) { setError(true); return; } onClose(); }}>{t(initial ? "Update table" : "Insert table")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
