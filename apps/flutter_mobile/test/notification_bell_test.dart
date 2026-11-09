import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/widgets/notification_bell.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

List<AppNotification> _items({required int unread, int read = 0}) => [
  for (var i = 0; i < unread; i++)
    AppNotification(
      id: 'u$i',
      title: 'Unread $i',
      message: '',
      isRead: false,
      createdAt: '2026-11-01T00:00:00Z',
    ),
  for (var i = 0; i < read; i++)
    AppNotification(
      id: 'r$i',
      title: 'Read $i',
      message: '',
      isRead: true,
      createdAt: '2026-11-01T00:00:00Z',
    ),
];

Future<void> _pumpBell(
  WidgetTester tester,
  Future<List<AppNotification>> Function() load,
) async {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) => const Scaffold(
          body: Center(child: NotificationBell()),
        ),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, _) => const Scaffold(body: Text('notifications-screen')),
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        notificationsProvider.overrideWith((ref) => load()),
      ],
      child: MaterialApp.router(
        theme: AppTheme.lightTheme,
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('unreadBadgeText', () {
    test('hidden at 0, exact up to 9, "9+" from 10', () {
      expect(unreadBadgeText(0), isNull);
      expect(unreadBadgeText(-1), isNull);
      expect(unreadBadgeText(1), '1');
      expect(unreadBadgeText(9), '9');
      expect(unreadBadgeText(10), '9+');
      expect(unreadBadgeText(120), '9+');
    });

    test('screen-reader label carries the real unread count', () {
      expect(notificationBellLabel(0), 'Thông báo');
      expect(notificationBellLabel(3), 'Thông báo, 3 chưa đọc');
      expect(notificationBellLabel(12), 'Thông báo, 12 chưa đọc');
    });
  });

  group('NotificationBell', () {
    testWidgets('0 unread: no badge, plain label (read items do not count)', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await _pumpBell(tester, () async => _items(unread: 0, read: 4));

      expect(find.byType(Badge), findsOneWidget);
      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);
      expect(find.text('0'), findsNothing);
      expect(find.bySemanticsLabel('Thông báo'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('3 unread: shows "3" with matching semantics label', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await _pumpBell(tester, () async => _items(unread: 3, read: 2));

      expect(find.text('3'), findsOneWidget);
      expect(find.bySemanticsLabel('Thông báo, 3 chưa đọc'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('12 unread: shows "9+" but announces the real count', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await _pumpBell(tester, () async => _items(unread: 12));

      expect(find.text('9+'), findsOneWidget);
      expect(find.bySemanticsLabel('Thông báo, 12 chưa đọc'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('load failure hides the badge instead of crashing', (
      tester,
    ) async {
      await _pumpBell(tester, () async => throw Exception('offline'));

      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);
    });

    testWidgets('tap target is at least 48x48 and opens /notifications', (
      tester,
    ) async {
      await _pumpBell(tester, () async => _items(unread: 1));

      final size = tester.getSize(find.byType(NotificationBell));
      expect(size.width, greaterThanOrEqualTo(48));
      expect(size.height, greaterThanOrEqualTo(48));

      await tester.tap(find.byType(NotificationBell));
      await tester.pumpAndSettle();
      expect(find.text('notifications-screen'), findsOneWidget);
    });

    testWidgets('badge updates after the list is invalidated (mark as read)', (
      tester,
    ) async {
      var unread = 3;
      await _pumpBell(tester, () async => _items(unread: unread, read: 1));
      expect(find.text('3'), findsOneWidget);

      // The notifications screen calls ref.invalidate(notificationsProvider)
      // after markRead; simulate that with the same provider.
      unread = 2;
      final container = ProviderScope.containerOf(
        tester.element(find.byType(NotificationBell)),
      )..invalidate(notificationsProvider);
      await tester.pumpAndSettle();

      expect(find.text('2'), findsOneWidget);
      expect(find.text('3'), findsNothing);

      unread = 0;
      container.invalidate(notificationsProvider);
      await tester.pumpAndSettle();
      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);
    });
  });
}
