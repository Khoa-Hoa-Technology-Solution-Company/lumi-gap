import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/channel_switcher.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/chat_mode.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/chat_panel.dart';

class ProjectChatTab extends StatelessWidget {
  const ProjectChatTab({
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
    super.key,
  });

  final String projectId;
  final ProjectView project;
  final ProjectChatMode mode;
  final ValueChanged<ProjectChatMode> selectMode;
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
        ProjectChannelSwitcher(mode: mode, onChanged: selectMode),
        Expanded(
          child: ProjectChatPanel(
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
                        hintText: mode == ProjectChatMode.team
                            ? 'Message your project team...'
                            : 'Ask about project papers...',
                        counterText: '',
                        border: InputBorder.none,
                        prefixIcon: Icon(
                          mode == ProjectChatMode.team
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
