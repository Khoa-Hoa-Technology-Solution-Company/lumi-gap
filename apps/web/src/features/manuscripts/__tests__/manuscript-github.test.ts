import { webcrypto, createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { ManuscriptGithubClient, validateRepository, type RepositoryHead } from "../manuscript-github-client";

afterEach(() => vi.unstubAllGlobals());
const sha = "1".repeat(40), tree = "2".repeat(40);
const head: RepositoryHead = { sha, tree, private: true, writable: true, entries: [] };
const content = Buffer.from("\\documentclass{article}\n").toString("base64");
it("loads only five commits from the selected branch and ignores provider URLs", async () => {
  const fetcher = fakeFetch([[{ sha, commit: { message: "Update source\n\nDetails", author: { name: "Researcher", date: "2026-10-31T10:00:00Z" } }, html_url: "https://evil.test" }]]);
  const client = new ManuscriptGithubClient("team/research", "test-token", new AbortController().signal);
  expect(await client.recentCommits("feature/paper")).toEqual([{ sha, message: "Update source", author: "Researcher", date: "2026-10-31T10:00:00Z" }]);
  expect((fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[0]).toBe("https://api.github.com/repos/team/research/commits?sha=feature%2Fpaper&per_page=5");
});
it("verifies ancestry and the complete baseline before using an old tree", async () => {
  const old = "3".repeat(40), blob = "4".repeat(40), oldTree = "5".repeat(40);
  fakeFetch([{ status: "ahead", merge_base_commit: { sha: old } }, { tree: { sha: oldTree } }, { truncated: false, tree: [{ path: "main.tex", sha: blob, type: "blob", mode: "100644", size: 4 }] }]);
  const client = new ManuscriptGithubClient("team/research", "test-token", new AbortController().signal);
  expect(await client.commonBase(head, old, [{ path: "main.tex", sha: blob }])).toMatchObject({ sha: old, tree: oldTree });
  fakeFetch([{ status: "diverged", merge_base_commit: { sha } }]);
  expect(await client.commonBase(head, old, [{ path: "main.tex", sha: blob }])).toBeUndefined();
  fakeFetch([{ status: "ahead", merge_base_commit: { sha: old } }, { tree: { sha: oldTree } }, { truncated: false, tree: [] }]);
  expect(await client.commonBase(head, old, [{ path: "main.tex", sha: blob }])).toBeUndefined();
});
it("creates a divergent conflict branch from the shared commit, preserves unrelated files and records local deletions", async () => {
  const removed = { path: "removed.tex", mode: "100644", type: "blob", sha, size: 4 };
  const readme = { ...removed, path: "README.md" };
  const fetcher = fakeFetch([{ sha: "3".repeat(40) }, { sha: "4".repeat(40) }, { sha: "5".repeat(40) }, {}]);
  const client = new ManuscriptGithubClient("team/research", "test-token", new AbortController().signal);
  const result = await client.createConflictBranch({ ...head, entries: [removed, readme] }, [{ path: "main.tex", content }], "feature/paper");
  const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
  expect(JSON.parse(String(calls[1]![1].body))).toMatchObject({ base_tree: tree, tree: [{ path: "removed.tex", sha: null }, { path: "main.tex" }] });
  expect(JSON.parse(String(calls[2]![1].body))).toMatchObject({ parents: [sha] });
  expect(JSON.parse(String(calls[3]![1].body))).toMatchObject({ ref: "refs/heads/" + result.branch });
  expect(calls.every(call => call[1].method !== "PATCH")).toBe(true);
  expect(result.compareUrl).toBe(`https://github.com/team/research/compare/feature%2Fpaper...${encodeURIComponent(result.branch)}?expand=1`);
  expect(result.branch).toMatch(/^lumigap\/conflict-\d{4}-.*-[a-f0-9]{8}$/);
});
function fakeFetch(replies: unknown[]) {
  vi.stubGlobal("crypto", webcrypto);
  const fetcher = vi.fn(async () => { const reply = replies.shift(); if (reply instanceof Response) return reply; if (!reply) throw new Error("Unexpected request"); return Response.json(reply); });
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
it("pins all requests to GitHub, retains tokens in headers, and verifies source blob hashes", async () => {
  const bytes = Buffer.from(content, "base64"), hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  const fetcher = fakeFetch([{ private: true, permissions: { push: true } }, { object: { sha } }, { tree: { sha: tree } }, { tree: [{ path: "main.tex", type: "blob", mode: "100644", sha: hash, size: bytes.length }, { path: "README.md", type: "blob", mode: "100644", sha, size: 4 }], truncated: false }, { content, encoding: "base64" }]);
  const client = new ManuscriptGithubClient("team/research", "test-token", new AbortController().signal), remote = await client.head("feature/paper");
  const bundle = await client.pull(remote, () => undefined);
  expect(bundle).toEqual({ files: [{ path: "main.tex", content }], skipped: ["README.md"] });
  for (const call of fetcher.mock.calls as unknown as Array<[string, RequestInit]>) {
    expect(call[0]).toMatch(/^https:\/\/api\.github\.com\/repos\/team\/research/);
    expect(call[0]).not.toContain("test-token"); expect(call[1].credentials).toBe("omit"); expect(call[1].redirect).toBe("error");
    expect((call[1].headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  }
});
it("pushes a tree based on the remote tree and never force-updates a branch", async () => {
  const fetcher = fakeFetch([{ sha: "3".repeat(40) }, { sha: "4".repeat(40) }, { sha: "5".repeat(40) }, {}]);
  const client = new ManuscriptGithubClient("team/research", "test-token", new AbortController().signal);
  const result = await client.push(head, [{ path: "main.tex", content }], "main", "Update source", () => undefined, true);
  const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
  expect(JSON.parse(String(calls[1]![1].body))).toMatchObject({ base_tree: tree });
  expect(JSON.parse(String(calls[2]![1].body))).toMatchObject({ parents: [sha] });
  expect(JSON.parse(String(calls[3]![1].body))).toEqual({ sha: "5".repeat(40), force: false });
  expect(result).toBe(`https://github.com/team/research/commit/${"5".repeat(40)}`);
});
it("downloads public blobs at the pinned commit without forwarding tokens and rejects tampering", async () => {
  const bytes = Buffer.from(content, "base64"), hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  const publicHead: RepositoryHead = { ...head, private: false, entries: [{ path: "section one/main.tex", type: "blob", mode: "100644", sha: hash, size: bytes.length }] };
  const fetcher = fakeFetch([new Response(bytes)]);
  const client = new ManuscriptGithubClient("team/research", "test-token", new AbortController().signal);
  expect((await client.pull(publicHead, () => undefined)).files[0]).toEqual({ path: "section one/main.tex", content });
  const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
  expect(calls[0]![0]).toBe(`https://raw.githubusercontent.com/team/research/${sha}/section%20one/main.tex`);
  expect(calls[0]![1].headers).toBeUndefined();
  expect(calls[0]![1]).toMatchObject({ credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
  fakeFetch([new Response(new Uint8Array(bytes.length))]);
  await expect(client.pull(publicHead, () => undefined)).rejects.toThrow("changed or exceeds limits");
});
it("rejects concurrent/protected branches and malformed or hostile source paths", async () => {
  fakeFetch([{ sha }, { sha: tree }, { sha }, new Response("{}", { status: 422 })]);
  const client = new ManuscriptGithubClient("team/research", "test-token", new AbortController().signal);
  await expect(client.push(head, [{ path: "main.tex", content }], "main", "Update", () => undefined, true)).rejects.toThrow("changed or is protected");
  for (const repo of ["https://evil.test/team/research", "team/repo/../../x", "user@host/repo"]) expect(() => validateRepository(repo, "main")).toThrow();
  for (const branch of ["../main", "main.lock", "main//x", "main..x"]) expect(() => validateRepository("team/research", branch)).toThrow();
  await expect(client.pull({ ...head, entries: [{ path: "main.tex", mode: "120000", type: "blob", sha, size: 10 }] }, () => undefined)).rejects.toThrow();
  await expect(client.changes(head, [{ path: "../private.tex", content }])).rejects.toThrow();
});
it("distinguishes API quota exhaustion from branch and authorization failures", async () => {
  fakeFetch([new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } })]);
  const client = new ManuscriptGithubClient("team/research", "", new AbortController().signal);
  await expect(client.head("main")).rejects.toThrow("GitHub rate limit reached");
});

it("allows a README-only repository for synchronization while refusing an empty draft import", async () => {
  const fetcher = fakeFetch([]);
  const client = new ManuscriptGithubClient("team/research", "test-token", new AbortController().signal);
  const initialized = { ...head, entries: [{ path: "README.md", type: "blob", mode: "100644", sha, size: 4 }] };
  await expect(client.pull(initialized, () => undefined, true)).resolves.toEqual({ files: [], skipped: ["README.md"] });
  await expect(client.pull(initialized, () => undefined)).rejects.toThrow("Source import exceeds");
  expect(fetcher).not.toHaveBeenCalled();
});
