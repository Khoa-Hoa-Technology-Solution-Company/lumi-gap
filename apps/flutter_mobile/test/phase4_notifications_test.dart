import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/admin/data/admin_api.dart';
import 'package:flutter_mobile/features/admin/presentation/admin_sync_screen.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_mobile/features/notifications/presentation/notifications_screen.dart';
import 'package:flutter_mobile/features/rankings/data/rankings_api.dart';
import 'package:flutter_mobile/features/rankings/presentation/rankings_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';

class _FakeNotificationsApi extends Fake implements NotificationsApi {
  _FakeNotificationsApi(this.items);

  List<AppNotification> items;
  int markAllCalls = 0;
  final List<String> markedRead = [];
  Object? markReadError;

  @override
  Future<List<AppNotification>> list() async => items;

  @override
  Future<void> markAllRead() async {
    markAllCalls++;
    items = [
      for (final n in items)
        AppNotification(
          id: n.id,
          title: n.title,
          message: n.message,
          isRead: true,
          createdAt: n.createdAt,
          targetKind: n.targetKind,
          targetId: n.targetId,
        ),
    ];
  }

  @override
  Future<void> markRead(String id) async {
    markedRead.add(id);
    // ignore: only_throw_errors, the test injects whatever the API may throw
    if (markReadError != null) throw markReadError!;
  }
}

AppNotification _n(
  String id, {
  bool isRead = false,
  String? kind,
  String? targetId,
}) =>
    AppNotification(
      id: id,
      title: 'Title $id',
      message: 'Message $id',
      isRead: isRead,
      createdAt: '2026-10-31T10:00:00Z',
      targetKind: kind,
      targetId: targetId,
    );

Future<void> _pump(WidgetTester tester, _FakeNotificationsApi api) async {
  tester.view
    ..physicalSize = const Size(412, 1600)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: '/notifications',
    routes: [
      GoRoute(
        path: '/notifications',
        builder: (_, _) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/paper/:id',
        builder: (_, state) =>
            Scaffold(body: Text('paper ${state.pathParameters['id']}')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [notificationsApiProvider.overrideWithValue(api)],
      child: MaterialApp.router(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

TextButton _readAll(WidgetTester tester) => tester.widget<TextButton>(
      find.ancestor(
        of: find.text('Read all'),
        matching: find.byWidgetPredicate((w) => w is TextButton),
      ),
    );

void main() {
  group('notification kinds', () {
    test('internal codes become readable labels, unknown ones none', () {
      expect(notificationKindLabel('forum_post'), 'Discussion');
      expect(notificationKindLabel('community'), 'Community');
      expect(notificationKindLabel('gap_analysis'), 'Research gap');
      expect(notificationKindLabel('project_chat'), 'Project');
      expect(notificationKindLabel('something_new'), isNull);
      expect(notificationKindLabel(null), isNull);
    });

    test('only kinds with a mobile screen open one', () {
      expect(notificationRoute(_n('1', kind: 'paper', targetId: 'p1')),
          '/paper/p1');
      expect(notificationRoute(_n('1', kind: 'paper')), isNull);
      expect(notificationRoute(_n('1', kind: 'paper', targetId: '')), isNull);
      expect(notificationRoute(_n('1', kind: 'gap_direction')), '/gaps');
      expect(
        notificationRoute(_n('1', kind: 'community', targetId: 'c1')),
        isNull,
      );
    });
  });

  group('notifications screen', () {
    testWidgets('no raw kind code is shown', (tester) async {
      final api = _FakeNotificationsApi([
        _n('1', kind: 'forum_post'),
        _n('2', kind: 'mystery_kind'),
      ]);
      await _pump(tester, api);
      expect(find.text('Discussion'), findsOneWidget);
      expect(find.text('forum_post'), findsNothing);
      expect(find.text('mystery_kind'), findsNothing);
    });

    testWidgets('"Read all" is off when nothing is unread', (tester) async {
      final api = _FakeNotificationsApi([_n('1', isRead: true)]);
      await _pump(tester, api);
      expect(_readAll(tester).onPressed, isNull);
    });

    testWidgets('"Read all" runs once and then turns off', (tester) async {
      final api = _FakeNotificationsApi([_n('1'), _n('2')]);
      await _pump(tester, api);
      expect(find.text('2 unread updates'), findsOneWidget);
      await tester.tap(find.text('Read all'));
      await tester.pumpAndSettle();
      expect(api.markAllCalls, 1);
      expect(find.text('0 unread updates'), findsOneWidget);
      expect(_readAll(tester).onPressed, isNull);
    });

    testWidgets('a failed "mark as read" still opens the paper and says so',
        (tester) async {
      final api = _FakeNotificationsApi([
        _n('1', kind: 'paper', targetId: 'p1'),
      ])
        ..markReadError = httpFailure(500);
      await _pump(tester, api);
      await tester.tap(find.text('Title 1'));
      await tester.pumpAndSettle();
      expect(api.markedRead, ['1']);
      expect(find.text('paper p1'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
    });

    testWidgets('a read notification is not marked again', (tester) async {
      final api = _FakeNotificationsApi([
        _n('1', isRead: true, kind: 'paper', targetId: 'p1'),
      ]);
      await _pump(tester, api);
      await tester.tap(find.text('Title 1'));
      await tester.pumpAndSettle();
      expect(api.markedRead, isEmpty);
      expect(find.text('paper p1'), findsOneWidget);
    });
  });

  group('leaderboard subtitle', () {
    Future<String?> subtitleFor(WidgetTester tester, RankingUser user) async {
      String? result;
      await tester.pumpWidget(
        MaterialApp(
          locale: AppLocale.en.locale,
          supportedLocales: AppLocale.supportedLocales,
          localizationsDelegates: appLocalizationsDelegates,
          home: Builder(
            builder: (context) {
              result = rankingSubtitle(context, user);
              return const SizedBox();
            },
          ),
        ),
      );
      return result;
    }

    RankingUser user({String? university, String role = ''}) => RankingUser(
          rank: 1,
          name: 'A',
          role: role,
          points: 0,
          credits: 0,
          university: university,
        );

    testWidgets('joins what is known, never a stray dash', (tester) async {
      expect(
        await subtitleFor(
          tester,
          user(university: 'FPT University', role: 'lecturer'),
        ),
        'FPT University · Lecturer',
      );
      expect(await subtitleFor(tester, user(role: 'student')), 'Student');
      expect(await subtitleFor(tester, user(university: '  ')), isNull);
      expect(await subtitleFor(tester, user(role: 'admin')), isNull);
    });
  });

  test('sync run status: the backend values, never a raw code', () {
    expect(syncRunStatus('succeeded'), ('Succeeded', SyncRunTone.success));
    expect(syncRunStatus('failed'), ('Failed', SyncRunTone.error));
    expect(syncRunStatus('running'), ('Running', SyncRunTone.active));
    expect(syncRunStatus('cancelled'), ('Cancelled', SyncRunTone.neutral));
    expect(syncRunStatus('SUCCEEDED').$2, SyncRunTone.success);
    expect(syncRunStatus('weird'), ('Unknown', SyncRunTone.neutral));
  });

  test('a queue with failed jobs is never shown as healthy', () {
    PipelineQueueStatus q({
      int failed = 0,
      bool backlogged = false,
      bool hasFailures = false,
    }) =>
        PipelineQueueStatus(
          name: 'q',
          label: 'Q',
          waiting: 0,
          active: 0,
          failed: failed,
          isBacklogged: backlogged,
          hasFailures: hasFailures,
        );
    expect(queueHealth(q()), QueueHealth.healthy);
    expect(queueHealth(q(failed: 1)), QueueHealth.failing);
    expect(queueHealth(q(hasFailures: true)), QueueHealth.failing);
    expect(queueHealth(q(backlogged: true)), QueueHealth.backlogged);
    expect(queueHealth(q(failed: 2, backlogged: true)), QueueHealth.failing);
  });
}
