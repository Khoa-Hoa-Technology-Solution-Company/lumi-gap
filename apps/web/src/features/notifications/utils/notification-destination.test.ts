import { describe, expect, it } from "vitest";
import { getNotificationDestination } from "./notification-destination";

describe("getNotificationDestination", () => {
  it("routes an admin pending submission to moderation", () => {
    expect(getNotificationDestination({ type: "submission_pending", targetKind: "paper", targetId: "paper-1" }, true)).toBe("/admin/papers");
  });

  it("routes a rejected author submission back to editing", () => {
    expect(getNotificationDestination({ type: "submission_rejected", targetKind: "paper", targetId: "paper-1" }, false)).toBe("/settings/submit-paper?edit=paper-1");
  });

  it("resolves supported resource targets", () => {
    expect(getNotificationDestination({ type: "project_update", targetKind: "project", targetId: "project-1" }, false)).toBe("/projects/project-1");
  });

  it.each([
    ["FORUM_REPORT_REVIEW", "Forum report needs review", "/admin/trust-safety?tab=reports&status=all"],
    ["FORUM_REPORT_ESCALATED", "Forum report escalated", "/admin/trust-safety?tab=reports&status=escalated"],
    ["FORUM_APPEAL_RECEIVED", "Moderation appeal received", "/admin/trust-safety?tab=appeals"],
    ["FORUM_COPYRIGHT_RECEIVED", "Copyright claim received", "/admin/trust-safety?tab=copyright"],
  ])("routes %s and existing generic alerts to the correct queue", (type, title, destination) => {
    expect(getNotificationDestination({ type, targetKind: null, targetId: null }, true)).toBe(destination);
    expect(getNotificationDestination({ type: "FORUM_MODERATION", title, targetKind: null, targetId: null }, true)).toBe(destination);
    expect(getNotificationDestination({ type, targetKind: null, targetId: null }, false)).toBeNull();
  });

  it("routes a personal appeal update to decisions even for an admin", () => {
    for (const isAdmin of [false, true]) {
      expect(getNotificationDestination({ type: "FORUM_MODERATION", title: "Appeal reviewed", targetKind: null, targetId: null }, isAdmin)).toBe("/forum/moderation");
    }
  });

  it("keeps moderation alerts with a discussion target on that discussion", () => {
    expect(getNotificationDestination({ type: "FORUM_MODERATION", targetKind: "forum_post", targetId: "post-1" }, true)).toBe("/forum/post-1");
  });

  it("recognizes the paper submission type emitted by the backend", () => {
    expect(getNotificationDestination({ type: "paper_submission", targetKind: "paper", targetId: "paper-1" }, true)).toBe("/admin/papers");
  });

  it("encodes resource IDs so they cannot alter the destination path", () => {
    expect(getNotificationDestination({ type: "FORUM_REPLY", targetKind: "forum_post", targetId: "post/1?tab=other" }, false)).toBe("/forum/post%2F1%3Ftab%3Dother");
  });
});
