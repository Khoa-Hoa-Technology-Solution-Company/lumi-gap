import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/errors/api_exception.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/features/projects/data/sse_parser.dart';

// Hand-written, forgiving parsers for the project team chat API
// (packages/shared-types/src/project.ts: ProjectTeamChatMessage and
// ProjectTeamChatEvent). Missing fields get defaults, unknown fields and
// unknown event types are ignored, and nothing here throws on bad input.

typedef Json = Map<String, dynamic>;

String? _str(Object? v) {
  if (v is! String) return null;
  final t = v.trim();
  return t.isEmpty ? null : t;
}

class TeamChatSender {
  const TeamChatSender({
    required this.id,
    this.fullName,
    this.email,
    this.avatarUrl,
  });

  static TeamChatSender? fromJson(Object? json) {
    if (json is! Json) return null;
    final id = _str(json['id'] ?? json['_id']);
    if (id == null) return null;
    return TeamChatSender(
      id: id,
      fullName: _str(json['fullName']),
      email: _str(json['email']),
      avatarUrl: _str(json['avatarUrl']),
    );
  }

  final String id;
  final String? fullName;
  final String? email;
  final String? avatarUrl;

  String get displayName => fullName ?? email ?? trNow('Member');

  /// One upper-case letter for the avatar circle.
  String get initial {
    final name = displayName.trim();
    return name.isEmpty
        ? '?'
        : String.fromCharCode(name.runes.first).toUpperCase();
  }
}

class TeamChatMessage {
  const TeamChatMessage({
    required this.id,
    required this.projectId,
    required this.sender,
    required this.content,
    required this.createdAt,
    this.readBy = const [],
    this.readCount = 0,
    this.isDeleted = false,
    this.deletedAt,
  });

  /// Null when the item has no id (it is skipped by the list parsers).
  static TeamChatMessage? fromJson(Object? json) {
    if (json is! Json) return null;
    final id = _str(json['id'] ?? json['_id']);
    if (id == null) return null;
    final sender =
        TeamChatSender.fromJson(json['sender']) ?? const TeamChatSender(id: '');
    final readBy = <TeamChatSender>[];
    if (json['readBy'] is List) {
      for (final item in json['readBy'] as List) {
        final reader = TeamChatSender.fromJson(item);
        if (reader != null) readBy.add(reader);
      }
    }
    final deleted = json['isDeleted'] == true;
    return TeamChatMessage(
      id: id,
      projectId: _str(json['projectId']) ?? '',
      sender: sender,
      // The server blanks the content of a deleted message; never show it.
      content: deleted || json['content'] is! String
          ? ''
          : json['content'] as String,
      createdAt:
          DateTime.tryParse(
            json['createdAt'] is String ? json['createdAt'] as String : '',
          ) ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      readBy: readBy,
      readCount: json['readCount'] is num
          ? (json['readCount'] as num).toInt()
          : readBy.length,
      isDeleted: deleted,
      deletedAt: DateTime.tryParse(
        json['deletedAt'] is String ? json['deletedAt'] as String : '',
      ),
    );
  }

  static List<TeamChatMessage> listFromJson(Object? json) {
    if (json is! List) return const [];
    return [for (final item in json) ?fromJson(item)];
  }

  final String id;
  final String projectId;
  final TeamChatSender sender;
  final String content;
  final DateTime createdAt;
  final List<TeamChatSender> readBy;
  final int readCount;
  final bool isDeleted;
  final DateTime? deletedAt;

  /// People other than the sender who have read it (the server also counts
  /// the sender, who reads their own message when sending).
  List<TeamChatSender> get readers {
    final seen = <String>{sender.id};
    return [
      for (final r in readBy)
        if (seen.add(r.id)) r,
    ];
  }

  bool isReadBy(String? userId) =>
      userId != null && readBy.any((r) => r.id == userId);
}

enum TeamChatEventType { ready, created, updated, deleted, unknown }

class TeamChatEvent {
  const TeamChatEvent({
    required this.type,
    this.message,
    this.occurredAt,
  });

  /// Null when the data is not a JSON object. A message event without a
  /// message, or with an unknown type, becomes [TeamChatEventType.unknown].
  static TeamChatEvent? fromSse(SseEvent sse) {
    Object? decoded;
    try {
      decoded = jsonDecode(sse.data);
    } on FormatException {
      return null;
    }
    if (decoded is! Json) return null;
    final name = _str(decoded['type']) ?? sse.event;
    final type = switch (name) {
      'ready' => TeamChatEventType.ready,
      'message.created' => TeamChatEventType.created,
      'message.updated' => TeamChatEventType.updated,
      'message.deleted' => TeamChatEventType.deleted,
      _ => TeamChatEventType.unknown,
    };
    final message = TeamChatMessage.fromJson(decoded['message']);
    if (type != TeamChatEventType.ready &&
        type != TeamChatEventType.unknown &&
        message == null) {
      return const TeamChatEvent(type: TeamChatEventType.unknown);
    }
    return TeamChatEvent(
      type: type,
      message: message,
      occurredAt: DateTime.tryParse(
        decoded['occurredAt'] is String ? decoded['occurredAt'] as String : '',
      ),
    );
  }

  final TeamChatEventType type;
  final TeamChatMessage? message;
  final DateTime? occurredAt;
}

/// Why a team chat request failed, in terms the UI can explain.
enum TeamChatFailure {
  rateLimited,
  forbidden,
  notFound,
  unauthorized,
  badRequest,
  conflict,
  offline,
  other,
}

extension TeamChatFailureMessage on TeamChatFailure {
  /// What to tell the user for a failed send (English key, shown with
  /// `context.t`).
  String get sendMessage => switch (this) {
    TeamChatFailure.rateLimited =>
      tk('You are sending too fast. Please wait a moment.'),
    TeamChatFailure.forbidden =>
      tk('You do not have permission to send messages in this project.'),
    TeamChatFailure.notFound =>
      tk('This project or conversation was not found.'),
    TeamChatFailure.unauthorized =>
      tk('Your session has expired. Please sign in again.'),
    TeamChatFailure.badRequest => tk('The message content is not valid.'),
    TeamChatFailure.conflict =>
      tk('This message was already sent with different content.'),
    TeamChatFailure.offline =>
      tk('Could not connect. Check your network and try again.'),
    TeamChatFailure.other => tk('Failed to send. Please try again.'),
  };

  /// English key, shown with `context.t`.
  String get loadMessage => switch (this) {
    TeamChatFailure.forbidden || TeamChatFailure.notFound =>
      tk('You no longer have access to this conversation.'),
    TeamChatFailure.unauthorized =>
      tk('Your session has expired. Please sign in again.'),
    TeamChatFailure.offline =>
      tk('Could not connect. Check your network and try again.'),
    _ => tk('Could not load messages. Please try again.'),
  };
}

TeamChatFailure classifyTeamChatError(Object error) {
  int? status;
  if (error is ApiException) status = error.statusCode;
  if (error is DioException) {
    final inner = error.error;
    status =
        error.response?.statusCode ??
        (inner is ApiException ? inner.statusCode : null);
    if (status == null &&
        (error.type == DioExceptionType.connectionError ||
            error.type == DioExceptionType.connectionTimeout ||
            error.type == DioExceptionType.sendTimeout ||
            error.type == DioExceptionType.receiveTimeout)) {
      return TeamChatFailure.offline;
    }
  }
  return switch (status) {
    429 => TeamChatFailure.rateLimited,
    403 => TeamChatFailure.forbidden,
    404 => TeamChatFailure.notFound,
    401 => TeamChatFailure.unauthorized,
    400 || 422 => TeamChatFailure.badRequest,
    409 => TeamChatFailure.conflict,
    _ => TeamChatFailure.other,
  };
}
