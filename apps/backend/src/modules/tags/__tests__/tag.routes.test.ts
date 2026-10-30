import { describe, expect, it, vi } from "vitest";

vi.mock("../../../common/middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireSystemRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../tag.controller.js", () => {
  const handler = () => undefined;
  return {
    tagController: new Proxy({}, { get: () => handler }),
  };
});

import { tagRouter } from "../tag.routes.js";

interface Layer { route?: { path: string; methods: Record<string, boolean> } }

function routes(): Array<{ method: string; path: string }> {
  return (tagRouter as unknown as { stack: Layer[] }).stack.flatMap((layer) => (layer.route
    ? Object.keys(layer.route.methods).map((method) => ({ method, path: layer.route!.path }))
    : []));
}

describe("tag routes", () => {
  it("declares the static apply-all route before any /:id route", () => {
    const list = routes();
    const applyAll = list.findIndex((r) => r.method === "post" && r.path === "/apply-all");
    const firstParam = list.findIndex((r) => r.path.startsWith("/:id"));
    expect(applyAll).toBeGreaterThanOrEqual(0);
    expect(applyAll).toBeLessThan(firstParam);
  });

  it("exposes the apply and curation endpoints", () => {
    const list = routes().map((r) => `${r.method} ${r.path}`);
    expect(list).toEqual(expect.arrayContaining([
      "post /:id/apply",
      "get /:id/papers",
      "post /:id/papers",
      "delete /:id/papers/:paperId",
      "post /:id/papers/:paperId/unblock",
    ]));
  });
});
