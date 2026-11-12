import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart' show immutable;
import 'package:flutter_mobile/core/utils/uuid.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

const teamChatPageSize = 50;
const teamChatMaxLength = 2000;

/// The character counter appears above this length.
const teamChatCounterFrom = 1800;
const teamChatReadDebounce = Duration(seconds: 1);
const teamChatMaxBackoff = Duration(seconds: 30);

/// 1s, 2s, 4s, 8s, 16s, then 30s, each with +/-20% jitter, never above 30s.
Duration teamChatBackoff(int attempt, Random random) {
  final base = min(
    teamChatMaxBackoff.inMilliseconds,
    1000 * (1 << min(attempt, 10)),
  );
  final jitter = 0.8 + random.nextDouble() * 0.4;
  return Duration(
    milliseconds: min(
      teamChatMaxBackoff.inMilliseconds,
      (base * jitter).round(),
    ),
  );
}

/// Clock, timers, randomness and key generation, replaceable in tests.
class TeamChatEnv {
  const TeamChatEnv({
    required this.timer,
    required this.newClientKey,
    required this.random,
    required this.now,
  });

  final Timer Function(Duration delay, void Function() callback) timer;
  final String Function() newClientKey;
  final Random random;
  final DateTime Function() now;
}

final teamChatEnvProvider = Provider<TeamChatEnv>((ref) {
  final random = Random();
  return TeamChatEnv(
    timer: Timer.new,
    newClientKey: generateUuidV4,
    random: random,
    now: DateTime.now,
  );
});

enum TeamChatLoad { loading, ready, error }

enum TeamChatConnection { idle, connecting, connected, reconnecting, stopped }

/// Why the live connection was given up for good.
enum TeamChatStop { noAccess, unauthorized }

enum PendingState { sending, failed }

/// A message the user sent that the server has not confirmed yet. Keeps the
/// text and its `clientKey`, so "Gửi lại" can never create a duplicate.
@immutable
class PendingTeamMessage {
  const PendingTeamMessage({
    required this.clientKey,
    required this.content,
    required this.createdAt,
    this.state = PendingState.sending,
    this.failure,
  });

  final String clientKey;
  final String content;
  final DateTime createdAt;
  final PendingState state;
  final TeamChatFailure? failure;

  PendingTeamMessage sending() => PendingTeamMessage(
    clientKey: clientKey,
    content: content,
    createdAt: createdAt,
  );

  PendingTeamMessage failed(TeamChatFailure failure) => PendingTeamMessage(
    clientKey: clientKey,
    content: content,
    createdAt: createdAt,
    state: PendingState.failed,
    failure: failure,
  );
}

enum TeamChatSendResult { accepted, empty, tooLong }

@immutable
class TeamChatState {
  const TeamChatState({
    this.messages = const [],
    this.pending = const [],
    this.load = TeamChatLoad.loading,
    this.loadFailure,
    this.hasMore = true,
    this.loadingOlder = false,
    this.olderFailed = false,
    this.connection = TeamChatConnection.idle,
    this.stop,
  });

  /// Oldest first (`createdAt`, then `id`).
  final List<TeamChatMessage> messages;
  final List<PendingTeamMessage> pending;
  final TeamChatLoad load;
  final TeamChatFailure? loadFailure;
  final bool hasMore;
  final bool loadingOlder;
  final bool olderFailed;
  final TeamChatConnection connection;
  final TeamChatStop? stop;

  bool get canSend => stop == null;

  TeamChatState copyWith({
    List<TeamChatMessage>? messages,
    List<PendingTeamMessage>? pending,
    TeamChatLoad? load,
    TeamChatFailure? loadFailure,
    bool clearLoadFailure = false,
    bool? hasMore,
    bool? loadingOlder,
    bool? olderFailed,
    TeamChatConnection? connection,
    TeamChatStop? stop,
  }) => TeamChatState(
    messages: messages ?? this.messages,
    pending: pending ?? this.pending,
    load: load ?? this.load,
    loadFailure: clearLoadFailure ? null : loadFailure ?? this.loadFailure,
    hasMore: hasMore ?? this.hasMore,
    loadingOlder: loadingOlder ?? this.loadingOlder,
    olderFailed: olderFailed ?? this.olderFailed,
    connection: connection ?? this.connection,
    stop: stop ?? this.stop,
  );
}
