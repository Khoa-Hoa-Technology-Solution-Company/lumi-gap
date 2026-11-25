import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_action_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_confirm_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
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
            context.t('Report status'),
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
                    label: Text(context.t('View full report')),
                  ),
                ),
                const SizedBox(width: 12),
              ],
              OutlinedButton(
                onPressed: onNewReport,
                child: Text(context.t('New report')),
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
/// The reader's reports as grouped rows. A ready report opens its page; one
/// still being made opens its progress. Deleting asks first (a report cost
/// a generation run) and is a button, never a swipe.
class MyReportsList extends StatelessWidget {
  const MyReportsList({
    required this.reports,
    required this.selectedId,
    required this.onOpen,
    required this.onFollow,
    required this.onDelete,
    this.deleting = const {},
    super.key,
  });

  final List<ReportListItem> reports;
  final String? selectedId;
  final ValueChanged<String> onOpen;
  final ValueChanged<String> onFollow;
  final Future<void> Function(String id) onDelete;

  /// Reports whose deletion is in flight: their button is off.
  final Set<String> deleting;

  Future<void> _confirmDelete(BuildContext context, String id) async {
    final ok = await showLumiConfirmSheet(
      context,
      title: context.t('Delete report'),
      message: context.t('Delete this report? This cannot be undone.'),
      confirmText: context.t('Delete'),
      destructive: true,
    );
    if (ok ?? false) await onDelete(id);
  }

  void _open(ReportListItem report) =>
      ReportState.parse(report.status) == ReportState.ready
          ? onOpen(report.id)
          : onFollow(report.id);

  /// The row's actions (long-press or the overflow button): open it, or
  /// delete it after a confirmation (a report delete cannot be undone).
  Future<void> _showActions(BuildContext context, ReportListItem report) async {
    final action = await showLumiActionSheet<String>(
      context,
      title: report.topic ?? report.query,
      actions: [
        LumiSheetAction(
          value: 'open',
          label: context.t('Open'),
          icon: Icons.open_in_new,
        ),
        LumiSheetAction(
          value: 'delete',
          label: context.t('Delete report'),
          icon: Icons.delete_outline,
          destructive: true,
          enabled: !deleting.contains(report.id),
        ),
      ],
    );
    if (!context.mounted) return;
    switch (action) {
      case 'open':
        _open(report);
      case 'delete':
        await _confirmDelete(context, report.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return LumiRowGroup(
      children: [
        for (final report in reports)
          InkWell(
            onTap: () => _open(report),
            onLongPress: () {
              unawaited(Haptics.select());
              unawaited(_showActions(context, report));
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
                          style: theme.textTheme.titleMedium,
                        ),
                        if (report.topic != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            report.query,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: lumi.foregroundSecondary),
                          ),
                        ],
                        const SizedBox(height: 8),
                        ReportStatusLabel(status: report.status),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: context.t('More report actions'),
                    onPressed: () => unawaited(_showActions(context, report)),
                    icon: Icon(
                      Icons.more_vert,
                      color: lumi.foregroundSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
