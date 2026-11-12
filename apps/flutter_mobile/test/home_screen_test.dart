import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/home_screen.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
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
        path: '/trends',
        builder: (_, _) => const Scaffold(body: Text('trends-screen')),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, _) => const Scaffold(body: Text('notifications-screen')),
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
    expect(find.text('Sàng lọc'), findsOneWidget, reason: 'stage chip');
    await _scrollTo(
      tester,
      find.text('Federated Learning for Medical Imaging'),
    );
    expect(find.text('federated learning'), findsOneWidget);
    expect(find.text('Liên quan dự án của bạn'), findsNothing);
    await _scrollTo(tester, find.text('Retrieval-Augmented Generation'));
    expect(find.text('Tăng'), findsOneWidget);
    await _scrollTo(tester, find.text('Một bài báo mới'));
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
      'growthRatePct': growth,
      'yearlyBreakdown': [
        {'year': 2024, 'count': 1},
        {'year': 2025, 'count': 2},
      ],
      'classification': ?classification,
    };

    testWidgets('all four verdicts, each with its own word, colour and icon', (
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

      void expectLabel(String text, IconData icon, Color color) {
        expect(find.text(text), findsOneWidget, reason: text);
        final row = find
            .ancestor(of: find.text(text), matching: find.byType(Row))
            .first;
        final iconWidget = tester.widget<Icon>(
          find.descendant(of: row, matching: find.byIcon(icon)),
        );
        expect(iconWidget.color, color, reason: text);
        expect(
          tester.widget<Text>(find.text(text)).style?.color,
          color,
          reason: text,
        );
      }

      expectLabel('Tăng', Icons.arrow_upward, lumi.success);
      expectLabel('Giảm', Icons.arrow_downward, lumi.error);
      expectLabel('Ổn định', Icons.arrow_forward, lumi.muted);
      expectLabel('Chưa đủ dữ liệu', Icons.remove, lumi.muted);
    });

    testWidgets(
      'a topic without classification reads "Chưa đủ dữ liệu", no arrow',
      (tester) async {
        final h = _Harness(
          overview: () async => HomeOverview.fromJson(
            _overview(topics: [topic('Chủ đề E', null, growth: 500)]),
          ),
        );
        await _pump(tester, h);
        await tester.pumpAndSettle();

        expect(find.text('Chưa đủ dữ liệu'), findsOneWidget);
        expect(find.text('Tăng'), findsNothing);
        expect(find.byIcon(Icons.arrow_upward), findsNothing);
        expect(find.byIcon(Icons.arrow_downward), findsNothing);
        expect(find.byIcon(Icons.arrow_forward), findsNothing);
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
    await _scrollTo(tester, find.text('Một bài báo mới'));
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
    expect(find.text(_unavailableText), findsAtLeastNWidgets(2));
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

    expect(find.text(_unavailableText), findsAtLeastNWidgets(4));
    await _scrollTo(tester, find.text('Retrieval-Augmented Generation'));
    await _scrollTo(tester, find.text('Một bài báo mới'));
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
      findsNWidgets(2),
      reason: 'trends + recent papers',
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
    // Headers are visible straight away.
    expect(find.text('Việc cần làm'), findsOneWidget);

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

    expect(find.text('Bạn không có việc nào cần xử lý.'), findsOneWidget);
    expect(find.textContaining('Chưa có dự án nào'), findsOneWidget);
    await _scrollTo(tester, find.text('Chưa có hoạt động cộng đồng nào.'));
    expect(find.text('Chưa có dữ liệu xu hướng.'), findsOneWidget);
    expect(find.text('Chưa có bài báo mới.'), findsOneWidget);
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

    testWidgets('attention row without a mobile screen opens the web page', (
      tester,
    ) async {
      final h = _Harness();
      await _pump(tester, h);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Lời mời tham gia dự án'));
      await tester.pumpAndSettle();

      expect(h.opened, [Uri.parse('https://lumigap.uk/review-requests/77')]);
      expect(find.text('project-p1'), findsNothing);
    });

    testWidgets('community topic opens the forum page on the web', (
      tester,
    ) async {
      final h = _Harness();
      await _pump(tester, h);
      await tester.pumpAndSettle();

      await _scrollTo(tester, find.text('Cách đánh giá bộ dữ liệu y tế?'));
      await tester.tap(find.text('Cách đánh giá bộ dữ liệu y tế?'));
      await tester.pumpAndSettle();

      expect(h.opened, [
        Uri.parse('https://lumigap.uk/forum/danh-gia-bo-du-lieu'),
      ]);
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
          'Một bài báo mới',
          'Cách đánh giá bộ dữ liệu y tế?',
        ]) {
          await _scrollTo(tester, find.text(text));
        }
        expect(tester.takeException(), isNull);
      },
    );
  }
}
