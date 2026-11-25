
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/storage/secure_token_store.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_brand_logo.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/auth_failure.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';

const _tokens = AuthTokens(accessToken: 'access', refreshToken: 'refresh');

/// Sign-in / register answers for the real [AuthController].
class _SessionApi extends FakeAuthApi {
  Object? loginError;
  Object? registerError;
  final List<LoginRequest> logins = [];
  final List<RegisterRequest> registers = [];
  int profileUpdates = 0;

  @override
  Future<AuthResponse> login(LoginRequest request) async {
    logins.add(request);
    // ignore: only_throw_errors, the test injects whatever AuthApi may throw
    if (loginError != null) throw loginError!;
    return AuthResponse(user: testUser(), tokens: _tokens);
  }

  @override
  Future<AuthResponse> register(RegisterRequest request) async {
    registers.add(request);
    // ignore: only_throw_errors, the test injects whatever AuthApi may throw
    if (registerError != null) throw registerError!;
    return AuthResponse(user: testUser(id: 'new'), tokens: _tokens);
  }

  @override
  Future<User> updateAcademicProfile(AcademicProfileType type) async {
    profileUpdates++;
    return testUser();
  }
}

Future<ProviderContainer> _container(_SessionApi api) async {
  FlutterSecureStorage.setMockInitialValues({});
  final container = ProviderContainer(
    overrides: [authApiProvider.overrideWithValue(api)],
  );
  addTearDown(container.dispose);
  // Let the start-up session check finish: no stored tokens, signed out.
  container.read(authControllerProvider);
  for (var i = 0; i < 20; i++) {
    if (!container.read(authControllerProvider).isLoading) break;
    await Future<void>.delayed(Duration.zero);
  }
  expect(container.read(authControllerProvider).value, isNull);
  expect(container.read(authControllerProvider).isLoading, isFalse);
  return container;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('start-up session check', () {
    Future<ProviderContainer> start(Future<User> Function() me) async {
      FlutterSecureStorage.setMockInitialValues({});
      await const SecureTokenStore().save(_tokens);
      final container = ProviderContainer(
        overrides: [
          authApiProvider.overrideWithValue(FakeAuthApi(onMe: me)),
        ],
      );
      addTearDown(container.dispose);
      container.read(authControllerProvider);
      for (var i = 0; i < 50; i++) {
        if (!container.read(authControllerProvider).isLoading) break;
        await Future<void>.delayed(Duration.zero);
      }
      return container;
    }

    DioException failure({int? status}) => DioException(
          requestOptions: RequestOptions(path: '/auth/me'),
          type: status == null
              ? DioExceptionType.connectionError
              : DioExceptionType.badResponse,
          response: status == null
              ? null
              : Response<void>(
                  requestOptions: RequestOptions(path: '/auth/me'),
                  statusCode: status,
                ),
        );

    test('offline: the session is kept and a retry is offered', () async {
      var online = false;
      final container = await start(() async {
        if (!online) throw failure();
        return testUser();
      });
      final auth = container.read(authControllerProvider);
      expect(auth.hasError, isTrue);
      expect(auth.value, isNull);
      expect(await const SecureTokenStore().read(), isNotNull);

      online = true;
      await container.read(authControllerProvider.notifier).retryStartup();
      expect(container.read(authControllerProvider).value?.id, testUser().id);
    });

    test('a server error is not a sign-out either', () async {
      final container = await start(() async => throw failure(status: 503));
      expect(container.read(authControllerProvider).hasError, isTrue);
      expect(await const SecureTokenStore().read(), isNotNull);
    });

    test('a rejected session (401) signs out and drops the tokens', () async {
      final container = await start(() async => throw failure(status: 401));
      final auth = container.read(authControllerProvider);
      expect(auth.hasError, isFalse);
      expect(auth.value, isNull);
      expect(await const SecureTokenStore().read(), isNull);
    });
  });

  group('AuthController.register', () {
    test('signs the new account in and keeps its tokens', () async {
      final api = _SessionApi();
      final container = await _container(api);

      final failure = await container
          .read(authControllerProvider.notifier)
          .register('minh@fpt.edu.vn', 'Abcdefghi1', 'Minh Nguyen');

      expect(failure, isNull);
      expect(container.read(authControllerProvider).value?.id, 'new');
      expect(api.registers.single.email, 'minh@fpt.edu.vn');
      expect(api.registers.single.fullName, 'Minh Nguyen');
      // No role is set during register and no second sign-in is needed.
      expect(api.profileUpdates, 0);
      expect(api.logins, isEmpty);
      final stored = await const SecureTokenStore().read();
      expect(stored?.refreshToken, 'refresh');
    });

    test('a taken email leaves the app signed out with no tokens', () async {
      final api = _SessionApi()..registerError = httpFailure(409);
      final container = await _container(api);

      final failure = await container
          .read(authControllerProvider.notifier)
          .register('minh@fpt.edu.vn', 'Abcdefghi1', 'Minh Nguyen');

      expect(failure, AuthFailure.emailTaken);
      final state = container.read(authControllerProvider);
      expect(state.hasError, isFalse);
      expect(state.isLoading, isFalse);
      expect(state.value, isNull);
      expect(await const SecureTokenStore().read(), isNull);
    });
  });

  group('AuthController.login', () {
    test('success stores tokens and the user', () async {
      final api = _SessionApi();
      final container = await _container(api);

      final failure = await container
          .read(authControllerProvider.notifier)
          .login('minh@fpt.edu.vn', 'x');

      expect(failure, isNull);
      expect(container.read(authControllerProvider).value?.id, 'u1');
      expect((await const SecureTokenStore().read())?.accessToken, 'access');
    });

    test('each failure is classified and the state returns to signed out',
        () async {
      final cases = <Object, AuthFailure>{
        httpFailure(401): AuthFailure.invalidCredentials,
        httpFailure(403): AuthFailure.accountBlocked,
        httpFailure(429): AuthFailure.rateLimited,
        networkFailure(): AuthFailure.offline,
        StateError('boom'): AuthFailure.other,
      };
      for (final MapEntry(key: error, value: expected) in cases.entries) {
        final api = _SessionApi()..loginError = error;
        final container = await _container(api);
        final failure = await container
            .read(authControllerProvider.notifier)
            .login('minh@fpt.edu.vn', 'x');
        expect(failure, expected);
        final state = container.read(authControllerProvider);
        expect(state.hasError, isFalse, reason: '$expected');
        expect(state.isLoading, isFalse, reason: '$expected');
        expect(state.value, isNull, reason: '$expected');
      }
    });
  });

  group('LumiBrandLogo', () {
    Future<void> pump(WidgetTester tester, ThemeData theme) =>
        tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: const Scaffold(body: Center(child: LumiBrandLogo())),
          ),
        );

    String assetOf(WidgetTester tester) =>
        (tester.widget<Image>(find.byType(Image)).image as AssetImage)
            .assetName;

    testWidgets('light theme uses the light artwork, dark the dark one',
        (tester) async {
      await pump(tester, AppTheme.lightTheme);
      expect(assetOf(tester), LumiBrandLogo.lightAsset);
      await pump(tester, AppTheme.darkTheme);
      // MaterialApp animates between themes; wait for the dark one.
      await tester.pumpAndSettle();
      expect(assetOf(tester), LumiBrandLogo.darkAsset);
    });

    testWidgets('is announced as LumiGap and keeps the artwork ratio',
        (tester) async {
      await pump(tester, AppTheme.lightTheme);
      expect(find.bySemanticsLabel('LumiGap'), findsOneWidget);
      final size = tester.getSize(find.byType(Image));
      expect(size.height, 56);
      expect(size.width / size.height, closeTo(1412 / 384, 0.01));
    });

    test('both artwork files are bundled', () async {
      for (final asset in [LumiBrandLogo.lightAsset, LumiBrandLogo.darkAsset]) {
        final data = await rootBundle.load(asset);
        expect(data.lengthInBytes, greaterThan(1000), reason: asset);
      }
    });
  });
}
