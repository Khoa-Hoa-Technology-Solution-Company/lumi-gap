import 'dart:async';

import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_api.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_state.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';

export 'package:flutter_mobile/features/projects/providers/team_chat_state.dart';

final NotifierProviderFamily<TeamChatController, TeamChatState, String>
teamChatControllerProvider = NotifierProvider.autoDispose
    .family<TeamChatController, TeamChatState, String>(TeamChatController.new);

/// State and live updates of one project's team chat.
///
/// The view calls [start] when it is shown and [stop] when it is hidden or
/// the app goes to the background. Everything async checks `ref.mounted`
/// before it touches state, so a late answer after dispose is dropped.
class TeamChatController extends Notifier<TeamChatState> {
  TeamChatController(this.projectId);

  final String projectId;

  final Map<String, TeamChatMessage> _byId = {};
  StreamSubscription<TeamChatEvent>? _subscription;
  Timer? _reconnectTimer;
  Timer? _fallbackLoadTimer;
  Timer? _readTimer;
  int _generation = 0;
  int _attempt = 0;
  bool _started = false;
  bool _loadingInitial = false;
  bool _refreshing = false;

  /// Bumped when the known history is replaced, so a [loadOlder] answer for
  /// the replaced window is dropped.
  int _historyEpoch = 0;
  String? _readTarget;
  final Set<String> _readRequested = {};
  final Set<String> _deleting = {};

  TeamChatApi get _api => ref.read(teamChatApiProvider);
  TeamChatEnv get _env => ref.read(teamChatEnvProvider);
  String? get _myId => ref.read(currentUserProvider)?.id;

  @override
  TeamChatState build() {
    ref.onDispose(_shutdown);
    return const TeamChatState();
  }

  void _shutdown() {
    _started = false;
    _generation++;
    unawaited(_subscription?.cancel());
    _subscription = null;
    _reconnectTimer?.cancel();
    _fallbackLoadTimer?.cancel();
    _readTimer?.cancel();
  }

  void _set(TeamChatState Function(TeamChatState s) change) {
    if (!ref.mounted) return;
    state = change(state);
  }

  // ---------------------------------------------------------------- lifecycle

  /// Opens the live connection (and loads the first page once the server says
  /// `ready`). Safe to call again; does nothing when already started or when
  /// access was lost.
  void start() {
    if (!ref.mounted) return;
    if (_started || state.stop != null) return;
    _started = true;
    _attempt = 0;
    _connect();
    // If the stream cannot even say `ready`, still show the history.
    _fallbackLoadTimer?.cancel();
    _fallbackLoadTimer = _env.timer(const Duration(seconds: 4), () {
      if (_started && state.load != TeamChatLoad.ready) {
        unawaited(loadInitial());
      }
    });
  }

  /// Closes the live connection; messages stay on screen.
  void stop() {
    if (!ref.mounted) return;
    if (!_started) return;
    _started = false;
    _generation++;
    unawaited(_subscription?.cancel());
    _subscription = null;
    _reconnectTimer?.cancel();
    _fallbackLoadTimer?.cancel();
    _readTimer?.cancel();
    _set(
      (s) =>
          s.stop != null ? s : s.copyWith(connection: TeamChatConnection.idle),
    );
  }

  void _connect() {
    if (!_started) return;
    final generation = ++_generation;
    _set(
      (s) => s.copyWith(
        connection: _attempt > 0
            ? TeamChatConnection.reconnecting
            : TeamChatConnection.connecting,
      ),
    );
    unawaited(_subscription?.cancel());
    _subscription = _api
        .events(projectId)
        .listen(
          (event) {
            if (generation == _generation) _onEvent(event);
          },
          onError: (Object error) {
            if (generation == _generation) _onStreamFailure(error);
          },
          onDone: () {
            if (generation == _generation) _onStreamFailure(null);
          },
          cancelOnError: true,
        );
  }

  void _onStreamFailure(Object? error) {
    unawaited(_subscription?.cancel());
    _subscription = null;
    if (!_started) return;
    final failure = error == null ? null : classifyTeamChatError(error);
    if (failure == TeamChatFailure.forbidden ||
        failure == TeamChatFailure.notFound) {
      _giveUp(TeamChatStop.noAccess);
      return;
    }
    if (failure == TeamChatFailure.unauthorized) {
      // The API client already tried to refresh the token once.
      _giveUp(TeamChatStop.unauthorized);
      return;
    }
    // History should not wait for a broken stream.
    if (state.load != TeamChatLoad.ready) unawaited(loadInitial());
    final delay = teamChatBackoff(_attempt, _env.random);
    _attempt++;
    _set((s) => s.copyWith(connection: TeamChatConnection.reconnecting));
    _reconnectTimer?.cancel();
    _reconnectTimer = _env.timer(delay, _connect);
  }

  void _giveUp(TeamChatStop reason) {
    _started = false;
    _generation++;
    // A 403/404 from `list` can arrive while the stream is still open.
    unawaited(_subscription?.cancel());
    _subscription = null;
    _reconnectTimer?.cancel();
    _fallbackLoadTimer?.cancel();
    _readTimer?.cancel();
    _set(
      (s) => s.copyWith(connection: TeamChatConnection.stopped, stop: reason),
    );
  }

  // ------------------------------------------------------------------- events

  void _onEvent(TeamChatEvent event) {
    switch (event.type) {
      case TeamChatEventType.ready:
        _attempt = 0;
        _set((s) => s.copyWith(connection: TeamChatConnection.connected));
        if (state.load == TeamChatLoad.ready) {
          // Reconnected: fill in what was missed while disconnected.
          unawaited(refreshLatest());
        } else {
          unawaited(loadInitial());
        }
      case TeamChatEventType.created:
        final message = event.message;
        if (message == null) return;
        _reconcilePendingWith(message);
        _merge([message]);
      case TeamChatEventType.updated || TeamChatEventType.deleted:
        final message = event.message;
        if (message != null) _merge([message]);
      case TeamChatEventType.unknown:
        break;
    }
  }

  /// The server echoes my own message over SSE, often before the POST
  /// answers. Drop the matching "sending" bubble so it does not show twice.
  ///
  /// Matching is by trimmed content because the message DTO does not return
  /// `clientKey`, and this work may not change the backend. Two identical
  /// texts in flight at once are still both shown: each echo removes one
  /// bubble and each POST answer merges its own id.
  void _reconcilePendingWith(TeamChatMessage message) {
    final me = _myId;
    if (me == null || message.sender.id != me) return;
    final index = state.pending.indexWhere(
      (p) =>
          p.state == PendingState.sending &&
          p.content.trim() == message.content.trim(),
    );
    if (index < 0) return;
    _set(
      (s) => s.copyWith(
        pending: [
          for (var i = 0; i < s.pending.length; i++)
            if (i != index) s.pending[i],
        ],
      ),
    );
  }

  // ------------------------------------------------------------------ history

  /// Newer versions win, except that a deleted message stays deleted (an old
  /// page fetched before the delete must not bring the text back).
  void _merge(Iterable<TeamChatMessage> incoming) {
    for (final message in incoming) {
      final existing = _byId[message.id];
      _byId[message.id] =
          existing != null && existing.isDeleted && !message.isDeleted
          ? existing
          : message;
    }
    final sorted = _byId.values.toList()..sort(_compare);
    _set((s) => s.copyWith(messages: sorted));
  }

  /// Display order: oldest first, ties broken by id.
  static int _compare(TeamChatMessage a, TeamChatMessage b) {
    final byTime = a.createdAt.compareTo(b.createdAt);
    return byTime != 0 ? byTime : a.id.compareTo(b.id);
  }

  Future<void> loadInitial() async {
    if (_loadingInitial) return;
    _loadingInitial = true;
    _fallbackLoadTimer?.cancel();
    _set(
      (s) => s.copyWith(load: TeamChatLoad.loading, clearLoadFailure: true),
    );
    try {
      final page = await _api.list(projectId);
      if (!ref.mounted) return;
      _merge(page);
      _set(
        (s) => s.copyWith(
          load: TeamChatLoad.ready,
          hasMore: page.length >= teamChatPageSize,
        ),
      );
    } on Object catch (error) {
      if (!ref.mounted) return;
      final failure = classifyTeamChatError(error);
      _set((s) => s.copyWith(load: TeamChatLoad.error, loadFailure: failure));
      if (failure == TeamChatFailure.forbidden ||
          failure == TeamChatFailure.notFound) {
        _giveUp(TeamChatStop.noAccess);
      }
    } finally {
      _loadingInitial = false;
    }
  }

  /// Older messages when the user scrolls to the top. One request at a time;
  /// stops for good once a page comes back shorter than the page size.
  Future<void> loadOlder() async {
    if (state.load != TeamChatLoad.ready ||
        !state.hasMore ||
        state.loadingOlder ||
        state.messages.isEmpty) {
      return;
    }
    final oldest = state.messages.first.id;
    final epoch = _historyEpoch;
    _set((s) => s.copyWith(loadingOlder: true, olderFailed: false));
    try {
      final page = await _api.list(
        projectId,
        beforeId: oldest,
      );
      if (!ref.mounted || epoch != _historyEpoch) return;
      _merge(page);
      _set(
        (s) => s.copyWith(
          loadingOlder: false,
          hasMore: page.length >= teamChatPageSize,
        ),
      );
    } on Object catch (_) {
      if (epoch != _historyEpoch) return;
      _set((s) => s.copyWith(loadingOlder: false, olderFailed: true));
    }
  }

  /// Newest page again, after a reconnect.
  ///
  /// If more than a page was posted while offline, the newest page shares no
  /// id with what was known before the request, and merging it would leave a
  /// hole in the middle that [loadOlder] (which walks back from the oldest
  /// message) could never fill. In that case the older known messages are
  /// dropped so the list is contiguous again, and scrolling up pages back
  /// from the new page. Messages that came in over SSE meanwhile are newer
  /// than the page's oldest one and are kept; pending bubbles are untouched.
  Future<void> refreshLatest() async {
    if (_refreshing) return;
    _refreshing = true;
    final knownBefore = _byId.keys.toSet();
    try {
      final page = await _api.list(projectId);
      if (!ref.mounted) return;
      // A full page with no known id (also when nothing was known yet).
      final gap =
          page.length >= teamChatPageSize &&
          !page.any((m) => knownBefore.contains(m.id));
      if (gap) {
        final oldest = page.reduce((a, b) => _compare(a, b) <= 0 ? a : b);
        _byId.removeWhere((_, m) => _compare(m, oldest) < 0);
        // An older page requested from the old window would reopen the hole.
        _historyEpoch++;
        _merge(page);
        _set((s) => s.copyWith(hasMore: true, loadingOlder: false));
      } else {
        _merge(page);
      }
    } on Object catch (error) {
      final failure = classifyTeamChatError(error);
      if (failure == TeamChatFailure.forbidden ||
          failure == TeamChatFailure.notFound) {
        _giveUp(TeamChatStop.noAccess);
      }
    } finally {
      _refreshing = false;
    }
  }

  // ------------------------------------------------------------------ sending

  /// Checks the text and starts delivering it. Every call gets its own
  /// `clientKey`, so quick successive sends are never merged.
  TeamChatSendResult send(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return TeamChatSendResult.empty;
    if (trimmed.length > teamChatMaxLength) return TeamChatSendResult.tooLong;
    if (!state.canSend) return TeamChatSendResult.empty;
    final key = _env.newClientKey();
    _set(
      (s) => s.copyWith(
        pending: [
          ...s.pending,
          PendingTeamMessage(
            clientKey: key,
            content: trimmed,
            createdAt: _env.now(),
          ),
        ],
      ),
    );
    unawaited(_deliver(key));
    return TeamChatSendResult.accepted;
  }

  PendingTeamMessage? _pendingFor(String key) {
    for (final p in state.pending) {
      if (p.clientKey == key) return p;
    }
    return null;
  }

  void _replacePending(String key, PendingTeamMessage? next) {
    _set(
      (s) => s.copyWith(
        pending: [
          for (final p in s.pending)
            if (p.clientKey != key) p else ?next,
        ],
      ),
    );
  }

  Future<void> _deliver(String key) async {
    final pending = _pendingFor(key);
    if (pending == null) return;
    try {
      final message = await _api.send(projectId, pending.content, key);
      if (!ref.mounted) return;
      // The SSE echo may have arrived first; merging by id makes this a no-op.
      _merge([message]);
      _replacePending(key, null);
    } on Object catch (error) {
      if (!ref.mounted) return;
      // If the echo already removed the bubble there is nothing to fail.
      if (_pendingFor(key) == null) return;
      _replacePending(key, pending.failed(classifyTeamChatError(error)));
    }
  }

  /// "Gửi lại": same text, **same `clientKey`**.
  void retry(String clientKey) {
    final pending = _pendingFor(clientKey);
    if (pending == null || pending.state != PendingState.failed) return;
    _replacePending(clientKey, pending.sending());
    unawaited(_deliver(clientKey));
  }

  /// Drops a failed message the user does not want to resend.
  void discard(String clientKey) {
    final pending = _pendingFor(clientKey);
    if (pending?.state == PendingState.failed) {
      _replacePending(clientKey, null);
    }
  }

  // ------------------------------------------------------------------- delete

  /// Null on success, otherwise why it failed. A second call for the same
  /// message while one is running is ignored.
  Future<TeamChatFailure?> delete(String messageId, {String? reason}) async {
    if (!_deleting.add(messageId)) return null;
    try {
      final message = await _api.delete(projectId, messageId, reason: reason);
      if (ref.mounted) _merge([message]);
      return null;
    } on Object catch (error) {
      return classifyTeamChatError(error);
    } finally {
      _deleting.remove(messageId);
    }
  }

  // --------------------------------------------------------------------- read

  /// Called with the newest message from someone else that is on screen.
  /// Marks it read once (never twice for the same message), 1s after the last
  /// call, and not for my own, deleted or already-read messages.
  void noteLatestFromOthers(TeamChatMessage message) {
    final me = _myId;
    if (me == null ||
        message.sender.id == me ||
        message.isDeleted ||
        message.isReadBy(me) ||
        _readRequested.contains(message.id)) {
      return;
    }
    _readTarget = message.id;
    _readTimer?.cancel();
    _readTimer = _env.timer(teamChatReadDebounce, _flushRead);
  }

  void _flushRead() {
    final id = _readTarget;
    _readTarget = null;
    if (id == null || !_started || !_readRequested.add(id)) return;
    unawaited(
      _api
          .markRead(projectId, id)
          .then<void>(
            (message) {
              if (ref.mounted) _merge([message]);
            },
            onError: (Object _) {
              // At most one try per message; the next new message tries again.
            },
          ),
    );
  }
}
