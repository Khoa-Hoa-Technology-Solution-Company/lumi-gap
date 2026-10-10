import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireSystemRole } from "../../../common/middleware/auth.js";

describe("academic verification authorization", () => {
  it("rejects a normal user at the admin verification boundary", () => {
    const middleware = requireSystemRole("ADMIN");
    const next = vi.fn() as NextFunction;
    middleware({ user: { sub: "user-1", email: "user@example.test", role: "user", systemRole: "USER" } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("allows an admin through the verification boundary", () => {
    const middleware = requireSystemRole("ADMIN");
    const next = vi.fn() as NextFunction;
    middleware({ user: { sub: "admin-1", email: "admin@example.test", role: "admin", systemRole: "ADMIN" } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
  it("does not treat a legacy forum moderator role as academic verification authority", () => {
    const next = vi.fn() as NextFunction;
    requireSystemRole("ADMIN")({ user: { sub: "moderator-1", email: "moderator@example.test", role: "moderator", systemRole: "USER" } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("allows the distinct ADMIN system role to review academic verification", () => {
    const middleware = requireSystemRole("ADMIN");
    const next = vi.fn() as NextFunction;
    middleware({ user: { sub: "super-1", email: "super@example.test", role: "admin", systemRole: "ADMIN" } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
