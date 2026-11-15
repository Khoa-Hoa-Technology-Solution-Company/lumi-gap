import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_avatar.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/notification_bell.dart';
import 'package:flutter_mobile/core/widgets/paper_card.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_attention_list.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_community_list.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_continue_research.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_recommended_list.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_section_frame.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_trend_list.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

String? _roleLabel(AcademicProfileType? type) => switch (type) {
  AcademicProfileType.student => tk('Student'),
  AcademicProfileType.researcher => tk('Researcher'),
  AcademicProfileType.lecturer => tk('Lecturer'),
  null => null,
};

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  /// Papers whose bookmark request is still in flight. A second tap on the
  /// same paper is ignored until the first one has finished; otherwise two
  /// "check then create" sequences could both create a bookmark.
  final Set<String> _bookmarkBusy = {};

  Future<void> _toggleBookmark(String paperId) async {
    if (!_bookmarkBusy.add(paperId)) return;
    try {
      final api = ref.read(bookmarksApiProvider);
      final status = await api.checkStatus('paper', paperId);
      if (status.bookmarked && status.bookmarkId != null) {
        await api.delete(status.bookmarkId!);
      } else {
        await api.create(targetKind: 'paper', targetId: paperId);
      }
    } on Object catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              context.t('Could not update the bookmark. Please try again.'),
            ),
          ),
        );
      }
    } finally {
      _bookmarkBusy.remove(paperId);
      // Re-read the real state whether the request worked or not, so the
      // icon never shows a guess.
      if (mounted) {
        ref
          ..invalidate(bookmarksProvider)
          ..invalidate(
            bookmarkStatusProvider(BookmarkTarget('paper', paperId)),
          );
      }
    }
  }

  /// Pull to refresh: reload both requests independently and keep the
  /// spinner until both are done; say so if either failed.
  Future<void> _refresh() async {
    ref
      ..invalidate(homeOverviewProvider)
      ..invalidate(homeResearchProvider);
    Future<bool> settle(Future<Object?> f) =>
        f.then((_) => true, onError: (Object _) => false);
    final results = await Future.wait([
      settle(ref.read(homeOverviewProvider.future)),
      settle(ref.read(homeResearchProvider.future)),
    ]);
    if (!mounted || !results.contains(false)) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(context.t('Some sections could not be refreshed.'))),
    );
  }

  void _open(String href) => unawaited(openWebHref(context, ref, href));

  /// One section = header + skeleton / error / empty / content. A failed or
  /// `unavailable` section only affects itself.
  Widget _section<A, T>({
    required String title,
    required AsyncValue<A> async,
    required HomeSection<T> Function(A value) pick,
    required VoidCallback retry,
    required bool Function(T data) isEmpty,
    required String emptyText,
    required IconData emptyIcon,
    required Widget Function(T data) builder,
    String? emptyActionLabel,
    VoidCallback? onEmptyAction,
    String? Function(T data)? caption,
    VoidCallback? onAll,
    int skeletonRows = 2,
    double skeletonHeight = 72,
  }) {
    final Widget body;
    String? captionText;
    if (async.hasValue) {
      final section = pick(async.requireValue);
      if (!section.isReady) {
        body = HomeSectionError(onRetry: retry, retrying: async.isLoading);
      } else if (isEmpty(section.data as T)) {
        body = HomeEmptyCard(
          text: emptyText,
          icon: emptyIcon,
          actionLabel: emptyActionLabel,
          onAction: onEmptyAction,
        );
      } else {
        captionText = caption?.call(section.data as T);
        body = builder(section.data as T);
      }
    } else if (async.hasError) {
      body = HomeSectionError(onRetry: retry, retrying: async.isLoading);
    } else {
      body = HomeSkeleton(rows: skeletonRows, height: skeletonHeight);
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          HomeSectionHeader(
            title: title,
            onAll: onAll,
            caption: captionText,
          ),
          body,
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = ref.watch(currentUserProvider);
    final overview = ref.watch(homeOverviewProvider);
    final research = ref.watch(homeResearchProvider);

    void retryOverview() => ref.invalidate(homeOverviewProvider);
    void retryResearch() => ref.invalidate(homeResearchProvider);

    final name = research.value?.userName ?? user?.fullName;
    final roleKey = _roleLabel(user?.academicProfileType);
    final role = roleKey == null ? null : context.t(roleKey);

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(context.t('Home')),
        actions: const [NotificationBell(), SizedBox(width: 4)],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Row(
                children: [
                  LumiAvatar(name: name),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name == null
                              ? context.t('Hello')
                              : context.t('Hello, {{name}}', {'name': name}),
                          style: theme.textTheme.titleLarge,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (role != null) ...[
                          const SizedBox(height: 4),
                          LumiChip(label: role),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            _section<HomeResearchOverview, List<HomeAttentionItem>>(
              title: context.t('To do'),
              async: research,
              pick: (o) => o.attentionSection,
              retry: retryResearch,
              isEmpty: (d) => d.isEmpty,
              emptyText: context.t('You have nothing to handle.'),
              emptyIcon: Icons.task_alt,
              skeletonRows: 3,
              builder: (items) => HomeAttentionList(
                items: items.take(5).toList(),
                onOpen: _open,
              ),
            ),
            _section<HomeResearchOverview, List<HomeResearchWorkspace>>(
              title: context.t('Continue your research'),
              async: research,
              pick: (o) => o.continueSection,
              retry: retryResearch,
              isEmpty: (d) => d.isEmpty,
              emptyText:
                  context.t('No projects yet. Create or join a project to get started.'),
              emptyIcon: Icons.folder_open,
              emptyActionLabel: context.t('Go to projects'),
              onEmptyAction: () => context.go('/projects'),
              skeletonHeight: 160,
              onAll: () => context.go('/projects'),
              builder: (items) =>
                  HomeContinueResearch(items: items, onOpen: _open),
            ),
            _section<HomeResearchOverview, List<HomeRecommendedPaper>>(
              title: context.t('Suggested papers'),
              async: research,
              pick: (o) => o.recommendations,
              retry: retryResearch,
              isEmpty: (d) => d.isEmpty,
              emptyText:
                  context.t('No suggestions yet. Add topics you are interested in to get suggestions.'),
              emptyIcon: Icons.topic_outlined,
              skeletonHeight: 112,
              builder: (items) => HomeRecommendedList(
                items: items,
                onOpen: (p) => unawaited(context.push('/paper/${p.id}')),
                onBookmark: (p) => unawaited(_toggleBookmark(p.id)),
              ),
            ),
            _section<HomeOverview, List<HomeTrendTopic>>(
              title: context.t('Trending topics'),
              async: overview,
              pick: (o) => HomeSection.ready(o.topics.take(4).toList()),
              retry: retryOverview,
              isEmpty: (d) => d.isEmpty,
              emptyText: context.t('No trend data yet.'),
              emptyIcon: Icons.show_chart,
              caption: (topics) => homeTrendsAllInsufficient(topics)
                  ? context.t('Not enough yearly data yet to tell whether these topics are rising or falling.')
                  : null,
              onAll: () => unawaited(context.push('/trends')),
              builder: (topics) => HomeTrendList(
                topics: topics,
                onOpen: () => unawaited(context.push('/trends')),
              ),
            ),
            _section<HomeOverview, List<HomeRecentPaper>>(
              title: context.t('New papers'),
              async: overview,
              pick: (o) => HomeSection.ready(o.recentPapers.take(5).toList()),
              retry: retryOverview,
              isEmpty: (d) => d.isEmpty,
              emptyText: context.t('No new papers yet.'),
              emptyIcon: Icons.article_outlined,
              skeletonHeight: 112,
              builder: (papers) => Column(
                children: [
                  for (final p in papers)
                    PaperCard(
                      id: p.id,
                      title: p.title,
                      authors:
                          p.authors.isEmpty ? null : formatAuthors(p.authors),
                      venueAndYear: [
                        if (p.venue != null && p.venue!.trim().isNotEmpty)
                          p.venue!,
                        if (p.year != null) '${p.year}',
                        context.t('{{citationCount}} citations', {'citationCount': p.citationCount}),
                      ].join(' · '),
                      onTap: () => unawaited(context.push('/paper/${p.id}')),
                      onBookmarkTap: () => unawaited(_toggleBookmark(p.id)),
                    ),
                ],
              ),
            ),
            _section<HomeResearchOverview, List<HomeCommunityTopic>>(
              title: context.t('Community activity'),
              async: research,
              pick: (o) => o.communityActivity,
              retry: retryResearch,
              isEmpty: (d) => d.isEmpty,
              emptyText: context.t('No community activity yet.'),
              emptyIcon: Icons.forum_outlined,
              builder: (items) =>
                  HomeCommunityList(items: items, onOpen: _open),
            ),
          ],
        ),
      ),
    );
  }
}
