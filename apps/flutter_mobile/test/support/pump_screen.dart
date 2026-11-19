import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../auth_test_support.dart';

/// Pumps [screen] at `/` signed in as [testUser] (English), with a stub for
/// any route it opens: `route:<path>` is shown there, so a test can see
/// where a tap went. Returns the router.
Future<GoRouter> pumpScreen(
  WidgetTester tester,
  Widget screen, {
  List<Override> overrides = const [],
  Size size = const Size(412, 2000),
  User? user,
}) async {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => screen),
      GoRoute(
        path: '/:rest(.*)',
        builder: (_, s) => Scaffold(body: Text('route:${s.uri}')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        authControllerProvider.overrideWith(() => FakeAuthController(user ?? testUser())),
        ...overrides,
      ],
      child: MaterialApp.router(
        routerConfig: router,
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}
