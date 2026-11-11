import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_items.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';
import 'package:intl/intl.dart';

String teamChatTime(DateTime t) => DateFormat('HH:mm').format(t.toLocal());

class TeamChatDayChip extends StatelessWidget {
  const TeamChatDayChip({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: lumi.surfaceMuted,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: lumi.foregroundSecondary),
          ),
        ),
      ),
    );
  }
}

class TeamChatAvatar extends StatelessWidget {
  const TeamChatAvatar({required this.sender, super.key});

  final TeamChatSender sender;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return ExcludeSemantics(
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: lumi.primarySoft,
          shape: BoxShape.circle,
        ),
        child: Text(
          sender.initial,
          style: Theme.of(
            context,
          ).textTheme.labelLarge?.copyWith(color: lumi.primary),
        ),
      ),
    );
  }
}

/// Mine on the right (primarySoft), others on the left (surface with a
/// border). A deleted message is neutral and never shows its old text.
class TeamChatBubble extends StatelessWidget {
  const TeamChatBubble({
    required this.item,
    super.key,
    this.onLongPress,
    this.onSeenTap,
  });

  final TeamChatMessageItem item;

  /// Null when the user may not delete this message.
  final VoidCallback? onLongPress;
  final VoidCallback? onSeenTap;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    final message = item.message;
    final mine = item.mine;
    final deleted = message.isDeleted;

    final background = deleted
        ? lumi.surface
        : mine
        ? lumi.primarySoft
        : lumi.surface;
    final timeColor = mine && !deleted ? lumi.foregroundSecondary : lumi.muted;

    final bubble = Material(
      color: background,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: mine && !deleted ? lumi.primarySoft : lumi.line,
        ),
      ),
      child: InkWell(
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (deleted)
                Text(
                  context.t('Message deleted'),
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: lumi.muted,
                    fontStyle: FontStyle.italic,
                  ),
                )
              else
                Text(
                  message.content,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: lumi.foreground,
                  ),
                ),
              const SizedBox(height: 2),
              Text(
                teamChatTime(message.createdAt),
                style: theme.textTheme.bodySmall?.copyWith(color: timeColor),
              ),
            ],
          ),
        ),
      ),
    );

    final semanticsLabel = deleted
        ? context.t('{{name}}: message deleted, {{time}}', {'name': message.sender.displayName, 'time': teamChatTime(message.createdAt)})
        : '${mine ? context.t('You') : message.sender.displayName}: ${message.content}, ${teamChatTime(message.createdAt)}';

    return Padding(
      padding: EdgeInsets.only(top: item.startsGroup ? 12 : 2),
      child: Column(
        crossAxisAlignment: mine
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final maxBubble = constraints.maxWidth * 0.8;
              final body = Semantics(
                container: true,
                label: semanticsLabel,
                excludeSemantics: true,
                onLongPress: onLongPress,
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: maxBubble),
                  child: bubble,
                ),
              );
              if (mine) {
                return Align(alignment: Alignment.centerRight, child: body);
              }
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 40,
                    child: item.startsGroup
                        ? TeamChatAvatar(sender: message.sender)
                        : null,
                  ),
                  Flexible(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (item.startsGroup)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 2),
                            child: Text(
                              message.sender.displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.labelMedium?.copyWith(
                                color: lumi.foregroundSecondary,
                              ),
                            ),
                          ),
                        body,
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
          if (item.showSeen)
            TeamChatSeenLabel(count: message.readers.length, onTap: onSeenTap),
        ],
      ),
    );
  }
}

/// "Đã xem bởi N" under my last message; tap opens the list of readers.
class TeamChatSeenLabel extends StatelessWidget {
  const TeamChatSeenLabel({required this.count, super.key, this.onTap});

  final int count;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final style = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: lumi.foregroundSecondary);
    if (count == 0) {
      return Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text(context.t('Sent'), style: style),
      );
    }
    return Semantics(
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48, minWidth: 48),
          child: Align(
            alignment: Alignment.centerRight,
            widthFactor: 1,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text(context.t('Seen by {{count}}', {'count': count}), style: style),
            ),
          ),
        ),
      ),
    );
  }
}

/// A message I sent that the server has not confirmed: spinner while
/// sending, or the reason plus "Gửi lại" / "Bỏ" when it failed.
class TeamChatPendingBubble extends StatelessWidget {
  const TeamChatPendingBubble({
    required this.item,
    required this.onRetry,
    required this.onDiscard,
    super.key,
  });

  final TeamChatPendingItem item;
  final VoidCallback onRetry;
  final VoidCallback onDiscard;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    final pending = item.pending;
    final failed = pending.state == PendingState.failed;

    return Padding(
      padding: EdgeInsets.only(top: item.startsGroup ? 12 : 2),
      child: Align(
        alignment: Alignment.centerRight,
        child: LayoutBuilder(
          builder: (context, constraints) => ConstrainedBox(
            constraints: BoxConstraints(maxWidth: constraints.maxWidth * 0.8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: lumi.primarySoft,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: failed ? lumi.error : lumi.primarySoft,
                    ),
                  ),
                  child: Text(
                    pending.content,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: lumi.foreground,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                if (!failed)
                  Semantics(
                    liveRegion: true,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: lumi.foregroundSecondary,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          context.t('Sending…'),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: lumi.foregroundSecondary,
                          ),
                        ),
                      ],
                    ),
                  )
                else ...[
                  Semantics(
                    liveRegion: true,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.error_outline, size: 16, color: lumi.error),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            context.t(
                              pending.failure?.sendMessage ??
                                  tk('Failed to send. Please try again.'),
                            ),
                            textAlign: TextAlign.end,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: lumi.foreground,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Wrap(
                    alignment: WrapAlignment.end,
                    children: [
                      TextButton(
                        onPressed: onRetry,
                        child: Text(context.t('Resend')),
                      ),
                      TextButton(
                        onPressed: onDiscard,
                        child: Text(context.t('Discard')),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
