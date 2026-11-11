import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class BookmarksScreen extends ConsumerStatefulWidget {
  const BookmarksScreen({super.key});

  @override
  ConsumerState<BookmarksScreen> createState() => _BookmarksScreenState();
}

class _BookmarksScreenState extends ConsumerState<BookmarksScreen> {
  String _filter = 'all';

  Future<void> _deleteBookmarkDirectly(String id) async {
    await ref.read(bookmarksApiProvider).delete(id);
    ref.invalidate(bookmarksProvider);
  }

  Future<void> _deleteReportDirectly(String id) async {
    await ref.read(reportsApiProvider).delete(id);
    ref.invalidate(reportsProvider(const ReportsParams(pageSize: 50)));
  }

  Future<bool?> _showConfirmDialog(String title, String content) {
    return showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(content),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.t('Cancel'))),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: Text(context.t('Delete')),
          ),
        ],
      ),
    );
  }

  void _setFilter(String value) => setState(() => _filter = value);

  Color _statusColor(String status) {
    if (status == 'ready') return const Color(0xFF10B981);
    if (status == 'failed') return const Color(0xFFEF4444);
    if (status == 'generating') return const Color(0xFFF59E0B);
    return const Color(0xFF06B6D4);
  }

  @override
  Widget build(BuildContext context) {
    final bookmarksAsync = ref.watch(bookmarksProvider);
    final reportsAsync = ref.watch(reportsProvider(const ReportsParams(pageSize: 50)));
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(title: Text(context.t('Bookmarks'))),
      body: SafeArea(
      child: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(bookmarksProvider)
            ..invalidate(reportsProvider(const ReportsParams(pageSize: 50)));
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
          children: [
            bookmarksAsync.when(
              data: (bookmarks) {
                return reportsAsync.when(
                  data: (reportsList) {
                    final paperBookmarks = bookmarks.where((b) => b.targetKind == 'paper').toList();
                    final reports = reportsList.reports;

                    final showPapers = _filter == 'all' || _filter == 'paper';
                    final showReports = _filter == 'all' || _filter == 'report';

                    final displayPapers = showPapers ? paperBookmarks : const <Bookmark>[];
                    final displayReports = showReports ? reports : const <ReportListItem>[];

                    final totalCount = paperBookmarks.length + reports.length;
                    final filters = [
                      (context.t('All ({{totalCount}})', {'totalCount': totalCount}), 'all'),
                      (context.t('Papers ({{length}})', {'length': paperBookmarks.length}), 'paper'),
                      (context.t('Reports ({{length}})', {'length': reports.length}), 'report'),
                    ];

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: filters.map((item) {
                              final selected = _filter == item.$2;
                              return Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: ChoiceChip(
                                  label: Text(
                                    item.$1,
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 12,
                                      color: selected ? Colors.white : theme.colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                  selected: selected,
                                  onSelected: (_) => _setFilter(item.$2),
                                  selectedColor: const Color(0xFF1D4ED8),
                                  backgroundColor: theme.cardColor,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(20),
                                    side: BorderSide(
                                      color: selected ? const Color(0xFF1D4ED8) : theme.dividerColor,
                                    ),
                                  ),
                                  showCheckmark: false,
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                        const SizedBox(height: 20),
                        if (displayPapers.isEmpty && displayReports.isEmpty)
                          AppEmptyState(
                            icon: Icons.bookmark_outline,
                            title: _filter == 'report' ? context.t('No reports yet') : context.t('No saved items yet'),
                            message: _filter == 'report'
                                ? context.t('Create AI reports from the Reports screen to keep them here.')
                                : context.t('Save papers from Home or Paper Detail to build your research library.'),
                          )
                        else ...[
                          ...displayPapers.map((bookmark) {
                            final paper = bookmark.paperDetail;
                            final title = paper?.title ?? context.t('Saved paper');
                            final authors = paper?.authors.map((a) => a.displayName).join(', ') ?? context.t('Unknown authors');
                            final subtitle = '${paper?.journalName ?? context.t('Paper')} - ${paper?.publicationYear ?? context.t('Unknown year')}';
                            return Dismissible(
                              key: Key(bookmark.id),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFDC2626),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 24),
                                child: const Icon(Icons.delete_outline, color: Colors.white, size: 24),
                              ),
                              confirmDismiss: (direction) => _showConfirmDialog(context.t('Remove bookmark'), context.t('Delete this saved item?')),
                              onDismissed: (direction) => _deleteBookmarkDirectly(bookmark.id),
                              child: Card(
                                elevation: 0,
                                margin: const EdgeInsets.only(bottom: 12),
                                color: theme.cardColor,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                  side: BorderSide(color: theme.dividerColor),
                                ),
                                child: InkWell(
                                  onTap: () => context.push('/paper/${bookmark.targetId}'),
                                  borderRadius: BorderRadius.circular(16),
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Container(
                                          width: 32,
                                          height: 32,
                                          decoration: BoxDecoration(
                                            color: Colors.cyan.withValues(alpha: 0.1),
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          child: const Icon(Icons.file_copy, color: Color(0xFF06B6D4), size: 15),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                decoration: BoxDecoration(
                                                  color: isDark ? const Color(0xFF26334A) : theme.colorScheme.surfaceContainerHighest,
                                                  borderRadius: BorderRadius.circular(4),
                                                ),
                                                child: Text(
                                                  context.t('PAPER'),
                                                  style: TextStyle(
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.bold,
                                                    color: theme.colorScheme.onSurfaceVariant,
                                                  ),
                                                ),
                                              ),
                                              const SizedBox(height: 8),
                                              Text(
                                                title,
                                                style: theme.textTheme.titleMedium?.copyWith(
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 14,
                                                  height: 1.3,
                                                ),
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                authors,
                                                style: theme.textTheme.bodySmall?.copyWith(
                                                  color: theme.colorScheme.onSurfaceVariant,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                subtitle,
                                                style: theme.textTheme.bodySmall?.copyWith(
                                                  color: theme.colorScheme.onSurfaceVariant,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              if (bookmark.note != null && bookmark.note!.trim().isNotEmpty) ...[
                                                const SizedBox(height: 8),
                                                Text(
                                                  bookmark.note!,
                                                  style: const TextStyle(
                                                    color: Color(0xFF0891B2),
                                                    fontSize: 12,
                                                  ),
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              ]
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }),
                          ...displayReports.map((report) {
                            return Dismissible(
                              key: Key(report.id),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFDC2626),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 24),
                                child: const Icon(Icons.delete_outline, color: Colors.white, size: 24),
                              ),
                              confirmDismiss: (direction) => _showConfirmDialog(context.t('Delete report'), context.t('Delete this report?')),
                              onDismissed: (direction) => _deleteReportDirectly(report.id),
                              child: Card(
                                elevation: 0,
                                margin: const EdgeInsets.only(bottom: 12),
                                color: theme.cardColor,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                  side: BorderSide(color: theme.dividerColor),
                                ),
                                child: InkWell(
                                  onTap: () {
                                    if (report.status == 'ready') {
                                      unawaited(context.push('/report/${report.id}'));
                                    } else {
                                      unawaited(context.push('/reports'));
                                    }
                                  },
                                  borderRadius: BorderRadius.circular(16),
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Container(
                                          width: 32,
                                          height: 32,
                                          decoration: BoxDecoration(
                                            color: Colors.purple.withValues(alpha: 0.1),
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          child: const Icon(Icons.auto_awesome, color: Color(0xFF8B5CF6), size: 16),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                decoration: BoxDecoration(
                                                  color: isDark ? const Color(0xFF26334A) : theme.colorScheme.surfaceContainerHighest,
                                                  borderRadius: BorderRadius.circular(4),
                                                ),
                                                child: Text(
                                                  context.t('REPORT'),
                                                  style: TextStyle(
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.bold,
                                                    color: theme.colorScheme.onSurfaceVariant,
                                                  ),
                                                ),
                                              ),
                                              const SizedBox(height: 8),
                                              Text(
                                                report.topic ?? report.query,
                                                style: theme.textTheme.titleMedium?.copyWith(
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 14,
                                                  height: 1.3,
                                                ),
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                report.query,
                                                style: theme.textTheme.bodySmall?.copyWith(
                                                  color: theme.colorScheme.onSurfaceVariant,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              const SizedBox(height: 8),
                                              Text(
                                                report.status.toUpperCase(),
                                                style: TextStyle(
                                                  color: _statusColor(report.status),
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 11,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }),
                        ],
                      ],
                    );
                  },
                  loading: () => AppLoading(message: context.t('Loading reports...')),
                  error: (error, _) => AppErrorState(message: error.toString()),
                );
              },
              loading: () => AppLoading(message: context.t('Loading bookmarks...')),
              error: (error, _) => AppErrorState(message: error.toString()),
            ),
          ],
        ),
      ),
      ),
    );
  }
}
