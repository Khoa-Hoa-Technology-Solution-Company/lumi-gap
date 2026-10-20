export interface RepositoryFile { path: string; content: string }
interface TreeEntry { path: string; mode: string; type: string; sha: string; size?: number }
export interface RepositoryHead { sha: string; tree: string; entries: TreeEntry[]; private: boolean; writable: boolean }
const supported = /\.(tex|bib|txt|sty|cls|bst|csv|tsv|dat|tikz|pgf|ist|bbx|cbx|lbx|def|cfg|fd|png|jpg|jpeg|webp|pdf|svg|eps)$/;
const safePath = (path: string) => path.length <= 240 && path.split("/").every(part => /^[A-Za-z0-9][A-Za-z0-9._ ()-]*$/.test(part) && !part.endsWith(" ") && part.length <= 100) && path.split("/")[0]?.toLowerCase() !== "lumigap-build";
export function validateRepository(repository: string, branch: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository) || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch) || branch.includes("..") || branch.includes("//") || branch.split("/").some(part => part.endsWith(".lock") || part.endsWith(".") || !part)) throw new Error("Invalid repository or branch");
}
export function decodeRepositoryContent(content: string) {
  const normalized = content.replace(/\n/g, "");
  if (normalized.length > 7_000_000 || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error("Invalid repository content");
  return Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
}
export async function gitHash(content: string) {
  const bytes = decodeRepositoryContent(content), header = new TextEncoder().encode(`blob ${bytes.length}\0`), input = new Uint8Array(header.length + bytes.length);
  input.set(header); input.set(bytes, header.length);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-1", input))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
/** PATs stay in dialog memory; connected accounts use a server-side credential. */
export class ManuscriptGithubClient {
  constructor(readonly repository: string, private token: string, private signal: AbortSignal, private connectedUser?: string) { validateRepository(repository, "main"); }
  get authenticated() { return Boolean(this.token || this.connectedUser); }
  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    if (path !== "" && !/^\/git\/(?:ref\/heads\/|refs(?:\/heads\/)?|commits(?:\/)?|trees(?:\/)?|blobs(?:\/)?)[A-Za-z0-9%?=._/-]*$/.test(path)) throw new Error("Invalid repository API path");
    if (this.connectedUser && !this.token) {
      const { api } = await import("@/services/api-client");
      const response = await api.post<{ data: T }>("/integrations/github/repository", { repository: this.repository, path, method, ...(body !== undefined ? { body } : {}) }, { expectedUserId: this.connectedUser, signal: this.signal });
      return response.data.data;
    }
    const response = await fetch(`https://api.github.com/repos/${this.repository}${path}`, { method, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.any([this.signal, AbortSignal.timeout(30000)]), credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0" ? "GitHub rate limit reached" : response.status === 401 || response.status === 403 ? "GitHub permission denied" : response.status === 409 || response.status === 422 ? "GitHub branch changed or is protected" : "GitHub request failed");
    const reader = response.body?.getReader(); if (!reader) throw new Error("Empty GitHub response");
    let length = 0; const chunks: Uint8Array[] = [];
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 10_000_000) { await reader.cancel(); throw new Error("Repository response exceeds limit"); } chunks.push(next.value); }
    const all = new Uint8Array(length); let cursor = 0; for (const chunk of chunks) { all.set(chunk, cursor); cursor += chunk.length; }
    return JSON.parse(new TextDecoder().decode(all)) as T;
  }
  async head(branch: string): Promise<RepositoryHead> {
    validateRepository(this.repository, branch);
    const repo = await this.request<{ private: boolean; permissions?: { push?: boolean } }>("");
    const ref = await this.request<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(branch)}`);
    if (!/^[a-f0-9]{40}$/.test(ref.object.sha)) throw new Error("Unsupported Git object hash");
    const commit = await this.request<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
    const tree = await this.request<{ sha: string; truncated: boolean; tree: TreeEntry[] }>(`/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree) || tree.tree.length > 10000) throw new Error("Repository tree exceeds limit");
    return { sha: ref.object.sha, tree: commit.tree.sha, entries: tree.tree, private: repo.private, writable: repo.permissions?.push === true };
  }
  async pull(head: RepositoryHead, progress: (done: number, total: number) => void) {
    const selected = head.entries.filter(entry => entry.type === "blob" && (supported.test(entry.path) || entry.path === "lumigap-version.json"));
    if (!selected.length || selected.length > 201 || selected.filter(entry => entry.path !== "lumigap-version.json").length > 200 || selected.some(entry => !safePath(entry.path) || !["100644", "100755"].includes(entry.mode) || (entry.size ?? 6_000_001) > 5_000_000) || selected.reduce((sum, entry) => sum + (entry.size ?? 0), 0) > 6_000_000) throw new Error("Source import exceeds path, file or size limits");
    const files: RepositoryFile[] = new Array(selected.length); let totalBytes = 0, cursor = 0, completed = 0;
    const download = async (entry: TreeEntry) => {
      if (!head.private) {
        // Public raw downloads avoid spending one REST API quota unit per source.
        // No token is forwarded to this second, fixed public-content origin.
        const response = await fetch(`https://raw.githubusercontent.com/${this.repository}/${head.sha}/${entry.path.split("/").map(encodeURIComponent).join("/")}`, { signal: AbortSignal.any([this.signal, AbortSignal.timeout(30000)]), credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
        if (!response.ok || !response.body) throw new Error("Source download failed");
        const reader = response.body.getReader(), parts: Uint8Array[] = []; let length = 0;
        while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > (entry.size ?? 0) || length > 5_000_000) { await reader.cancel(); throw new Error("Source download exceeds limit"); } parts.push(next.value); }
        let binary = ""; for (const part of parts) for (let offset = 0; offset < part.length; offset += 8192) binary += String.fromCharCode(...part.subarray(offset, offset + 8192));
        return btoa(binary);
      }
      const blob = await this.request<{ content: string; encoding: string }>(`/git/blobs/${entry.sha}`);
      if (blob.encoding !== "base64") throw new Error("Unsupported blob encoding");
      return blob.content.replace(/\n/g, "");
    };
    const worker = async () => { while (cursor < selected.length) {
      const index = cursor++, entry = selected[index]!;
      if (!/^[a-f0-9]{40}$/.test(entry.sha)) throw new Error("Invalid blob hash");
      const content = await download(entry), bytes = decodeRepositoryContent(content); totalBytes += bytes.length;
      if (totalBytes > 6_000_000 || bytes.length !== entry.size || await gitHash(content) !== entry.sha) throw new Error("Repository content changed or exceeds limits");
      files[index] = { path: entry.path, content }; progress(++completed, selected.length);
    } };
    const results = await Promise.allSettled(Array.from({ length: Math.min(4, selected.length) }, worker));
    const failure = results.find(result => result.status === "rejected"); if (failure?.status === "rejected") throw failure.reason;
    return { files, skipped: head.entries.filter(entry => entry.type !== "tree" && !selected.includes(entry)).map(entry => entry.path) };
  }
  async changes(head: RepositoryHead, files: RepositoryFile[]) {
    if (!files.length || files.length > 201 || files.some(file => !safePath(file.path))) throw new Error("Invalid source bundle");
    const result: RepositoryFile[] = [];
    for (const file of files) {
      const existing = head.entries.find(entry => entry.path === file.path);
      if (existing && (existing.type !== "blob" || !["100644", "100755"].includes(existing.mode))) throw new Error("Repository file conflicts with a directory or symbolic link");
      if (!existing || existing.sha !== await gitHash(file.content)) result.push(file);
    }
    return result;
  }
  async push(head: RepositoryHead, files: RepositoryFile[], target: string, message: string, progress: (done: number, total: number) => void, updateExisting = false, deletions: string[] = []) {
    validateRepository(this.repository, target);
    if (!this.authenticated || !head.writable || !message.trim() || (!files.length && !deletions.length) || files.length + deletions.length > 401) throw new Error("GitHub write access required");
    if (deletions.some(path => !safePath(path) || !supported.test(path) || files.some(file => file.path === path) || !head.entries.some(entry => entry.path === path && entry.type === "blob" && ["100644", "100755"].includes(entry.mode)))) throw new Error("Invalid remote deletion");
    const entries: Array<{ path: string; mode: string; type: string; sha: string | null }> = deletions.map(path => ({ path, mode: "100644", type: "blob", sha: null }));
    for (const file of files) {
      if (!safePath(file.path)) throw new Error("Invalid source path");
      const blob = await this.request<{ sha: string }>("/git/blobs", "POST", { content: file.content, encoding: "base64" });
      entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha }); progress(entries.length, files.length);
    }
    const tree = await this.request<{ sha: string }>("/git/trees", "POST", { base_tree: head.tree, tree: entries });
    const commit = await this.request<{ sha: string }>("/git/commits", "POST", { message: message.trim().slice(0, 500), tree: tree.sha, parents: [head.sha] });
    // Existing branches are advanced only when the server can fast-forward. Never force-push.
    if (updateExisting) await this.request(`/git/refs/heads/${encodeURIComponent(target)}`, "PATCH", { sha: commit.sha, force: false });
    else await this.request("/git/refs", "POST", { ref: `refs/heads/${target}`, sha: commit.sha });
    return `https://github.com/${this.repository}/commit/${commit.sha}`;
  }
}
