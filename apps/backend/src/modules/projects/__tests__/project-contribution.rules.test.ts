import { describe, expect, it } from "vitest";
import {
  canResolveContribution,
  contributionConfirmationParty,
  isProjectMember,
  isProjectOwner,
} from "../project-contribution.rules.js";

const project = {
  ownerId: "owner-1",
  members: [
    { targetId: "owner-1", role: "owner" as const },
    { targetId: "owner-2", role: "owner" as const },
    { targetId: "member-1", role: "member" as const },
  ],
};

describe("project contribution confirmation rules", () => {
  it("distinguishes project membership from ownership", () => {
    expect(isProjectMember(project, "member-1")).toBe(true);
    expect(isProjectOwner(project, "member-1")).toBe(false);
    expect(isProjectOwner(project, "owner-2")).toBe(true);
    expect(isProjectMember(project, "outside")).toBe(false);
  });

  it("requires an owner to confirm a self-proposed contribution", () => {
    expect(contributionConfirmationParty("member-1", "member-1")).toBe("OWNER");
    expect(canResolveContribution({
      requiredFrom: "OWNER",
      actorId: "owner-1",
      proposerId: "member-1",
      contributorId: "member-1",
      actorIsOwner: true,
    })).toBe(true);
    expect(canResolveContribution({
      requiredFrom: "OWNER",
      actorId: "member-1",
      proposerId: "member-1",
      contributorId: "member-1",
      actorIsOwner: false,
    })).toBe(false);
  });

  it("requires the named contributor to confirm an owner proposal", () => {
    expect(contributionConfirmationParty("owner-1", "member-1")).toBe("CONTRIBUTOR");
    expect(canResolveContribution({
      requiredFrom: "CONTRIBUTOR",
      actorId: "member-1",
      proposerId: "owner-1",
      contributorId: "member-1",
      actorIsOwner: false,
    })).toBe(true);
    expect(canResolveContribution({
      requiredFrom: "CONTRIBUTOR",
      actorId: "owner-2",
      proposerId: "owner-1",
      contributorId: "member-1",
      actorIsOwner: true,
    })).toBe(false);
  });

  it("never allows a proposer to confirm the same proposal", () => {
    expect(canResolveContribution({
      requiredFrom: "OWNER",
      actorId: "owner-1",
      proposerId: "owner-1",
      contributorId: "owner-1",
      actorIsOwner: true,
    })).toBe(false);
  });

  it("allows a separate verified academic approver to resolve eligible project contributions", () => {
    expect(canResolveContribution({
      requiredFrom: "CONTRIBUTOR",
      actorId: "lecturer-1",
      proposerId: "owner-1",
      contributorId: "member-1",
      actorIsOwner: false,
      actorHasAcademicApproval: true,
    })).toBe(true);
    expect(canResolveContribution({
      requiredFrom: "CONTRIBUTOR",
      actorId: "lecturer-1",
      proposerId: "owner-1",
      contributorId: "member-1",
      actorIsOwner: false,
      actorHasAcademicApproval: false,
    })).toBe(false);
  });
});
