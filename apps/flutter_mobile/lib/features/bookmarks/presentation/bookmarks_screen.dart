import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_action_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_swipe_action.dart';
import 'package:flutter_mobile/core/widgets/undo_snackbar.dart';
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

  /// Bookmarks the user removed whose Undo window is open, or whose delete
  /// is in flight: hidden at once, deleted on the server only once the Undo
  /// snackbar closes without Undo.
  final Set<String> _hidden = {};

  /// Commits the removal waiting in its Undo window, if any. Only one can
  /// wait: a new removal replaces the snackbar, which commits the previous.
  VoidCallback? _commitPending;
  late ScaffoldMessengerState _messenger;
  late ProviderContainer _container;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _messenger = ScaffoldMessenger.of(context);
    _container = ProviderScope.containerOf(context, listen: false);
  }

  @override
  void dispose() {
    // Leaving the screen commits a pending removal now, so the list is
    // right when the screen opens again.
    _commitPending?.call();
    super.dispose();
  }

  /// Hides the bookmark and offers Undo. Synchronous up to the first frame:
  /// a swiped row must leave the list in the same call.
  void _remove(Bookmark bookmark) {
    if (!_hidden.add(bookmark.id)) return;
    setState(() {});
    final locale = context.appLocale;
    _commitPending = showUndoSnackBar(
      _messenger,
      message: translate('Removed from bookmarks', locale),
      undoLabel: translate('Undo', locale),
      onUndo: () {
        if (!mounted) return;
        setState(() => _hidden.remove(bookmark.id));
      },
      onCommit: () {
        unawaited(_commit(bookmark, locale));
      },
    );
  }

  Future<void> _commit(Bookmark bookmark, AppLocale locale) async {
    var failed = false;
    try {
      await _container.read(bookmarksApiProvider).delete(bookmark.id);
    } on Object catch (e) {
      failed = true;
      // The app's messenger outlives this screen; it is only gone when the
      // whole app is torn down.
      if (_messenger.mounted) {
        _messenger.showSnackBar(
        SnackBar(content: Text(translate(failureMessageKey(e), locale))),
      );
      }
    } finally {
      // The list and the bookmark button show what the server has, whether
      // it worked or not; a failed row comes back.
      if (failed && mounted) setState(() => _hidden.remove(bookmark.id));
      _container
        ..invalidate(bookmarksProvider)
        ..invalidate(
          bookmarkStatusProvider(
            BookmarkTarget(bookmark.targetKind, bookmark.targetId),
          ),
        );
    }
  }

  void _open(Bookmark b) => unawaited(
    context.push(
      b.targetKind == 'paper'
          ? '/paper/${b.targetId}'
          : '/report/${b.targetId}',
    ),
  );

  Future<void> _showActions(Bookmark b) async {
    final action = await showLumiActionSheet<String>(
      context,
      title: b.targetKind == 'paper'
          ? b.paperDetail?.title
          : b.reportTitle?.trim(),
      actions: [
        LumiSheetAction(
          value: 'open',
          label: context.t('Open'),
          icon: Icons.open_in_new,
        ),
        LumiSheetAction(
          value: 'remove',
          label: context.t('Remove bookmark'),
          icon: Icons.bookmark_remove_outlined,
          destructive: true,
        ),
      ],
    );
    if (!mounted) return;
    switch (action) {
      case 'open':
        _open(b);
      case 'remove':
        _remove(b);
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(bookmarksProvider);

    final Widget body;
    if (query.hasValue) {
      final live = [
        for (final b in liveBookmarks(query.requireValue))
          if (!_hidden.contains(b.id)) b,
      ];
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
                      'Tap the bookmark on any paper to build your research library.',
                    ),
              compact: true,
            )
          else
            LumiRowGroup(
              children: [
                for (final b in shown)
                  LumiSwipeAction(
                    key: ValueKey('bookmark-${b.id}'),
                    label: context.t('Remove'),
                    icon: Icons.bookmark_remove_outlined,
                    destructive: true,
                    removesItem: true,
                    onSwipe: () => _remove(b),
                    child: _BookmarkRow(
                      bookmark: b,
                      onOpen: () => _open(b),
                      onRemove: () {
                        unawaited(Haptics.commit());
                        _remove(b);
                      },
                      onLongPress: () => unawaited(_showActions(b)),
                    ),
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
    required this.onOpen,
    required this.onRemove,
    required this.onLongPress,
  });

  final Bookmark bookmark;
  final VoidCallback onOpen;
  final VoidCallback onRemove;
  final VoidCallback onLongPress;

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

    return Semantics(
      onLongPressHint: context.t('Show actions'),
      child: InkWell(
        onTap: onOpen,
        onLongPress: () {
          unawaited(Haptics.select());
          onLongPress();
        },
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
                    if (!isPaper &&
                        (bookmark.reportStatus ?? '').isNotEmpty) ...[
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
                onPressed: onRemove,
                icon: Icon(
                  Icons.bookmark_remove_outlined,
                  color: lumi.foregroundSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
