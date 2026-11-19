import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/confirm_dialog.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_status.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

enum _Filter { all, paper, report }

/// Bookmarks whose paper or report still exists, as on the web: a bookmark
/// left behind by a deleted item is not listed.
List<Bookmark> liveBookmarks(List<Bookmark> all) => [
  for (final b in all)
    if ((b.targetKind == 'paper' && b.paperDetail != null) ||
        (b.targetKind == 'report' && (b.reportTitle ?? '').trim().isNotEmpty))
      b,
];

/// What the user saved: papers and reports. Removing one only removes the
/// bookmark, never the paper or the report.
class BookmarksScreen extends ConsumerStatefulWidget {
  const BookmarksScreen({super.key});

  @override
  ConsumerState<BookmarksScreen> createState() => _BookmarksScreenState();
}

class _BookmarksScreenState extends ConsumerState<BookmarksScreen> {
  _Filter _filter = _Filter.all;

  /// Bookmarks being removed: a second tap waits for the first.
  final Set<String> _removing = {};

  Future<void> _remove(Bookmark bookmark) async {
    if (_removing.contains(bookmark.id)) return;
    final ok = await ConfirmDialog.show(
      context,
      title: context.t('Remove bookmark'),
      message: context.t('Delete this saved item?'),
      confirmText: context.t('Remove'),
      isDestructive: true,
    );
    if (ok != true || !mounted || !_removing.add(bookmark.id)) return;
    setState(() {});
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await container.read(bookmarksApiProvider).delete(bookmark.id);
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t(failureMessageKey(e))),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    } finally {
      _removing.remove(bookmark.id);
      if (mounted) setState(() {});
      // The list shows what the server has, whether it worked or not.
      container
        ..invalidate(bookmarksProvider)
        ..invalidate(
          bookmarkStatusProvider(
            BookmarkTarget(bookmark.targetKind, bookmark.targetId),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(bookmarksProvider);

    final Widget body;
    if (query.hasValue) {
      final live = liveBookmarks(query.requireValue);
      final papers = live.where((b) => b.targetKind == 'paper').length;
      final reports = live.length - papers;
      final shown = [
        for (final b in live)
          if (_filter == _Filter.all || b.targetKind == _filter.name) b,
      ];
      body = ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          LumiSegmentedTabs<_Filter>(
            options: [
              (
                _Filter.all,
                context.t('All ({{totalCount}})', {'totalCount': live.length}),
              ),
              (
                _Filter.paper,
                context.t('Papers ({{length}})', {'length': papers}),
              ),
              (
                _Filter.report,
                context.t('Reports ({{length}})', {'length': reports}),
              ),
            ],
            selected: _filter,
            onChanged: (f) => setState(() => _filter = f),
          ),
          const SizedBox(height: 16),
          if (shown.isEmpty)
            LumiEmptyState(
              icon: Icons.bookmark_border,
              title: context.t('No saved items yet'),
              message: _filter == _Filter.report
                  ? context.t('Save a report from its page to keep it here.')
                  : context.t(
                      'Save papers from Home or Paper Detail to build your research library.',
                    ),
              compact: true,
            )
          else
            LumiRowGroup(
              children: [
                for (final b in shown)
                  _BookmarkRow(
                    bookmark: b,
                    removing: _removing.contains(b.id),
                    onRemove: () => unawaited(_remove(b)),
                  ),
              ],
            ),
        ],
      );
    } else if (query.hasError) {
      body = LumiErrorState(
        message: context.t(failureMessageKey(query.error!)),
        retrying: query.isLoading,
        onRetry: () => ref.invalidate(bookmarksProvider),
      );
    } else {
      body = const LumiPageSkeleton(height: 80);
    }

    return Scaffold(
      appBar: AppBar(title: Text(context.t('Bookmarks'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(bookmarksProvider),
        child: body,
      ),
    );
  }
}

class _BookmarkRow extends StatelessWidget {
  const _BookmarkRow({
    required this.bookmark,
    required this.removing,
    required this.onRemove,
  });

  final Bookmark bookmark;
  final bool removing;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final isPaper = bookmark.targetKind == 'paper';
    final paper = bookmark.paperDetail;
    final title = isPaper ? paper!.title : bookmark.reportTitle!.trim();
    // Only what is known: a missing venue, year or author is left out.
    final meta = isPaper
        ? [
            if (paper!.authors.isNotEmpty)
              paper.authors.map((a) => a.displayName).join(', '),
            if ((paper.journalName ?? '').trim().isNotEmpty)
              paper.journalName!.trim(),
            if (paper.publicationYear > 0) '${paper.publicationYear}',
          ].join(' · ')
        : '';
    final note = bookmark.note?.trim() ?? '';

    return InkWell(
      onTap: () => unawaited(
        context.push(
          isPaper
              ? '/paper/${bookmark.targetId}'
              : '/report/${bookmark.targetId}',
        ),
      ),
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 4, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: lumi.primarySoft,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                isPaper ? Icons.article_outlined : Icons.description_outlined,
                size: 20,
                color: lumi.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium,
                  ),
                  if (meta.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: lumi.foregroundSecondary,
                      ),
                    ),
                  ],
                  if (!isPaper && (bookmark.reportStatus ?? '').isNotEmpty) ...[
                    const SizedBox(height: 6),
                    ReportStatusLabel(status: bookmark.reportStatus!),
                  ],
                  if (note.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      note,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            IconButton(
              tooltip: context.t('Remove bookmark'),
              onPressed: removing ? null : onRemove,
              icon: Icon(
                Icons.bookmark_remove_outlined,
                color: lumi.foregroundSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
