import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cardBg = context.lumi.surface;

    final reportsAsync = ref.watch(
      reportsProvider(ReportsParams(projectId: projectId)),
    );
    final gapsAsync = ref.watch(
      gapsProvider(GapsListParams(projectId: projectId)),
    );

    // A count is only shown once it is known: "0" while loading or after a
    // failed request would state something false. A dash means "not known".
    final reportsCount = reportsAsync.hasValue
        ? reportsAsync.requireValue.reports.length.toString()
        : '—';
    final gapsCount = gapsAsync.hasValue
        ? gapsAsync.requireValue.data.length.toString()
        : '—';
    final description = project.description?.trim() ?? '';
    final isOwner = project.viewerIsOwner;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // The app bar cuts a long title to one line; here it is in full,
        // with the viewer's role and what the project is about.
        LumiCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(project.title, style: theme.textTheme.titleLarge),
              if (isOwner != null) ...[
                const SizedBox(height: 8),
                LumiChip(
                  label: isOwner ? context.t('Owner') : context.t('Member'),
                  tone: isOwner ? LumiChipTone.primary : LumiChipTone.neutral,
                ),
              ],
              const SizedBox(height: 12),
              Text(
                description.isEmpty
                    ? context.t('No description yet.')
                    : description,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.lumi.foregroundSecondary,
                  fontStyle:
                      description.isEmpty ? FontStyle.italic : FontStyle.normal,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Workspace counters Grid
        GridView(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            // A fixed height, not a ratio: a ratio makes the tiles too short
            // on a 320dp screen. It grows with the text size setting.
            mainAxisExtent: 28 + MediaQuery.textScalerOf(context).scale(48),
          ),
          children: [
            _buildCounterCard(
              context,
              context.t('Papers'),
              project.paperCount.toString(),
              Icons.article_outlined,
              context.lumi.primary,
            ),
            _buildCounterCard(
              context,
              context.t('Team Members'),
              project.memberCount.toString(),
              Icons.people_outline,
              context.lumi.primary,
            ),
            _buildCounterCard(
              context,
              context.t('Reports'),
              reportsCount,
              Icons.description_outlined,
              context.lumi.primary,
            ),
            _buildCounterCard(
              context,
              context.t('Gaps Detected'),
              gapsCount,
              Icons.travel_explore,
              context.lumi.primary,
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Add Papers CTA Card
        Card(
          elevation: 0,
          color: context.lumi.primarySoft,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: BorderSide(color: context.lumi.primary, width: 1.5),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(
                  Icons.add_circle_outline,
                  color: context.lumi.primary,
                  size: 24,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        context.t('Ground Your Research'),
                        style: context.type.bodyMedium!.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        context.t('Add publications to power grounding reports, chat, and gap detection.'),
                        style: context.type.bodySmall!.copyWith(
                          // On `primarySoft`: `muted` is under 4.5:1 there.
                          color: context.lumi.foregroundSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: context.lumi.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                  ),
                  onPressed: () => DefaultTabController.of(
                    context,
                  ).animateTo(1), // Go to Papers Tab
                  child: Text(
                    context.t('Add'),
                    style: context.type.bodySmall!.copyWith(
                      color: context.lumi.onPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Activity log snapshot
        Text(
          context.t('Workspace Activity Log'),
          style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,),
        ),
        const SizedBox(height: 10),
        Card(
          elevation: 0,
          color: cardBg,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: BorderSide(color: theme.dividerColor),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(
                  Icons.history_toggle_off,
                  color: context.lumi.muted,
                  size: 18,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    context.t('Workspace initialized and ready for research.'),
                    style: context.type.bodySmall!.copyWith( fontStyle: FontStyle.italic),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCounterCard(
    BuildContext context,
    String label,
    String count,
    IconData icon,
    Color color,
  ) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: theme.cardColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: theme.dividerColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    count,
                    style: context.type.bodyLarge!.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.type.bodySmall!.copyWith(
                      color: context.lumi.muted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
