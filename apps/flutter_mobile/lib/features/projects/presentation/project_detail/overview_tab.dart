import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/project_header.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The overview under the project header: the one next step the data
/// supports, then the latest papers. The counts live in the header.
class ProjectOverviewTab extends StatelessWidget {
  const ProjectOverviewTab({
    required this.project,
    required this.projectId,
    required this.ref,
    super.key,
  });

  final ProjectView project;
  final String projectId;
  final WidgetRef ref;

  /// How many papers the overview lists before "View all".
  static const int recentPapersLimit = 3;

  @override
  Widget build(BuildContext context) {
    final reports = ref.watch(projectReportsCountProvider(projectId));
    void tab(int i) => DefaultTabController.of(context).animateTo(i);

    // One next step, from what is known. No papers: add some (nothing else
    // works without them). Papers but no report: generate one. Otherwise
    // ask the assistant. While the report count is unknown, no guess.
    final _NextStep? next;
    if (project.paperCount == 0) {
      next = _NextStep(
        title: context.t('Ground your research'),
        body: context.t('Add publications to power grounding reports, chat, and gap detection.'),
        action: context.t('Search publications'),
        onPressed: () => unawaited(context.push('/search')),
      );
    } else if (reports.hasValue && reports.requireValue == 0) {
      next = _NextStep(
        title: context.t('Generate your first report'),
        body: context.t(
          'Turn the papers of this project into an analytical report.',
        ),
        action: context.t('Generate report'),
        onPressed: () => tab(ProjectTabs.outputs),
      );
    } else if (reports.hasValue) {
      next = _NextStep(
        title: context.t('Ask about your papers'),
        body: context.t('The AI assistant answers from the papers in this project.'),
        action: context.t('Open chat'),
        onPressed: () => tab(ProjectTabs.chat),
      );
    } else {
      next = null;
    }

    final recent = project.papers.take(recentPapersLimit).toList();

    return RefreshIndicator(
      onRefresh: () async {
        ref
          ..invalidate(projectProvider(projectId))
          ..invalidate(reportsProvider(ReportsParams(projectId: projectId)))
          ..invalidate(gapsProvider(GapsListParams(projectId: projectId)));
        await ref.read(projectProvider(projectId).future);
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          if (next != null) ...[
            _NextStepCard(step: next),
            const SizedBox(height: 20),
          ],
          if (recent.isNotEmpty) ...[
            LumiSectionHeader(
              title: context.t('Recent papers'),
              actionLabel: project.papers.length > recent.length
                  ? context.t('View all')
                  : null,
              onAction: project.papers.length > recent.length
                  ? () => tab(ProjectTabs.papers)
                  : null,
            ),
            LumiRowGroup(
              children: [
                for (final paper in recent)
                  LumiListRow(
                    icon: Icons.article_outlined,
                    iconInTile: true,
                    title: paper.title,
                    subtitle: context.t(
                      'Year: {{year}} · Citations: {{citations}}',
                      {
                        'year': paper.publicationYear ?? context.t('N/A'),
                        'citations': paper.citationCount ?? 0,
                      },
                    ),
                    onTap: () => unawaited(context.push('/paper/${paper.id}')),
                  ),
              ],
            ),
          ],
          // No activity log: the API sends none, and a fixed sentence here
          // would read as one.
        ],
      ),
    );
  }
}

class _NextStep {
  const _NextStep({
    required this.title,
    required this.body,
    required this.action,
    required this.onPressed,
  });

  final String title;
  final String body;
  final String action;
  final VoidCallback onPressed;
}

class _NextStepCard extends StatelessWidget {
  const _NextStepCard({required this.step});

  final _NextStep step;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('Next step'),
            style: theme.textTheme.labelLarge?.copyWith(
              color: lumi.foregroundSecondary,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Semantics(
            header: true,
            child: Text(
              step.title,
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            step.body,
            style: theme.textTheme.bodyMedium?.copyWith(color: lumi.foregroundSecondary),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: step.onPressed, child: Text(step.action)),
        ],
      ),
    );
  }
}
