import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/message_bubble.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ProjectAiMessages extends ConsumerWidget {
  const ProjectAiMessages({
    required this.projectId,
    required this.messages,
    required this.shared,
    required this.paperCount,
    required this.controller,
    required this.onRefresh,
    super.key,
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
      return ProjectEmptyChat(
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
        return ProjectMessageBubble(
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
                      ProjectBubbleActionPill(
                        icon: Icons.bolt_outlined,
                        label: '${item.creditCost} credit',
                        subtle: true,
                      ),
                    if (item.isPinned)
                      const ProjectBubbleActionPill(
                        icon: Icons.push_pin,
                        label: 'Pinned',
                        active: true,
                      ),
                    ProjectBubbleActionPill(
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
                          (id) => ProjectBubbleActionPill(
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

class ProjectTeamMessages extends ConsumerWidget {
  const ProjectTeamMessages({
    required this.projectId,
    required this.messages,
    required this.ownerId,
    required this.controller,
    required this.onRefresh,
    super.key,
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
      return const ProjectEmptyChat(
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
        return ProjectMessageBubble(
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
