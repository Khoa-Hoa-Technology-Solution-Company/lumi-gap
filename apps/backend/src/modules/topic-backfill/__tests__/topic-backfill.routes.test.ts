import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requestFromSearch: vi.fn(), requestFromAdmin: vi.fn(), getRun: vi.fn(), listRuns: vi.fn(),
  limiters: [] as Array<{ name: string; options: Record<string, unknown> }>,
}));

const USER = "00000000-0000-4000-8000-0000000000c1";
const ADMIN = "00000000-0000-4000-8000-0000000000c2";
const TARGET = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-0000000000f1";

vi.mock("../../../config/env.js", () => ({ env: { TOPIC_BACKFILL_USER_MAX_PER_HOUR: 5 } }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../../common/middleware/rate-limit.js", () => ({
  createRateLimiter: (name: string, options: Record<string, unknown>) => {
    m.limiters.push({ name, options });
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
}));
vi.mock("../topic-backfill.service.js", () => ({
  topicBackfillService: {
    requestFromSearch: m.requestFromSearch, requestFromAdmin: m.requestFromAdmin, getRun: m.getRun, listRuns: m.listRuns,
  },
}));
// The real requireAuth / requireSystemRole run; only their collaborators are replaced.
vi.mock("../../auth/token.service.js", () => ({
  tokenService: {
    verifyAccessToken: (token: string) => {
      if (token === "user-token") return { sub: USER, systemRole: "USER", sessionId: "s1" };
      if (token === "admin-token") return { sub: ADMIN, systemRole: "ADMIN", sessionId: "s2" };
      throw Object.assign(new Error("bad token"), { statusCode: 401, code: "UNAUTHORIZED" });
    },
  },
}));
vi.mock("../../user-ai/user-ai.runtime.js", () => ({ withUserAi: (_id: string, run: () => unknown) => run() }));
vi.mock("../../authorization/research-access.service.js", () => ({ assertResearchWorkflowAccess: vi.fn() }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id, systemRole: where.id === ADMIN ? "ADMIN" : "USER", accountStatus: "ACTIVE", academicProfileType: null, isActive: true,
      }),
    },
    refreshToken: { findFirst: async () => ({ id: "rt" }) },
    academicProfile: { findUnique: async () => null },
  }),
}));

import { errorHandler } from "../../../common/middleware/error-handler.js";
import { adminTopicBackfillRouter, topicBackfillRouter } from "../topic-backfill.routes.js";

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/topic-backfill", topicBackfillRouter);
  app.use("/admin/topic-backfill", adminTopicBackfillRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => { server.close(() => resolve()); }));

const call = (method: string, path: string, token?: string, body?: unknown) => fetch(`${base}${path}`, {
  method,
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const run = { id: RUN, state: "queued" };

beforeEach(() => {
  m.requestFromSearch.mockReset().mockResolvedValue({ run, created: true });
  m.requestFromAdmin.mockReset().mockResolvedValue({ run, created: true });
  m.getRun.mockReset().mockResolvedValue(run);
  m.listRuns.mockReset().mockResolvedValue({ data: [run], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
});

describe("POST /topic-backfill", () => {
  const body = { targetKind: "topic", targetId: TARGET };

  it("needs a signed-in user", async () => {
    expect((await call("POST", "/topic-backfill", undefined, body)).status).toBe(401);
    expect((await call("POST", "/topic-backfill", "garbage", body)).status).toBe(401);
    expect(m.requestFromSearch).not.toHaveBeenCalled();
  });

  it("answers 202 with the envelope when a run was queued and 200 when it attached to one", async () => {
    const created = await call("POST", "/topic-backfill", "user-token", body);
    expect(created.status).toBe(202);
    expect(await created.json()).toEqual({ success: true, data: { run, created: true } });
    expect(m.requestFromSearch).toHaveBeenCalledWith(USER, body);

    m.requestFromSearch.mockResolvedValue({ run, created: false });
    expect((await call("POST", "/topic-backfill", "user-token", body)).status).toBe(200);
  });

  it("rejects a tag and other kinds before the service is reached", async () => {
    const response = await call("POST", "/topic-backfill", "user-token", { targetKind: "tag", targetId: TARGET });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
    expect((await call("POST", "/topic-backfill", "user-token", { targetKind: "topic", targetId: "nope" })).status).toBe(400);
    expect(m.requestFromSearch).not.toHaveBeenCalled();
  });

  it("surfaces the service's error code", async () => {
    const { AppError } = await import("../../../common/exceptions/app-error.js");
    m.requestFromSearch.mockRejectedValue(new AppError(409, "TOPIC_NOT_THIN", "enough"));
    const response = await call("POST", "/topic-backfill", "user-token", body);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("TOPIC_NOT_THIN");
  });

  it("is limited per user and per hour by TOPIC_BACKFILL_USER_MAX_PER_HOUR", () => {
    const limiter = m.limiters.find((entry) => entry.name === "topic-backfill-request");
    expect(limiter?.options).toMatchObject({ windowMs: 3600_000, limit: 5 });
    const key = limiter!.options.keyGenerator as (req: unknown) => string;
    expect(key({ user: { sub: USER }, ip: "1.2.3.4" })).toBe(USER);
  });
});

describe("GET /topic-backfill/runs/:id", () => {
  it("needs a signed-in user", async () => {
    expect((await call("GET", `/topic-backfill/runs/${RUN}`)).status).toBe(401);
  });

  it("shows ordinary users the public view and admins the admin view", async () => {
    const asUser = await call("GET", `/topic-backfill/runs/${RUN}`, "user-token");
    expect(asUser.status).toBe(200);
    expect(await asUser.json()).toEqual({ success: true, data: run });
    expect(m.getRun).toHaveBeenLastCalledWith(RUN, { isAdmin: false });

    await call("GET", `/topic-backfill/runs/${RUN}`, "admin-token");
    expect(m.getRun).toHaveBeenLastCalledWith(RUN, { isAdmin: true });
  });

  it("rejects a malformed id", async () => {
    expect((await call("GET", "/topic-backfill/runs/not-a-uuid", "user-token")).status).toBe(400);
  });
});

describe("admin routes", () => {
  const body = { targetKind: "tag", targetId: TARGET, maxNewPapers: 500 };

  it("401 without a token and 403 for a non-admin, on every admin route", async () => {
    for (const [method, path, payload] of [
      ["POST", "/admin/topic-backfill", body],
      ["GET", "/admin/topic-backfill/runs", undefined],
    ] as const) {
      expect((await call(method, path, undefined, payload)).status).toBe(401);
      expect((await call(method, path, "user-token", payload)).status).toBe(403);
    }
    expect(m.requestFromAdmin).not.toHaveBeenCalled();
    expect(m.listRuns).not.toHaveBeenCalled();
  });

  it("lets an admin queue a tag import with a budget", async () => {
    const response = await call("POST", "/admin/topic-backfill", "admin-token", body);
    expect(response.status).toBe(202);
    expect(m.requestFromAdmin).toHaveBeenCalledWith(ADMIN, body);

    m.requestFromAdmin.mockResolvedValue({ run, created: false });
    expect((await call("POST", "/admin/topic-backfill", "admin-token", body)).status).toBe(200);
  });

  it("validates the admin body", async () => {
    expect((await call("POST", "/admin/topic-backfill", "admin-token", { ...body, maxNewPapers: 0 })).status).toBe(400);
    expect((await call("POST", "/admin/topic-backfill", "admin-token", { ...body, targetKind: "author" })).status).toBe(400);
  });

  it("lists runs with filters and pagination meta", async () => {
    const response = await call("GET", `/admin/topic-backfill/runs?state=failed&targetKind=tag&targetId=${TARGET}&page=2&pageSize=10`, "admin-token");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: [run], meta: { total: 1 } });
    expect(m.listRuns).toHaveBeenCalledWith({ state: "failed", targetKind: "tag", targetId: TARGET, page: 2, pageSize: 10 });
    expect((await call("GET", "/admin/topic-backfill/runs?state=paused", "admin-token")).status).toBe(400);
  });
});
