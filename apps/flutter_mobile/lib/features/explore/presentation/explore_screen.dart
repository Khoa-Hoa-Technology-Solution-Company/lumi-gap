import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/notification_bell.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_trend_list.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Explore tab: search entry on top, the analysis tools in one card, then the
/// topics that are moving right now.
class ExploreScreen extends ConsumerWidget {
  const ExploreScreen({super.key});

  /// How many trending topics the tab shows; "View all" opens the rest.
  static const int trendingLimit = 5;

  static final entries = <ExploreEntry>[
    ExploreEntry(
      icon: Icons.trending_up,
      title: tk('Trends'),
      description: tk('Topics rising or falling by year'),
      route: '/trends',
    ),
    ExploreEntry(
      icon: Icons.description_outlined,
      title: tk('Reports'),
      description: tk('Analytical reports with evidence'),
      route: '/reports',
    ),
    ExploreEntry(
      icon: Icons.query_stats,
      title: tk('Research gaps'),
      description: tk('Open research directions by topic'),
      route: '/gaps',
    ),
    ExploreEntry(
      icon: Icons.emoji_events_outlined,
      title: tk('Leaderboard'),
      description: tk('Rank and contribution points'),
      route: '/rankings',
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final overview = ref.watch(homeOverviewProvider);

    final Widget trending;
    String? trendingCaption;
    if (overview.hasValue) {
      final topics =
          overview.requireValue.topics.take(trendingLimit).toList();
      if (topics.isEmpty) {
        trending = LumiEmptyState(
          icon: Icons.show_chart,
          message: context.t('No trend data yet.'),
          compact: true,
        );
      } else {
        if (homeTrendsAllInsufficient(topics)) {
          trendingCaption = context.t(
            'Not enough yearly data yet to tell whether these topics are rising or falling.',
          );
        }
        trending = HomeTrendList(
          topics: topics,
          onOpen: () => unawaited(context.push('/trends')),
        );
      }
    } else if (overview.hasError) {
      trending = LumiErrorState(
        inline: true,
        retrying: overview.isLoading,
        onRetry: () => ref.invalidate(homeOverviewProvider),
      );
    } else {
      trending = const LumiSkeleton(rows: 3, height: 56);
    }

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(
          context.t('Explore'),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: const [NotificationBell(), SizedBox(width: 4)],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Semantics(
            button: true,
            label: context.t('Search papers'),
            excludeSemantics: true,
            onTap: () => unawaited(context.push('/search')),
            child: InkWell(
              onTap: () => unawaited(context.push('/search')),
              borderRadius: BorderRadius.circular(8),
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: lumi.surface,
                  border: Border.all(color: lumi.line),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.search, color: lumi.muted),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        context.t('Search papers, keywords…'),
                        style: theme.textTheme.bodyLarge
                            ?.copyWith(color: lumi.muted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          LumiSectionHeader(title: context.t('Analysis tools')),
          LumiRowGroup(
            children: [
              for (final entry in entries)
                LumiListRow(
                  key: ValueKey(entry.route),
                  icon: entry.icon,
                  iconInTile: true,
                  title: context.t(entry.title),
                  subtitle: context.t(entry.description),
                  onTap: () => unawaited(context.push(entry.route)),
                ),
            ],
          ),
          const SizedBox(height: 16),
          LumiSectionHeader(
            title: context.t('Trending topics'),
            caption: trendingCaption,
            actionLabel: context.t('View all'),
            onAction: () => unawaited(context.push('/trends')),
          ),
          trending,
        ],
      ),
    );
  }
}

class ExploreEntry {
  const ExploreEntry({
    required this.icon,
    required this.title,
    required this.description,
    required this.route,
  });
  final IconData icon;
  final String title;
  final String description;
  final String route;
}
