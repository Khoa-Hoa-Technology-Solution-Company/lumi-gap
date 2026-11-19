import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_items.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';
import 'package:flutter_test/flutter_test.dart';

import 'team_chat_support.dart';

// All dates are local: grouping and day separators use the device time zone.
final _now = DateTime(2026, 11, 9, 15);

DateTime at(int day, int hour, [int minute = 0]) =>
    DateTime(2026, 11, day, hour, minute);

TeamChatItemsForTest build(
  List<dynamic> messages, {
  List<PendingTeamMessage> pending = const [],
  String? myId = 'u1',
}) {
  final items = buildTeamChatItems(
    messages: [...messages.cast()],
    pending: pending,
    myId: myId,
    now: _now,
    locale: AppLocale.vi,
  );
  return TeamChatItemsForTest(items);
}

class TeamChatItemsForTest {
  TeamChatItemsForTest(this.items);
  final List<TeamChatItem> items;

  /// "D:label" for day separators, "M:id" for messages, "P:text" for pending,
  /// with a trailing "*" when the item starts a group.
  List<String> get shape => [
    for (final i in items)
      switch (i) {
        TeamChatDayItem() => 'D:${i.label}',
        TeamChatMessageItem() => 'M:${i.message.id}${i.startsGroup ? '*' : ''}',
        TeamChatPendingItem() =>
          'P:${i.pending.content}${i.startsGroup ? '*' : ''}',
      },
  ];

  List<TeamChatMessageItem> get messages =>
      items.whereType<TeamChatMessageItem>().toList();
}

PendingTeamMessage pending(
  String text, {
  PendingState state = PendingState.sending,
}) => PendingTeamMessage(
  clientKey: 'k-$text',
  content: text,
  createdAt: _now,
  state: state,
);

void main() {
  group('teamChatDayLabel', () {
    test('today, yesterday, then dd/MM/yyyy', () {
      expect(teamChatDayLabel(at(9, 0, 1), _now, AppLocale.vi), 'Hôm nay');
      expect(teamChatDayLabel(at(9, 23, 59), _now, AppLocale.vi), 'Hôm nay');
      expect(teamChatDayLabel(at(8, 23, 59), _now, AppLocale.vi), 'Hôm qua');
      expect(teamChatDayLabel(at(8, 0), _now, AppLocale.vi), 'Hôm qua');
      expect(teamChatDayLabel(at(7, 12), _now, AppLocale.vi), '07/11/2026');
      expect(
        teamChatDayLabel(DateTime(2025, 3, 5, 9), _now, AppLocale.vi),
        '05/03/2025',
      );
    });

    test('the boundary is local midnight, not 24 hours', () {
      final justAfterMidnight = DateTime(2026, 11, 9, 0, 5);
      expect(
        teamChatDayLabel(
          DateTime(2026, 11, 8, 23, 59),
          justAfterMidnight,
          AppLocale.vi,
        ),
        'Hôm qua',
      );
      expect(
        teamChatDayLabel(
          DateTime(2026, 11, 9, 0, 1),
          justAfterMidnight,
          AppLocale.vi,
        ),
        'Hôm nay',
      );
    });

    test('month and year wraps', () {
      final firstOfMonth = DateTime(2026, 12, 1, 8);
      expect(
        teamChatDayLabel(
          DateTime(2026, 11, 30, 20),
          firstOfMonth,
          AppLocale.vi,
        ),
        'Hôm qua',
      );
      final newYear = DateTime(2027, 1, 1, 8);
      expect(
        teamChatDayLabel(DateTime(2026, 12, 31, 20), newYear, AppLocale.vi),
        'Hôm qua',
      );
    });
  });

  group('day separators', () {
    test('one separator per day, before the first message of that day', () {
      final r = build([
        chatMessage('a', at: DateTime(2026, 11, 5, 9)),
        chatMessage('b', at: at(8, 20)),
        chatMessage('c', at: at(8, 20, 2)),
        chatMessage('d', at: at(9, 8)),
      ]);
      expect(r.shape, [
        'D:05/11/2026',
        'M:a*',
        'D:Hôm qua',
        'M:b*',
        'M:c',
        'D:Hôm nay',
        'M:d*',
      ]);
    });

    test('an empty list gives no items', () {
      expect(build([]).items, isEmpty);
    });
  });

  group('grouping', () {
    test('same sender within 5 minutes is one group; the first starts it', () {
      final r = build([
        chatMessage('a', at: at(9, 9)),
        chatMessage('b', at: at(9, 9, 3)),
        chatMessage('c', at: at(9, 9, 8)),
      ]);
      expect(r.shape, ['D:Hôm nay', 'M:a*', 'M:b', 'M:c']);
    });

    test(
      'a gap of exactly 5 minutes still groups, 5 minutes 1 second does not',
      () {
        final r = build([
          chatMessage('a', at: at(9, 9)),
          chatMessage('b', at: at(9, 9, 5)),
          chatMessage('c', at: DateTime(2026, 11, 9, 9, 10, 6)),
        ]);
        expect(r.shape, ['D:Hôm nay', 'M:a*', 'M:b', 'M:c*']);
      },
    );

    test('the gap is measured from the previous message, not the first', () {
      final r = build([
        chatMessage('a', at: at(9, 9)),
        chatMessage('b', at: at(9, 9, 4)),
        chatMessage('c', at: at(9, 9, 8)),
        chatMessage('d', at: at(9, 9, 12)),
      ]);
      expect(r.shape, ['D:Hôm nay', 'M:a*', 'M:b', 'M:c', 'M:d']);
    });

    test('a different sender starts a new group, and so does coming back', () {
      final r = build([
        chatMessage('a', at: at(9, 9)),
        chatMessage('b', sender: 'u3', at: at(9, 9, 1)),
        chatMessage('c', at: at(9, 9, 2)),
      ]);
      expect(r.shape, ['D:Hôm nay', 'M:a*', 'M:b*', 'M:c*']);
    });

    test('a new day always starts a new group even for the same sender', () {
      final r = build([
        chatMessage('a', at: DateTime(2026, 11, 8, 23, 59)),
        chatMessage('b', at: DateTime(2026, 11, 9, 0, 1)),
      ]);
      expect(r.shape, ['D:Hôm qua', 'M:a*', 'D:Hôm nay', 'M:b*']);
    });

    test('deleted messages keep their place in a group', () {
      final r = build([
        chatMessage('a', at: at(9, 9)),
        chatMessage('b', at: at(9, 9, 1), deleted: true),
        chatMessage('c', at: at(9, 9, 2)),
      ]);
      expect(r.shape, ['D:Hôm nay', 'M:a*', 'M:b', 'M:c']);
    });

    test(
      'mine is flagged by the sender id; without a user nothing is mine',
      () {
        final r = build([
          chatMessage('a', sender: 'u1', at: at(9, 9)),
          chatMessage('b', at: at(9, 9, 1)),
        ]);
        expect(r.messages.map((m) => m.mine), [true, false]);
        final anon = build([
          chatMessage('a', sender: 'u1', at: at(9, 9)),
        ], myId: null);
        expect(anon.messages.single.mine, isFalse);
      },
    );
  });

  group('pending messages', () {
    test('always come last, in the order they were typed', () {
      final r = build(
        [chatMessage('a', at: at(9, 9))],
        pending: [pending('một'), pending('hai')],
      );
      expect(r.shape, ['D:Hôm nay', 'M:a*', 'P:một*', 'P:hai']);
    });

    test(
      'follow my last message in the same group, but start one after someone else',
      () {
        final mine = build(
          [chatMessage('a', sender: 'u1', at: at(9, 9))],
          pending: [pending('x')],
        );
        expect(mine.shape.last, 'P:x');
        final others = build(
          [chatMessage('a', at: at(9, 9))],
          pending: [pending('x')],
        );
        expect(others.shape.last, 'P:x*');
      },
    );

    test('with no messages at all', () {
      final r = build([], pending: [pending('đầu tiên')]);
      expect(r.shape, ['P:đầu tiên*']);
    });
  });

  group('"Đã xem" placement', () {
    test('only under my last message', () {
      final r = build([
        chatMessage('a', sender: 'u1', at: at(9, 9)),
        chatMessage('b', at: at(9, 9, 1)),
        chatMessage('c', sender: 'u1', at: at(9, 9, 2)),
        chatMessage('d', at: at(9, 9, 3)),
      ]);
      expect(r.messages.map((m) => m.showSeen), [false, false, true, false]);
    });

    test('skips my deleted messages', () {
      final r = build([
        chatMessage('a', sender: 'u1', at: at(9, 9)),
        chatMessage('b', sender: 'u1', at: at(9, 9, 1), deleted: true),
      ]);
      expect(r.messages.map((m) => m.showSeen), [true, false]);
    });

    test('not shown while something of mine is still sending', () {
      final r = build(
        [chatMessage('a', sender: 'u1', at: at(9, 9))],
        pending: [pending('x')],
      );
      expect(r.messages.single.showSeen, isFalse);
    });

    test('not shown when I have no messages or no user is known', () {
      expect(
        build([
          chatMessage('a', at: at(9, 9)),
        ]).messages.single.showSeen,
        isFalse,
      );
      expect(
        build([
          chatMessage('a', sender: 'u1', at: at(9, 9)),
        ], myId: null).messages.single.showSeen,
        isFalse,
      );
    });
  });

  group('latestFromOthers', () {
    test('is the newest message that is not mine and not deleted', () {
      final messages = [
        chatMessage('a', minute: 1),
        chatMessage('b', sender: 'u3', minute: 2),
        chatMessage('c', sender: 'u1', minute: 3),
        chatMessage('d', minute: 4, deleted: true),
      ];
      expect(latestFromOthers(messages, 'u1')!.id, 'b');
    });

    test('null when everything is mine, deleted, or the list is empty', () {
      expect(latestFromOthers([], 'u1'), isNull);
      expect(latestFromOthers([chatMessage('a', sender: 'u1')], 'u1'), isNull);
      expect(latestFromOthers([chatMessage('a', deleted: true)], 'u1'), isNull);
    });
  });
}
