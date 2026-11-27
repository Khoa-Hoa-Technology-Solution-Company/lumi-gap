import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_confirm_sheet.dart';
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
  final ok = await showLumiConfirmSheet(
    context,
    title: reply ? context.t('Remove this response?') : context.t('Remove this discussion?'),
    message: context.t('This action cannot be undone.'),
    confirmText: context.t('Remove'),
    destructive: true,
  );
  return ok ?? false;
}

/// The four notification levels with their web descriptions; the chosen
/// one, or null when dismissed.
Future<String?> pickNotificationLevel(BuildContext context, String current) {
  return showModalBottomSheet<String>(
    // Over the bottom navigation bar, dimming it too.
    useRootNavigator: true,
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
  final input = await showModalBottomSheet<(String, String)>(
    // Over the bottom navigation bar, dimming it too.
    useRootNavigator: true,
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (_) => _ReportSheet(reply: reply, id: id),
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

class _ReportSheet extends ConsumerStatefulWidget {
  const _ReportSheet({required this.reply, required this.id});
  final bool reply;
  final String id;

  @override
  ConsumerState<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<_ReportSheet> {
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
    final theme = Theme.of(context);
    return Padding(
      // Rise with the keyboard so the context field stays visible.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(context.t('Report content'), style: theme.textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              context.t('Reports are for policy or community-rule issues, not ordinary academic disagreement.'),
              style: theme.textTheme.bodyMedium?.copyWith(color: context.lumi.foregroundSecondary),
            ),
            const SizedBox(height: 8),
            // Radio rows instead of a dropdown: every reason is one tap away.
            RadioGroup<String>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v ?? _reason),
              child: Column(
                children: [
                  for (final (value, label) in forumReportReasons)
                    RadioListTile<String>(
                      value: value,
                      contentPadding: EdgeInsets.zero,
                      title: Text(context.t(label)),
                    ),
                ],
              ),
            ),
            if (_reason == 'COPYRIGHT_CONCERN')
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () => unawaited(openWebPage(
                    context,
                    ref,
                    '/forum/copyright?type=${widget.reply ? 'RESPONSE' : 'THREAD'}&id=${Uri.encodeComponent(widget.id)}',
                  )),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: Text(context.t('Submit a copyright claim')),
                ),
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
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () => Navigator.pop(context, (_reason, _context.text.trim())),
              child: Text(context.t('Submit report')),
            ),
            const SizedBox(height: 8),
            TextButton(
              style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () => Navigator.pop(context),
              child: Text(context.t('Cancel')),
            ),
          ],
        ),
      ),
    );
  }
}
