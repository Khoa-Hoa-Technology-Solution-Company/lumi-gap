import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/chat_mode.dart';

class ProjectChannelSwitcher extends StatelessWidget {
  const ProjectChannelSwitcher({
    required this.mode,
    required this.onChanged,
    super.key,
  });

  final ProjectChatMode mode;
  final ValueChanged<ProjectChatMode> onChanged;

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
          ProjectChannelTab(
            label: 'Team',
            icon: Icons.groups_rounded,
            selected: mode == ProjectChatMode.team,
            onTap: () => onChanged(ProjectChatMode.team),
          ),
          ProjectChannelTab(
            label: 'My AI',
            icon: Icons.auto_awesome_rounded,
            selected: mode == ProjectChatMode.privateAi,
            onTap: () => onChanged(ProjectChatMode.privateAi),
          ),
          ProjectChannelTab(
            label: 'Team AI',
            icon: Icons.smart_toy_rounded,
            selected: mode == ProjectChatMode.teamAi,
            onTap: () => onChanged(ProjectChatMode.teamAi),
          ),
        ],
      ),
    );
  }
}

class ProjectChannelTab extends StatelessWidget {
  const ProjectChannelTab({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    super.key,
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
