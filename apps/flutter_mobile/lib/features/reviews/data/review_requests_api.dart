import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/core/utils/json_read.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';

/// Statuses the web Review Center groups (review-dashboard.tsx).
const reviewActiveStatuses = {
  'ACCEPTED',
  'IN_REVIEW',
  'RESUBMITTED',
  'REVISION_REQUESTED',
};
const reviewFinalStatuses = {'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED'};

/// Days a request without a due date stays open (backend
/// DEFAULT_REVIEW_WINDOW_DAYS, also used by the web).
const defaultReviewWindowDays = 30;

/// "IN_REVIEW" → "In review": the web shows the code with spaces; here it is
/// a translated label.
String reviewStatusLabel(String status) => switch (status) {
      'REQUESTED' => tk('Requested'),
      'ACCEPTED' => tk('Accepted'),
      'IN_REVIEW' => tk('In review'),
      'REVISION_REQUESTED' => tk('Revision requested'),
      'RESUBMITTED' => tk('Resubmitted'),
      'COMPLETED' => tk('Completed'),
      'DECLINED' => tk('Declined'),
      'CANCELLED' => tk('Cancelled'),
      'EXPIRED' => tk('Expired'),
      _ => tk('In progress'),
    };

class ReviewPerson {
  const ReviewPerson({required this.id, required this.fullName, this.institution});
  factory ReviewPerson.fromJson(Json j) => ReviewPerson(
        id: jId(j),
        fullName: jStr(j['fullName']) ?? trNow('Unnamed researcher'),
        institution: jStr(j['institution']),
      );
  final String id;
  final String fullName;
  final String? institution;
}

class RequiredRevision {
  const RequiredRevision({
    required this.priority,
    required this.description,
    required this.status,
  });
  factory RequiredRevision.fromJson(Json j) => RequiredRevision(
        priority: jStr(j['priority']) ?? 'MINOR',
        description: jStr(j['description']) ?? '',
        status: jStr(j['status']) ?? 'OPEN',
      );
  final String priority;
  final String description;
  final String status;
}

/// One review round (a draft is only sent to its own reviewer).
class ReviewRound {
  const ReviewRound({
    required this.roundNumber,
    required this.status,
    this.overallAssessment,
    this.submittedAt,
    this.keyStrengths,
    this.keyConcerns,
    this.overallComment,
    this.requiredRevisions = const [],
  });
  factory ReviewRound.fromJson(Json j) => ReviewRound(
        roundNumber: jInt(j['roundNumber'], 1),
        status: jStr(j['status']) ?? 'DRAFT',
        overallAssessment: jStr(j['overallAssessment']),
        submittedAt: jDate(j['submittedAt']),
        keyStrengths: jStr(j['keyStrengths']),
        keyConcerns: jStr(j['keyConcerns']),
        overallComment: jStr(j['overallComment']),
        requiredRevisions:
            jMaps(j['requiredRevisions']).map(RequiredRevision.fromJson).toList(),
      );
  final int roundNumber;
  final String status;
  final String? overallAssessment;
  final DateTime? submittedAt;
  final String? keyStrengths;
  final String? keyConcerns;
  final String? overallComment;
  final List<RequiredRevision> requiredRevisions;
}

/// A review request as the Review Center lists it (review-request.service
/// `summary`); [rounds] only come with the detail.
class ReviewRequest {
  const ReviewRequest({
    required this.id,
    required this.status,
    required this.title,
    required this.requester,
    required this.reviewer,
    required this.assignmentId,
    required this.revisionNumber,
    required this.createdAt,
    this.artifactType,
    this.message,
    this.dueAt,
    this.latestRound,
    this.latestRoundStatus,
    this.mentorRelationshipActive = false,
    this.rounds = const [],
  });

  factory ReviewRequest.fromJson(Json j) {
    final artifact = jMap(j['artifact']);
    final latest = jMap(j['latestReview']);
    return ReviewRequest(
      id: jId(j),
      status: jStr(j['status']) ?? 'REQUESTED',
      title: jStr(artifact['title']) ?? trNow('Research artifact'),
      artifactType: jStr(artifact['type']),
      revisionNumber: jInt(artifact['revisionNumber'], 1),
      requester: ReviewPerson.fromJson(jMap(j['requester'])),
      reviewer: ReviewPerson.fromJson(jMap(j['reviewer'])),
      assignmentId: jId(jMap(j['assignment'])),
      message: jStr(j['message']),
      dueAt: jDate(j['dueAt']),
      createdAt: jDate(j['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
      latestRound: latest.isEmpty ? null : jInt(latest['roundNumber'], 1),
      latestRoundStatus: latest.isEmpty ? null : jStr(latest['status']),
      mentorRelationshipActive: jBool(j['mentorRelationshipActive']),
      rounds: jMaps(j['reviews']).map(ReviewRound.fromJson).toList(),
    );
  }

  final String id;
  final String status;
  final String title;
  final String? artifactType;
  final int revisionNumber;
  final ReviewPerson requester;
  final ReviewPerson reviewer;
  final String assignmentId;
  final String? message;
  final DateTime? dueAt;
  final DateTime createdAt;
  final int? latestRound;
  final String? latestRoundStatus;
  final bool mentorRelationshipActive;
  final List<ReviewRound> rounds;

  /// "PAPER_DRAFT" → "PAPER DRAFT", like the web badge; "Research artifact"
  /// when the type is unknown. Not translated: it is the artifact's kind code.
  String? get typeLabel => artifactType?.replaceAll('_', ' ');

  /// The reviewer may still withdraw: accepted, and no round submitted yet
  /// (web `canWithdraw`; backend `canReviewerDeclineRequest`).
  bool get canWithdraw =>
      (status == 'ACCEPTED' || status == 'IN_REVIEW') &&
      (latestRound == null ||
          (latestRoundStatus == 'DRAFT' && latestRound == 1));

  /// When an accepted review counts as overdue (due date, or 30 days).
  DateTime get deadline =>
      dueAt ?? createdAt.add(const Duration(days: defaultReviewWindowDays));

  /// The requester may cancel before acceptance, or once an accepted review
  /// is overdue (web review-request-detail `canCancel`).
  bool requesterCanCancel(DateTime now) =>
      status == 'REQUESTED' ||
      ((status == 'ACCEPTED' || status == 'IN_REVIEW') && deadline.isBefore(now));
}

class ReviewCenter {
  const ReviewCenter({required this.incoming, required this.sent});
  final List<ReviewRequest> incoming;
  final List<ReviewRequest> sent;
}

enum ReviewTab { incoming, sent, progress, completed }

/// The rows of one Review Center tab, as the web filters them.
List<ReviewRequest> reviewTabItems(ReviewCenter c, ReviewTab tab) {
  switch (tab) {
    case ReviewTab.incoming:
      return [for (final r in c.incoming) if (r.status == 'REQUESTED') r];
    case ReviewTab.sent:
      return [for (final r in c.sent) if (!reviewFinalStatuses.contains(r.status)) r];
    case ReviewTab.progress:
      return [for (final r in c.incoming) if (reviewActiveStatuses.contains(r.status)) r];
    case ReviewTab.completed:
      // A request can be in both lists (sent to myself is not possible, but
      // the web still merges by id): keep the first one.
      final seen = <String>{};
      return [
        for (final r in [...c.incoming, ...c.sent])
          if (reviewFinalStatuses.contains(r.status) && seen.add(r.id)) r,
      ];
  }
}

class ReviewRequestsApi {
  const ReviewRequestsApi(this._dio);
  final Dio _dio;

  Future<ReviewCenter> center() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.reviewRequests);
    final data = jMap(jMap(res.data)['data']);
    return ReviewCenter(
      incoming: jMaps(data['incoming']).map(ReviewRequest.fromJson).toList(),
      sent: jMaps(data['sent']).map(ReviewRequest.fromJson).toList(),
    );
  }

  Future<ReviewRequest> detail(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.reviewRequest(id));
    return ReviewRequest.fromJson(jMap(jMap(res.data)['data']));
  }

  Future<void> accept(String id) =>
      _dio.post<void>(ApiRoutes.reviewRequestAction(id, 'accept'));

  /// Declines a new request, or withdraws from an accepted one.
  Future<void> decline(String id, {String? reason}) => _dio.post<void>(
        ApiRoutes.reviewRequestAction(id, 'decline'),
        data: {'reason': ?reason},
      );

  Future<void> cancel(String id) =>
      _dio.post<void>(ApiRoutes.reviewRequestAction(id, 'cancel'));

  /// Web `useVerifiedLecturer`: only a verified lecturer may act on review
  /// requests (the API checks it again).
  Future<bool> isVerifiedLecturer() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.academicProfileMe);
    final p = jMap(jMap(res.data)['data']);
    return jStr(p['academicRole']) == 'LECTURER' &&
        jStr(p['academicRoleVerificationStatus']) == 'VERIFIED' &&
        jStr(jMap(p['verificationStatuses'])['position']) == 'VERIFIED';
  }
}

final reviewRequestsApiProvider = Provider<ReviewRequestsApi>(
  (ref) => ReviewRequestsApi(ref.watch(apiClientProvider).dio),
);

final FutureProvider<ReviewCenter> reviewCenterProvider =
    FutureProvider.autoDispose<ReviewCenter>(
  (ref) => ref.watch(reviewRequestsApiProvider).center(),
);

final FutureProviderFamily<ReviewRequest, String> reviewRequestProvider =
    FutureProvider.autoDispose.family<ReviewRequest, String>(
  (ref, id) => ref.watch(reviewRequestsApiProvider).detail(id),
);

/// False while unknown or on error: no review actions are offered then.
final FutureProvider<bool> canReviewProvider = FutureProvider.autoDispose<bool>(
  (ref) async {
    try {
      return await ref.watch(reviewRequestsApiProvider).isVerifiedLecturer();
    } on Object catch (_) {
      return false;
    }
  },
);
