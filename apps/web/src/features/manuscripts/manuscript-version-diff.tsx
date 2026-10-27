import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";

export type DiffLine = { kind: "same" | "added" | "removed"; text: string };
/** Bounded line diff. Large replacements keep a whole changed block instead of
 * running a quadratic comparison on a user-controlled source file. */
export function sourceDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n"), b = after.split("\n");
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const head: DiffLine[] = a.slice(0, start).map(text => ({ kind: "same", text }));
  const tail: DiffLine[] = a.slice(endA).map(text => ({ kind: "same", text }));
  const left = a.slice(start, endA), right = b.slice(start, endB);
  if (left.length * right.length > 250000) return [...head, ...left.map(text => ({ kind: "removed" as const, text })), ...right.map(text => ({ kind: "added" as const, text })), ...tail];
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) table[i]![j] = left[i] === right[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  let i = 0, j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { head.push({ kind: "same", text: left[i++]! }); j++; }
    else if (i < left.length && (j === right.length || table[i + 1]![j]! >= table[i]![j + 1]!)) head.push({ kind: "removed", text: left[i++]! });
    else head.push({ kind: "added", text: right[j++]! });
  }
  return [...head, ...tail];
}
export function ManuscriptVersionDiff({ project, manuscript, snapshot, file, readCurrent }: { project: string; manuscript: string; snapshot: string; file: { id: string; path: string }; readCurrent: () => Promise<string> }) {
  const { t } = useI18n();
  const [lines, setLines] = useState<DiffLine[]>(), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  return <div className="writing-version-diff"><Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
    if (lines) { setLines(undefined); return; }
    setBusy(true); setError(false);
    try { const version = await manuscriptsApi.viewSnapshot(project, manuscript, snapshot); const source = version.manifest!.files.find(item => item.id === file.id || item.path === file.path); setLines(sourceDiff(source?.text ?? "", await readCurrent())); }
    catch { setError(true); } finally { setBusy(false); }
  }}>{t(busy ? "Loading comparison…" : lines ? "Hide comparison" : "Compare current file")}</Button>
    {error ? <p role="alert">{t("Could not compare. Check source synchronization and access.")}</p> : null}
    {lines ? <><p className="writing-small">{file.path} · − {lines.filter(line => line.kind === "removed").length} / + {lines.filter(line => line.kind === "added").length}</p><pre aria-label={t("Source comparison")}>{lines.slice(0, 1500).map((line, index) => <span key={index} className={`writing-diff-${line.kind}`}>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} {line.text}{"\n"}</span>)}</pre>{lines.length > 1500 ? <p>{t("Showing the first 1,500 lines. Download source to compare the entire file.")}</p> : null}</> : null}
  </div>;
}
