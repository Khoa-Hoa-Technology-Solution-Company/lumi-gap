import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireRole } from "../../../common/middleware/auth.js";

describe("academic verification authorization", () => {
  it("rejects a normal user at the admin verification boundary", () => {
    const middleware = requireRole("admin");
    const next = vi.fn() as NextFunction;
    middleware({ user: { sub: "user-1", email: "user@example.test", role: "user" } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("allows an admin through the verification boundary", () => {
    const middleware = requireRole("admin");
    const next = vi.fn() as NextFunction;
    middleware({ user: { sub: "admin-1", email: "admin@example.test", role: "admin" } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
