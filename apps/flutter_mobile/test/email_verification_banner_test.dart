import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_mobile/features/profile/presentation/email_verification_banner.dart';
import 'package:flutter_mobile/features/profile/presentation/profile_screen.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';

const _title = 'Email chưa xác minh';
const _sent = 'Đã gửi email xác minh. Kiểm tra hộp thư của bạn.';

Future<void> _pumpBanner(
  WidgetTester tester, {
  required User? user,
  required FakeAuthApi api,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(() => FakeAuthController(user)),
        authApiProvider.overrideWithValue(api),
      ],
      child: MaterialApp(
        locale: AppLocale.vi.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: const Scaffold(body: EmailVerificationBanner()),
      ),
    ),
  );
}

Finder _resendButton() => find.widgetWithText(OutlinedButton, 'Gửi lại email');

void main() {
  group('visibility', () {
    testWidgets('hidden when emailVerifiedAt has a value', (tester) async {
      await _pumpBanner(
        tester,
        user: testUser(verifiedAt: DateTime.utc(2026, 5)),
        api: FakeAuthApi(),
      );

      expect(find.text(_title), findsNothing);
      expect(find.text('Gửi lại email'), findsNothing);
    });

    testWidgets('shown when emailVerifiedAt is null', (tester) async {
      await _pumpBanner(tester, user: testUser(), api: FakeAuthApi());

      expect(find.text(_title), findsOneWidget);
      expect(
        find.text('Một số chức năng cần email đã xác minh.'),
        findsOneWidget,
      );
      expect(find.text('Gửi lại email'), findsOneWidget);
      expect(find.text('Tôi đã xác minh'), findsOneWidget);
    });

    testWidgets('hidden when nobody is signed in', (tester) async {
      await _pumpBanner(tester, user: null, api: FakeAuthApi());

      expect(find.text(_title), findsNothing);
    });

    testWidgets('both buttons are at least 48dp tall', (tester) async {
      await _pumpBanner(tester, user: testUser(), api: FakeAuthApi());

      for (final label in ['Gửi lại email', 'Tôi đã xác minh']) {
        expect(
          tester
              .getSize(
                find.ancestor(
                  of: find.text(label),
                  matching: find.byWidgetPredicate(
                    (w) => w is ButtonStyleButton,
                  ),
                ),
              )
              .height,
          greaterThanOrEqualTo(48),
          reason: label,
        );
      }
    });

    testWidgets('ProfileScreen shows the banner only for an unverified user', (
      tester,
    ) async {
      Future<void> pumpProfile(User user) async {
        await tester.pumpWidget(const SizedBox());
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              authControllerProvider.overrideWith(
                () => FakeAuthController(user),
              ),
              authApiProvider.overrideWithValue(FakeAuthApi()),
              notificationsProvider.overrideWith(
                (ref) async => <AppNotification>[],
              ),
              bookmarksProvider.overrideWith((ref) async => <Bookmark>[]),
              reportsProvider.overrideWith(
                (ref, params) async => const ReportsList(reports: [], total: 0),
              ),
            ],
            child: MaterialApp(
              locale: AppLocale.vi.locale,
              supportedLocales: AppLocale.supportedLocales,
              localizationsDelegates: appLocalizationsDelegates,
              theme: AppTheme.lightTheme,
              home: const ProfileScreen(),
            ),
          ),
        );
        await tester.pump();
      }

      await pumpProfile(testUser());
      expect(find.text(_title), findsOneWidget);

      await pumpProfile(testUser(verifiedAt: DateTime.utc(2026, 5)));
      expect(find.text(_title), findsNothing);
    });
  });

  group('resend', () {
    testWidgets('sends to the account email, then locks for 60s with a '
        'countdown', (tester) async {
      final api = FakeAuthApi();
      await _pumpBanner(tester, user: testUser(), api: api);

      await tester.tap(_resendButton());
      await tester.pump(); // let the fake request finish

      expect(api.resendCalls, ['minh@fpt.edu.vn']);
      expect(find.text(_sent), findsOneWidget);
      // Success (and only success) gets the check mark in the success colour.
      final check = tester.widget<Icon>(
        find.byIcon(Icons.check_circle_outline),
      );
      expect(check.color, LumiColors.light.success);
      expect(find.byIcon(Icons.info_outline), findsNothing);
      expect(find.text('Gửi lại sau 60s'), findsOneWidget);
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull,
      );

      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Gửi lại sau 59s'), findsOneWidget);

      await tester.pump(const Duration(seconds: 29));
      expect(find.text('Gửi lại sau 30s'), findsOneWidget);

      // Still locked just before the end...
      await tester.pump(const Duration(seconds: 29));
      expect(find.text('Gửi lại sau 1s'), findsOneWidget);
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull,
      );

      // ...and available again exactly at 60s.
      await tester.pump(const Duration(seconds: 1));
      expect(_resendButton(), findsOneWidget);
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNotNull,
      );

      await tester.tap(_resendButton());
      await tester.pump();
      expect(api.resendCalls, hasLength(2));

      await tester.pumpWidget(const SizedBox()); // cancels the timer
    });

    testWidgets('double tap sends exactly one request', (tester) async {
      final gate = Completer<void>();
      final api = FakeAuthApi(onResend: (_) => gate.future);
      await _pumpBanner(tester, user: testUser(), api: api);

      await tester.tap(_resendButton());
      await tester.tap(_resendButton());
      await tester.pump();

      expect(api.resendCalls, hasLength(1));
      expect(find.text('Đang gửi…'), findsOneWidget);

      gate.complete();
      await tester.pump();
      expect(api.resendCalls, hasLength(1));
      expect(find.text('Gửi lại sau 60s'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('429 shows the limit message and does NOT start a countdown', (
      tester,
    ) async {
      final api = FakeAuthApi(onResend: (_) async => throw httpFailure(429));
      await _pumpBanner(tester, user: testUser(), api: api);

      await tester.tap(_resendButton());
      await tester.pump();

      expect(
        find.text('Bạn đã thử quá nhiều lần, vui lòng thử lại sau.'),
        findsOneWidget,
      );
      expect(find.text(_sent), findsNothing);
      expect(_resendButton(), findsOneWidget);
    });

    testWidgets('network error shows the offline message and can be retried', (
      tester,
    ) async {
      var fail = true;
      final api = FakeAuthApi(
        onResend: (_) async {
          if (fail) throw networkFailure();
        },
      );
      await _pumpBanner(tester, user: testUser(), api: api);

      await tester.tap(_resendButton());
      await tester.pump();
      expect(
        find.text('Không kết nối được. Kiểm tra mạng rồi thử lại.'),
        findsOneWidget,
      );

      fail = false;
      await tester.tap(_resendButton());
      await tester.pump();
      expect(api.resendCalls, hasLength(2));
      expect(find.text(_sent), findsOneWidget);
      expect(
        find.text('Không kết nối được. Kiểm tra mạng rồi thử lại.'),
        findsNothing,
      );

      await tester.pumpWidget(const SizedBox());
    });
  });

  group('"Tôi đã xác minh"', () {
    testWidgets('reloads /auth/me and hides the banner once verified', (
      tester,
    ) async {
      final api = FakeAuthApi(
        onMe: () async => testUser(verifiedAt: DateTime.utc(2026, 11, 9)),
      );
      await _pumpBanner(tester, user: testUser(), api: api);

      await tester.tap(find.text('Tôi đã xác minh'));
      await tester.pump();
      await tester.pump();

      expect(api.meCalls, 1);
      expect(find.text(_title), findsNothing);
    });

    testWidgets('still unverified: says so and keeps the banner', (
      tester,
    ) async {
      final api = FakeAuthApi(onMe: () async => testUser());
      await _pumpBanner(tester, user: testUser(), api: api);

      await tester.tap(find.text('Tôi đã xác minh'));
      await tester.pump();
      await tester.pump();

      expect(api.meCalls, 1);
      expect(find.text('Email vẫn chưa được xác minh.'), findsOneWidget);
      expect(find.text(_title), findsOneWidget);
      // Neutral info icon: a green check would wrongly say "verified".
      expect(find.byIcon(Icons.info_outline), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_outline), findsNothing);
      final icon = tester.widget<Icon>(find.byIcon(Icons.info_outline));
      expect(icon.color, LumiColors.light.foregroundSecondary);
    });

    testWidgets('load failure shows an error and keeps the banner', (
      tester,
    ) async {
      final api = FakeAuthApi(onMe: () async => throw networkFailure());
      await _pumpBanner(tester, user: testUser(), api: api);

      await tester.tap(find.text('Tôi đã xác minh'));
      await tester.pump();
      await tester.pump();

      expect(
        find.text('Không tải lại được thông tin tài khoản. Vui lòng thử lại.'),
        findsOneWidget,
      );
      expect(find.text(_title), findsOneWidget);
    });

    testWidgets('double tap reloads once', (tester) async {
      final gate = Completer<User>();
      final api = FakeAuthApi(onMe: () => gate.future);
      await _pumpBanner(tester, user: testUser(), api: api);

      await tester.tap(find.text('Tôi đã xác minh'));
      await tester.tap(find.text('Tôi đã xác minh'));
      await tester.pump();

      expect(api.meCalls, 1);
      expect(find.text('Đang kiểm tra…'), findsOneWidget);

      gate.complete(testUser());
      await tester.pump();
    });

    testWidgets('a reload that returns after sign-out is discarded', (
      tester,
    ) async {
      final gate = Completer<User>();
      final api = FakeAuthApi(onMe: () => gate.future);
      await _pumpBanner(tester, user: testUser(), api: api);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(EmailVerificationBanner)),
      );

      await tester.tap(find.text('Tôi đã xác minh'));
      await tester.pump();

      // Account switched while /auth/me was in flight.
      container.read(authControllerProvider.notifier).state = AsyncData(
        testUser(id: 'someone-else'),
      );
      gate.complete(testUser(verifiedAt: DateTime.utc(2026, 11, 9)));
      await tester.pump();
      await tester.pump();

      expect(
        container.read(authControllerProvider).value?.id,
        'someone-else',
        reason: 'stale response must not overwrite the new session',
      );
      expect(
        container.read(authControllerProvider).value?.emailVerifiedAt,
        isNull,
      );
    });
  });
}
