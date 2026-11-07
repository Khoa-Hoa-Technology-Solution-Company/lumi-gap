import express, { type ErrorRequestHandler } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AppError } from "../../../common/exceptions/app-error.js";

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

  it("returns 503 when GET /orcid/callback is called while ORCID is not configured", async () => {
    mocks.configured = false;
    const res = await fetch(`${origin}/orcid/callback?code=abc&state=${"a".repeat(32)}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(503);
  });

  it("redirects GET /orcid/callback to /profile?orcid=connected on success and /profile?orcid_error=... on error", async () => {
    const state = "s".repeat(32);
    mocks.complete.mockResolvedValueOnce({
      link: {
        id: "22222222-2222-4222-8222-222222222222",
        provider: "ORCID",
        identifier: "0000-0002-1825-0097",
        profileUrl: "https://orcid.org/0000-0002-1825-0097",
        connectionMethod: "OAUTH",
        status: "CONNECTED",
        verificationStatus: "PROVIDER_CONNECTED",
        visibility: "PUBLIC",
        createdAt: "2026-11-07T00:00:00.000Z",
        updatedAt: "2026-11-07T00:00:00.000Z",
      },
      returnTo: "/profile",
      returnOrigin: "http://localhost:8080",
    });

    const successRes = await fetch(`${origin}/orcid/callback?code=auth-code&state=${state}`, {
      redirect: "manual",
    });
    expect(successRes.status).toBe(302);
    expect(successRes.headers.get("location")).toBe("http://localhost:8080/profile?orcid=connected");

    mocks.complete.mockRejectedValueOnce(
      AppError.conflict("This ORCID iD is already connected to another LumiGap account", {
        returnOrigin: "http://localhost:8080",
        returnTo: "/profile",
      }),
    );
    const conflictRes = await fetch(`${origin}/orcid/callback?code=auth-code&state=${state}`, {
      redirect: "manual",
    });
    expect(conflictRes.status).toBe(302);
    expect(conflictRes.headers.get("location")).toBe(
      "http://localhost:8080/profile?orcid_error=already_linked",
    );
  });
});

