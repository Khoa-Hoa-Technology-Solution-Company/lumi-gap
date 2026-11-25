import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/theme_provider.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/explore/presentation/explore_screen.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/app_shell_screen.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_mobile/features/profile/presentation/profile_screen.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'i18n_support.dart';

class _SignedOutAuth extends AuthController {
  @override
  AsyncValue<User?> build() => const AsyncData(null);
}

GoRouter _buildRouter() {
  Widget stub(String text) => Scaffold(body: Center(child: Text(text)));
  return GoRouter(
    initialLocation: '/',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShellScreen(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/', builder: (_, _) => stub('tab-home')),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/explore',
                builder: (_, _) => const ExploreScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/projects',
                builder: (_, _) => stub('tab-projects'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/community',
                builder: (_, _) => stub('tab-community'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                builder: (_, _) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(path: '/bookmarks', builder: (_, _) => stub('bookmarks-screen')),
      GoRoute(
        path: '/notifications',
        builder: (_, _) => stub('notifications-screen'),
      ),
      GoRoute(path: '/search', builder: (_, _) => stub('search-screen')),
    ],
  );
}

/// The last "Flutter handles Back" value the app reported to the platform
/// (what WidgetsApp passes to SystemNavigator.setFrameworkHandlesBack).
bool? _handlesBack;

Future<GoRouter> _pumpApp(WidgetTester tester) async {
  _handlesBack = null;
  final router = _buildRouter();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(_SignedOutAuth.new),
        notificationsProvider.overrideWith((ref) async => <AppNotification>[]),
        bookmarksProvider.overrideWith((ref) async => <Bookmark>[]),
        // Explore shows trending topics from the home overview.
        homeOverviewProvider.overrideWith(
          (ref) async => const HomeOverview(topics: [], recentPapers: []),
        ),
        reportsProvider.overrideWith(
          (ref, params) async => const ReportsList(reports: [], total: 0),
        ),
      ],
      child: MaterialApp.router(
        builder: (context, child) =>
            NotificationListener<NavigationNotification>(
              onNotification: (n) {
                _handlesBack = n.canHandlePop;
                return false;
              },
              child: child!,
            ),
        locale: AppLocale.vi.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

/// A tab by the name screen readers hear (only the open tab shows it).
Finder _tab(String label) => find.descendant(
      of: find.byType(LumiFloatingNavBar),
      matching: find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.label == label,
      ),
    );

void main() {
  testWidgets('shows exactly 5 labelled destinations (Material 3 maximum)', (
    tester,
  ) async {
    await _pumpApp(tester);

    // Five tabs; the open one (Home) shows its name in the pill.
    expect(
      find.descendant(
        of: find.byType(LumiFloatingNavBar),
        matching: find.byType(InkWell),
      ),
      findsNWidgets(5),
    );
    expect(
      find.descendant(
        of: find.byType(LumiFloatingNavBar),
        matching: find.text('Trang chủ'),
      ),
      findsOneWidget,
    );
    for (final label in ['Trang chủ', 'Khám phá', 'Dự án', 'Cộng đồng', 'Hồ sơ']) {
      expect(_tab(label), findsOneWidget);
    }
    // Notifications moved to the bell; no "Alerts"/"Bookmarks" tab remains.
    expect(_tab('Alerts'), findsNothing);
    expect(_tab('Bookmarks'), findsNothing);
  });

  testWidgets('tapping each tab shows the matching screen', (tester) async {
    await _pumpApp(tester);
    expect(find.text('tab-home'), findsOneWidget);

    await tester.tap(_tab('Khám phá'));
    await tester.pumpAndSettle();
    expect(find.text('Tìm bài báo, từ khóa…'), findsOneWidget);

    await tester.tap(_tab('Dự án'));
    await tester.pumpAndSettle();
    expect(find.text('tab-projects'), findsOneWidget);

    await tester.tap(_tab('Cộng đồng'));
    await tester.pumpAndSettle();
    expect(find.text('tab-community'), findsOneWidget);

    await tester.tap(_tab('Hồ sơ'));
    await tester.pumpAndSettle();
    expect(find.text(vi('Activity')), findsOneWidget);

    await tester.tap(_tab('Trang chủ'));
    await tester.pumpAndSettle();
    expect(find.text('tab-home'), findsOneWidget);
  });

  testWidgets(
      'off Home the app tells Android it handles Back (predictive back '
      'would otherwise close the app); on Home it does not', (tester) async {
    final router = await _pumpApp(tester);
    await tester.pumpAndSettle();
    expect(_handlesBack, isFalse);

    router.go('/projects');
    await tester.pumpAndSettle();
    expect(_handlesBack, isTrue);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('tab-home'), findsOneWidget);
    expect(_handlesBack, isFalse);
  });

  testWidgets('Android Back on tab 2 returns to tab 0', (tester) async {
    final router = await _pumpApp(tester);

    router.go('/projects');
    await tester.pumpAndSettle();
    expect(find.text('tab-projects'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('tab-home'), findsOneWidget);
    expect(find.text('tab-projects'), findsNothing);
  });

  testWidgets(
      'Explore is for finding papers: the search box opens /search, and the '
      'analysis tools are not listed a second time', (tester) async {
    await _pumpApp(tester);
    await tester.tap(_tab('Khám phá'));
    await tester.pumpAndSettle();

    // Their one entry is the shortcut row on Home (home_screen_test).
    expect(find.text('Công cụ phân tích'), findsNothing);
    expect(find.text(vi('Leaderboard')), findsNothing);

    await tester.tap(find.text('Tìm bài báo, từ khóa…'));
    await tester.pumpAndSettle();
    expect(find.text('search-screen'), findsOneWidget);
  });

  testWidgets('/bookmarks opens from Profile and Back returns to Profile', (
    tester,
  ) async {
    await _pumpApp(tester);
    await tester.tap(_tab('Hồ sơ'));
    await tester.pumpAndSettle();

    // The menu row, not the "Bookmarks" counter above it.
    final row = find.descendant(
      of: find.byType(LumiRowGroup),
      matching: find.text(vi('Bookmarks')),
    );
    await tester.scrollUntilVisible(row, 200);
    await tester.pumpAndSettle();
    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(find.text('bookmarks-screen'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('bookmarks-screen'), findsNothing);
    expect(find.byType(ProfileScreen), findsOneWidget);
  });

  testWidgets('Profile theme sheet offers 3 modes and applies immediately', (
    tester,
  ) async {
    await _pumpApp(tester);
    await tester.tap(_tab('Hồ sơ'));
    await tester.pumpAndSettle();

    final container = ProviderScope.containerOf(
      tester.element(find.byType(ProfileScreen)),
    );
    expect(container.read(themeModeProvider), ThemeMode.system);

    await tester.scrollUntilVisible(find.text('Giao diện'), 200);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Giao diện'));
    await tester.pumpAndSettle();

    expect(find.byType(RadioListTile<ThemeMode>), findsNWidgets(3));
    for (final tile in tester.widgetList(
      find.byType(RadioListTile<ThemeMode>),
    )) {
      expect(
        tester.getSize(find.byWidget(tile)).height,
        greaterThanOrEqualTo(56),
      );
    }

    await tester.tap(find.text('Tối'));
    await tester.pumpAndSettle();
    expect(container.read(themeModeProvider), ThemeMode.dark);

    await tester.tap(find.text('Sáng'));
    await tester.pumpAndSettle();
    expect(container.read(themeModeProvider), ThemeMode.light);
  });
}
