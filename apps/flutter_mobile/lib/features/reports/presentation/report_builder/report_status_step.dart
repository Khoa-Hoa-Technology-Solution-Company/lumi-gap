import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/confirm_dialog.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/swipe_delete_tile.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_status.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Step 4: the report being generated. What it says follows the state, so
/// a failed report never reads "the worker is writing".
class ReportStatusStep extends StatelessWidget {
  const ReportStatusStep({
    required this.report,
    required this.onNewReport,
    required this.onRetry,
    super.key,
  });

  /// Null when no report is selected.
  final AsyncValue<AnalyticalReport>? report;
  final VoidCallback onNewReport;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final value = report;
    if (value == null) {
      return LumiCard(
        child: Text(
          context.t('No active report selected to monitor.'),
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: lumi.foregroundSecondary),
        ),
      );
    }
    if (!value.hasValue) {
      return value.hasError
          ? LumiErrorState(
              message: context.t(failureMessageKey(value.error!)),
              retrying: value.isLoading,
              onRetry: onRetry,
              inline: true,
            )
          : const LumiSkeleton(rows: 1, height: 160);
    }

    final r = value.requireValue;
    final state = ReportState.parse(r.status);
    final preview = r.markdown?.trim() ?? '';
    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('Step 4: Report Generation Status'),
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          Text(
            r.topic ?? r.query,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          ReportStatusLabel(status: r.status),
          const SizedBox(height: 12),
          switch (state) {
            ReportState.failed => Text(
                (r.errorMessage ?? '').trim().isEmpty
                    ? context.t('The report could not be generated.')
                    : r.errorMessage!,
                style: theme.textTheme.bodyMedium?.copyWith(color: lumi.error),
              ),
            ReportState.ready => Text(
                preview,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: lumi.foregroundSecondary, height: 1.5),
              ),
            _ => Text(
                context.t(
                  'Background worker is compiling bibliography and writing analysis...',
                ),
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: lumi.foregroundSecondary),
              ),
          },
          const SizedBox(height: 16),
          Row(
            children: [
              if (state == ReportState.ready) ...[
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () =>
                        unawaited(context.push('/report/${r.id}')),
                    icon: const Icon(Icons.visibility_outlined, size: 18),
                    label: Text(context.t('View Full Report')),
                  ),
                ),
                const SizedBox(width: 12),
              ],
              OutlinedButton(
                onPressed: onNewReport,
                child: Text(context.t('New Report')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The reader's reports, newest from the API first. A ready report opens;
/// one still running is followed in step 4.
class MyReportsList extends StatelessWidget {
  const MyReportsList({
    required this.reports,
    required this.selectedId,
    required this.onOpen,
    required this.onFollow,
    required this.onDelete,
    super.key,
  });

  final List<ReportListItem> reports;
  final String? selectedId;
  final ValueChanged<String> onOpen;
  final ValueChanged<String> onFollow;
  final Future<void> Function(String id) onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    if (reports.isEmpty) {
      return LumiEmptyState(
        icon: Icons.description_outlined,
        title: context.t('No reports yet'),
        message: context.t('Create one above.'),
        compact: true,
      );
    }
    return Column(
      children: [
        for (final report in reports)
          SwipeDeleteTile(
            tileKey: ValueKey(report.id),
            margin: const EdgeInsets.only(bottom: 12),
            borderRadius: BorderRadius.circular(8),
            // A report cost a generation run: ask before it is gone.
            confirmDelete: () async =>
                await ConfirmDialog.show(
                  context,
                  title: context.t('Delete report'),
                  message: context.t(
                    'Delete this report? This cannot be undone.',
                  ),
                  confirmText: context.t('Delete'),
                  isDestructive: true,
                ) ??
                false,
            onDelete: () => unawaited(onDelete(report.id)),
            child: Material(
              color: selectedId == report.id ? lumi.primarySoft : lumi.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: BorderSide(
                  color: selectedId == report.id ? lumi.primary : lumi.line,
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => ReportState.parse(report.status) == ReportState.ready
                    ? onOpen(report.id)
                    : onFollow(report.id),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: lumi.primarySoft,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          Icons.description_outlined,
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
                              report.topic ?? report.query,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.titleSmall,
                            ),
                            if (report.topic != null) ...[
                              const SizedBox(height: 2),
                              Text(
                                report.query,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: lumi.foregroundSecondary,
                                ),
                              ),
                            ],
                            const SizedBox(height: 8),
                            ReportStatusLabel(status: report.status),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
