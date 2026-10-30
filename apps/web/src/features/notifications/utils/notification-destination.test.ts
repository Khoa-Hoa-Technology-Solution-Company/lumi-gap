import { describe, expect, it } from "vitest";
import { getNotificationDestination } from "./notification-destination";

describe("getNotificationDestination", () => {
  it("opens evaluation notifications through the restricted input-review page", () => {
    expect(getNotificationDestination({ type: "PROJECT_CONTRIBUTION_UPDATE", targetKind: "project", targetId: "project/1", contributionEvaluationId: "evaluation/2" }, false)).toBe("/projects/project%2F1/contribution-review?evaluation=evaluation%2F2");
  });
  it("opens only the explicitly shared manuscript snapshot for a mentor", () => {
    expect(getNotificationDestination({ type: "MANUSCRIPT_FEEDBACK_REQUEST", targetKind: "project", targetId: "project/1", manuscriptId: "manuscript/2", manuscriptSnapshotId: "version/3" }, false)).toBe("/projects/project%2F1/manuscripts/manuscript%2F2?snapshot=version%2F3");
  });
  it("takes mentor gap requests to academic support and mentor replies to the team workspace", () => {
    expect(getNotificationDestination({ type: "PROJECT_WORKSPACE_GAP_GUIDANCE", targetKind: "project", targetId: "project/1" }, false)).toBe("/academic-support?projectId=project%2F1&section=gaps");
    expect(getNotificationDestination({ type: "PROJECT_WORKSPACE_MENTOR_FEEDBACK", targetKind: "project", targetId: "project-1" }, false)).toBe("/projects/project-1?tab=overview");
  });
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

  it("sends project invitees to the project list where they can accept or decline", () => {
    expect(getNotificationDestination({ type: "project_invitation", targetKind: "project", targetId: "project-1" }, false)).toBe("/projects");
  });

  it("sends reviewers to the review center instead of a project they are not in", () => {
    expect(getNotificationDestination({ type: "REVIEW_REQUESTED", targetKind: "project", targetId: "project-1" }, false)).toBe("/reviews");
    expect(getNotificationDestination({ type: "REVISION_RESUBMITTED", targetKind: "project", targetId: "project-1" }, false)).toBe("/reviews");
    expect(getNotificationDestination({ type: "REVIEW_REQUEST_CANCELLED", targetKind: "review_request", targetId: "request-1" }, false)).toBe("/reviews");
  });

  it("opens the review feedback page when the notification targets a review request", () => {
    expect(getNotificationDestination({ type: "REVIEW_SUBMITTED", targetKind: "review_request", targetId: "request-1" }, false)).toBe("/review-requests/request-1");
    expect(getNotificationDestination({ type: "REVIEW_REQUEST_DECLINED", targetKind: "review_request", targetId: "request-1" }, false)).toBe("/review-requests/request-1");
  });

  it("sends review requesters of older project-targeted notifications to the project's artifacts tab", () => {
    expect(getNotificationDestination({ type: "REVIEW_SUBMITTED", targetKind: "project", targetId: "project-1" }, false)).toBe("/projects/project-1?tab=reports");
    expect(getNotificationDestination({ type: "REVISION_REQUESTED", targetKind: "project", targetId: "project-1" }, false)).toBe("/projects/project-1?tab=reports");
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
it("routes allocation notifications to exact restricted revisions and named work to record review", () => {
  expect(getNotificationDestination({ type: "PROJECT_ALLOCATION_UPDATE", targetKind: "project", targetId: "p", allocationRevisionId: "r" }, false)).toBe("/projects/p/allocation?revision=r");
  expect(getNotificationDestination({ type: "PROJECT_CONTRIBUTION_UPDATE", targetKind: "project", targetId: "p", workContributionId: "c" }, false)).toBe("/projects/p/contribution-review?record=c");
});
