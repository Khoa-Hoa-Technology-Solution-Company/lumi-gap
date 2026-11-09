import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/notification_bell.dart';
import 'package:go_router/go_router.dart';

/// Explore tab: search entry on top, then the analysis tools.
class ExploreScreen extends StatelessWidget {
  const ExploreScreen({super.key});

  static const entries = <ExploreEntry>[
    ExploreEntry(
      icon: Icons.trending_up,
      title: 'Xu hướng',
      description: 'Chủ đề đang tăng hoặc giảm theo năm',
      route: '/trends',
    ),
    ExploreEntry(
      icon: Icons.description_outlined,
      title: 'Báo cáo',
      description: 'Báo cáo phân tích có dẫn chứng',
      route: '/reports',
    ),
    ExploreEntry(
      icon: Icons.insights_outlined,
      title: 'Khoảng trống nghiên cứu',
      description: 'Hướng nghiên cứu còn bỏ ngỏ theo chủ đề',
      route: '/gaps',
    ),
    ExploreEntry(
      icon: Icons.emoji_events_outlined,
      title: 'Bảng xếp hạng',
      description: 'Thứ hạng và điểm đóng góp',
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
        title: const Text('Khám phá', maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: const [NotificationBell(), SizedBox(width: 4)],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Semantics(
            button: true,
            label: 'Tìm kiếm bài báo',
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
                        'Tìm bài báo, từ khóa…',
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
          Text('Công cụ phân tích', style: theme.textTheme.titleLarge),
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
        title: Text(entry.title, style: theme.textTheme.titleMedium),
        subtitle: Text(
          entry.description,
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
