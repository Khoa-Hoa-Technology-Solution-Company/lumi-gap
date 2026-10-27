import { afterEach, expect, it, vi } from "vitest";
import { GithubHttpError, githubJson } from "../github.http.js";
afterEach(() => vi.unstubAllGlobals());
it("rejects non-GitHub origins and bounds response sizes without forwarding redirect credentials", async () => {
  const fetcher = vi.fn(async () => Response.json({ ok: true })); vi.stubGlobal("fetch", fetcher);
  for (const url of ["http://api.github.com/user", "https://api.github.com.evil.test/user", "https://api.github.com:8443/user", "https://user:pass@api.github.com/user"]) await expect(githubJson(url, {})).rejects.toThrow("Invalid GitHub destination");
  expect(fetcher).not.toHaveBeenCalled();
  await githubJson("https://api.github.com/user", { headers: { Authorization: "Bearer synthetic" } });
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
  fetcher.mockResolvedValue(new Response("x".repeat(20)));
  await expect(githubJson("https://api.github.com/user", {}, 10)).rejects.toThrow("GitHub is unavailable");
});
it("distinguishes quota and authorization failures and never echoes provider response secrets", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("secret-provider-error", { status: 403, headers: { "x-ratelimit-remaining": "0" } })));
  await expect(githubJson("https://api.github.com/user", {})).rejects.toMatchObject({ status: 403, rateLimited: true, message: "GitHub request failed" } satisfies Partial<GithubHttpError>);
});
