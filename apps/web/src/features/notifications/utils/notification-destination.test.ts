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
});
