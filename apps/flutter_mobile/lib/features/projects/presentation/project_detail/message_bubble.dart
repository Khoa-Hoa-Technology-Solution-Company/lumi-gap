import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class ProjectBubbleActionPill extends StatelessWidget {
  const ProjectBubbleActionPill({
    required this.label,
    this.icon,
    this.onTap,
    this.active = false,
    this.subtle = false,
    super.key,
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

class ProjectMessageBubble extends StatelessWidget {
  const ProjectMessageBubble({
    required this.mine,
    required this.heading,
    required this.content,
    required this.createdAt,
    this.icon,
    this.footer,
    this.italic = false,
    super.key,
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
            ProjectChatAvatar(icon: icon ?? Icons.person_outline_rounded),
            const SizedBox(width: 7),
          ],
          Flexible(child: bubble),
        ],
      ),
    );
  }
}

class ProjectChatAvatar extends StatelessWidget {
  const ProjectChatAvatar({required this.icon, super.key});

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

class ProjectEmptyChat extends StatelessWidget {
  const ProjectEmptyChat({
    required this.icon,
    required this.title,
    required this.message,
    super.key,
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
