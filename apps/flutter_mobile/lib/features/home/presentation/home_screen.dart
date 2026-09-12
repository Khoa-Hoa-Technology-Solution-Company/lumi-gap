import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/core/widgets/paper_card.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/rankings/domain/level_helper.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  Future<void> _toggleBookmark(String paperId) async {
    final api = ref.read(bookmarksApiProvider);
    final status = await api.checkStatus('paper', paperId);
    if (status.bookmarked && status.bookmarkId != null) {
      await api.delete(status.bookmarkId!);
    } else {
      await api.create(targetKind: 'paper', targetId: paperId);
    }
    ref
      ..invalidate(bookmarksProvider)
      ..invalidate(bookmarkStatusProvider(BookmarkTarget('paper', paperId)));
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final papers = ref.watch(
      papersProvider(const PapersListParams(pageSize: 5)),
    );
    final trends = ref.watch(
      trendsOverviewProvider(
        const TrendsOverviewParams(limit: 4, minPapers: 1, sortBy: 'momentum'),
      ),
    );

    final projects = ref.watch(projectsProvider);
    final reports = ref.watch(
      reportsProvider(const ReportsParams(pageSize: 2)),
    );

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final userPoints = user?.points ?? 0;
    final userLevel = LevelHelper.getLevel(userPoints);
    final levelAsset = LevelHelper.getLevelAsset(userLevel);

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(papersProvider(const PapersListParams(pageSize: 5)))
            ..invalidate(
              trendsOverviewProvider(
                const TrendsOverviewParams(
                  limit: 4,
                  minPapers: 1,
                  sortBy: 'momentum',
                ),
              ),
            )
            ..invalidate(projectsProvider)
            ..invalidate(
              reportsProvider(const ReportsParams(pageSize: 2)),
            );
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
          children: [
            Row(
              children: [
                IconButton.filledTonal(
                  onPressed: () => _showHomeMenu(context),
                  icon: const Icon(Icons.menu),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hi, ${user?.fullName.split(' ').first ?? 'Researcher'}',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                          fontSize: 22,
                        ),
                      ),
                      Text(
                        'Your mobile research companion',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 44,
                  height: 44,
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: theme.cardColor,
                    shape: BoxShape.circle,
                    border: Border.all(color: theme.dividerColor),
                  ),
                  child: Image.asset(
                    levelAsset,
                    fit: BoxFit.contain,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Search Bar acting as Tap navigation
            GestureDetector(
              onTap: () => context.push('/search'),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: theme.cardColor,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: theme.dividerColor),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.search,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'Search publications, keywords...',
                      style: TextStyle(
                        color: theme.colorScheme.onSurfaceVariant.withValues(
                          alpha: 0.6,
                        ),
                      ),
                    ),
                    const Spacer(),
                    Icon(Icons.tune, color: theme.colorScheme.onSurfaceVariant),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Quick Actions Grid (2x2)
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.6,
              children: [
                _buildQuickActionCard(
                  title: 'Search Papers',
                  icon: Icons.search,
                  color: const Color(0xFF06B6D4),
                  onTap: () => context.push('/search'),
                  isDark: isDark,
                ),
                _buildQuickActionCard(
                  title: 'Generate Report',
                  icon: Icons.description,
                  color: const Color(0xFFA78BFA),
                  onTap: () => context.push('/reports?create=true'),
                  isDark: isDark,
                ),
                _buildQuickActionCard(
                  title: 'View Trends',
                  icon: Icons.trending_up,
                  color: const Color(0xFF22C55E),
                  onTap: () => context.push('/trends'),
                  isDark: isDark,
                ),
                _buildQuickActionCard(
                  title: 'Open Projects',
                  icon: Icons.folder,
                  color: const Color(0xFFF59E0B),
                  onTap: () => context.push('/projects'),
                  isDark: isDark,
                ),
              ],
            ),

            // Continue Research
            _buildContinueResearch(projects, reports, isDark, theme),

            // Research Pulse
            trends.when(
              data: (data) => _buildPulseHighlights(data, isDark, theme),
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
            ),

            const SizedBox(height: 24),
            _SectionTitle(
              title: 'Trending topics',
              action: 'View all',
              onTap: () => context.push('/trends'),
            ),
            const SizedBox(height: 8),
            trends.when(
              data: (data) => SizedBox(
                height: 145,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: data.topics.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (context, index) {
                    final topic = data.topics[index];
                    return SizedBox(
                      width: 176,
                      child: Card(
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                          side: BorderSide(color: theme.dividerColor),
                        ),
                        color: theme.cardColor,
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                topic.topic,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Icon(
                                    topic.momentum >= 0
                                        ? Icons.arrow_outward
                                        : Icons.south_east,
                                    size: 13,
                                    color: topic.momentum >= 0
                                        ? const Color(0xFF22C55E)
                                        : const Color(0xFFF59E0B),
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    '${topic.growthRatePct.round()}% growth',
                                    style: TextStyle(
                                      color: topic.momentum >= 0
                                          ? const Color(0xFF22C55E)
                                          : const Color(0xFFF59E0B),
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                              const Spacer(),
                              Sparkline(points: topic.yearlyBreakdown),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              loading: () => const AppLoading(message: 'Loading trends...'),
              error: (error, _) => AppErrorState(message: error.toString()),
            ),
            const SizedBox(height: 24),
            Text(
              'Recent papers',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            papers.when(
              data: (data) {
                if (data.papers.isEmpty) {
                  return const AppEmptyState(
                    icon: Icons.article_outlined,
                    title: 'No papers found',
                    message: 'Try another query or sync more papers.',
                  );
                }
                return Column(
                  children: data.papers.map((paper) {
                    final authors = paper.authors
                        .map((author) => author.displayName)
                        .join(', ');
                    return PaperCard(
                      id: paper.id,
                      title: paper.title,
                      authors: authors.isEmpty ? 'Unknown authors' : authors,
                      venueAndYear:
                          '${paper.journalName ?? 'Unknown venue'} - ${paper.publicationYear} - ${paper.citationCount} cites',
                      score: paper.dataQualityScore.toStringAsFixed(2),
                      onTap: () => context.push('/paper/${paper.id}'),
                      onBookmarkTap: () => _toggleBookmark(paper.id),
                    );
                  }).toList(),
                );
              },
              loading: () => const AppLoading(message: 'Loading papers...'),
              error: (error, _) => AppErrorState(message: error.toString()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickActionCard({
    required String title,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(height: 8),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPulseHighlights(
    TrendsOverview trendsData,
    bool isDark,
    ThemeData theme,
  ) {
    final highlights = trendsData.topics.take(2).toList();
    if (highlights.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 24),
        const Row(
          children: [
            Icon(Icons.bolt, color: Color(0xFFF59E0B), size: 18),
            SizedBox(width: 8),
            Text(
              'Research Pulse',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...highlights.map((topic) {
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : Colors.white,
              border: Border.all(color: theme.dividerColor),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.trending_up,
                  color: Color(0xFF22C55E),
                  size: 16,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Topic "${topic.topic}" is growing rapidly with growth rate of ${topic.growthRatePct.toStringAsFixed(1)}%.',
                    style: const TextStyle(fontSize: 12, height: 1.3),
                  ),
                ),
                TextButton(
                  onPressed: () => context.push('/trends'),
                  child: const Text('View', style: TextStyle(fontSize: 11)),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildContinueResearch(
    AsyncValue<List<ProjectView>> projectsQuery,
    AsyncValue<ReportsList> reportsQuery,
    bool isDark,
    ThemeData theme,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 24),
        const Text(
          'Continue Research',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 10),
        projectsQuery.when(
          data: (projects) {
            if (projects.isEmpty) return const SizedBox.shrink();
            final recent = projects.first;
            return Card(
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: theme.dividerColor),
              ),
              child: ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF06B6D4).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.folder,
                    color: Color(0xFF06B6D4),
                    size: 18,
                  ),
                ),
                title: Text(
                  'Workspace: ${recent.title}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                subtitle: Text(
                  '${recent.papers.length} papers · ${recent.members.length} members',
                  style: const TextStyle(fontSize: 11),
                ),
                trailing: const Icon(Icons.chevron_right, size: 16),
                onTap: () => context.push('/project/${recent.id}'),
              ),
            );
          },
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
        ),
        reportsQuery.when(
          data: (reportsList) {
            if (reportsList.reports.isEmpty) return const SizedBox.shrink();
            final recentReport = reportsList.reports.first;
            return Card(
              elevation: 0,
              margin: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: theme.dividerColor),
              ),
              child: ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.description,
                    color: Color(0xFF8B5CF6),
                    size: 18,
                  ),
                ),
                title: Text(
                  'Report: ${recentReport.topic ?? "Untitled"}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                subtitle: Text(
                  'Status: ${recentReport.status.toUpperCase()}',
                  style: const TextStyle(fontSize: 11),
                ),
                trailing: const Icon(Icons.chevron_right, size: 16),
                onTap: () => context.push('/report/${recentReport.id}'),
              ),
            );
          },
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
        ),
      ],
    );
  }

  void _showHomeMenu(BuildContext context) {
    final items = [
      (
        'Submit Paper',
        Icons.upload_file,
        '/submit-paper',
        const Color(0xFF06B6D4),
      ),
      ('AI Reports', Icons.description, '/reports', const Color(0xFFA78BFA)),
      ('Ranks', Icons.emoji_events, '/rankings', const Color(0xFFA5B4FC)),
      ('Trends', Icons.trending_up, '/trends', const Color(0xFF22C55E)),
      ('Gaps', Icons.bolt, '/gaps', const Color(0xFFF59E0B)),
      ('Projects', Icons.folder, '/projects', const Color(0xFF06B6D4)),
      ('My Papers', Icons.archive, '/my-papers', const Color(0xFF38BDF8)),
    ];
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        builder: (context) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Menu',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              const Divider(),
              Expanded(
                child: ListView(
                  shrinkWrap: true,
                  children: items
                      .map(
                        (item) => ListTile(
                          leading: Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: item.$4.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(item.$2, color: item.$4, size: 18),
                          ),
                          title: Text(
                            item.$1,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () {
                            Navigator.pop(context);
                            unawaited(context.push(item.$3));
                          },
                        ),
                      )
                      .toList(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class Sparkline extends StatelessWidget {
  const Sparkline({required this.points, super.key});
  final List<YearlyCount> points;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) return const SizedBox(height: 32);
    final maxCount = points.map((p) => p.count).reduce((a, b) => a > b ? a : b);
    final max = maxCount > 0 ? maxCount : 1;

    // Slice last 7 points
    final lastPoints = points.length > 7
        ? points.sublist(points.length - 7)
        : points;

    return SizedBox(
      height: 32,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: lastPoints.map((point) {
          final heightRatio = point.count / max;
          final barHeight = (heightRatio * 32).clamp(8.0, 32.0);
          final opacity = (0.35 + heightRatio * 0.55).clamp(0.0, 1.0);
          return Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 2),
              height: barHeight,
              decoration: BoxDecoration(
                color: const Color(0xFF8B5CF6).withValues(alpha: opacity),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.title,
    required this.action,
    required this.onTap,
  });

  final String title;
  final String action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
        ),
        TextButton(onPressed: onTap, child: Text(action)),
      ],
    );
  }
}
