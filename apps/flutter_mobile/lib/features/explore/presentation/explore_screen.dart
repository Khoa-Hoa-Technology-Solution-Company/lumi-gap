import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/notification_bell.dart';
import 'package:flutter_mobile/core/widgets/paper_row.dart';
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
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(
          context.t('Explore'),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: const [NotificationBell(), SizedBox(width: 4)],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(homeOverviewProvider),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            LumiSearchButton(
              hint: context.t('Search papers, keywords…'),
              onPressed: () => go('/search'),
            ),
            const SizedBox(height: 24),
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
    final keywords = data.risingKeywords.take(keywordLimit).toList();
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
        LumiSectionHeader(title: context.t('Emerging Keywords')),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final k in keywords)
              ActionChip(
                // z of the log odds test: how strong the evidence of a rise is.
                label: Text(
                  // i18n-ignore: keyword and its test statistic
                  '${k.keyword}  z ${k.z.toStringAsFixed(1)}',
                ),
                onPressed: () =>
                    go('/search?q=${Uri.encodeComponent(k.keyword)}'),
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
              ),
          ],
        ),
      ],
    ];
  }
}
