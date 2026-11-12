import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/features/projects/data/sse_parser.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The project team chat API (`/projects/:id/team-chat`). An interface so the
/// controller can be tested without a network.
abstract class TeamChatApi {
  /// Newest page first when no cursor is given; the server answers oldest to
  /// newest within the page. Listing also marks the returned messages as read
  /// for the caller.
  Future<List<TeamChatMessage>> list(
    String projectId, {
    int limit = 50,
    String? beforeId,
  });

  /// Sending again with the same [clientKey] and the same content returns the
  /// message stored by the first attempt (no duplicate).
  Future<TeamChatMessage> send(
    String projectId,
    String content,
    String clientKey,
  );

  Future<TeamChatMessage> markRead(String projectId, String messageId);

  Future<TeamChatMessage> delete(
    String projectId,
    String messageId, {
    String? reason,
  });

  /// Server-sent events. The stream ends when the server closes it and
  /// errors on connection failures and non-2xx answers; cancelling the
  /// subscription closes the connection.
  Stream<TeamChatEvent> events(String projectId);
}

final teamChatApiProvider = Provider<TeamChatApi>((ref) {
  return DioTeamChatApi(ref.watch(apiClientProvider).dio);
});

class DioTeamChatApi implements TeamChatApi {
  const DioTeamChatApi(this._dio);

  final Dio _dio;

  /// The server sends a heartbeat every 25 seconds, so a connection that is
  /// silent for this long is dead and is reported as a timeout.
  static const _streamIdleTimeout = Duration(seconds: 75);

  Json _data(Response<Map<String, dynamic>> res) {
    final data = res.data?['data'];
    if (data is! Json) {
      throw const FormatException('Unexpected team chat response');
    }
    return data;
  }

  TeamChatMessage _message(Response<Map<String, dynamic>> res) {
    final message = TeamChatMessage.fromJson(_data(res)['message']);
    if (message == null) {
      throw const FormatException('Team chat response has no message');
    }
    return message;
  }

  @override
  Future<List<TeamChatMessage>> list(
    String projectId, {
    int limit = 50,
    String? beforeId,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.projectsTeamChat(projectId),
      queryParameters: {'limit': limit, 'beforeId': ?beforeId},
    );
    return TeamChatMessage.listFromJson(_data(res)['messages']);
  }

  @override
  Future<TeamChatMessage> send(
    String projectId,
    String content,
    String clientKey,
  ) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.projectsTeamChat(projectId),
      data: {'content': content, 'clientKey': clientKey},
    );
    return _message(res);
  }

  @override
  Future<TeamChatMessage> markRead(String projectId, String messageId) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.projectsTeamChatRead(projectId, messageId),
    );
    return _message(res);
  }

  @override
  Future<TeamChatMessage> delete(
    String projectId,
    String messageId, {
    String? reason,
  }) async {
    final trimmed = reason?.trim();
    final res = await _dio.delete<Map<String, dynamic>>(
      ApiRoutes.projectsTeamChatMessage(projectId, messageId),
      data: {if (trimmed != null && trimmed.isNotEmpty) 'reason': trimmed},
    );
    return _message(res);
  }

  @override
  Stream<TeamChatEvent> events(String projectId) async* {
    final cancel = CancelToken();
    try {
      final res = await _dio.get<ResponseBody>(
        '${ApiRoutes.projectsTeamChat(projectId)}/events',
        cancelToken: cancel,
        options: Options(
          responseType: ResponseType.stream,
          receiveTimeout: _streamIdleTimeout,
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        ),
      );
      final body = res.data;
      if (body == null) {
        throw const FormatException('Team chat stream has no body');
      }
      await for (final sse in parseSse(body.stream)) {
        final event = TeamChatEvent.fromSse(sse);
        if (event != null) yield event;
      }
    } finally {
      // Runs when the consumer cancels or the stream ends: close the socket.
      if (!cancel.isCancelled) cancel.cancel('closed');
    }
  }
}
