import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_action_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_avatar.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/forum_widgets.dart';

enum ReplyAction { share, copy, edit, report, delete }

/// The actions of one reply as a bottom sheet (long-press or the overflow
/// button): the same items and rules as the web menu, plus Copy text, since
/// a long-press no longer selects the text.
Future<ReplyAction?> showReplyActions(
  BuildContext context, {
  required bool editable,
}) {
  return showLumiActionSheet<ReplyAction>(
    context,
    actions: [
      LumiSheetAction(
        value: ReplyAction.share,
        label: context.t('Share response'),
        icon: Icons.link,
      ),
      LumiSheetAction(
        value: ReplyAction.copy,
        label: context.t('Copy text'),
        icon: Icons.content_copy,
      ),
      if (editable)
        LumiSheetAction(
          value: ReplyAction.edit,
          label: context.t('Edit response'),
          icon: Icons.edit_outlined,
        ),
      LumiSheetAction(
        value: ReplyAction.report,
        label: context.t('Report response'),
        icon: Icons.flag_outlined,
      ),
      if (editable)
        LumiSheetAction(
          value: ReplyAction.delete,
          label: context.t('Delete response'),
          icon: Icons.delete_outline,
          destructive: true,
        ),
    ],
  );
}

/// One reply with what the viewer may do to it, as the web response item
/// (forum-response-item.tsx): reply to it, accept it (question author),
/// share, and edit / delete (own) or report it.
class ForumReplyCard extends StatelessWidget {
  const ForumReplyCard({
    required this.reply,
    required this.accepted,
    required this.readOnly,
    required this.canReply,
    required this.isOwn,
    required this.canAccept,
    required this.busy,
    required this.onReply,
    required this.onAccept,
    required this.onAction,
    this.parentAuthor,
    super.key,
  });

  final ForumReply reply;
  final bool accepted;

  /// Locked or removed discussion: no reaction, edit or accept.
  final bool readOnly;
  final bool canReply;
  final bool isOwn;

  /// The viewer wrote the question: they choose the accepted response.
  final bool canAccept;
  final bool busy;

  /// Author of the reply this one answers, when it answers one.
  final String? parentAuthor;
  final VoidCallback onReply;
  final VoidCallback onAccept;
  final ValueChanged<ReplyAction> onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: context.lumi.foregroundSecondary);
    if (reply.status == 'deleted' || reply.status == 'hidden') {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text(
          reply.status == 'deleted'
              ? context.t('This response was removed by its author.')
              : context.t('Content hidden from the forum'),
          style: secondary,
        ),
      );
    }
    final editable = isOwn && !readOnly;
    Future<void> openActions() async {
      final action = await showReplyActions(context, editable: editable);
      if (action != null) onAction(action);
    }

    // One entry of a flat thread: the whole entry long-presses to its
    // actions; the overflow button opens the same sheet.
    return Semantics(
      onLongPressHint: context.t('Show actions'),
      child: InkWell(
        onLongPress: busy
            ? null
            : () {
                unawaited(Haptics.select());
                unawaited(openActions());
              },
        child: Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  LumiAvatar(name: reply.author.fullName, size: 32),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '${reply.author.fullName} · ${relativeTime(reply.createdAt, context.appLocale)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: secondary,
                    ),
                  ),
                  IconButton(
                    tooltip: context.t('More response actions'),
                    onPressed: busy ? null : () => unawaited(openActions()),
                    icon: const Icon(Icons.more_vert),
                  ),
                ],
              ),
              if (accepted) ...[
                LumiChip(
                  label: context.t('Accepted by question author'),
                  icon: Icons.check_circle_outline,
                  tone: LumiChipTone.success,
                ),
                const SizedBox(height: 6),
              ],
              if (parentAuthor != null) ...[
                Text(context.t('Replying to {{name}}', {'name': parentAuthor}), style: secondary),
                const SizedBox(height: 4),
              ],
              Text(reply.content, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 8),
              ForumReactionBar(subjectId: reply.id, comment: true, initial: reply.reactions, enabled: !readOnly),
              if (canReply || (canAccept && !readOnly))
                Wrap(
                  spacing: 8,
                  children: [
                    if (canReply)
                      TextButton.icon(
                        onPressed: busy ? null : onReply,
                        icon: const Icon(Icons.reply, size: 18),
                        label: Text(context.t('Reply')),
                      ),
                    if (canAccept && !readOnly)
                      Tooltip(
                        message: context.t("This marks the author's accepted response, not scientific verification."),
                        child: TextButton.icon(
                          onPressed: busy ? null : onAccept,
                          icon: Icon(accepted ? Icons.check_circle : Icons.check_circle_outline, size: 18),
                          label: Text(accepted ? context.t('Unaccept response') : context.t('Accept response')),
                        ),
                      ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The reply box under a discussion, naming the reply being answered.
class ReplyComposer extends StatelessWidget {
  const ReplyComposer({
    required this.controller,
    required this.sending,
    required this.onSend,
    required this.onCancelReplyTo,
    this.replyingTo,
    this.focusNode,
    super.key,
  });
  final TextEditingController controller;

  /// Focused when the user taps Reply on a response.
  final FocusNode? focusNode;
  final bool sending;
  final String? replyingTo;
  final VoidCallback onSend;
  final VoidCallback onCancelReplyTo;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.lumi.surface,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 8, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (replyingTo != null)
              Row(
                children: [
                  Expanded(
                    child: Text(
                      context.t('Replying to {{name}}', {'name': replyingTo}),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.lumi.foregroundSecondary),
                    ),
                  ),
                  IconButton(
                    tooltip: context.t('Cancel'),
                    onPressed: sending ? null : onCancelReplyTo,
                    icon: const Icon(Icons.close, size: 20),
                  ),
                ],
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: focusNode,
                    enabled: !sending,
                    minLines: 1,
                    maxLines: 5,
                    maxLength: forumReplyMax,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      hintText: context.t('Reply to discussion'),
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                IconButton.filledTonal(
                  tooltip: context.t('Reply'),
                  onPressed: sending ? null : onSend,
                  icon: sending
                      ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.send),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
