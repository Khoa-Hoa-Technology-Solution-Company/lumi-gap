import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_brand_logo.dart';
import 'package:flutter_mobile/features/auth/data/auth_failure.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/presentation/login_screen.dart';
import 'package:flutter_mobile/features/auth/presentation/register_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_screens_support.dart';
import 'auth_test_support.dart';
import 'i18n_support.dart';

const _goodPassword = 'Abcdefghi1';

Future<void> _tapSubmit(WidgetTester tester, String label) async {
  await tester.ensureVisible(find.widgetWithText(FilledButton, label));
  await tester.tap(find.widgetWithText(FilledButton, label));
  await tester.pump();
}

void main() {
  group('auth validators', () {
    test('email: empty, malformed, trimmed valid', () {
      expect(validateAuthEmail(null), 'Please enter your email');
      expect(validateAuthEmail('   '), 'Please enter your email');
      expect(validateAuthEmail('abc'), 'Invalid email');
      expect(validateAuthEmail('a b@c.vn'), 'Invalid email');
      expect(validateAuthEmail(' minh@fpt.edu.vn '), isNull);
    });

    test('login password: only presence and the backend maximum', () {
      expect(validateLoginPassword(''), 'Please enter your password');
      expect(validateLoginPassword('x'), isNull);
      expect(validateLoginPassword('a' * 128), isNull);
      expect(
        validateLoginPassword('a' * 129),
        'Password must be at most 128 characters',
      );
    });

    test('new password follows the backend RegisterSchema', () {
      expect(validateNewPassword(''), 'Please enter your password');
      expect(
        validateNewPassword('Abcdefgh1'), // 9 characters
        'Password must be at least 10 characters',
      );
      expect(validateNewPassword(_goodPassword), isNull); // exactly 10
      expect(
        validateNewPassword('ABCDEFGHI1'),
        'Password must include a lowercase letter',
      );
      expect(
        validateNewPassword('abcdefghi1'),
        'Password must include an uppercase letter',
      );
      expect(
        validateNewPassword('Abcdefghij'),
        'Password must include a number',
      );
      final max = 'Aa1${'x' * 125}';
      expect(max.length, 128);
      expect(validateNewPassword(max), isNull);
      expect(
        validateNewPassword('${max}x'),
        'Password must be at most 128 characters',
      );
      // A space is a valid character and is not trimmed away.
      expect(validateNewPassword('Abc defgh 1'), isNull);
    });

    test('full name: required after trim, at most 120', () {
      expect(validateFullName(null), 'Please enter your full name');
      expect(validateFullName('   '), 'Please enter your full name');
      expect(validateFullName(' Minh '), isNull);
      expect(validateFullName('a' * 120), isNull);
      expect(
        validateFullName('a' * 121),
        'Full name must be at most 120 characters',
      );
    });

    test('every validator message and failure has a Vietnamese translation',
        () {
      final keys = <String>[
        for (final f in AuthFailure.values) f.message,
        passwordRulesHint,
        validateLoginPassword('')!,
        validateNewPassword('short')!,
        validateFullName('')!,
      ];
      for (final key in keys) {
        expect(vi(key), isNot(key), reason: key);
      }
    });
  });

  group('classifyAuthError', () {
    test('maps HTTP status and connection problems', () {
      expect(classifyAuthError(httpFailure(401)), AuthFailure.invalidCredentials);
      expect(classifyAuthError(httpFailure(403)), AuthFailure.accountBlocked);
      expect(classifyAuthError(httpFailure(409)), AuthFailure.emailTaken);
      expect(classifyAuthError(httpFailure(400)), AuthFailure.invalidInput);
      expect(classifyAuthError(httpFailure(422)), AuthFailure.invalidInput);
      expect(classifyAuthError(httpFailure(429)), AuthFailure.rateLimited);
      expect(classifyAuthError(httpFailure(500)), AuthFailure.other);
      expect(classifyAuthError(networkFailure()), AuthFailure.offline);
      expect(classifyAuthError(StateError('x')), AuthFailure.other);
    });
  });

  group('sign-in screen', () {
    testWidgets('shows the logo, heading and no dead controls', (tester) async {
      await pumpAuth(tester);
      expect(find.byType(LumiBrandLogo), findsOneWidget);
      expect(find.text('Welcome back!'), findsOneWidget);
      expect(find.textContaining('Google'), findsNothing);
      expect(find.textContaining('Terms'), findsNothing);
      expect(find.textContaining('Publication Trend'), findsNothing);
    });

    testWidgets('empty form: errors under each field, nothing is sent',
        (tester) async {
      final (:auth, router: _) = await pumpAuth(tester);
      await _tapSubmit(tester, 'Sign in');
      expect(find.text('Please enter your email'), findsOneWidget);
      expect(find.text('Please enter your password'), findsOneWidget);
      expect(auth.loginCalls, isEmpty);
    });

    testWidgets('errors clear as the user fixes the field', (tester) async {
      await pumpAuth(tester);
      await _tapSubmit(tester, 'Sign in');
      await tester.enterText(fieldLabelled('Email'), 'minh@fpt.edu.vn');
      await tester.pump();
      expect(find.text('Please enter your email'), findsNothing);
      expect(find.text('Please enter your password'), findsOneWidget);
    });

    testWidgets('sends the trimmed email and the password as typed',
        (tester) async {
      final (:auth, router: _) = await pumpAuth(tester);
      await tester.enterText(fieldLabelled('Email'), '  minh@fpt.edu.vn ');
      await tester.enterText(fieldLabelled('Password'), ' pass word ');
      await _tapSubmit(tester, 'Sign in');
      await tester.pumpAndSettle();
      expect(auth.loginCalls, [
        (email: 'minh@fpt.edu.vn', password: ' pass word '),
      ]);
      // Signed in: the router left the auth screens.
      expect(find.text('home'), findsOneWidget);
      expect(find.byType(LoginScreen), findsNothing);
    });

    testWidgets('two taps while the request is in flight send it once',
        (tester) async {
      final gate = Completer<void>();
      final auth = RecordingAuthController(gate: gate);
      await pumpAuth(tester, auth: auth);
      await tester.enterText(fieldLabelled('Email'), 'minh@fpt.edu.vn');
      await tester.enterText(fieldLabelled('Password'), 'x');
      // Two taps before the next frame: the button has not been rebuilt as
      // disabled yet, so only the guard inside the screen can stop the second.
      final submit = find.widgetWithText(FilledButton, 'Sign in');
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.tap(submit);
      await tester.pump();

      expect(find.text('Signing in…'), findsOneWidget);
      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
      // The keyboard "done" action goes through the same guard.
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();
      expect(auth.loginCalls, hasLength(1));

      gate.complete();
      await tester.pumpAndSettle();
      expect(find.text('home'), findsOneWidget);
    });

    testWidgets('wrong credentials: notice with a reset link, form usable again',
        (tester) async {
      final auth = RecordingAuthController(
        loginResult: AuthFailure.invalidCredentials,
      );
      await pumpAuth(tester, auth: auth);
      await tester.enterText(fieldLabelled('Email'), 'minh@fpt.edu.vn');
      await tester.enterText(fieldLabelled('Password'), 'wrong');
      await _tapSubmit(tester, 'Sign in');
      await tester.pumpAndSettle();

      expect(
        find.text(AuthFailure.invalidCredentials.message),
        findsOneWidget,
      );
      expect(find.byType(LoginScreen), findsOneWidget);
      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNotNull);

      await tester.ensureVisible(find.text('Reset password'));
      await tester.tap(find.text('Reset password'));
      await tester.pumpAndSettle();
      expect(find.text('forgot:minh@fpt.edu.vn'), findsOneWidget);
    });

    testWidgets('each failure shows its own message and never the raw error',
        (tester) async {
      for (final failure in [
        AuthFailure.accountBlocked,
        AuthFailure.rateLimited,
        AuthFailure.offline,
        AuthFailure.other,
      ]) {
        final auth = RecordingAuthController(loginResult: failure);
        await pumpAuth(tester, auth: auth);
        await tester.enterText(fieldLabelled('Email'), 'minh@fpt.edu.vn');
        await tester.enterText(fieldLabelled('Password'), 'x');
        await _tapSubmit(tester, 'Sign in');
        await tester.pumpAndSettle();
        expect(find.text(failure.message), findsOneWidget, reason: '$failure');
        expect(find.text('Reset password'), findsNothing, reason: '$failure');
        expect(find.textContaining('Exception'), findsNothing);
      }
    });

    testWidgets('a new attempt clears the previous notice', (tester) async {
      final auth = RecordingAuthController(loginResult: AuthFailure.offline);
      await pumpAuth(tester, auth: auth);
      await tester.enterText(fieldLabelled('Email'), 'minh@fpt.edu.vn');
      await tester.enterText(fieldLabelled('Password'), 'x');
      await _tapSubmit(tester, 'Sign in');
      await tester.pumpAndSettle();
      expect(find.text(AuthFailure.offline.message), findsOneWidget);

      auth
        ..loginResult = null
        ..gate = Completer<void>();
      await _tapSubmit(tester, 'Sign in');
      expect(find.text(AuthFailure.offline.message), findsNothing);
      auth.gate!.complete();
      await tester.pumpAndSettle();
      expect(find.text('home'), findsOneWidget);
    });

    testWidgets('forgot password and create account carry the typed email',
        (tester) async {
      final (auth: _, :router) = await pumpAuth(tester);
      await tester.enterText(fieldLabelled('Email'), 'minh@fpt.edu.vn');
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
      expect(find.text('forgot:minh@fpt.edu.vn'), findsOneWidget);

      router.pop();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Create account'));
      await tester.tap(find.text('Create account'));
      await tester.pumpAndSettle();
      expect(find.byType(RegisterScreen), findsOneWidget);
      final email = tester.widget<TextField>(fieldLabelled('Email'));
      expect(email.controller!.text, 'minh@fpt.edu.vn');
      // Replaced, not stacked: there is nothing to go back to.
      expect(router.canPop(), isFalse);
    });

    testWidgets('the password can be shown and hidden', (tester) async {
      await pumpAuth(tester);
      TextField field() => tester.widget<TextField>(fieldLabelled('Password'));
      expect(field().obscureText, isTrue);
      await tester.tap(find.byTooltip('Show password'));
      await tester.pump();
      expect(field().obscureText, isFalse);
      await tester.tap(find.byTooltip('Hide password'));
      await tester.pump();
      expect(field().obscureText, isTrue);
    });

    testWidgets('a signed-in user never sees the sign-in screen',
        (tester) async {
      final auth = _SignedIn();
      await pumpAuth(tester, auth: auth);
      expect(find.text('home'), findsOneWidget);
      expect(find.byType(LoginScreen), findsNothing);
    });
  });

  group('register screen', () {
    testWidgets('three fields, password rules shown up front, no role choice',
        (tester) async {
      await pumpAuth(tester, initialLocation: '/register');
      expect(find.text('Create an account'), findsOneWidget);
      expect(fieldLabelled('Full name'), findsOneWidget);
      expect(fieldLabelled('Email'), findsOneWidget);
      expect(fieldLabelled('Password'), findsOneWidget);
      expect(find.text(passwordRulesHint), findsOneWidget);
      for (final role in ['student', 'lecturer', 'researcher']) {
        expect(find.textContaining(role), findsNothing);
      }
      expect(find.textContaining('Google'), findsNothing);
    });

    testWidgets('weak password is rejected before any request', (tester) async {
      final (:auth, router: _) =
          await pumpAuth(tester, initialLocation: '/register');
      await tester.enterText(fieldLabelled('Full name'), 'Minh Nguyen');
      await tester.enterText(fieldLabelled('Email'), 'minh@fpt.edu.vn');
      await tester.enterText(fieldLabelled('Password'), 'abcdefghi1');
      await _tapSubmit(tester, 'Create account');
      expect(
        find.text('Password must include an uppercase letter'),
        findsOneWidget,
      );
      expect(auth.registerCalls, isEmpty);
    });

    testWidgets('empty form flags all three fields', (tester) async {
      final (:auth, router: _) =
          await pumpAuth(tester, initialLocation: '/register');
      await _tapSubmit(tester, 'Create account');
      expect(find.text('Please enter your full name'), findsOneWidget);
      expect(find.text('Please enter your email'), findsOneWidget);
      expect(find.text('Please enter your password'), findsOneWidget);
      expect(auth.registerCalls, isEmpty);
    });

    testWidgets('success: one request, trimmed name and email, signed in',
        (tester) async {
      final gate = Completer<void>();
      final auth = RecordingAuthController(gate: gate);
      await pumpAuth(tester, auth: auth, initialLocation: '/register');
      await tester.enterText(fieldLabelled('Full name'), '  Minh Nguyen ');
      await tester.enterText(fieldLabelled('Email'), ' minh@fpt.edu.vn ');
      await tester.enterText(fieldLabelled('Password'), _goodPassword);
      // Two taps in one frame must create the account once.
      final submit = find.widgetWithText(FilledButton, 'Create account');
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.tap(submit);
      await tester.pump();
      expect(find.text('Creating account…'), findsOneWidget);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();

      gate.complete();
      await tester.pumpAndSettle();
      expect(auth.registerCalls, [
        (
          email: 'minh@fpt.edu.vn',
          password: _goodPassword,
          fullName: 'Minh Nguyen',
        ),
      ]);
      // Signed in straight away, as on the web: no second sign-in.
      expect(find.text('home'), findsOneWidget);
      expect(auth.loginCalls, isEmpty);
    });

    testWidgets('email already registered: notice with a sign-in link',
        (tester) async {
      final auth =
          RecordingAuthController(registerResult: AuthFailure.emailTaken);
      final (auth: _, :router) =
          await pumpAuth(tester, auth: auth, initialLocation: '/register');
      await tester.enterText(fieldLabelled('Full name'), 'Minh Nguyen');
      await tester.enterText(fieldLabelled('Email'), 'minh@fpt.edu.vn');
      await tester.enterText(fieldLabelled('Password'), _goodPassword);
      await _tapSubmit(tester, 'Create account');
      await tester.pumpAndSettle();
      expect(find.text(AuthFailure.emailTaken.message), findsOneWidget);
      expect(find.byType(RegisterScreen), findsOneWidget);

      final notice = find.ancestor(
        of: find.text(AuthFailure.emailTaken.message),
        matching: find.byType(Column),
      );
      final link = find.descendant(
        of: notice.first,
        matching: find.widgetWithText(TextButton, 'Sign in'),
      );
      await tester.ensureVisible(link);
      await tester.tap(link);
      await tester.pumpAndSettle();
      expect(find.byType(LoginScreen), findsOneWidget);
      final email = tester.widget<TextField>(fieldLabelled('Email'));
      expect(email.controller!.text, 'minh@fpt.edu.vn');
      expect(router.canPop(), isFalse);
    });
  });

  group('layout', () {
    for (final locale in AppLocale.values) {
      for (final brightness in Brightness.values) {
        for (final (width, scale) in [(320.0, 1.3), (412.0, 1.0)]) {
          for (final path in ['/login', '/register']) {
            testWidgets(
              '$path no overflow at ${width.toInt()}dp x$scale '
              '(${locale.name}, ${brightness.name}), errors shown',
              (tester) async {
                await pumpAuth(
                  tester,
                  initialLocation: path,
                  locale: locale,
                  brightness: brightness,
                  size: Size(width, 640),
                  textScale: scale,
                );
                final label = translate(
                  path == '/login' ? 'Sign in' : 'Create account',
                  locale,
                );
                await _tapSubmit(tester, label);
                await tester.pumpAndSettle();
                expect(tester.takeException(), isNull);
                // Every tappable control is at least 48dp tall.
                for (final type in [FilledButton, TextButton, IconButton]) {
                  for (final e in find.byType(type).evaluate()) {
                    expect(
                      e.size!.height,
                      greaterThanOrEqualTo(48),
                      reason: '$type in $path',
                    );
                  }
                }
              },
            );
          }
        }
      }
    }
  });
}

class _SignedIn extends RecordingAuthController {
  @override
  AsyncValue<User?> build() => AsyncData(testUser());
}
