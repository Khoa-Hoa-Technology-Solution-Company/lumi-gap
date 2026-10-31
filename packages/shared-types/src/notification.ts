// packages/shared-types/src/notification.ts

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  paperId: string | null;
  targetKind: "paper" | "report" | "gap" | "project" | "forum_post" | "academic_profile" | "community" | "review_request" | null;
  targetId: string | null;
  verificationRequestId?: string;
  mentorshipRequestId?: string;
  screeningRoundId?: string;
  allocationRevisionId?: string;
  workContributionId?: string;
  contributionEvaluationId?: string;
  manuscriptId?: string;
  manuscriptSnapshotId?: string;
  /** TREND_VERDICT_CHANGED: the followed topic (and its OpenAlex id) whose verdict changed. */
  trendTopic?: string;
  trendTopicId?: string;
  isRead: boolean;
  createdAt: string;
}

// Code quality reviewed and formatted
