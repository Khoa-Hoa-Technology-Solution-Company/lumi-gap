import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ topic: vi.fn(), overview: vi.fn() }));
vi.mock("../../../config/env.js", () => ({ env: { TREND_READ_MAX_PER_MINUTE: 2, TREND_EXPLAIN_MAX_PER_HOUR: 5, RATE_LIMIT_STORE: "memory" } }));
vi.mock("../../../infrastructure/redis.js", () => ({ redis: {} }));
vi.mock("../../../common/middleware/auth.js", () => ({
  optionalAuth: (req: any, _res: unknown, next: () => void) => { const user = req.headers["x-test-user"]; if (user) req.user = { sub: user }; next(); },
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../trend.controller.js", () => ({
  trendController: new Proxy({}, { get: (_target, name) => (_req: unknown, res: any) => { (name === "topic" ? mocks.topic : mocks.overview)(); res.json({ success: true, data: {} }); } }),
}));

import { trendRouter } from "../trend.routes.js";

const app = express();
app.use("/trends", trendRouter);
const server = createServer(app);
let origin: string;
beforeAll(async () => { server.listen(0, "127.0.0.1"); await once(server, "listening"); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/trends`; });
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });

it("throttles public trend reads that spend OpenAlex credits, per account when signed in", async () => {
  const get = (path: string, user?: string) => fetch(origin + path, { headers: user ? { "x-test-user": user } : {} });
  expect((await get("/Topic%20Modeling")).status).toBe(200);
  expect((await get("/compare?topics=a,b")).status).toBe(200);
  const limited = await get("/");
  expect(limited.status).toBe(429);
  expect(await limited.json()).toMatchObject({ success: false, error: { code: "TOO_MANY_REQUESTS" } });
  // Another signed-in account behind the same IP keeps its own budget.
  expect((await get("/Topic%20Modeling", "user-b")).status).toBe(200);
  expect(mocks.topic).toHaveBeenCalledTimes(2);
});
