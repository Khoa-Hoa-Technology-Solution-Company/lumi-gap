import { decodeRepositoryContent, gitHash, type RepositoryFile } from "./manuscript-github-client";
import { mergeSourceText } from "./merge-source-text";
export type FileFingerprint = { path: string; sha: string };
export type SyncChange = { path: string; kind: "LOCAL" | "REMOTE" | "CONFLICT" | "SAME" | "MERGED"; local?: RepositoryFile; remote?: RepositoryFile; merged?: RepositoryFile };
export async function fingerprints(files: RepositoryFile[]): Promise<FileFingerprint[]> {
  return Promise.all(files.filter(file => file.path !== "lumigap-version.json").map(async file => ({ path: file.path, sha: await gitHash(file.content) })));
}
/** Only auto-merge text backed by a blob matching the saved common baseline. */
export async function planSync(baseline: FileFingerprint[], local: RepositoryFile[], remote: RepositoryFile[], baseFiles: RepositoryFile[] = []): Promise<SyncChange[]> {
  const base = new Map(baseline.map(file => [file.path, file.sha]));
  const here = new Map((await fingerprints(local)).map(file => [file.path, file.sha]));
  const there = new Map((await fingerprints(remote)).map(file => [file.path, file.sha]));
  const changes: SyncChange[] = [...new Set([...base.keys(), ...here.keys(), ...there.keys()])].sort().map(path => ({ path,
    kind: here.get(path) === there.get(path) ? "SAME" : here.get(path) === base.get(path) ? "REMOTE" : there.get(path) === base.get(path) ? "LOCAL" : "CONFLICT",
    local: local.find(file => file.path === path), remote: remote.find(file => file.path === path),
  }));
  for (const change of changes) {
    if (change.kind !== "CONFLICT" || !change.local || !change.remote || !/\.(tex|bib|txt|sty|cls|bst|csv|tsv|dat|tikz|pgf|ist|bbx|cbx|lbx|def|cfg|fd)$/.test(change.path)) continue;
    const original = baseFiles.find(file => file.path === change.path);
    if (!original || await gitHash(original.content) !== base.get(change.path)) continue;
    try {
      const decode = (content: string) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(decodeRepositoryContent(content));
      const result = mergeSourceText(decode(original.content), decode(change.local.content), decode(change.remote.content));
      if (result === undefined) continue;
      const bytes = new TextEncoder().encode(result); let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      change.kind = "MERGED"; change.merged = { path: change.path, content: btoa(binary) };
    } catch { /* Invalid text remains a manual conflict. */ }
  }
  return changes;
}
export const hasIndependentHistories = (baseline: FileFingerprint[], local: RepositoryFile[], remote: RepositoryFile[]) => baseline.length === 0 && local.length > 0 && remote.length > 0;

export function mergedFiles(changes: SyncChange[], choices: Record<string, "LOCAL" | "REMOTE">) {
  if (changes.some(change => change.kind === "CONFLICT" && !choices[change.path])) throw new Error("Resolve all conflicts first");
  return changes.flatMap(change => {
    if (change.kind === "MERGED") return change.merged ? [change.merged] : [];
    const keep = (change.kind === "CONFLICT" ? choices[change.path] === "REMOTE" : change.kind === "REMOTE") ? change.remote : change.local;
    return keep ? [keep] : [];
  });
}
