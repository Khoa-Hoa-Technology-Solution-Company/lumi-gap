import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/notification_bell.dart';
import 'package:go_router/go_router.dart';

/// Explore tab: search entry on top, then the analysis tools.
class ExploreScreen extends StatelessWidget {
  const ExploreScreen({super.key});

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
      icon: Icons.insights_outlined,
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
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(context.t('Explore'), maxLines: 1, overflow: TextOverflow.ellipsis),
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
          const SizedBox(height: 24),
          Text(context.t('Analysis tools'), style: theme.textTheme.titleLarge),
          const SizedBox(height: 12),
          for (final entry in entries) ...[
            _ExploreTile(entry: entry),
            const SizedBox(height: 12),
          ],
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

class _ExploreTile extends StatelessWidget {
  const _ExploreTile({required this.entry});
  final ExploreEntry entry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        minTileHeight: 64,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: Icon(entry.icon, size: 24, color: lumi.foregroundSecondary),
        title: Text(context.t(entry.title), style: theme.textTheme.titleMedium),
        subtitle: Text(
          context.t(entry.description),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: lumi.foregroundSecondary),
        ),
        trailing: Icon(Icons.chevron_right, color: lumi.muted),
        onTap: () => unawaited(context.push(entry.route)),
      ),
    );
  }
}
