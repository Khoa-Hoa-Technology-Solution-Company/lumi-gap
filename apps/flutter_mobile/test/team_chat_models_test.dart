import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/errors/api_exception.dart';
import 'package:flutter_mobile/features/projects/data/sse_parser.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'i18n_support.dart';

Map<String, dynamic> msg({
  String id = 'm1',
  String sender = 'u2',
  String content = 'Xin chào',
  bool deleted = false,
  List<Map<String, dynamic>>? readBy,
}) => {
  'id': id,
  'projectId': 'p1',
  'sender': {'id': sender, 'fullName': 'Lan Tran', 'email': 'lan@x.vn'},
  'content': content,
  'readBy':
      readBy ??
      [
        {'id': sender, 'fullName': 'Lan Tran'},
        {'id': 'u1', 'fullName': 'Minh'},
      ],
  'readCount': 2,
  'isDeleted': deleted,
  'createdAt': '2026-11-09T10:00:00.000Z',
};

SseEvent sse(Object data, {String? event}) =>
    SseEvent(data: data is String ? data : jsonEncode(data), event: event);

void main() {
  group('TeamChatMessage.fromJson', () {
    test('full message', () {
      final m = TeamChatMessage.fromJson(msg())!;
      expect(m.id, 'm1');
      expect(m.projectId, 'p1');
      expect(m.sender.displayName, 'Lan Tran');
      expect(m.content, 'Xin chào');
      expect(m.createdAt, DateTime.utc(2026, 11, 9, 10));
      expect(m.isDeleted, isFalse);
      expect(m.readBy, hasLength(2));
    });

    test('readers excludes the sender and duplicates', () {
      final m = TeamChatMessage.fromJson(
        msg(
          readBy: [
            {'id': 'u2'},
            {'id': 'u1'},
            {'id': 'u1'},
            {'id': 'u3'},
          ],
        ),
      )!;
      expect(m.readers.map((r) => r.id), ['u1', 'u3']);
      expect(m.isReadBy('u1'), isTrue);
      expect(m.isReadBy('u9'), isFalse);
      expect(m.isReadBy(null), isFalse);
    });

    test('a deleted message never exposes content', () {
      final m = TeamChatMessage.fromJson(
        msg(deleted: true, content: 'bí mật'),
      )!;
      expect(m.isDeleted, isTrue);
      expect(m.content, isEmpty);
    });

    test('missing and wrong-typed fields get defaults, no throw', () {
      final m = TeamChatMessage.fromJson({
        'id': 'x',
        'content': 5,
        'readBy': 'no',
        'createdAt': 'bad',
      })!;
      expect(m.content, isEmpty);
      expect(m.readBy, isEmpty);
      expect(m.readCount, 0);
      expect(m.sender.id, isEmpty);
      expect(m.createdAt.millisecondsSinceEpoch, 0);
    });

    test('items without an id are skipped from lists', () {
      final list = TeamChatMessage.listFromJson([
        msg(id: 'a'),
        'junk',
        {'content': 'no id'},
        null,
        msg(id: 'b'),
      ]);
      expect(list.map((m) => m.id), ['a', 'b']);
      expect(TeamChatMessage.listFromJson(null), isEmpty);
      expect(TeamChatMessage.listFromJson({'not': 'a list'}), isEmpty);
    });

    test('legacy _id is accepted', () {
      expect(TeamChatMessage.fromJson({'_id': 'old'})!.id, 'old');
    });
  });

  group('TeamChatSender', () {
    test('display name falls back to email, then to a generic name', () {
      expect(
        const TeamChatSender(id: '1', fullName: 'An', email: 'a@x').displayName,
        'An',
      );
      expect(const TeamChatSender(id: '1', email: 'a@x').displayName, 'a@x');
      expect(vi(const TeamChatSender(id: '1').displayName), 'Thành viên');
    });

    test(
      'initial is one upper-case character, also for Vietnamese and emoji',
      () {
        expect(const TeamChatSender(id: '1', fullName: 'ánh').initial, 'Á');
        expect(const TeamChatSender(id: '1', fullName: 'minh').initial, 'M');
        expect(const TeamChatSender(id: '1', fullName: '😀 x').initial, '😀');
      },
    );
  });

  group('TeamChatEvent.fromSse', () {
    Map<String, dynamic> ev(String type, {bool withMessage = true}) => {
      'type': type,
      'projectId': 'p1',
      'occurredAt': '2026-11-09T10:00:01.000Z',
      if (withMessage) 'message': msg(),
    };

    test('ready has no message', () {
      final e = TeamChatEvent.fromSse(
        sse(ev('ready', withMessage: false), event: 'ready'),
      )!;
      expect(e.type, TeamChatEventType.ready);
      expect(e.message, isNull);
    });

    test('created, updated and deleted carry the message', () {
      for (final (name, type) in [
        ('message.created', TeamChatEventType.created),
        ('message.updated', TeamChatEventType.updated),
        ('message.deleted', TeamChatEventType.deleted),
      ]) {
        final e = TeamChatEvent.fromSse(sse(ev(name)))!;
        expect(e.type, type, reason: name);
        expect(e.message!.id, 'm1', reason: name);
        expect(e.occurredAt, isNotNull);
      }
    });

    test('the type falls back to the SSE event name', () {
      final e = TeamChatEvent.fromSse(
        sse({'message': msg()}, event: 'message.created'),
      )!;
      expect(e.type, TeamChatEventType.created);
    });

    test(
      'unknown type becomes unknown, and message events without a message too',
      () {
        expect(
          TeamChatEvent.fromSse(sse(ev('message.exploded')))!.type,
          TeamChatEventType.unknown,
        );
        expect(
          TeamChatEvent.fromSse(
            sse(ev('message.created', withMessage: false)),
          )!.type,
          TeamChatEventType.unknown,
        );
        expect(
          TeamChatEvent.fromSse(sse({'projectId': 'p'}))!.type,
          TeamChatEventType.unknown,
        );
      },
    );

    test('data that is not a JSON object is rejected', () {
      for (final bad in ['not json', '[1,2]', '"text"', '42', '']) {
        expect(TeamChatEvent.fromSse(SseEvent(data: bad)), isNull, reason: bad);
      }
    });
  });

  group('classifyTeamChatError', () {
    DioException http(int status) {
      final o = RequestOptions(path: '/x');
      return DioException(
        requestOptions: o,
        type: DioExceptionType.badResponse,
        response: Response<dynamic>(requestOptions: o, statusCode: status),
        error: ApiException(message: 'm', statusCode: status),
      );
    }

    test('maps the status codes', () {
      expect(classifyTeamChatError(http(429)), TeamChatFailure.rateLimited);
      expect(classifyTeamChatError(http(403)), TeamChatFailure.forbidden);
      expect(classifyTeamChatError(http(404)), TeamChatFailure.notFound);
      expect(classifyTeamChatError(http(401)), TeamChatFailure.unauthorized);
      expect(classifyTeamChatError(http(400)), TeamChatFailure.badRequest);
      expect(classifyTeamChatError(http(409)), TeamChatFailure.conflict);
      expect(classifyTeamChatError(http(500)), TeamChatFailure.other);
      expect(classifyTeamChatError(http(503)), TeamChatFailure.other);
    });

    test('connection problems are offline', () {
      for (final t in [
        DioExceptionType.connectionError,
        DioExceptionType.connectionTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.sendTimeout,
      ]) {
        expect(
          classifyTeamChatError(
            DioException(
              requestOptions: RequestOptions(path: '/x'),
              type: t,
            ),
          ),
          TeamChatFailure.offline,
          reason: '$t',
        );
      }
    });

    test('anything else is other; every failure has user-facing text', () {
      expect(classifyTeamChatError(StateError('x')), TeamChatFailure.other);
      expect(
        classifyTeamChatError(ApiException(message: 'm', statusCode: 429)),
        TeamChatFailure.rateLimited,
      );
      for (final f in TeamChatFailure.values) {
        expect(f.sendMessage, isNotEmpty);
        expect(f.loadMessage, isNotEmpty);
      }
      expect(
        vi(TeamChatFailure.rateLimited.sendMessage),
        'Bạn gửi quá nhanh, vui lòng đợi một chút.',
      );
      expect(
        vi(TeamChatFailure.forbidden.loadMessage),
        'Bạn không còn quyền xem cuộc trò chuyện này.',
      );
    });
  });
}
