import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/profile/presentation/account_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';

class _Api extends Fake implements AuthApi {
  final List<({String? institution, List<String>? interests})> updates = [];
  final List<({String? current, String next})> passwords = [];
  Object? passwordError;
  Completer<void>? passwordGate;
  late User user;

  @override
  Future<User> updateProfile({
    String? institution,
    List<String>? researchInterests,
  }) async {
    updates.add((institution: institution, interests: researchInterests));
    return user = user.copyWith(
      institution: institution ?? user.institution,
      researchInterests: researchInterests ?? user.researchInterests,
    );
  }

  @override
  Future<void> changePassword({
    required String newPassword,
    String? currentPassword,
  }) async {
    passwords.add((current: currentPassword, next: newPassword));
    await passwordGate?.future;
    // ignore: only_throw_errors, the test injects what the API may throw
    if (passwordError != null) throw passwordError!;
  }
}

/// Records sign-outs instead of touching secure storage.
class _Controller extends FakeAuthController {
  _Controller(super._user);
  int logouts = 0;

  @override
  Future<void> logout() async => logouts++;
}

Finder _field(String label) => find.descendant(
      of: find.widgetWithText(LumiTextField, label),
      matching: find.byType(TextFormField),
    );

Future<(_Api, _Controller)> _pump(WidgetTester tester, User user) async {
  tester.view
    ..physicalSize = const Size(412, 2400)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = _Api()..user = user;
  final controller = _Controller(user);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        authApiProvider.overrideWithValue(api),
        authControllerProvider.overrideWith(() => controller),
      ],
      child: MaterialApp(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: const AccountScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (api, controller);
}

final User _user = testUser().copyWith(
  institution: 'FPT University',
  researchInterests: ['federated learning'],
);

Future<void> _fillPassword(
  WidgetTester tester, {
  required String next,
  String? current,
  String? confirm,
}) async {
  if (current != null) await tester.enterText(_field('Current password'), current);
  await tester.enterText(_field('New password'), next);
  await tester.enterText(_field('Confirm new password'), confirm ?? next);
}

/// Opens the editor behind one row of the account list.
Future<void> _open(WidgetTester tester, String row) async {
  await tester.tap(find.widgetWithText(LumiListRow, row));
  await tester.pumpAndSettle();
}

void main() {
  test('institution: may stay empty, but a set one cannot be cleared', () {
    expect(institutionError('', saved: null), isNull);
    expect(institutionError('  ', saved: 'FPT'), isNotNull);
    expect(institutionError('x' * 120, saved: null), isNull);
    expect(institutionError('x' * 121, saved: null), isNotNull);
  });

  test('an interest is trimmed and never added twice', () {
    expect(withInterest(['NLP'], '  privacy '), ['NLP', 'privacy']);
    expect(withInterest(['NLP'], 'nlp'), ['NLP']);
    expect(withInterest(['NLP'], '   '), ['NLP']);
  });

  test('the API flag is read from authProviders.password', () {
    final base = <String, dynamic>{
      'id': 'u1',
      'email': 'a@b.c',
      'fullName': 'A',
      'createdAt': '2026-01-01T00:00:00Z',
    };
    expect(User.fromJson(base).hasPasswordLogin, isTrue);
    expect(
      User.fromJson({
        ...base,
        'authProviders': {'password': false, 'google': true},
      }).hasPasswordLogin,
      isFalse,
    );
  });

  testWidgets(
      'saving sends the interests, and the institution only when it changed',
      (tester) async {
    final (api, _) = await _pump(tester, _user);
    // The list shows what is saved; each row opens its own editor.
    expect(find.text('FPT University'), findsOneWidget);
    expect(find.text('federated learning'), findsOneWidget);
    await _open(tester, 'Research interests');
    FilledButton save() =>
        tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Save'));
    // Nothing changed yet: nothing to save.
    expect(save().onPressed, isNull);
    // Typed but not added: Save adds it rather than losing it.
    await tester.enterText(_field('Add an interest'), 'privacy');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    // Interests only: the institution is not re-sent.
    expect(api.updates.single.institution, isNull);
    expect(api.updates.single.interests, ['federated learning', 'privacy']);
    expect(find.text('Profile saved.'), findsOneWidget);
  });

  testWidgets('a set institution cannot be emptied: said under the field',
      (tester) async {
    final (api, _) = await _pump(tester, _user);
    await _open(tester, 'University / institution');
    await tester.enterText(_field('University / institution'), '');
    // One frame: the Save button turns on once the field has changed.
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(find.text('Enter your institution.'), findsOneWidget);
    expect(api.updates, isEmpty);
  });

  testWidgets('password: rules and confirmation are checked before sending',
      (tester) async {
    final (api, _) = await _pump(tester, _user);
    await _open(tester, 'Change password');
    await _fillPassword(tester, next: 'short', confirm: 'other');
    await tester.tap(find.widgetWithText(FilledButton, 'Change password'));
    await tester.pumpAndSettle();
    expect(find.text('Enter your current password.'), findsOneWidget);
    expect(find.text('Password must be at least 10 characters'), findsOneWidget);
    expect(find.text('Passwords do not match.'), findsOneWidget);
    expect(api.passwords, isEmpty);
  });

  testWidgets('a changed password is sent once and signs out: the API ended '
      'every session', (tester) async {
    final (api, controller) = await _pump(tester, _user);
    await _open(tester, 'Change password');
    api.passwordGate = Completer<void>();
    await _fillPassword(tester, current: 'OldPassword1', next: 'NewPassword12');
    final button = find.widgetWithText(FilledButton, 'Change password');
    await tester.tap(button);
    await tester.tap(button, warnIfMissed: false);
    await tester.pump();
    api.passwordGate!.complete();
    await tester.pumpAndSettle();
    expect(api.passwords, [(current: 'OldPassword1', next: 'NewPassword12')]);
    expect(controller.logouts, 1);
  });

  testWidgets('a wrong current password says so and keeps the session',
      (tester) async {
    final (api, controller) = await _pump(tester, _user);
    api.passwordError = httpFailure(400);
    await _open(tester, 'Change password');
    await _fillPassword(tester, current: 'Wrong1password', next: 'NewPassword12');
    await tester.tap(find.widgetWithText(FilledButton, 'Change password'));
    await tester.pumpAndSettle();
    expect(find.text('The current password is incorrect.'), findsOneWidget);
    expect(controller.logouts, 0);
  });

  testWidgets('a Google-only account sets a password without a current one',
      (tester) async {
    final (api, _) =
        await _pump(tester, _user.copyWith(hasPasswordLogin: false));
    await _open(tester, 'Set password');
    expect(find.widgetWithText(LumiTextField, 'Current password'), findsNothing);
    await _fillPassword(tester, next: 'NewPassword12');
    await tester.tap(find.widgetWithText(FilledButton, 'Set password'));
    await tester.pumpAndSettle();
    expect(api.passwords.single.current, isNull);
  });
}
