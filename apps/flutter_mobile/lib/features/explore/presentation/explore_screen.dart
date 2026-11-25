import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_hero_app_bar.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/paper_row.dart';
import 'package:flutter_mobile/features/bookmarks/presentation/bookmark_toggle.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Explore: find and browse papers. The search box first, then the
/// keywords that are moving and the newest papers. Home holds what is
/// yours (to-dos, projects, suggestions) and the trending topics; the
/// analysis tools have their one entry in Home's shortcut row.
class ExploreScreen extends ConsumerWidget {
  const ExploreScreen({super.key});

  /// How many keywords and new papers the tab shows.
  static const int keywordLimit = 8;
  static const int newPapersLimit = 10;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(homeOverviewProvider);
    void go(String path) => unawaited(context.push(path));

    final List<Widget> sections;
    if (overview.hasValue) {
      sections = _sections(context, overview.requireValue, go);
    } else if (overview.hasError) {
      sections = [
        LumiErrorState(
          inline: true,
          retrying: overview.isLoading,
          onRetry: () => ref.invalidate(homeOverviewProvider),
        ),
      ];
    } else {
      sections = const [LumiSkeleton(rows: 4, height: 64)];
    }

    return Scaffold(
      // Search lives in the blue band, the first thing under the thumb.
      appBar: LumiHeroAppBar(
        title: context.t('Explore'),
        bottomHeight: 52,
        bottom: LumiSearchButton(
          hint: context.t('Search papers, keywords…'),
          onPressed: () => go('/search'),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(homeOverviewProvider),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          children: [
            ...sections,
          ],
        ),
      ),
    );
  }

  List<Widget> _sections(
    BuildContext context,
    HomeOverview data,
    void Function(String) go,
  ) {
    // Only keywords whose rise passed the test are "emerging" here; the
    // full list with its evidence is on Trends.
    final keywords = data.risingKeywords
        .where((k) => k.significant)
        .take(keywordLimit)
        .toList();
    final papers = data.recentPapers.take(newPapersLimit).toList();
    if (keywords.isEmpty && papers.isEmpty) {
      return [
        LumiEmptyState(
          icon: Icons.travel_explore,
          message: context.t(
            'Nothing to explore yet. Search for a topic to start.',
          ),
          compact: true,
        ),
      ];
    }
    return [
      if (keywords.isNotEmpty) ...[
        LumiSectionHeader(title: context.t('Emerging keywords')),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            // Each keyword in its own soft tint, as Home's shortcuts.
            for (final (i, k) in keywords.indexed)
              Builder(
                builder: (context) {
                  final tint =
                      context.tints.cycle[i % context.tints.cycle.length];
                  return ActionChip(
                    label: Text(k.keyword),
                    backgroundColor: tint.background,
                    side: BorderSide.none,
                    shape: const StadiumBorder(),
                    labelStyle: Theme.of(context)
                        .textTheme
                        .labelLarge
                        ?.copyWith(color: tint.foreground),
                    onPressed: () =>
                        go('/search?q=${Uri.encodeComponent(k.keyword)}'),
                  );
                },
              ),
          ],
        ),
        const SizedBox(height: 28),
      ],
      if (papers.isNotEmpty) ...[
        LumiSectionHeader(title: context.t('New papers')),
        LumiRowGroup(
          children: [
            for (final p in papers)
              PaperRow(
                id: p.id,
                title: p.title,
                meta: [
                  if (p.authors.isNotEmpty) formatAuthors(p.authors),
                  if (p.venue != null && p.venue!.trim().isNotEmpty) p.venue!,
                  if (p.year != null) '${p.year}',
                ].join(' · '),
                onTap: () => go('/paper/${p.id}'),
                // Saved from the list, as on Home's suggestions.
                onBookmarkTap: () =>
                    unawaited(togglePaperBookmark(context, p.id)),
              ),
          ],
        ),
      ],
    ];
  }
}
