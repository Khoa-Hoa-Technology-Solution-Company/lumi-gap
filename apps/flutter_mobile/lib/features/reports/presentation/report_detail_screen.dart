import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_card.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_panel.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_status.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// One report: what it answers, its text, the papers it rests on and the
/// gaps it found.
class ReportDetailScreen extends ConsumerWidget {
  const ReportDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(reportProvider(id));
    final Widget body;
    if (query.hasValue) {
      body = RefreshIndicator(
        onRefresh: () => ref.refresh(reportProvider(id).future),
        child: _ReportBody(report: query.requireValue, id: id),
      );
    } else if (query.hasError) {
      body = LumiErrorState(
        message: context.t(failureMessageKey(query.error!)),
        retrying: query.isLoading,
        onRetry: () => ref.invalidate(reportProvider(id)),
      );
    } else {
      body = const LumiPageSkeleton(height: 140);
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Report detail')),
        actions: [
          _ReportBookmarkButton(reportId: id),
          const SizedBox(width: 4),
        ],
      ),
      body: body,
    );
  }
}

class _ReportBody extends StatelessWidget {
  const _ReportBody({required this.report, required this.id});

  final AnalyticalReport report;
  final String id;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final state = ReportState.parse(report.status);
    final markdown = report.markdown?.trim() ?? '';
    final topic = report.topic ?? report.query;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        LumiCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(topic, style: theme.textTheme.titleLarge),
              if (report.topic != null) ...[
                const SizedBox(height: 4),
                Text(
                  report.query,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: lumi.foregroundSecondary,
                  ),
                ),
              ],
              const SizedBox(height: 8),
              ReportStatusLabel(status: report.status),
              if (state == ReportState.failed) ...[
                const SizedBox(height: 8),
                Text(
                  (report.errorMessage ?? '').trim().isEmpty
                      ? context.t('The report could not be generated.')
                      : report.errorMessage!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: lumi.error,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (markdown.isNotEmpty)
          LumiCard(
            child: MarkdownBody(
              data: markdown,
              selectable: true,
              styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
                p: theme.textTheme.bodyLarge?.copyWith(
                  height: 1.6,
                  color: lumi.foreground,
                ),
              ),
            ),
          )
        else if (state.inProgress)
          Text(
            context.t(
              'Background worker is compiling bibliography and writing analysis...',
            ),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: lumi.foregroundSecondary,
            ),
          ),
        if (report.groundingPapers.isNotEmpty) ...[
          const SizedBox(height: 24),
          LumiSectionHeader(title: context.t('Grounding papers')),
          LumiCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (final paper in report.groundingPapers)
                  ListTile(
                    title: Text(
                      paper.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: paper.publicationYear > 0
                        ? Text('${paper.publicationYear}')
                        : null,
                    trailing: Icon(Icons.chevron_right, color: lumi.muted),
                    onTap: () => unawaited(context.push('/paper/${paper.id}')),
                  ),
              ],
            ),
          ),
        ],
        if (report.researchGaps.isNotEmpty) ...[
          const SizedBox(height: 24),
          LumiSectionHeader(
            title: context.t('Identified research gaps'),
            actionLabel: context.t('View gaps board'),
            onAction: () => unawaited(
              context.push('/gaps?topic=${Uri.encodeComponent(topic)}'),
            ),
          ),
          for (final gap in report.researchGaps)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: LumiCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(gap.title, style: theme.textTheme.titleSmall),
                    if (gap.description.trim().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        gap.description,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: lumi.foregroundSecondary,
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    GapConfidenceBar(value: gap.confidence),
                  ],
                ),
              ),
            ),
        ],
        const SizedBox(height: 24),
        QualityPanel(targetKind: 'report', targetId: id),
      ],
    );
  }
}

/// Save / unsave this report, as on the web report page. The icon shows the
/// server's state; one request at a time.
class _ReportBookmarkButton extends ConsumerStatefulWidget {
  const _ReportBookmarkButton({required this.reportId});

  final String reportId;

  @override
  ConsumerState<_ReportBookmarkButton> createState() =>
      _ReportBookmarkButtonState();
}

class _ReportBookmarkButtonState extends ConsumerState<_ReportBookmarkButton> {
  bool _busy = false;

  BookmarkTarget get _target => BookmarkTarget('report', widget.reportId);

  Future<void> _toggle(BookmarkStatus? status) async {
    if (_busy || status == null) return;
    setState(() => _busy = true);
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      final api = container.read(bookmarksApiProvider);
      if (status.bookmarked && status.bookmarkId != null) {
        await api.delete(status.bookmarkId!);
      } else {
        await api.create(targetKind: 'report', targetId: widget.reportId);
      }
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
      container
        ..invalidate(bookmarkStatusProvider(_target))
        ..invalidate(bookmarksProvider);
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(bookmarkStatusProvider(_target)).value;
    final saved = status?.bookmarked ?? false;
    return IconButton(
      tooltip: saved ? context.t('Remove bookmark') : context.t('Bookmark'),
      isSelected: saved,
      onPressed: _busy || status == null
          ? null
          : () => unawaited(_toggle(status)),
      // On the blue app bar: the filled icon says "saved", in the bar's
      // icon colour.
      icon: Icon(saved ? Icons.bookmark : Icons.bookmark_border),
    );
  }
}
