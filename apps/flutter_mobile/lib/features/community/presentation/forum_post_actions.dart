import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Web address of a discussion, or of reply number [postNumber] in it, as
/// the web builds it (forum-helpers.ts `forumPostHref`).
String forumWebPath(ForumPost post, {int? postNumber}) {
  final base = '/forum/${Uri.encodeComponent(post.publicSlug ?? post.id)}';
  return postNumber == null ? base : '$base/$postNumber';
}

/// Copies the web link, as the web "Share" button does.
Future<void> copyForumLink(BuildContext context, String path) async {
  final messenger = ScaffoldMessenger.of(context);
  final locale = context.appLocale;
  final url = webUrlFor(path)?.toString() ?? path;
  await Clipboard.setData(ClipboardData(text: url));
  messenger.showSnackBar(SnackBar(content: Text(translate('Copied link to clipboard', locale))));
}

/// "Remove this discussion?" / "Remove this response?"; true to remove.
Future<bool> confirmForumRemove(BuildContext context, {required bool reply}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(reply ? context.t('Remove this response?') : context.t('Remove this discussion?')),
      content: Text(context.t('This action cannot be undone.')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.t('Cancel'))),
        TextButton(
          style: TextButton.styleFrom(foregroundColor: context.lumi.error),
          onPressed: () => Navigator.pop(context, true),
          child: Text(context.t('Remove')),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// The four notification levels with their web descriptions; the chosen
/// one, or null when dismissed.
Future<String?> pickNotificationLevel(BuildContext context, String current) {
  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
              child: Text(context.t('Discussion notifications'), style: Theme.of(context).textTheme.titleMedium),
            ),
            RadioGroup<String>(
              groupValue: current,
              onChanged: (v) => Navigator.pop(context, v),
              child: Column(
                children: [
                  for (final (level, label, description) in forumNotificationLevels)
                    RadioListTile<String>(
                      value: level,
                      title: Text(context.t(label)),
                      subtitle: Text(context.t(description)),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Asks for a reason and sends the report. Returns true when it was sent.
Future<bool> reportForumContent(
  BuildContext context,
  WidgetRef ref, {
  required bool reply,
  required String id,
}) async {
  final api = ref.read(forumApiProvider);
  final messenger = ScaffoldMessenger.of(context);
  final locale = context.appLocale;
  final input = await showDialog<(String, String)>(
    context: context,
    builder: (_) => _ReportDialog(reply: reply, id: id),
  );
  if (input == null) return false;
  try {
    await api.report(
      comment: reply,
      id: id,
      reason: input.$1,
      description: input.$2.isEmpty ? null : input.$2,
    );
    messenger.showSnackBar(SnackBar(content: Text(translate('Report submitted for moderator review.', locale))));
    return true;
  } on Object catch (e) {
    messenger.showSnackBar(SnackBar(
      content: Text(translate(
        isConnectionFailure(e)
            ? failureMessageKey(e)
            : 'This content could not be reported, or you already reported it.',
        locale,
      )),
    ));
    return false;
  }
}

class _ReportDialog extends ConsumerStatefulWidget {
  const _ReportDialog({required this.reply, required this.id});
  final bool reply;
  final String id;

  @override
  ConsumerState<_ReportDialog> createState() => _ReportDialogState();
}

class _ReportDialogState extends ConsumerState<_ReportDialog> {
  // The web starts on "Off topic" too.
  String _reason = 'OFF_TOPIC';
  final _context = TextEditingController();

  @override
  void dispose() {
    _context.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(context.t('Report content')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.t('Reports are for policy or community-rule issues, not ordinary academic disagreement.')),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _reason,
              isExpanded: true,
              decoration: InputDecoration(labelText: context.t('Reason')),
              items: [
                for (final (value, label) in forumReportReasons)
                  DropdownMenuItem(value: value, child: Text(context.t(label))),
              ],
              onChanged: (v) => setState(() => _reason = v ?? _reason),
            ),
            if (_reason == 'COPYRIGHT_CONCERN')
              TextButton.icon(
                onPressed: () => unawaited(openWebPage(
                  context,
                  ref,
                  '/forum/copyright?type=${widget.reply ? 'RESPONSE' : 'THREAD'}&id=${Uri.encodeComponent(widget.id)}',
                )),
                icon: const Icon(Icons.open_in_new, size: 18),
                label: Text(context.t('Submit a copyright claim')),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _context,
              maxLength: forumReportMax,
              minLines: 3,
              maxLines: 5,
              decoration: InputDecoration(
                labelText: context.t('Optional context for moderators'),
                hintText: context.t('Explain why this violates policy...'),
                alignLabelWithHint: true,
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(context.t('Cancel'))),
        FilledButton(
          onPressed: () => Navigator.pop(context, (_reason, _context.text.trim())),
          child: Text(context.t('Submit report')),
        ),
      ],
    );
  }
}
