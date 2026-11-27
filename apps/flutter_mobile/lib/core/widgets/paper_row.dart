import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_action_sheet.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// One paper as a row of a `LumiRowGroup`: optional topic line, the title
/// (two lines at most), one line of who / where / when, and a 48dp save
/// button showing the server's real state.
///
/// A missing part is left out, never "Unknown". The whole row opens the
/// paper; the save button is its only other action. A long-press offers the
/// same two actions in a sheet.
class PaperRow extends ConsumerWidget {
  const PaperRow({
    required this.id,
    required this.title,
    required this.onTap,
    this.overline,
    this.meta,
    this.onBookmarkTap,
    super.key,
  });

  final String id;
  final String title;
  final VoidCallback onTap;

  /// Topic or why it is suggested, above the title.
  final String? overline;

  /// "Author · Venue · 2026", already joined.
  final String? meta;
  final VoidCallback? onBookmarkTap;

  static bool _has(String? s) => s != null && s.trim().isNotEmpty;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final saved = onBookmarkTap != null &&
        (ref
                .watch(bookmarkStatusProvider(BookmarkTarget('paper', id)))
                .value
                ?.bookmarked ??
            false);

    Future<void> showActions() async {
      final bookmark = onBookmarkTap;
      final action = await showLumiActionSheet<String>(
        context,
        title: title,
        actions: [
          LumiSheetAction(
            value: 'open',
            label: context.t('Open'),
            icon: Icons.open_in_new,
          ),
          if (bookmark != null)
            LumiSheetAction(
              value: 'bookmark',
              label: saved ? context.t('Remove bookmark') : context.t('Bookmark'),
              icon: saved ? Icons.bookmark_remove_outlined : Icons.bookmark_border,
            ),
        ],
      );
      switch (action) {
        case 'open':
          onTap();
        case 'bookmark':
          bookmark?.call();
      }
    }

    return Semantics(
      onLongPressHint: context.t('Show actions'),
      child: InkWell(
      onTap: onTap,
      onLongPress: () {
        unawaited(Haptics.select());
        unawaited(showActions());
      },
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 4, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_has(overline)) ...[
                    Text(
                      overline!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelLarge
                          ?.copyWith(color: lumi.primary),
                    ),
                    const SizedBox(height: 4),
                  ],
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium,
                  ),
                  if (_has(meta)) ...[
                    const SizedBox(height: 4),
                    Text(
                      meta!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: lumi.foregroundSecondary),
                    ),
                  ],
                ],
              ),
            ),
            if (onBookmarkTap != null)
              IconButton(
                tooltip: saved
                    ? context.t('Remove bookmark')
                    : context.t('Bookmark'),
                onPressed: onBookmarkTap,
                icon: Icon(
                  saved ? Icons.bookmark : Icons.bookmark_border,
                  color: saved ? lumi.primary : lumi.foregroundSecondary,
                ),
              )
            else
              const SizedBox(width: 12),
          ],
        ),
      ),
      ),
    );
  }
}
