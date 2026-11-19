import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/errors/api_exception.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_api.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';

/// Test doubles for the team chat: a scriptable API and manual timers, so the
/// controller and the view can be driven step by step with no network and no
/// real clock.

TeamChatMessage chatMessage(
  String id, {
  String sender = 'u2',
  String content = 'Xin chào',
  int minute = 0,
  DateTime? at,
  List<String> readBy = const [],
  bool deleted = false,
  String senderName = 'Lan Tran',
}) {
  final readers = [
    TeamChatSender(id: sender, fullName: senderName),
    for (final r in readBy) TeamChatSender(id: r, fullName: 'User $r'),
  ];
  return TeamChatMessage(
    id: id,
    projectId: 'p1',
    sender: TeamChatSender(id: sender, fullName: senderName),
    content: deleted ? '' : content,
    createdAt: at ?? DateTime.utc(2026, 11, 9, 10, minute),
    readBy: readers,
    readCount: readers.length,
    isDeleted: deleted,
  );
}

TeamChatEvent chatEvent(TeamChatEventType type, [TeamChatMessage? message]) =>
    TeamChatEvent(type: type, message: message);

DioException httpError(int status) {
  final options = RequestOptions(path: '/team-chat');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response<dynamic>(requestOptions: options, statusCode: status),
    error: ApiException(message: 'HTTP $status', statusCode: status),
  );
}

DioException offlineError() => DioException(
  requestOptions: RequestOptions(path: '/team-chat'),
  type: DioExceptionType.connectionError,
);

class FakeTeamChatApi implements TeamChatApi {
  Future<List<TeamChatMessage>> Function(String? beforeId, int limit)? onList;
  Future<TeamChatMessage> Function(String content, String key)? onSend;
  Future<TeamChatMessage> Function(String id)? onMarkRead;
  Future<TeamChatMessage> Function(String id, String? reason)? onDelete;

  final List<({String? beforeId, int limit})> listCalls = [];
  final List<({String content, String key})> sendCalls = [];
  final List<String> readCalls = [];
  final List<({String id, String? reason})> deleteCalls = [];
  final List<StreamController<TeamChatEvent>> streams = [];

  /// The most recent connection.
  StreamController<TeamChatEvent> get stream => streams.last;

  int get activeStreams => streams.where((s) => s.hasListener).length;

  @override
  Future<List<TeamChatMessage>> list(
    String projectId, {
    int limit = 50,
    String? beforeId,
  }) {
    listCalls.add((beforeId: beforeId, limit: limit));
    return onList?.call(beforeId, limit) ?? Future.value(const []);
  }

  @override
  Future<TeamChatMessage> send(
    String projectId,
    String content,
    String clientKey,
  ) {
    sendCalls.add((content: content, key: clientKey));
    return onSend?.call(content, clientKey) ??
        Future.value(
          chatMessage(
            'srv-${sendCalls.length}',
            sender: 'u1',
            content: content,
          ),
        );
  }

  @override
  Future<TeamChatMessage> markRead(String projectId, String messageId) {
    readCalls.add(messageId);
    return onMarkRead?.call(messageId) ??
        Future.value(chatMessage(messageId, readBy: ['u1']));
  }

  @override
  Future<TeamChatMessage> delete(
    String projectId,
    String messageId, {
    String? reason,
  }) {
    deleteCalls.add((id: messageId, reason: reason));
    return onDelete?.call(messageId, reason) ??
        Future.value(chatMessage(messageId, deleted: true));
  }

  @override
  Stream<TeamChatEvent> events(String projectId) {
    final controller = StreamController<TeamChatEvent>();
    streams.add(controller);
    return controller.stream;
  }
}

class ManualTimer implements Timer {
  ManualTimer(this.duration, this._callback, this._owner);

  final Duration duration;
  final void Function() _callback;
  final ManualTimers _owner;
  bool _active = true;
  bool fired = false;

  @override
  bool get isActive => _active;

  @override
  int get tick => fired ? 1 : 0;

  @override
  void cancel() => _active = false;

  void fire() {
    if (!_active) return;
    _active = false;
    fired = true;
    _owner.fireCount++;
    _callback();
  }
}

/// Timers that only run when the test says so.
class ManualTimers {
  final List<ManualTimer> all = [];
  int fireCount = 0;

  Timer create(Duration d, void Function() cb) {
    final t = ManualTimer(d, cb, this);
    all.add(t);
    return t;
  }

  List<ManualTimer> get active => all.where((t) => t.isActive).toList();

  /// Fires the newest active timer.
  void fireLast() => active.last.fire();

  void fireWhere(bool Function(ManualTimer t) test) {
    for (final t in active.where(test).toList()) {
      t.fire();
    }
  }

  Duration? get lastDelay => all.isEmpty ? null : all.last.duration;
}

TeamChatEnv testEnv(
  ManualTimers timers, {
  DateTime? now,
  int seed = 1,
}) {
  var n = 0;
  return TeamChatEnv(
    timer: timers.create,
    newClientKey: () => 'key-${++n}',
    random: Random(seed),
    now: () => now ?? DateTime.utc(2026, 11, 9, 12),
  );
}

/// Lets queued microtasks and zero-delay futures run.
Future<void> settle() async {
  for (var i = 0; i < 8; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}
