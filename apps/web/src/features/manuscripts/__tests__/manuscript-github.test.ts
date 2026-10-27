import { webcrypto, createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { ManuscriptGithubClient, validateRepository, type RepositoryHead } from "../manuscript-github-client";

afterEach(() => vi.unstubAllGlobals());
const sha = "1".repeat(40), tree = "2".repeat(40);
const head: RepositoryHead = { sha, tree, private: true, writable: true, entries: [] };
const content = Buffer.from("\\documentclass{article}\n").toString("base64");
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
