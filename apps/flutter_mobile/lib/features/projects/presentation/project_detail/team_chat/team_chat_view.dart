import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_bubbles.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_composer.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_items.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_sheets.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_status.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The "Chat" tab of a project: live team conversation.
///
/// Opens the live connection while it is shown (this tab selected and the app
/// in the foreground) and closes it otherwise; see [TeamChatController].
class TeamChatView extends ConsumerStatefulWidget {
  const TeamChatView({
    required this.projectId,
    required this.ownerId,
    super.key,
    this.tabIndex,
  });

  final String projectId;

  /// Project owner: may delete any message.
  final String? ownerId;

  /// Index of this view in the surrounding [DefaultTabController]; the chat is
  /// only live while that tab is selected. Null: always live.
  final int? tabIndex;

  @override
  ConsumerState<TeamChatView> createState() => _TeamChatViewState();
}

class _TeamChatViewState extends ConsumerState<TeamChatView>
    with WidgetsBindingObserver, AutomaticKeepAliveClientMixin {
  final _composer = TextEditingController();
  final _scroll = ScrollController();
  TabController? _tabs;
  bool _appActive = true;
  bool _tabActive = true;
  bool _atBottom = true;
  String? _notedId;

  /// Always fetched fresh: an auto-dispose provider may have been recreated
  /// since this view was built.
  TeamChatController get _chat =>
      ref.read(teamChatControllerProvider(widget.projectId).notifier);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _scroll.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _sync());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final tabs = DefaultTabController.maybeOf(context);
    if (!identical(tabs, _tabs)) {
      _tabs?.removeListener(_onTabChange);
      tabs?.addListener(_onTabChange);
      _tabs = tabs;
      // Not synchronously: providers must not change during the build phase.
      _updateTabActive();
      WidgetsBinding.instance.addPostFrameCallback((_) => _sync());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tabs?.removeListener(_onTabChange);
    _scroll.dispose();
    _composer.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appActive =
        state != AppLifecycleState.paused &&
        state != AppLifecycleState.hidden &&
        state != AppLifecycleState.detached;
    _sync();
  }

  void _updateTabActive() {
    final tabs = _tabs;
    final index = widget.tabIndex;
    _tabActive = tabs == null || index == null || tabs.index == index;
  }

  void _onTabChange() {
    _updateTabActive();
    _sync();
  }

  void _sync() {
    if (!mounted) return;
    if (_appActive && _tabActive) {
      _chat.start();
    } else {
      _chat.stop();
    }
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final position = _scroll.position;
    _atBottom = position.pixels <= 80;
    // The list is reversed: the "top" (oldest) end is maxScrollExtent.
    if (position.pixels >= position.maxScrollExtent - 300) {
      unawaited(_chat.loadOlder());
    }
    if (_atBottom) _markReadIfVisible();
  }

  /// Marks the newest message from others once it is on screen (the list is
  /// at its bottom) and the chat is live.
  void _markReadIfVisible() {
    if (!_atBottom || !_tabActive || !_appActive) return;
    final state = ref.read(teamChatControllerProvider(widget.projectId));
    final latest = latestFromOthers(
      state.messages,
      ref.read(currentUserProvider)?.id,
    );
    if (latest == null || latest.id == _notedId) return;
    _notedId = latest.id;
    _chat.noteLatestFromOthers(latest);
  }

  void _send() {
    if (_chat.send(_composer.text) != TeamChatSendResult.accepted) return;
    _composer.clear();
    if (_scroll.hasClients && _scroll.position.pixels > 0) {
      unawaited(
        _scroll.animateTo(
          0,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        ),
      );
    }
  }

  Future<void> _deleteMessage(TeamChatMessage message) async {
    if (!await showTeamChatMessageMenu(context) || !mounted) return;
    final reason = await askTeamChatDeleteReason(context);
    if (reason == null || !mounted) return;
    final failure = await _chat.delete(
      message.id,
      reason: reason.isEmpty ? null : reason,
    );
    if (failure == null || !mounted) return;
    final text = switch (failure) {
      TeamChatFailure.forbidden => context.t('You do not have permission to delete this message.'),
      TeamChatFailure.notFound => context.t('This message no longer exists.'),
      TeamChatFailure.offline =>
        context.t('Could not connect. Check your network and try again.'),
      TeamChatFailure.rateLimited ||
      TeamChatFailure.unauthorized ||
      TeamChatFailure.badRequest ||
      TeamChatFailure.conflict ||
      TeamChatFailure.other => context.t('Could not delete the message. Please try again.'),
    };
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  // Keep the draft and the scroll position when the user visits another tab;
  // the live connection itself is closed while this tab is not shown.
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final state = ref.watch(teamChatControllerProvider(widget.projectId));
    final user = ref.watch(currentUserProvider);
    final myId = user?.id;
    final isAdmin = user?.role == UserRole.admin;
    final isOwner = widget.ownerId != null && widget.ownerId == myId;

    // New messages can arrive while the list is already at the bottom.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _markReadIfVisible();
    });

    final Widget body;
    if (state.load == TeamChatLoad.loading && state.messages.isEmpty) {
      body = const TeamChatSkeleton();
    } else if (state.load == TeamChatLoad.error && state.messages.isEmpty) {
      body = TeamChatLoadError(
        message: context.t((state.loadFailure ?? TeamChatFailure.other).loadMessage),
        onRetry: state.stop == null
            ? () => unawaited(_chat.loadInitial())
            : null,
      );
    } else if (state.messages.isEmpty && state.pending.isEmpty) {
      body = const TeamChatEmpty();
    } else {
      final items = buildTeamChatItems(
        messages: state.messages,
        pending: state.pending,
        myId: myId,
        now: DateTime.now(),
        locale: context.appLocale,
      );
      body = ListView.builder(
        reverse: true,
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        itemCount: items.length + 1,
        itemBuilder: (context, index) {
          if (index == items.length) {
            return TeamChatOlderRow(
              loading: state.loadingOlder,
              failed: state.olderFailed,
              onRetry: () => unawaited(_chat.loadOlder()),
            );
          }
          final item = items[items.length - 1 - index];
          return switch (item) {
            TeamChatDayItem() => TeamChatDayChip(label: item.label),
            TeamChatMessageItem() => TeamChatBubble(
              item: item,
              onSeenTap: () => unawaited(
                showTeamChatReaders(context, item.message.readers),
              ),
              onLongPress:
                  !item.message.isDeleted &&
                      state.stop == null &&
                      (item.mine || isOwner || isAdmin)
                  ? () => unawaited(_deleteMessage(item.message))
                  : null,
            ),
            TeamChatPendingItem() => TeamChatPendingBubble(
              item: item,
              onRetry: () => _chat.retry(item.pending.clientKey),
              onDiscard: () => _chat.discard(item.pending.clientKey),
            ),
          };
        },
      );
    }

    return ColoredBox(
      color: context.lumi.background,
      child: Column(
        children: [
          TeamChatConnectionBanner(
            connection: state.connection,
            stop: state.stop,
          ),
          Expanded(child: body),
          TeamChatComposer(
            controller: _composer,
            enabled: state.canSend,
            onSend: _send,
          ),
        ],
      ),
    );
  }
}
