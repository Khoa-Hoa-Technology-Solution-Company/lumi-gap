import { describe, expect, it } from "vitest";
import {
  canAcceptMentorRelationship,
  canEndMentorRelationship,
  canViewMentorRelationship,
} from "../project-mentorship.rules.js";

describe("project mentorship rules", () => {
  it("keeps mentorship visibility explicit and project-scoped", () => {
    expect(canViewMentorRelationship({
      actorId: "member",
      mentorUserId: "lecturer",
      requestedBy: "student",
      actorHasProjectAccess: true,
    })).toBe(true);
    expect(canViewMentorRelationship({
      actorId: "lecturer",
      mentorUserId: "lecturer",
      requestedBy: "student",
      actorHasProjectAccess: false,
    })).toBe(true);
    expect(canViewMentorRelationship({
      actorId: "unrelated",
      mentorUserId: "lecturer",
      requestedBy: "student",
      actorHasProjectAccess: false,
    })).toBe(false);
  });

  it("does not allow a pending Lecturer without MENTOR_PROJECT to accept mentorship", () => {
    expect(canAcceptMentorRelationship({
      actorId: "lecturer",
      mentorUserId: "lecturer",
      status: "PENDING",
      hasMentorCapability: false,
    })).toBe(false);
  });

  it("allows the requested verified Lecturer to accept a pending mentorship request", () => {
    expect(canAcceptMentorRelationship({
      actorId: "lecturer",
      mentorUserId: "lecturer",
      status: "PENDING",
      hasMentorCapability: true,
    })).toBe(true);
    expect(canAcceptMentorRelationship({
      actorId: "other-lecturer",
      mentorUserId: "lecturer",
      status: "PENDING",
      hasMentorCapability: true,
    })).toBe(false);
  });

  it("preserves mentorship history by ending rather than deleting accepted relationships", () => {
    expect(canEndMentorRelationship({
      actorId: "owner",
      mentorUserId: "lecturer",
      requestedBy: "student",
      projectOwnerId: "owner",
      status: "ACTIVE",
    })).toBe(true);
    expect(canEndMentorRelationship({
      actorId: "owner",
      mentorUserId: "lecturer",
      requestedBy: "student",
      projectOwnerId: "owner",
      status: "PENDING",
    })).toBe(false);
  });
});
