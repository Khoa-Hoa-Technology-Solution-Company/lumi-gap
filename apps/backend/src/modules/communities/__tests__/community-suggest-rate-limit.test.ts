import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "../../../config/env.js";

const suggest = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("../community.service.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../community.service.js")>();
  return { ...original, communityService: { ...original.communityService, suggest } };
});
// Importing the router must not open real queue connections.
vi.mock("../../../infrastructure/queue.js", () => ({ embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

describe("GET /communities/suggestions rate limit", () => {
  let server: import("node:http").Server;
  let baseUrl = "";

  beforeAll(async () => {
    const { communityRouter } = await import("../community.routes.js");
    const app = express();
    app.use("/communities", communityRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("answers 429 once an anonymous caller exceeds the per-minute cap", async () => {
    const limit = env.COMMUNITY_SUGGEST_MAX_PER_MINUTE;
    for (let i = 0; i < limit; i += 1) {
      const ok = await fetch(`${baseUrl}/communities/suggestions?q=ab`);
      expect(ok.status).toBe(200);
    }
    const blocked = await fetch(`${baseUrl}/communities/suggestions?q=ab`);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ success: false, error: { code: "TOO_MANY_REQUESTS" } });
    expect(suggest).toHaveBeenCalledTimes(limit);
  });
});
