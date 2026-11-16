import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
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
                borderRadius: BorderRadius.circular(8),
                side: BorderSide(color: Theme.of(context).dividerColor),
              ),
              child: ListTile(
                title: Text(
                  gap.title,
                  style: context.type.bodyMedium!.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: Text(
                  gap.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: context.type.bodySmall,
                ),
                trailing: Text(
                  context.t('{{percent}}% conf', {'percent': (gap.confidence * 100).round()}),
                  style: context.type.bodySmall!.copyWith(
                    fontWeight: FontWeight.w600,
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
          style: TextStyle(color: context.lumi.error),
        ),
      ),
    );
  }
}
