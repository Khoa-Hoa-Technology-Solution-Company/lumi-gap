import 'dart:async';

import 'package:flutter/material.dart';
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
              backgroundColor: const Color(0xFF06B6D4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            onPressed: () => unawaited(
              context.push('/reports?create=true&projectId=$projectId'),
            ),
            icon: const Icon(Icons.add, color: Colors.white),
            label: const Text(
              'Generate RAG Report',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Reports Expansion Section
        ExpansionTile(
          initiallyExpanded: true,
          leading: const Icon(
            Icons.description_outlined,
            color: Color(0xFFA78BFA),
          ),
          title: const Text(
            'RAG Analytical Reports',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          children: [
            reportsQuery.when(
              data: (data) {
                if (data.reports.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'No analytical reports generated yet.',
                      style: TextStyle(
                        fontStyle: FontStyle.italic,
                        fontSize: 12,
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
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: theme.dividerColor),
                      ),
                      child: ListTile(
                        title: Text(
                          report.topic ?? 'Dataset report',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: Text(
                          'Status: ${report.status.toUpperCase()} · ${report.query}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11),
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
                  'Error loading reports: $err',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Gaps Expansion Section
        ExpansionTile(
          initiallyExpanded: true,
          leading: const Icon(Icons.bolt_outlined, color: Color(0xFFF59E0B)),
          title: const Text(
            'Discovered Research Gaps',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          children: [
            gapsQuery.when(
              data: (data) {
                if (data.data.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'No research gaps found for this workspace.',
                      style: TextStyle(
                        fontStyle: FontStyle.italic,
                        fontSize: 12,
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
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: theme.dividerColor),
                      ),
                      child: ListTile(
                        title: Text(
                          gap.title,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: Text(
                          '${(gap.confidence * 100).round()}% confidence · ${gap.description}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11),
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
                  'Error loading gaps: $err',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
