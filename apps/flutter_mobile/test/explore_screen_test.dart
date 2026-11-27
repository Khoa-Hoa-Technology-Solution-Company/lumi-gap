import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/explore/presentation/explore_screen.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';

const Map<String, dynamic> _full = {
  'trends': {
    'topics': [
      {
        'topic': 'Federated learning',
        'totalPapers': 120,
        'yearlyBreakdown': [
          {'year': 2023, 'count': 10},
          {'year': 2024, 'count': 20},
          {'year': 2025, 'count': 40},
        ],
        'classification': {'verdict': 'rising', 'relativeChangePct': 12.5},
      },
    ],
    'risingKeywords': [
      // A rise that passed the test (z > 0, q < 0.05).
      {
        'keyword': 'large language models',
        'shift': {'z': 3.2, 'qValue': 0.01},
      },
      // Not significant: not "emerging" on Explore (Trends lists it).
      {
        'keyword': 'graph neural networks',
        'shift': {'z': 0, 'qValue': 0.8},
      },
      {
        'keyword': '',
        'shift': {'z': 2.0, 'qValue': 0.01},
      },
    ],
  },
  'recentPapers': [
    {'id': 'p1', 'title': 'A new paper', 'year': 2026, 'citationCount': 0},
  ],
};

Future<void> _pump(WidgetTester tester, Map<String, dynamic> json) async {
  tester.view
    ..physicalSize = const Size(412, 2000)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => const ExploreScreen()),
      GoRoute(
        path: '/search',
        builder: (_, s) =>
            Scaffold(body: Text('search q=${s.uri.queryParameters['q']}')),
      ),
      GoRoute(
        path: '/trends',
        builder: (_, _) => const Scaffold(body: Text('trends-screen')),
      ),
      GoRoute(
        path: '/paper/:id',
        builder: (_, s) =>
            Scaffold(body: Text('paper-${s.pathParameters['id']}')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        authControllerProvider.overrideWith(
          () => FakeAuthController(testUser()),
        ),
        notificationsProvider.overrideWith((ref) async => <AppNotification>[]),
        bookmarkStatusProvider.overrideWith(
          (ref, target) async => const BookmarkStatus(bookmarked: false),
        ),
        homeOverviewProvider.overrideWith(
          (ref) async => HomeOverview.fromJson(json),
        ),
      ],
      child: MaterialApp.router(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a rising keyword searches for itself', (tester) async {
    await _pump(tester, _full);
    // Only significant rises, and never an empty chip.
    expect(find.byType(ActionChip), findsOneWidget);
    expect(find.textContaining('graph neural networks'), findsNothing);
    // The test statistic is not shown to readers.
    expect(find.textContaining('z 3.2'), findsNothing);
    await tester.tap(find.textContaining('large language models'));
    await tester.pumpAndSettle();
    expect(find.text('search q=large language models'), findsOneWidget);
  });

  testWidgets('a new paper can be saved from the list, as on Home', (
    tester,
  ) async {
    await _pump(tester, _full);
    // The save button is on the row, and the long-press sheet offers it too
    // (never a one-item sheet that only repeats the tap).
    expect(find.byTooltip('Bookmark'), findsOneWidget);
    await tester.longPress(find.text('A new paper'));
    await tester.pumpAndSettle();
    expect(find.text('Open'), findsOneWidget);
    expect(find.text('Bookmark'), findsOneWidget);
  });

  testWidgets('a new paper opens the paper; trending topics stay on Home',
      (tester) async {
    await _pump(tester, _full);
    expect(find.text('Trending topics'), findsNothing);
    await tester.tap(find.text('A new paper'));
    await tester.pumpAndSettle();
    expect(find.text('paper-p1'), findsOneWidget);
  });

  testWidgets('with nothing to show it says how to start, once', (
    tester,
  ) async {
    await _pump(tester, const {});
    expect(
      find.text('Nothing to explore yet. Search for a topic to start.'),
      findsOneWidget,
    );
    expect(find.text('Trending topics'), findsNothing);
    expect(find.text('New papers'), findsNothing);
  });
}
