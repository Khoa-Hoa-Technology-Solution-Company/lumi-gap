import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/community/data/communities_api.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/community_detail_screen.dart';
import 'package:flutter_mobile/features/profile/data/lecturer_verification_api.dart';
import 'package:flutter_mobile/features/profile/presentation/lecturer_verification_card.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';
import 'support/community_fakes.dart';
import 'support/pump_screen.dart';

class _Api extends Fake implements CommunitiesApi {
  _Api(this.community);
  Community community;
  final List<String> calls = [];
  Object? error;

  @override
  Future<Community> get(String idOrSlug) async => community;

  @override
  Future<(String?, String?)> join(String id) async {
    calls.add('join $id');
    // ignore: only_throw_errors, the test injects what the API may throw
    if (error != null) throw error!;
    return ('member', 'active');
  }

  int summaryRequests = 0;
  CommunitySummary summaryState = const CommunitySummary(status: 'none');

  @override
  Future<MembersPage> members(String id, int page) async => MembersPage(
        [
          const CommunityMember(id: 'm1', fullName: 'Lê Văn An', role: 'owner', institution: 'FPT University'),
          const CommunityMember(id: 'm2', fullName: 'Trần Bình', role: 'member'),
        ],
        page: page,
        totalPages: 1,
      );

  @override
  Future<List<RelatedPaper>> relatedPapers(String id) async =>
      [const RelatedPaper(id: 'pp1', title: 'Vietnamese word segmentation revisited', year: 2024, citations: 12)];

  @override
  Future<List<RelatedGap>> relatedGaps(String id) async => const [];

  @override
  Future<CommunitySummary> summary(String id) async => summaryState;

  @override
  Future<CommunitySummary> requestSummary(String id) async {
    summaryRequests++;
    return summaryState = const CommunitySummary(
      status: 'completed',
      summary: 'Members compared tokenisers [1].',
      sources: [(1, 'Tokeniser benchmark', 'post-p1')],
    );
  }

  @override
  Future<void> leave(String id) async {
    calls.add('leave $id');
    // ignore: only_throw_errors, the test injects what the API may throw
    if (error != null) throw error!;
  }
}

late FakeForumApi _forum;

Future<_Api> _pump(WidgetTester tester, Community c) async {
  final api = _Api(c);
  _forum = FakeForumApi();
  await pumpScreen(tester, const CommunityDetailScreen(slug: 'nlp-vn'), overrides: [
    communitiesApiProvider.overrideWithValue(api),
    forumApiProvider.overrideWithValue(_forum),
  ]);
  return api;
}

void main() {
  test('who may join: an active community, not yet a member, not banned', () {
    expect(sampleCommunity().canJoin, isTrue);
    expect(sampleCommunity(membership: 'active').canJoin, isFalse);
    expect(sampleCommunity(membership: 'banned').canJoin, isFalse);
    expect(sampleCommunity(status: 'ARCHIVED').canJoin, isFalse);
    expect(sampleCommunity(status: 'PENDING_APPROVAL').canJoin, isFalse);
  });

  testWidgets('joining shows the membership and one more member', (tester) async {
    final api = await _pump(tester, sampleCommunity());
    expect(find.text('128 members · 1 discussion'), findsOneWidget);
    await tester.tap(find.text('Join community'));
    await tester.pumpAndSettle();
    expect(api.calls, ['join rc1']);
    expect(find.textContaining('Leave community'), findsOneWidget);
    expect(find.text('129 members · 1 discussion'), findsOneWidget);
  });

  testWidgets('leaving asks first; cancelling keeps the membership', (tester) async {
    final api = await _pump(tester, sampleCommunity(membership: 'active'));
    await tester.tap(find.textContaining('Leave community'));
    await tester.pumpAndSettle();
    expect(find.text('Leave this community?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(api.calls, isEmpty);

    await tester.tap(find.textContaining('Leave community'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Leave community'));
    await tester.pumpAndSettle();
    expect(api.calls, ['leave rc1']);
    expect(find.text('You left the community'), findsOneWidget);
    expect(find.text('Join community'), findsOneWidget);
  });

  testWidgets('a failed join says so and keeps the button', (tester) async {
    final api = await _pump(tester, sampleCommunity());
    api.error = httpFailure(409);
    await tester.tap(find.text('Join community'));
    await tester.pumpAndSettle();
    expect(find.text('Could not join this community.'), findsOneWidget);
    expect(find.text('Join community'), findsOneWidget);
  });

  testWidgets('an archived community is read-only: no join, no new discussion', (tester) async {
    await _pump(tester, sampleCommunity(status: 'ARCHIVED'));
    expect(find.textContaining('This community is archived.'), findsOneWidget);
    expect(find.text('Join community'), findsNothing);
    expect(find.text('New discussion'), findsNothing);
  });

  testWidgets('the owner cannot just leave: ownership moves first, on the web', (tester) async {
    await _pump(tester, sampleCommunity(membership: 'active', owner: true));
    expect(find.text('Transfer ownership to leave'), findsOneWidget);
    expect(find.textContaining('Leave community'), findsNothing);
  });

  testWidgets('a banned member gets no button and no composer', (tester) async {
    await _pump(tester, sampleCommunity(membership: 'banned'));
    expect(find.text('Join community'), findsNothing);
    expect(find.textContaining('Leave community'), findsNothing);
    expect(find.text('New discussion'), findsNothing);
  });

  testWidgets('members see the summary card and can ask for it once', (tester) async {
    final api = await _pump(tester, sampleCommunity(membership: 'active'));
    expect(find.text('Recent discussions summary'), findsOneWidget);
    await tester.tap(find.text('Summarize recent discussions'));
    await tester.pumpAndSettle();
    expect(api.summaryRequests, 1);
    expect(find.text('Members compared tokenisers [1].'), findsOneWidget);
    expect(find.text('[1] Tokeniser benchmark'), findsOneWidget);
  });

  testWidgets('no summary for someone who has not joined', (tester) async {
    await _pump(tester, sampleCommunity());
    expect(find.text('Recent discussions summary'), findsNothing);
  });

  testWidgets('a topic chip filters the discussions; tapping it again clears it', (tester) async {
    await _pump(tester, sampleCommunity());
    await tester.tap(find.widgetWithText(FilterChip, 'evaluation'));
    await tester.pumpAndSettle();
    expect(_forum.postCalls.last.$1, const ForumQuery(researchCommunityId: 'rc1', topic: 'evaluation'));
    await tester.tap(find.widgetWithText(FilterChip, 'evaluation'));
    await tester.pumpAndSettle();
    expect(_forum.postCalls.last.$1, const ForumQuery(researchCommunityId: 'rc1'));
  });

  testWidgets('members and related papers have their tabs', (tester) async {
    await _pump(tester, sampleCommunity());
    await tester.tap(find.text('Members'));
    await tester.pumpAndSettle();
    expect(find.text('Lê Văn An'), findsOneWidget);
    expect(find.text('Owner'), findsOneWidget);
    expect(find.text('Trần Bình'), findsOneWidget);

    await tester.tap(find.text('About'));
    await tester.pumpAndSettle();
    expect(find.text('Vietnamese word segmentation revisited'), findsOneWidget);
    expect(find.text('No shared research gaps yet.'), findsOneWidget);
  });

  group('lecturer verification', () {
    test('every status has the web wording; unknown reads as not verified', () {
      for (final s in ['PENDING', 'NEEDS_MORE_INFORMATION', 'VERIFIED', 'REJECTED', 'INVALIDATED', 'EXPIRED']) {
        expect(LecturerVerification(status: s).copy.$1, isNot('Lecturer position is not verified'));
      }
      expect(const LecturerVerification(status: 'NOT_SUBMITTED').copy.$1, 'Lecturer position is not verified');
      expect(const LecturerVerification(status: '??').copy.$1, 'Lecturer position is not verified');
    });

    test('a student also gets the block from the API, but has nothing to show', () {
      // Shape seen from the API for the demo student.
      expect(lecturerVerificationFrom({'status': 'NOT_SUBMITTED', 'academicRole': 'STUDENT', 'institutionName': ''}), isNull);
      final l = lecturerVerificationFrom({'status': 'PENDING', 'academicRole': 'LECTURER', 'institutionName': ''})!;
      expect(l.status, 'PENDING');
      expect(l.institutionName, isNull, reason: 'empty text is no institution');
    });

    testWidgets('only shown with a lecturer claim; verified needs no web step', (tester) async {
      await pumpScreen(tester, const Scaffold(body: LecturerVerificationCard()), overrides: [
        lecturerVerificationProvider.overrideWith((ref) async => null),
      ]);
      expect(find.text('Lecturer verification'), findsNothing);

      await pumpScreen(tester, const Scaffold(body: LecturerVerificationCard()), overrides: [
        lecturerVerificationProvider.overrideWith(
          (ref) async => const LecturerVerification(status: 'PENDING', institutionName: 'FPT University'),
        ),
      ]);
      expect(find.text('Awaiting Admin review'), findsOneWidget);
      expect(find.text('Continue on the web'), findsOneWidget);

      await pumpScreen(tester, const Scaffold(body: LecturerVerificationCard()), overrides: [
        lecturerVerificationProvider.overrideWith((ref) async => const LecturerVerification(status: 'VERIFIED')),
      ]);
      expect(find.text('Lecturer position verified'), findsOneWidget);
      expect(find.text('Continue on the web'), findsNothing);
    });
  });
}
