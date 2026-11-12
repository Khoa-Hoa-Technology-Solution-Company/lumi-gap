import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
vi.mock("../../../config/env.js", async original => {
  const { env } = await original<typeof import("../../../config/env.js")>();
  return { env: { ...env, ORCID_CLIENT_ID: "synthetic-orcid-app", ORCID_CLIENT_SECRET: "synthetic-orcid-secret", ORCID_BASE_URL: "https://sandbox.orcid.org", ORCID_REDIRECT_URI: "http://localhost:8080/integrations/orcid/callback" } };
});
import { env } from "../../../config/env.js";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { redis } from "../../../infrastructure/redis.js";
import { orcidOauthService as oauth } from "../orcid-oauth.service.js";
import { academicIdentityService as identities } from "../academic-identity.service.js";
import { orcidLatestKey, orcidStateKey } from "../orcid-oauth-state.js";
import { mountOrcidOauthRoutes } from "../orcid-oauth.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService } from "../../auth/token.service.js";
const enabled = process.env.ORCID_INTEGRATION === "1";
const nativeFetch = globalThis.fetch;
if (enabled && !new URL(env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Isolated test database required");
describe.skipIf(!enabled).sequential("ORCID ownership linking with PostgreSQL and Redis", () => {
  const db = getPrisma(), orcid = "0000-0002-1825-0097";
  let user: string, other: string, session: string, otherSession: string, fetcher: ReturnType<typeof vi.fn>, server: Server | undefined;
  const users: string[] = [], states: string[] = [];
  const token = (overrides = {}) => ({ orcid, access_token: "synthetic-private-token", refresh_token: "synthetic-refresh-token", token_type: "bearer", scope: "/authenticate", name: "Provider name must not overwrite profile", ...overrides });
  beforeEach(async () => {
    env.ORCID_CLIENT_SECRET = "synthetic-orcid-secret"; env.ORCID_BASE_URL = "https://sandbox.orcid.org";
    [user, other] = await Promise.all([1, 2].map(async () => {
      const row = await db.user.create({ data: { email: `${randomUUID()}@orcid.invalid`, fullName: "Local profile name", emailVerifiedAt: new Date() } }); users.push(row.id);
      await db.academicProfile.create({ data: { userId: row.id, academicRole: "LECTURER", primaryPosition: "LECTURER", roleVerificationStatus: "SELF_DECLARED", positionStatus: "NOT_SUBMITTED" } }); return row.id;
    }));
    [session, otherSession] = [randomUUID(), randomUUID()];
    await db.refreshToken.createMany({ data: [{ userId: user, familyId: session, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) }, { userId: other, familyId: otherSession, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) }] });
    fetcher = vi.fn(async () => Response.json(token())); vi.stubGlobal("fetch", fetcher);
  });
  afterEach(async () => { vi.unstubAllGlobals(); if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; await db.academicIdentityLink.deleteMany({ where: { userId: { in: users } } }); });
  afterAll(async () => { await redis.del(...states.map(orcidStateKey), ...users.map(orcidLatestKey)); await redis.quit(); await disconnectPostgres(); });
  async function start(id = user, sid = session) { const result = await oauth.start(id, sid); states.push(result.state); return result; }
  const complete = (state: string, id = user, sid = session) => oauth.callback(id, sid, { state, code: "synthetic-authorization-code" });
  it("disables only ORCID when credentials are missing", async () => {
    env.ORCID_CLIENT_SECRET = undefined;
    expect(oauth.availability().configured).toBe(false);
    await expect(start()).rejects.toMatchObject({ statusCode: 503 }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("binds a hashed expiring state to the user, session and configuration and requests only authentication", async () => {
    const result = await start(), url = new URL(result.authorizationUrl), saved = JSON.parse((await redis.get(orcidStateKey(result.state)))!);
    expect(url.origin).toBe("https://sandbox.orcid.org"); expect(url.pathname).toBe("/oauth/authorize"); expect(url.searchParams.get("scope")).toBe("/authenticate");
    expect(saved).toMatchObject({ userId: user, sessionId: session, identity: null }); expect(await redis.ttl(orcidStateKey(result.state))).toBeGreaterThan(590);
    expect(result.authorizationUrl).not.toContain("synthetic-orcid-secret");
  });
  it("links only the authenticated ORCID, defaults to private and never promotes academic verification", async () => {
    const flow = await start(), result = await complete(flow.state);
    expect(result).toMatchObject({ cancelled: false, identity: { identifier: orcid, connectionMethod: "OAUTH", verificationStatus: "PROVIDER_CONNECTED", visibility: "PRIVATE", profileUrl: `https://sandbox.orcid.org/${orcid}` } });
    expect(JSON.stringify(result)).not.toMatch(/synthetic-private-token|synthetic-refresh-token|Provider name/);
    if (result.cancelled) throw new Error();
    expect(await identities.update(user, result.identity.id, { visibility: "PUBLIC" })).toMatchObject({ verificationStatus: "PROVIDER_CONNECTED", visibility: "PUBLIC" });
    expect(await db.user.findUnique({ where: { id: user } })).toMatchObject({ fullName: "Local profile name" });
    expect(await db.academicProfile.findUnique({ where: { userId: user } })).toMatchObject({ roleVerificationStatus: "SELF_DECLARED", positionStatus: "NOT_SUBMITTED" });
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toBe("https://sandbox.orcid.org/oauth/token"); expect(request[1].redirect).toBe("error"); expect(String(request[1].body)).toContain("grant_type=authorization_code");
    expect(await db.auditLog.count({ where: { userId: user, actionName: "academic_profile.orcid.connected" } })).toBe(1);
  });
  it("uses production endpoints only when the production origin is configured", async () => {
    env.ORCID_BASE_URL = "https://orcid.org";
    const flow = await start(); expect(new URL(flow.authorizationUrl).origin).toBe("https://orcid.org"); expect(oauth.availability().environment).toBe("PRODUCTION");
    expect(await complete(flow.state)).toMatchObject({ identity: { profileUrl: `https://orcid.org/${orcid}` } });
    expect(fetcher.mock.calls[0]![0]).toBe("https://orcid.org/oauth/token");
  });
  it("upgrades a manual claim in place and preserves its visibility", async () => {
    const manual = await identities.create(user, { provider: "ORCID", identifier: orcid, visibility: "REGISTERED_USERS" });
    const result = await complete((await start()).state);
    expect(result).toMatchObject({ identity: { id: manual.id, visibility: "REGISTERED_USERS", verificationStatus: "PROVIDER_CONNECTED" } });
    expect(await db.academicIdentityLink.count({ where: { userId: user, provider: "ORCID" } })).toBe(1);
  });
  it("rejects account/session substitution without consuming the legitimate state, then prevents replay", async () => {
    const flow = await start();
    await expect(complete(flow.state, other, otherSession)).rejects.toMatchObject({ statusCode: 403 });
    await expect(complete(flow.state, user, otherSession)).rejects.toMatchObject({ statusCode: 403 }); expect(fetcher).not.toHaveBeenCalled();
    await complete(flow.state); await expect(complete(flow.state)).rejects.toMatchObject({ statusCode: 403 }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects expired state and a superseded start without calling the provider", async () => {
    const expired = await start(); await redis.del(orcidStateKey(expired.state));
    await expect(complete(expired.state)).rejects.toMatchObject({ statusCode: 403 });
    const old = await start(), latest = await start(); await expect(complete(old.state)).rejects.toMatchObject({ statusCode: 403 }); expect(fetcher).not.toHaveBeenCalled(); await complete(latest.state);
  });
  it("consumes a denied authorization without changing the existing identity", async () => {
    const manual = await identities.create(user, { provider: "ORCID", identifier: orcid, visibility: "PRIVATE" }); const flow = await start();
    expect(await oauth.callback(user, session, { state: flow.state, error: "access_denied" })).toEqual({ cancelled: true }); expect(fetcher).not.toHaveBeenCalled();
    expect(await db.academicIdentityLink.findUnique({ where: { id: manual.id } })).toMatchObject({ connectionMethod: "MANUAL", verificationStatus: "UNVERIFIED" });
    await expect(complete(flow.state)).rejects.toMatchObject({ statusCode: 403 });
  });
  it.each([{ orcid: "0000-0002-1825-0098" }, { orcid: "https://orcid.org/0000-0002-1825-0097" }, { access_token: "" }, { scope: "/read-public" }, { token_type: "invalid" }])("rejects malformed provider identity/token metadata: %j", async overrides => {
    fetcher.mockResolvedValueOnce(Response.json(token(overrides))); await expect(complete((await start()).state)).rejects.toMatchObject({ statusCode: 503 }); expect(await db.academicIdentityLink.count({ where: { userId: user } })).toBe(0);
  });
  it("sanitizes provider failures and bounds responses", async () => {
    fetcher.mockResolvedValueOnce(new Response("private provider response", { status: 500 })); await expect(complete((await start()).state)).rejects.toThrow("ORCID could not confirm");
    fetcher.mockResolvedValueOnce(new Response("x".repeat(16385))); await expect(complete((await start()).state)).rejects.toThrow("ORCID could not confirm");
    fetcher.mockRejectedValueOnce(new Error("network private token")); await expect(complete((await start()).state)).rejects.toThrow("ORCID could not confirm");
  });
  it("allows duplicate unverified claims but prevents duplicate OAuth ownership, including racing callbacks", async () => {
    await identities.create(user, { provider: "ORCID", identifier: orcid, visibility: "PUBLIC" }); await identities.create(other, { provider: "ORCID", identifier: orcid, visibility: "PRIVATE" });
    const a = await start(), b = await start(other, otherSession);
    const results = await Promise.allSettled([complete(a.state), complete(b.state, other, otherSession)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await db.academicIdentityLink.count({ where: { identifier: orcid, verificationStatus: "PROVIDER_CONNECTED" } })).toBe(1);
  });
  it("disconnects, audits and releases the ORCID for another authenticated owner", async () => {
    const result = await complete((await start()).state); if (result.cancelled) throw new Error();
    await expect(identities.remove(other, result.identity.id)).rejects.toMatchObject({ statusCode: 404 });
    await identities.remove(user, result.identity.id);
    expect(await db.auditLog.count({ where: { userId: user, actionName: "academic_profile.orcid.disconnected" } })).toBe(1);
    await expect(complete((await start(other, otherSession)).state, other, otherSession)).resolves.toMatchObject({ cancelled: false });
  });
  it("does not resurrect a removed identity when the provider reply arrives late", async () => {
    let release!: (response: Response) => void; fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
    const flow = await start(), completed = complete(flow.state); const observed = completed.catch(error => error);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const manual = await identities.create(user, { provider: "ORCID", identifier: orcid, visibility: "PRIVATE" }); await identities.remove(user, manual.id);
    release(Response.json(token())); expect(await observed).toMatchObject({ statusCode: 403 }); expect(await db.academicIdentityLink.count({ where: { userId: user } })).toBe(0);
  });
  it("rechecks a revoked session after token exchange", async () => {
    fetcher.mockImplementationOnce(async () => { await db.refreshToken.updateMany({ where: { userId: user }, data: { revokedAt: new Date() } }); return Response.json(token()); });
    await expect(complete((await start()).state)).rejects.toMatchObject({ statusCode: 401 }); expect(await db.academicIdentityLink.count({ where: { userId: user } })).toBe(0);
  });
  it("requires authentication on HTTP routes, rejects forged fields and sends private responses", async () => {
    const app = express(), router = express.Router(); app.use(express.json()); mountOrcidOauthRoutes(router); app.use(router); app.use(errorHandler);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server!.once("listening", () => resolve())); const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/me/orcid`, authorization = `Bearer ${tokenService.signAccessToken({ sub: user, systemRole: "USER", sessionId: session }).token}`;
    expect((await nativeFetch(`${url}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
    const response = await nativeFetch(url, { headers: { authorization } }); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ success: true, data: { configured: true, environment: "sandbox" } });
    expect((await nativeFetch(`${url}/callback`, { method: "POST", headers: { authorization, "Content-Type": "application/json" }, body: JSON.stringify({ state: "a".repeat(43), code: "code", userId: other, verificationStatus: "PROVIDER_CONNECTED" }) })).status).toBe(400);
  });
  it("keeps main's connect/status/disconnect APIs on the same authenticated ownership flow", async () => {
    const app = express(), router = express.Router(); app.use(express.json()); mountOrcidOauthRoutes(router); app.use(router); app.use(errorHandler);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server!.once("listening", () => resolve()));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/me/orcid`;
    const headers = { authorization: `Bearer ${tokenService.signAccessToken({ sub: user, systemRole: "USER", sessionId: session }).token}`, "Content-Type": "application/json" };
    expect((await nativeFetch(`${url}/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
    const begin = await nativeFetch(`${url}/connect`, { method: "POST", headers, body: JSON.stringify({ returnTo: "/profile", returnOrigin: "http://localhost:8080" }) });
    expect(begin.status).toBe(200); const flow = (await begin.json() as { data: { state: string; authorizationUrl: string; url: string } }).data;
    states.push(flow.state); expect(flow.url).toBe(flow.authorizationUrl);
    const completed = await nativeFetch(`${url}/callback`, { method: "POST", headers, body: JSON.stringify({ state: flow.state, code: "synthetic-code" }) });
    expect(completed.status).toBe(200); const result = await completed.json();
    expect(result).toMatchObject({ data: { cancelled: false, identity: { identifier: orcid, visibility: "PRIVATE" }, link: { identifier: orcid } } });
    expect(JSON.stringify(result)).not.toMatch(/synthetic-private-token|synthetic-refresh-token/);
    expect(await (await nativeFetch(url, { headers })).json()).toMatchObject({ data: { connected: true, link: { verificationStatus: "PROVIDER_CONNECTED" } } });
    expect((await nativeFetch(`${url}/callback`, { method: "POST", headers, body: JSON.stringify({ state: flow.state, code: "replay" }) })).status).toBe(403);
    expect((await nativeFetch(url, { method: "DELETE", headers })).status).toBe(200);
    expect(await db.academicIdentityLink.count({ where: { userId: user, provider: "ORCID" } })).toBe(0);
    expect(await (await nativeFetch(url, { headers })).json()).toMatchObject({ data: { connected: false, link: null } });
  });

});
