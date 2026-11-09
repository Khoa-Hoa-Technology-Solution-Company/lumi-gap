import 'package:flutter/material.dart';
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
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark ? const Color(0xFF1E293B) : Colors.white;

    final reportsAsync = ref.watch(
      reportsProvider(ReportsParams(projectId: projectId)),
    );
    final gapsAsync = ref.watch(
      gapsProvider(GapsListParams(projectId: projectId)),
    );

    final reportsCount = reportsAsync.maybeWhen(
      data: (d) => d.reports.length,
      orElse: () => 0,
    );
    final gapsCount = gapsAsync.maybeWhen(
      data: (d) => d.data.length,
      orElse: () => 0,
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          elevation: 0,
          margin: EdgeInsets.zero,
          color: theme.cardColor,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: theme.dividerColor),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  project.title,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (project.description != null &&
                    project.description!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    project.description!,
                    style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Workspace counters Grid
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.8,
          children: [
            _buildCounterCard(
              context,
              'Papers',
              project.papers.length.toString(),
              Icons.article_outlined,
              const Color(0xFF06B6D4),
            ),
            _buildCounterCard(
              context,
              'Team Members',
              project.members.length.toString(),
              Icons.people_outline,
              const Color(0xFF22C55E),
            ),
            _buildCounterCard(
              context,
              'Reports',
              reportsCount.toString(),
              Icons.description_outlined,
              const Color(0xFFA78BFA),
            ),
            _buildCounterCard(
              context,
              'Gaps Detected',
              gapsCount.toString(),
              Icons.bolt_outlined,
              const Color(0xFFF59E0B),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Add Papers CTA Card
        Card(
          elevation: 0,
          color: const Color(0xFF06B6D4).withValues(alpha: 0.08),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFF06B6D4), width: 1.5),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(
                  Icons.add_circle_outline,
                  color: Color(0xFF06B6D4),
                  size: 24,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Ground Your Research',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        'Add publications to power grounding reports, chat, and gap detection.',
                        style: TextStyle(
                          fontSize: 11,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF06B6D4),
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
                  child: const Text(
                    'Add',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Activity log snapshot
        const Text(
          'Workspace Activity Log',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
        ),
        const SizedBox(height: 10),
        Card(
          elevation: 0,
          color: cardBg,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: theme.dividerColor),
          ),
          child: const Padding(
            padding: EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(
                  Icons.history_toggle_off,
                  color: Color(0xFF94A3B8),
                  size: 18,
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Workspace initialized and ready for research.',
                    style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
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
        borderRadius: BorderRadius.circular(14),
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
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10,
                      color: Color(0xFF94A3B8),
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
