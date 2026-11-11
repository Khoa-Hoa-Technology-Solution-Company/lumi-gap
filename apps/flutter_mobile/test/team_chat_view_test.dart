import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_api.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_status.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_view.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';
import 'team_chat_support.dart';

final _today = DateTime.now();

DateTime today(int hour, [int minute = 0]) =>
    DateTime(_today.year, _today.month, _today.day, hour, minute);

class _Chat {
  final api = FakeTeamChatApi();
  final timers = ManualTimers();
}

User _admin() => User(
  id: 'u1',
  email: 'minh@fpt.edu.vn',
  fullName: 'Minh Nguyen',
  createdAt: DateTime.utc(2026),
  role: UserRole.admin,
);

Future<_Chat> _pumpChat(
  WidgetTester tester, {
  List<TeamChatMessage> messages = const [],
  String? ownerId = 'owner',
  User? me,
  double width = 412,
  double height = 800,
  Widget Function(Widget chat)? wrap,
  bool ready = true,
  AppLocale locale = AppLocale.vi,
}) async {
  final chat = _Chat();
  chat.api.onList = (_, _) async => messages;
  tester.view
    ..physicalSize = Size(width * 2, height * 2)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  final view = TeamChatView(projectId: 'p1', ownerId: ownerId);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(
          () => FakeAuthController(me ?? testUser()),
        ),
        teamChatApiProvider.overrideWithValue(chat.api),
        teamChatEnvProvider.overrideWithValue(testEnv(chat.timers)),
      ],
      child: MaterialApp(
        locale: locale.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: Scaffold(body: wrap == null ? view : wrap(view)),
      ),
    ),
  );
  await tester.pump(); // post-frame: the view opens the connection
  if (ready) await _ready(tester, chat);
  return chat;
}

Future<void> _ready(WidgetTester tester, _Chat chat) async {
  chat.api.stream.add(chatEvent(TeamChatEventType.ready));
  await tester.pumpAndSettle();
}

Finder _input() => find.byType(TextField);

/// The composer's send button (the only IconButton in the chat).
Finder _send() => find.byType(IconButton);

Future<void> _type(WidgetTester tester, String text) async {
  await tester.enterText(_input(), text);
  await tester.pump();
}

bool _sendEnabled(WidgetTester tester) =>
    tester.widget<IconButton>(_send()).onPressed != null;

void main() {
  group('loading and empty', () {
    testWidgets('shows a skeleton until the first page arrives', (
      tester,
    ) async {
      final chat = await _pumpChat(
        tester,
        messages: [chatMessage('a', content: 'xin chào', at: today(9))],
        ready: false,
      );
      expect(find.byType(TeamChatSkeleton), findsOneWidget);
      expect(find.text('xin chào'), findsNothing);

      await _ready(tester, chat);
      expect(find.byType(TeamChatSkeleton), findsNothing);
      expect(find.text('xin chào'), findsOneWidget);
    });

    testWidgets(
      'an empty chat invites the first message and still has the composer',
      (
        tester,
      ) async {
        await _pumpChat(tester);
        expect(
          find.text('Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện.'),
          findsOneWidget,
        );
        expect(_input(), findsOneWidget);
        expect(find.text('Nhắn tin cho nhóm…'), findsOneWidget);
      },
    );

    testWidgets('a failed first load shows why, with Thử lại that reloads', (
      tester,
    ) async {
      final chat = await _pumpChat(tester, ready: false);
      var fail = true;
      chat.api.onList = (_, _) async {
        if (fail) throw httpError(500);
        return [chatMessage('a', content: 'đã tải', at: today(9))];
      };
      await _ready(tester, chat);
      expect(
        find.text('Không tải được tin nhắn. Vui lòng thử lại.'),
        findsOneWidget,
      );

      fail = false;
      await tester.tap(find.text('Thử lại'));
      await tester.pumpAndSettle();
      expect(find.text('đã tải'), findsOneWidget);
      expect(find.text('Thử lại'), findsNothing);
    });
  });

  group('how messages are shown', () {
    testWidgets('groups by sender and time, and separates the days', (
      tester,
    ) async {
      final yesterday = DateTime(_today.year, _today.month, _today.day - 1, 20);
      await _pumpChat(
        tester,
        messages: [
          chatMessage(
            'old',
            content: 'rất cũ',
            at: DateTime(2020, 3, 5, 8, 15),
          ),
          chatMessage('y', content: 'hôm qua nhé', at: yesterday),
          chatMessage('a1', content: 'một', at: today(9)),
          chatMessage('a2', content: 'hai', at: today(9, 2)),
          chatMessage('a3', content: 'ba (sau 8 phút)', at: today(9, 10)),
          chatMessage('m1', sender: 'u1', content: 'của tôi', at: today(9, 11)),
        ],
      );

      expect(find.text('05/03/2020'), findsOneWidget);
      expect(find.text('Hôm qua'), findsOneWidget);
      expect(find.text('Hôm nay'), findsOneWidget);
      // The name shows once per group: old, yesterday, a1+a2, a3.
      expect(find.text('Lan Tran'), findsNWidgets(4));
      // My message has no name and no avatar.
      expect(find.text('Minh Nguyen'), findsNothing);
      for (final t in [
        'rất cũ',
        'hôm qua nhé',
        'một',
        'hai',
        'ba (sau 8 phút)',
        'của tôi',
      ]) {
        expect(find.text(t), findsOneWidget, reason: t);
      }
      expect(find.text('09:00'), findsOneWidget);
      expect(find.text('09:11'), findsOneWidget);
    });

    testWidgets('a deleted message shows a notice and never the old text', (
      tester,
    ) async {
      await _pumpChat(
        tester,
        messages: [
          chatMessage('a', content: 'bí mật', deleted: true, at: today(9)),
          chatMessage('b', content: 'còn nguyên', at: today(9, 1)),
        ],
      );
      expect(find.text('Tin nhắn đã bị xóa'), findsOneWidget);
      expect(find.text('bí mật'), findsNothing);
      expect(find.text('còn nguyên'), findsOneWidget);
    });

    testWidgets('a message that arrives live appears without a reload', (
      tester,
    ) async {
      final chat = await _pumpChat(tester);
      chat.api.stream.add(
        chatEvent(
          TeamChatEventType.created,
          chatMessage('live', content: 'tin mới', at: today(10)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('tin mới'), findsOneWidget);
      expect(
        find.text('Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện.'),
        findsNothing,
      );
    });

    testWidgets('a live delete turns the message into the notice', (
      tester,
    ) async {
      final chat = await _pumpChat(
        tester,
        messages: [chatMessage('a', content: 'sắp bị xóa', at: today(9))],
      );
      chat.api.stream.add(
        chatEvent(
          TeamChatEventType.deleted,
          chatMessage('a', deleted: true, at: today(9)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('sắp bị xóa'), findsNothing);
      expect(find.text('Tin nhắn đã bị xóa'), findsOneWidget);
    });
  });

  group('sending', () {
    testWidgets(
      'shows "Đang gửi…" at once, clears the box, then the real message replaces it',
      (
        tester,
      ) async {
        final chat = await _pumpChat(tester);
        final gate = Completer<TeamChatMessage>();
        chat.api.onSend = (_, _) => gate.future;

        await _type(tester, '  xin chào  ');
        await tester.tap(_send());
        await tester.pump();

        expect(find.text('xin chào'), findsOneWidget);
        expect(find.text('Đang gửi…'), findsOneWidget);
        expect(tester.widget<TextField>(_input()).controller!.text, isEmpty);
        expect(_sendEnabled(tester), isFalse, reason: 'empty box');

        gate.complete(
          chatMessage('srv', sender: 'u1', content: 'xin chào', at: today(10)),
        );
        await tester.pumpAndSettle();
        expect(
          find.text('xin chào'),
          findsOneWidget,
          reason: 'one message, not two',
        );
        expect(find.text('Đang gửi…'), findsNothing);
      },
    );

    testWidgets('a quick second tap on the emptied box sends nothing more', (
      tester,
    ) async {
      final chat = await _pumpChat(tester);
      await _type(tester, 'một lần');
      await tester.tap(_send());
      await tester.tap(_send());
      await tester.pumpAndSettle();
      expect(chat.api.sendCalls, hasLength(1));
    });

    testWidgets(
      'a failed message keeps its text, says why, and "Gửi lại" reuses the same key',
      (
        tester,
      ) async {
        final chat = await _pumpChat(tester);
        var fail = true;
        chat.api.onSend = (content, _) async {
          if (fail) throw offlineError();
          return chatMessage(
            'srv',
            sender: 'u1',
            content: content,
            at: today(10),
          );
        };

        await _type(tester, 'quan trọng');
        await tester.tap(_send());
        await tester.pumpAndSettle();
        expect(find.text('quan trọng'), findsOneWidget);
        expect(
          find.text('Không kết nối được. Kiểm tra mạng rồi thử lại.'),
          findsOneWidget,
        );
        expect(find.text('Gửi lại'), findsOneWidget);
        expect(find.text('Bỏ'), findsOneWidget);

        fail = false;
        await tester.tap(find.text('Gửi lại'));
        await tester.pumpAndSettle();
        expect(
          chat.api.sendCalls.map((c) => c.key).toSet(),
          hasLength(1),
          reason: 'same clientKey',
        );
        expect(chat.api.sendCalls, hasLength(2));
        expect(find.text('quan trọng'), findsOneWidget);
        expect(find.text('Gửi lại'), findsNothing);
      },
    );

    testWidgets('429 says "too fast" and keeps the text', (tester) async {
      final chat = await _pumpChat(tester);
      chat.api.onSend = (_, _) async => throw httpError(429);
      await _type(tester, 'nhanh quá');
      await tester.tap(_send());
      await tester.pumpAndSettle();
      expect(
        find.text('Bạn gửi quá nhanh, vui lòng đợi một chút.'),
        findsOneWidget,
      );
      expect(find.text('nhanh quá'), findsOneWidget);
    });

    testWidgets('"Bỏ" drops a failed message', (tester) async {
      final chat = await _pumpChat(tester);
      chat.api.onSend = (_, _) async => throw httpError(500);
      await _type(tester, 'bỏ đi');
      await tester.tap(_send());
      await tester.pumpAndSettle();
      expect(find.text('Gửi lỗi. Vui lòng thử lại.'), findsOneWidget);

      await tester.tap(find.text('Bỏ'));
      await tester.pumpAndSettle();
      expect(find.text('bỏ đi'), findsNothing);
    });
  });

  group('composer', () {
    testWidgets('the counter shows above 1.800, and not at 1.800', (
      tester,
    ) async {
      await _pumpChat(tester);
      await _type(tester, 'x' * 1800);
      expect(find.text('1800/2000'), findsNothing);
      expect(_sendEnabled(tester), isTrue);

      await _type(tester, 'x' * 1801);
      expect(find.text('1801/2000'), findsOneWidget);
      expect(_sendEnabled(tester), isTrue);
    });

    testWidgets('2.000 is allowed; 2.001 disables Send and explains', (
      tester,
    ) async {
      await _pumpChat(tester);
      await _type(tester, 'x' * 2000);
      expect(_sendEnabled(tester), isTrue);
      expect(find.textContaining('dài tối đa 2.000'), findsNothing);

      await _type(tester, 'x' * 2001);
      expect(_sendEnabled(tester), isFalse);
      expect(
        find.text('Tin nhắn dài tối đa 2.000 ký tự (2001/2000).'),
        findsOneWidget,
      );
    });

    testWidgets(
      'spaces around the text do not count, and blank text cannot be sent',
      (
        tester,
      ) async {
        await _pumpChat(tester);
        await _type(tester, '   ');
        expect(_sendEnabled(tester), isFalse);
        await _type(tester, '${' ' * 300}${'x' * 2000}${' ' * 300}');
        expect(_sendEnabled(tester), isTrue);
      },
    );

    testWidgets('Send is at least 48dp', (tester) async {
      await _pumpChat(tester);
      final size = tester.getSize(
        find.ancestor(of: _send(), matching: find.byType(SizedBox)).first,
      );
      expect(size.width, greaterThanOrEqualTo(48));
      expect(size.height, greaterThanOrEqualTo(48));
    });
  });

  group('deleting', () {
    Future<void> longPressAndDelete(
      WidgetTester tester,
      String text, {
      String? reason,
    }) async {
      await tester.longPress(find.text(text));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xóa tin nhắn'));
      await tester.pumpAndSettle();
      if (reason != null) {
        await tester.enterText(
          find.widgetWithText(TextField, 'Lý do (không bắt buộc)'),
          reason,
        );
        await tester.pump();
      }
    }

    testWidgets(
      'own message: menu, confirmation with a reason, then the API call',
      (
        tester,
      ) async {
        final chat = await _pumpChat(
          tester,
          messages: [
            chatMessage('mine', sender: 'u1', content: 'của tôi', at: today(9)),
          ],
        );
        await longPressAndDelete(tester, 'của tôi', reason: '  nhầm nhóm  ');
        expect(find.text('Xóa tin nhắn?'), findsOneWidget);
        await tester.tap(find.widgetWithText(FilledButton, 'Xóa'));
        await tester.pumpAndSettle();

        expect(chat.api.deleteCalls.single, (id: 'mine', reason: 'nhầm nhóm'));
        expect(find.text('Tin nhắn đã bị xóa'), findsOneWidget);
      },
    );

    testWidgets('an empty reason is sent as none', (tester) async {
      final chat = await _pumpChat(
        tester,
        messages: [
          chatMessage('mine', sender: 'u1', content: 'của tôi', at: today(9)),
        ],
      );
      await longPressAndDelete(tester, 'của tôi');
      await tester.tap(find.widgetWithText(FilledButton, 'Xóa'));
      await tester.pumpAndSettle();
      expect(chat.api.deleteCalls.single.reason, isNull);
    });

    testWidgets('cancelling the confirmation deletes nothing', (tester) async {
      final chat = await _pumpChat(
        tester,
        messages: [
          chatMessage('mine', sender: 'u1', content: 'của tôi', at: today(9)),
        ],
      );
      await longPressAndDelete(tester, 'của tôi');
      await tester.tap(find.text('Hủy'));
      await tester.pumpAndSettle();
      expect(chat.api.deleteCalls, isEmpty);
      expect(find.text('của tôi'), findsOneWidget);
    });

    testWidgets("someone else's message: no menu for an ordinary member", (
      tester,
    ) async {
      final chat = await _pumpChat(
        tester,
        messages: [chatMessage('o', content: 'của người khác', at: today(9))],
      );
      await tester.longPress(find.text('của người khác'));
      await tester.pumpAndSettle();
      expect(find.text('Xóa tin nhắn'), findsNothing);
      expect(chat.api.deleteCalls, isEmpty);
    });

    testWidgets("the project owner can delete anyone's message", (
      tester,
    ) async {
      final chat = await _pumpChat(
        tester,
        ownerId: 'u1',
        messages: [chatMessage('o', content: 'của người khác', at: today(9))],
      );
      await longPressAndDelete(tester, 'của người khác');
      await tester.tap(find.widgetWithText(FilledButton, 'Xóa'));
      await tester.pumpAndSettle();
      expect(chat.api.deleteCalls.single.id, 'o');
    });

    testWidgets("an admin can delete anyone's message", (tester) async {
      final chat = await _pumpChat(
        tester,
        me: _admin(),
        messages: [chatMessage('o', content: 'của người khác', at: today(9))],
      );
      await longPressAndDelete(tester, 'của người khác');
      await tester.tap(find.widgetWithText(FilledButton, 'Xóa'));
      await tester.pumpAndSettle();
      expect(chat.api.deleteCalls.single.id, 'o');
    });

    testWidgets('a deleted message has no menu', (tester) async {
      await _pumpChat(
        tester,
        messages: [
          chatMessage('mine', sender: 'u1', deleted: true, at: today(9)),
        ],
      );
      await tester.longPress(find.text('Tin nhắn đã bị xóa'));
      await tester.pumpAndSettle();
      expect(find.text('Xóa tin nhắn'), findsNothing);
    });

    testWidgets('403 from the server is explained and the message stays', (
      tester,
    ) async {
      final chat = await _pumpChat(
        tester,
        messages: [
          chatMessage('mine', sender: 'u1', content: 'của tôi', at: today(9)),
        ],
      );
      chat.api.onDelete = (_, _) async => throw httpError(403);
      await longPressAndDelete(tester, 'của tôi');
      await tester.tap(find.widgetWithText(FilledButton, 'Xóa'));
      await tester.pumpAndSettle();
      expect(find.text('Bạn không có quyền xóa tin nhắn này.'), findsOneWidget);
      expect(find.text('của tôi'), findsOneWidget);
    });
  });

  group('read receipts', () {
    testWidgets(
      '"Đã xem bởi N" is under my last message and opens the list of readers',
      (
        tester,
      ) async {
        await _pumpChat(
          tester,
          messages: [
            chatMessage(
              'a',
              sender: 'u1',
              content: 'đầu',
              at: today(9),
              readBy: ['u2'],
            ),
            chatMessage(
              'b',
              sender: 'u1',
              content: 'cuối',
              at: today(9, 1),
              readBy: ['u2', 'u3'],
            ),
          ],
        );
        expect(
          find.text('Đã xem bởi 2'),
          findsOneWidget,
          reason: 'only under the last one',
        );
        final size = tester.getSize(
          find
              .ancestor(
                of: find.text('Đã xem bởi 2'),
                matching: find.byType(InkWell),
              )
              .first,
        );
        expect(size.height, greaterThanOrEqualTo(48));

        await tester.tap(find.text('Đã xem bởi 2'));
        await tester.pumpAndSettle();
        expect(
          find.text('Đã xem bởi 2'),
          findsNWidgets(2),
          reason: 'label + sheet title',
        );
        expect(find.text('User u2'), findsOneWidget);
        expect(find.text('User u3'), findsOneWidget);
        expect(
          find.text('Minh Nguyen'),
          findsNothing,
          reason: 'the sender is not a reader',
        );
      },
    );

    testWidgets('nobody has read it yet: "Đã gửi"', (tester) async {
      await _pumpChat(
        tester,
        messages: [chatMessage('a', sender: 'u1', content: 'x', at: today(9))],
      );
      expect(find.text('Đã gửi'), findsOneWidget);
      expect(find.textContaining('Đã xem bởi'), findsNothing);
    });

    testWidgets(
      'the newest message from someone else is marked read once, after 1s',
      (
        tester,
      ) async {
        final chat = await _pumpChat(tester);
        chat.api.stream.add(
          chatEvent(
            TeamChatEventType.created,
            chatMessage('n1', content: 'mới', at: today(10)),
          ),
        );
        await tester.pumpAndSettle();

        expect(chat.api.readCalls, isEmpty, reason: 'debounced');
        chat.timers.fireWhere((t) => t.duration == teamChatReadDebounce);
        await tester.pumpAndSettle();
        expect(chat.api.readCalls, ['n1']);

        // The server echoes the update; no second call.
        chat.api.stream.add(
          chatEvent(
            TeamChatEventType.updated,
            chatMessage('n1', content: 'mới', at: today(10), readBy: ['u1']),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          chat.timers.active.where((t) => t.duration == teamChatReadDebounce),
          isEmpty,
        );
        expect(chat.api.readCalls, ['n1']);
      },
    );
  });

  group('connection', () {
    testWidgets('"Đang kết nối lại…" while reconnecting, gone once connected', (
      tester,
    ) async {
      final chat = await _pumpChat(tester);
      expect(find.text('Đang kết nối lại…'), findsNothing);

      chat.api.stream.addError(offlineError());
      await tester.pump();
      await tester.pump();
      expect(find.text('Đang kết nối lại…'), findsOneWidget);

      chat.timers.fireLast();
      await tester.pump();
      await tester.pump();
      chat.api.stream.add(chatEvent(TeamChatEventType.ready));
      await tester.pumpAndSettle();
      expect(find.text('Đang kết nối lại…'), findsNothing);
    });

    testWidgets(
      'losing access stops the chat: explanation, no composer, no retry',
      (
        tester,
      ) async {
        final chat = await _pumpChat(
          tester,
          messages: [chatMessage('a', content: 'còn xem được', at: today(9))],
        );
        chat.api.stream.addError(httpError(403));
        await tester.pumpAndSettle();

        expect(
          find.text('Bạn không còn quyền xem cuộc trò chuyện này.'),
          findsOneWidget,
        );
        expect(
          find.text('còn xem được'),
          findsOneWidget,
          reason: 'history stays readable',
        );
        expect(find.text('Không thể gửi tin nhắn'), findsOneWidget);
        expect(tester.widget<TextField>(_input()).enabled, isFalse);
        expect(_sendEnabled(tester), isFalse);
        expect(chat.api.streams, hasLength(1), reason: 'no reconnect');
      },
    );

    testWidgets('an expired session says so', (tester) async {
      final chat = await _pumpChat(tester);
      chat.api.stream.addError(httpError(401));
      await tester.pumpAndSettle();
      expect(
        find.text('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'),
        findsOneWidget,
      );
    });

    testWidgets(
      'the connection closes in the background and reopens on return',
      (
        tester,
      ) async {
        final chat = await _pumpChat(tester);
        expect(chat.api.activeStreams, 1);

        tester.binding
          ..handleAppLifecycleStateChanged(AppLifecycleState.inactive)
          ..handleAppLifecycleStateChanged(AppLifecycleState.hidden)
          ..handleAppLifecycleStateChanged(AppLifecycleState.paused);
        await tester.pump();
        expect(chat.api.activeStreams, 0);

        chat.api.onList = (_, _) async => [
          chatMessage('late', content: 'đến muộn', at: today(10)),
        ];
        tester.binding
          ..handleAppLifecycleStateChanged(AppLifecycleState.hidden)
          ..handleAppLifecycleStateChanged(AppLifecycleState.inactive)
          ..handleAppLifecycleStateChanged(AppLifecycleState.resumed);
        await tester.pump();
        expect(chat.api.streams, hasLength(2));
        await _ready(tester, chat);
        expect(
          find.text('đến muộn'),
          findsOneWidget,
          reason: 'missed message filled in',
        );
      },
    );

    testWidgets('only live while its tab is selected', (tester) async {
      late TabController tabs;
      final chat = await _pumpChat(
        tester,
        wrap: (chatView) => DefaultTabController(
          length: 2,
          child: Builder(
            builder: (context) {
              tabs = DefaultTabController.of(context);
              return const TabBarView(
                children: [
                  Center(child: Text('trang khác')),
                  TeamChatView(
                    projectId: 'p1',
                    ownerId: 'owner',
                    tabIndex: 1,
                  ),
                ],
              );
            },
          ),
        ),
        ready: false,
      );
      expect(chat.api.streams, isEmpty, reason: 'chat tab not selected');

      tabs.animateTo(1);
      await tester.pumpAndSettle();
      expect(chat.api.activeStreams, 1);

      tabs.animateTo(0);
      await tester.pumpAndSettle();
      expect(chat.api.activeStreams, 0);
    });
  });

  group('older messages', () {
    testWidgets('scrolling to the top loads the page before the oldest one', (
      tester,
    ) async {
      final first = [
        for (var i = 0; i < 50; i++)
          chatMessage(
            'm${100 + i}',
            content: 'tin ${100 + i}',
            at: today(0).add(Duration(minutes: 100 + i)),
          ),
      ];
      final chat = await _pumpChat(tester, messages: first);
      expect(chat.api.listCalls, hasLength(1));

      chat.api.onList = (beforeId, _) async => [
        chatMessage(
          'm099',
          content: 'tin 099',
          at: today(0).add(const Duration(minutes: 99)),
        ),
      ];
      await tester.fling(
        find.byType(ListView).first,
        const Offset(0, 6000),
        9000,
      );
      await tester.pumpAndSettle();

      expect(chat.api.listCalls.length, greaterThanOrEqualTo(2));
      expect(chat.api.listCalls[1].beforeId, 'm100');
    });
  });

  group('layout', () {
    List<TeamChatMessage> messages() => [
      chatMessage(
        'o',
        content:
            'Một tin nhắn rất dài để kiểm tra việc xuống dòng khi chữ lớn ' * 3,
        at: today(9),
        senderName: 'Nguyễn Thị Phương Thảo Một Cái Tên Rất Dài',
      ),
      chatMessage('d', deleted: true, at: today(9, 1)),
      chatMessage(
        'm',
        sender: 'u1',
        content: 'Tin của tôi cũng khá dài để thử độ rộng bong bóng ' * 2,
        at: today(9, 2),
        readBy: ['u2', 'u3', 'u4'],
      ),
    ];

    for (final locale in AppLocale.values) {
      for (final width in [412.0, 320.0]) {
        for (final scale in [1.0, 1.3]) {
          testWidgets(
            'no overflow at ${width.toInt()}dp with text scale $scale '
            '(${locale.code})',
            (tester) async {
              tester.platformDispatcher.textScaleFactorTestValue = scale;
              addTearDown(tester.platformDispatcher.clearAllTestValues);
              final chat = await _pumpChat(
                tester,
                width: width,
                messages: messages(),
                locale: locale,
              );

              // A failed message, the connection banner and a long draft too.
              chat.api.onSend = (_, _) async => throw offlineError();
              await _type(
                tester,
                'Một tin nhắn không gửi được và khá là dài ' * 3,
              );
              await tester.tap(_send());
              await tester.pumpAndSettle();
              chat.api.stream.addError(offlineError());
              await tester.pump();
              await tester.pump();
              await _type(tester, 'x' * 2100);

              expect(
                find.text(translate('Resend', locale)),
                findsOneWidget,
              );
              expect(
                find.text(translate('Reconnecting…', locale)),
                findsOneWidget,
              );
              expect(tester.takeException(), isNull);
            },
          );
        }
      }
    }
  });
}
