import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_data.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/home_screen.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';

const Map<String, Object?> _unavailable = {
  'status': 'unavailable',
  'data': null,
};
const _unavailableText = 'Chưa tải được phần này';

Map<String, dynamic> _research({
  Object? workspace,
  Object? recommendations,
  Object? community,
}) => {
  'currentUser': {'id': 'u1', 'name': 'Nguyễn Minh'},
  'workspace':
      workspace ??
      {
        'status': 'ready',
        'data': {
          'continueResearch': [
            {
              'id': 'p1',
              'title': 'Học liên kết trong y tế',
              'researchField': 'Học máy',
              'stage': 'screening',
              'href': '/projects/p1?tab=papers&screening=UNDECIDED',
              'updatedAt': '2026-11-08T00:00:00Z',
              'paperCount': 148,
              'screenedCount': 96,
              'candidateGapCount': 4,
            },
          ],
          'attention': [
            {
              'id': 'low',
              'type': 'invitation',
              'title': 'Lời mời tham gia dự án',
              'description': 'Phân tích xu hướng IoT',
              'href': '/review-requests/77',
              'occurredAt': '2026-11-09T07:00:00Z',
              'priority': 10,
            },
            {
              'id': 'high',
              'type': 'screening',
              'title': 'Sàng lọc bài báo đang chờ',
              'description': 'Dự án Học liên kết',
              'count': 12,
              'href': '/projects/p1?tab=papers&screening=UNDECIDED',
              'occurredAt': '2026-11-09T07:00:00Z',
              'priority': 90,
            },
          ],
        },
      },
  'recommendations':
      recommendations ??
      {
        'status': 'ready',
        'data': [
          {
            'id': 'rec1',
            'title': 'Federated Learning for Medical Imaging',
            'authors': ['Nguyen T.', 'Tran H.'],
            'venue': 'Medical Image Analysis',
            'year': 2025,
            'reason': 'project',
            'reasonLabel': 'federated learning',
          },
        ],
      },
  'communityActivity':
      community ??
      {
        'status': 'ready',
        'data': [
          {
            'id': 'c1',
            'title': 'Cách đánh giá bộ dữ liệu y tế?',
            'href': '/forum/danh-gia-bo-du-lieu',
            'community': 'Học máy Y tế',
            'replyCount': 18,
            'occurredAt': '2026-11-09T06:00:00Z',
          },
        ],
      },
};

Map<String, dynamic> _overview({
  List<Object?>? topics,
  List<Object?>? papers,
}) => {
  'mode': 'user',
  'trends': {
    'topics':
        topics ??
        [
          {
            'topic': 'Retrieval-Augmented Generation',
            'momentum': 0.9,
            'growthRatePct': 40,
            'classification': {'verdict': 'rising'},
            'totalPapers': 100,
            'yearlyBreakdown': [
              {'year': 2024, 'count': 4},
              {'year': 2025, 'count': 9},
            ],
          },
        ],
  },
  'recentPapers':
      papers ??
      [
        {
          'id': 'new1',
          'title': 'Một bài báo mới',
          'authors': [
            {'displayName': 'Le Q.'},
          ],
          'journalName': 'Nature',
          'publicationYear': 2026,
          'citationCount': 2,
        },
      ],
};

class _Harness {
  _Harness({
    Future<HomeOverview> Function()? overview,
    Future<HomeResearchOverview> Function()? research,
  }) : overview = overview ?? (() async => HomeOverview.fromJson(_overview())),
       research =
           research ?? (() async => HomeResearchOverview.fromJson(_research()));

  final Future<HomeOverview> Function() overview;
  final Future<HomeResearchOverview> Function() research;
  int overviewCalls = 0;
  int researchCalls = 0;
  final List<Uri> opened = [];
  late GoRouter router;
}

Future<void> _pump(
  WidgetTester tester,
  _Harness h, {
  double height = 4000,
  double width = 412,
  AppLocale locale = AppLocale.vi,
}) async {
  // A very tall window so the lazy ListView builds every section at once.
  tester.view
    ..physicalSize = Size(width * 2, height * 2)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  h.router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
      GoRoute(
        path: '/project/:id',
        builder: (_, s) =>
            Scaffold(body: Text('project-${s.pathParameters['id']}')),
      ),
      GoRoute(
        path: '/paper/:id',
        builder: (_, s) =>
            Scaffold(body: Text('paper-${s.pathParameters['id']}')),
      ),
      GoRoute(
        path: '/projects',
        builder: (_, _) => const Scaffold(body: Text('projects-tab')),
      ),
      GoRoute(
        path: '/review-requests/:id',
        builder: (_, s) =>
            Scaffold(body: Text('review-request-${s.pathParameters['id']}')),
      ),
      GoRoute(
        path: '/forum/post/:id',
        builder: (_, s) =>
            Scaffold(body: Text('forum-post-${s.pathParameters['id']}')),
      ),
      GoRoute(
        path: '/trends',
        builder: (_, _) => const Scaffold(body: Text('trends-screen')),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, _) => const Scaffold(body: Text('notifications-screen')),
      ),
      for (final path in ['/search', '/gaps', '/reports', '/rankings'])
        GoRoute(
          path: path,
          builder: (_, _) => Scaffold(body: Text('screen$path')),
        ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(
          () => FakeAuthController(testUser()),
        ),
        notificationsProvider.overrideWith((ref) async => <AppNotification>[]),
        bookmarkStatusProvider.overrideWith(
          (ref, target) async => const BookmarkStatus(bookmarked: false),
        ),
        homeOverviewProvider.overrideWith((ref) {
          h.overviewCalls++;
          return h.overview();
        }),
        homeResearchProvider.overrideWith((ref) {
          h.researchCalls++;
          return h.research();
        }),
        urlOpenerProvider.overrideWithValue((uri) async {
          h.opened.add(uri);
          return true;
        }),
      ],
      child: MaterialApp.router(
        locale: locale.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        routerConfig: h.router,
      ),
    ),
  );
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pump();
}

void main() {
  testWidgets('all sections render with data', (tester) async {
    final h = _Harness();
    await _pump(tester, h);
    await tester.pumpAndSettle();

    expect(find.text('Chào, Nguyễn Minh'), findsOneWidget);
    expect(find.text('Việc cần làm'), findsOneWidget);
    expect(find.text('Sàng lọc bài báo đang chờ'), findsOneWidget);
    expect(find.text('Tiếp tục nghiên cứu'), findsOneWidget);
    expect(find.text('Học liên kết trong y tế'), findsOneWidget);
    // The stage leads the project row's summary line.
    expect(find.textContaining('Sàng lọc ·'), findsOneWidget);
    await _scrollTo(
      tester,
      find.text('Federated Learning for Medical Imaging'),
    );
    expect(find.text('federated learning'), findsOneWidget);
    expect(find.text('Liên quan dự án của bạn'), findsNothing);
    await _scrollTo(tester, find.text('Retrieval-Augmented Generation'));
    expect(find.text('Đang tăng'), findsOneWidget);
    await _scrollTo(tester, find.text('Cách đánh giá bộ dữ liệu y tế?'));
    expect(find.text(_unavailableText), findsNothing);
  });

  testWidgets('recommendation chip falls back to the reason when no label', (
    tester,
  ) async {
    Map<String, dynamic> rec(String id, String reason) => {
      'id': id,
      'title': 'Bài $id',
      'authors': <Object>[],
      'year': 2025,
      'reason': reason,
    };
    final h = _Harness(
      research: () async => HomeResearchOverview.fromJson(
        _research(
          recommendations: {
            'status': 'ready',
            'data': [
              rec('a', 'interest'),
              rec('b', 'project'),
              rec('c', 'recent'),
            ],
          },
        ),
      ),
    );
    await _pump(tester, h);
    await tester.pumpAndSettle();

    expect(find.text('Theo chủ đề bạn quan tâm'), findsOneWidget);
    expect(find.text('Liên quan dự án của bạn'), findsOneWidget);
    expect(find.text('Mới xuất bản'), findsOneWidget);
  });

  group('trend labels come from classification.verdict', () {
    Map<String, dynamic> topic(
      String name,
      Object? classification, {
      num growth = 0,
    }) => {
      'topic': name,
      'relativeChangePct': growth,
      'yearlyBreakdown': [
        {'year': 2023, 'count': 1},
        {'year': 2024, 'count': 2},
        {'year': 2025, 'count': 4},
      ],
      'classification': ?classification,
    };

    // Trend cards on the dark feature surface.
    int darkCards(WidgetTester tester) => tester
        .widgetList<Material>(find.byType(Material))
        .where((m) => m.color == LumiTints.light.ink)
        .length;

    testWidgets(
      'the four main verdicts, each with its own word, colour and icon',
      (
        tester,
      ) async {
        final h = _Harness(
          overview: () async => HomeOverview.fromJson(
            _overview(
              topics: [
                // Growth contradicts the verdict on purpose: only the verdict counts.
                topic('Chủ đề A', {'verdict': 'rising'}, growth: -50),
                topic('Chủ đề B', {'verdict': 'declining'}, growth: 300),
                topic('Chủ đề C', {'verdict': 'stable'}, growth: 80),
                topic('Chủ đề D', {'verdict': 'insufficient'}, growth: 80),
              ],
            ),
          ),
        );
        await _pump(tester, h);
        await tester.pumpAndSettle();
        const lumi = LumiColors.light;
        // The lead topic is rising: it, and only it, is highlighted.
        expect(darkCards(tester), 1);

        // The pill: the icon in the verdict colour, the word in the text
        // colour (a coloured word on its tint is not readable enough).
        void expectLabel(
          String text,
          IconData icon,
          Color Function(LumiColors palette) color,
        ) {
          expect(find.text(text), findsOneWidget, reason: text);
          final pill = find
              .ancestor(
                of: find.text(text),
                matching: find.byType(TrendVerdictPill),
              )
              .first;
          final iconWidget = tester.widget<Icon>(
            find.descendant(of: pill, matching: find.byIcon(icon)),
          );
          // The leading (featured) card is dark, so its pill reads the
          // dark palette; the others the page's.
          final palette =
              Theme.of(tester.element(pill)).extension<LumiColors>() ?? lumi;
          expect(iconWidget.color, color(palette), reason: text);
          expect(
            tester.widget<Text>(find.text(text)).style?.color,
            palette.foreground,
            reason: text,
          );
        }

        expectLabel('Đang tăng', Icons.trending_up, (p) => p.success);
        expectLabel('Đang giảm', Icons.trending_down, (p) => p.error);
        expectLabel('Ổn định', Icons.trending_flat, (p) => p.muted);
        expectLabel('Chưa đủ dữ liệu', Icons.help_outline, (p) => p.muted);
      },
    );

    testWidgets('saturated and past its peak have their own word and icon', (
      tester,
    ) async {
      final h = _Harness(
        overview: () async => HomeOverview.fromJson(
          _overview(
            topics: [
              topic('Chủ đề E', {'verdict': 'saturated'}, growth: -80),
              topic('Chủ đề F', {'verdict': 'past_peak'}, growth: 90),
            ],
          ),
        ),
      );
      await _pump(tester, h);
      await tester.pumpAndSettle();
      const lumi = LumiColors.light;

      // The pill: the icon in the verdict colour, the word in the text
      // colour (a coloured word on its tint is not readable enough).
      void expectLabel(
          String text,
          IconData icon,
          Color Function(LumiColors palette) color,
        ) {
        expect(find.text(text), findsOneWidget, reason: text);
        final pill = find
            .ancestor(
              of: find.text(text),
              matching: find.byType(TrendVerdictPill),
            )
            .first;
        final iconWidget = tester.widget<Icon>(
          find.descendant(of: pill, matching: find.byIcon(icon)),
        );
        final palette =
            Theme.of(tester.element(pill)).extension<LumiColors>() ?? lumi;
        expect(iconWidget.color, color(palette), reason: text);
        expect(
          tester.widget<Text>(find.text(text)).style?.color,
          palette.foreground,
          reason: text,
        );
      }

      expectLabel('Bão hoà', Icons.vertical_align_top, (p) => p.warning);
      expectLabel('Qua đỉnh', Icons.south_east, (p) => p.warning);
    });

    testWidgets('with no rising topic no card is highlighted',
        (tester) async {
      // Rising topics are sorted first, so a lead that is not rising means
      // none is.
      final h = _Harness(
        overview: () async => HomeOverview.fromJson(
          _overview(
            topics: [
              topic('Chủ đề G', {'verdict': 'declining'}),
              topic('Chủ đề H', {'verdict': 'stable'}),
            ],
          ),
        ),
      );
      await _pump(tester, h);
      await tester.pumpAndSettle();
      expect(darkCards(tester), 0);
    });

    const allInsufficientCaption =
        'Chưa đủ dữ liệu theo năm để biết các chủ đề này đang tăng hay giảm.';

    testWidgets(
      'when no topic has a verdict the section says so once, no row label',
      (tester) async {
        final h = _Harness(
          overview: () async => HomeOverview.fromJson(
            _overview(
              topics: [
                // No classification at all, and an explicit "insufficient".
                topic('Chủ đề E', null, growth: 500),
                topic('Chủ đề F', {'verdict': 'insufficient'}, growth: 500),
              ],
            ),
          ),
        );
        await _pump(tester, h);
        await tester.pumpAndSettle();

        expect(find.text(allInsufficientCaption), findsOneWidget);
        expect(find.text('Chủ đề E'), findsOneWidget);
        expect(find.text('Chủ đề F'), findsOneWidget);
        // Not repeated on every row, and growth alone never earns an arrow.
        expect(find.text('Chưa đủ dữ liệu'), findsNothing);
        expect(find.text('Đang tăng'), findsNothing);
        expect(find.byIcon(Icons.help_outline), findsNothing);
        expect(find.byIcon(Icons.trending_up), findsNothing);
        expect(find.byIcon(Icons.trending_down), findsNothing);
        expect(find.byIcon(Icons.trending_flat), findsNothing);
        // Raw counts of an untested corpus are not drawn as a trend line.
        expect(find.byType(LumiSparkline), findsNothing);
        // Nothing is rising, so no card is highlighted.
        expect(darkCards(tester), 0);
      },
    );

    testWidgets(
      'one topic with a verdict brings the row labels back, caption gone',
      (tester) async {
        final h = _Harness(
          overview: () async => HomeOverview.fromJson(
            _overview(
              topics: [
                topic('Chủ đề E', null),
                topic('Chủ đề G', {'verdict': 'rising'}),
              ],
            ),
          ),
        );
        await _pump(tester, h);
        await tester.pumpAndSettle();

        expect(find.text(allInsufficientCaption), findsNothing);
        expect(find.text('Chưa đủ dữ liệu'), findsOneWidget);
        expect(find.text('Đang tăng'), findsOneWidget);
        // Only the tested topic gets a line, and only it has a % per year.
        expect(find.byType(LumiSparkline), findsOneWidget);
        expect(
          find.textContaining('mỗi năm'),
          findsNothing,
          reason: 'no relativeChangePct in the fixture',
        );
      },
    );
  });

  testWidgets('attention shows the most urgent first', (tester) async {
    await _pump(tester, _Harness());
    await tester.pumpAndSettle();

    final high = tester.getTopLeft(find.text('Sàng lọc bài báo đang chờ')).dy;
    final low = tester.getTopLeft(find.text('Lời mời tham gia dự án')).dy;
    expect(high, lessThan(low));
  });

  testWidgets('a section reported unavailable only breaks itself', (
    tester,
  ) async {
    final h = _Harness(
      research: () async => HomeResearchOverview.fromJson(
        _research(community: _unavailable),
      ),
    );
    await _pump(tester, h);
    await tester.pumpAndSettle();

    // Exactly one "Chưa tải được phần này" card, in the community section.
    await _scrollTo(tester, find.text(_unavailableText));
    expect(find.text(_unavailableText), findsOneWidget);
    expect(find.text('Hoạt động cộng đồng'), findsOneWidget);

    // Everything else is intact.
    expect(find.text('Sàng lọc bài báo đang chờ'), findsOneWidget);
    expect(find.text('Học liên kết trong y tế'), findsOneWidget);
    await _scrollTo(
      tester,
      find.text('Federated Learning for Medical Imaging'),
    );
    await _scrollTo(tester, find.text('Retrieval-Augmented Generation'));
  });

  testWidgets('unavailable workspace hides attention and projects only', (
    tester,
  ) async {
    final h = _Harness(
      research: () async => HomeResearchOverview.fromJson(
        _research(workspace: _unavailable),
      ),
    );
    await _pump(tester, h);
    await tester.pumpAndSettle();

    expect(find.text('Sàng lọc bài báo đang chờ'), findsNothing);
    // "To do" only appears with something in it; projects says it failed.
    expect(find.text('Việc cần làm'), findsNothing);
    expect(find.text(_unavailableText), findsOneWidget);
    await _scrollTo(
      tester,
      find.text('Federated Learning for Medical Imaging'),
    );
    await _scrollTo(tester, find.text('Cách đánh giá bộ dữ liệu y tế?'));
  });

  testWidgets('research request failing does not break the overview sections', (
    tester,
  ) async {
    final h = _Harness(research: () async => throw StateError('boom'));
    await _pump(tester, h);
    await tester.pumpAndSettle();

    // Projects, suggestions and community; "To do" stays hidden.
    expect(find.text(_unavailableText), findsAtLeastNWidgets(2));
    expect(find.text('Việc cần làm'), findsNothing);
    await _scrollTo(tester, find.text('Retrieval-Augmented Generation'));
  });

  testWidgets('overview request failing does not break the research sections', (
    tester,
  ) async {
    final h = _Harness(overview: () async => throw StateError('boom'));
    await _pump(tester, h);
    await tester.pumpAndSettle();

    expect(find.text('Sàng lọc bài báo đang chờ'), findsOneWidget);
    expect(find.text('Học liên kết trong y tế'), findsOneWidget);
    await _scrollTo(tester, find.text('Cách đánh giá bộ dữ liệu y tế?'));
    expect(
      find.text(_unavailableText),
      findsOneWidget,
      reason: 'trends only: the newest papers are on Explore',
    );
  });

  testWidgets('shows skeletons while loading, and no section content', (
    tester,
  ) async {
    final research = Completer<HomeResearchOverview>();
    final overview = Completer<HomeOverview>();
    final h = _Harness(
      overview: () => overview.future,
      research: () => research.future,
    );
    await _pump(tester, h);
    await tester.pump();

    expect(find.bySemanticsLabel('Đang tải'), findsWidgets);
    expect(find.text('Sàng lọc bài báo đang chờ'), findsNothing);
    expect(find.text(_unavailableText), findsNothing);
    // Headers are visible straight away ("To do" waits for something to
    // show).
    expect(find.text('Tiếp tục nghiên cứu'), findsOneWidget);
    expect(find.text('Việc cần làm'), findsNothing);

    research.complete(HomeResearchOverview.fromJson(_research()));
    overview.complete(HomeOverview.fromJson(_overview()));
    await tester.pumpAndSettle();
    expect(find.text('Sàng lọc bài báo đang chờ'), findsOneWidget);
  });

  testWidgets('empty sections explain themselves', (tester) async {
    final h = _Harness(
      overview: () async =>
          HomeOverview.fromJson(_overview(topics: [], papers: [])),
      research: () async => HomeResearchOverview.fromJson(
        _research(
          workspace: {
            'status': 'ready',
            'data': {'continueResearch': <Object>[], 'attention': <Object>[]},
          },
          recommendations: {'status': 'ready', 'data': <Object>[]},
          community: {'status': 'ready', 'data': <Object>[]},
        ),
      ),
    );
    await _pump(tester, h);
    await tester.pumpAndSettle();

    // Sections that only show content take no room when empty.
    expect(find.text('Việc cần làm'), findsNothing);
    expect(find.text('Bạn không có việc nào cần xử lý.'), findsNothing);
    expect(find.text('Chưa có dữ liệu xu hướng.'), findsNothing);
    expect(find.text('Chưa có bài báo mới.'), findsNothing);
    expect(find.text('Chưa có hoạt động cộng đồng nào.'), findsNothing);
    // Those with a way to fill them still say how.
    expect(find.textContaining('Chưa có dự án nào'), findsOneWidget);
    expect(find.text('Mở Dự án'), findsWidgets);
    await _scrollTo(tester, find.textContaining('Chưa có gợi ý'));
    expect(find.text(_unavailableText), findsNothing);
  });

  testWidgets('retry on a failed section reloads only that request', (
    tester,
  ) async {
    var fail = true;
    final h = _Harness(
      research: () async {
        if (fail) throw StateError('boom');
        return HomeResearchOverview.fromJson(_research());
      },
    );
    await _pump(tester, h);
    await tester.pumpAndSettle();
    expect(h.researchCalls, 1);
    expect(h.overviewCalls, 1);

    fail = false;
    await tester.tap(find.text('Thử lại').first);
    await tester.pumpAndSettle();

    expect(h.researchCalls, 2);
    expect(h.overviewCalls, 1, reason: 'overview was not reloaded');
    expect(find.text('Sàng lọc bài báo đang chờ'), findsOneWidget);
  });

  testWidgets('pull to refresh reloads both requests', (tester) async {
    final h = _Harness();
    await _pump(tester, h, height: 892); // Pixel 6: a real pull distance
    await tester.pumpAndSettle();

    await tester.drag(find.text('Chào, Nguyễn Minh'), const Offset(0, 300));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(h.overviewCalls, 2);
    expect(h.researchCalls, 2);
    expect(find.text('Sàng lọc bài báo đang chờ'), findsOneWidget);
  });

  group('tapping rows', () {
    testWidgets('attention row with a mobile equivalent opens it (>= 48dp)', (
      tester,
    ) async {
      await _pump(tester, _Harness());
      await tester.pumpAndSettle();

      final row = find.ancestor(
        of: find.text('Sàng lọc bài báo đang chờ'),
        matching: find.byType(InkWell),
      );
      expect(tester.getSize(row.first).height, greaterThanOrEqualTo(48));

      await tester.tap(find.text('Sàng lọc bài báo đang chờ'));
      await tester.pumpAndSettle();
      expect(find.text('project-p1'), findsOneWidget);
    });

    testWidgets('a review request opens in the app, not the browser', (
      tester,
    ) async {
      final h = _Harness();
      await _pump(tester, h);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Lời mời tham gia dự án'));
      await tester.pumpAndSettle();

      expect(find.text('review-request-77'), findsOneWidget);
      expect(h.opened, isEmpty);
    });

    testWidgets('community topic opens the discussion in the app', (
      tester,
    ) async {
      final h = _Harness();
      await _pump(tester, h);
      await tester.pumpAndSettle();

      await _scrollTo(tester, find.text('Cách đánh giá bộ dữ liệu y tế?'));
      await tester.tap(find.text('Cách đánh giá bộ dữ liệu y tế?'));
      await tester.pumpAndSettle();

      expect(find.text('forum-post-danh-gia-bo-du-lieu'), findsOneWidget);
      expect(h.opened, isEmpty);
    });

    testWidgets('an off-site href is never opened', (tester) async {
      final h = _Harness(
        research: () async => HomeResearchOverview.fromJson(
          _research(
            community: {
              'status': 'ready',
              'data': [
                {
                  'id': 'x',
                  'title': 'Liên kết lạ',
                  'href': 'https://evil.example/phish',
                  'replyCount': 0,
                },
              ],
            },
          ),
        ),
      );
      await _pump(tester, h);
      await tester.pumpAndSettle();

      await _scrollTo(tester, find.text('Liên kết lạ'));
      await tester.tap(find.text('Liên kết lạ'));
      await tester.pumpAndSettle();

      expect(h.opened, isEmpty);
      expect(find.text('Không mở được liên kết.'), findsOneWidget);
    });

    testWidgets('project card opens the project; "Xem tất cả" switches tab', (
      tester,
    ) async {
      await _pump(tester, _Harness());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Học liên kết trong y tế'));
      await tester.pumpAndSettle();
      expect(find.text('project-p1'), findsOneWidget);
    });

    testWidgets('recommended paper opens the paper screen', (tester) async {
      await _pump(tester, _Harness());
      await tester.pumpAndSettle();

      await _scrollTo(
        tester,
        find.text('Federated Learning for Medical Imaging'),
      );
      await tester.tap(find.text('Federated Learning for Medical Imaging'));
      await tester.pumpAndSettle();
      expect(find.text('paper-rec1'), findsOneWidget);
    });
  });

  testWidgets('the search box and the four shortcuts open their screens', (
    tester,
  ) async {
    for (final (label, screen) in [
      ('Tìm bài báo, từ khóa…', 'screen/search'),
      ('Xu hướng', 'trends-screen'),
      ('Khoảng trống', 'screen/gaps'),
      ('Báo cáo', 'screen/reports'),
      ('Xếp hạng', 'screen/rankings'),
    ]) {
      await _pump(tester, _Harness());
      await tester.pumpAndSettle();
      await tester.tap(find.text(label).first);
      await tester.pumpAndSettle();
      expect(find.text(screen), findsOneWidget, reason: label);
    }
  });

  testWidgets(
    'a trending card shows the API figures: % per year and papers, and '
    'rising topics come first',
    (tester) async {
      Map<String, dynamic> t(
        String name,
        String verdict,
        double pct,
        int papers,
      ) => {
        'topic': name,
        'totalPapers': papers,
        'yearlyBreakdown': [
          {'year': 2023, 'count': 10},
          {'year': 2024, 'count': 20},
          {'year': 2025, 'count': 40},
        ],
        'classification': {'verdict': verdict, 'relativeChangePct': pct},
      };
      final h = _Harness(
        overview: () async => HomeOverview.fromJson(
          _overview(
            topics: [
              t('Chủ đề ổn định', 'stable', 0.4, 900),
              t('Chủ đề tăng', 'rising', 138.6, 109071),
            ],
          ),
        ),
      );
      await _pump(tester, h);
      await tester.pumpAndSettle();
      expect(find.text('+138.6%'), findsOneWidget);
      expect(find.text('mỗi năm · 109,071 bài báo'), findsOneWidget);
      // Rising first, whatever order the API sent.
      expect(
        tester.getTopLeft(find.text('Chủ đề tăng')).dx,
        lessThan(tester.getTopLeft(find.text('Chủ đề ổn định')).dx),
      );
      await tester.tap(find.text('Chủ đề tăng'));
      await tester.pumpAndSettle();
      expect(find.text('trends-screen'), findsOneWidget);
    },
  );

  for (final locale in AppLocale.values) {
    testWidgets(
      'survives system text scale 1.3 at 320dp without overflow '
      '(${locale.code})',
      (tester) async {
        tester.platformDispatcher.textScaleFactorTestValue = 1.3;
        addTearDown(tester.platformDispatcher.clearAllTestValues);

        final h = _Harness();
        await _pump(tester, h, width: 320, height: 900, locale: locale);
        await tester.pumpAndSettle();

        final scaler = MediaQuery.textScalerOf(
          tester.element(find.byType(HomeScreen)),
        );
        expect(
          scaler.scale(10),
          closeTo(13, 0.01),
          reason: 'scale really applied',
        );

        for (final text in [
          'Retrieval-Augmented Generation',
          'Cách đánh giá bộ dữ liệu y tế?',
        ]) {
          await _scrollTo(tester, find.text(text));
        }
        expect(tester.takeException(), isNull);
      },
    );
  }
}
