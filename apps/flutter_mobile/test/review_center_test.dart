import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/reviews/data/review_requests_api.dart';
import 'package:flutter_mobile/features/reviews/presentation/review_center_screen.dart';
import 'package:flutter_mobile/features/reviews/presentation/review_request_screen.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';
import 'support/community_fakes.dart';
import 'support/pump_screen.dart';

class _Api extends Fake implements ReviewRequestsApi {
  _Api(this.data);
  ReviewCenter data;
  final List<String> accepted = [];
  final List<(String, String?)> declined = [];
  final List<String> cancelled = [];
  Object? error;
  Completer<void>? gate;

  @override
  Future<ReviewCenter> center() async => data;

  @override
  Future<ReviewRequest> detail(String id) async =>
      [...data.incoming, ...data.sent].firstWhere((r) => r.id == id);

  @override
  Future<void> accept(String id) async {
    accepted.add(id);
    await gate?.future;
    // ignore: only_throw_errors, the test injects what the API may throw
    if (error != null) throw error!;
  }

  @override
  Future<void> decline(String id, {String? reason}) async {
    declined.add((id, reason));
    // ignore: only_throw_errors, the test injects what the API may throw
    if (error != null) throw error!;
  }

  @override
  Future<void> cancel(String id) async => cancelled.add(id);
}

Future<_Api> _pump(WidgetTester tester, Widget screen, ReviewCenter data, {bool canReview = true}) async {
  final api = _Api(data);
  await pumpScreen(tester, screen, overrides: [
    reviewRequestsApiProvider.overrideWithValue(api),
    canReviewProvider.overrideWith((ref) async => canReview),
  ]);
  return api;
}

void main() {
  group('rules shared with the web', () {
    final now = DateTime.utc(2026, 11, 16);

    test('tabs group requests by status, completed ones merged by id', () {
      final c = ReviewCenter(
        incoming: [
          sampleReview(),
          sampleReview(status: 'IN_REVIEW'),
          sampleReview(status: 'COMPLETED'),
        ],
        sent: [
          sampleReview(status: 'ACCEPTED', requester: 'u1', reviewer: 'u5'),
          sampleReview(status: 'COMPLETED', requester: 'u1', reviewer: 'u5'),
        ],
      );
      expect(reviewTabItems(c, ReviewTab.incoming).map((r) => r.status), ['REQUESTED']);
      expect(reviewTabItems(c, ReviewTab.progress).map((r) => r.status), ['IN_REVIEW']);
      expect(reviewTabItems(c, ReviewTab.sent).map((r) => r.status), ['ACCEPTED']);
      // Same id on both lists (fixture ids are per status): counted once.
      expect(reviewTabItems(c, ReviewTab.completed), hasLength(1));
    });

    test('withdrawing is possible only before a round is submitted', () {
      expect(sampleReview(status: 'ACCEPTED').canWithdraw, isTrue);
      expect(sampleReview(status: 'IN_REVIEW', latest: {'roundNumber': 1, 'status': 'DRAFT'}).canWithdraw, isTrue);
      expect(sampleReview(status: 'IN_REVIEW', latest: {'roundNumber': 1, 'status': 'SUBMITTED'}).canWithdraw, isFalse);
      expect(sampleReview(status: 'IN_REVIEW', latest: {'roundNumber': 2, 'status': 'DRAFT'}).canWithdraw, isFalse);
      expect(sampleReview().canWithdraw, isFalse, reason: 'not accepted yet: that is declining');
    });

    test('the requester may cancel before acceptance or once overdue', () {
      expect(sampleReview().requesterCanCancel(now), isTrue);
      final dueLater = sampleReview(status: 'ACCEPTED', dueAt: DateTime.utc(2026, 12));
      expect(dueLater.requesterCanCancel(now), isFalse);
      final overdue = sampleReview(status: 'ACCEPTED', dueAt: DateTime.utc(2026, 11, 10));
      expect(overdue.requesterCanCancel(now), isTrue);
      // No due date: 30 days after the request (created Nov 1 → Dec 1).
      expect(sampleReview(status: 'IN_REVIEW').requesterCanCancel(now), isFalse);
      expect(sampleReview(status: 'IN_REVIEW').requesterCanCancel(DateTime.utc(2026, 12, 2)), isTrue);
      expect(sampleReview(status: 'COMPLETED').requesterCanCancel(DateTime.utc(2027)), isFalse);
    });
  });

  testWidgets('accepting is sent once, then the request shows under In Progress', (tester) async {
    final api = await _pump(tester, const ReviewCenterScreen(), ReviewCenter(incoming: [sampleReview()], sent: const []));
    api.gate = Completer<void>();
    await tester.tap(find.widgetWithText(FilledButton, 'Accept'));
    await tester.pump();
    // A tap on the locked button neither sends again nor opens the card.
    await tester.tap(find.widgetWithText(FilledButton, 'Updating…'), warnIfMissed: false);
    await tester.pump();
    expect(find.textContaining('route:'), findsNothing);
    api
      ..data = ReviewCenter(incoming: [sampleReview(status: 'ACCEPTED')], sent: const [])
      ..gate!.complete();
    await tester.pumpAndSettle();
    expect(api.accepted, ['rr-REQUESTED']);
    expect(find.text('Review request accepted'), findsOneWidget);
    expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'In progress 1')).selected, isTrue);
  });

  testWidgets('without a verified lecturer position no answer is offered', (tester) async {
    await _pump(tester, const ReviewCenterScreen(), ReviewCenter(incoming: [sampleReview()], sent: const []), canReview: false);
    expect(find.text(longTitle), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Accept'), findsNothing);
    expect(find.widgetWithText(OutlinedButton, 'Decline'), findsNothing);
  });

  testWidgets('declining sends the optional reason; keeping it sends nothing', (tester) async {
    final api = await _pump(tester, const ReviewCenterScreen(), ReviewCenter(incoming: [sampleReview()], sent: const []));
    await tester.tap(find.widgetWithText(OutlinedButton, 'Decline'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep request'));
    await tester.pumpAndSettle();
    expect(api.declined, isEmpty);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Decline'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '  Workload  ');
    await tester.tap(find.text('Decline request'));
    await tester.pumpAndSettle();
    expect(api.declined, [('rr-REQUESTED', 'Workload')]);
    expect(find.text('Review request declined'), findsOneWidget);
  });

  testWidgets('withdrawing after a submitted round is refused with the reason', (tester) async {
    final api = await _pump(tester, const ReviewCenterScreen(), ReviewCenter(incoming: [sampleReview(status: 'ACCEPTED')], sent: const []));
    api.error = httpFailure(409);
    // The tab row scrolls sideways; the third tab starts off screen.
    await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'In progress 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'In progress 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Withdraw'));
    await tester.pumpAndSettle();
    expect(find.text('Withdraw from this review?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Withdraw'));
    await tester.pumpAndSettle();
    expect(find.textContaining('you can no longer withdraw'), findsOneWidget);
  });

  testWidgets('the requester sees why an accepted request cannot be cancelled', (tester) async {
    final r = sampleReview(status: 'ACCEPTED', requester: 'u1', reviewer: 'u5', dueAt: DateTime.now().add(const Duration(days: 9)));
    await _pump(tester, ReviewRequestScreen(id: r.id), ReviewCenter(incoming: const [], sent: [r]));
    expect(find.text('Cancel request'), findsNothing);
    expect(find.textContaining('can no longer be cancelled'), findsOneWidget);
    expect(find.text('The reviewer has not submitted feedback yet.'), findsOneWidget);
  });

  testWidgets('a new request can be cancelled by its requester, after asking', (tester) async {
    final r = sampleReview(requester: 'u1', reviewer: 'u5');
    final api = await _pump(tester, ReviewRequestScreen(id: r.id), ReviewCenter(incoming: const [], sent: [r]));
    await tester.tap(find.text('Cancel request'));
    await tester.pumpAndSettle();
    expect(find.text('Cancel this review request?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Cancel request'));
    await tester.pumpAndSettle();
    expect(api.cancelled, [r.id]);
  });
}
