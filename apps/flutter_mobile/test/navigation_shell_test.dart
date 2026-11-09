import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/theme_provider.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/explore/presentation/explore_screen.dart';
import 'package:flutter_mobile/features/home/presentation/app_shell_screen.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_mobile/features/profile/presentation/profile_screen.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

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

Future<GoRouter> _pumpApp(WidgetTester tester) async {
  final router = _buildRouter();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(_SignedOutAuth.new),
        notificationsProvider.overrideWith((ref) async => <AppNotification>[]),
        bookmarksProvider.overrideWith((ref) async => <Bookmark>[]),
        reportsProvider.overrideWith(
          (ref, params) async => const ReportsList(reports: [], total: 0),
        ),
      ],
      child: MaterialApp.router(
        theme: AppTheme.lightTheme,
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

Finder _tab(String label) =>
    find.descendant(of: find.byType(NavigationBar), matching: find.text(label));

void main() {
  testWidgets('shows exactly 4 labelled destinations', (tester) async {
    await _pumpApp(tester);

    expect(find.byType(NavigationDestination), findsNWidgets(4));
    for (final label in ['Trang chủ', 'Khám phá', 'Dự án', 'Hồ sơ']) {
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
    expect(find.text('Công cụ phân tích'), findsOneWidget);

    await tester.tap(_tab('Dự án'));
    await tester.pumpAndSettle();
    expect(find.text('tab-projects'), findsOneWidget);

    await tester.tap(_tab('Hồ sơ'));
    await tester.pumpAndSettle();
    expect(find.text('ACTIVITY'), findsOneWidget);

    await tester.tap(_tab('Trang chủ'));
    await tester.pumpAndSettle();
    expect(find.text('tab-home'), findsOneWidget);
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

  testWidgets('Explore: search box opens /search and entries are >= 48dp', (
    tester,
  ) async {
    await _pumpApp(tester);
    await tester.tap(_tab('Khám phá'));
    await tester.pumpAndSettle();

    for (final entry in ExploreScreen.entries) {
      final tile = find.widgetWithText(ListTile, entry.title);
      expect(tile, findsOneWidget);
      expect(tester.getSize(tile).height, greaterThanOrEqualTo(48));
    }
    expect(ExploreScreen.entries.map((e) => e.route).toSet(), {
      '/trends',
      '/reports',
      '/gaps',
      '/rankings',
    });

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

    final row = find.descendant(
      of: find.byType(Card),
      matching: find.text('Bookmarks'),
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
