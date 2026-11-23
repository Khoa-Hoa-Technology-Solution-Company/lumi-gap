import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_card.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_detail_sheet.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_status.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// What the project produced: its reports (each with its real state) and
/// the research gaps found in it. A gap opens its own sheet, where its
/// review state can be changed, as on the Gaps screen.
class ProjectOutputsTab extends StatelessWidget {
  const ProjectOutputsTab({
    required this.projectId,
    required this.ref,
    super.key,
  });
  final String projectId;
  final WidgetRef ref;

  ReportsParams get _reports => ReportsParams(projectId: projectId);
  GapsListParams get _gaps => GapsListParams(projectId: projectId);

  Future<void> _changeGapStatus(
    ScaffoldMessengerState messenger,
    AppLocale locale,
    String id,
    String status,
  ) async {
    try {
      await ref.read(gapsApiProvider).patchStatus(id, status);
    } on Object catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(translate(failureMessageKey(e), locale))),
      );
    } finally {
      // Every gap list: the gap moved between review states.
      ref.invalidate(gapsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final reportsQuery = ref.watch(reportsProvider(_reports));
    final gapsQuery = ref.watch(gapsProvider(_gaps));

    final Widget reports;
    if (reportsQuery.hasValue) {
      final items = reportsQuery.requireValue.reports;
      reports = items.isEmpty
          ? LumiEmptyState(
              icon: Icons.description_outlined,
              message: context.t('No analytical reports generated yet.'),
              compact: true,
            )
          : LumiRowGroup(
              children: [
                for (final report in items)
                  LumiListRow(
                    icon: Icons.description_outlined,
                    iconInTile: true,
                    title: report.topic ?? context.t('Dataset report'),
                    subtitle: report.query,
                    trailing: ReportStatusLabel(status: report.status),
                    onTap: () => unawaited(context.push('/report/${report.id}')),
                  ),
              ],
            );
    } else if (reportsQuery.hasError) {
      reports = LumiErrorState(
        inline: true,
        message: context.t(failureMessageKey(reportsQuery.error!)),
        retrying: reportsQuery.isLoading,
        onRetry: () => ref.invalidate(reportsProvider(_reports)),
      );
    } else {
      reports = const LumiSkeleton(height: 64);
    }

    final Widget gaps;
    if (gapsQuery.hasValue) {
      final items = gapsQuery.requireValue.data;
      gaps = items.isEmpty
          ? LumiEmptyState(
              icon: Icons.lightbulb_outline,
              message: context.t('No research gaps found for this workspace.'),
              compact: true,
            )
          : LumiRowGroup(
              children: [
                for (final gap in items)
                  LumiListRow(
                    icon: Icons.lightbulb_outline,
                    iconInTile: true,
                    title: gap.title,
                    subtitle: context.t('Gap confidence: {{level}}', {
                      'level': context.t(gapConfidenceLabel(gap.gapConfidence)),
                    }),
                    onTap: () {
                      final messenger = ScaffoldMessenger.of(context);
                      final locale = context.appLocale;
                      unawaited(
                        showGapDetailSheet(
                          context,
                          gap: gap,
                          onStatusChange: (s) => unawaited(
                            _changeGapStatus(messenger, locale, gap.id, s),
                          ),
                        ),
                      );
                    },
                  ),
              ],
            );
    } else if (gapsQuery.hasError) {
      gaps = LumiErrorState(
        inline: true,
        message: context.t(failureMessageKey(gapsQuery.error!)),
        retrying: gapsQuery.isLoading,
        onRetry: () => ref.invalidate(gapsProvider(_gaps)),
      );
    } else {
      gaps = const LumiSkeleton(height: 64);
    }

    return RefreshIndicator(
      onRefresh: () async {
        ref
          ..invalidate(reportsProvider(_reports))
          ..invalidate(gapsProvider(_gaps));
        await ref.read(reportsProvider(_reports).future);
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          FilledButton.icon(
            onPressed: () => unawaited(
              context.push('/reports?create=true&projectId=$projectId'),
            ),
            icon: const Icon(Icons.add),
            label: Text(context.t('Generate report')),
          ),
          const SizedBox(height: 20),
          LumiSectionHeader(title: context.t('Reports')),
          reports,
          const SizedBox(height: 24),
          LumiSectionHeader(title: context.t('Discovered research gaps')),
          gaps,
        ],
      ),
    );
  }
}
