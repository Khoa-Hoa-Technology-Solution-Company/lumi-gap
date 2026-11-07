import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../../common/middleware/error-handler.js";

const mocks = vi.hoisted(() => ({ forYou: vi.fn() }));
vi.mock("../../../common/middleware/auth.js", () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => { req.user = { sub: "user-1", role: "user" }; next(); },
}));
vi.mock("../personalization.service.js", () => ({ personalizationService: { forYou: mocks.forYou } }));

import { personalizationRouter } from "../personalization.routes.js";

/** Test 1: the real router with the real Zod query schema, the real error handler, and a stubbed service. */
describe("GET /personalization/for-you limit", () => {
  let server: import("node:http").Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.use("/personalization", personalizationRouter);
    app.use(errorHandler);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); });
  beforeEach(() => { mocks.forYou.mockReset().mockResolvedValue({ postsBasis: "none", papersBasis: "none", posts: [], papers: [] }); });

  const get = (query: string) => fetch(`${baseUrl}/personalization/for-you${query}`);

  it("rejects an out-of-range, non-integer, empty, signed, exponent, padded, repeated or unknown limit with 400 and never calls the service", async () => {
    for (const query of ["?limit=4", "?limit=21", "?limit=0", "?limit=-5", "?limit=abc", "?limit=5.5", "?limit=", "?limit=%2B6", "?limit=1e1", "?limit=%207", "?limit=0x10", "?limit=5&limit=6", "?limit=5&limit=5", "?limit=5&extra=1", "?limit%5B%5D=5"]) {
      const response = await get(query);
      expect(response.status, query).toBe(400);
      expect(((await response.json()) as { success: boolean }).success, query).toBe(false);
    }
    expect(mocks.forYou).not.toHaveBeenCalled();
  });

  it("uses 5 when limit is absent and passes a valid limit through unchanged", async () => {
    expect((await get("")).status).toBe(200);
    expect(mocks.forYou).toHaveBeenLastCalledWith("user-1", "user", 5);
    for (const limit of [5, 12, 20]) {
      expect((await get(`?limit=${limit}`)).status).toBe(200);
      expect(mocks.forYou).toHaveBeenLastCalledWith("user-1", "user", limit);
    }
  });
});
