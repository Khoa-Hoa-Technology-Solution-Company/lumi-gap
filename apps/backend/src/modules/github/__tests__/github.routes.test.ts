import express, { type ErrorRequestHandler } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { ZodError } from "zod";
const mocks = vi.hoisted(() => ({ status: vi.fn(), start: vi.fn(), complete: vi.fn(), repositories: vi.fn(), request: vi.fn(), disconnect: vi.fn(), authenticated: true }));
vi.mock("../github.service.js", () => ({ githubService: mocks }));
vi.mock("../../../common/middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: () => void) => { if (!mocks.authenticated) return res.status(401).end(); req.user = { sub: "authenticated-user", sessionId: "original-session" }; next(); } }));
vi.mock("../../../common/middleware/rate-limit.js", () => ({ createRateLimiter: () => (_req: any, _res: any, next: () => void) => next() }));
import { githubRouter } from "../github.routes.js";
const app = express(); app.use(express.json()); app.use("/github", githubRouter);
app.use(((error, _req, res, _next) => res.status(error instanceof ZodError ? 400 : error.statusCode ?? 500).json({ success: false })) as ErrorRequestHandler);
const server = createServer(app); let origin: string;
beforeAll(async () => { server.listen(0, "127.0.0.1"); await once(server, "listening"); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/github`; });
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { vi.clearAllMocks(); mocks.authenticated = true; });
const post = (path: string, body: unknown) => fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
it("requires LumiGap authentication for status, callback completion and repository operations", async () => {
  mocks.authenticated = false;
  expect((await fetch(origin)).status).toBe(401); expect((await post("/complete", {})).status).toBe(401); expect((await post("/repository", {})).status).toBe(401); expect(mocks.complete).not.toHaveBeenCalled();
});
it("binds completion to the current user/session and marks connection responses private", async () => {
  mocks.complete.mockResolvedValue({ returnTo: "/projects/6ab33f1537802fe30d38753b?tab=manuscripts" });
  const state = "a".repeat(43), response = await post("/complete", { state, code: "synthetic-code" });
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(mocks.complete).toHaveBeenCalledWith("authenticated-user", "original-session", "synthetic-code", state);
  expect((await post("/complete", { state, code: "code", userId: "attacker" })).status).toBe(400);
});
it("rejects hostile destinations and force updates before reaching the service", async () => {
  expect((await post("/start", { returnTo: "https://evil.test" })).status).toBe(400);
  expect((await post("/repository", { repository: "team/paper", method: "PATCH", path: "/git/refs/heads/main", body: { sha: "a".repeat(40), force: true } })).status).toBe(400); expect(mocks.request).not.toHaveBeenCalled();
  mocks.repositories.mockResolvedValue({ repositories: [], page: 1, hasMore: false }); expect((await fetch(origin + "/repositories")).status).toBe(200); expect(mocks.repositories).toHaveBeenCalledWith("authenticated-user", 1);
});
