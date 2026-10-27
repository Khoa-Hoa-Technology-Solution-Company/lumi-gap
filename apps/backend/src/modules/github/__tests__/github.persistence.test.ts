import { randomUUID, createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../config/env.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../config/env.js")>();
  return { env: { ...original.env, GITHUB_CLIENT_ID: "synthetic-app", GITHUB_CLIENT_SECRET: "synthetic-client-secret", GITHUB_APP_SLUG: "lumigap-test", GITHUB_CALLBACK_URL: "http://localhost:8080/integrations/github/callback" } };
});
import { env } from "../../../config/env.js";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { redis } from "../../../infrastructure/redis.js";
import { githubService } from "../github.service.js";
import { openGithubToken } from "../github.crypto.js";

const enabled = process.env.GITHUB_INTEGRATION === "1";
describe.runIf(enabled)("GitHub connection with PostgreSQL and Redis", () => {
  const db = getPrisma(), sessionId = randomUUID(), returnTo = `/projects/${randomUUID()}?tab=manuscripts`;
  let userId: string;
  const keys: string[] = [];
  const replies: Array<unknown | (() => Promise<Response>)> = [];
  let fetcher: ReturnType<typeof vi.fn>;
  const tokens = (name = "original") => ({ access_token: `synthetic-${name}`, token_type: "bearer", expires_in: 28800, refresh_token: `refresh-${name}`, refresh_token_expires_in: 15897600 });
  beforeAll(async () => {
    if (!/^\/codex_github_[a-f0-9]+_test$/.test(new URL(env.DATABASE_URL!).pathname)) throw new Error("Disposable database required");
    userId = (await db.user.create({ data: { email: `${randomUUID()}@github.invalid`, fullName: "GitHub connection fixture" } })).id;
    await db.refreshToken.create({ data: { userId, familyId: sessionId, tokenHash: "synthetic-session", expiresAt: new Date(Date.now() + 3600000) } });
  });
  beforeEach(async () => {
    replies.length = 0;
    fetcher = vi.fn(async () => { const reply = replies.shift(); if (typeof reply === "function") return reply(); if (reply instanceof Response) return reply; if (!reply) throw new Error("Unexpected provider call"); return Response.json(reply); });
    vi.stubGlobal("fetch", fetcher);
    await db.githubConnection.deleteMany({ where: { userId } });
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => { if (keys.length) await redis.del(...keys); await redis.quit(); await disconnectPostgres(); });
  async function start() {
    const url = new URL((await githubService.start(userId, sessionId, returnTo)).url), state = url.searchParams.get("state")!;
    keys.push(`oauth:github:state:${createHash("sha256").update(state).digest("hex")}`); return { url, state };
  }
  async function connected() { const flow = await start(); replies.push(tokens(), { id: 42, login: "researcher" }); await githubService.complete(userId, sessionId, "code", flow.state); return flow; }
  it("links using PKCE, encrypts both credentials, binds the session and returns only safe status", async () => {
    const { url, state } = await start();
    expect(url.origin).toBe("https://github.com"); expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.toString()).not.toContain("synthetic-client-secret");
    const saved = JSON.parse((await redis.get(keys.at(-1)!))!);
    expect(url.searchParams.get("code_challenge")).toBe(createHash("sha256").update(saved.verifier).digest("base64url"));
    await expect(githubService.complete(userId, randomUUID(), "code", state)).rejects.toMatchObject({ statusCode: 403 }); expect(fetcher).not.toHaveBeenCalled();
    replies.push(tokens(), { id: 42, login: "researcher" });
    expect(await githubService.complete(userId, sessionId, "code", state)).toEqual({ returnTo });
    expect(String(fetcher.mock.calls[0]?.[1].body)).toContain(`code_verifier=${saved.verifier}`);
    const row = await db.githubConnection.findUniqueOrThrow({ where: { userId } });
    expect(openGithubToken(row.encryptedAccessToken!, userId)).toBe("synthetic-original"); expect(row.encryptedRefreshToken).not.toContain("refresh-original");
    const status = await githubService.status(userId); expect(status).toMatchObject({ connected: true, login: "researcher" }); expect(JSON.stringify(status)).not.toMatch(/synthetic|encrypted|refresh_token/);
    await expect(githubService.complete(userId, sessionId, "code", state)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("rejects expired state and older authorization flows", async () => {
    const older = await start(), latest = await start();
    await expect(githubService.complete(userId, sessionId, "code", older.state)).rejects.toMatchObject({ statusCode: 409 });
    await redis.del(keys.at(-1)!);
    await expect(githubService.complete(userId, sessionId, "code", latest.state)).rejects.toMatchObject({ statusCode: 403 }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("prevents a late callback from restoring a disconnected connection", async () => {
    const flow = await start();
    replies.push(async () => { await githubService.disconnect(userId); return Response.json(tokens()); }, { id: 42, login: "researcher" });
    await expect(githubService.complete(userId, sessionId, "code", flow.state)).rejects.toMatchObject({ statusCode: 409 });
    expect((await githubService.status(userId)).connected).toBe(false);
  });
  it("refreshes once across simultaneous requests and preserves personal repository access", async () => {
    await connected();
    await db.githubConnection.update({ where: { userId }, data: { expiresAt: new Date(0) } });
    const repositories = [{ full_name: "team/paper", default_branch: "main", private: true, permissions: { push: true } }];
    replies.push(tokens("refreshed"), repositories, repositories);
    const result = await Promise.all([githubService.repositories(userId, 1), githubService.repositories(userId, 1)]);
    expect(result[0]?.repositories).toEqual([{ fullName: "team/paper", defaultBranch: "main", private: true, writable: true }]);
    const requests = fetcher.mock.calls.filter(([url]) => String(url).includes("access_token")); expect(requests).toHaveLength(2); // initial exchange + one refresh
    const row = await db.githubConnection.findUniqueOrThrow({ where: { userId } }); expect(openGithubToken(row.encryptedRefreshToken!, userId)).toBe("refresh-refreshed");
    for (const [url, init] of fetcher.mock.calls.slice(-2)) { expect(url).toMatch(/^https:\/\/api.github.com\/user\/repos/); expect(init.headers.Authorization).toBe("Bearer synthetic-refreshed"); }
  });
  it("clears revoked credentials without invalidating the LumiGap session", async () => {
    await connected(); replies.push(new Response("{}", { status: 401 }));
    await expect(githubService.repositories(userId, 1)).rejects.toMatchObject({ statusCode: 403 });
    expect((await githubService.status(userId)).connected).toBe(false);
    expect(await db.refreshToken.count({ where: { userId, familyId: sessionId, revokedAt: null } })).toBe(1);
  });
  it("retains credentials on temporary outages but clears an expired refresh token", async () => {
    await connected(); await db.githubConnection.update({ where: { userId }, data: { expiresAt: new Date(0) } });
    replies.push(new Response("{}", { status: 503 }));
    await expect(githubService.repositories(userId, 1)).rejects.toBeDefined();
    expect((await db.githubConnection.findUniqueOrThrow({ where: { userId } })).encryptedRefreshToken).not.toBeNull();
    await db.githubConnection.update({ where: { userId }, data: { refreshExpiresAt: new Date(0) } });
    await expect(githubService.repositories(userId, 1)).rejects.toMatchObject({ statusCode: 403 });
    expect((await db.githubConnection.findUniqueOrThrow({ where: { userId } })).encryptedAccessToken).toBeNull();
  });
  it("disconnects locally even if GitHub revocation is unavailable", async () => {
    await connected(); replies.push(new Response("{}", { status: 503 }));
    expect(await githubService.disconnect(userId)).toEqual({ disconnected: true, revoked: false });
    expect((await githubService.status(userId)).connected).toBe(false);
    await expect(githubService.request(userId, { repository: "team/paper", path: "", method: "GET" })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("uses fixed repository endpoints and rejects a force push before contacting GitHub", async () => {
    await connected(); replies.push({ private: true });
    expect(await githubService.request(userId, { repository: "team/paper", path: "", method: "GET" })).toEqual({ private: true });
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe("https://api.github.com/repos/team/paper");
    const calls = fetcher.mock.calls.length;
    await expect(githubService.request(userId, { repository: "team/paper", path: "/git/refs/heads/main", method: "PATCH", body: { sha: "a".repeat(40), force: true } })).rejects.toBeDefined(); expect(fetcher.mock.calls).toHaveLength(calls);
  });
  it("never completes linking after session revocation", async () => {
    const flow = await start(); replies.push(tokens(), { id: 42, login: "researcher" });
    await db.refreshToken.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    await expect(githubService.complete(userId, sessionId, "code", flow.state)).rejects.toMatchObject({ statusCode: 409 });
    expect((await githubService.status(userId)).connected).toBe(false);
    await db.refreshToken.updateMany({ where: { userId }, data: { revokedAt: null } });
  });
});
