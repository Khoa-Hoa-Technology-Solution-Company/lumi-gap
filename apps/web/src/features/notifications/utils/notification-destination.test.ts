import { describe, expect, it } from "vitest";
import { getNotificationDestination } from "./notification-destination";

describe("getNotificationDestination", () => {
  it("routes Lecturer verification events to private status and Admin review to the authorized queue", () => {
    expect(getNotificationDestination({ type: "LECTURER_VERIFICATION_SUBMITTED", targetKind: null, targetId: null }, false)).toBe("/settings/verification/lecturer");
    expect(getNotificationDestination({ type: "LECTURER_VERIFICATION_REVIEW_REQUESTED", targetKind: null, targetId: null }, true)).toBe("/admin/academic-verifications");
    expect(getNotificationDestination({ type: "LECTURER_VERIFICATION_REVIEW_REQUESTED", targetKind: null, targetId: null }, false)).toBeNull();
  });
  it("opens the exact Lecturer request for the applicant or administrator", () => {
    const notification = { type: "LECTURER_VERIFICATION_SUPPLEMENTED", targetKind: null, targetId: null, verificationRequestId: "request/1?other=value" };
    expect(getNotificationDestination(notification, false)).toBe("/settings/verification/lecturer?requestId=request%2F1%3Fother%3Dvalue");
    expect(getNotificationDestination({ ...notification, type: "LECTURER_VERIFICATION_REVIEW_REQUESTED" }, true)).toBe("/admin/academic-verifications?requestId=request%2F1%3Fother%3Dvalue");
    expect(getNotificationDestination({ ...notification, type: "LECTURER_VERIFICATION_REVIEW_REQUESTED" }, false)).toBeNull();
  });
  it.each(["MENTORSHIP_REQUEST_CREATED", "MENTORSHIP_OFFER_CREATED", "MENTORSHIP_ACCEPTED", "MENTORSHIP_DECLINED", "MENTORSHIP_CANCELLED", "MENTORSHIP_ENDED"])("routes %s to Academic Support", type => {
    expect(getNotificationDestination({ type, targetKind: "project", targetId: "project/one" }, false)).toBe("/academic-support?projectId=project%2Fone");
  });
  it.each(["academic_verification_submitted", "academic_verification_more_info", "academic_verification_approved", "academic_verification_rejected"])("routes %s to private settings", type => {
    expect(getNotificationDestination({ type, targetKind: "academic_profile", targetId: "profile" }, false)).toBe("/settings/academic");
  });
  it.each(["REVIEW_REQUESTED", "REVIEW_REQUEST_CANCELLED", "REVIEW_REQUEST_ACCEPTED", "REVIEW_REQUEST_DECLINED", "REVISION_RESUBMITTED"])("routes %s to Review Center", type => {
    expect(getNotificationDestination({ type, targetKind: "project", targetId: "project" }, false)).toBe("/reviews");
  });
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

  it.each(["affiliation_request_submitted", "affiliation_verified", "affiliation_rejected", "affiliation_needs_more_information"])("routes %s to the authenticated verification settings", (type) => {
    expect(getNotificationDestination({ type, targetKind: "academic_profile", targetId: "profile-id" }, false)).toBe("/settings/academic");
  });
  it("encodes resource IDs so they cannot alter the destination path", () => {
    expect(getNotificationDestination({ type: "FORUM_REPLY", targetKind: "forum_post", targetId: "post/1?tab=other" }, false)).toBe("/forum/post%2F1%3Ftab%3Dother");
  });
});
