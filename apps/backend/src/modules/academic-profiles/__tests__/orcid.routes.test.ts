import express, { type ErrorRequestHandler } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  configured: true,
  status: vi.fn(),
  start: vi.fn(),
  complete: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("../orcid-oauth.service.js", () => ({
  getOrcidConfig: () => ({
    configured: mocks.configured,
    environment: "sandbox",
    baseUrl: "https://sandbox.orcid.org",
  }),
  orcidOauthService: { start: mocks.start, callback: mocks.complete },
  orcidOAuthService: {
    status: mocks.status,
    start: mocks.start,
    complete: mocks.complete,
    disconnect: mocks.disconnect,
  },
}));

vi.mock("../../../common/middleware/auth.js", () => ({
  requireAuth: (req: any, res: any, next: () => void) => {
    if (!mocks.authenticated) return res.status(401).json({ success: false, message: "Unauthorized" });
    req.user = { sub: "11111111-1111-4111-8111-111111111111", sessionId: "session-family-1" };
    next();
  },
  optionalAuth: (_req: any, _res: any, next: () => void) => next(),
  requireVerifiedAuth: (_req: any, _res: any, next: () => void) => next(),
  requireSystemRole: () => (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../../../common/middleware/rate-limit.js", () => ({
  createRateLimiter: () => (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../../auth/google-oidc.service.js", () => ({ resolveOAuthReturnOrigin: () => "http://localhost:8080" }));

import { academicProfileRouter } from "../academic-profile.routes.js";

const app = express();
app.use(express.json());
app.use("/academic-profiles", academicProfileRouter);
app.use(((error, _req, res, _next) => {
  const statusCode = error instanceof ZodError ? 400 : error.statusCode ?? 500;
  res.status(statusCode).json({
    success: false,
    error: { message: error.message },
  });
}) as ErrorRequestHandler);

const server = createServer(app);
let origin: string;

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/academic-profiles`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.configured = true;
});

describe("ORCID OAuth Routes", () => {
  it("requires authentication for status, connect, POST callback, and disconnect", async () => {
    mocks.authenticated = false;
    expect((await fetch(`${origin}/me/orcid`)).status).toBe(401);
    expect(
      (
        await fetch(`${origin}/me/orcid/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${origin}/me/orcid/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "abc", state: "a".repeat(32) }),
        })
      ).status,
    ).toBe(401);
    expect((await fetch(`${origin}/me/orcid`, { method: "DELETE" })).status).toBe(401);
  });

  it("binds userId and sessionId from req.user and sets private no-store cache headers", async () => {
    mocks.status.mockResolvedValueOnce({
      configured: true,
      environment: "sandbox",
      connected: false,
      link: null,
    });
    const statusRes = await fetch(`${origin}/me/orcid`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.status).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");

    mocks.start.mockResolvedValueOnce({
      url: "https://sandbox.orcid.org/oauth/authorize?client_id=APP-1",
      state: "a".repeat(43),
    });
    const connectRes = await fetch(`${origin}/me/orcid/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnTo: "/profile" }),
    });
    expect(connectRes.status).toBe(200);
    expect(connectRes.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.start).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "session-family-1",
      expect.objectContaining({ returnTo: "/profile" }),
    );
  });

  it("forwards provider redirects to the authenticated frontend even when linking is disabled", async () => {
    mocks.configured = false;
    const state = "a".repeat(43);
    const res = await fetch(`${origin}/orcid/callback?code=abc&state=${state}`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const target = new URL(res.headers.get("location")!);
    expect(target.origin).toBe("http://localhost:8080");
    expect(target.pathname).toBe("/integrations/orcid/callback");
    expect(target.searchParams.get("state")).toBe(state);
    expect(target.searchParams.get("code")).toBe("abc");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("never links anonymously and validates callback fields before forwarding grant or denial", async () => {
    mocks.authenticated = false;
    const state = "s".repeat(43);
    const denied = await fetch(`${origin}/orcid/callback?error=access_denied&state=${state}`, { redirect: "manual" });
    expect(denied.status).toBe(302);
    expect(new URL(denied.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
    expect(mocks.complete).not.toHaveBeenCalled();
    for (const query of ["code=abc&state=short", `code=abc&state=${state}&userId=forged`, `code=abc&error=access_denied&state=${state}`]) {
      expect((await fetch(`${origin}/orcid/callback?${query}`, { redirect: "manual" })).status).toBe(400);
    }
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
