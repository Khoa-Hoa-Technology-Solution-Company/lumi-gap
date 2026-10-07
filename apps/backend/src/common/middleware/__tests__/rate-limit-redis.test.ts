import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const call = vi.hoisted(() => vi.fn().mockRejectedValue(new Error("Connection is closed.")));
vi.mock("../../../infrastructure/redis.js", () => ({ redis: { call } }));
vi.mock("../../../config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../config/env.js")>();
  return { ...original, env: { ...original.env, RATE_LIMIT_STORE: "redis" } };
});

// A Redis outage at boot must not crash the process: vitest fails the run on any unhandled rejection.
describe("createRateLimiter with RATE_LIMIT_STORE=redis and Redis down", () => {
  let server: import("node:http").Server;
  let baseUrl = "";

  beforeAll(async () => {
    const { createRateLimiter } = await import("../rate-limit.js");
    const app = express();
    app.get("/x", createRateLimiter("test:redis-down", { windowMs: 60_000, limit: 1, keyGenerator: () => "caller" }), (_req, res) => { res.json({ ok: true }); });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Let the constructor's SCRIPT LOAD promises settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("builds the limiter without an unhandled rejection and lets requests through", async () => {
    expect(call).toHaveBeenCalled();
    for (let i = 0; i < 3; i += 1) expect((await fetch(`${baseUrl}/x`)).status).toBe(200);
  });
});
