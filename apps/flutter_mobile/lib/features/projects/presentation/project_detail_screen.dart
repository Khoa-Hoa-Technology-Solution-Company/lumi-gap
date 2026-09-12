import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

enum _ChatMode { team, privateAi, teamAi }

class ProjectDetailScreen extends ConsumerStatefulWidget {
  const ProjectDetailScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<ProjectDetailScreen> createState() =>
      _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends ConsumerState<ProjectDetailScreen> {
  final _message = TextEditingController();
  final _scrollController = ScrollController();
  _ChatMode _mode = _ChatMode.team;
  Timer? _poller;
  bool _sending = false;
  String? _sendError;

  @override
  void initState() {
    super.initState();
    _poller = Timer.periodic(const Duration(seconds: 5), (_) => _refresh());
  }

  @override
  void dispose() {
    _poller?.cancel();
    _message.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _refresh() {
    if (!mounted) return;
    if (_mode == _ChatMode.team) {
      ref.invalidate(projectTeamChatProvider(widget.id));
    } else {
      ref.invalidate(
        projectChatProvider((
          projectId: widget.id,
          scope: _mode == _ChatMode.privateAi ? 'private' : 'team',
        )),
      );
    }
  }

  void _selectMode(_ChatMode mode) {
    setState(() {
      _mode = mode;
      _sendError = null;
    });
    _refresh();
  }

  Future<void> _send(int paperCount) async {
    final text = _message.text.trim();
    if (text.isEmpty || _sending) return;
    if (_mode != _ChatMode.team && paperCount == 0) {
      setState(() => _sendError = 'Add papers before asking AI.');
      return;
    }
    setState(() {
      _sending = true;
      _sendError = null;
    });
    try {
      final api = ref.read(projectsApiProvider);
      if (_mode == _ChatMode.team) {
        await api.sendTeamChat(widget.id, text);
      } else {
        await api.sendChat(
          widget.id,
          text,
          scope: _mode == _ChatMode.privateAi ? 'private' : 'team',
        );
      }
      _message.clear();
      _refresh();
    } on Object catch (error) {
      if (mounted) setState(() => _sendError = error.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = ref.watch(projectProvider(widget.id));
    final colors = Theme.of(context).colorScheme;
    return DefaultTabController(
      length: 6,
      child: Scaffold(
        backgroundColor: colors.surface,
        appBar: AppBar(
          title: project.maybeWhen(
            data: (data) => Text(data.title),
            orElse: () => const Text('Project Workspace'),
          ),
          bottom: const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            indicatorColor: Color(0xFF06B6D4),
            labelColor: Color(0xFF06B6D4),
            unselectedLabelColor: Color(0xFF94A3B8),
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Papers'),
              Tab(text: 'Chat'),
              Tab(text: 'AI Assistant'),
              Tab(text: 'Outputs'),
              Tab(text: 'Members'),
            ],
          ),
        ),
        body: project.when(
          data: (data) => TabBarView(
            children: [
              _OverviewTab(project: data, projectId: widget.id, ref: ref),
              _PapersTab(project: data, projectId: widget.id, ref: ref),
              _ChatTab(
                projectId: widget.id,
                project: data,
                mode: _ChatMode.team,
                selectMode: _selectMode,
                scrollController: _scrollController,
                refresh: _refresh,
                messageController: _message,
                sending: _sending,
                sendError: _sendError,
                sendFn: _send,
                colors: colors,
              ),
              _AiAssistantTab(
                projectId: widget.id,
                project: data,
                mode: _mode == _ChatMode.team ? _ChatMode.privateAi : _mode,
                selectMode: _selectMode,
                scrollController: _scrollController,
                refresh: _refresh,
                messageController: _message,
                sending: _sending,
                sendError: _sendError,
                sendFn: _send,
                colors: colors,
              ),
              _OutputsTab(projectId: widget.id, ref: ref),
              _MembersSettingsTab(project: data, ref: ref),
            ],
          ),
          loading: () => const AppLoading(
            fullScreen: true,
            message: 'Loading project workspace...',
          ),
          error: (error, _) => AppErrorState(message: error.toString()),
        ),
      ),
    );
  }
}

class _ChannelSwitcher extends StatelessWidget {
  const _ChannelSwitcher({required this.mode, required this.onChanged});

  final _ChatMode mode;
  final ValueChanged<_ChatMode> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      height: 48,
      margin: const EdgeInsets.fromLTRB(16, 6, 16, 10),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surfaceContainerHighest.withValues(alpha: .38),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: colors.outlineVariant.withValues(alpha: .55),
        ),
      ),
      child: Row(
        children: [
          _ChannelTab(
            label: 'Team',
            icon: Icons.groups_rounded,
            selected: mode == _ChatMode.team,
            onTap: () => onChanged(_ChatMode.team),
          ),
          _ChannelTab(
            label: 'My AI',
            icon: Icons.auto_awesome_rounded,
            selected: mode == _ChatMode.privateAi,
            onTap: () => onChanged(_ChatMode.privateAi),
          ),
          _ChannelTab(
            label: 'Team AI',
            icon: Icons.smart_toy_rounded,
            selected: mode == _ChatMode.teamAi,
            onTap: () => onChanged(_ChatMode.teamAi),
          ),
        ],
      ),
    );
  }
}

class _ChannelTab extends StatelessWidget {
  const _ChannelTab({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Material(
          color: selected
              ? colors.primary.withValues(alpha: .1)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: onTap,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: selected
                    ? Border.all(color: colors.primary.withValues(alpha: .22))
                    : null,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    icon,
                    size: 17,
                    color: selected ? colors.primary : colors.onSurfaceVariant,
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      label,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: selected
                            ? FontWeight.w700
                            : FontWeight.w600,
                        color: selected
                            ? colors.primary
                            : colors.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ChatPanel extends ConsumerWidget {
  const _ChatPanel({
    required this.projectId,
    required this.mode,
    required this.ownerId,
    required this.paperCount,
    required this.controller,
    required this.onRefresh,
  });

  final String projectId;
  final _ChatMode mode;
  final String? ownerId;
  final int paperCount;
  final ScrollController controller;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = switch (mode) {
      _ChatMode.team => 'Team Chat',
      _ChatMode.privateAi => 'My AI - Private',
      _ChatMode.teamAi => 'Team AI Room - Shared',
    };
    final subtitle = switch (mode) {
      _ChatMode.team => 'Discuss with project members',
      _ChatMode.privateAi => 'Only you can see this AI conversation',
      _ChatMode.teamAi => 'AI answers are visible to every project member',
    };

    final body = mode == _ChatMode.team
        ? ref
              .watch(projectTeamChatProvider(projectId))
              .when(
                data: (messages) => _TeamMessages(
                  projectId: projectId,
                  messages: messages,
                  ownerId: ownerId,
                  controller: controller,
                  onRefresh: onRefresh,
                ),
                loading: () =>
                    const AppLoading(message: 'Loading team chat...'),
                error: (error, _) => AppErrorState(
                  message: error.toString(),
                  onRetry: onRefresh,
                ),
              )
        : ref
              .watch(
                projectChatProvider((
                  projectId: projectId,
                  scope: mode == _ChatMode.privateAi ? 'private' : 'team',
                )),
              )
              .when(
                data: (messages) => _AiMessages(
                  projectId: projectId,
                  messages: messages,
                  shared: mode == _ChatMode.teamAi,
                  paperCount: paperCount,
                  controller: controller,
                  onRefresh: onRefresh,
                ),
                loading: () =>
                    const AppLoading(message: 'Loading AI history...'),
                error: (error, _) => AppErrorState(
                  message: error.toString(),
                  onRetry: onRefresh,
                ),
              );

    final colors = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.fromLTRB(0, 0, 0, 4),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.surfaceContainerLowest,
        border: Border(
          top: BorderSide(color: colors.outlineVariant.withValues(alpha: .45)),
          bottom: BorderSide(
            color: colors.outlineVariant.withValues(alpha: .35),
          ),
        ),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(18, 10, 16, 10),
            decoration: BoxDecoration(
              color: colors.surface,
              border: Border(
                bottom: BorderSide(
                  color: colors.outlineVariant.withValues(alpha: .5),
                ),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: colors.primary.withValues(alpha: .1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    mode == _ChatMode.team
                        ? Icons.forum_rounded
                        : mode == _ChatMode.privateAi
                        ? Icons.auto_awesome_rounded
                        : Icons.smart_toy_rounded,
                    size: 18,
                    color: colors.primary,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                _StatusPill(private: mode == _ChatMode.privateAi),
              ],
            ),
          ),
          Expanded(
            child: ColoredBox(
              color: colors.surfaceContainerHighest.withValues(alpha: .18),
              child: body,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.private});

  final bool private;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final color = private ? colors.primary : const Color(0xFF16845B);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .09),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            private ? Icons.lock_outline_rounded : Icons.circle,
            size: private ? 13 : 8,
            color: color,
          ),
          const SizedBox(width: 5),
          Text(
            private ? 'Private' : 'Live',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _AiMessages extends ConsumerWidget {
  const _AiMessages({
    required this.projectId,
    required this.messages,
    required this.shared,
    required this.paperCount,
    required this.controller,
    required this.onRefresh,
  });

  final String projectId;
  final List<ProjectChatMessage> messages;
  final bool shared;
  final int paperCount;
  final ScrollController controller;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (messages.isEmpty) {
      return _EmptyChat(
        icon: Icons.auto_awesome,
        title: 'No AI messages yet',
        message: paperCount == 0
            ? 'Add papers before asking AI.'
            : 'Ask about methods, limitations, trends, or research gaps.',
      );
    }
    final sorted = [...messages]
      ..sort((a, b) {
        final timeA = DateTime.tryParse(a.createdAt) ?? DateTime(0);
        final timeB = DateTime.tryParse(b.createdAt) ?? DateTime(0);
        if (timeA.difference(timeB).abs() <= const Duration(seconds: 5) &&
            a.role != b.role) {
          return a.role == 'user' ? -1 : 1;
        }
        return timeA.compareTo(timeB);
      });
    return ListView.builder(
      controller: controller,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
      itemCount: sorted.length,
      itemBuilder: (context, index) {
        final item = sorted[index];
        final isUser = item.role == 'user';
        final isMe = item.userId == user?.id || item.requester?.id == user?.id;
        final name = isMe ? 'You' : (item.requester?.displayName ?? 'Member');
        return _MessageBubble(
          mine: isUser && isMe,
          icon: isUser ? null : Icons.auto_awesome,
          heading: isUser
              ? name
              : 'AI assistant${item.requester == null ? '' : ' - requested by ${item.requester!.displayName}'}',
          content: item.content,
          createdAt: item.createdAt,
          footer: isUser
              ? null
              : Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (item.creditCost != null)
                      _BubbleActionPill(
                        icon: Icons.bolt_outlined,
                        label: '${item.creditCost} credit',
                        subtle: true,
                      ),
                    if (item.isPinned)
                      const _BubbleActionPill(
                        icon: Icons.push_pin,
                        label: 'Pinned',
                        active: true,
                      ),
                    _BubbleActionPill(
                      icon: Icons.copy_rounded,
                      label: 'Copy',
                      onTap: () {
                        unawaited(
                          Clipboard.setData(ClipboardData(text: item.content)),
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('AI answer copied')),
                        );
                      },
                    ),
                    ...item.citedPaperIds
                        .take(3)
                        .map(
                          (id) => _BubbleActionPill(
                            label:
                                'Paper ${id.length > 6 ? id.substring(id.length - 6) : id}',
                            subtle: true,
                          ),
                        ),
                  ],
                ),
        );
      },
    );
  }
}

class _TeamMessages extends ConsumerWidget {
  const _TeamMessages({
    required this.projectId,
    required this.messages,
    required this.ownerId,
    required this.controller,
    required this.onRefresh,
  });

  final String projectId;
  final List<ProjectTeamChatMessage> messages;
  final String? ownerId;
  final ScrollController controller;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (messages.isEmpty) {
      return const _EmptyChat(
        icon: Icons.forum_outlined,
        title: 'No team messages yet',
        message: 'Start the discussion with your project members.',
      );
    }
    return ListView.builder(
      controller: controller,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
      itemCount: messages.length,
      itemBuilder: (context, index) {
        final item = messages[index];
        final mine = item.sender.id == user?.id;
        final canDelete =
            mine || ownerId == user?.id || user?.role.name == 'admin';
        if (!mine && !item.readBy.any((reader) => reader.id == user?.id)) {
          unawaited(
            Future.microtask(
              () => ref
                  .read(projectsApiProvider)
                  .markTeamChatRead(projectId, item.id),
            ),
          );
        }
        return _MessageBubble(
          mine: mine,
          heading: mine ? 'You' : item.sender.displayName,
          content: item.isDeleted ? 'This message was removed.' : item.content,
          createdAt: item.createdAt,
          italic: item.isDeleted,
          footer: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (mine) ...[
                const Icon(Icons.done_all, size: 14),
                const SizedBox(width: 4),
                Text(
                  item.readCount > 1 ? 'Seen by ${item.readCount - 1}' : 'Sent',
                ),
              ],
              if (canDelete && !item.isDeleted)
                IconButton(
                  visualDensity: VisualDensity.compact,
                  constraints: const BoxConstraints.tightFor(
                    width: 24,
                    height: 24,
                  ),
                  padding: EdgeInsets.zero,
                  tooltip: 'Delete message',
                  onPressed: () async {
                    await ref
                        .read(projectsApiProvider)
                        .deleteTeamChat(projectId, item.id);
                    onRefresh();
                  },
                  icon: const Icon(Icons.delete_outline, size: 16),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _BubbleActionPill extends StatelessWidget {
  const _BubbleActionPill({
    required this.label,
    this.icon,
    this.onTap,
    this.active = false,
    this.subtle = false,
  });

  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool active;
  final bool subtle;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final foreground = active ? const Color(0xFF1D4ED8) : colors.onSurface;
    final background = active
        ? const Color(0xFF1D4ED8).withValues(alpha: .1)
        : colors.surface.withValues(alpha: subtle ? .55 : .86);
    final borderColor = active
        ? const Color(0xFF1D4ED8).withValues(alpha: .16)
        : colors.outlineVariant.withValues(alpha: .18);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: EdgeInsets.symmetric(
            horizontal: icon == null ? 12 : 10,
            vertical: 7,
          ),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: borderColor),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: foreground),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: TextStyle(
                  color: foreground,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.mine,
    required this.heading,
    required this.content,
    required this.createdAt,
    this.icon,
    this.footer,
    this.italic = false,
  });

  final bool mine;
  final String heading;
  final String content;
  final String createdAt;
  final IconData? icon;
  final Widget? footer;
  final bool italic;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final timestamp = DateTime.tryParse(createdAt)?.toLocal();
    final bubbleColor = mine
        ? const Color(0xFF1D4ED8)
        : colors.surfaceContainerHighest.withValues(alpha: .78);
    final textColor = mine ? colors.onPrimary : colors.onSurface;
    final metaColor = mine
        ? colors.onPrimary.withValues(alpha: .72)
        : colors.onSurfaceVariant;
    final maxWidth = MediaQuery.sizeOf(context).width * .68;

    final bubble = Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      padding: const EdgeInsets.fromLTRB(13, 9, 13, 9),
      decoration: BoxDecoration(
        color: bubbleColor,
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(20),
          topRight: const Radius.circular(20),
          bottomLeft: Radius.circular(mine ? 20 : 5),
          bottomRight: Radius.circular(mine ? 5 : 20),
        ),
        boxShadow: [
          BoxShadow(
            color: colors.shadow.withValues(alpha: .035),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: colors.primary),
                const SizedBox(width: 5),
              ],
              Flexible(
                child: Text(
                  heading,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: metaColor,
                  ),
                ),
              ),
              if (timestamp != null) ...[
                const SizedBox(width: 5),
                Text(
                  DateFormat.Hm().format(timestamp),
                  style: TextStyle(fontSize: 10, color: metaColor),
                ),
              ],
            ],
          ),
          const SizedBox(height: 4),
          Text(
            content,
            style: TextStyle(
              color: textColor,
              fontSize: 14.5,
              height: 1.32,
              fontStyle: italic ? FontStyle.italic : null,
            ),
          ),
          if (footer != null) ...[
            const SizedBox(height: 8),
            IconTheme(
              data: IconThemeData(color: metaColor, size: 16),
              child: DefaultTextStyle(
                style: TextStyle(fontSize: 11, color: metaColor),
                child: footer!,
              ),
            ),
          ],
        ],
      ),
    );

    return Padding(
      padding: EdgeInsets.only(
        left: mine ? 58 : 0,
        right: mine ? 4 : 34,
        bottom: 10,
      ),
      child: Row(
        mainAxisAlignment: mine
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!mine) ...[
            _ChatAvatar(icon: icon ?? Icons.person_outline_rounded),
            const SizedBox(width: 7),
          ],
          Flexible(child: bubble),
        ],
      ),
    );
  }
}

class _ChatAvatar extends StatelessWidget {
  const _ChatAvatar({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        color: colors.primary.withValues(alpha: .12),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, size: 15, color: colors.primary),
    );
  }
}

class _EmptyChat extends StatelessWidget {
  const _EmptyChat({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: colors.primary.withValues(alpha: .1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 26, color: colors.primary),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.onSurfaceVariant,
                height: 1.35,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatTab extends StatelessWidget {
  const _ChatTab({
    required this.projectId,
    required this.project,
    required this.mode,
    required this.selectMode,
    required this.scrollController,
    required this.refresh,
    required this.messageController,
    required this.sending,
    required this.sendError,
    required this.sendFn,
    required this.colors,
  });

  final String projectId;
  final ProjectView project;
  final _ChatMode mode;
  final ValueChanged<_ChatMode> selectMode;
  final ScrollController scrollController;
  final VoidCallback refresh;
  final TextEditingController messageController;
  final bool sending;
  final String? sendError;
  final Future<void> Function(int) sendFn;
  final ColorScheme colors;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _ChannelSwitcher(mode: mode, onChanged: selectMode),
        Expanded(
          child: _ChatPanel(
            projectId: projectId,
            mode: mode,
            ownerId: project.ownerId,
            paperCount: project.papers.length,
            controller: scrollController,
            onRefresh: refresh,
          ),
        ),
        if (sendError != null)
          Container(
            width: double.infinity,
            color: colors.errorContainer,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(
              sendError!,
              style: TextStyle(color: colors.onErrorContainer),
            ),
          ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: colors.surfaceContainerHighest.withValues(
                        alpha: .5,
                      ),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: colors.outlineVariant.withValues(alpha: .18),
                      ),
                    ),
                    child: TextField(
                      controller: messageController,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 2000,
                      textInputAction: TextInputAction.newline,
                      decoration: InputDecoration(
                        hintText: mode == _ChatMode.team
                            ? 'Message your project team...'
                            : 'Ask about project papers...',
                        counterText: '',
                        border: InputBorder.none,
                        prefixIcon: Icon(
                          mode == _ChatMode.team
                              ? Icons.forum_outlined
                              : Icons.auto_awesome_rounded,
                          size: 20,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 13,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox.square(
                  dimension: 48,
                  child: IconButton.filled(
                    style: IconButton.styleFrom(
                      shape: const CircleBorder(),
                      backgroundColor: const Color(0xFF1D4ED8),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: sending
                        ? null
                        : () => sendFn(project.papers.length),
                    icon: sending
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PapersTab extends StatelessWidget {
  const _PapersTab({
    required this.project,
    required this.projectId,
    required this.ref,
  });

  final ProjectView project;
  final String projectId;
  final WidgetRef ref;

  Future<void> _remove(BuildContext context, String paperId) async {
    try {
      await ref.read(projectsApiProvider).removePaper(projectId, paperId);
      ref.invalidate(projectProvider(projectId));
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Paper removed from project.')),
      );
    } on Object catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to remove paper: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (project.papers.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.article_outlined,
                size: 48,
                color: Color(0xFF94A3B8),
              ),
              const SizedBox(height: 12),
              const Text(
                'No papers inside this project workspace yet.',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              const Text(
                'Search for publications outside and tap "Add" button to associate them here.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => context.push('/search'),
                icon: const Icon(Icons.search, size: 16),
                label: const Text('Search publications'),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: project.papers.length,
      itemBuilder: (context, idx) {
        final paper = project.papers[idx];
        return Card(
          elevation: 0,
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: Theme.of(context).dividerColor),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => context.push('/paper/${paper.id}'),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    paper.title,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Year: ${paper.publicationYear ?? 'N/A'} · Citations: ${paper.citationCount ?? 0}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF94A3B8),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(
                          Icons.delete_outline,
                          color: Colors.red,
                          size: 18,
                        ),
                        onPressed: () => _remove(context, paper.id),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

// Legacy tab retained while the combined Reports & Gaps mobile tab is active.
// ignore: unused_element
class _ReportsTab extends StatelessWidget {
  const _ReportsTab({required this.projectId, required this.ref});
  final String projectId;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(
      reportsProvider(ReportsParams(projectId: projectId)),
    );

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF06B6D4),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: () => unawaited(
                context.push('/reports?create=true&projectId=$projectId'),
              ),
              icon: const Icon(Icons.add, color: Colors.white),
              label: const Text(
                'Generate RAG Report',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ),
        Expanded(
          child: query.when(
            data: (data) {
              if (data.reports.isEmpty) {
                return const Center(
                  child: Text(
                    'No analytical reports generated yet.',
                    style: TextStyle(fontStyle: FontStyle.italic),
                  ),
                );
              }
              return ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: data.reports.length,
                itemBuilder: (context, idx) {
                  final report = data.reports[idx];
                  return Card(
                    elevation: 0,
                    margin: const EdgeInsets.only(bottom: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: Theme.of(context).dividerColor),
                    ),
                    child: ListTile(
                      title: Text(
                        report.topic ?? 'Dataset report',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                      subtitle: Text(
                        report.query,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11),
                      ),
                      trailing: Text(
                        report.status.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF06B6D4),
                        ),
                      ),
                      onTap: () =>
                          unawaited(context.push('/report/${report.id}')),
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, _) => Center(
              child: Text(
                'Error loading reports: $err',
                style: const TextStyle(color: Colors.red),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// Legacy tab retained while the combined Reports & Gaps mobile tab is active.
// ignore: unused_element
class _GapsTab extends StatelessWidget {
  const _GapsTab({required this.projectId, required this.ref});
  final String projectId;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(gapsProvider(GapsListParams(projectId: projectId)));

    return query.when(
      data: (data) {
        if (data.data.isEmpty) {
          return const Center(
            child: Text(
              'No research gaps found for this workspace.',
              style: TextStyle(fontStyle: FontStyle.italic),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: data.data.length,
          itemBuilder: (context, idx) {
            final gap = data.data[idx];
            return Card(
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: Theme.of(context).dividerColor),
              ),
              child: ListTile(
                title: Text(
                  gap.title,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                subtitle: Text(
                  gap.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
                trailing: Text(
                  '${(gap.confidence * 100).round()}% conf',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(
        child: Text(
          'Error loading gaps: $err',
          style: const TextStyle(color: Colors.red),
        ),
      ),
    );
  }
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({
    required this.project,
    required this.projectId,
    required this.ref,
  });

  final ProjectView project;
  final String projectId;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark ? const Color(0xFF1E293B) : Colors.white;

    final reportsAsync = ref.watch(
      reportsProvider(ReportsParams(projectId: projectId)),
    );
    final gapsAsync = ref.watch(
      gapsProvider(GapsListParams(projectId: projectId)),
    );

    final reportsCount = reportsAsync.maybeWhen(
      data: (d) => d.reports.length,
      orElse: () => 0,
    );
    final gapsCount = gapsAsync.maybeWhen(
      data: (d) => d.data.length,
      orElse: () => 0,
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          elevation: 0,
          margin: EdgeInsets.zero,
          color: theme.cardColor,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: theme.dividerColor),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  project.title,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (project.description != null &&
                    project.description!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    project.description!,
                    style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Workspace counters Grid
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.8,
          children: [
            _buildCounterCard(
              context,
              'Papers',
              project.papers.length.toString(),
              Icons.article_outlined,
              const Color(0xFF06B6D4),
            ),
            _buildCounterCard(
              context,
              'Team Members',
              project.members.length.toString(),
              Icons.people_outline,
              const Color(0xFF22C55E),
            ),
            _buildCounterCard(
              context,
              'Reports',
              reportsCount.toString(),
              Icons.description_outlined,
              const Color(0xFFA78BFA),
            ),
            _buildCounterCard(
              context,
              'Gaps Detected',
              gapsCount.toString(),
              Icons.bolt_outlined,
              const Color(0xFFF59E0B),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Add Papers CTA Card
        Card(
          elevation: 0,
          color: const Color(0xFF06B6D4).withValues(alpha: 0.08),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFF06B6D4), width: 1.5),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(
                  Icons.add_circle_outline,
                  color: Color(0xFF06B6D4),
                  size: 24,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Ground Your Research',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        'Add publications to power grounding reports, chat, and gap detection.',
                        style: TextStyle(
                          fontSize: 11,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF06B6D4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                  ),
                  onPressed: () => DefaultTabController.of(
                    context,
                  ).animateTo(1), // Go to Papers Tab
                  child: const Text(
                    'Add',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Activity log snapshot
        const Text(
          'Workspace Activity Log',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
        ),
        const SizedBox(height: 10),
        Card(
          elevation: 0,
          color: cardBg,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: theme.dividerColor),
          ),
          child: const Padding(
            padding: EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(
                  Icons.history_toggle_off,
                  color: Color(0xFF94A3B8),
                  size: 18,
                ),
                SizedBox(width: 12),
                Text(
                  'Workspace initialized and ready for research.',
                  style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCounterCard(
    BuildContext context,
    String label,
    String count,
    IconData icon,
    Color color,
  ) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: theme.cardColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: theme.dividerColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    count,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AiAssistantTab extends StatelessWidget {
  const _AiAssistantTab({
    required this.projectId,
    required this.project,
    required this.mode,
    required this.selectMode,
    required this.scrollController,
    required this.refresh,
    required this.messageController,
    required this.sending,
    required this.sendError,
    required this.sendFn,
    required this.colors,
  });

  final String projectId;
  final ProjectView project;
  final _ChatMode mode;
  final ValueChanged<_ChatMode> selectMode;
  final ScrollController scrollController;
  final VoidCallback refresh;
  final TextEditingController messageController;
  final bool sending;
  final String? sendError;
  final Future<void> Function(int) sendFn;
  final ColorScheme colors;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _AiChannelSwitcher(mode: mode, onChanged: selectMode),
        Expanded(
          child: _ChatPanel(
            projectId: projectId,
            mode: mode,
            ownerId: project.ownerId,
            paperCount: project.papers.length,
            controller: scrollController,
            onRefresh: refresh,
          ),
        ),
        if (sendError != null)
          Container(
            width: double.infinity,
            color: colors.errorContainer,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(
              sendError!,
              style: TextStyle(color: colors.onErrorContainer),
            ),
          ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: colors.surfaceContainerHighest.withValues(
                        alpha: .5,
                      ),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: colors.outlineVariant.withValues(alpha: .18),
                      ),
                    ),
                    child: TextField(
                      controller: messageController,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 2000,
                      textInputAction: TextInputAction.newline,
                      decoration: const InputDecoration(
                        hintText:
                            'Ask AI Assistant about project publications...',
                        counterText: '',
                        border: InputBorder.none,
                        prefixIcon: Icon(
                          Icons.auto_awesome_rounded,
                          size: 20,
                        ),
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 13,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox.square(
                  dimension: 48,
                  child: IconButton.filled(
                    style: IconButton.styleFrom(
                      shape: const CircleBorder(),
                      backgroundColor: const Color(0xFF1D4ED8),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: sending
                        ? null
                        : () => sendFn(project.papers.length),
                    icon: sending
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _AiChannelSwitcher extends StatelessWidget {
  const _AiChannelSwitcher({required this.mode, required this.onChanged});

  final _ChatMode mode;
  final ValueChanged<_ChatMode> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      height: 48,
      margin: const EdgeInsets.fromLTRB(16, 6, 16, 10),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surfaceContainerHighest.withValues(alpha: .38),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: colors.outlineVariant.withValues(alpha: .55),
        ),
      ),
      child: Row(
        children: [
          _ChannelTab(
            label: 'My AI (Private)',
            icon: Icons.auto_awesome_rounded,
            selected: mode == _ChatMode.privateAi,
            onTap: () => onChanged(_ChatMode.privateAi),
          ),
          _ChannelTab(
            label: 'Team AI (Shared)',
            icon: Icons.smart_toy_rounded,
            selected: mode == _ChatMode.teamAi,
            onTap: () => onChanged(_ChatMode.teamAi),
          ),
        ],
      ),
    );
  }
}

class _OutputsTab extends StatelessWidget {
  const _OutputsTab({required this.projectId, required this.ref});
  final String projectId;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final reportsQuery = ref.watch(
      reportsProvider(ReportsParams(projectId: projectId)),
    );
    final gapsQuery = ref.watch(
      gapsProvider(GapsListParams(projectId: projectId)),
    );
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Action card to generate a report
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF06B6D4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            onPressed: () => unawaited(
              context.push('/reports?create=true&projectId=$projectId'),
            ),
            icon: const Icon(Icons.add, color: Colors.white),
            label: const Text(
              'Generate RAG Report',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Reports Expansion Section
        ExpansionTile(
          initiallyExpanded: true,
          leading: const Icon(
            Icons.description_outlined,
            color: Color(0xFFA78BFA),
          ),
          title: const Text(
            'RAG Analytical Reports',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          children: [
            reportsQuery.when(
              data: (data) {
                if (data.reports.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'No analytical reports generated yet.',
                      style: TextStyle(
                        fontStyle: FontStyle.italic,
                        fontSize: 12,
                      ),
                    ),
                  );
                }
                return ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: data.reports.length,
                  itemBuilder: (context, idx) {
                    final report = data.reports[idx];
                    return Card(
                      elevation: 0,
                      margin: const EdgeInsets.only(bottom: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: theme.dividerColor),
                      ),
                      child: ListTile(
                        title: Text(
                          report.topic ?? 'Dataset report',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: Text(
                          'Status: ${report.status.toUpperCase()} · ${report.query}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11),
                        ),
                        trailing: const Icon(Icons.chevron_right, size: 16),
                        onTap: () =>
                            unawaited(context.push('/report/${report.id}')),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (err, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Error loading reports: $err',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Gaps Expansion Section
        ExpansionTile(
          initiallyExpanded: true,
          leading: const Icon(Icons.bolt_outlined, color: Color(0xFFF59E0B)),
          title: const Text(
            'Discovered Research Gaps',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          children: [
            gapsQuery.when(
              data: (data) {
                if (data.data.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'No research gaps found for this workspace.',
                      style: TextStyle(
                        fontStyle: FontStyle.italic,
                        fontSize: 12,
                      ),
                    ),
                  );
                }
                return ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: data.data.length,
                  itemBuilder: (context, idx) {
                    final gap = data.data[idx];
                    return Card(
                      elevation: 0,
                      margin: const EdgeInsets.only(bottom: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: theme.dividerColor),
                      ),
                      child: ListTile(
                        title: Text(
                          gap.title,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: Text(
                          '${(gap.confidence * 100).round()}% confidence · ${gap.description}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11),
                        ),
                        trailing: const Icon(Icons.chevron_right, size: 16),
                        onTap: () => unawaited(context.push('/gaps')),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (err, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Error loading gaps: $err',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _MembersSettingsTab extends StatefulWidget {
  const _MembersSettingsTab({required this.project, required this.ref});
  final ProjectView project;
  final WidgetRef ref;

  @override
  State<_MembersSettingsTab> createState() => _MembersSettingsTabState();
}

class _MembersSettingsTabState extends State<_MembersSettingsTab> {
  final _emailController = TextEditingController();
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  bool _adding = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _titleController.text = widget.project.title;
    _descController.text = widget.project.description ?? '';
  }

  @override
  void dispose() {
    _emailController.dispose();
    _titleController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _addMember() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) return;
    setState(() => _adding = true);
    try {
      await widget.ref
          .read(projectsApiProvider)
          .addMember(widget.project.id, targetId: email);
      widget.ref.invalidate(projectProvider(widget.project.id));
      _emailController.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Member added successfully.')),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to add member: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  Future<void> _removeMember(String memberId) async {
    try {
      await widget.ref
          .read(projectsApiProvider)
          .removeMember(widget.project.id, memberId);
      widget.ref.invalidate(projectProvider(widget.project.id));
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Member removed.')));
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to remove member: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _save() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) return;
    setState(() => _saving = true);
    try {
      await widget.ref
          .read(projectsApiProvider)
          .update(
            widget.project.id,
            title: title,
            description: _descController.text.trim(),
          );
      widget.ref.invalidate(projectProvider(widget.project.id));
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Workspace updated.')));
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Update failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Workspace?'),
        content: const Text(
          'All papers and chat history in this workspace will be deleted forever.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await widget.ref.read(projectsApiProvider).delete(widget.project.id);
        widget.ref.invalidate(projectsProvider);
        if (mounted) {
          context.pop();
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('Workspace deleted.')));
        }
      } on Object catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to delete: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Section: Members
        ExpansionTile(
          initiallyExpanded: true,
          leading: const Icon(Icons.people_outline, color: Color(0xFF22C55E)),
          title: const Text(
            'Workspace Members',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _emailController,
                          decoration: InputDecoration(
                            hintText: 'Enter User ID or Email',
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF06B6D4),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        onPressed: _adding ? null : _addMember,
                        child: _adding
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text(
                                'Add',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: widget.project.members.length,
                    itemBuilder: (context, idx) {
                      final m = widget.project.members[idx];
                      final isOwner = widget.project.ownerId == m.id;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const CircleAvatar(child: Icon(Icons.person)),
                        title: Text(
                          m.displayName,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: Text(
                          isOwner ? 'Owner' : 'Member',
                          style: const TextStyle(fontSize: 11),
                        ),
                        trailing: isOwner
                            ? null
                            : IconButton(
                                icon: const Icon(
                                  Icons.remove_circle_outline,
                                  color: Colors.red,
                                  size: 18,
                                ),
                                onPressed: () => _removeMember(m.id),
                              ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Section: Workspace Settings
        ExpansionTile(
          leading: const Icon(
            Icons.settings_outlined,
            color: Color(0xFF94A3B8),
          ),
          title: const Text(
            'Workspace Settings',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          children: [
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Workspace Name',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _titleController,
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Description',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _descController,
                    maxLines: 3,
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF06B6D4),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              'Save Settings',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                    ),
                  ),
                  const Divider(height: 32),
                  const Text(
                    'Danger Zone',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                      color: Color(0xFFEF4444),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: _delete,
                      icon: const Icon(Icons.delete_forever),
                      label: const Text(
                        'Delete Workspace',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}
