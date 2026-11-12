import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';
import 'package:intl/intl.dart';

/// Message box: up to 5 lines then it scrolls, a counter above 1.800
/// characters, and a hard stop (send disabled plus a message) above 2.000.
class TeamChatComposer extends StatelessWidget {
  const TeamChatComposer({
    required this.controller,
    required this.onSend,
    super.key,
    this.enabled = true,
  });

  final TextEditingController controller;

  /// Called only when the text is valid; the caller clears the box.
  final VoidCallback onSend;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);

    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: lumi.surface,
          border: Border(top: BorderSide(color: lumi.line)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        child: ValueListenableBuilder<TextEditingValue>(
          valueListenable: controller,
          builder: (context, value, _) {
            final length = value.text.trim().length;
            final tooLong = length > teamChatMaxLength;
            final canSend = enabled && length > 0 && !tooLong;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: controller,
                        enabled: enabled,
                        minLines: 1,
                        maxLines: 5,
                        keyboardType: TextInputType.multiline,
                        textInputAction: TextInputAction.newline,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(
                          hintText: enabled
                              ? context.t('Message the team…')
                              : context.t('Cannot send messages'),
                          floatingLabelBehavior: FloatingLabelBehavior.never,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 12,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    SizedBox.square(
                      dimension: 48,
                      child: IconButton.filled(
                        tooltip: context.t('Send'),
                        onPressed: canSend ? onSend : null,
                        icon: const Icon(Icons.send),
                      ),
                    ),
                  ],
                ),
                if (tooLong)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Semantics(
                      liveRegion: true,
                      child: Row(
                        children: [
                          Icon(
                            Icons.error_outline,
                            size: 16,
                            color: lumi.error,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              context.t(
                                'Messages can be up to {{max}} characters ({{length}}/{{limit}}).',
                                {
                                  'max': NumberFormat.decimalPattern(
                                    context.intlLocale,
                                  ).format(teamChatMaxLength),
                                  'length': length,
                                  'limit': teamChatMaxLength,
                                },
                              ),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: lumi.error,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                else if (length > teamChatCounterFrom)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      '$length/$teamChatMaxLength',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: lumi.foregroundSecondary,
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
