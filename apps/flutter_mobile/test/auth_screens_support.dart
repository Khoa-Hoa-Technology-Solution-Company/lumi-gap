import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/auth/data/auth_failure.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/presentation/login_screen.dart';
import 'package:flutter_mobile/features/auth/presentation/register_screen.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';

/// Signed-out controller that records every sign-in / register call and
/// answers with the configured result. No network, no secure storage.
///
/// With [gate] set, a call stays in flight until the gate completes, which is
/// how the tests look at the "busy" form and try to submit twice.
class RecordingAuthController extends AuthController {
  RecordingAuthController({this.loginResult, this.registerResult, this.gate});

  AuthFailure? loginResult;
  AuthFailure? registerResult;
  Completer<void>? gate;

  final List<({String email, String password})> loginCalls = [];
  final List<({String email, String password, String fullName})>
      registerCalls = [];

  @override
  AsyncValue<User?> build() => const AsyncData(null);

  @override
  Future<AuthFailure?> login(String email, String password) async {
    loginCalls.add((email: email, password: password));
    await gate?.future;
    if (loginResult == null) state = AsyncData(testUser());
    return loginResult;
  }

  @override
  Future<AuthFailure?> register(
    String email,
    String password,
    String fullName,
  ) async {
    registerCalls
        .add((email: email, password: password, fullName: fullName));
    await gate?.future;
    if (registerResult == null) state = AsyncData(testUser());
    return registerResult;
  }
}

/// The three auth routes with the real sign-in and register screens, plus the
/// same "signed in means not on an auth screen" redirect as the app router.
/// `/forgot-password` and `/` are stubs that print what they were opened with.
GoRouter buildAuthRouter(
  ProviderContainer container, {
  String initialLocation = '/login',
}) {
  final refresh = ValueNotifier<int>(0);
  container.listen(authControllerProvider, (_, _) => refresh.value++);
  return GoRouter(
    initialLocation: initialLocation,
    refreshListenable: refresh,
    redirect: (context, state) {
      final user = container.read(authControllerProvider).value;
      final onAuth = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register' ||
          state.matchedLocation == '/forgot-password';
      if (user != null && onAuth) return '/';
      if (user == null && !onAuth) return '/login';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, state) => LoginScreen(
          initialEmail: state.uri.queryParameters['email'] ?? '',
        ),
      ),
      GoRoute(
        path: '/register',
        builder: (_, state) => RegisterScreen(
          initialEmail: state.uri.queryParameters['email'] ?? '',
        ),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (_, state) => Scaffold(
          body: Text('forgot:${state.uri.queryParameters['email'] ?? ''}'),
        ),
      ),
      GoRoute(
        path: '/',
        builder: (_, _) => const Scaffold(body: Text('home')),
      ),
    ],
  );
}

/// Pumps the auth router. Returns the controller so a test can read the calls.
Future<({RecordingAuthController auth, GoRouter router})> pumpAuth(
  WidgetTester tester, {
  RecordingAuthController? auth,
  String initialLocation = '/login',
  AppLocale locale = AppLocale.en,
  Brightness brightness = Brightness.light,
  Size? size,
  double textScale = 1,
}) async {
  final controller = auth ?? RecordingAuthController();
  if (size != null) {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }
  final container = ProviderContainer(
    overrides: [authControllerProvider.overrideWith(() => controller)],
  );
  addTearDown(container.dispose);
  final router = buildAuthRouter(container, initialLocation: initialLocation);
  addTearDown(router.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
        routerConfig: router,
        locale: locale.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: brightness == Brightness.dark
            ? AppTheme.darkTheme
            : AppTheme.lightTheme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (auth: controller, router: router);
}

/// The text box of the [LumiTextField] whose label is [label].
Finder fieldLabelled(String label) => find.descendant(
      of: find.byWidgetPredicate(
        (w) => w is LumiTextField && w.label == label,
      ),
      matching: find.byType(TextField),
    );
