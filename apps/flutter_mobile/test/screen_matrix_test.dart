import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/admin/data/admin_api.dart';
import 'package:flutter_mobile/features/admin/presentation/admin_sync_screen.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/presentation/auth_startup_screen.dart';
import 'package:flutter_mobile/features/auth/presentation/forgot_password_screen.dart';
import 'package:flutter_mobile/features/auth/presentation/login_screen.dart';
import 'package:flutter_mobile/features/auth/presentation/register_screen.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/bookmarks/presentation/bookmarks_screen.dart';
import 'package:flutter_mobile/features/community/data/communities_api.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/community_detail_screen.dart';
import 'package:flutter_mobile/features/community/presentation/community_screen.dart';
import 'package:flutter_mobile/features/community/presentation/forum_post_screen.dart';
import 'package:flutter_mobile/features/community/presentation/new_post_screen.dart';
import 'package:flutter_mobile/features/explore/presentation/explore_screen.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gaps_screen.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/home_screen.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_mobile/features/notifications/presentation/notifications_screen.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/papers/presentation/my_papers_screen.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail_screen.dart';
import 'package:flutter_mobile/features/papers/presentation/submit_paper_screen.dart';
import 'package:flutter_mobile/features/profile/presentation/account_editors.dart';
import 'package:flutter_mobile/features/profile/presentation/account_screen.dart';
import 'package:flutter_mobile/features/profile/presentation/profile_screen.dart';
import 'package:flutter_mobile/features/projects/data/invitations_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/invitation_link_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/project_members_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/project_settings_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/projects_screen.dart';
import 'package:flutter_mobile/features/quality/data/quality_api.dart';
import 'package:flutter_mobile/features/rankings/data/rankings_api.dart';
import 'package:flutter_mobile/features/rankings/presentation/rankings_screen.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/reports/presentation/report_detail_screen.dart';
import 'package:flutter_mobile/features/reports/presentation/reports_screen.dart';
import 'package:flutter_mobile/features/reviews/data/review_requests_api.dart';
import 'package:flutter_mobile/features/reviews/presentation/review_center_screen.dart';
import 'package:flutter_mobile/features/reviews/presentation/review_request_screen.dart';
import 'package:flutter_mobile/features/search/presentation/search_screen.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_mobile/features/trends/presentation/trends_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';
import 'support/community_fakes.dart';
import 'support/readable_text.dart';

/// Every screen, with data that looks real (long Vietnamese names, several
/// items, a rising and an untested topic), in light and dark, English and
/// Vietnamese, on a 412dp phone and on a 320dp one with text at 130%.
/// Each run must lay out without overflow or exception, and all text must
/// be readable against what is really behind it (WCAG AA).

const _longTitle =
    'Ứng dụng mô hình ngôn ngữ lớn trong đánh giá bài tập lập trình ở bậc đại học';

User _user({bool admin = false}) => testUser().copyWith(
  role: admin ? UserRole.admin : UserRole.user,
  academicProfileType: AcademicProfileType.student,
  institution: 'Trường Đại học FPT',
);

Paper _paper(String id, {String? title}) => Paper(
  id: id,
  title: title ?? _longTitle,
  publicationYear: 2025,
  citationCount: 1234,
  dataStatus: 'ready',
  dataQualityScore: 0.82,
  isAiAnalyzable: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  journalName: 'Computers and Education: Artificial Intelligence',
  openAccessUrl: 'https://example.org/full.pdf',
  abstractText: List.filled(60, 'evidence').join(' '),
  authors: const [
    PaperAuthorRef(displayName: 'Nguyễn Thị Minh Anh', position: 1),
    PaperAuthorRef(displayName: 'Trần Văn Bình', position: 2),
    PaperAuthorRef(displayName: 'Lê Quang Huy', position: 3),
    PaperAuthorRef(displayName: 'Phạm Thu Hà', position: 4),
  ],
);

final _overviewJson = <String, dynamic>{
  'mode': 'user',
  'trends': {
    'topics': [
      {
        'topic': 'Retrieval-Augmented Generation in Education',
        'classification': {'verdict': 'rising'},
        'yearlyBreakdown': [
          {'year': 2024, 'count': 4},
          {'year': 2025, 'count': 9},
        ],
      },
      {
        'topic': 'Intelligent Tutoring Systems and Adaptive Learning',
        'classification': {'verdict': 'insufficient'},
        'yearlyBreakdown': [
          {'year': 2024, 'count': 2},
          {'year': 2025, 'count': 3},
        ],
      },
    ],
  },
  'recentPapers': [
    {
      'id': 'p1',
      'title': _longTitle,
      'authors': [
        {'displayName': 'Nguyễn Thị Minh Anh'},
      ],
      'journalName': 'Nature',
      'publicationYear': 2026,
      'citationCount': 2,
    },
  ],
};

TrendingTopic _topic(String name, TrendVerdict verdict, double? change) =>
    TrendingTopic(
      topic: name,
      totalPapers: 109071,
      yearlyBreakdown: const [
        YearlyCount(year: 2023, count: 10),
        YearlyCount(year: 2024, count: 14),
        YearlyCount(year: 2025, count: 20),
      ],
      classification: TrendClassification(
        verdict: verdict,
        confidence: verdict == TrendVerdict.rising
            ? TrendConfidence.medium
            : null,
        relativeChangePct: change,
      ),
    );

/// Overrides every screen may reach; each case adds its own.
List<Override> _common(
  User? user,
  List<Bookmark>? bookmarks, {
  bool startupFailed = false,
}) => [
  authControllerProvider.overrideWith(
    () => startupFailed
        ? _UnreachableAuthController()
        : FakeAuthController(user),
  ),
  notificationsProvider.overrideWith(
    (ref) async => const [
      AppNotification(
        id: 'n1',
        title: 'Your paper was approved for the library',
        message: 'It is now visible to every reader.',
        isRead: false,
        createdAt: '2026-11-14T10:00:00Z',
        targetKind: 'paper',
        targetId: 'p1',
      ),
    ],
  ),
  bookmarksProvider.overrideWith(
    (ref) async =>
        bookmarks ??
        const [Bookmark(id: 'b1', targetKind: 'paper', targetId: 'p1')],
  ),
  bookmarkStatusProvider.overrideWith(
    (ref, t) async => const BookmarkStatus(bookmarked: true, bookmarkId: 'b1'),
  ),
  reportsProvider.overrideWith(
    (ref, p) async => const ReportsList(
      reports: [
        ReportListItem(
          id: 'r1',
          query: 'Analyse trends in federated learning for healthcare',
          status: 'generating',
          topic: 'Federated learning',
        ),
        ReportListItem(
          id: 'r2',
          query: 'Gaps in privacy budgets',
          status: 'failed',
        ),
      ],
      total: 2,
    ),
  ),
  homeOverviewProvider.overrideWith(
    (ref) async => HomeOverview.fromJson(_overviewJson),
  ),
  homeResearchProvider.overrideWith(
    (ref) async => HomeResearchOverview.fromJson(const {}),
  ),
];

class _Case {
  const _Case(
    this.name,
    this.screen, {
    this.overrides = const [],
    this.user,
    this.bookmarks,
    this.startupFailed = false,
  });

  final String name;
  final Widget Function() screen;
  final List<Override> overrides;

  /// Signed-in user; null for the sign-in screens.
  final User? user;

  /// The reader's bookmarks, when the screen is about them.
  final List<Bookmark>? bookmarks;

  /// The start-up session check could not reach the server.
  final bool startupFailed;
}

/// A start-up check that failed for want of a network (session kept).
class _UnreachableAuthController extends AuthController {
  @override
  AsyncValue<User?> build() =>
      AsyncError(Exception('offline'), StackTrace.empty);
}

const _project = ProjectView(
  id: 'pr1',
  title: 'Học liên kết trong y tế và giáo dục đại học',
  description: 'Nhóm nghiên cứu về học liên kết và quyền riêng tư dữ liệu.',
  accessRole: 'OWNER',
  memberCountFromApi: 3,
  paperCountFromApi: 12,
);

final List<_Case> _cases = [
  _Case(
    'start-up offline',
    () => const AuthStartupScreen(),
    startupFailed: true,
  ),
  _Case('login', () => const LoginScreen()),
  _Case('register', () => const RegisterScreen()),
  _Case('forgot password', () => const ForgotPasswordScreen()),
  _Case('home', () => const HomeScreen(), user: _user()),
  _Case('explore', () => const ExploreScreen(), user: _user()),
  _Case(
    'projects',
    () => const ProjectsScreen(),
    user: _user(),
    overrides: [
      projectsProvider.overrideWith((ref) async => [_project]),
      myInvitationsProvider.overrideWith((ref) async => [sampleInvitation()]),
    ],
  ),
  _Case(
    'community discussions',
    () => const CommunityScreen(),
    user: _user(),
    overrides: [
      forumApiProvider.overrideWithValue(
        FakeForumApi(
          feed: [
            samplePost('p1', pinned: true),
            samplePost('p2', status: 'locked'),
          ],
        ),
      ),
    ],
  ),
  _Case(
    'community list',
    () => const CommunityScreen(initialView: CommunityView.communities),
    user: _user(),
    overrides: [
      forumApiProvider.overrideWithValue(FakeForumApi()),
      communitiesProvider.overrideWith(
        (ref, q) async => [
          sampleCommunity(membership: 'active'),
          sampleCommunity(status: 'ARCHIVED'),
        ],
      ),
    ],
  ),
  _Case(
    'community detail',
    () => const CommunityDetailScreen(slug: 'nlp-vn'),
    user: _user(),
    overrides: [
      forumApiProvider.overrideWithValue(
        FakeForumApi(feed: [samplePost('p1')]),
      ),
      communityProvider.overrideWith((ref, slug) async => sampleCommunity()),
    ],
  ),
  _Case(
    'forum post',
    () => const ForumPostScreen(idOrSlug: 'post-p1'),
    user: _user(),
    overrides: [
      forumApiProvider.overrideWithValue(
        FakeForumApi(
          feed: [samplePost('p1')],
          replyItems: [sampleReply('r1'), sampleReply('r2')],
        ),
      ),
    ],
  ),
  _Case(
    'new post',
    () => const NewPostScreen(
      communityId: 'rc1',
      communityName: 'Vietnamese NLP',
    ),
    user: _user(),
    overrides: [forumApiProvider.overrideWithValue(FakeForumApi())],
  ),
  _Case(
    'review center',
    () => const ReviewCenterScreen(),
    user: _user(),
    overrides: [
      canReviewProvider.overrideWith((ref) async => true),
      reviewCenterProvider.overrideWith(
        (ref) async => ReviewCenter(
          incoming: [
            sampleReview(),
            sampleReview(status: 'IN_REVIEW'),
          ],
          sent: const [],
        ),
      ),
    ],
  ),
  _Case(
    'review request',
    () => const ReviewRequestScreen(id: 'rr'),
    user: _user(),
    overrides: [
      canReviewProvider.overrideWith((ref) async => true),
      reviewRequestProvider.overrideWith(
        (ref, id) async => sampleReview(
          rounds: [
            {
              'roundNumber': 1,
              'status': 'SUBMITTED',
              'overallAssessment': 'MINOR_REVISION',
              'submittedAt': '2026-11-12T08:00:00Z',
              'keyStrengths':
                  'A clear research question and a sound sampling plan.',
              'requiredRevisions': [
                {
                  'priority': 'MAJOR',
                  'description': 'Report the inter-annotator agreement.',
                  'status': 'OPEN',
                },
              ],
            },
          ],
        ),
      ),
    ],
  ),
  _Case(
    'invitation link',
    () => const InvitationLinkScreen(token: 'tok'),
    user: _user(),
    overrides: [
      invitationPreviewProvider.overrideWith(
        (ref, token) async => InvitationPreview(
          status: 'PENDING',
          authenticated: true,
          emailMatches: true,
          alreadyMember: false,
          projectId: 'p9',
          projectTitle: longTitle,
          inviterName: 'Nguyễn Thị Thanh Hương',
          invitedEmail: 'minh@fpt.edu.vn',
          message: 'Join us for the literature review.',
          expiresAt: DateTime.utc(2026, 11, 30),
        ),
      ),
    ],
  ),
  _Case('profile', () => const ProfileScreen(), user: _user()),
  _Case(
    'account institution',
    () => const AccountInstitutionScreen(),
    user: _user(),
  ),
  _Case(
    'account interests',
    () => const AccountInterestsScreen(),
    user: _user().copyWith(
      researchInterests: ['federated learning', 'privacy'],
    ),
  ),
  _Case('account password', () => const AccountPasswordScreen(), user: _user()),
  _Case(
    'project members',
    () => const ProjectMembersScreen(projectId: 'pr1'),
    user: _user(),
    overrides: [
      projectProvider.overrideWith(
        (ref, id) async => const ProjectView(
          id: 'pr1',
          title: 'Học liên kết trong y tế và giáo dục đại học',
          accessRole: 'OWNER',
          ownerId: 'u1',
          members: [
            ProjectMemberRef(id: 'u1', displayName: 'Nguyễn Minh Anh'),
            ProjectMemberRef(id: 'u2', displayName: 'Trần Thị Bích Ngọc'),
          ],
        ),
      ),
    ],
  ),
  _Case(
    'project settings',
    () => const ProjectSettingsScreen(project: _project),
    user: _user(),
  ),
  _Case(
    'account',
    () => const AccountScreen(),
    user: _user().copyWith(
      researchInterests: ['federated learning', 'privacy'],
    ),
  ),
  _Case('notifications', () => const NotificationsScreen(), user: _user()),
  _Case(
    'bookmarks',
    () => const BookmarksScreen(),
    user: _user(),
    bookmarks: [
      Bookmark(
        id: 'b1',
        targetKind: 'paper',
        targetId: 'p1',
        paperDetail: _paper('p1'),
      ),
    ],
  ),
  _Case(
    'my papers',
    () => const MyPapersScreen(),
    user: _user(),
    overrides: [
      myPapersProvider.overrideWith((ref) async => [_paper('p1')]),
    ],
  ),
  _Case('submit paper', () => const SubmitPaperScreen(), user: _user()),
  _Case(
    'paper detail',
    () => const PaperDetailScreen(id: 'p1'),
    user: _user(),
    overrides: [
      paperProvider.overrideWith((ref, id) async => _paper(id)),
      qualityViewProvider.overrideWith(
        (ref, t) async => QualityView.fromJson(const {
          'ratingSummary': {'avg': 4.5, 'count': 2},
          'myRating': {'stars': 4, 'comment': 'Useful'},
        }),
      ),
      readingContextProvider.overrideWith(
        (ref, q) async =>
            PaperReadingContext(paperId: q.paperId, related: const []),
      ),
    ],
  ),
  _Case(
    'search',
    () => const SearchScreen(),
    user: _user(),
  ),
  _Case(
    'trends',
    () => const TrendsScreen(),
    user: _user(),
    overrides: [
      trendsOverviewProvider.overrideWith(
        (ref, p) async => TrendsOverview(
          topics: [
            _topic(
              'Artificial Intelligence in Education',
              TrendVerdict.rising,
              4.2,
            ),
            _topic(
              'Federated Learning for Healthcare',
              TrendVerdict.declining,
              -2.1,
            ),
            _topic('Quantum Machine Learning', TrendVerdict.insufficient, null),
          ],
          risingKeywords: const [
            RisingKeyword(
              keyword: 'large language models',
              totalPapers: 50,
              z: 9.3,
              qValue: 0.001,
              papersA: 5,
              papersB: 45,
              yearlyBreakdown: [],
            ),
          ],
        ),
      ),
    ],
  ),
  _Case(
    'reports',
    () => const ReportsScreen(),
    user: _user(),
  ),
  _Case(
    'report detail',
    () => const ReportDetailScreen(id: 'r1'),
    user: _user(),
    overrides: [
      reportProvider.overrideWith(
        (ref, id) async => const AnalyticalReport(
          id: 'r1',
          query: 'Analyse trends in federated learning for healthcare',
          status: 'ready',
          topic: 'Federated learning',
          markdown:
              '## Summary\n\nFederated learning is growing in health care.',
          groundingPapers: [
            PaperRef(
              id: 'p1',
              title: _longTitle,
              publicationYear: 2025,
              authors: [],
            ),
            PaperRef(
              id: 'p2',
              title: 'A paper without a year',
              publicationYear: 0,
              authors: [],
            ),
          ],
          researchGaps: [
            ReportGap(
              title: 'Privacy budgets are rarely compared across hospitals',
              description: 'Few studies compare privacy budgets in practice.',
              confidence: 0.55,
            ),
          ],
        ),
      ),
    ],
  ),
  _Case(
    'gaps',
    () => const GapsScreen(),
    user: _user(),
    overrides: [
      gapsProvider.overrideWith(
        (ref, p) async => const ListGapsResponse(
          data: [
            ResearchGapItem(
              id: 'g1',
              topic: 'federated learning',
              title: 'Privacy budgets are rarely compared across hospitals',
              description: 'Few studies compare privacy budgets in practice.',
              rationale: '',
              confidence: 0.82,
              source: 'standalone',
              status: 'active',
              evidenceCount: 3,
            ),
          ],
          total: 1,
        ),
      ),
    ],
  ),
  _Case(
    'rankings',
    () => const RankingsScreen(),
    user: _user(),
    overrides: [
      rankingsProvider.overrideWith(
        (ref) async => const RankingsResponse(
          rankings: [
            RankingUser(
              rank: 1,
              name: 'Dr. Nguyen Van A',
              role: 'lecturer',
              points: 5000,
              credits: 10,
              university: 'FPT University',
            ),
            RankingUser(
              rank: 2,
              name: 'Tran Thi B',
              role: 'student',
              points: 1000,
              credits: 5,
              university: 'FPT University',
            ),
            RankingUser(rank: 3, name: 'Le C', role: '', points: 0, credits: 0),
            RankingUser(
              rank: 4,
              name: 'Pham D',
              role: 'researcher',
              points: 0,
              credits: 0,
            ),
          ],
        ),
      ),
      myRankingProvider.overrideWith(
        (ref) async => const MyRanking(
          rank: 2,
          points: 1000,
          uploadedPdfs: 3,
          requestedPapers: 4,
        ),
      ),
    ],
  ),
  _Case(
    'admin sync',
    () => const AdminSyncScreen(),
    user: _user(admin: true),
    overrides: [
      syncRunsProvider.overrideWith(
        (ref) async => const [
          ApiSyncRun(
            id: 's1',
            status: 'succeeded',
            searchText: 'large language model education',
            totalFetched: 1000,
            totalInserted: 38,
          ),
          ApiSyncRun(
            id: 's2',
            status: 'running',
            searchText: 'quantum computing',
            totalFetched: 200,
            totalInserted: 2,
          ),
          ApiSyncRun(
            id: 's3',
            status: 'failed',
            searchText: 'x',
            totalFetched: 0,
            totalInserted: 0,
            errorMessage: 'OpenAlex timed out',
          ),
        ],
      ),
      embeddingStatusProvider.overrideWith(
        (ref) async => EmbeddingStatus.fromJson(const {
          'analyzable': 838,
          'embedded': 400,
          'pending': 438,
        }),
      ),
      pipelineStatusProvider.overrideWith(
        (ref) async => PipelineStatus.fromJson(const {
          'redis': {'ok': true},
          'workers': {'expected': 12, 'alive': 12},
          'queues': [
            {
              'name': 'embedding',
              'label': 'Embeddings',
              'waiting': 0,
              'active': 0,
              'failed': 1,
              'hasFailures': true,
            },
          ],
        }),
      ),
    ],
  ),
];

Future<void> _pump(
  WidgetTester tester,
  _Case c, {
  required Brightness brightness,
  required AppLocale locale,
  required Size size,
  required double textScale,
}) async {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => c.screen()),
      // Any link a screen follows lands somewhere harmless.
      GoRoute(
        path: '/:rest(.*)',
        builder: (_, _) => const Scaffold(body: SizedBox.shrink()),
      ),
    ],
  );
  addTearDown(router.dispose);
  final previous = currentAppLocale;
  currentAppLocale = locale;
  addTearDown(() => currentAppLocale = previous);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        ..._common(c.user, c.bookmarks, startupFailed: c.startupFailed),
        ...c.overrides,
      ],
      child: MaterialApp.router(
        routerConfig: router,
        locale: locale.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: brightness == Brightness.dark
            ? AppTheme.darkTheme
            : AppTheme.lightTheme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
      ),
    ),
  );
  // Let the fake data arrive; a few frames rather than "settle", as a
  // running job may animate for good.
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  test('the contrast check itself: the pairs the design forbids fail', () {
    const lumi = LumiColors.light;
    // §11.1: muted on surfaceMuted is about 4.3:1.
    expect(contrastRatio(lumi.muted, lumi.surfaceMuted), lessThan(4.5));
    expect(
      contrastRatio(lumi.foreground, lumi.background),
      greaterThan(4.5),
    );
    // Half-transparent text is measured blended over its background.
    final blended = composite(
      lumi.foreground.withValues(alpha: 0.3),
      lumi.surface,
    );
    expect(contrastRatio(blended, lumi.surface), lessThan(4.5));
  });

  test('every screen in lib/ is in this matrix', () {
    // Covered elsewhere with their own fakes, in both themes:
    // ProjectDetailScreen (project_detail_screen_test.dart, every tab);
    // AppShellScreen only hosts the tab screens listed here.
    const elsewhere = {'ProjectDetailScreen', 'AppShellScreen'};
    final inMatrix = {
      for (final c in _cases) c.screen().runtimeType.toString(),
    };
    final screens = <String>{};
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      for (final m in RegExp(
        r'class (\w+Screen) extends',
      ).allMatches(f.readAsStringSync())) {
        screens.add(m.group(1)!);
      }
    }
    expect(screens.difference(inMatrix).difference(elsewhere), isEmpty);
  });

  const sizes = <(String, Size, double)>[
    ('412dp', Size(412, 915), 1),
    ('320dp x1.3', Size(320, 640), 1.3),
  ];

  for (final c in _cases) {
    group(c.name, () {
      for (final brightness in Brightness.values) {
        for (final locale in AppLocale.values) {
          for (final (label, size, scale) in sizes) {
            testWidgets('${brightness.name}, ${locale.name}, $label', (
              tester,
            ) async {
              await _pump(
                tester,
                c,
                brightness: brightness,
                locale: locale,
                size: size,
                textScale: scale,
              );
              expect(tester.takeException(), isNull);
              final page = brightness == Brightness.dark
                  ? LumiColors.dark.background
                  : LumiColors.light.background;
              expect(unreadableText(tester, page: page), isEmpty);
            });
          }
        }
      }
    });
  }
}
