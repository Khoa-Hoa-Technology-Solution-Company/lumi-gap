import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Legacy tab retained while the combined Reports & Gaps mobile tab is active.
class ProjectGapsTab extends StatelessWidget {
  const ProjectGapsTab({required this.projectId, required this.ref, super.key});
  final String projectId;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(gapsProvider(GapsListParams(projectId: projectId)));

    return query.when(
      data: (data) {
        if (data.data.isEmpty) {
          return Center(
            child: Text(
              context.t('No research gaps found for this workspace.'),
              style: const TextStyle(fontStyle: FontStyle.italic),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: data.data.length,
          itemBuilder: (context, idx) {
            final gap = data.data[idx];
            return Card(
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: Theme.of(context).dividerColor),
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
                  gap.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
                trailing: Text(
                  context.t('{{percent}}% conf', {'percent': (gap.confidence * 100).round()}),
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(
        child: Text(
          context.t('Error loading gaps: {{err}}', {'err': err}),
          style: const TextStyle(color: Colors.red),
        ),
      ),
    );
  }
}
