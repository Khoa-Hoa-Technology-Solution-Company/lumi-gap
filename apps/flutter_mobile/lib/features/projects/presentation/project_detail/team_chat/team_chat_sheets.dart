import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_bubbles.dart';

/// Who has read a message (the sender is not listed).
Future<void> showTeamChatReaders(
  BuildContext context,
  List<TeamChatSender> readers,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.6,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                context.t('Seen by {{count}}', {'count': readers.length}),
                style: Theme.of(sheetContext).textTheme.titleLarge,
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final reader in readers)
                    TeamChatPersonTile(sender: reader),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// What the long-press menu offers: only "Xóa tin nhắn", and only for people
/// who may delete the message. Returns true when the user picked it.
Future<bool> showTeamChatMessageMenu(BuildContext context) async {
  final picked = await showModalBottomSheet<bool>(
    context: context,
    builder: (sheetContext) {
      final lumi = sheetContext.lumi;
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              minTileHeight: 56,
              leading: Icon(Icons.delete_outline, color: lumi.error),
              title: Text(
                context.t('Delete message'),
                style: Theme.of(
                  sheetContext,
                ).textTheme.titleMedium?.copyWith(color: lumi.error),
              ),
              onTap: () => Navigator.of(sheetContext).pop(true),
            ),
          ],
        ),
      );
    },
  );
  return picked ?? false;
}

/// Confirmation with an optional reason (at most 500 characters). Returns
/// null when cancelled, otherwise the trimmed reason (possibly empty).
Future<String?> askTeamChatDeleteReason(BuildContext context) {
  // Not disposed on purpose: the dialog is still animating out when it
  // returns, and the controller has no listeners to leak.
  final reason = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(context.t('Delete message?')),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.t('Everyone in the team will see "Message deleted".')),
          const SizedBox(height: 12),
          TextField(
            controller: reason,
            maxLength: 500,
            maxLines: 3,
            minLines: 1,
            decoration: InputDecoration(
              labelText: context.t('Reason (optional)'),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(),
          child: Text(context.t('Cancel')),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(reason.text.trim()),
          child: Text(context.t('Delete')),
        ),
      ],
    ),
  );
}

class TeamChatPersonTile extends StatelessWidget {
  const TeamChatPersonTile({required this.sender, super.key});

  final TeamChatSender sender;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    return ListTile(
      minTileHeight: 56,
      leading: TeamChatAvatar(sender: sender),
      title: Text(
        sender.displayName,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.titleMedium,
      ),
      subtitle: sender.fullName != null && sender.email != null
          ? Text(
              sender.email!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: lumi.foregroundSecondary,
              ),
            )
          : null,
    );
  }
}
