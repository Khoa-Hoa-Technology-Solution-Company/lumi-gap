import 'dart:async';
import 'dart:math';

import 'package:flutter_mobile/core/utils/uuid.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_api.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';
import 'i18n_support.dart';
import 'team_chat_support.dart';

const _project = 'p1';

class _Harness {
  _Harness() {
    container = ProviderContainer(
      overrides: [
        authControllerProvider.overrideWith(
          () => FakeAuthController(testUser()),
        ),
        teamChatApiProvider.overrideWithValue(api),
        teamChatEnvProvider.overrideWithValue(testEnv(timers)),
      ],
    );
    container.listen(teamChatControllerProvider(_project), (_, _) {});
    addTearDown(container.dispose);
  }

  final api = FakeTeamChatApi();
  final timers = ManualTimers();
  late final ProviderContainer container;

  TeamChatController get chat =>
      container.read(teamChatControllerProvider(_project).notifier);
  TeamChatState get state =>
      container.read(teamChatControllerProvider(_project));

  List<String> get ids => state.messages.map((m) => m.id).toList();

  /// Starts the chat and delivers the server's `ready`, which loads page one.
  Future<void> open([List<TeamChatMessage> first = const []]) async {
    api.onList = (_, _) async => first;
    chat.start();
    await settle();
    api.stream.add(chatEvent(TeamChatEventType.ready));
    await settle();
  }

  /// Drops the stream, reconnects, and delivers `ready`; the refresh after
  /// the reconnect answers with [list].
  Future<void> reconnect(Future<List<TeamChatMessage>> Function() list) async {
    api.stream.addError(offlineError());
    await settle();
    api.onList = (_, _) => list();
    timers.fireWhere((t) => t.duration <= const Duration(seconds: 2));
    await settle();
    api.stream.add(chatEvent(TeamChatEventType.ready));
    await settle();
  }

  Future<void> emit(TeamChatEventType type, [TeamChatMessage? m]) async {
    api.stream.add(chatEvent(type, m));
    await settle();
  }
}

List<TeamChatMessage> page(
  int count, {
  int startMinute = 0,
  String prefix = 'm',
}) => [
  for (var i = 0; i < count; i++)
    chatMessage(
      '$prefix${(startMinute + i).toString().padLeft(3, '0')}',
      at: DateTime.utc(2026, 11, 9).add(Duration(minutes: startMinute + i)),
    ),
];

void main() {
  group('opening', () {
    test('start connects; ready loads the first page, oldest first', () async {
      final h = _Harness();
      h.api.onList = (_, _) async => [
        chatMessage('b', minute: 2),
        chatMessage('a', minute: 1),
        chatMessage('c', minute: 3),
      ];

      h.chat.start();
      await settle();
      expect(h.state.connection, TeamChatConnection.connecting);
      expect(h.state.load, TeamChatLoad.loading);
      expect(h.api.listCalls, isEmpty, reason: 'history waits for ready');

      h.api.stream.add(chatEvent(TeamChatEventType.ready));
      await settle();

      expect(h.state.connection, TeamChatConnection.connected);
      expect(h.state.load, TeamChatLoad.ready);
      expect(h.ids, ['a', 'b', 'c']);
      expect(h.api.listCalls, hasLength(1));
      expect(h.state.hasMore, isFalse, reason: 'fewer than a full page');
    });

    test(
      'same createdAt is ordered by id, so the order is deterministic',
      () async {
        final h = _Harness();
        final t = DateTime.utc(2026, 11, 9, 9);
        await h.open([
          chatMessage('z', at: t),
          chatMessage('a', at: t),
          chatMessage('m', at: t),
        ]);
        expect(h.ids, ['a', 'm', 'z']);
      },
    );

    test('start is idempotent: one connection, not two', () async {
      final h = _Harness();
      h.chat
        ..start()
        ..start()
        ..start();
      await settle();
      expect(h.api.streams, hasLength(1));
    });

    test('an empty chat is ready with no messages', () async {
      final h = _Harness();
      await h.open();
      expect(h.state.load, TeamChatLoad.ready);
      expect(h.state.messages, isEmpty);
      expect(h.state.hasMore, isFalse);
    });

    test(
      'if ready never arrives, the history still loads after 4 seconds',
      () async {
        final h = _Harness();
        h.api.onList = (_, _) async => [chatMessage('a')];
        h.chat.start();
        await settle();
        expect(h.state.load, TeamChatLoad.loading);

        h.timers.fireWhere((t) => t.duration == const Duration(seconds: 4));
        await settle();
        expect(h.ids, ['a']);
        expect(h.state.load, TeamChatLoad.ready);
      },
    );

    test('a failed first load shows an error and can be retried', () async {
      final h = _Harness();
      var fail = true;
      h.api.onList = (_, _) async {
        if (fail) throw httpError(500);
        return [chatMessage('a')];
      };
      h.chat.start();
      await settle();
      h.api.stream.add(chatEvent(TeamChatEventType.ready));
      await settle();
      expect(h.state.load, TeamChatLoad.error);
      expect(h.state.loadFailure, TeamChatFailure.other);

      fail = false;
      await h.chat.loadInitial();
      expect(h.state.load, TeamChatLoad.ready);
      expect(h.state.loadFailure, isNull);
      expect(h.ids, ['a']);
    });

    test('a 403 on the first load stops for good with no-access', () async {
      final h = _Harness();
      h.api.onList = (_, _) async => throw httpError(403);
      h.chat.start();
      await settle();
      h.api.stream.add(chatEvent(TeamChatEventType.ready));
      await settle();
      expect(h.state.stop, TeamChatStop.noAccess);
      expect(h.state.connection, TeamChatConnection.stopped);
      expect(h.state.canSend, isFalse);
      expect(
        h.timers.active.where((t) => t.duration < const Duration(seconds: 3)),
        isEmpty,
      );
    });
  });

  group('older pages', () {
    test(
      'a full page means there may be more; the next page uses beforeId of the oldest',
      () async {
        final h = _Harness();
        await h.open(page(50, startMinute: 100));
        expect(h.state.hasMore, isTrue);

        h.api.onList = (_, _) async => page(50, startMinute: 50);
        await h.chat.loadOlder();
        expect(h.api.listCalls.last.beforeId, 'm100');
        expect(h.state.messages, hasLength(100));
        expect(h.ids.first, 'm050');
        expect(h.state.hasMore, isTrue);
      },
    );

    test(
      'a short page ends the history; then nothing more is requested',
      () async {
        final h = _Harness();
        await h.open(page(50, startMinute: 100));
        h.api.onList = (_, _) async => page(7, startMinute: 90);
        await h.chat.loadOlder();
        expect(h.state.hasMore, isFalse);
        expect(h.state.messages, hasLength(57));

        final calls = h.api.listCalls.length;
        await h.chat.loadOlder();
        expect(h.api.listCalls, hasLength(calls));
      },
    );

    test('an empty page also ends the history', () async {
      final h = _Harness();
      await h.open(page(50, startMinute: 100));
      h.api.onList = (_, _) async => const [];
      await h.chat.loadOlder();
      expect(h.state.hasMore, isFalse);
      expect(h.state.messages, hasLength(50));
    });

    test('overlapping calls send exactly one request', () async {
      final h = _Harness();
      await h.open(page(50, startMinute: 100));
      final gate = Completer<List<TeamChatMessage>>();
      h.api.onList = (_, _) => gate.future;
      final before = h.api.listCalls.length;

      final a = h.chat.loadOlder();
      final b = h.chat.loadOlder();
      final c = h.chat.loadOlder();
      expect(h.state.loadingOlder, isTrue);
      gate.complete(page(3, startMinute: 90));
      await Future.wait([a, b, c]);

      expect(h.api.listCalls.length - before, 1);
      expect(h.state.loadingOlder, isFalse);
    });

    test(
      'overlap with messages already held does not duplicate them',
      () async {
        final h = _Harness();
        await h.open(page(50, startMinute: 100));
        h.api.onList = (_, _) async =>
            page(50, startMinute: 51); // 51..100: 100 overlaps? 100 is held
        await h.chat.loadOlder();
        expect(
          h.ids.toSet(),
          hasLength(h.ids.length),
          reason: 'no duplicate ids',
        );
      },
    );

    test(
      'a failed older page can be retried and does not end the history',
      () async {
        final h = _Harness();
        await h.open(page(50, startMinute: 100));
        h.api.onList = (_, _) async => throw offlineError();
        await h.chat.loadOlder();
        expect(h.state.olderFailed, isTrue);
        expect(h.state.hasMore, isTrue);
        expect(h.state.loadingOlder, isFalse);

        h.api.onList = (_, _) async => page(5, startMinute: 90);
        await h.chat.loadOlder();
        expect(h.state.olderFailed, isFalse);
        expect(h.state.messages, hasLength(55));
      },
    );

    test('nothing happens before the first page is ready', () async {
      final h = _Harness();
      await h.chat.loadOlder();
      expect(h.api.listCalls, isEmpty);
    });
  });

  group('merging live events', () {
    test(
      'created adds a message; the same id again replaces it, never duplicates',
      () async {
        final h = _Harness();
        await h.open([chatMessage('a', content: 'v1')]);

        await h.emit(TeamChatEventType.created, chatMessage('b', minute: 5));
        expect(h.ids, ['a', 'b']);

        await h.emit(
          TeamChatEventType.created,
          chatMessage('b', minute: 5, content: 'echo'),
        );
        expect(h.ids, ['a', 'b']);
        expect(h.state.messages.last.content, 'echo');
      },
    );

    test('updated replaces the old copy (read receipts)', () async {
      final h = _Harness();
      await h.open([chatMessage('a', sender: 'u1')]);
      expect(h.state.messages.single.readers, isEmpty);

      await h.emit(
        TeamChatEventType.updated,
        chatMessage('a', sender: 'u1', readBy: ['u2', 'u3']),
      );
      expect(h.state.messages.single.readers.map((r) => r.id), ['u2', 'u3']);
    });

    test('deleted blanks the message', () async {
      final h = _Harness();
      await h.open([chatMessage('a', content: 'secret')]);
      await h.emit(TeamChatEventType.deleted, chatMessage('a', deleted: true));
      expect(h.state.messages.single.isDeleted, isTrue);
      expect(h.state.messages.single.content, isEmpty);
    });

    test(
      'a deleted message stays deleted when an older copy arrives later',
      () async {
        final h = _Harness();
        await h.open([chatMessage('a', content: 'secret')]);
        await h.emit(
          TeamChatEventType.deleted,
          chatMessage('a', deleted: true),
        );

        // A page that was fetched before the delete finishes now.
        await h.emit(
          TeamChatEventType.updated,
          chatMessage('a', content: 'secret'),
        );
        expect(h.state.messages.single.isDeleted, isTrue);
        expect(h.state.messages.single.content, isEmpty);
      },
    );

    test(
      'unknown events and message events with no message are ignored',
      () async {
        final h = _Harness();
        await h.open([chatMessage('a')]);
        await h.emit(TeamChatEventType.unknown);
        await h.emit(TeamChatEventType.created);
        await h.emit(TeamChatEventType.updated);
        expect(h.ids, ['a']);
      },
    );
  });

  group('sending', () {
    test(
      'every send gets its own key, shows as sending, then the server copy replaces it',
      () async {
        final h = _Harness();
        await h.open();
        final gate = Completer<TeamChatMessage>();
        h.api.onSend = (_, _) => gate.future;

        expect(h.chat.send('  chào nhóm  '), TeamChatSendResult.accepted);
        await settle();
        expect(h.state.pending, hasLength(1));
        expect(h.state.pending.single.content, 'chào nhóm', reason: 'trimmed');
        expect(h.state.pending.single.state, PendingState.sending);
        expect(h.api.sendCalls.single, (content: 'chào nhóm', key: 'key-1'));

        gate.complete(
          chatMessage('srv', sender: 'u1', content: 'chào nhóm', minute: 9),
        );
        await settle();
        expect(h.state.pending, isEmpty);
        expect(h.ids, ['srv']);
      },
    );

    test(
      'empty, blank and too-long text is refused without a request',
      () async {
        final h = _Harness();
        await h.open();
        expect(h.chat.send(''), TeamChatSendResult.empty);
        expect(h.chat.send('   \n\t '), TeamChatSendResult.empty);
        expect(
          h.chat.send('x' * (teamChatMaxLength + 1)),
          TeamChatSendResult.tooLong,
        );
        expect(
          h.chat.send('${' ' * 50}${'x' * (teamChatMaxLength + 1)}'),
          TeamChatSendResult.tooLong,
        );
        await settle();
        expect(h.api.sendCalls, isEmpty);
        expect(h.state.pending, isEmpty);
      },
    );

    test('exactly 2000 characters is allowed (after trim)', () async {
      final h = _Harness();
      await h.open();
      expect(
        h.chat.send(' ${'x' * teamChatMaxLength} '),
        TeamChatSendResult.accepted,
      );
      await settle();
      expect(h.api.sendCalls.single.content, hasLength(teamChatMaxLength));
    });

    test(
      'the server echo can arrive BEFORE the POST answer: one message, no pending',
      () async {
        final h = _Harness();
        await h.open();
        final gate = Completer<TeamChatMessage>();
        h.api.onSend = (_, _) => gate.future;
        final mine = chatMessage(
          'srv',
          sender: 'u1',
          content: 'xin chào',
          minute: 9,
        );

        h.chat.send('xin chào');
        await settle();
        await h.emit(TeamChatEventType.created, mine);
        expect(
          h.state.pending,
          isEmpty,
          reason: 'echo hides the sending bubble',
        );
        expect(h.ids, ['srv']);

        gate.complete(mine);
        await settle();
        expect(h.ids, ['srv'], reason: 'the POST answer is a no-op');
        expect(h.state.pending, isEmpty);
      },
    );

    test(
      "an echo of another member's identical text keeps my pending message",
      () async {
        final h = _Harness();
        await h.open();
        final gate = Completer<TeamChatMessage>();
        h.api.onSend = (_, _) => gate.future;

        h.chat.send('ok');
        await settle();
        await h.emit(
          TeamChatEventType.created,
          chatMessage('x', content: 'ok', minute: 9),
        );
        expect(h.state.pending, hasLength(1));
        expect(h.ids, ['x']);
        gate.complete(
          chatMessage('srv', sender: 'u1', content: 'ok', minute: 10),
        );
        await settle();
        expect(h.ids, ['x', 'srv']);
        expect(h.state.pending, isEmpty);
      },
    );

    test(
      'network failure keeps the text as a failed message; resend reuses the SAME key',
      () async {
        final h = _Harness();
        await h.open();
        var fail = true;
        h.api.onSend = (content, _) async {
          if (fail) throw offlineError();
          return chatMessage('srv', sender: 'u1', content: content, minute: 9);
        };

        h.chat.send('quan trọng');
        await settle();
        expect(h.state.pending.single.state, PendingState.failed);
        expect(h.state.pending.single.failure, TeamChatFailure.offline);
        expect(h.state.pending.single.content, 'quan trọng');

        fail = false;
        h.chat.retry('key-1');
        await settle();
        expect(h.api.sendCalls.map((c) => c.key), ['key-1', 'key-1']);
        expect(h.api.sendCalls.map((c) => c.content), [
          'quan trọng',
          'quan trọng',
        ]);
        expect(h.state.pending, isEmpty);
        expect(h.ids, ['srv']);
      },
    );

    test('a server error (5xx) is a failed message too', () async {
      final h = _Harness();
      await h.open();
      h.api.onSend = (_, _) async => throw httpError(503);
      h.chat.send('a');
      await settle();
      expect(h.state.pending.single.failure, TeamChatFailure.other);
    });

    test(
      '429 keeps the text and says "too fast"; a later retry works',
      () async {
        final h = _Harness();
        await h.open();
        var limited = true;
        h.api.onSend = (content, _) async {
          if (limited) throw httpError(429);
          return chatMessage('srv', sender: 'u1', content: content, minute: 9);
        };
        h.chat.send('gửi nhanh');
        await settle();
        expect(h.state.pending.single.failure, TeamChatFailure.rateLimited);
        expect(h.state.pending.single.content, 'gửi nhanh');
        expect(
          vi(h.state.pending.single.failure!.sendMessage),
          'Bạn gửi quá nhanh, vui lòng đợi một chút.',
        );

        limited = false;
        h.chat.retry('key-1');
        await settle();
        expect(h.ids, ['srv']);
      },
    );

    test(
      '400 and 403 are reported as failed messages with their own reason',
      () async {
        final h = _Harness();
        await h.open();
        h.api.onSend = (_, _) async => throw httpError(400);
        h.chat.send('a');
        await settle();
        expect(h.state.pending.single.failure, TeamChatFailure.badRequest);

        h.api.onSend = (_, _) async => throw httpError(403);
        h.chat.send('b');
        await settle();
        expect(h.state.pending.last.failure, TeamChatFailure.forbidden);
        expect(
          h.state.stop,
          isNull,
          reason: 'a refused send does not end the chat',
        );
      },
    );

    test(
      'retry does nothing for a message that is still sending or unknown',
      () async {
        final h = _Harness();
        await h.open();
        final gate = Completer<TeamChatMessage>();
        h.api.onSend = (_, _) => gate.future;
        h.chat.send('a');
        await settle();
        h.chat
          ..retry('key-1')
          ..retry('nope');
        await settle();
        expect(h.api.sendCalls, hasLength(1));
        gate.complete(chatMessage('srv', sender: 'u1', content: 'a'));
        await settle();
      },
    );

    test('discard removes a failed message and only a failed one', () async {
      final h = _Harness();
      await h.open();
      h.api.onSend = (_, _) async => throw offlineError();
      h.chat.send('a');
      await settle();
      h.chat.discard('key-1');
      expect(h.state.pending, isEmpty);

      final gate = Completer<TeamChatMessage>();
      h.api.onSend = (_, _) => gate.future;
      h.chat.send('b');
      await settle();
      h.chat.discard('key-2');
      expect(h.state.pending, hasLength(1), reason: 'still sending');
      gate.complete(chatMessage('srv', sender: 'u1', content: 'b'));
      await settle();
    });

    test('rapid sends: separate keys, separate requests, order kept', () async {
      final h = _Harness();
      await h.open();
      final gates = <String, Completer<TeamChatMessage>>{};
      h.api.onSend = (content, _) => (gates[content] = Completer()).future;

      h.chat
        ..send('một')
        ..send('hai')
        ..send('ba');
      await settle();
      expect(h.api.sendCalls.map((c) => c.key), ['key-1', 'key-2', 'key-3']);
      expect(h.state.pending.map((p) => p.content), ['một', 'hai', 'ba']);

      // The server answers out of order.
      gates['ba']!.complete(
        chatMessage('s3', sender: 'u1', content: 'ba', minute: 3),
      );
      gates['một']!.complete(
        chatMessage('s1', sender: 'u1', content: 'một', minute: 1),
      );
      gates['hai']!.complete(
        chatMessage('s2', sender: 'u1', content: 'hai', minute: 2),
      );
      await settle();
      expect(h.ids, ['s1', 's2', 's3'], reason: 'sorted by server time');
      expect(h.state.pending, isEmpty);
    });

    test('identical texts sent twice stay two messages', () async {
      final h = _Harness();
      await h.open();
      h.chat
        ..send('ok')
        ..send('ok');
      await settle();
      expect(h.api.sendCalls.map((c) => c.key), ['key-1', 'key-2']);
    });

    test('nothing is sent once access is lost', () async {
      final h = _Harness();
      await h.open();
      h.api.stream.addError(httpError(403));
      await settle();
      expect(h.state.stop, TeamChatStop.noAccess);
      expect(h.chat.send('hello'), TeamChatSendResult.empty);
      expect(h.api.sendCalls, isEmpty);
    });

    test(
      'an answer that comes back after dispose is dropped quietly',
      () async {
        final h = _Harness();
        await h.open();
        final gate = Completer<TeamChatMessage>();
        h.api.onSend = (_, _) => gate.future;
        h.chat.send('muộn');
        await settle();
        h.container.dispose();
        gate.complete(chatMessage('srv', sender: 'u1', content: 'muộn'));
        await settle(); // must not throw
      },
    );
  });

  group('live connection', () {
    test(
      'a dropped stream reconnects after ~1s, then loads the newest page again',
      () async {
        final h = _Harness();
        await h.open([chatMessage('a', minute: 1)]);
        expect(h.api.listCalls, hasLength(1));

        h.api.stream.addError(offlineError());
        await settle();
        expect(h.state.connection, TeamChatConnection.reconnecting);
        final delay = h.timers.lastDelay!;
        expect(delay.inMilliseconds, inInclusiveRange(800, 1200));

        h.api.onList = (_, _) async => [
          chatMessage('a', minute: 1),
          chatMessage('missed', minute: 2),
        ];
        h.timers.fireLast();
        await settle();
        expect(h.api.streams, hasLength(2));
        h.api.stream.add(chatEvent(TeamChatEventType.ready));
        await settle();

        expect(h.state.connection, TeamChatConnection.connected);
        expect(
          h.api.listCalls,
          hasLength(2),
          reason: 'newest page fetched again',
        );
        expect(h.ids, [
          'a',
          'missed',
        ], reason: 'the missed message is filled in');
      },
    );

    test('the server closing the stream is treated like a drop', () async {
      final h = _Harness();
      await h.open();
      await h.api.stream.close();
      await settle();
      expect(h.state.connection, TeamChatConnection.reconnecting);
      h.timers.fireLast();
      await settle();
      expect(h.api.streams, hasLength(2));
    });

    test(
      'failures without a ready back off 1s, 2s, 4s, 8s, 16s, then stay at 30s',
      () async {
        final h = _Harness();
        h.chat.start();
        await settle();
        final delays = <Duration>[];
        for (var i = 0; i < 8; i++) {
          h.api.stream.addError(offlineError());
          await settle();
          delays.add(h.timers.lastDelay!);
          h.timers.fireLast();
          await settle();
        }
        const base = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];
        for (var i = 0; i < base.length; i++) {
          expect(
            delays[i].inMilliseconds,
            lessThanOrEqualTo(30000),
            reason: 'attempt $i',
          );
          expect(
            delays[i].inMilliseconds,
            greaterThanOrEqualTo((base[i] * 0.8).round()),
            reason: 'attempt $i',
          );
          expect(
            delays[i].inMilliseconds,
            lessThanOrEqualTo((base[i] * 1.2).round().clamp(0, 30000)),
            reason: 'attempt $i',
          );
        }
      },
    );

    test('a successful ready resets the back-off', () async {
      final h = _Harness();
      h.api.onList = (_, _) async => const [];
      h.chat.start();
      await settle();
      for (var i = 0; i < 3; i++) {
        h.api.stream.addError(offlineError());
        await settle();
        h.timers.fireLast();
        await settle();
      }
      h.api.stream.add(chatEvent(TeamChatEventType.ready));
      await settle();

      h.api.stream.addError(offlineError());
      await settle();
      expect(h.timers.lastDelay!.inMilliseconds, lessThanOrEqualTo(1200));
    });

    test('403 or 404 on the stream stops for good, without retrying', () async {
      for (final status in [403, 404]) {
        final h = _Harness();
        await h.open();
        h.api.stream.addError(httpError(status));
        await settle();
        expect(h.state.stop, TeamChatStop.noAccess, reason: '$status');
        expect(
          h.state.connection,
          TeamChatConnection.stopped,
          reason: '$status',
        );
        expect(
          h.timers.active.where(
            (t) =>
                t.duration >= const Duration(milliseconds: 800) &&
                t.duration <= const Duration(milliseconds: 1200),
          ),
          isEmpty,
        );
        expect(h.api.streams, hasLength(1));
      }
    });

    test(
      '401 stops too (the API client already tried to refresh the token)',
      () async {
        final h = _Harness();
        await h.open();
        h.api.stream.addError(httpError(401));
        await settle();
        expect(h.state.stop, TeamChatStop.unauthorized);
        expect(h.state.connection, TeamChatConnection.stopped);
      },
    );

    test('after stopping for good, start does not reconnect', () async {
      final h = _Harness();
      await h.open();
      h.api.stream.addError(httpError(403));
      await settle();
      h.chat.start();
      await settle();
      expect(h.api.streams, hasLength(1));
    });

    test(
      'stop closes the connection and timers; start opens a fresh one and refreshes',
      () async {
        final h = _Harness();
        await h.open([chatMessage('a', minute: 1)]);
        expect(h.api.activeStreams, 1);

        h.chat.stop();
        await settle();
        expect(h.api.activeStreams, 0, reason: 'subscription cancelled');
        expect(h.state.connection, TeamChatConnection.idle);
        expect(h.timers.active, isEmpty);

        h.api.onList = (_, _) async => [
          chatMessage('a', minute: 1),
          chatMessage('late', minute: 4),
        ];
        h.chat.start();
        await settle();
        expect(h.api.streams, hasLength(2));
        h.api.stream.add(chatEvent(TeamChatEventType.ready));
        await settle();
        expect(h.ids, ['a', 'late']);
      },
    );

    test('events from a connection that was replaced are ignored', () async {
      final h = _Harness();
      await h.open([chatMessage('a')]);
      final old = h.api.stream;
      h.chat
        ..stop()
        ..start();
      await settle();
      old.add(
        chatEvent(TeamChatEventType.created, chatMessage('ghost', minute: 7)),
      );
      await settle();
      expect(h.ids, ['a']);
    });

    test('dispose cancels the stream and timers', () async {
      final h = _Harness();
      await h.open();
      h.container.dispose();
      await settle();
      expect(h.api.activeStreams, 0);
      expect(h.timers.active, isEmpty);
    });

    test(
      'a 403 from list while the stream is open closes the stream (R2)',
      () async {
        final h = _Harness();
        var cancelled = 0;
        h.api.onList = (_, _) async => throw httpError(403);
        h.chat.start();
        await settle();
        h.api.stream.onCancel = () => cancelled++;
        h.api.stream.add(chatEvent(TeamChatEventType.ready));
        await settle();
        expect(h.state.stop, TeamChatStop.noAccess);
        expect(cancelled, 1, reason: 'the SSE socket is released');
        expect(h.api.activeStreams, 0);
      },
    );

    test(
      'a 404 from the refresh after a reconnect closes the stream (R2)',
      () async {
        final h = _Harness();
        await h.open([chatMessage('a', minute: 1)]);
        await h.reconnect(() async => throw httpError(404));
        expect(h.state.stop, TeamChatStop.noAccess);
        expect(h.api.activeStreams, 0);
      },
    );
  });

  group('refresh after a reconnect (R1)', () {
    test(
      'a full page with no known id replaces the old window; scrolling up continues from it',
      () async {
        final h = _Harness();
        await h.open(page(3)); // m000..m002, short: no more
        expect(h.state.hasMore, isFalse);

        // 50 newer messages arrived while offline (and more before them).
        await h.reconnect(() async => page(50, startMinute: 200));
        expect(h.ids, hasLength(50));
        expect(h.ids.first, 'm200');
        expect(h.ids.last, 'm249');
        expect(h.ids, isNot(contains('m000')), reason: 'no hole kept');
        expect(h.state.hasMore, isTrue);

        h.api.onList = (_, _) async => page(50, startMinute: 150);
        await h.chat.loadOlder();
        expect(h.api.listCalls.last.beforeId, 'm200');
        expect(h.ids.first, 'm150');
        expect(h.ids, hasLength(100));
      },
    );

    test('a full page sharing one id is merged; older messages stay', () async {
      final h = _Harness();
      await h.open(page(3)); // m000..m002
      await h.reconnect(() async => page(50, startMinute: 2)); // m002..m051
      expect(h.ids, hasLength(52));
      expect(h.ids.first, 'm000');
      expect(h.ids.last, 'm051');
      expect(h.state.hasMore, isFalse, reason: 'whole history already known');
    });

    test('a short page is merged; older messages stay', () async {
      final h = _Harness();
      await h.open(page(3));
      await h.reconnect(() async => page(10, startMinute: 300));
      expect(h.ids, hasLength(13));
      expect(h.ids.first, 'm000');
      expect(h.state.hasMore, isFalse);
    });

    test(
      'a replace keeps pending bubbles and live messages newer than the page',
      () async {
        final h = _Harness();
        await h.open(page(3));
        h.api.onSend = (_, _) => Completer<TeamChatMessage>().future;
        h.chat.send('Đang gửi');
        await settle();

        final answer = Completer<List<TeamChatMessage>>();
        await h.reconnect(() => answer.future);
        // A live message lands before the list answers.
        final live = chatMessage(
          'live',
          at: DateTime.utc(2026, 11, 9).add(const Duration(minutes: 999)),
        );
        await h.emit(TeamChatEventType.created, live);
        answer.complete(page(50, startMinute: 200));
        await settle();

        expect(h.ids.first, 'm200');
        expect(h.ids.last, 'live');
        expect(h.ids, hasLength(51));
        expect(h.state.pending, hasLength(1));
      },
    );

    test(
      'an older page that was in flight during a replace is dropped',
      () async {
        final h = _Harness();
        await h.open(page(50, startMinute: 100));
        final older = Completer<List<TeamChatMessage>>();
        h.api.onList = (_, _) => older.future;
        final loading = h.chat.loadOlder();
        await settle();

        await h.reconnect(() async => page(50, startMinute: 500));
        older.complete(page(50, startMinute: 50));
        await loading;
        await settle();

        expect(h.ids.first, 'm500', reason: 'm050.. would reopen the hole');
        expect(h.ids, hasLength(50));
        expect(h.state.loadingOlder, isFalse);
        expect(h.state.hasMore, isTrue);
      },
    );

    test(
      'a deleted message on the new page stays deleted on a later merge',
      () async {
        final h = _Harness();
        await h.open(page(3));
        final fresh = page(50, startMinute: 200);
        fresh[10] = chatMessage(
          fresh[10].id,
          at: fresh[10].createdAt,
          deleted: true,
        );
        await h.reconnect(() async => fresh);
        await h.emit(
          TeamChatEventType.updated,
          chatMessage('m210', at: fresh[10].createdAt),
        );
        final m = h.state.messages.firstWhere((x) => x.id == 'm210');
        expect(m.isDeleted, isTrue);
      },
    );
  });

  group('marking read', () {
    test(
      'the newest message from someone else is marked once, after 1 second',
      () async {
        final h = _Harness();
        await h.open();
        final m = chatMessage('n1', minute: 5);
        await h.emit(TeamChatEventType.created, m);

        h.chat.noteLatestFromOthers(m);
        expect(h.api.readCalls, isEmpty, reason: 'debounced');
        expect(h.timers.lastDelay, teamChatReadDebounce);

        h.timers.fireLast();
        await settle();
        expect(h.api.readCalls, ['n1']);
        expect(
          h.state.messages.single.isReadBy('u1'),
          isTrue,
          reason: 'server copy merged',
        );

        // Seeing it again, many times, never calls again.
        h.chat
          ..noteLatestFromOthers(m)
          ..noteLatestFromOthers(m);
        expect(h.timers.active, isEmpty);
        await settle();
        expect(h.api.readCalls, ['n1']);
      },
    );

    test(
      'several calls inside the debounce collapse into one call for the last',
      () async {
        final h = _Harness();
        await h.open();
        h.chat
          ..noteLatestFromOthers(chatMessage('a', minute: 1))
          ..noteLatestFromOthers(chatMessage('b', minute: 2))
          ..noteLatestFromOthers(chatMessage('c', minute: 3));
        expect(
          h.timers.active,
          hasLength(1),
          reason: 'earlier timers were cancelled',
        );
        h.timers.fireLast();
        await settle();
        expect(h.api.readCalls, ['c']);
      },
    );

    test(
      'my own, deleted and already-read messages are never marked',
      () async {
        final h = _Harness();
        await h.open();
        h.chat
          ..noteLatestFromOthers(chatMessage('mine', sender: 'u1'))
          ..noteLatestFromOthers(chatMessage('gone', deleted: true))
          ..noteLatestFromOthers(chatMessage('seen', readBy: ['u1']));
        expect(h.timers.active, isEmpty);
        await settle();
        expect(h.api.readCalls, isEmpty);
      },
    );

    test('a failed mark is not retried for the same message', () async {
      final h = _Harness();
      await h.open();
      h.api.onMarkRead = (_) async => throw offlineError();
      final m = chatMessage('n1');
      h.chat.noteLatestFromOthers(m);
      h.timers.fireLast();
      await settle();
      h.chat.noteLatestFromOthers(m);
      expect(h.timers.active, isEmpty);
      expect(h.api.readCalls, ['n1']);
    });

    test('nothing is marked while the chat is stopped', () async {
      final h = _Harness();
      await h.open();
      h.chat.noteLatestFromOthers(chatMessage('n1'));
      h.chat.stop();
      await settle();
      expect(
        h.timers.active,
        isEmpty,
        reason: 'the pending mark was cancelled',
      );
      expect(h.api.readCalls, isEmpty);
    });
  });

  group('deleting', () {
    test('success replaces the message with its deleted copy', () async {
      final h = _Harness();
      await h.open([chatMessage('a', sender: 'u1', content: 'bỏ')]);
      final failure = await h.chat.delete('a', reason: 'nhầm');
      expect(failure, isNull);
      expect(h.api.deleteCalls.single, (id: 'a', reason: 'nhầm'));
      expect(h.state.messages.single.isDeleted, isTrue);
    });

    test('403 is returned and the message is untouched', () async {
      final h = _Harness();
      await h.open([chatMessage('a', content: 'giữ')]);
      h.api.onDelete = (_, _) async => throw httpError(403);
      final failure = await h.chat.delete('a');
      expect(failure, TeamChatFailure.forbidden);
      expect(h.state.messages.single.isDeleted, isFalse);
      expect(h.state.messages.single.content, 'giữ');
    });

    test(
      'a second delete of the same message while one is running is ignored',
      () async {
        final h = _Harness();
        await h.open([chatMessage('a', sender: 'u1')]);
        final gate = Completer<TeamChatMessage>();
        h.api.onDelete = (_, _) => gate.future;
        final first = h.chat.delete('a');
        final second = h.chat.delete('a');
        expect(await second, isNull);
        gate.complete(chatMessage('a', deleted: true));
        expect(await first, isNull);
        expect(h.api.deleteCalls, hasLength(1));
      },
    );
  });

  group('helpers', () {
    test(
      'teamChatBackoff grows, is capped at 30s and stays within jitter bounds',
      () {
        final r = Random(7);
        const base = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
        for (var attempt = 0; attempt < base.length; attempt++) {
          for (var i = 0; i < 50; i++) {
            final ms = teamChatBackoff(attempt, r).inMilliseconds;
            expect(ms, lessThanOrEqualTo(30000));
            expect(ms, greaterThanOrEqualTo((base[attempt] * 0.8).round()));
            expect(
              ms,
              lessThanOrEqualTo(min(30000, (base[attempt] * 1.2).round())),
            );
          }
        }
        expect(
          teamChatBackoff(500, r).inMilliseconds,
          lessThanOrEqualTo(30000),
        );
      },
    );

    test('generateUuidV4 is a well-formed v4 UUID and different every time', () {
      final re = RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      );
      final seen = <String>{};
      for (var i = 0; i < 200; i++) {
        final id = generateUuidV4();
        expect(id, matches(re));
        seen.add(id);
      }
      expect(seen, hasLength(200));
      expect(
        generateUuidV4(Random(1)),
        generateUuidV4(Random(1)),
        reason: 'seedable',
      );
    });
  });
}
