import { gitHash, type RepositoryFile } from "./manuscript-github-client";
export type FileFingerprint = { path: string; sha: string };
export type SyncChange = { path: string; kind: "LOCAL" | "REMOTE" | "CONFLICT" | "SAME"; local?: RepositoryFile; remote?: RepositoryFile };
export async function fingerprints(files: RepositoryFile[]): Promise<FileFingerprint[]> {
  return Promise.all(files.filter(file => file.path !== "lumigap-version.json").map(async file => ({ path: file.path, sha: await gitHash(file.content) })));
}
/** Detect additions/deletions on both sides. Never guess a merge for a conflict. */
export async function planSync(baseline: FileFingerprint[], local: RepositoryFile[], remote: RepositoryFile[]): Promise<SyncChange[]> {
  const base = new Map(baseline.map(file => [file.path, file.sha]));
  const here = new Map((await fingerprints(local)).map(file => [file.path, file.sha]));
  const there = new Map((await fingerprints(remote)).map(file => [file.path, file.sha]));
  return [...new Set([...base.keys(), ...here.keys(), ...there.keys()])].sort().map(path => ({ path,
    kind: here.get(path) === there.get(path) ? "SAME" : here.get(path) === base.get(path) ? "REMOTE" : there.get(path) === base.get(path) ? "LOCAL" : "CONFLICT",
    local: local.find(file => file.path === path), remote: remote.find(file => file.path === path),
  }));
}
export function mergedFiles(changes: SyncChange[], choices: Record<string, "LOCAL" | "REMOTE">) {
  if (changes.some(change => change.kind === "CONFLICT" && !choices[change.path])) throw new Error("Resolve all conflicts first");
  return changes.flatMap(change => {
    const keep = (change.kind === "CONFLICT" ? choices[change.path] === "REMOTE" : change.kind === "REMOTE") ? change.remote : change.local;
    return keep ? [keep] : [];
  });
}
