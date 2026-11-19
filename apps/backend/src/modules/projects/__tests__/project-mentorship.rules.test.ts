import { describe, expect, it } from "vitest";
import {
  canAcceptMentorRelationship,
  canEndMentorRelationship,
  canViewMentorRelationship,
} from "../project-mentorship.rules.js";
import { requestMentorshipInfoSchema } from "../project-mentorship.controller.js";
import { buildMentorshipMail } from "../mentorship-mail.service.js";

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

  it("validates lecturer clarification notes via requestMentorshipInfoSchema", () => {
    expect(requestMentorshipInfoSchema.safeParse({ note: "abc" }).success).toBe(false);
    expect(requestMentorshipInfoSchema.safeParse({ note: "  Please clarify methodology  " }).success).toBe(true);
    expect(requestMentorshipInfoSchema.safeParse({ note: "Clarify scope", extra: true }).success).toBe(false);
  });

  it("builds MENTORSHIP_INFO_REQUESTED mail targeting project support tab", () => {
    const mail = buildMentorshipMail(
      {
        event: "MENTORSHIP_INFO_REQUESTED",
        projectId: "6ab33f15-3780-2fe3-0d38-753b00000001",
        projectTitle: "AI Vulnerability Detection",
        actorName: "Dr. Tran",
      },
      "Nguyen An",
      "vi",
      "https://lumigap.example",
    );
    expect(mail.subject).toContain("Dr. Tran");
    expect(mail.text).toContain("https://lumigap.example/projects/6ab33f15-3780-2fe3-0d38-753b00000001?tab=support");
  });
});
