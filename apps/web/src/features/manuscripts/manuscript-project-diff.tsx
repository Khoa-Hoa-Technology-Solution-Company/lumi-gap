import { useState } from "react";
import type { ManuscriptSnapshot, SnapshotFile } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";
import { sourceDiff } from "./manuscript-version-diff";

export type FileChange = { before?: SnapshotFile; after?: SnapshotFile; kind: "added" | "removed" | "renamed" | "modified" };
export function manifestChanges(before: SnapshotFile[], after: SnapshotFile[]): FileChange[] {
  const next = new Map(after.map(file => [file.id, file])), previous = new Set(before.map(file => file.id)), changes: FileChange[] = [];
  for (const file of before) {
    const current = next.get(file.id);
    if (!current) changes.push({ before: file, kind: "removed" });
    else if (current.path !== file.path) changes.push({ before: file, after: current, kind: "renamed" });
    else if (current.kind !== file.kind || (file.kind === "TEXT" ? file.text !== current.text : file.kind === "ASSET" ? file.checksum !== current.checksum : false)) changes.push({ before: file, after: current, kind: "modified" });
  }
  for (const file of after) if (!previous.has(file.id)) changes.push({ after: file, kind: "added" });
  return changes.sort((a, b) => (a.after?.path ?? a.before!.path).localeCompare(b.after?.path ?? b.before!.path));
}
function FileComparison({ change }: { change: FileChange }) {
  const { t } = useI18n(), [open, setOpen] = useState(false);
  const file = change.after ?? change.before!, isText = file.kind === "TEXT", lines = open && isText ? sourceDiff(change.before?.text ?? "", change.after?.text ?? "") : [];
  return <article className="writing-project-file-diff"><button aria-expanded={open} onClick={() => setOpen(value => !value)}><span>{t(change.kind === "added" ? "Added file" : change.kind === "removed" ? "Removed file" : change.kind === "renamed" ? "Renamed file" : "Changed file")}</span><code>{change.kind === "renamed" ? `${change.before!.path} → ${file.path}` : file.path}</code></button>
    {open ? isText ? <><pre aria-label={t("Source comparison")}>{lines.slice(0, 1500).map((line, index) => <span className={`writing-diff-${line.kind}`} key={index}>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} {line.text}{"\n"}</span>)}</pre>{lines.length > 1500 ? <p>{t("Showing the first 1,500 lines. Download source to compare the entire file.")}</p> : null}</> : <p className="writing-small">{t(file.kind === "FOLDER" ? "Folder structure changed" : "Binary asset changed; download the corresponding version to inspect it.")}</p> : null}
  </article>;
}
export function ManuscriptProjectDiff({ project, manuscript, baseline, versions, current }: { project: string; manuscript: string; baseline: ManuscriptSnapshot; versions: ManuscriptSnapshot[]; current?: () => Promise<{ id: string }> }) {
  const { t } = useI18n(), [target, setTarget] = useState(current ? "current" : versions.find(row => row.id !== baseline.id)?.id ?? ""), [report, setReport] = useState<{ files: FileChange[]; before: ManuscriptSnapshot; after: ManuscriptSnapshot }>(), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  return <div className="writing-project-diff"><label>{t("Compare project with")}<select value={target} disabled={busy} onChange={event => { setTarget(event.target.value); setReport(undefined); }}>{current ? <option value="current">{t("Saved working draft")}</option> : null}<option value="" disabled>{t("Select a version")}</option>{versions.filter(row => row.id !== baseline.id).map(row => <option value={row.id} key={row.id}>{row.label} · v{row.sourceVersion}</option>)}</select></label><Button size="sm" variant="outline" disabled={busy || !target} onClick={() => {
    setBusy(true); setError(false);
    void Promise.all([manuscriptsApi.viewSnapshot(project, manuscript, baseline.id), target === "current" && current ? current().then(version => manuscriptsApi.viewSnapshot(project, manuscript, version.id)) : manuscriptsApi.viewSnapshot(project, manuscript, target)]).then(([before, after]) => {
      if (!before.manifest || !after.manifest) throw new Error("Manifest unavailable");
      setReport({ before, after, files: manifestChanges(before.manifest.files, after.manifest.files) });
    }).catch(() => setError(true)).finally(() => setBusy(false));
  }}>{t(busy ? "Loading comparison…" : "Compare project")}</Button>
    {error ? <p role="alert">{t("Could not compare. Check source synchronization and access.")}</p> : null}
    {report ? <div><p className="writing-small">v{report.before.sourceVersion} → v{report.after.sourceVersion} · {report.files.length} {t("changed files")}</p>{report.before.manifest!.title !== report.after.manifest!.title ? <p>{t("Project title changed")}: {report.before.manifest!.title} → {report.after.manifest!.title}</p> : null}{report.before.manifest!.mainFileId !== report.after.manifest!.mainFileId ? <p>{t("Main LaTeX file changed")}</p> : null}{report.files.map(change => <FileComparison key={`${change.before?.id}:${change.after?.id}`} change={change} />)}{!report.files.length ? <p>{t("No file changes between these versions.")}</p> : null}</div> : null}
  </div>;
}
