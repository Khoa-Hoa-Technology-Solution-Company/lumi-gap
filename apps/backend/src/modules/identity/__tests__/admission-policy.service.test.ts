import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  institutionDomain: { findUnique: vi.fn() },
  institution: { findUnique: vi.fn() },
  projectInvitation: { findFirst: vi.fn() },
  externalReviewInvitation: { findFirst: vi.fn() },
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks }));

import { admissionPolicyService } from "../admission-policy.service.js";

describe("personal email and institutional admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.institutionDomain.findUnique.mockResolvedValue(null);
    mocks.projectInvitation.findFirst.mockResolvedValue(null);
    mocks.externalReviewInvitation.findFirst.mockResolvedValue(null);
  });

  it("allows self-registration for a configured host-institution domain", async () => {
    mocks.institutionDomain.findUnique.mockResolvedValue({ institutionId: "fpt", trusted: true, status: "ACTIVE" });
    mocks.institution.findUnique.mockResolvedValue({ hostInstitution: true, status: "ACTIVE", isActive: true });
    await expect(admissionPolicyService.evaluateRegistration("STUDENT@fpt.edu.vn"))
      .resolves.toEqual({ basis: "HOST_INSTITUTION" });
  });

  it("admits personal email with public access and no automatic affiliation", async () => {
    await expect(admissionPolicyService.evaluateRegistration("researcher@example.edu"))
      .resolves.toEqual({ basis: "PERSONAL_EMAIL" });
  });

  it("admits an external participant only with a valid pending invitation", async () => {
    mocks.projectInvitation.findFirst.mockResolvedValue({ id: "invite-1" });
    await expect(admissionPolicyService.evaluateRegistration(
      "researcher@example.edu", "valid_external_invitation_token_1234567890",
    )).resolves.toEqual({ basis: "INVITATION", sourceId: "invite-1" });
    expect(mocks.projectInvitation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING" }),
    }));
  });

  it("allows a different login identity when the invitation token is valid", async () => {
    mocks.projectInvitation.findFirst.mockResolvedValue({ id: "invite-2", email: "invited@example.edu" });
    await expect(admissionPolicyService.evaluateRegistration(
      "personal@gmail.com", "valid_external_invitation_token_abcdefghij",
    )).resolves.toEqual({ basis: "INVITATION", sourceId: "invite-2" });
    expect(mocks.projectInvitation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ email: "personal@gmail.com" }),
    }));
  });

  it("admits an external reviewer with a valid pending review invitation token", async () => {
    mocks.externalReviewInvitation.findFirst.mockResolvedValue({ id: "review-invite-1" });

    await expect(admissionPolicyService.evaluateRegistration(
      "lecturer@example.edu", "valid_external_review_invitation_token_1234567890",
    )).resolves.toEqual({ basis: "INVITATION", sourceId: "review-invite-1" });
    expect(mocks.externalReviewInvitation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING" }),
    }));
  });
});

