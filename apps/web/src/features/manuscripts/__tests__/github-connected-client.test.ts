import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/services/api-client", () => ({ api: { post: mocks.post } }));
import { ManuscriptGithubClient } from "../manuscript-github-client";
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
it("uses the authenticated backend for connected accounts without receiving a GitHub token", async () => {
  const sha = "a".repeat(40), tree = "b".repeat(40), signal = new AbortController().signal;
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const value of [{ private: true, permissions: { push: true } }, { object: { sha } }, { tree: { sha: tree } }, { tree: [], truncated: false }]) mocks.post.mockResolvedValueOnce({ data: { data: value } });
  const client = new ManuscriptGithubClient("team/paper", "", signal, "original-user");
  expect(client.authenticated).toBe(true); expect(await client.head("main")).toMatchObject({ sha, writable: true });
  expect(fetcher).not.toHaveBeenCalled(); expect(mocks.post).toHaveBeenCalledTimes(4);
  for (const [url, body, config] of mocks.post.mock.calls) { expect(url).toBe("/integrations/github/repository"); expect(body).toMatchObject({ repository: "team/paper", method: "GET" }); expect(config).toMatchObject({ expectedUserId: "original-user", signal }); expect(JSON.stringify(body)).not.toContain("token"); }
});
it("keeps manually supplied PATs on the original direct-to-GitHub path", async () => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ private: true })); vi.stubGlobal("fetch", fetcher);
  const client = new ManuscriptGithubClient("team/paper", "synthetic-pat", new AbortController().signal, "connected-user");
  await expect(client.head("main")).rejects.toThrow(); // incomplete response intentionally stops subsequent reads
  expect(mocks.post).not.toHaveBeenCalled(); expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>)?.Authorization).toBe("Bearer synthetic-pat");
});
