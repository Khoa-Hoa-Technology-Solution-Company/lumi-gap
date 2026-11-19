import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ProjectOutputsTab extends StatelessWidget {
  const ProjectOutputsTab({
    required this.projectId,
    required this.ref,
    super.key,
  });
  final String projectId;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final reportsQuery = ref.watch(
      reportsProvider(ReportsParams(projectId: projectId)),
    );
    final gapsQuery = ref.watch(
      gapsProvider(GapsListParams(projectId: projectId)),
    );
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Action card to generate a report
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: context.lumi.primary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            onPressed: () => unawaited(
              context.push('/reports?create=true&projectId=$projectId'),
            ),
            icon: Icon(Icons.add, color: context.lumi.onPrimary),
            label: Text(
              context.t('Generate Report'),
              style: TextStyle(
                color: context.lumi.onPrimary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Reports Expansion Section
        ExpansionTile(
          initiallyExpanded: true,
          leading: Icon(
            Icons.description_outlined,
            color: context.lumi.primary,
          ),
          title: Text(
            context.t('Reports'),
            style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,),
          ),
          children: [
            reportsQuery.when(
              data: (data) {
                if (data.reports.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      context.t('No analytical reports generated yet.'),
                      style: context.type.bodySmall!.copyWith(
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  );
                }
                return ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: data.reports.length,
                  itemBuilder: (context, idx) {
                    final report = data.reports[idx];
                    return Card(
                      elevation: 0,
                      margin: const EdgeInsets.only(bottom: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                        side: BorderSide(color: theme.dividerColor),
                      ),
                      child: ListTile(
                        title: Text(
                          report.topic ?? context.t('Dataset report'),
                          style: context.type.bodyMedium!.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text(
                          context.t('Status: {{status}} · {{query}}', {'status': report.status.toUpperCase(), 'query': report.query}),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.type.bodySmall,
                        ),
                        trailing: const Icon(Icons.chevron_right, size: 16),
                        onTap: () =>
                            unawaited(context.push('/report/${report.id}')),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (err, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  context.t('Error loading reports: {{err}}', {'err': err}),
                  style: TextStyle(color: context.lumi.error),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Gaps Expansion Section
        ExpansionTile(
          initiallyExpanded: true,
          leading: Icon(Icons.travel_explore, color: context.lumi.primary),
          title: Text(
            context.t('Discovered Research Gaps'),
            style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,),
          ),
          children: [
            gapsQuery.when(
              data: (data) {
                if (data.data.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      context.t('No research gaps found for this workspace.'),
                      style: context.type.bodySmall!.copyWith(
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  );
                }
                return ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: data.data.length,
                  itemBuilder: (context, idx) {
                    final gap = data.data[idx];
                    return Card(
                      elevation: 0,
                      margin: const EdgeInsets.only(bottom: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                        side: BorderSide(color: theme.dividerColor),
                      ),
                      child: ListTile(
                        title: Text(
                          gap.title,
                          style: context.type.bodyMedium!.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text(
                          context.t('{{percent}}% confidence · {{description}}', {'percent': (gap.confidence * 100).round(), 'description': gap.description}),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.type.bodySmall,
                        ),
                        trailing: const Icon(Icons.chevron_right, size: 16),
                        onTap: () => unawaited(context.push('/gaps')),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (err, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  context.t('Error loading gaps: {{err}}', {'err': err}),
                  style: TextStyle(color: context.lumi.error),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
