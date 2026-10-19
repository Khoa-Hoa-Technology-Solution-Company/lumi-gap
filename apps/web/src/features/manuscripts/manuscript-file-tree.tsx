import { useState } from "react";
import { ChevronDown, ChevronRight, FileCheck, FileCode2, Folder, Image } from "lucide-react";
import type { ManuscriptFile, SnapshotFile } from "@trend/shared-types";
import { useI18n } from "@/i18n";

type File = ManuscriptFile | SnapshotFile;
export function ManuscriptFileTree({ files, selectedId, mainFileId, onSelect }: { files: File[]; selectedId?: string; mainFileId?: string | null; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const folders = new Map<string, File | undefined>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++) if (!folders.has(parts.slice(0, i).join("/"))) folders.set(parts.slice(0, i).join("/"), undefined);
    if (file.kind === "FOLDER") folders.set(file.path, file);
  }
  const nodes = [...files.filter(file => file.kind !== "FOLDER").map(file => ({ path: file.path, file, folder: false })), ...[...folders].map(([path, file]) => ({ path, file, folder: true }))];
  const sorted = nodes.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  return <div className="writing-file-list" role="list" aria-label={t("Manuscript files")}>
    {sorted.filter(node => ![...closed].some(path => node.path.startsWith(`${path}/`))).map(node => <div role="listitem" key={node.path}>
      <button className={`writing-file ${selectedId === node.file?.id ? "selected" : ""}`} style={{ paddingLeft: `${10 + (node.path.split("/").length - 1) * 16}px` }} title={node.path} aria-current={selectedId && selectedId === node.file?.id ? "true" : undefined} aria-expanded={node.folder ? !closed.has(node.path) : undefined} onClick={() => {
        if (node.folder) { setClosed(current => { const next = new Set(current); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next; }); if (node.file) onSelect(node.file.id); }
        else if (node.file) onSelect(node.file.id);
      }}>
        {node.folder ? closed.has(node.path) ? <ChevronRight /> : <ChevronDown /> : <span className="writing-tree-indent" />}
        {node.folder ? <Folder /> : node.file?.kind === "ASSET" ? <Image /> : <FileCode2 />}<span>{node.path.split("/").pop()}</span>
        {node.file?.id === mainFileId ? <FileCheck className="writing-main-icon" aria-label={t("Main LaTeX file")} /> : null}
      </button>
    </div>)}
  </div>;
}
