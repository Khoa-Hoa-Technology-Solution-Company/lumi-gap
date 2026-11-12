import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

// Legacy tab retained while the combined Reports & Gaps mobile tab is active.
class ProjectReportsTab extends StatelessWidget {
  const ProjectReportsTab({
    required this.projectId,
    required this.ref,
    super.key,
  });
  final String projectId;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(
      reportsProvider(ReportsParams(projectId: projectId)),
    );

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
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
              label: Text(
                context.t('Generate RAG Report'),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ),
        Expanded(
          child: query.when(
            data: (data) {
              if (data.reports.isEmpty) {
                return Center(
                  child: Text(
                    context.t('No analytical reports generated yet.'),
                    style: const TextStyle(fontStyle: FontStyle.italic),
                  ),
                );
              }
              return ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: data.reports.length,
                itemBuilder: (context, idx) {
                  final report = data.reports[idx];
                  return Card(
                    elevation: 0,
                    margin: const EdgeInsets.only(bottom: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: Theme.of(context).dividerColor),
                    ),
                    child: ListTile(
                      title: Text(
                        report.topic ?? context.t('Dataset report'),
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                      subtitle: Text(
                        report.query,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11),
                      ),
                      trailing: Text(
                        report.status.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF06B6D4),
                        ),
                      ),
                      onTap: () =>
                          unawaited(context.push('/report/${report.id}')),
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, _) => Center(
              child: Text(
                context.t('Error loading reports: {{err}}', {'err': err}),
                style: const TextStyle(color: Colors.red),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
