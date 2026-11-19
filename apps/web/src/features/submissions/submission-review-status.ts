import type {
  ResearchVersion,
  SubmissionHistory,
  SubmissionHistoryReviewRequest,
  SubmittedVersionReview,
} from "@trend/shared-types";

export type NormalizedReviewState =
  | "PENDING"
  | "IN_PROGRESS"
  | "REVISION_REQUESTED"
  | "FEEDBACK_SUBMITTED"
  | "COMPLETED"
  | "DECLINED"
  | "CANCELLED"
  | "EXPIRED"
  | "UNSENT";

export type ReviewStatusTone = "amber" | "blue" | "rose" | "indigo" | "emerald" | "slate";

export interface ReviewStatusPresentation {
  state: NormalizedReviewState;
  label: string;
  tone: ReviewStatusTone;
  isActiveOpen: boolean;
  needsRevision: boolean;
  hasFeedback: boolean;
  isUnavailable: boolean;
}

export interface VersionMentorThread {
  key: string;
  reviewerId?: string;
  reviewerName: string;
  request?: SubmissionHistoryReviewRequest;
  reviews: SubmittedVersionReview[];
  latestReview?: SubmittedVersionReview;
  status: ReviewStatusPresentation;
  sentAt?: string;
}

export interface VersionReviewContext {
  threads: VersionMentorThread[];
  activeThread?: VersionMentorThread;
  versionStatus: ReviewStatusPresentation;
  hasOpenReviewOnCurrentVersion: boolean;
  allMentorsBusyOnCurrentVersion: boolean;
  summaryText: string;
}

const SUBMISSION_TYPE_LABELS: Record<string, string> = {
  RESEARCH_PROPOSAL: "Đề cương nghiên cứu",
  LITERATURE_REVIEW: "Tổng quan tài liệu",
  RESEARCH_GAP: "Khoảng trống nghiên cứu",
  METHODOLOGY: "Phương pháp nghiên cứu",
  THESIS_CHAPTER: "Chương luận văn",
  THESIS_DRAFT: "Bản thảo luận văn",
  RESEARCH_PAPER: "Bài báo nghiên cứu",
  SOFTWARE_RESEARCH_PROJECT: "Dự án phần mềm nghiên cứu",
  TECHNICAL_REPORT: "Báo cáo nghiên cứu",
  THESIS: "Khóa luận / Luận văn",
  PRESENTATION: "Bài trình chiếu",
  OTHER: "Tài liệu nghiên cứu",
};

export function formatSubmissionTypeLabel(type?: string | null): string {
  if (!type) return "Bản thảo";
  return SUBMISSION_TYPE_LABELS[type] ?? type.replaceAll("_", " ");
}

export function formatReviewVerdictLabel(assessment?: string | null): string {
  if (!assessment) return "Đã gửi góp ý";
  const norm = assessment.toUpperCase();
  if (norm === "REVISION_REQUESTED" || norm === "MAJOR_REVISION" || norm === "MINOR_REVISION" || norm === "NEEDS_REVISION") {
    return "Cần chỉnh sửa";
  }
  if (norm === "READY_TO_ADVANCE" || norm === "STRONG" || norm === "ADEQUATE") {
    return "Có thể tiếp tục (nội bộ)";
  }
  if (norm === "COMMENT_ONLY" || norm === "FEEDBACK_GIVEN") {
    return "Đã gửi góp ý";
  }
  if (norm === "MAJOR_ISSUES") {
    return "Cần chỉnh sửa trọng tâm";
  }
  return "Đã gửi góp ý";
}

export function normalizeReviewStatus(params: {
  requestStatus?: string | null;
  latestReview?: SubmittedVersionReview | null;
  submissionStatus?: string | null;
  hasAssignedMentor?: boolean;
}): ReviewStatusPresentation {
  const req = params.requestStatus?.toUpperCase();
  const review = params.latestReview;
  const assessment = review?.overallAssessment?.toUpperCase();

  // 1. Authoritative ReviewRequest status (Single Source of Truth when present)
  if (req) {
    if (req === "REVISION_REQUESTED") {
      return {
        state: "REVISION_REQUESTED",
        label: "Cần chỉnh sửa",
        tone: "rose",
        isActiveOpen: false,
        needsRevision: true,
        hasFeedback: Boolean(review),
        isUnavailable: false,
      };
    }
    if (req === "COMPLETED") {
      return {
        state: "COMPLETED",
        label: "Đã hoàn tất góp ý",
        tone: "emerald",
        isActiveOpen: false,
        needsRevision: false,
        hasFeedback: Boolean(review),
        isUnavailable: false,
      };
    }
    if (req === "ACCEPTED") {
      return { state: "PENDING", label: "Giảng viên đã nhận yêu cầu", tone: "amber", isActiveOpen: true, needsRevision: false, hasFeedback: Boolean(review), isUnavailable: false };
    }
    if (req === "IN_REVIEW" || req === "RESUBMITTED") {
      return {
        state: "IN_PROGRESS",
        label: "Giảng viên đang đánh giá",
        tone: "blue",
        isActiveOpen: true,
        needsRevision: false,
        hasFeedback: Boolean(review),
        isUnavailable: false,
      };
    }
    if (req === "REQUESTED") {
      return {
        state: "PENDING",
        label: "Chờ giảng viên phản hồi",
        tone: "amber",
        isActiveOpen: true,
        needsRevision: false,
        hasFeedback: Boolean(review),
        isUnavailable: false,
      };
    }
    if (req === "DECLINED") {
      return {
        state: "DECLINED",
        label: "Giảng viên đã từ chối",
        tone: "slate",
        isActiveOpen: false,
        needsRevision: false,
        hasFeedback: Boolean(review),
        isUnavailable: true,
      };
    }
    if (req === "CANCELLED") {
      return {
        state: "CANCELLED",
        label: "Yêu cầu đã hủy",
        tone: "slate",
        isActiveOpen: false,
        needsRevision: false,
        hasFeedback: Boolean(review),
        isUnavailable: true,
      };
    }
    if (req === "EXPIRED") {
      return {
        state: "EXPIRED",
        label: "Yêu cầu đã hết hạn",
        tone: "slate",
        isActiveOpen: false,
        needsRevision: false,
        hasFeedback: Boolean(review),
        isUnavailable: true,
      };
    }
  }

  // 2. Submitted HumanReview on this version (even if request row is historical/legacy)
  if (review) {
    if (
      assessment === "REVISION_REQUESTED" ||
      assessment === "MAJOR_REVISION" ||
      assessment === "MINOR_REVISION"
    ) {
      return {
        state: "REVISION_REQUESTED",
        label: "Cần chỉnh sửa",
        tone: "rose",
        isActiveOpen: false,
        needsRevision: true,
        hasFeedback: true,
        isUnavailable: false,
      };
    }
    return {
      state: "FEEDBACK_SUBMITTED",
      label: "Đã có góp ý",
      tone: "indigo",
      isActiveOpen: false,
      needsRevision: false,
      hasFeedback: true,
      isUnavailable: false,
    };
  }

  // 3. Fallback to submission status ONLY if no review request / review exists on this version
  const sub = params.submissionStatus?.toLowerCase();
  if (sub === "revision_requested") {
    return {
      state: "REVISION_REQUESTED",
      label: "Cần chỉnh sửa",
      tone: "rose",
      isActiveOpen: false,
      needsRevision: true,
      hasFeedback: false,
      isUnavailable: false,
    };
  }
  if (sub === "under_review") {
    return {
      state: "IN_PROGRESS",
      label: "Giảng viên đang đánh giá",
      tone: "blue",
      isActiveOpen: true,
      needsRevision: false,
      hasFeedback: false,
      isUnavailable: false,
    };
  }
  if (sub === "waiting_feedback" || (params.hasAssignedMentor && (sub === "submitted" || sub === "revised"))) {
    return {
      state: "PENDING",
      label: "Chờ giảng viên phản hồi",
      tone: "amber",
      isActiveOpen: true,
      needsRevision: false,
      hasFeedback: false,
      isUnavailable: false,
    };
  }
  if (sub === "feedback_received") {
    return {
      state: "FEEDBACK_SUBMITTED",
      label: "Đã có góp ý",
      tone: "indigo",
      isActiveOpen: false,
      needsRevision: false,
      hasFeedback: false,
      isUnavailable: false,
    };
  }
  if (sub === "ready_to_advance" || sub === "completed") {
    return {
      state: "COMPLETED",
      label: "Đã hoàn tất góp ý",
      tone: "emerald",
      isActiveOpen: false,
      needsRevision: false,
      hasFeedback: false,
      isUnavailable: false,
    };
  }

  return {
    state: "UNSENT",
    label: "Chưa gửi góp ý",
    tone: "slate",
    isActiveOpen: false,
    needsRevision: false,
    hasFeedback: false,
    isUnavailable: false,
  };
}

type TranslateReview = (key: string, values?: Record<string, string | number>) => string;
const interpolateReview: TranslateReview = (key, values) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? ""));

function buildSummarySentence(versionNumber: number, thread?: VersionMentorThread, totalThreads = 0, t: TranslateReview = interpolateReview): string {
  if (!thread) {
    return t("Phiên bản v{{version}} đã được lưu. Chưa gửi yêu cầu góp ý cho giảng viên.", { version: versionNumber });
  }
  const values = { mentor: thread.reviewerName, version: versionNumber };
  const multiPrefix = totalThreads > 1 ? t("({{count}} giảng viên) ", { count: totalThreads }) : "";
  switch (thread.status.state) {
    case "PENDING":
      return multiPrefix + t("Đã gửi bản v{{version}} cho {{mentor}}. Giảng viên chưa gửi phản hồi.", values);
    case "IN_PROGRESS":
      return multiPrefix + t("Đã gửi bản v{{version}} cho {{mentor}}. Giảng viên đang đánh giá bản thảo.", values);
    case "REVISION_REQUESTED":
      return multiPrefix + t("{{mentor}} đã đề nghị chỉnh sửa cho bản v{{version}}. Hãy xem góp ý và chuẩn bị phiên bản mới.", values);
    case "FEEDBACK_SUBMITTED":
      return multiPrefix + t("{{mentor}} đã gửi góp ý cho bản v{{version}}.", values);
    case "COMPLETED":
      return multiPrefix + t("Vòng góp ý nội bộ với {{mentor}} cho bản v{{version}} đã hoàn tất.", values);
    case "DECLINED":
      return multiPrefix + t("{{mentor}} đã từ chối yêu cầu góp ý bản v{{version}}.", values);
    case "CANCELLED":
      return multiPrefix + t("Yêu cầu góp ý bản v{{version}} gửi đến {{mentor}} đã được hủy.", values);
    case "EXPIRED":
      return multiPrefix + t("Yêu cầu góp ý bản v{{version}} gửi đến {{mentor}} đã hết hạn.", values);
    default:
      return t("Phiên bản v{{version}} chưa có yêu cầu góp ý đang hoạt động.", values);
  }
}

export function resolveVersionReviewContext(params: {
  submissionStatus: string;
  history?: SubmissionHistory;
  version: ResearchVersion;
  isCurrentVersion: boolean;
  selectedMentorKey?: string;
  translate?: TranslateReview;
}): VersionReviewContext {
  const { submissionStatus, history, version, isCurrentVersion, selectedMentorKey } = params;
  const allRequests = (history?.reviewRequests ?? []).filter(request => !request.origin || request.origin === "MENTOR_GUIDANCE");

  // Requests targeting this exact version
  const versionRequests = allRequests.filter(
    (req) =>
      (req.revisionId && req.revisionId === version.id) ||
      (!req.revisionId && req.revisionNumber === version.revisionNumber),
  );

  // Build deduplicated mentor threads for this version
  const threadMap = new Map<string, {
    reviewerId?: string;
    reviewerName: string;
    request?: SubmissionHistoryReviewRequest;
    reviews: SubmittedVersionReview[];
  }>();

  const keyFor = (reviewerId: string | undefined, reviewerName: string, fallbackId: string) =>
    reviewerId || reviewerName.trim().toLowerCase() || fallbackId;

  // A retried/new invitation supersedes an older cancelled request from the same mentor.
  for (const req of [...versionRequests].sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))) {
    const key = keyFor(req.reviewerId, req.reviewerName, req.id);
    const existing = threadMap.get(key);
    if (!existing) {
      threadMap.set(key, {
        reviewerId: req.reviewerId,
        reviewerName: req.reviewerName,
        request: req,
        reviews: [],
      });
    } else if (!existing.request) {
      existing.request = req;
    }
  }

  for (const rev of version.reviews ?? []) {
    if (rev.requestId && history?.reviewRequests?.some(request => request.id === rev.requestId && request.origin && request.origin !== "MENTOR_GUIDANCE")) continue;
    const key = keyFor(rev.reviewerId, rev.reviewerName, rev.id);
    const existing = threadMap.get(key);
    if (existing) {
      existing.reviews.push(rev);
    } else {
      // Check if an outer request exists by requestId (e.g. a multi-round request now pointing to v2, while this review is on v1)
      const linkedReq = rev.requestId ? allRequests.find((r) => r.id === rev.requestId) : undefined;
      threadMap.set(key, {
        reviewerId: rev.reviewerId,
        reviewerName: rev.reviewerName,
        request: linkedReq && (linkedReq.revisionId ? linkedReq.revisionId === version.id : linkedReq.revisionNumber === version.revisionNumber) ? linkedReq : undefined,
        reviews: [rev],
      });
    }
  }

  // Fallback for legacy submissions that have assignedMentor on current version without a ReviewRequest row
  if (threadMap.size === 0 && isCurrentVersion && history?.assignedMentor) {
    const mentor = history.assignedMentor;
    threadMap.set(mentor.id, {
      reviewerId: mentor.id,
      reviewerName: mentor.fullName,
      reviews: [],
    });
  }

  const threads: VersionMentorThread[] = Array.from(threadMap.entries()).map(([key, entry]) => {
    entry.reviews.sort((a, b) => a.roundNumber - b.roundNumber || Date.parse(a.submittedAt ?? "") - Date.parse(b.submittedAt ?? ""));
    const latestReview = entry.reviews.at(-1);
    const status = normalizeReviewStatus({
      requestStatus: entry.request?.status,
      latestReview,
      submissionStatus: isCurrentVersion ? submissionStatus : undefined,
      hasAssignedMentor: Boolean(history?.assignedMentor),
    });
    return {
      key,
      reviewerId: entry.reviewerId,
      reviewerName: entry.reviewerName,
      request: entry.request,
      reviews: entry.reviews,
      latestReview,
      status,
      sentAt: entry.request?.createdAt && Date.parse(entry.request.createdAt) > Date.parse(version.createdAt) ? entry.request.createdAt : version.createdAt,
    };
  });

  // Sort threads: feedback/revision requested first, then active review, then others
  const priority = (t: VersionMentorThread) => {
    if (t.status.state === "REVISION_REQUESTED") return 0;
    if (t.status.hasFeedback) return 1;
    if (t.status.isActiveOpen) return 2;
    return 3;
  };
  threads.sort((a, b) => priority(a) - priority(b));

  const activeThread =
    (selectedMentorKey ? threads.find((t) => t.key === selectedMentorKey) : undefined) ??
    threads[0];

  const versionStatus =
    activeThread?.status ??
    normalizeReviewStatus({
      submissionStatus: isCurrentVersion ? submissionStatus : undefined,
      hasAssignedMentor: Boolean(history?.assignedMentor),
    });

  // Check open reviews on the CURRENT (latest) version across all requests
  const currentRequests = allRequests.filter(
    (req) =>
      (req.revisionId && req.revisionId === history?.currentRevisionId) ||
      (!req.revisionId && req.revisionNumber === history?.currentRevisionNumber),
  );
  const openCurrentRequests = currentRequests.filter((req) =>
    ["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(req.status.toUpperCase()),
  );
  const hasOpenReviewOnCurrentVersion = openCurrentRequests.length > 0;
  const allMentorsBusyOnCurrentVersion =
    currentRequests.length > 0 && openCurrentRequests.length === currentRequests.length;

  return {
    threads,
    activeThread,
    versionStatus,
    hasOpenReviewOnCurrentVersion,
    allMentorsBusyOnCurrentVersion,
    summaryText: buildSummarySentence(version.revisionNumber, activeThread, threads.length, params.translate),
  };
}

export type PrimaryActionKind =
  | "OPEN_MENTOR_REVIEW"
  | "CONTINUE_EDITING"
  | "SEND_NEXT_VERSION"
  | "PREPARE_UPDATE"
  | "SEND_TO_MENTOR"
  | "NONE";

export interface PrimaryActionPlan {
  kind: PrimaryActionKind;
  label: string;
  secondaryEditLink: boolean;
  sendBlockedNotice?: string;
}

export function resolveSubmissionPrimaryAction(params: {
  readOnly: boolean;
  canProvideFeedback: boolean;
  canRevise: boolean;
  hasEditableSource: boolean;
  hasAssignedMentor: boolean;
  status: ReviewStatusPresentation;
  hasOpenReviewOnCurrentVersion: boolean;
  currentRevisionNumber: number;
  translate?: TranslateReview;
}): PrimaryActionPlan {
  if (params.readOnly) {
    return { kind: "NONE", label: "", secondaryEditLink: false };
  }

  // Mentor viewing this submission
  if (params.canProvideFeedback) {
    return {
      kind: "OPEN_MENTOR_REVIEW",
      label: "Mở không gian góp ý",
      secondaryEditLink: false,
    };
  }

  if (!params.canRevise) {
    return { kind: "NONE", label: "", secondaryEditLink: false };
  }

  // State 1: Revision requested -> main job is to submit revised version (or edit first if LumiGap manuscript)
  if (params.status.state === "REVISION_REQUESTED") {
    return {
      kind: "SEND_NEXT_VERSION",
      label: "Gửi phiên bản mới để góp ý",
      secondaryEditLink: params.hasEditableSource,
    };
  }

  // State 2: Active pending / in-progress review on current version
  if (params.status.isActiveOpen || params.hasOpenReviewOnCurrentVersion) {
    if (params.hasEditableSource) {
      return {
        kind: "CONTINUE_EDITING",
        label: "Tiếp tục chỉnh sửa",
        secondaryEditLink: false,
        sendBlockedNotice: (params.translate ?? interpolateReview)("Bản v{{version}} có yêu cầu góp ý đang mở. Chỉnh sửa bản làm việc sẽ không ảnh hưởng tới bản v{{version}} đã gửi.", { version: params.currentRevisionNumber }),
      };
    }
    return {
      kind: "PREPARE_UPDATE",
      label: "Chuẩn bị bản cập nhật",
      secondaryEditLink: false,
      sendBlockedNotice: (params.translate ?? interpolateReview)("Bản v{{version}} có yêu cầu góp ý đang mở và sẽ không bị thay đổi hay tự hủy. Bạn có thể gửi bản mới sau khi giảng viên hoàn tất góp ý hoặc gửi tới cố vấn khác.", { version: params.currentRevisionNumber }),
    };
  }

  // State 3: Feedback submitted or review completed
  if (params.status.state === "FEEDBACK_SUBMITTED" || params.status.state === "COMPLETED") {
    if (params.hasEditableSource) {
      return {
        kind: "CONTINUE_EDITING",
        label: "Tiếp tục chỉnh sửa",
        secondaryEditLink: false,
      };
    }
    return {
      kind: "SEND_NEXT_VERSION",
      label: "Gửi phiên bản mới để góp ý",
      secondaryEditLink: false,
    };
  }

  // State 4: Unsent / Declined / Cancelled / Expired
  if (params.hasAssignedMentor || params.status.isUnavailable) {
    return {
      kind: "SEND_NEXT_VERSION",
      label: "Gửi giảng viên góp ý",
      secondaryEditLink: params.hasEditableSource,
    };
  }

  return {
    kind: "SEND_TO_MENTOR",
    label: "Gửi giảng viên góp ý",
    secondaryEditLink: params.hasEditableSource,
  };
}
