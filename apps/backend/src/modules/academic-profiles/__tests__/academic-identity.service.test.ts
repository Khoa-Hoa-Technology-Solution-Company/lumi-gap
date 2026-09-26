import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcademicIdentityLink } from "@trend/shared-types";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    academicIdentityLink: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  auditLog: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.auditLog } }));

import { academicIdentityService, visibleAcademicIdentityLinks } from "../academic-identity.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const IDENTITY_ID = "22222222-2222-4222-8222-222222222222";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date("2026-09-26T00:00:00.000Z");
  return {
    id: IDENTITY_ID,
    userId: USER_ID,
    provider: "ORCID",
    label: null,
    identifier: "0000-0002-1825-0097",
    profileUrl: null,
    connectionMethod: "MANUAL",
    status: "SELF_DECLARED",
    visibility: "PUBLIC",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("academicIdentityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ id: USER_ID, accountStatus: "ACTIVE" });
  });

  it("lists and maps persisted identity links", async () => {
    mocks.prisma.academicIdentityLink.findMany.mockResolvedValue([row({ label: "ORCID profile" })]);

    await expect(academicIdentityService.list(USER_ID)).resolves.toEqual([expect.objectContaining({
      id: IDENTITY_ID,
      provider: "ORCID",
      label: "ORCID profile",
      identifier: "0000-0002-1825-0097",
      status: "SELF_DECLARED",
    })]);
  });

  it("sanitizes labels and never accepts client trust fields on create", async () => {
    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValue(null);
    mocks.prisma.academicIdentityLink.create.mockResolvedValue(row({ label: "University Profile" }));

    await academicIdentityService.create(USER_ID, {
      provider: "OTHER",
      label: "  University\n\tProfile  ",
      profileUrl: "https://example.edu/researchers/ada",
      visibility: "PRIVATE",
    });

    expect(mocks.prisma.academicIdentityLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "OTHER",
        label: "University Profile",
        profileUrl: "https://example.edu/researchers/ada",
        connectionMethod: "MANUAL",
        status: "SELF_DECLARED",
        visibility: "PRIVATE",
      }),
    });
  });

  it("rejects duplicates and unsupported URL schemes at the service boundary", async () => {
    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValue(row());
    await expect(academicIdentityService.create(USER_ID, {
      provider: "ORCID",
      identifier: "0000-0002-1825-0097",
      visibility: "PUBLIC",
    })).rejects.toThrow("already linked");

    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValue(null);
    await expect(academicIdentityService.create(USER_ID, {
      provider: "OTHER",
      label: "Profile",
      identifier: "javascript:alert(1)",
      visibility: "PUBLIC",
    })).rejects.toThrow("unsupported URL schemes");
  });

  it("enforces ownership and resets trusted state when the identity value changes", async () => {
    mocks.prisma.academicIdentityLink.findUnique.mockResolvedValue(row({ userId: OTHER_USER_ID, status: "LINKED", connectionMethod: "SYSTEM" }));
    await expect(academicIdentityService.update(USER_ID, IDENTITY_ID, { visibility: "PRIVATE" })).rejects.toThrow("not found");
    expect(mocks.prisma.academicIdentityLink.update).not.toHaveBeenCalled();

    mocks.prisma.academicIdentityLink.findUnique.mockResolvedValue(row({ status: "LINKED", connectionMethod: "SYSTEM" }));
    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValue(null);
    mocks.prisma.academicIdentityLink.update.mockResolvedValue(row({ identifier: "0000-0002-1825-0097", status: "SELF_DECLARED", connectionMethod: "MANUAL" }));

    await academicIdentityService.update(USER_ID, IDENTITY_ID, { label: "Updated label" });
    const labelOnlyUpdate = mocks.prisma.academicIdentityLink.update.mock.calls.at(-1)?.[0];
    expect(labelOnlyUpdate.data).not.toHaveProperty("status");
    expect(labelOnlyUpdate.data).not.toHaveProperty("connectionMethod");

    mocks.prisma.academicIdentityLink.findUnique.mockResolvedValue(row({ status: "LINKED", connectionMethod: "SYSTEM" }));
    mocks.prisma.academicIdentityLink.update.mockResolvedValue(row({ identifier: "0000-0002-1694-233X", status: "SELF_DECLARED", connectionMethod: "MANUAL" }));
    await academicIdentityService.update(USER_ID, IDENTITY_ID, { identifier: "0000-0002-1694-233X" });
    expect(mocks.prisma.academicIdentityLink.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "SELF_DECLARED", connectionMethod: "MANUAL" }),
    }));
  });

  it("deletes an owned identity and records the deletion", async () => {
    mocks.prisma.academicIdentityLink.findUnique.mockResolvedValue(row());

    await expect(academicIdentityService.remove(USER_ID, IDENTITY_ID)).resolves.toBeUndefined();

    expect(mocks.prisma.academicIdentityLink.delete).toHaveBeenCalledWith({ where: { id: IDENTITY_ID } });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      "academic_profile.identity.deleted",
      expect.objectContaining({ userId: USER_ID, targetRecordId: IDENTITY_ID }),
    );

    mocks.prisma.academicIdentityLink.findUnique.mockResolvedValue(row({ userId: OTHER_USER_ID }));
    await expect(academicIdentityService.remove(USER_ID, IDENTITY_ID)).rejects.toThrow("not found");
    expect(mocks.prisma.academicIdentityLink.delete).toHaveBeenCalledTimes(1);
  });

  it("filters public visibility without leaking private links", () => {
    const links = [
      { id: "public", visibility: "PUBLIC" },
      { id: "members", visibility: "REGISTERED_USERS" },
      { id: "private", visibility: "PRIVATE" },
    ] as unknown as AcademicIdentityLink[];

    expect(visibleAcademicIdentityLinks(links, undefined, USER_ID).map((link) => link.id)).toEqual(["public"]);
    expect(visibleAcademicIdentityLinks(links, OTHER_USER_ID, USER_ID).map((link) => link.id)).toEqual(["public", "members"]);
    expect(visibleAcademicIdentityLinks(links, USER_ID, USER_ID).map((link) => link.id)).toEqual(["public", "members", "private"]);
  });
});
