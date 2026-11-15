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
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
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
                Icon(
                  mode == ProjectChatMode.privateAi
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                  size: 18,
                  color: context.lumi.foregroundSecondary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    subtitle,
                    style: context.type.bodySmall!.copyWith(
                      color: context.lumi.foregroundSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ColoredBox(
              // The page colour: an ad-hoc tint here dropped the message
              // times under 4.5:1.
              color: context.lumi.background,
              child: body,
            ),
          ),
        ],
      ),
    );
  }
}
