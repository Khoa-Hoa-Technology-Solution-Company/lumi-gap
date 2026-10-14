import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listCapabilities: vi.fn() }));

vi.mock("../capability.service.js", () => ({ capabilityService: { list: mocks.listCapabilities } }));
vi.mock("../research-access.service.js", () => ({ assertResearchWorkflowAccess: vi.fn() }));

import { requireCapability } from "../authorization.middleware.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("requireCapability", () => {
  beforeEach(() => vi.clearAllMocks());

  const run = async (systemRole = "USER") => {
    const req = { user: { sub: USER_ID, systemRole } } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    await requireCapability("STRUCTURED_REVIEW")(req, {} as Response, next);
    return { req, next };
  };

  it("looks the capabilities up itself and lets a holder through", async () => {
    mocks.listCapabilities.mockResolvedValue(["BASIC_RESEARCH", "STRUCTURED_REVIEW"]);

    const { req, next } = await run();

    expect(mocks.listCapabilities).toHaveBeenCalledWith(USER_ID);
    expect(next).toHaveBeenCalledWith();
    expect(req.user?.capabilities).toEqual(["BASIC_RESEARCH", "STRUCTURED_REVIEW"]);
  });

  it("blocks a user who lacks the capability", async () => {
    mocks.listCapabilities.mockResolvedValue(["BASIC_RESEARCH"]);

    const { next } = await run();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "AUTHORIZATION_CAPABILITY_REQUIRED" }));
  });

  it("lets an administrator through without a lookup", async () => {
    const { next } = await run("ADMIN");

    expect(next).toHaveBeenCalledWith();
    expect(mocks.listCapabilities).not.toHaveBeenCalled();
  });
});
