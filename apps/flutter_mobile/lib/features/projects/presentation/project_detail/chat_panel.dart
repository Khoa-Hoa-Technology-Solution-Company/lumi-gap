import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/chat_messages.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/chat_mode.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ProjectChatPanel extends ConsumerWidget {
  const ProjectChatPanel({
    required this.projectId,
    required this.mode,
    required this.paperCount,
    required this.controller,
    required this.onRefresh,
    super.key,
  });

  final String projectId;
  final ProjectChatMode mode;
  final int paperCount;
  final ScrollController controller;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = switch (mode) {
      ProjectChatMode.privateAi => context.t('My AI - Private'),
      ProjectChatMode.teamAi => context.t('Team AI Room - Shared'),
    };
    final subtitle = switch (mode) {
      ProjectChatMode.privateAi => context.t('Only you can see this AI conversation'),
      ProjectChatMode.teamAi =>
        context.t('AI answers are visible to every project member'),
    };

    final body = ref
        .watch(
          projectChatProvider((
            projectId: projectId,
            scope: mode == ProjectChatMode.privateAi ? 'private' : 'team',
          )),
        )
        .when(
          data: (messages) => ProjectAiMessages(
            projectId: projectId,
            messages: messages,
            shared: mode == ProjectChatMode.teamAi,
            paperCount: paperCount,
            controller: controller,
            onRefresh: onRefresh,
          ),
          loading: () => const LumiPageSkeleton(rows: 3, height: 72),
          error: (error, _) =>
              AppErrorState(message: context.t(failureMessageKey(error)), onRetry: onRefresh),
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
                    mode == ProjectChatMode.privateAi
                        ? Icons.lock_outline
                        : Icons.groups_outlined,
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
                        style: context.type.bodyLarge!.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.type.bodySmall!.copyWith(
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                ProjectStatusPill(private: mode == ProjectChatMode.privateAi),
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

class ProjectStatusPill extends StatelessWidget {
  const ProjectStatusPill({required this.private, super.key});

  final bool private;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final color = private ? colors.primary : context.lumi.success;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .09),
        borderRadius: BorderRadius.circular(8),
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
            private ? context.t('Private') : context.t('Live'),
            style: context.type.bodySmall!.copyWith(
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
