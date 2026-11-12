import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
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
        title: context.t('No AI messages yet'),
        message: paperCount == 0
            ? context.t('Add papers before asking AI.')
            : context.t('Ask about methods, limitations, trends, or research gaps.'),
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
        final name = isMe ? context.t('You') : (item.requester?.displayName ?? context.t('Member'));
        return ProjectMessageBubble(
          mine: isUser && isMe,
          icon: isUser ? null : Icons.auto_awesome,
          heading: isUser
              ? name
              : item.requester == null
              ? context.t('AI assistant')
              : context.t('AI assistant - requested by {{name}}', {'name': item.requester!.displayName}),
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
                        label: context.plural(item.creditCost!, one: '{{count}} credit', other: '{{count}} credits'),
                        subtle: true,
                      ),
                    if (item.isPinned)
                      ProjectBubbleActionPill(
                        icon: Icons.push_pin,
                        label: context.t('Pinned'),
                        active: true,
                      ),
                    ProjectBubbleActionPill(
                      icon: Icons.copy_rounded,
                      label: context.t('Copy'),
                      onTap: () {
                        unawaited(
                          Clipboard.setData(ClipboardData(text: item.content)),
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(context.t('AI answer copied'))),
                        );
                      },
                    ),
                    ...item.citedPaperIds
                        .take(3)
                        .map(
                          (id) => ProjectBubbleActionPill(
                            label:
                                context.t('Paper {{id}}', {'id': id.length > 6 ? id.substring(id.length - 6) : id}),
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
