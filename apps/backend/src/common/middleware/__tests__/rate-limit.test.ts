import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRateLimiter } from "../rate-limit.js";

const failingStore = {
  init: () => undefined,
  increment: async () => { throw new Error("store down"); },
  decrement: async () => undefined,
  resetKey: async () => undefined,
};

describe("createRateLimiter", () => {
  let server: import("node:http").Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.get("/limited", createRateLimiter("test:limited", { windowMs: 60_000, limit: 2, keyGenerator: () => "same-caller" }), (_req, res) => { res.json({ ok: true }); });
    app.get("/store-down", createRateLimiter("test:store-down", { windowMs: 60_000, limit: 1, keyGenerator: () => "same-caller", store: failingStore }), (_req, res) => { res.json({ ok: true }); });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("uses the in-memory store by default and answers 429 on request limit + 1", async () => {
    expect((await fetch(`${baseUrl}/limited`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/limited`)).status).toBe(200);
    const blocked = await fetch(`${baseUrl}/limited`);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("ratelimit-limit") ?? blocked.headers.get("ratelimit")).not.toBeNull();
  });

  it("lets requests through when the store fails instead of returning a 500", async () => {
    for (let i = 0; i < 3; i += 1) expect((await fetch(`${baseUrl}/store-down`)).status).toBe(200);
  });
});
