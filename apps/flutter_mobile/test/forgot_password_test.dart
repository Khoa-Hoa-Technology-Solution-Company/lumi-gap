import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/router/app_router.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/recovery_failure.dart';
import 'package:flutter_mobile/features/auth/presentation/forgot_password_screen.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';
import 'i18n_support.dart';

Future<void> _pumpForgot(
  WidgetTester tester,
  FakeAuthApi api, {
  String initialEmail = '',
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [authApiProvider.overrideWithValue(api)],
      child: MaterialApp(
        locale: AppLocale.vi.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: ForgotPasswordScreen(initialEmail: initialEmail),
      ),
    ),
  );
}

Future<void> _enterAndSend(WidgetTester tester, String email) async {
  await tester.enterText(find.byType(TextField), email);
  await tester.tap(find.text('Gửi hướng dẫn'));
  await tester.pump();
}

void main() {
  group('validateRecoveryEmail', () {
    test('rejects empty and malformed, accepts trimmed valid', () {
      expect(vi(validateRecoveryEmail('')!), 'Vui lòng nhập email');
      expect(vi(validateRecoveryEmail('   ')!), 'Vui lòng nhập email');
      expect(vi(validateRecoveryEmail('abc')!), 'Email không hợp lệ');
      expect(vi(validateRecoveryEmail('a@b')!), 'Email không hợp lệ');
      expect(vi(validateRecoveryEmail('a b@c.vn')!), 'Email không hợp lệ');
      expect(validateRecoveryEmail(' minh@fpt.edu.vn '), isNull);
    });
  });

  group('classifyRecoveryError', () {
    test('maps 429, connection problems and the rest', () {
      expect(
        classifyRecoveryError(httpFailure(429)),
        RecoveryFailure.rateLimited,
      );
      expect(classifyRecoveryError(networkFailure()), RecoveryFailure.offline);
      expect(
        classifyRecoveryError(httpFailure(400)),
        RecoveryFailure.invalidEmail,
      );
      expect(classifyRecoveryError(httpFailure(500)), RecoveryFailure.other);
      expect(classifyRecoveryError(StateError('x')), RecoveryFailure.other);
    });
  });

  group('ForgotPasswordScreen', () {
    testWidgets(
      'malformed email shows the error under the field, no API call',
      (tester) async {
        final api = FakeAuthApi();
        await _pumpForgot(tester, api);

        await _enterAndSend(tester, 'not-an-email');

        expect(find.text('Email không hợp lệ'), findsOneWidget);
        expect(api.forgotCalls, isEmpty);
        expect(find.text(vi(forgotPasswordSuccessMessage)), findsNothing);
      },
    );

    testWidgets('empty email asks for an email, no API call', (tester) async {
      final api = FakeAuthApi();
      await _pumpForgot(tester, api);

      await tester.tap(find.text('Gửi hướng dẫn'));
      await tester.pump();

      expect(find.text('Vui lòng nhập email'), findsOneWidget);
      expect(api.forgotCalls, isEmpty);
    });

    testWidgets('the error clears as soon as the user edits the email', (
      tester,
    ) async {
      await _pumpForgot(tester, FakeAuthApi());
      await _enterAndSend(tester, 'x');
      expect(find.text('Email không hợp lệ'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'x@');
      await tester.pump();
      expect(find.text('Email không hợp lệ'), findsNothing);
    });

    testWidgets('202 shows the same generic message for any email', (
      tester,
    ) async {
      // The fake accepts everything, exactly like the backend: it never says
      // whether the address has an account.
      for (final email in ['co-tai-khoan@fpt.edu.vn', 'khong-ton-tai@x.io']) {
        final api = FakeAuthApi();
        await tester.pumpWidget(const SizedBox()); // fresh State per email
        await _pumpForgot(tester, api);

        await _enterAndSend(tester, email);
        await tester.pump();

        expect(api.forgotCalls, [email]);
        expect(find.text(vi(forgotPasswordSuccessMessage)), findsOneWidget);
        expect(
          vi(forgotPasswordSuccessMessage),
          contains('Nếu email này có tài khoản'),
        );
        expect(find.textContaining(email), findsNothing);
        // The form is gone, so it cannot be resubmitted from here.
        expect(find.text('Gửi hướng dẫn'), findsNothing);
        expect(find.text('Quay lại đăng nhập'), findsOneWidget);
      }
    });

    testWidgets('trims the email before sending', (tester) async {
      final api = FakeAuthApi();
      await _pumpForgot(tester, api);

      await _enterAndSend(tester, '  minh@fpt.edu.vn  ');
      await tester.pump();

      expect(api.forgotCalls, ['minh@fpt.edu.vn']);
    });

    testWidgets('429 shows the rate-limit message and keeps the form', (
      tester,
    ) async {
      final api = FakeAuthApi(onForgot: (_) async => throw httpFailure(429));
      await _pumpForgot(tester, api);

      await _enterAndSend(tester, 'minh@fpt.edu.vn');
      await tester.pump();

      expect(
        find.text('Bạn đã thử quá nhiều lần, vui lòng thử lại sau.'),
        findsOneWidget,
      );
      expect(find.text(vi(forgotPasswordSuccessMessage)), findsNothing);
      expect(find.text('Gửi hướng dẫn'), findsOneWidget);
    });

    testWidgets('network error offers a retry that really retries', (
      tester,
    ) async {
      var fail = true;
      final api = FakeAuthApi(
        onForgot: (_) async {
          if (fail) throw networkFailure();
        },
      );
      await _pumpForgot(tester, api);

      await _enterAndSend(tester, 'minh@fpt.edu.vn');
      await tester.pump();
      expect(
        find.text('Không kết nối được. Kiểm tra mạng rồi thử lại.'),
        findsOneWidget,
      );

      fail = false;
      await tester.tap(find.text('Thử lại'));
      await tester.pump();
      await tester.pump();

      expect(api.forgotCalls, hasLength(2));
      expect(find.text(vi(forgotPasswordSuccessMessage)), findsOneWidget);
    });

    testWidgets('double tap sends exactly one request and locks the button', (
      tester,
    ) async {
      final gate = Completer<void>();
      final api = FakeAuthApi(onForgot: (_) => gate.future);
      await _pumpForgot(tester, api);
      await tester.enterText(find.byType(TextField), 'minh@fpt.edu.vn');

      final button = find.text('Gửi hướng dẫn');
      // Two taps with no frame in between: only the in-handler guard can stop
      // the second one.
      await tester.tap(button);
      await tester.tap(button);
      await tester.pump();

      expect(api.forgotCalls, hasLength(1));
      expect(find.text('Đang gửi…'), findsOneWidget);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
        reason: 'button is disabled while sending',
      );

      gate.complete();
      await tester.pump();
      await tester.pump();
      expect(api.forgotCalls, hasLength(1));
      expect(find.text(vi(forgotPasswordSuccessMessage)), findsOneWidget);
    });

    testWidgets('prefills the email passed from the login screen', (
      tester,
    ) async {
      await _pumpForgot(tester, FakeAuthApi(), initialEmail: 'minh@fpt.edu.vn');

      expect(find.text('minh@fpt.edu.vn'), findsOneWidget);
    });
  });

  group('router + login link', () {
    Future<GoRouter> pumpRouter(WidgetTester tester) async {
      late GoRouter router;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(() => FakeAuthController(null)),
            authApiProvider.overrideWithValue(FakeAuthApi()),
          ],
          child: Consumer(
            builder: (context, ref, _) {
              router = ref.watch(routerProvider);
              return MaterialApp.router(
                locale: AppLocale.vi.locale,
                supportedLocales: AppLocale.supportedLocales,
                localizationsDelegates: appLocalizationsDelegates,
                theme: AppTheme.lightTheme,
                routerConfig: router,
              );
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      return router;
    }

    testWidgets(
      'signed out: /forgot-password is public, not bounced to login',
      (tester) async {
        final router = await pumpRouter(tester);
        expect(
          find.text(vi('Sign in')),
          findsWidgets,
          reason: 'starts on login',
        );

        router.go('/forgot-password');
        await tester.pumpAndSettle();

        expect(find.byType(ForgotPasswordScreen), findsOneWidget);
      },
    );

    testWidgets(
      'login link is >= 48dp, opens the screen with email prefilled',
      (tester) async {
        await pumpRouter(tester);

        final link = find.widgetWithText(TextButton, 'Quên mật khẩu?');
        expect(link, findsOneWidget);
        expect(tester.getSize(link).height, greaterThanOrEqualTo(48));
        expect(tester.getSize(link).width, greaterThanOrEqualTo(48));

        await tester.enterText(find.byType(TextField).first, 'minh@fpt.edu.vn');
        await tester.tap(link);
        await tester.pumpAndSettle();

        expect(find.byType(ForgotPasswordScreen), findsOneWidget);
        expect(find.text('minh@fpt.edu.vn'), findsOneWidget);
      },
    );

    testWidgets('"Quay lại đăng nhập" with nothing to pop goes to /login', (
      tester,
    ) async {
      final router = await pumpRouter(tester);
      router.go('/forgot-password'); // replaces the stack: canPop() is false
      await tester.pumpAndSettle();
      expect(router.canPop(), isFalse);

      await tester.enterText(find.byType(TextField), 'minh@fpt.edu.vn');
      await tester.tap(find.text('Gửi hướng dẫn'));
      await tester.pump();
      await tester.pump();
      await tester.tap(find.text('Quay lại đăng nhập'));
      await tester.pumpAndSettle();

      expect(find.byType(ForgotPasswordScreen), findsNothing);
      expect(find.widgetWithText(TextButton, 'Quên mật khẩu?'), findsOneWidget);
    });

    testWidgets('"Quay lại đăng nhập" after push pops back to the login form', (
      tester,
    ) async {
      await pumpRouter(tester);
      await tester.tap(find.widgetWithText(TextButton, 'Quên mật khẩu?'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'minh@fpt.edu.vn');
      await tester.tap(find.text('Gửi hướng dẫn'));
      await tester.pump();
      await tester.pump();
      await tester.tap(find.text('Quay lại đăng nhập'));
      await tester.pumpAndSettle();

      expect(find.byType(ForgotPasswordScreen), findsNothing);
      expect(find.widgetWithText(TextButton, 'Quên mật khẩu?'), findsOneWidget);
    });

    testWidgets('login link works with an empty email field', (tester) async {
      await pumpRouter(tester);

      await tester.tap(find.widgetWithText(TextButton, 'Quên mật khẩu?'));
      await tester.pumpAndSettle();

      expect(find.byType(ForgotPasswordScreen), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
    });
  });
}
